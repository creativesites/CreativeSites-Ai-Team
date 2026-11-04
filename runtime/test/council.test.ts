import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { computeCouncil } from '../src/council.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-council-'));
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

before(async () => {
  rt = await startRuntime({ dbPath: path.join(dir, 'runtime.db') });
  await call('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston' },
    teams: [{ id: 'creativesites', name: 'CreativeSites' }],
    identities: [
      { id: 'atlas', name: 'Atlas', teamId: 'creativesites', approvalLevel: 'lead' },
      { id: 'kael', name: 'Kael', teamId: 'creativesites' },
      { id: 'iris', name: 'Iris', teamId: 'creativesites' },
      { id: 'lyra', name: 'Lyra', teamId: 'creativesites' },
    ],
  });
  const room = await call('POST', '/v1/rooms', { name: 'council-room' });
  const job = await call('POST', '/v1/jobs', {
    roomId: room.json.id,
    title: 'Fix early logout',
    brief: 'Fix the refresh timer.',
    createdBy: 'winston',
    criteria: ['Users stay signed in', 'Tests pass'],
  });
  jobId = job.json.id;
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const OPTIONS = [
  { id: 'A', label: 'Re-arm the refresh timer' },
  { id: 'B', label: 'Fix the shared helper' },
  { id: 'C', label: 'Move to server-side sessions' },
];
const SEATS = [
  { seat: 'Architect', question: 'Is this the right shape?', weight: 3, identityId: 'atlas' },
  { seat: 'Skeptic', question: 'What breaks?', weight: 2, identityId: 'iris' },
  { seat: 'Verifier', question: 'How do we prove it?', weight: 3, identityId: 'kael' },
];

const card = (seat: string, scores: Record<string, number>, extra: Record<string, unknown> = {}) => ({
  seat,
  scores,
  pillar: 8,
  confidence: 8,
  ...extra,
});

test('the Chair computes scores only from the cards', async () => {
  const created = await call('POST', `/v1/jobs/${jobId}/councils`, { mode: 'quick', options: OPTIONS, seats: SEATS });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const councilId = created.json.id;
  for (const [seat, scores] of [
    ['Architect', { A: 8, B: 7, C: 3 }],
    ['Skeptic', { A: 6, B: 7, C: 4 }],
    ['Verifier', { A: 8, B: 6, C: 3 }],
  ] as const) {
    const added = await call('POST', `/v1/councils/${councilId}/cards`, card(seat, scores));
    assert.equal(added.status, 201, JSON.stringify(added.json));
  }
  const verdict = await call('POST', `/v1/councils/${councilId}/verdict`);
  assert.equal(verdict.status, 201, JSON.stringify(verdict.json));
  assert.equal(verdict.json.label, 'Go');
  assert.equal(verdict.json.support, 7.5);
  assert.equal(verdict.json.spread, 2);
  assert.equal(verdict.json.rules.disasterCapApplied, false);
  assert.equal(verdict.json.rules.tooFastAgreement, false);
  const scoreA = verdict.json.payload.scores.find((s: any) => s.id === 'A');
  assert.equal(scoreA.score, 7.5);
  assert.match(scoreA.formula, /\/ 8/);
});

test('the disaster cap, cannot-undo check and too-fast rule change the verdict', async () => {
  const created = await call('POST', `/v1/jobs/${jobId}/councils`, { options: OPTIONS, seats: SEATS });
  const councilId = created.json.id;
  await call('POST', `/v1/councils/${councilId}/cards`, card('Architect', { A: 9, B: 7, C: 2 }));
  await call('POST', `/v1/councils/${councilId}/cards`, card('Skeptic', { A: 8, B: 7, C: 3 }, { ruin: { A: 'likely' }, reversible: false }));
  await call('POST', `/v1/councils/${councilId}/cards`, card('Verifier', { A: 9, B: 6, C: 3 }));
  const verdict = await call('POST', `/v1/councils/${councilId}/verdict`);
  assert.equal(verdict.json.rules.disasterCapApplied, true);
  assert.equal(verdict.json.label, 'Reshape');
  assert.ok(verdict.json.conditions.some((c: string) => /disaster/i.test(c)));
  assert.ok(verdict.json.conditions.some((c: string) => /rollback|cannot be undone/i.test(c)));

  const fast = await call('POST', `/v1/jobs/${jobId}/councils`, { options: OPTIONS, seats: SEATS });
  const fastId = fast.json.id;
  for (const seat of ['Architect', 'Skeptic', 'Verifier']) {
    await call('POST', `/v1/councils/${fastId}/cards`, card(seat, { A: 8, B: 7, C: 2 }));
  }
  const fastVerdict = await call('POST', `/v1/councils/${fastId}/verdict`);
  assert.equal(fastVerdict.json.rules.tooFastAgreement, true);
  assert.ok(fastVerdict.json.conditions.some((c: string) => /strongest alternative/i.test(c)));
});

