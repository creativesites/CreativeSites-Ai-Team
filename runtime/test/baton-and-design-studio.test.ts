import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-baton-design-'));
const workRoot = path.join(dir, 'work');
fs.mkdirSync(workRoot, { recursive: true });
const fixture = new URL('./fixtures/fake-acp-agent.mjs', import.meta.url).pathname;

let rt: RunningRuntime;
let repoDir = '';
let projectId = '';
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
      { id: 'atlas', name: 'Atlas', role: 'Product & Design Lead', runtime: 'Claude Code', teamId: 'creativesites' },
      { id: 'daedalus', name: 'Daedalus', role: 'Runtime Architect', runtime: 'Codex', teamId: 'creativesites' },
      { id: 'kael', name: 'Kael', role: 'Lead Verifier', runtime: 'Gemini CLI', teamId: 'creativesites' },
    ],
  });

  for (const id of ['fake', 'claude', 'codex', 'gemini']) {
    await call('POST', `/v1/adapters/${id}`, {
      command: process.execPath,
      args: [fixture],
      enabled: true,
    });
  }

  repoDir = path.join(workRoot, 'myavana-app');
  fs.mkdirSync(path.join(repoDir, 'src/screens'), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, 'package.json'),
    JSON.stringify({ name: '@myavana/hair-journey', version: '2.0.0' }, null, 2)
  );
  fs.writeFileSync(
    path.join(repoDir, 'src/index.css'),
    ':root { --primary: #f0b44c; --background: #0c0e14; --foreground: #f4f6fb; }\n'
  );
  fs.writeFileSync(
    path.join(repoDir, 'src/screens/HairTimeline.tsx'),
    `export function HairTimelineScreen() {
      return (
        <div>
          <h1>Hair Journey Timeline</h1>
          <h2>Hairstyle Inference History</h2>
          <p>Track hairstyles, maintenance routines, and proactive Mya recommendations.</p>
          <input placeholder="Search hairstyles or products..." />
          <button>Log Hair Check-In</button>
          <button>Analyze Hairstyle</button>
        </div>
      );
    }\n`
  );
  execFileSync('git', ['init', '--quiet', '-b', 'main', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '--quiet', '-m', 'init']);

  const attached = await call('POST', '/v1/projects/attach', { path: repoDir, name: 'Myavana Hair Journey' });
  projectId = attached.json.project.id;

  const room = await call('POST', '/v1/rooms', { name: 'design-and-relay', projectId });
  roomId = room.json.id;

  const job = await call('POST', '/v1/jobs', {
    roomId,
    projectId,
    title: 'Design Studio & Session Baton Relay verification',
    brief: 'Verify token-lean role session rotation and infinite canvas UI design workflows.',
    createdBy: 'winston',
    criteria: ['UI approved and baton relay verified'],
  });
  jobId = job.json.id;
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'plan', actorId: 'winston' });
  await call('POST', `/v1/jobs/${jobId}/plan`, { plan: { summary: 'Design on canvas, approve, and relay sessions' }, actorId: 'winston' });
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'build', actorId: 'winston' });
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('1. Role Session Baton Relay compiles 3-tier capsule, rotates Gen 1 -> Gen 2, and preserves recent context', async () => {
  // Start Gen 1 session for Daedalus
  const startRes = await call('POST', `/v1/jobs/${jobId}/sessions`, {
    agentId: 'daedalus',
    adapterId: 'fake',
    prompt: 'create a file',
  });
  assert.equal(startRes.status, 202);
  const gen1Id = startRes.json.id as string;

  const gen1Idle = await waitFor(async () => {
    const res = await call('GET', `/v1/sessions/${gen1Id}`);
    return res.json?.state === 'idle' ? res.json : null;
  });
  assert.equal(gen1Idle.generation, 1);

  // Append an explicit [STATE] self-checkpoint and high-token usage to simulate context growth
  await call('POST', `/v1/sessions/${gen1Id}/transcript`, {
    kind: 'message',
    role: 'assistant',
    payload: {
      text: 'Completed initial schema setup.\n[STATE]\ndone: Created created.txt and verified git branch\nactive: src/screens/HairTimeline.tsx\nnext: Wire timeline filter bar and run tests\n[/STATE]',
    },
  });
  await call('POST', `/v1/jobs/${jobId}/usage`, {
    sessionId: gen1Id,
    inputTokens: 42_000,
    outputTokens: 1_500,
    costCents: 12,
    source: 'acp',
  });

  // Inspect the compiled Baton Capsule before rotating
  const batonPreview = await call('GET', `/v1/sessions/${gen1Id}/baton`);
  assert.equal(batonPreview.status, 200);
  assert.equal(batonPreview.json.check.rotate, true);
  assert.equal(batonPreview.json.check.reason, 'context_tokens_threshold');
  assert.match(batonPreview.json.capsule, /\[TIER 1: ROLE & ARCHITECTURAL ANCHOR\]/);
  assert.match(batonPreview.json.capsule, /\[TIER 3: HOT WORKING MEMORY/);
  assert.match(batonPreview.json.capsule, /Wire timeline filter bar and run tests/);
  assert.ok(batonPreview.json.capsuleTokens < 2500, `capsule is token-lean (${batonPreview.json.capsuleTokens} tokens)`);

  // Sending a follow-up prompt when above soft threshold automatically rotates to Gen 2!
  const promptRes = await call('POST', `/v1/sessions/${gen1Id}/prompt`, {
    text: 'echo ok',
  });
  assert.equal(promptRes.status, 202);
  const gen2Session = promptRes.json.session;
  assert.ok(gen2Session, 'returns the newly rotated Gen 2 session');
  assert.notEqual(gen2Session.id, gen1Id);
  assert.equal(gen2Session.generation, 2);
  assert.equal(gen2Session.parentSessionId, gen1Id);
  assert.ok(gen2Session.batonCapsule);

  // Wait for Gen 2 to finish its turn
  const gen2Idle = await waitFor(async () => {
    const res = await call('GET', `/v1/sessions/${gen2Session.id}`);
    return res.json?.state === 'idle' ? res.json : null;
  });
  assert.equal(gen2Idle.generation, 2);

  // Verify Gen 1 records supersededBySessionId -> Gen 2, and Daedalus identity points to Gen 2
  const gen1After = await call('GET', `/v1/sessions/${gen1Id}`);
  assert.equal(gen1After.json.supersededBySessionId, gen2Session.id);

  const identities = await call('GET', '/v1/identities');
  const daedalus = (identities.json as any[]).find((i) => i.id === 'daedalus');
  assert.equal(daedalus.activeSessionId, gen2Session.id);
});

test('2. Design Studio starts empty, refuses canned generation, versions frames from disk, and hands an approved frame to a build task', async () => {
  // A. A new board has no frames: nothing is invented on the owner's behalf
  const createdBoard = await call('POST', '/v1/design-boards', {
    projectId,
    jobId,
    roomId,
    title: 'Hair Journey Studio Canvas',
    description: 'Mobile & Web UI exploration for Hairstyle Inference',
    mode: 'hybrid',
  });
  assert.equal(createdBoard.status, 201);
  const boardId = createdBoard.json.id as string;
  assert.equal(createdBoard.json.designTokens.brandName, 'hair-journey');
  assert.equal(createdBoard.json.frames.length, 0, 'a new board starts empty');

  // B. Generation and extraction no longer fill templates
  const generated = await call('POST', `/v1/design-boards/${boardId}/generate`, { prompt: 'Design a hairstyle filter bar' });
  assert.equal(generated.status, 501);
  const extracted = await call('POST', `/v1/design-boards/${boardId}/extract`, { projectId, device: 'phone' });
  assert.equal(extracted.status, 501);
  assert.equal((await call('GET', `/v1/design-boards/${boardId}`)).json.frames.length, 0, 'refused calls create no frames');

  // C. A frame added explicitly is saved to disk and versioned
  const added = await call('POST', `/v1/design-boards/${boardId}/frames`, {
    title: 'Hair Timeline',
    device: 'phone',
    sourceFiles: ['src/screens/HairTimeline.tsx'],
    htmlContent: '<main>Hair Timeline</main>',
    authorId: 'winston',
  });
  assert.equal(added.status, 201);
  const forkedFrame = added.json;
  assert.ok(forkedFrame.htmlPath && fs.existsSync(forkedFrame.htmlPath));

  // D. A direct file edit (how an agent will write frames) syncs on GET and bumps the version
  fs.writeFileSync(forkedFrame.htmlPath, `${forkedFrame.htmlContent}\n<!-- Direct agent file edit -->`, 'utf8');
  const syncedBoard = await call('GET', `/v1/design-boards/${boardId}`);
  const syncedFork = (syncedBoard.json.frames as any[]).find((f) => f.id === forkedFrame.id);
  assert.equal(syncedFork.version, 2, 'file edit on disk bumped frame version to v2');

  // F. Approve forked frame & hand off to coding agent to build
  const approved = await call('POST', `/v1/design-frames/${forkedFrame.id}/approve`, {
    actorId: 'winston',
    note: 'Use this exact layout for HairTimeline v2',
    dispatchBuildTask: true,
    assigneeId: 'atlas',
    targetFiles: ['src/screens/HairTimeline.tsx'],
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.frame.status, 'approved');
  assert.equal(approved.json.evidence.class, 'OBSERVED', 'an approval is a decision, not a re-run check');
  assert.ok(approved.json.task?.id, 'created build task on job from approved frame');
});
