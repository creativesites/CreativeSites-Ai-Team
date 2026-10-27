import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-bridge-'));
const teamRepo = path.join(dir, 'team');
fs.mkdirSync(path.join(teamRepo, 'community'), { recursive: true });
let rt: RunningRuntime;
let roomId = '';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  rt = await startRuntime({ dbPath: path.join(dir, 'runtime.db'), teamRepo });
  await call('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston' },
    teams: [{ id: 'creativesites', name: 'CreativeSites' }],
    identities: [{ id: 'atlas', name: 'Atlas', teamId: 'creativesites' }],
  });
  const room = await call('POST', '/v1/rooms', { name: 'bridge-room' });
  roomId = room.json.id;
  const settings = await call('POST', '/v1/settings', { bridge: { enabled: true, inbox: true } });
  assert.equal(settings.status, 200);
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('job events mirror a dossier into community/threads/desktop', async () => {
  const job = await call('POST', '/v1/jobs', {
    roomId,
    title: 'Bridge the job',
    brief: 'Show this job to the team.',
    createdBy: 'winston',
    criteria: ['The thread exists'],
  });
  await call('POST', `/v1/jobs/${job.json.id}/tasks`, {
    title: 'Write the thread',
    assigneeId: 'atlas',
    checkCommand: 'test -f thread.md',
  });
  await sleep(2200);

  const threadDir = path.join(teamRepo, 'community', 'threads', 'desktop');
  const files = fs.readdirSync(threadDir);
  assert.equal(files.length, 1);
  assert.match(files[0]!, /JOB-1-/);
  const text = fs.readFileSync(path.join(threadDir, files[0]!), 'utf8');
  assert.match(text, /job_id: job_/);
  assert.match(text, /Show this job to the team/);
  assert.match(text, /## Tasks/);
  assert.match(text, /Write the thread/);
  assert.match(text, /atlas/);

  const inboxDir = path.join(teamRepo, 'community', 'inboxes', 'atlas');
  const notes = fs.readdirSync(inboxDir);
  assert.ok(notes.length >= 1);
  const note = fs.readFileSync(path.join(inboxDir, notes[0]!), 'utf8');
  assert.match(note, /task\.assigned/);
  assert.match(note, /JOB-1/);

  const status = await call('GET', '/v1/bridge/status');
  assert.equal(status.json.enabled, true);
  assert.equal(status.json.configured, true);
  assert.ok(status.json.lastMirrorAt);
});

test('inbox notes and thread replies are imported once as Claimed', async () => {
  const jobs = await call('GET', '/v1/jobs');
  const job = jobs.json.find((j: any) => j.title === 'Bridge the job');
  assert.ok(job);

  const threadDir = path.join(teamRepo, 'community', 'threads', 'desktop');
  const threadFile = path.join(threadDir, fs.readdirSync(threadDir)[0]!);
  fs.appendFileSync(threadFile, '\n### Reply from @atlas\nThe thread reply from Atlas.\n');

  const inboxDir = path.join(teamRepo, 'community', 'inboxes', 'atlas');
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.writeFileSync(
    path.join(inboxDir, '2026-10-27T08-00-00Z_progress.md'),
    ['---', 'from: atlas', 'to: winston', 'type: progress', 'related_job: JOB-1', '---', '', 'The inbox progress note from Atlas.', ''].join('\n')
  );

  const first = await call('POST', '/v1/bridge/ingest');
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.ok(first.json.imported >= 2, JSON.stringify(first.json));

  const second = await call('POST', '/v1/bridge/ingest');
  assert.equal(second.json.imported, 0, 're-scan must not duplicate');

  const detail = await call('GET', `/v1/jobs/${job.id}`);
  const claimed = (detail.json.evidence as any[]).filter((e) => e.kind === 'message' && e.class === 'DECLARED');
  assert.ok(claimed.some((e) => e.recordedBy === 'atlas' && JSON.stringify(e.payload).includes('thread reply')));
  assert.ok(claimed.some((e) => e.recordedBy === 'atlas' && JSON.stringify(e.payload).includes('inbox progress')));
  const messages = await call('GET', `/v1/rooms/${job.roomId}/messages`);
  assert.ok(messages.json.some((m: any) => m.authorId === 'atlas' && m.body.includes('inbox progress')));
  const status = await call('GET', '/v1/bridge/status');
  assert.ok(status.json.ingested >= 2);
});

test('the mirror is manual-callable and stays out of the way when disabled', async () => {
  const job = await call('POST', '/v1/jobs', { roomId, title: 'Second job', createdBy: 'winston' });
  await call('POST', '/v1/settings', { bridge: { enabled: false } });
  const job2 = await call('POST', '/v1/jobs', { roomId, title: 'Hidden job', createdBy: 'winston' });
  await sleep(1500);

  const threadDir = path.join(teamRepo, 'community', 'threads', 'desktop');
  const files = fs.readdirSync(threadDir);
  assert.ok(!files.some((f) => f.includes('JOB-3')), 'disabled bridge must not write');

  const mirrored = await call('POST', `/v1/bridge/mirror/${job2.json.id}`);
  assert.equal(mirrored.status, 200);
  assert.ok(fs.existsSync(mirrored.json.path));
  assert.match(fs.readFileSync(mirrored.json.path, 'utf8'), /Hidden job/);

  const jobDetail = await call('GET', `/v1/jobs/${job.json.id}`);
  assert.equal(jobDetail.json.title, 'Second job');
});
