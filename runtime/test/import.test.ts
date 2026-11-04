import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const payloadUrl = new URL('../../community/desktop-v2/import/import-payload.json', import.meta.url);
const payload = JSON.parse(fs.readFileSync(payloadUrl, 'utf8')) as Record<string, any>;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-import-'));
let rt: RunningRuntime;

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

before(async () => {
  rt = await startRuntime({ dbPath: path.join(dir, 'runtime.db') });
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the reviewed v1 payload imports its owner, identities and team memberships', async () => {
  const res = await call('POST', '/v1/import/identities', payload);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.ownerId, 'winston');

  const identities = await call('GET', '/v1/identities');
  assert.equal(identities.json.length, 1 + payload.identities.length);
  const atlas = identities.json.find((i: any) => i.id === 'atlas');
  assert.equal(atlas.teamId, 'creativesites');
  assert.equal(atlas.provenance, 'VERIFIED_OBSERVED');
  assert.ok(Array.isArray(atlas.capabilities) && atlas.capabilities.length > 0);
  assert.ok(atlas.avatarMark);

  const settings = await call('GET', '/v1/settings');
  assert.equal(settings.json.ownerId, 'winston');

  const teams = await call('GET', '/v1/teams');
  assert.equal(teams.json.length, 3);
  assert.ok(teams.json.find((t: any) => t.id === 'creativesites').memberCount > 5);
  assert.ok(teams.json.find((t: any) => t.id === 'meetingmind').memberCount > 5);

  // Running the same import again does not duplicate anything.
  const again = await call('POST', '/v1/import/identities', payload);
  assert.equal(again.status, 200);
  assert.equal((await call('GET', '/v1/identities')).json.length, 1 + payload.identities.length);
});
