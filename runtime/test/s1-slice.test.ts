// S1: the thinnest end-to-end slice of the programme (plan §6). One low-risk request travels
// intake → triage → plan → auto-accept → dispatch → acknowledged work in a task worktree →
// runtime check → independent verification → delivery approval in Needs You → ship, with the
// owner touching only the request, the plan stage move and the final ship. Everything runs
// through the real runtime with the fake ACP adapter.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-s1-'));
const workRoot = path.join(dir, 'work');
const repoDir = path.join(workRoot, 'repo');
fs.mkdirSync(workRoot, { recursive: true });
const fixture = new URL('./fixtures/fake-acp-agent.mjs', import.meta.url).pathname;
let rt: RunningRuntime;
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
async function waitFor<T>(fn: () => Promise<T | null | false | undefined> | T | null | false | undefined, label: string, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await sleep(150);
  }
  throw new Error(`timed out waiting for: ${label}`);
}

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
  const attached = await call('POST', '/v1/projects/attach', { path: repoDir, name: 'S1 Project' });
  roomId = (await call('POST', '/v1/rooms', { name: 's1-room', projectId: attached.json.project.id })).json.id;
  rt.repo.updateSettings({ 'workflow.dispatcher': true, 'workflow.autoAcceptLowRisk': true } as never);
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('S1: one low-risk request goes from intake to shipped, verified, accounted and on the timeline', async () => {
  // 1–2. Intake and triage.
  const intake = await call('POST', '/v1/intake', { text: 'Add a hello file to the repo', source: 'home', roomId, requestedBy: 'winston' });
  assert.equal(intake.status, 201, JSON.stringify(intake.json));
  const jobId = intake.json.job.id as string;
  assert.ok(intake.json.job.workflow, 'triaged');

  // 3. Plan: one task, low risk, verification required. Auto-accept moves it to build.
  assert.equal((await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'plan', actorId: 'winston' })).status, 200);
  const plan = await call('POST', `/v1/jobs/${jobId}/plan/submit`, {
    actorId: 'winston',
    summary: 'Write hello.txt',
    risk: 'low',
    criteria: ['hello.txt exists in the repo'],
    tasks: [{ key: 'hello', title: 'myaos-task-file: hello.txt hi', assigneeId: 'atlas', checkCommand: 'test -f hello.txt', verificationRequired: true, criteriaRefs: [0] }],
  });
  assert.ok(plan.status < 300, JSON.stringify(plan.json));
  await waitFor(async () => (await call('GET', `/v1/jobs/${jobId}`)).json.stage !== 'plan', 'auto-accept to build');
  assert.ok(rt.repo.listEvents({ type: 'plan.auto_accepted' }).some((e) => e.subjectId === jobId || (e.payload as any)?.jobId === jobId), 'plan.auto_accepted recorded');

  // 4–9. Dispatch, work in the task worktree, runtime check, independent verification, delivery approval.
  const approved = await waitFor(async () => {
    const j = (await call('GET', `/v1/jobs/${jobId}`)).json;
    return j.stage === 'approve' ? j : null;
  }, 'job reaches approve');
  const task = approved.tasks[0];
  assert.equal(task.status, 'verified', 'verified by the independent verifier');
  assert.ok(approved.evidence.some((e: any) => e.class === 'VERIFIED' && e.taskId === task.id), 'VERIFIED evidence for the task');
  const sessions = rt.repo.listSessions().filter((s) => s.taskId === task.id);
  assert.equal(sessions.length, 1, 'dispatched exactly once');
  assert.equal(sessions[0]!.agentId, 'atlas');
  assert.ok(rt.repo.listEvents({ type: 'task.assigned' }).length > 0);

  const needs = (await call('GET', '/v1/needs-you')).json as any[];
  assert.ok(needs.some((n) => n.kind === 'delivery_approval' && n.jobId === jobId), 'delivery approval waits in Needs You');

  // 10. Owner ships.
  const shipped = await call('POST', `/v1/jobs/${jobId}/ship`, { strategy: 'merge', actorId: 'winston' });
  assert.equal(shipped.status, 200, JSON.stringify(shipped.json));
  assert.ok(fs.existsSync(path.join(repoDir, 'hello.txt')), 'the work reached the base branch');

  // Accounting: agent time recorded for the turn, never billable; no human time invented.
  const intervals = (await call('GET', `/v1/time/intervals?jobId=${jobId}`)).json as any[];
  assert.ok(intervals.some((i) => i.actor_kind === 'agent' && i.identity_id === 'atlas' && i.billable_status === 'non_billable'), 'agent turn recorded');
  assert.ok(!intervals.some((i) => i.actor_kind === 'human'), 'no human time inferred');

  // 11. Timeline shows the path.
  const kinds = ((await call('GET', `/v1/jobs/${jobId}/timeline`)).json as any[]).map((i) => i.kind);
  for (const k of ['intake', 'stage', 'session.started', 'evidence', 'time']) assert.ok(kinds.includes(k), `timeline has ${k}`);
});
