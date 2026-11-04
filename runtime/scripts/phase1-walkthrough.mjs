#!/usr/bin/env node
// Phase 1 exit-check rehearsal: a real Claude builder turn, runtime check,
// independent verification, owner approval, done — in a throwaway repo/store.
// This is the engine-level version of the flow the app UI will drive.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-phase1-'));
const workRoot = path.join(dir, 'work');
fs.mkdirSync(workRoot, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let rt;
const call = async (method, route, body) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const ok = async (method, route, body) => {
  const r = await call(method, route, body);
  if (r.status >= 300) throw new Error(`${method} ${route} -> ${r.status}: ${JSON.stringify(r.json)}`);
  return r.json;
};

try {
  rt = await startRuntime({ dbPath: path.join(dir, 'runtime.db'), workspaceRoots: [workRoot], worktreeRoot: path.join(dir, 'worktrees'), artifactsDir: path.join(dir, 'artifacts') });
  await ok('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston' },
    teams: [{ id: 'creativesites', name: 'CreativeSites' }],
    identities: [
      { id: 'atlas', name: 'Atlas', teamId: 'creativesites' },
      { id: 'kael', name: 'Kael', teamId: 'creativesites' },
    ],
  });

  const repoDir = path.join(workRoot, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# Demo project\n\n');
  execFileSync('git', ['init', '--quiet', '-b', 'main', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=demo@example.com', '-c', 'user.name=Demo', 'commit', '--quiet', '-m', 'init']);

  const project = await ok('POST', '/v1/projects/attach', { path: repoDir, name: 'Phase 1 Demo' });
  const room = await ok('POST', '/v1/rooms', { name: 'phase1-demo', projectId: project.project.id });
  await ok('POST', `/v1/rooms/${room.id}/members`, { memberId: 'winston', kind: 'human', role: 'owner' });
  await ok('POST', `/v1/rooms/${room.id}/members`, { memberId: 'atlas', role: 'member' });
  const job = await ok('POST', '/v1/jobs', {
    roomId: room.id,
    title: 'Add the MyaOS line to README',
    brief: 'The demo project must say MyaOS was here. Add the exact line "MyaOS was here" to README.md.',
    createdBy: 'winston',
    criteria: ['README.md contains the exact line MyaOS was here'],
  });
  await ok('POST', `/v1/jobs/${job.id}/stage`, { to: 'plan', actorId: 'winston' });
  await ok('POST', `/v1/jobs/${job.id}/plan`, { plan: { summary: 'Append the line, then prove it with grep.' }, actorId: 'winston' });
  const task = await ok('POST', `/v1/jobs/${job.id}/tasks`, {
    title: 'Append the line and prove it',
    assigneeId: 'atlas',
    checkCommand: 'grep -qx "MyaOS was here" README.md',
    criterionIds: [job.criteria[0].id],
  });
  await ok('POST', `/v1/jobs/${job.id}/stage`, { to: 'build', actorId: 'winston' });

  const prompt = [
    'You are the builder for this job. Work only inside this worktree.',
    'Append the exact line "MyaOS was here" as a new line at the end of README.md.',
    'Then run the check command `grep -qx "MyaOS was here" README.md` and report its exit code.',
    'Do not stop until the check passes.',
  ].join(' ');
  const started = await ok('POST', `/v1/jobs/${job.id}/sessions`, { agentId: 'atlas', adapterId: 'claude', prompt });
  console.log(`session ${started.id} started`);

  const deadline = Date.now() + 10 * 60_000;
  let session;
  while (Date.now() < deadline) {
    await sleep(1500);
    session = await ok('GET', `/v1/sessions/${started.id}`);
    // Approve the agent's own permission requests, as Winston would from the app.
    const pending = (await ok('GET', '/v1/approvals?status=pending')).filter((a) => a.actionType === 'permission');
    for (const approval of pending) {
      const decided = await call('POST', `/v1/approvals/${approval.id}/decision`, { decision: 'approve', decidedBy: 'winston', note: 'Phase 1 walkthrough' });
      if (decided.status < 300) console.log(`approved permission ${approval.title}`);
    }
    if (['idle', 'failed', 'stopped'].includes(session.state)) break;
  }
  const transcript = await ok('GET', `/v1/sessions/${started.id}/transcript`);
  const text = transcript.map((e) => e.payload?.text ?? e.payload?.message ?? '').filter(Boolean).join('\n');
  console.log(`builder state: ${session.state} error: ${session.error ?? '-'} turn_ends: ${transcript.filter((e) => e.kind === 'turn_end').length}`);
  console.log(`builder transcript tail:\n${text.slice(-1200)}`);
  if (session.state !== 'idle') throw new Error('builder session did not finish');

  const check = await ok('POST', `/v1/jobs/${job.id}/checks`, { taskId: task.id });
  console.log(`runtime check: exit ${check.result.exitCode}${check.result.exitCode === 0 ? '' : ` — ${check.result.stderr.slice(-400)}`}`);
  if (check.result.exitCode !== 0) throw new Error('runtime check failed');
  await ok('PATCH', `/v1/tasks/${task.id}`, { status: 'done' });

  const verification = await ok('POST', `/v1/jobs/${job.id}/verify`, { actorId: 'kael' });
  console.log(`verification: ok=${verification.ok} ${verification.results.map((r) => `${r.taskId}:${r.ok ? 'verified' : r.error}`).join(', ')}`);
  if (!verification.ok) throw new Error('independent verification failed');
  await ok('POST', `/v1/jobs/${job.id}/stage`, { to: 'verify', actorId: 'winston' });

  const detailAfterVerify = await ok('GET', `/v1/jobs/${job.id}`);
  console.log(`criteria: ${detailAfterVerify.criteria.map((c) => `${c.evidenceClass}: ${c.text}`).join(' | ')}`);
  await ok('POST', `/v1/jobs/${job.id}/stage`, { to: 'approve', actorId: 'winston' });
  const approval = await ok('POST', `/v1/jobs/${job.id}/approvals`, {
    title: 'Merge the README line into main',
    consequence: 'One README line changes. Nothing is deployed. One revert undoes it.',
    actionType: 'merge',
    risk: 'high',
    requestedBy: 'atlas',
    reversible: true,
  });
  const decided = await ok('POST', `/v1/approvals/${approval.id}/decision`, { decision: 'approve', decidedBy: 'winston', note: 'Verified by Kael' });
  console.log(`approval: ${decided.status}`);
  await ok('POST', `/v1/jobs/${job.id}/stage`, { to: 'done', actorId: 'winston' });

  const final = await ok('GET', `/v1/jobs/${job.id}`);
  console.log(`final stage: ${final.stage}; evidence rows: ${final.evidence.length}; history: ${final.history.map((h) => `${h.fromStage ?? '∅'}→${h.toStage}`).join(' ')}`);
  console.log(`worktree commit: ${final.evidence.find((e) => e.commitSha)?.commitSha ?? '(none)'}`);
  console.log('PHASE 1 WALKTHROUGH PASSED');
} catch (e) {
  console.error(`PHASE 1 WALKTHROUGH FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (rt) await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
