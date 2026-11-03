import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-orchestrator-'));
const workRoot = path.join(dir, 'work');
fs.mkdirSync(workRoot, { recursive: true });
const fixture = new URL('./fixtures/fake-acp-agent.mjs', import.meta.url).pathname;

let rt: RunningRuntime;
let repoDir = '';
let roomId = '';
let jobId = '';

const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${rt.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
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
      { id: 'atlas', name: 'Atlas', role: 'Lead Architect', runtime: 'Claude Code', teamId: 'creativesites' },
      { id: 'kael', name: 'Kael', role: 'Lead Verifier', runtime: 'Codex', teamId: 'creativesites' },
      { id: 'nyx', name: 'Nyx', role: 'Security Lead', runtime: 'Gemini CLI', teamId: 'creativesites' },
    ],
  });

  // Configure fake adapter for claude, codex, gemini, and fake so all agents can spawn deterministically in tests
  for (const id of ['fake', 'claude', 'codex', 'gemini']) {
    await call('POST', `/v1/adapters/${id}`, {
      command: process.execPath,
      args: [fixture],
      enabled: true,
    });
  }

  repoDir = path.join(workRoot, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# orchestrator repo\n');
  execFileSync('git', ['init', '--quiet', '-b', 'main', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '--quiet', '-m', 'init']);

  const attached = await call('POST', '/v1/projects/attach', { path: repoDir, name: 'Orchestrator Project' });
  const room = await call('POST', '/v1/rooms', { name: 'autonomous-room', projectId: attached.json.project.id });
  roomId = room.json.id;

  const job = await call('POST', '/v1/jobs', {
    roomId,
    title: 'Autonomous coordination & ship test',
    brief: 'Verify wakeups, schedules, rate limits, and shipping.',
    createdBy: 'winston',
    criteria: ['Feature implemented and verified'],
  });
  jobId = job.json.id;
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'plan', actorId: 'winston' });
  await call('POST', `/v1/jobs/${jobId}/plan`, { plan: { summary: 'Coordinate and ship' }, actorId: 'winston' });
  await call('POST', `/v1/jobs/${jobId}/tasks`, {
    title: 'Create created.txt',
    assigneeId: 'atlas',
    checkCommand: 'test -f created.txt',
    criterionIds: [job.json.criteria[0].id],
  });
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'build', actorId: 'winston' });
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('1. waking an agent captures activeSessionId & acpSessionId on the identity and streams live terminal output', async () => {
  const woken = await call('POST', '/v1/agents/atlas/wake', {
    fromActorId: 'winston',
    fromActorKind: 'human',
    roomId,
    jobId,
    adapterId: 'fake',
    prompt: 'echo ok',
    reason: 'Direct wake test',
  });
  assert.equal(woken.status, 202, JSON.stringify(woken.json));
  assert.ok(woken.json.session?.id);
  const sessionId = woken.json.session.id as string;

  // Wait for session to finish turn and capture acpSessionId on identity
  const atlas = await waitFor(async () => {
    const res = await call('GET', '/v1/identities');
    const found = (res.json as any[]).find((i) => i.id === 'atlas');
    return found?.activeSessionId === sessionId && found?.acpSessionId && found?.statusState === 'idle' ? found : null;
  });
  assert.equal(atlas.activeSessionId, sessionId);
  assert.equal(atlas.acpSessionId, 'fake-session-1');
  assert.ok(atlas.lastWokenAt);

  // Verify live formatted terminal output endpoint
  const term = await call('GET', `/v1/sessions/${sessionId}/terminal`);
  assert.equal(term.status, 200);
  assert.equal(term.json.acpSessionId, atlas.acpSessionId);
  assert.match(term.json.output, /MyaOS Agent Terminal/);
  assert.match(term.json.output, /output: ok/);
});

test('2. agent-to-agent autonomous [WAKE: ...] directive wakes the target coworker', async () => {
  const started = await call('POST', '/v1/agents/atlas/wake', {
    fromActorId: 'winston',
    fromActorKind: 'human',
    roomId,
    adapterId: 'fake',
    prompt: 'emit directive: [WAKE: kael] echo ok',
  });
  assert.equal(started.status, 202);

  // Kael should be woken automatically by Atlas's directive and capture its own activeSessionId & acpSessionId
  const kael = await waitFor(async () => {
    const res = await call('GET', '/v1/identities');
    const found = (res.json as any[]).find((i) => i.id === 'kael');
    return found?.activeSessionId && found?.acpSessionId ? found : null;
  });
  assert.ok(kael.activeSessionId);
  assert.ok(kael.acpSessionId);

  const wakes = await call('GET', '/v1/wakes?targetAgentId=kael');
  assert.equal(wakes.status, 200);
  assert.ok((wakes.json as any[]).some((w) => w.fromActorId === 'atlas'));
});

