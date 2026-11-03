import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-gates-'));
let rt: RunningRuntime;
const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, { method, headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as any };
};

before(async () => {
  rt = await startRuntime({ dbPath: path.join(dir, 'runtime.db') });
  await call('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston' },
    identities: [{ id: 'builder', name: 'Builder' }, { id: 'kael', name: 'Kael' }],
  });
});
after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('C7: a criterion covered by a verification-required task needs VERIFIED evidence before approve', async () => {
  const room = (await call('POST', '/v1/rooms', { name: 'gates' })).json;
  const job = (await call('POST', '/v1/jobs', { roomId: room.id, title: 'Gate job', createdBy: 'winston' })).json;
  await call('POST', `/v1/jobs/${job.id}/stage`, { to: 'plan', actorId: 'winston' });
  const sub = await call('POST', `/v1/jobs/${job.id}/plan/submit`, {
    actorId: 'winston',
    summary: 'one task',
    risk: 'low',
    criteria: ['Login works'],
    tasks: [{ key: 't1', title: 'Fix login', assigneeId: 'builder', verificationRequired: true, criteriaRefs: [0] }],
  });
  assert.ok(sub.status < 300, JSON.stringify(sub.json));
  const detail = (await call('GET', `/v1/jobs/${job.id}`)).json;
  const crit = detail.criteria.find((c: any) => c.text === 'Login works');
  assert.ok(crit.taskIds.length === 1, 'criterion linked to the task');

  // Jump to verify (owner force) and record OBSERVED evidence for the criterion.
  for (const to of ['build', 'verify']) assert.equal((await call('POST', `/v1/jobs/${job.id}/stage`, { to, actorId: 'winston', force: true })).status, 200);
  const ev = (await call('POST', `/v1/jobs/${job.id}/evidence`, { kind: 'test', class: 'OBSERVED', summary: 'login test passed', criterionId: crit.id, recordedBy: 'runtime', recordedByKind: 'system' })).json;

  const blocked = await call('POST', `/v1/jobs/${job.id}/stage`, { to: 'approve', actorId: 'winston' });
  assert.equal(blocked.status, 409);
  assert.match(blocked.json.error, /needs independent verification/);

  const verified = await call('POST', `/v1/evidence/${ev.id}/verify`, { verifiedBy: 'kael' });
  assert.ok(verified.status < 300, JSON.stringify(verified.json));
  const ok = await call('POST', `/v1/jobs/${job.id}/stage`, { to: 'approve', actorId: 'winston' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
});
