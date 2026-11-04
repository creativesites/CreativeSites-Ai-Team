// Vision §18.2/§18.3: recovery. A runtime restart in the middle of an agent's work must leave the
// store honest: the session is failed with a reason, the cut-off turn is counted once (marked
// recovery), a second restart adds nothing, the task is not left looking active, and the job
// still has its history.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const fixture = new URL('./fixtures/fake-acp-agent.mjs', import.meta.url).pathname;

async function api(rt: RunningRuntime, method: string, route: string, body?: unknown) {
  const res = await fetch(`${rt.url}${route}`, { method, headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
async function waitFor<T>(fn: () => Promise<T | null | false> | T | null | false, label: string, ms = 30_000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timed out: ${label}`);
}

test('runtime restart mid-task: session failed with a reason, cut-off turn counted once, nothing duplicated', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-recovery-'));
  const workRoot = path.join(dir, 'work');
  const repoDir = path.join(workRoot, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# r\n');
  execFileSync('git', ['init', '--quiet', '-b', 'main', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '--quiet', '-m', 'init']);
  const opts = { dbPath: path.join(dir, 'runtime.db'), workspaceRoots: [workRoot], worktreeRoot: path.join(dir, 'wt'), artifactsDir: path.join(dir, 'art'), teamRepo: null };

  let rt = await startRuntime(opts);
  let jobId = '';
  let sessionId = '';
  try {
    await api(rt, 'POST', '/v1/import/identities', { owner: { id: 'winston', name: 'Winston' }, identities: [{ id: 'atlas', name: 'Atlas' }] });
    rt.repo.updateIdentity('atlas', { adapterId: 'fake' });
    await api(rt, 'POST', '/v1/adapters/fake', { command: process.execPath, args: [fixture], enabled: true });
    const proj = (await api(rt, 'POST', '/v1/projects/attach', { path: repoDir, name: 'Recovery' })).json.project;
    const room = (await api(rt, 'POST', '/v1/rooms', { name: 'r', projectId: proj.id })).json;
    const job = (await api(rt, 'POST', '/v1/jobs', { roomId: room.id, title: 'Long task', createdBy: 'winston', criteria: ['x'] })).json;
    jobId = job.id;
    const task = rt.repo.createTask(jobId, { title: 'Slow work', assigneeId: 'atlas' });
    const s = await api(rt, 'POST', `/v1/jobs/${jobId}/sessions`, { agentId: 'atlas', adapterId: 'fake', taskId: task.id, prompt: 'sleep 60' });
    assert.equal(s.status, 202, JSON.stringify(s.json));
    sessionId = s.json.id;
    // The agent is really mid-turn: process up, session running, prompt sent, no turn_end yet.
    await waitFor(() => rt.repo.getSession(sessionId).state === 'running' && rt.repo.listTranscript(sessionId, 0, 100).some((e) => e.kind === 'prompt'), 'agent running mid-turn');
    assert.ok(!rt.repo.listTranscript(sessionId, 0, 100).some((e) => e.kind === 'turn_end'));
    assert.equal(rt.repo.getTask(task.id).status, 'running');
  } finally {
    await rt.close(); // the "crash": the process goes away mid-turn
  }

  // Restart on the same store.
  rt = await startRuntime(opts);
  try {
    const session = rt.repo.getSession(sessionId);
    assert.equal(session.state, 'failed', 'a session whose process is gone is failed, not left running');
    assert.match(String(session.error), /restarted|not running|closed|cancel/i, 'with a reason');

    const turns = () => (rt.repo.sqlite().prepare("SELECT * FROM activity_intervals WHERE session_id = ? AND actor_kind = 'agent'").all(sessionId) as any[]);
    const first = turns();
    assert.equal(first.length, 1, 'the cut-off turn is counted exactly once');
    assert.equal(first[0].closed_by, 'recovery');
    assert.equal(first[0].billable_status, 'non_billable');
    assert.ok(Number(first[0].duration_ms) >= 0);

    // The job keeps its history.
    const timeline = (await api(rt, 'GET', `/v1/jobs/${jobId}/timeline`)).json as any[];
    assert.ok(timeline.some((i) => i.kind === 'session.started'));
    assert.ok(timeline.some((i) => i.kind === 'time'));
  } finally {
    await rt.close();
  }

  // A second restart adds nothing.
  rt = await startRuntime(opts);
  try {
    const n = (rt.repo.sqlite().prepare("SELECT COUNT(*) AS n FROM activity_intervals WHERE session_id = ?").get(sessionId) as { n: number }).n;
    assert.equal(n, 1, 'restarting again does not double-count');
  } finally {
    await rt.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('shutting down right after a session starts never leaves an orphaned agent process', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-orphan-'));
  const uniqueAgent = path.join(dir, `unique-agent-${process.pid}-${Date.now()}.mjs`);
  fs.copyFileSync(fixture, uniqueAgent);
  const workRoot = path.join(dir, 'work');
  const repoDir = path.join(workRoot, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# r\n');
  execFileSync('git', ['init', '--quiet', '-b', 'main', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '--quiet', '-m', 'init']);
  const rt = await startRuntime({ dbPath: path.join(dir, 'runtime.db'), workspaceRoots: [workRoot], worktreeRoot: path.join(dir, 'wt'), artifactsDir: path.join(dir, 'art'), teamRepo: null });
  try {
    await api(rt, 'POST', '/v1/import/identities', { owner: { id: 'winston', name: 'Winston' }, identities: [{ id: 'atlas', name: 'Atlas' }] });
    rt.repo.updateIdentity('atlas', { adapterId: 'fake' });
    await api(rt, 'POST', '/v1/adapters/fake', { command: process.execPath, args: [uniqueAgent], enabled: true });
    const proj = (await api(rt, 'POST', '/v1/projects/attach', { path: repoDir, name: 'Orphan' })).json.project;
    const room = (await api(rt, 'POST', '/v1/rooms', { name: 'r', projectId: proj.id })).json;
    const job = (await api(rt, 'POST', '/v1/jobs', { roomId: room.id, title: 'Race', createdBy: 'winston' })).json;
    const s = await api(rt, 'POST', `/v1/jobs/${job.id}/sessions`, { agentId: 'atlas', adapterId: 'fake', prompt: 'sleep 60' });
    assert.equal(s.status, 202, JSON.stringify(s.json));
    // No waiting: shut down while the session is still preparing to start its agent.
  } finally {
    await rt.close();
  }
  await new Promise((r) => setTimeout(r, 1500)); // let any (wrongly) spawned process show up
  let leaked = '';
  try {
    leaked = execFileSync('pgrep', ['-f', uniqueAgent], { encoding: 'utf8' }).trim();
  } catch {
    leaked = ''; // pgrep exits 1 when nothing matches
  }
  if (leaked) execFileSync('pkill', ['-f', uniqueAgent]);
  assert.equal(leaked, '', 'no agent process survives runtime shutdown');
  fs.rmSync(dir, { recursive: true, force: true });
});
