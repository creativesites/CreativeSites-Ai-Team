import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-acp-'));
const workRoot = path.join(dir, 'work');
fs.mkdirSync(workRoot, { recursive: true });
const fixture = new URL('./fixtures/fake-acp-agent.mjs', import.meta.url).pathname;
let rt: RunningRuntime;
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
    await new Promise((r) => setTimeout(r, 150));
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
      { id: 'atlas', name: 'Atlas', teamId: 'creativesites' },
      { id: 'kael', name: 'Kael', teamId: 'creativesites' },
    ],
  });
  await call('POST', '/v1/adapters/fake', {
    command: process.execPath,
    args: [fixture],
    enabled: true,
  });

  const repoDir = path.join(workRoot, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# repo\n');
  execFileSync('git', ['init', '--quiet', '-b', 'main', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '--quiet', '-m', 'init']);
  const attached = await call('POST', '/v1/projects/attach', { path: repoDir, name: 'Test Project' });
  const room = await call('POST', '/v1/rooms', { name: 'test-room', projectId: attached.json.project.id });
  const job = await call('POST', '/v1/jobs', {
    roomId: room.json.id,
    title: 'ACP session test',
    brief: 'Run the assigned check.',
    createdBy: 'winston',
    criteria: ['The check runs'],
  });
  jobId = job.json.id;
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'plan', actorId: 'winston' });
  await call('POST', `/v1/jobs/${jobId}/plan`, { plan: { summary: 'Run a turn' }, actorId: 'winston' });
  await call('POST', `/v1/jobs/${jobId}/tasks`, {
    title: 'Check the README',
    assigneeId: 'atlas',
    checkCommand: 'test -f README.md',
    criterionIds: [job.json.criteria[0].id],
  });
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'build', actorId: 'winston' });
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a session streams its transcript, snapshots the worktree and ends cleanly', async () => {
  const started = await call('POST', `/v1/jobs/${jobId}/sessions`, {
    agentId: 'atlas',
    adapterId: 'fake',
    prompt: 'echo ok',
  });
  assert.equal(started.status, 202, JSON.stringify(started.json));
  const sessionId = started.json.id as string;

  const transcript = await waitFor(async () => {
    const res = await call('GET', `/v1/sessions/${sessionId}/transcript`);
    const entries = res.json as any[];
    return entries.some((e) => JSON.stringify(e.payload).includes('output: ok')) ? entries : null;
  });
  const text = transcript.map((e: any) => e.payload?.text ?? '').join('\n');
  assert.match(text, /output: ok/);

  const session = await waitFor(async () => {
    const res = await call('GET', `/v1/sessions/${sessionId}`);
    return res.json.state === 'idle' ? res.json : null;
  });
  assert.ok(session.acpSessionId);
  assert.equal(session.adapterId, 'fake');
  assert.ok(session.worktree);

  const job = await call('GET', `/v1/jobs/${jobId}`);
  const snapshots = (job.json.evidence as any[]).filter((e) => e.kind === 'diff' && e.class === 'OBSERVED');
  assert.ok(snapshots.length >= 1, 'the runtime recorded a worktree snapshot');
  assert.ok(snapshots.every((e) => e.worktree));
});

test('a permission request becomes an approval and the client blocks the outside write', async () => {
  const started = await call('POST', `/v1/jobs/${jobId}/sessions`, {
    agentId: 'atlas',
    adapterId: 'fake',
    prompt: 'write outside',
  });
  assert.equal(started.status, 202);
  const sessionId = started.json.id as string;

  const pending = await waitFor(async () => {
    const res = await call('GET', '/v1/approvals?status=pending');
    return (res.json as any[]).find((a) => a.actionType === 'permission' && a.sessionId === sessionId) ?? null;
  }, 20_000);

  const decided = await call('POST', `/v1/approvals/${pending.id}/decision`, {
    decision: 'approve',
    decidedBy: 'winston',
    note: 'allow once for this test',
  });
  assert.equal(decided.status, 200);
  assert.equal(decided.json.status, 'approved');

  const transcript = await waitFor(async () => {
    const res = await call('GET', `/v1/sessions/${sessionId}/transcript`);
    const entries = res.json as any[];
    return entries.some((e) => JSON.stringify(e.payload).includes('permission outcome')) ? entries : null;
  }, 20_000);
  const text = transcript.map((e: any) => JSON.stringify(e.payload)).join('\n');
  assert.match(text, /permission outcome/);
  assert.match(text, /allow-once/);

  const blocked = await waitFor(async () => {
    const res = await call('GET', `/v1/sessions/${sessionId}/transcript`);
    const entries = res.json as any[];
    return entries.some((e) => JSON.stringify(e.payload).includes('blocked by client')) ? entries : null;
  }, 20_000);
  assert.ok(blocked.length > 0);
});

