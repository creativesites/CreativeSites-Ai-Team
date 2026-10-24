import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { openStore, schemaVersion } from '../src/store/db.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-runtime-'));
let rt: RunningRuntime;

const call = async (method: string, route: string, body?: unknown, token: string | null = rt.token) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as any };
};

before(async () => {
  rt = await startRuntime({ dbPath: path.join(dir, 'runtime.db'), allowedOrigins: ['http://localhost:1430'] });
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('health needs no token and reports the schema version', async () => {
  const { status, json } = await call('GET', '/health', undefined, null);
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.schemaVersion, MIGRATIONS.at(-1)!.version);
});

test('every other route rejects a missing or wrong token', async () => {
  assert.equal((await call('GET', '/v1/summary', undefined, null)).status, 401);
  assert.equal((await call('GET', '/v1/summary', undefined, 'wrong')).status, 401);
});

test('a fresh store is empty, with no sample data', async () => {
  const { json } = await call('GET', '/v1/summary');
  assert.deepEqual(json, { identities: 0, rooms: 0, openJobs: 0, pendingApprovals: 0, liveSessions: 0 });
});

test('rooms, messages and jobs round-trip', async () => {
  const room = (await call('POST', '/v1/rooms', { name: 'myavana-chatbot' })).json;
  assert.match(room.id, /^room_/);
  assert.equal((await call('POST', '/v1/rooms', { name: 'myavana-chatbot' })).status, 400, 'names are unique');

  const msg = await call('POST', `/v1/rooms/${room.id}/messages`, { authorId: 'winston', authorKind: 'human', body: 'hello' });
  assert.equal(msg.status, 201);
  assert.equal((await call('GET', `/v1/rooms/${room.id}/messages`)).json.length, 1);

  const job = (await call('POST', '/v1/jobs', {
    roomId: room.id,
    title: 'Fix early logout',
    createdBy: 'winston',
    criteria: ['Existing auth tests pass'],
  })).json;
  assert.equal(job.number, 1);
  assert.equal(job.stage, 'brief');
  assert.equal(job.criteria[0].evidenceClass, 'UNKNOWN', 'no evidence yet means unknown, never a guess');
  assert.equal((await call('GET', `/v1/jobs/${job.id}`)).json.title, 'Fix early logout');
  assert.equal((await call('GET', '/v1/jobs/job_missing')).status, 404);
});

test('identities can be added and their avatar changed', async () => {
  const created = await call('POST', '/v1/identities', { id: 'Sage', name: 'Sage', runtime: 'Claude Code' });
  assert.equal(created.status, 201);
  assert.equal(created.json.id, 'sage');
  const updated = await call('POST', '/v1/identities/sage', { avatarMark: 'diamond', avatarColor: 'amber' });
  assert.equal(updated.json.avatarMark, 'diamond');
  assert.equal(updated.json.name, 'Sage', 'fields not sent are kept');
  assert.equal((await call('POST', '/v1/identities/nobody', { name: 'x' })).status, 404);
});

test('bad input is a 400, not a crash', async () => {
  assert.equal((await call('POST', '/v1/rooms', { name: '' })).status, 400);
  const res = await fetch(`${rt.url}/v1/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${rt.token}` },
    body: 'not json',
  });
  assert.equal(res.status, 400);
});

test('CORS allows only listed origins', async () => {
  const ok = await fetch(`${rt.url}/v1/summary`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:1430' } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:1430');
  const bad = await fetch(`${rt.url}/v1/summary`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
});

test('the event stream replays past events and pushes new ones', async () => {
  const controller = new AbortController();
  const res = await fetch(`${rt.url}/v1/events?since=0`, {
    headers: { Authorization: `Bearer ${rt.token}` },
    signal: controller.signal,
  });
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  let text = '';
  const until = async (needle: string) => {
    while (!text.includes(needle)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
  };
  await until('event: job.created');
  assert.ok(text.includes('event: room.created'), 'replays earlier events');

  await call('POST', '/v1/rooms', { name: 'mobile-sdk' });
  await until('"name":"mobile-sdk"');
  assert.ok(text.includes('"name":"mobile-sdk"'), 'pushes a live event');
  controller.abort();
});

test('migrations are idempotent', () => {
  const db = openStore(path.join(dir, 'second.db'));
  assert.equal(schemaVersion(db), MIGRATIONS.at(-1)!.version);
  db.close();
  const again = openStore(path.join(dir, 'second.db'));
  assert.equal(schemaVersion(again), MIGRATIONS.at(-1)!.version);
  again.close();
});
