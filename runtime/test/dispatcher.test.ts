import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { taskBranchName } from '../src/checks.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-dispatch-'));
const workRoot = path.join(dir, 'work');
const repoDir = path.join(workRoot, 'repo');
fs.mkdirSync(workRoot, { recursive: true });
const fixture = new URL('./fixtures/fake-acp-agent.mjs', import.meta.url).pathname;
let rt: RunningRuntime;
let projectId = '';
let roomId = '';

const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async <T>(fn: () => T | null | false | undefined, timeoutMs = 45_000, everyMs = 100): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = fn();
    if (value) return value;
    await sleep(everyMs);
  }
  throw new Error('timed out waiting for condition');
};
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();

/** A job in the build stage with the given tasks. Tasks with `file` write it through the fake agent. */
async function buildJob(
  title: string,
  tasks: { key: string; file?: [string, string]; slowMs?: number; dependsOn?: string[]; assigneeId?: string }[]
) {
  const job = await call('POST', '/v1/jobs', { roomId, title, brief: title, createdBy: 'winston', criteria: ['It works'] });
  const jobId = job.json.id as string;
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'plan', actorId: 'winston' });
  await call('POST', `/v1/jobs/${jobId}/plan`, { plan: { summary: title }, actorId: 'winston' });
  const ids: Record<string, string> = {};
  for (const t of tasks) {
    const lines = [t.key, t.slowMs ? `myaos-slow-ms: ${t.slowMs}` : '', t.file ? `myaos-task-file: ${t.file[0]} ${t.file[1]}` : ''];
    const created = rt.repo.createTask(jobId, {
      title: lines.filter(Boolean).join(' '),
      assigneeId: t.assigneeId,
      dependsOn: (t.dependsOn ?? []).map((k) => ids[k]!),
    });
    ids[t.key] = created.id;
  }
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'build', actorId: 'winston' });
  return { jobId, number: job.json.number as number, ids };
}

const sessionsOf = (taskId: string) => rt.repo.listSessions().filter((s) => s.taskId === taskId);

before(async () => {
  rt = await startRuntime({
    dbPath: path.join(dir, 'runtime.db'),
    workspaceRoots: [workRoot],
    worktreeRoot: path.join(dir, 'worktrees'),
    artifactsDir: path.join(dir, 'artifacts'),
    teamRepo: null,
  });
  await call('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston' },
    teams: [{ id: 'creativesites', name: 'CreativeSites AI Team' }],
    identities: [
      { id: 'atlas', name: 'Atlas', teamId: 'creativesites' },
      { id: 'kael', name: 'Kael', teamId: 'creativesites' },
    ],
  });
  for (const id of ['atlas', 'kael']) rt.repo.updateIdentity(id, { adapterId: 'fake' });
  await call('POST', '/v1/adapters/fake', { command: process.execPath, args: [fixture], enabled: true });

  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# repo\n');
  execFileSync('git', ['init', '--quiet', '-b', 'main', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '--quiet', '-m', 'init']);
  const attached = await call('POST', '/v1/projects/attach', { path: repoDir, name: 'Dispatch Project' });
  projectId = attached.json.project.id;
  const room = await call('POST', '/v1/rooms', { name: 'dispatch-room', projectId });
  roomId = room.json.id;
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('flag off (the default): a ready task is not dispatched', async () => {
  const { ids } = await buildJob('flag off', [{ key: 'only', file: ['off.txt', 'off'] }]);
  await sleep(5_000); // more than two orchestrator ticks
  assert.equal(rt.repo.getTask(ids.only!).status, 'pending');
  assert.equal(sessionsOf(ids.only!).length, 0);
  assert.equal(rt.repo.listEvents({ type: 'dispatch.started' }).length, 0);
  // Switch it on for the rest of the file; the waiting task is picked up and finishes.
  rt.repo.updateSettings({ 'workflow.dispatcher': true });
  await waitFor(() => rt.repo.getTask(ids.only!).status === 'done');
});

test('flag on: a ready task gets a session; its dependent waits until the dependency is done and sees its work', async () => {
  const { jobId, number, ids } = await buildJob('dependency chain', [
    { key: 'a', file: ['a.txt', 'from-a'], slowMs: 1500 },
    { key: 'b', file: ['b.txt', 'from-b'], dependsOn: ['a'] },
  ]);
  await waitFor(() => sessionsOf(ids.a!).length === 1);
  // While a is in flight, b has no session and is still pending.
  assert.equal(rt.repo.getTask(ids.b!).status, 'pending');
  assert.equal(sessionsOf(ids.b!).length, 0);
  assert.notEqual(rt.repo.getTask(ids.a!).status, 'done');

  await waitFor(() => rt.repo.getTask(ids.b!).status === 'done' && rt.repo.findTaskWorktree(ids.b!)?.state === 'integrated');
  const a = rt.repo.getTask(ids.a!);
  const bSession = sessionsOf(ids.b!)[0]!;
  assert.equal(a.status, 'done');
  assert.ok(Date.parse(bSession.startedAt) >= Date.parse(a.endedAt!), 'b started after a finished');
  assert.ok(fs.existsSync(path.join(bSession.worktree!, 'a.txt')), "b's worktree branched from the job branch after a was merged");

  // The assignment carries the selection reason, and a dispatch.started event names the session.
  const assigned = rt.repo.listEvents({ subjectId: ids.a!, type: 'task.assigned' });
  assert.equal(assigned.length, 1);
  assert.match(String((assigned[0]!.payload as any).reason), /^dispatcher: no skills required; 0 running tasks/);
  assert.equal(assigned[0]!.actorId, 'runtime:dispatcher');
  const started = rt.repo.listEvents({ subjectId: ids.a!, type: 'dispatch.started' });
  assert.equal(started.length, 1);
  assert.equal((started[0]!.payload as any).sessionId, sessionsOf(ids.a!)[0]!.id);

  // Integration: the job branch has both files and one merge commit per task.
  const jobWt = rt.repo.findWorktree(jobId)!.path;
  assert.equal(git(jobWt, 'rev-parse', '--abbrev-ref', 'HEAD'), `myaos/job-${number}`);
  assert.equal(git(jobWt, 'show', `myaos/job-${number}:a.txt`), 'from-a');
  assert.equal(git(jobWt, 'show', `myaos/job-${number}:b.txt`), 'from-b');
  assert.equal(git(jobWt, 'log', '--merges', '--oneline', `myaos/job-${number}`).split('\n').length, 2);
  assert.equal(rt.repo.findTaskWorktree(ids.a!)!.state, 'integrated');
});

