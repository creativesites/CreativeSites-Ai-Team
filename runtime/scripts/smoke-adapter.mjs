#!/usr/bin/env node
// One real ACP turn through the runtime against a chosen adapter, in a throwaway
// store/repo. This is the honest "is this adapter working?" check.
//
//   node runtime/scripts/smoke-adapter.mjs claude
//   node runtime/scripts/smoke-adapter.mjs codex
//   node runtime/scripts/smoke-adapter.mjs gemini
//   node runtime/scripts/smoke-adapter.mjs dsh

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startRuntime } from '../src/app.ts';

const adapterId = process.argv[2] ?? 'claude';
const prompt = process.argv[3] ?? 'Reply with exactly: OK';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), `myaos-smoke-${adapterId}-`));
const workRoot = path.join(dir, 'work');
fs.mkdirSync(workRoot, { recursive: true });
let rt;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const call = async (method, route, body) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${rt.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

try {
  rt = await startRuntime({
    dbPath: path.join(dir, 'runtime.db'),
    workspaceRoots: [workRoot],
    worktreeRoot: path.join(dir, 'worktrees'),
    artifactsDir: path.join(dir, 'artifacts'),
  });

  const adapters = await call('GET', '/v1/adapters?probe=1');
  const info = (adapters.json ?? []).find((a) => a.id === adapterId);
  console.log(`adapter: ${adapterId} — installed=${info?.installed} version=${info?.version ?? '?'} auth=${info?.auth?.state} (${info?.auth?.detail})`);
  if (!info?.installed) throw new Error(`${adapterId} is not installed`);
  if (info.auth?.state === 'needs_login') throw new Error(`${adapterId} needs login: ${info.auth.detail}`);

  await call('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston' },
    teams: [{ id: 'smoke', name: 'Smoke' }],
    identities: [{ id: 'atlas', name: 'Atlas', teamId: 'smoke' }],
  });
  const repoDir = path.join(workRoot, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# smoke\n');
  execFileSync('git', ['init', '--quiet', '-b', 'main', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=smoke@example.com', '-c', 'user.name=Smoke', 'commit', '--quiet', '-m', 'init']);
  const project = await call('POST', '/v1/projects/attach', { path: repoDir, name: 'Smoke' });
  const room = await call('POST', '/v1/rooms', { name: 'smoke', projectId: project.json.project.id });
  const job = await call('POST', '/v1/jobs', { roomId: room.json.id, title: 'Adapter smoke test', brief: prompt, createdBy: 'winston' });

  const started = await call('POST', `/v1/jobs/${job.json.id}/sessions`, { agentId: 'atlas', adapterId, prompt });
  if (started.status !== 202) throw new Error(`session start failed: ${started.status} ${JSON.stringify(started.json)}`);
  const sessionId = started.json.id;
  console.log(`session: ${sessionId}`);

  const deadline = Date.now() + 180_000;
  let session;
  let transcript = [];
  while (Date.now() < deadline) {
    await sleep(1000);
    session = (await call('GET', `/v1/sessions/${sessionId}`)).json;
    transcript = (await call('GET', `/v1/sessions/${sessionId}/transcript`)).json ?? [];
    if (session.state === 'idle' || session.state === 'failed' || session.state === 'stopped') break;
  }
  const text = transcript
    .map((entry) => entry.payload?.text ?? entry.payload?.message ?? '')
    .filter(Boolean)
    .join('\n');
  console.log(`state: ${session?.state} error: ${session?.error ?? '-'} turns: ${transcript.filter((e) => e.kind === 'turn_end').length}`);
  console.log(`transcript tail:\n${text.slice(-1200) || '(no text)'}`);
  const jobDetail = (await call('GET', `/v1/jobs/${job.json.id}`)).json;
  console.log(`evidence rows: ${jobDetail.evidence.length} (${jobDetail.evidence.map((e) => `${e.class}/${e.kind}`).join(', ')})`);
  if (session?.state !== 'idle') process.exitCode = 1;
  if (!/OK/i.test(text)) process.exitCode = 1;
} catch (e) {
  console.error(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (rt) await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