test('multi-turn follow-up prompt, worktree files endpoint and live usage telemetry', async () => {
  // 1. Start a session that creates a file
  const started = await call('POST', `/v1/jobs/${jobId}/sessions`, {
    agentId: 'atlas',
    adapterId: 'fake',
    prompt: 'create a file',
  });
  assert.equal(started.status, 202);
  const sessionId = started.json.id as string;

  // Wait for the session to complete turn 1 and become idle
  const idleSession = await waitFor(async () => {
    const res = await call('GET', `/v1/sessions/${sessionId}`);
    return res.json?.state === 'idle' ? res.json : null;
  });
  assert.ok(idleSession.acpSessionId);

  // Write a file in the session worktree to verify GET /v1/sessions/:id/files detects untracked/modified files with diffs
  fs.writeFileSync(path.join(idleSession.worktree, 'worktree-change.txt'), 'new worktree content\n');

  // 2. Test GET /v1/sessions/:id/files: should list worktree-change.txt with diff
  const filesRes = await call('GET', `/v1/sessions/${sessionId}/files`);
  assert.equal(filesRes.status, 200);
  assert.ok(Array.isArray(filesRes.json));
  const createdFile = filesRes.json.find((f: any) => f.path.includes('worktree-change.txt'));
  assert.ok(createdFile, `files endpoint should return worktree-change.txt: ${JSON.stringify(filesRes.json)}`);
  assert.ok(createdFile.diff, 'file entry includes a diff');

  // 3. Test multi-turn follow-up instruction to an idle session
  const followUp = await call('POST', `/v1/sessions/${sessionId}/prompt`, {
    text: 'report usage',
  });
  assert.equal(followUp.status, 202);

  // Wait for the continuation turn to finish
  const continuedSession = await waitFor(async () => {
    const res = await call('GET', `/v1/sessions/${sessionId}`);
    return res.json?.state === 'idle' && res.json?.turnCount > 1 ? res.json : null;
  });
  assert.ok(continuedSession.turnCount >= 2);

  // 4. Verify token and cost telemetry is recorded on the session
  assert.ok(continuedSession.usage, 'session has live usage telemetry');
  assert.ok(continuedSession.usage.inputTokens > 0);
  assert.ok(continuedSession.usage.outputTokens > 0);
  assert.ok(continuedSession.usage.totalTokens === continuedSession.usage.inputTokens + continuedSession.usage.outputTokens);
});

test('multi-turn session resumes existing acpSessionId via session/load when supported by adapter', async () => {
  process.env.FAKE_LOAD_SESSION = '1';
  process.env.MYAOS_AGENT_ENV_PASS = 'FAKE_LOAD_SESSION'; // agents get an allowlisted env (security review S3)
  try {
    const started = await call('POST', `/v1/jobs/${jobId}/sessions`, {
      agentId: 'kael',
      adapterId: 'fake',
      prompt: 'echo ok',
    });
    assert.equal(started.status, 202);
    const sessionId = started.json.id as string;

    const initialSession = await waitFor(async () => {
      const res = await call('GET', `/v1/sessions/${sessionId}`);
      return res.json?.state === 'idle' ? res.json : null;
    });
    const capturedAcpSessionId = initialSession.acpSessionId;
    assert.ok(capturedAcpSessionId);

    // Follow-up prompt to idle session with adapter advertising loadSession: true
    const followUp = await call('POST', `/v1/sessions/${sessionId}/prompt`, {
      text: 'echo ok',
    });
    assert.equal(followUp.status, 202);

    const resumedSession = await waitFor(async () => {
      const res = await call('GET', `/v1/sessions/${sessionId}`);
      return res.json?.state === 'idle' && res.json?.turnCount > initialSession.turnCount ? res.json : null;
    });
    // ACP session ID must be preserved
    assert.equal(resumedSession.acpSessionId, capturedAcpSessionId);

    // Verify transcript received the resumed session confirmation
    const tRes = await call('GET', `/v1/sessions/${sessionId}/transcript`);
    const entries = tRes.json as any[];
    const resumedEntry = entries.find(
      (e) => e.kind === 'session_load' || e.payload?.acpSessionId === capturedAcpSessionId
    );
    assert.ok(resumedEntry, 'transcript contains session/load confirmation');
  } finally {
    delete process.env.FAKE_LOAD_SESSION;
    delete process.env.MYAOS_AGENT_ENV_PASS;
  }
});

test('an agent session is offered the MyaOS MCP server and acts through it with a session-bound token (K4)', async () => {
  const started = await call('POST', `/v1/jobs/${jobId}/sessions`, { agentId: 'atlas', adapterId: 'fake', prompt: 'use myaos tools' });
  assert.equal(started.status, 202, JSON.stringify(started.json));
  const sessionId = started.json.id as string;
  const transcript = await waitFor(async () => {
    const res = await call('GET', `/v1/sessions/${sessionId}/transcript`);
    const text = (res.json as any[]).map((e) => e.payload?.text ?? '').join('\n');
    return /myaos tools:/.test(text) ? text : null;
  });
  assert.match(transcript, /task_report/);
  assert.match(transcript, /task_report isError=false/);
  const evidence = (await call('GET', `/v1/jobs/${jobId}/evidence`)).json as any[];
  const note = evidence.find((e) => e.summary === 'fake agent progress via MCP');
  assert.ok(note, 'the tool call wrote evidence');
  assert.equal(note.recordedBy, 'atlas', 'actor comes from the session token');
  assert.equal(note.class, 'DECLARED');
});