test('10 ready tasks with 2 slots: never more than 2 running, never two live sessions for one task; parallel tasks get separate worktrees and branches', async () => {
  const keys = Array.from({ length: 10 }, (_, i) => `t${i}`);
  const { jobId, number, ids } = await buildJob(
    'ten parallel',
    keys.map((k) => ({ key: k, file: [`${k}.txt`, k], slowMs: 400 }))
  );
  let max = 0;
  let duplicateLive = false;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const live = rt.repo.liveSessionRows();
    max = Math.max(max, live.length);
    const taskIds = live.map((l) => l.taskId);
    if (new Set(taskIds).size !== taskIds.length) duplicateLive = true;
    if (keys.every((k) => rt.repo.getTask(ids[k]!).status === 'done' && rt.repo.findTaskWorktree(ids[k]!)?.state === 'integrated')) break;
    await sleep(50);
  }
  assert.ok(keys.every((k) => rt.repo.getTask(ids[k]!).status === 'done' && rt.repo.findTaskWorktree(ids[k]!)?.state === 'integrated'), 'all ten tasks finished and merged');
  assert.ok(max <= 2, `at most 2 sessions at once, saw ${max}`);
  assert.equal(max, 2, 'both slots were used');
  assert.equal(duplicateLive, false);
  for (const k of keys) assert.equal(sessionsOf(ids[k]!).length, 1, `${k} was dispatched exactly once`);

  const paths = new Set<string>();
  for (const k of keys) {
    const tw = rt.repo.findTaskWorktree(ids[k]!)!;
    assert.equal(tw.branch, taskBranchName(number, ids[k]!));
    paths.add(tw.path);
    assert.equal(sessionsOf(ids[k]!)[0]!.worktree, tw.path, 'the session ran in the task worktree');
  }
  assert.equal(paths.size, 10, 'each task has its own worktree');
  const branches = git(repoDir, 'branch', '--list', `myaos/job-${number}-task-*`).split('\n').filter(Boolean);
  assert.equal(branches.length, 10);

  // All ten branches were merged into the job branch with merge commits.
  const jobWt = rt.repo.findWorktree(jobId)!.path;
  assert.equal(git(jobWt, 'log', '--merges', '--oneline', `myaos/job-${number}`).split('\n').length, 10);
  for (const k of keys) assert.equal(git(jobWt, 'show', `myaos/job-${number}:${k}.txt`), k);
});

test('an integration conflict aborts the merge, ends needs_human with the paths and leaves both branches intact', async () => {
  const { jobId, number, ids } = await buildJob('conflict', [
    { key: 'x', file: ['shared.txt', 'version-x'], slowMs: 300 },
    { key: 'y', file: ['shared.txt', 'version-y'], slowMs: 300 },
  ]);
  const loser = await waitFor(() => {
    for (const k of ['x', 'y']) if (rt.repo.getTask(ids[k]!).status === 'needs_human') return k;
    return null;
  });
  const winner = loser === 'x' ? 'y' : 'x';
  const task = rt.repo.getTask(ids[loser]!);
  assert.equal(task.status, 'needs_human');
  const event = rt.repo.listEvents({ subjectId: task.id, type: 'task.needs_human' }).at(-1)!;
  assert.match(String((event.payload as any).reason), /merge conflict .*shared\.txt/);
  assert.equal(rt.repo.getTask(ids[winner]!).status, 'done');

  const jobWt = rt.repo.findWorktree(jobId)!.path;
  const jobBranch = `myaos/job-${number}`;
  // No merge left half-done, and the job branch holds only the winner's change.
  assert.equal(git(jobWt, 'status', '--porcelain'), '');
  assert.ok(!fs.existsSync(path.join(git(jobWt, 'rev-parse', '--absolute-git-dir'), 'MERGE_HEAD')));
  assert.equal(git(jobWt, 'show', `${jobBranch}:shared.txt`), `version-${winner}`);
  // Both task branches still exist, and the loser's commit is on its branch.
  const loserBranch = taskBranchName(number, ids[loser]!);
  assert.equal(git(repoDir, 'show', `${loserBranch}:shared.txt`), `version-${loser}`);
  assert.equal(git(repoDir, 'show', `${taskBranchName(number, ids[winner]!)}:shared.txt`), `version-${winner}`);
  assert.equal(rt.repo.findTaskWorktree(ids[loser]!)!.state, 'active', 'the loser worktree is kept for the human');
});