test('3. agent self-scheduling & cron/timer tick wakes the scheduled agent when due', async () => {
  const pastIso = new Date(Date.now() - 2_000).toISOString();
  const created = await call('POST', '/v1/schedules', {
    targetAgentId: 'nyx',
    createdBy: 'nyx',
    roomId,
    runAt: pastIso,
    prompt: 'echo ok',
  });
  assert.equal(created.status, 201);
  const scheduleId = created.json.id as string;

  const ticked = await call('POST', '/v1/schedules/tick');
  assert.equal(ticked.status, 200);
  assert.ok((ticked.json.triggered as string[]).includes(scheduleId));

  const nyx = await waitFor(async () => {
    const res = await call('GET', '/v1/identities');
    const found = (res.json as any[]).find((i) => i.id === 'nyx');
    return found?.activeSessionId && found?.acpSessionId ? found : null;
  });
  assert.ok(nyx.activeSessionId);
});

test('4. easy agent spawning & Team Leader delegation work end-to-end', async () => {
  const spawned = await call('POST', '/v1/agents/spawn', {
    id: 'pulse',
    name: 'Pulse',
    role: 'Telemetry Specialist',
    runtime: 'Claude Code',
    adapterId: 'fake',
    prompt: 'echo ok',
    roomId,
    spawnedBy: 'atlas',
  });
  assert.equal(spawned.status, 201);
  assert.equal(spawned.json.identity.id, 'pulse');
  assert.ok(spawned.json.wake?.session?.id);

  const pulse = await waitFor(async () => {
    const res = await call('GET', '/v1/identities');
    const found = (res.json as any[]).find((i) => i.id === 'pulse');
    return found?.acpSessionId ? found : null;
  });
  assert.ok(pulse.acpSessionId);

  const dispatched = await call('POST', '/v1/team-leader/dispatch', {
    leaderId: 'atlas',
    fromActorId: 'winston',
    roomId,
    jobId,
    goal: 'Coordinate Pulse and Kael on telemetry verification',
  });
  assert.equal(dispatched.status, 202);
  assert.ok(dispatched.json.session?.id);
});

test('5. session-limit & rate-limit awareness records reset time, informs other agents, and auto-schedules resume', async () => {
  const started = await call('POST', `/v1/jobs/${jobId}/sessions`, {
    agentId: 'atlas',
    adapterId: 'fake',
    prompt: 'simulate rate limit',
  });
  assert.equal(started.status, 202);

  // Wait for rate limit to be detected and recorded on Atlas and fake adapter
  const limits = await waitFor(async () => {
    const res = await call('GET', '/v1/rate-limits');
    const data = res.json as { identities: any[]; adapters: any[] };
    const limitedAtlas = data.identities.find((i) => i.id === 'atlas' && i.statusState === 'rate_limited');
    return limitedAtlas ? data : null;
  });
  assert.ok(limits.identities.some((i: any) => i.id === 'atlas' && i.rateLimitResetAt));
  assert.ok(limits.adapters.some((a: any) => a.id === 'fake' && a.rateLimitResetAt));

  // Verify an automatic wakeup schedule was created for Atlas at resetAt
  const schedules = await call('GET', '/v1/schedules');
  assert.ok(
    (schedules.json as any[]).some(
      (s) => s.targetAgentId === 'atlas' && String(s.prompt).includes('Auto-resume after rate limit reset')
    ),
    'auto-resume schedule created at resetAt'
  );

  // Clear rate limit so subsequent tests can use fake adapter
  await call('POST', '/v1/identities/atlas/clear-rate-limit');
  await call('POST', '/v1/adapters/fake/clear-rate-limit');
});

test('6. Phase 2 non-code jobs verify cleanly and code jobs ship worktree commits to main', async () => {
  // 6a. Non-code research job verification
  const researchJob = await call('POST', '/v1/jobs', {
    roomId,
    title: 'Competitor research brief',
    brief: 'Summarize findings.',
    kind: 'research',
    createdBy: 'winston',
    criteria: ['Findings documented in plan/evidence'],
  });
  const rId = researchJob.json.id as string;
  const rVerify = await call('POST', `/v1/jobs/${rId}/verify`, { verifierId: 'kael' });
  assert.equal(rVerify.status, 200);
  assert.equal(rVerify.json.ok, true);

  // 6b. Code job: create a file in worktree, commit, and ship to main
  const tasks = (await call('GET', `/v1/jobs/${jobId}`)).json.tasks as any[];
  const taskId = tasks[0].id as string;
  const buildSession = await call('POST', `/v1/jobs/${jobId}/sessions`, {
    agentId: 'atlas',
    adapterId: 'fake',
    taskId,
    prompt: 'create a file',
  });
  assert.equal(buildSession.status, 202);
  const bSessId = buildSession.json.id as string;

  await waitFor(async () => {
    const res = await call('GET', `/v1/sessions/${bSessId}`);
    return res.json.state === 'idle' ? res.json : null;
  });

  const shipped = await call('POST', `/v1/jobs/${jobId}/ship`, {
    strategy: 'merge',
    actorId: 'winston',
  });
  assert.equal(shipped.status, 200, JSON.stringify(shipped.json));
  assert.equal(shipped.json.ok, true);
  assert.ok(shipped.json.commitSha);
  assert.ok(fs.existsSync(path.join(repoDir, 'created.txt')), 'created.txt merged into main repo');
});