test('accepting a verdict writes the plan and its tasks', async () => {
  const created = await call('POST', `/v1/jobs/${jobId}/councils`, { options: OPTIONS, seats: SEATS });
  const councilId = created.json.id;
  await call('POST', `/v1/councils/${councilId}/cards`, card('Architect', { A: 8, B: 7, C: 3 }));
  await call('POST', `/v1/councils/${councilId}/cards`, card('Skeptic', { A: 7, B: 7, C: 3 }));
  await call('POST', `/v1/councils/${councilId}/cards`, card('Verifier', { A: 8, B: 6, C: 3 }));
  const verdict = await call('POST', `/v1/councils/${councilId}/verdict`);
  const accepted = await call('POST', `/v1/councils/${councilId}/accept`, {
    actorId: 'winston',
    tasks: [
      { title: 'Confirm the helper callers', assigneeId: 'iris', checkCommand: 'rg "refresh" src', gate: 'before merge' },
      { title: 'Re-arm the timer and test', assigneeId: 'atlas', checkCommand: 'npm test -- auth', gate: 'must be verified' },
    ],
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.json));
  assert.equal(accepted.json.status, 'accepted');
  assert.equal(accepted.json.verdict.payload.topId, 'A');

  const job = await call('GET', `/v1/jobs/${jobId}`);
  assert.match(job.json.plan.summary, /Re-arm/);
  assert.equal(job.json.plan.councilId, councilId);
  assert.equal(job.json.tasks.length, 2);
  assert.equal(job.json.tasks[0].assigneeId, 'iris');

  // The plan now unlocks the lifecycle: brief -> plan -> build.
  assert.equal((await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'plan', actorId: 'winston' })).status, 200);
  assert.equal((await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'build', actorId: 'winston' })).status, 200);
});

test('cards are validated and a council that is not running cannot take more', async () => {
  const created = await call('POST', `/v1/jobs/${jobId}/councils`, { options: OPTIONS, seats: SEATS });
  const councilId = created.json.id;
  const badScore = await call('POST', `/v1/councils/${councilId}/cards`, card('Architect', { A: 11, B: 7, C: 3 }));
  assert.equal(badScore.status, 400);
  const badSeat = await call('POST', `/v1/councils/${councilId}/cards`, card('Nobody', { A: 8, B: 7, C: 3 }));
  assert.equal(badSeat.status, 400);
  await call('POST', `/v1/councils/${councilId}/cards`, card('Architect', { A: 8, B: 7, C: 3 }));
  await call('POST', `/v1/councils/${councilId}/verdict`);
  const afterVerdict = await call('POST', `/v1/councils/${councilId}/cards`, card('Skeptic', { A: 6, B: 7, C: 3 }));
  assert.equal(afterVerdict.status, 409);
});

test('the pure scorer is deterministic and sorted', () => {
  const result = computeCouncil(OPTIONS, SEATS, [
    { seat: 'Architect', identityId: null, scores: { A: 8, B: 7, C: 3 }, pillar: 8, confidence: 8, ruin: { A: 'none', B: 'none', C: 'none' }, reversible: true, argument: null },
    { seat: 'Skeptic', identityId: null, scores: { A: 6, B: 7, C: 4 }, pillar: 6, confidence: 6, ruin: { A: 'none', B: 'none', C: 'none' }, reversible: true, argument: 'B is safer' },
    { seat: 'Verifier', identityId: null, scores: { A: 8, B: 6, C: 3 }, pillar: 8, confidence: 8, ruin: { A: 'none', B: 'none', C: 'none' }, reversible: true, argument: null },
  ]);
  assert.deepEqual(result.scores.map((s) => s.id), ['A', 'B', 'C']);
  assert.equal(result.objection?.text, 'B is safer');
});

test('roast-room roster, bundled example sessions, and the scripted multi-round runner (labelled simulation) work end-to-end', async () => {
  const roster = await call('GET', '/v1/councils/roster');
  assert.equal(roster.status, 200);
  assert.ok(roster.json.seats.length >= 21);
  assert.ok(roster.json.seats.some((s: any) => s.key === 'themis' && s.boardGroup === 'myaos'));
  assert.ok(roster.json.seats.some((s: any) => s.key === 'bezos' && s.boardGroup === 'operators'));

  const sessions = await call('GET', '/v1/councils/sessions');
  assert.equal(sessions.status, 200);
  assert.ok(sessions.json.sessions.some((s: any) => s.id === '2026-10-23-myaos-desktop-direction'));

  const exampleSession = await call('GET', '/v1/councils/sessions/2026-10-23-myaos-desktop-direction');
  assert.equal(exampleSession.status, 200);
  assert.ok(exampleSession.json.events.some((e: any) => e.type === 'setup'));
  assert.ok(exampleSession.json.events.some((e: any) => e.type === 'cruxes'));
  assert.ok(exampleSession.json.events.some((e: any) => e.type === 'verdict'));

  // The scripted runner is a simulation (gap audit C3): template cards, no agent woken.
  const started = await call('POST', `/v1/jobs/${jobId}/councils/run`, {
    prompt: 'Should we ship the Roast-Room council stage with 4-frame talking heads now?',
    mode: 'full',
    boardGroup: 'myaos',
  });
  assert.equal(started.status, 201);
  const runCouncilId = started.json.council.id;
  for (let i = 0; i < 40; i++) {
    const check = await call('GET', `/v1/councils/${runCouncilId}`);
    if (check.json.status === 'verdict') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const finished = await call('GET', `/v1/councils/${runCouncilId}`);
  assert.equal(finished.json.status, 'verdict');
  assert.ok(finished.json.cards.length >= 21); // 7 seats * 3 rounds
  assert.ok(finished.json.cruxes.length >= 1);
  assert.ok(finished.json.verdict.payload.why.length >= 3);
  assert.ok(finished.json.verdict.payload.tasks.length >= 2);
  assert.equal(finished.json.runMode, 'simulation');
  assert.ok(finished.json.cards.every((c: any) => c.simulated === true));
});
