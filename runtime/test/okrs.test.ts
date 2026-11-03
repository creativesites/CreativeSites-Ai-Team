import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-okrs-'));
const workRoot = path.join(dir, 'work');
const dbPath = path.join(dir, 'store', 'runtime.db');
fs.mkdirSync(workRoot, { recursive: true });
let rt: RunningRuntime;

const call = async (
  method: string,
  route: string,
  body?: unknown,
  headers: Record<string, string> = {}
) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${rt.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, json };
};

const ok = async (method: string, route: string, body?: unknown) => {
  const res = await call(method, route, body);
  assert.ok(
    res.status >= 200 && res.status < 300,
    `${method} ${route} -> ${res.status}: ${JSON.stringify(res.json)}`
  );
  return res.json as any;
};

before(async () => {
  rt = await startRuntime({
    dbPath,
    workspaceRoots: [workRoot],
    cloneParentDir: workRoot,
    newProjectParentDir: workRoot,
  });
  await ok('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston', role: 'Owner' },
    identities: [
      { id: 'astra', name: 'Astra', role: 'Team Leader', runtime: 'acp' },
      { id: 'kael', name: 'Kael', role: 'Lead Verifier', runtime: 'acp' },
    ],
  });
});

after(async () => {
  await rt?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('1. OKR substrate initializes and lists objectives & measured key results', async () => {
  const data = await ok('GET', '/v1/okrs');
  assert.ok(Array.isArray(data.objectives));
  assert.ok(Array.isArray(data.keyResults));
  assert.ok(data.objectives.length >= 1, 'Should have seeded objectives');

  const obj1 = data.objectives.find((o: any) => o.id === 'OBJ_1');
  assert.ok(obj1);
  assert.equal(obj1.owner_id, 'astra');
});

test('2. Create, update, and cascade progress on objectives and key results', async () => {
  // Create custom objective
  const obj = await ok('POST', '/v1/okrs/objectives', {
    id: 'OBJ_TEST_AI',
    title: 'Achieve Substrate Autonomy Verification',
    description: 'Ensure 100% of agent turns are independently audited without mocks',
    owner_id: 'kael',
    quarter: 'Q4-2026',
    status: 'on_track',
  });
  assert.equal(obj.id, 'OBJ_TEST_AI');
  assert.equal(obj.progress_percent, 0);

  // Add Key Result 1 (target: 100)
  const kr1 = await ok('POST', '/v1/okrs/key-results', {
    id: 'KR_TEST_AI_1',
    objective_id: 'OBJ_TEST_AI',
    title: 'Zero mock regressions in test harness',
    metric_type: 'percentage',
    current_value: 0,
    target_value: 100,
    unit: '%',
  });
  assert.equal(kr1.id, 'KR_TEST_AI_1');
  assert.equal(kr1.progress_percent, 0);

  // Add Key Result 2 (target: 50)
  const kr2 = await ok('POST', '/v1/okrs/key-results', {
    id: 'KR_TEST_AI_2',
    objective_id: 'OBJ_TEST_AI',
    title: 'Independent evidence chain verified',
    metric_type: 'numeric',
    current_value: 25,
    target_value: 50,
    unit: 'proofs',
  });
  assert.equal(kr2.id, 'KR_TEST_AI_2');
  assert.equal(kr2.progress_percent, 50);

  // Parent objective average should be (0 + 50) / 2 = 25% (status: behind or at_risk)
  const afterList = await ok('GET', '/v1/okrs');
  const parentObj = afterList.objectives.find((o: any) => o.id === 'OBJ_TEST_AI');
  assert.equal(parentObj.progress_percent, 25);
  assert.equal(parentObj.status, 'behind');

  // Update KR1 progress: from 0 to 90
  const progressUpdate = await ok('POST', `/v1/okrs/key-results/${kr1.id}/progress`, {
    current_value: 90,
  });
  assert.equal(progressUpdate.keyResult.current_value, 90);
  assert.equal(progressUpdate.keyResult.progress_percent, 90);
  // Objective should now be (90 + 50) / 2 = 70% -> at_risk
  assert.equal(progressUpdate.objective.progress_percent, 70);
  assert.equal(progressUpdate.objective.status, 'at_risk');
});

test('3. Reality Audit endpoint computes substrate truth health score', async () => {
  const audit = await ok('GET', '/v1/okrs/reality-audit');
  assert.equal(typeof audit.healthScore, 'number');
  assert.ok(audit.healthScore >= 0 && audit.healthScore <= 100);
  assert.ok(audit.totalObjectives > 0);
  assert.ok(audit.totalKeyResults > 0);
  assert.ok(audit.lastAuditTs);
});

test('4. Global search finds OKR objectives', async () => {
  const results = await ok('GET', '/v1/search?q=Substrate');
  assert.ok(Array.isArray(results));
  const okrHit = results.find((h: any) => h.kind === 'okr' && h.id === 'OBJ_TEST_AI');
  assert.ok(okrHit, 'Search should find OBJ_TEST_AI under kind okr');
});

test('5. Deleting key results and objectives cleans up relational hierarchy', async () => {
  // Delete KR2
  const delKrRes = await call('DELETE', '/v1/okrs/key-results/KR_TEST_AI_2');
  assert.equal(delKrRes.status, 204);

  // Objective progress should now be only KR1 (90%) -> on_track
  const listAfterKrDel = await ok('GET', '/v1/okrs');
  const parentObj = listAfterKrDel.objectives.find((o: any) => o.id === 'OBJ_TEST_AI');
  assert.equal(parentObj.progress_percent, 90);
  assert.equal(parentObj.status, 'on_track');

  // Delete OBJ_TEST_AI
  const delObjRes = await call('DELETE', '/v1/okrs/objectives/OBJ_TEST_AI');
  assert.equal(delObjRes.status, 204);

  const finalList = await ok('GET', '/v1/okrs');
  assert.ok(!finalList.objectives.some((o: any) => o.id === 'OBJ_TEST_AI'));
  assert.ok(!finalList.keyResults.some((k: any) => k.objective_id === 'OBJ_TEST_AI'));
});
