import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-lifecycle-api-'));
const workRoot = path.join(dir, 'work');
fs.mkdirSync(workRoot, { recursive: true });
const fixture = new URL('./fixtures/fake-acp-agent.mjs', import.meta.url).pathname;
let rt: RunningRuntime;
let jobId = '';

const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const waitFor = async <T>(fn: () => Promise<T | null>, timeoutMs = 20_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('timed out waiting for condition');
};

const newTask = async (input: Record<string, unknown>) => {
  const res = await call('POST', `/v1/jobs/${jobId}/tasks`, { assigneeId: 'atlas', ...input });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json as any;
};

const taskEvents = async (taskId: string) => {
  const res = await call('GET', `/v1/events/recent?subjectId=${taskId}&limit=200`);
  return (res.json as any[]).map((e) => e.type);
};

before(async () => {
  rt = await startRuntime({
    dbPath: path.join(dir, 'runtime.db'),
    workspaceRoots: [workRoot],
    worktreeRoot: path.join(dir, 'worktrees'),
    artifactsDir: path.join(dir, 'artifacts'),
  });
  await call('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston' },
    teams: [{ id: 'creativesites', name: 'CreativeSites AI Team' }],
    identities: [
      { id: 'atlas', name: 'Atlas', teamId: 'creativesites' },
      { id: 'kael', name: 'Kael', teamId: 'creativesites' },
    ],
  });
  await call('POST', '/v1/adapters/fake', { command: process.execPath, args: [fixture], enabled: true });
  const repoDir = path.join(workRoot, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# repo\n');
  execFileSync('git', ['init', '--quiet', '-b', 'main', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '--quiet', '-m', 'init']);
  const attached = await call('POST', '/v1/projects/attach', { path: repoDir, name: 'Lifecycle Project' });
  const room = await call('POST', '/v1/rooms', { name: 'lifecycle-room', projectId: attached.json.project.id });
  const job = await call('POST', '/v1/jobs', { roomId: room.json.id, title: 'Lifecycle API', brief: 'b', createdBy: 'winston', criteria: ['It works'] });
  jobId = job.json.id;
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'plan', actorId: 'winston' });
  await call('POST', `/v1/jobs/${jobId}/plan`, { plan: { summary: 'p' }, actorId: 'winston' });
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'build', actorId: 'winston', force: true }); // no tasks yet: owner override
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('PATCH /v1/tasks/:id rejects status with 409 and points at the transition endpoint', async () => {
  const task = await newTask({ title: 'patch me' });
  const res = await call('PATCH', `/v1/tasks/${task.id}`, { status: 'done' });
  assert.equal(res.status, 409);
  assert.match(res.json.error, new RegExp(`/v1/tasks/${task.id}/transition`));
  assert.equal((await call('PATCH', `/v1/tasks/${task.id}`, { title: 'renamed', priority: 4 })).json.priority, 4, 'other fields still patch');
  assert.equal((await call('GET', `/v1/jobs/${jobId}/tasks`)).json.find((t: any) => t.id === task.id).status, 'pending');
});

test('POST /v1/tasks/:id/transition enforces the table, the self-verify rule and returns 400 for bad input', async () => {
  const task = await newTask({ title: 'transition me' });
  const bad = await call('POST', `/v1/tasks/${task.id}/transition`, { to: 'done', actorId: 'winston' });
  assert.equal(bad.status, 409);
  assert.match(bad.json.error, /pending to done/);
  assert.equal((await call('POST', `/v1/tasks/${task.id}/transition`, { to: 'nonsense', actorId: 'winston' })).status, 400);
  assert.equal((await call('POST', `/v1/tasks/${task.id}/transition`, { to: 'assigned' })).status, 400);
  for (const to of ['assigned', 'acknowledged', 'running', 'needs_review']) {
    const r = await call('POST', `/v1/tasks/${task.id}/transition`, { to, actorId: 'atlas', actorKind: 'agent' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  const self = await call('POST', `/v1/tasks/${task.id}/transition`, { to: 'verified', actorId: 'atlas' });
  assert.equal(self.status, 409);
  const other = await call('POST', `/v1/tasks/${task.id}/transition`, { to: 'verified', actorId: 'kael' });
  assert.equal(other.status, 200);
  assert.equal(other.json.status, 'verified');
  assert.deepEqual((await taskEvents(task.id)).filter((t) => t.startsWith('task.') && t !== 'task.created'), [
    'task.assigned', 'task.acknowledged', 'task.running', 'task.needs_review', 'task.verified',
  ]);
});

test('a session on a ready task goes assigned, acknowledged, running, then done when the check passes', async () => {
  const task = await newTask({ title: 'plain', checkCommand: 'test -f README.md' });
  const started = await call('POST', `/v1/jobs/${jobId}/sessions`, { agentId: 'atlas', adapterId: 'fake', prompt: 'echo ok', taskId: task.id });
  assert.equal(started.status, 202, JSON.stringify(started.json));
  await waitFor(async () => ((await call('GET', `/v1/jobs/${jobId}/tasks`)).json.find((t: any) => t.id === task.id).status === 'done' ? true : null));
  const types = (await taskEvents(task.id)).filter((t) => t.startsWith('task.') && t !== 'task.created');
  assert.deepEqual(types, ['task.assigned', 'task.acknowledged', 'task.running', 'task.done']);
});

test('a task that requires verification waits in needs_review; a failing check fails the task', async () => {
  const review = await newTask({ title: 'needs review', checkCommand: 'test -f README.md', verificationRequired: true });
  await call('POST', `/v1/jobs/${jobId}/sessions`, { agentId: 'atlas', adapterId: 'fake', prompt: 'echo ok', taskId: review.id });
  await waitFor(async () => ((await call('GET', `/v1/jobs/${jobId}/tasks`)).json.find((t: any) => t.id === review.id).status === 'needs_review' ? true : null));

  const bad = await newTask({ title: 'fails', checkCommand: 'test -f missing-file.txt' });
  await call('POST', `/v1/jobs/${jobId}/sessions`, { agentId: 'atlas', adapterId: 'fake', prompt: 'echo ok', taskId: bad.id });
  await waitFor(async () => ((await call('GET', `/v1/jobs/${jobId}/tasks`)).json.find((t: any) => t.id === bad.id).status === 'failed' ? true : null));
});

test('a task is never dispatched while a dependency is not done; /v1/tasks/ready lists the dispatchable ones', async () => {
  const first = await newTask({ title: 'first' });
  const second = await newTask({ title: 'second', dependsOn: [first.id], priority: 9 });
  const blocked = await call('POST', `/v1/jobs/${jobId}/sessions`, { agentId: 'atlas', adapterId: 'fake', prompt: 'echo ok', taskId: second.id });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.json));
  assert.match(blocked.json.error, /depends on/);

  const ready = (await call('GET', `/v1/tasks/ready?jobId=${jobId}`)).json as any[];
  assert.ok(ready.some((t) => t.id === first.id));
  assert.ok(!ready.some((t) => t.id === second.id));

  for (const to of ['assigned', 'acknowledged', 'running', 'done']) {
    await call('POST', `/v1/tasks/${first.id}/transition`, { to, actorId: to === 'done' ? 'winston' : 'atlas' });
  }
  const after = (await call('GET', `/v1/tasks/ready?jobId=${jobId}`)).json as any[];
  assert.equal(after[0].id, second.id, 'higher priority comes first once its dependency is done');
  const cyc = await call('PATCH', `/v1/tasks/${first.id}`, { dependsOn: [second.id] });
  assert.equal(cyc.status, 409);
  assert.match(cyc.json.error, /cycle/);
});
