import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { readinessCheck, selectCouncil } from '../src/council/select.ts';
import { migrate, openStore } from '../src/store/db.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';
import { Repo } from '../src/store/repo.ts';

// WP3: the agent-driven Planning Council, driven end to end by the fake ACP agent.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-council-live-'));
const fixture = new URL('./fixtures/fake-acp-agent.mjs', import.meta.url).pathname;
let rt: RunningRuntime;
let roomId = '';

const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const waitFor = async <T>(fn: () => Promise<T | null>, timeoutMs = 25_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('timed out waiting for condition');
};

const councilIn = (id: string, statuses: string[]) =>
  waitFor(async () => {
    const c = await call('GET', `/v1/councils/${id}`);
    return statuses.includes(c.json?.status) ? c.json : null;
  });

async function newJob(title: string, brief: string): Promise<string> {
  const job = await call('POST', '/v1/jobs', { roomId, title, brief, createdBy: 'winston', criteria: ['The plan is agreed'] });
  assert.equal(job.status, 201, JSON.stringify(job.json));
  return job.json.id as string;
}

before(async () => {
  rt = await startRuntime({ dbPath: path.join(dir, 'runtime.db'), worktreeRoot: path.join(dir, 'wt'), artifactsDir: path.join(dir, 'art'), councilTickMs: 100 });
  await call('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston' },
    teams: [{ id: 'cs', name: 'CS' }],
    identities: [
      { id: 'orion', name: 'Orion', teamId: 'cs', role: 'Orchestrator' },
      { id: 'pax', name: 'Pax', teamId: 'cs', role: 'Strategist' },
      { id: 'vera', name: 'Vera', teamId: 'cs', role: 'Verifier' },
    ],
  });
  await call('POST', '/v1/adapters/fake', { command: process.execPath, args: [fixture], enabled: true });
  for (const id of ['orion', 'pax', 'vera']) {
    const r = await call('POST', `/v1/identities/${id}`, { adapterId: 'fake' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  rt.repo.applyDepartmentMapping({ pax: { department: 'planning-strategy' }, orion: { department: 'planning-strategy', seniority: 'lead' } });
  const room = await call('POST', '/v1/rooms', { name: 'council-live' });
  roomId = room.json.id;
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('selection prefers Planning & Strategy, then domain matches, and excludes rate-limited and blocked identities with reasons', () => {
  const db = openStore(':memory:');
  const repo = new Repo(db);
  repo.createIdentity({ id: 'plan1', name: 'Plan One', role: 'Planner' });
  repo.createIdentity({ id: 'plan2', name: 'Plan Two', role: 'Strategist' });
  repo.createIdentity({ id: 'sec', name: 'Sec', role: 'Security engineer', capabilities: ['security', 'auth'] });
  repo.createIdentity({ id: 'ui', name: 'Ui', role: 'Designer', capabilities: ['typography'] });
  repo.createIdentity({ id: 'tired', name: 'Tired', role: 'Planner' });
  repo.createIdentity({ id: 'blk', name: 'Blocked', role: 'Planner' });
  repo.applyDepartmentMapping({ plan1: { department: 'planning-strategy' }, plan2: { department: 'planning-strategy' }, tired: { department: 'planning-strategy' }, blk: { department: 'planning-strategy' } });
  repo.setIdentityRateLimit('tired', 'session limit', new Date(Date.now() + 3600_000).toISOString());
  const unavailable = readinessCheck(repo, (a) => (a.id === 'blk' ? 'adapter fake-missing is not installed' : null));
  const sel = selectCouncil(repo, { workflow: 'feature', title: 'Harden auth tokens', brief: 'Rotate the security tokens used by auth.' }, unavailable);
  assert.equal(sel.skipped, null);
  const ids = sel.seats.map((s) => s.identityId);
  assert.deepEqual(ids.slice(0, 2).sort(), ['plan1', 'plan2'], 'planning-strategy members come first');
  assert.ok(ids.includes('sec'), 'the security specialist matches the request');
  assert.ok(!ids.includes('ui'), 'no domain match, not needed');
  assert.ok(sel.seats.length >= 2 && sel.seats.length <= 4);
  assert.ok(sel.seats.find((s) => s.identityId === 'plan1')!.reasons.some((r) => /Planning & Strategy/.test(r)));
  assert.ok(sel.seats.find((s) => s.identityId === 'sec')!.reasons.some((r) => /security|auth/.test(r)));
  assert.match(sel.excluded.find((e) => e.identityId === 'tired')!.reason, /rate-limited/);
  assert.match(sel.excluded.find((e) => e.identityId === 'blk')!.reason, /not installed/);
  const quick = selectCouncil(repo, { workflow: 'quick', title: 'Typo' }, unavailable);
  assert.match(quick.skipped!, /Quick workflow/);
  assert.equal(quick.seats.length, 0);
  db.close();
});

test('a quick job does not convene a council', async () => {
  const jobId = await newJob('Fix a typo', 'One word.');
  rt.repo.overrideTriage(jobId, { workflow: 'quick', reason: 'trivial', by: 'winston' });
  const res = await call('POST', `/v1/jobs/${jobId}/council`, { mode: 'live' });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.council, null);
  assert.match(res.json.skipped, /Quick workflow/);
  assert.equal((await call('GET', `/v1/jobs/${jobId}/councils`)).json.length, 0);
});

test('a live council: seats are real sessions, scores are what the agents submitted, dissent is kept, and accepting yields a plan with councilId', async () => {
  const jobId = await newJob(
    'Choose the session store',
    [
      'Decide how sessions are stored.',
      'fake-card pax r1: A=8 B=5 C=2 vote=endorse',
      'fake-card vera r1: A=4 B=7 C=3 vote=dissent',
      'fake-card pax r2: A=8 B=6 C=2 vote=endorse',
      'fake-card vera r2: A=5 B=7 C=2 vote=dissent',
    ].join('\n')
  );
  const started = await call('POST', `/v1/jobs/${jobId}/council`, { mode: 'live', seats: ['pax', 'vera'] });
  assert.equal(started.status, 201, JSON.stringify(started.json));
  const id = started.json.council.id as string;
  assert.equal(started.json.council.runMode, 'live');
  assert.deepEqual(started.json.selection.seats.map((s: any) => s.identityId), ['pax', 'vera']);
  assert.ok(started.json.selection.seats[0].reasons.some((r: string) => /owner/.test(r)));

  const done = await councilIn(id, ['verdict']);
  assert.equal(done.cards.length, 4);
  for (const c of done.cards) {
    assert.ok(c.sessionId, 'every card names the session that wrote it');
    assert.equal(c.simulated, false);
    const session = (await call('GET', `/v1/sessions/${c.sessionId}`)).json;
    assert.equal(session.agentId, c.identityId);
  }
  assert.equal(new Set(done.cards.map((c: any) => c.sessionId)).size, 4, 'one session per seat per round');
  const card = (seat: string, round: number) => done.cards.find((c: any) => c.seat === seat && c.round === round).result;
  assert.deepEqual(card('pax', 1).scores, { A: 8, B: 5, C: 2 });
  assert.deepEqual(card('vera', 1).scores, { A: 4, B: 7, C: 3 });
  assert.deepEqual(card('vera', 2).scores, { A: 5, B: 7, C: 2 });
  assert.equal(card('vera', 2).vote, 'dissent');
  assert.equal(card('vera', 2).argument, 'fake vera round 2 rationale');

  // Round 1 is independent; round 2 shows the round-1 cards.
  const promptOf = async (sessionId: string) =>
    ((await call('GET', `/v1/sessions/${sessionId}/transcript`)).json as any[]).find((e) => e.kind === 'prompt')?.payload?.text ?? '';
  const r1 = await promptOf(done.cards.find((c: any) => c.seat === 'vera' && c.round === 1).sessionId);
  const r2 = await promptOf(done.cards.find((c: any) => c.seat === 'vera' && c.round === 2).sessionId);
  assert.doesNotMatch(r1, /fake pax round 1 rationale/);
  assert.match(r2, /fake pax round 1 rationale/);

  // Scoring is council.ts over the final round, weighted (pax 3 planning-strategy, vera 2).
  const v = done.verdict.payload;
  assert.equal(v.runMode, 'live');
  assert.equal(v.scoredRound, 2);
  assert.equal(v.scores.find((s: any) => s.id === 'A').score, 6.8);
  assert.equal(v.scores.find((s: any) => s.id === 'B').score, 6.4);
  assert.equal(v.topId, 'A');
  assert.deepEqual(v.rejectedOptions.map((s: any) => s.id).sort(), ['B', 'C']);
  assert.equal(v.minority.seat, 'vera');
  assert.equal(v.minority.quote, 'fake vera round 2 rationale');
  assert.match(v.minority.would_have_to_be_true, /cheaper/);
  assert.equal(v.dissents.length, 1);
  assert.deepEqual(v.absent, []);
  assert.equal(v.tasks, undefined, 'no tasks are invented');

  // Hand-written cards cannot enter a live council.
  assert.equal((await call('POST', `/v1/councils/${id}/cards`, { seat: 'pax', scores: { A: 1, B: 1, C: 1 }, pillar: 1 })).status, 409);

  const accepted = await call('POST', `/v1/councils/${id}/accept`, { actorId: 'winston', tasks: [{ title: 'Move sessions to the store', assigneeId: 'pax', checkCommand: 'npm test' }] });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.json));
  assert.equal(accepted.json.status, 'accepted');
  const job = (await call('GET', `/v1/jobs/${jobId}`)).json;
  assert.equal(job.plan.councilId, id);
  assert.equal(job.plan.submittedBy, 'winston');
  assert.ok(job.plan.risks.some((r: any) => /Dissent by vera/.test(r.text)), 'dissent travels into the plan as a risk');
  assert.equal(job.tasks.length, 1);
  assert.equal(job.tasks[0].title, 'Move sessions to the store');

  const live = (await call('GET', `/v1/jobs/${jobId}/councils?runMode=live`)).json;
  assert.deepEqual(live.map((c: any) => c.id), [id]);
});

test('a seat that never submits is recorded absent and no card is fabricated', async () => {
  const jobId = await newJob('Pick a queue', 'Choose the queue.\nfake-card pax r*: A=7 B=6 C=1 vote=endorse');
  const started = await call('POST', `/v1/jobs/${jobId}/council`, { mode: 'live', seats: ['pax', 'vera'], rounds: 1 });
  assert.equal(started.status, 201, JSON.stringify(started.json));
  const done = await councilIn(started.json.council.id, ['verdict']);
  assert.deepEqual(done.cards.map((c: any) => c.seat), ['pax']);
  assert.equal(done.absentSeats.length, 1);
  assert.equal(done.absentSeats[0].seat, 'vera');
  assert.match(done.absentSeats[0].reason, /without submitting a card/);
  assert.equal(done.verdict.payload.absent[0].seat, 'vera');
  // Only the present seat is weighed: the score is exactly pax's.
  assert.equal(done.verdict.payload.scores.find((s: any) => s.id === 'A').score, 7);
  assert.equal(done.verdict.payload.minority, undefined, 'no dissent, no invented minority');
});

test('a round closes at its timeout; seats still working are absent and an empty council produces no verdict', async () => {
  const jobId = await newJob('Slow council', 'Think hard.\nmyaos-slow-ms: 20000');
  const started = await call('POST', `/v1/jobs/${jobId}/council`, { mode: 'live', seats: ['pax', 'vera'], rounds: 1 });
  const id = started.json.council.id as string;
  await waitFor(async () => {
    const c = (await call('GET', `/v1/councils/${id}`)).json;
    return Object.values(c.liveState.sessions).every((r: any) => r['1']) ? c : null;
  });
  await rt.councils.tick(new Date(Date.now() + 5 * 60_000));
  assert.equal((await call('GET', `/v1/councils/${id}`)).json.status, 'running', 'not yet due (default 20 minutes)');
  await rt.councils.tick(new Date(Date.now() + 21 * 60_000));
  const c = (await call('GET', `/v1/councils/${id}`)).json;
  assert.equal(c.status, 'cancelled');
  assert.equal(c.cards.length, 0);
  assert.equal(c.verdict, null);
  assert.deepEqual(c.absentSeats.map((a: any) => a.seat).sort(), ['pax', 'vera']);
  assert.ok(c.absentSeats.every((a: any) => /deadline \(20 min\)/.test(a.reason)));
});

test('the synthesiser seat (the Orchestrator) submits the plan through plan_submit and it records councilId', async () => {
  const jobId = await newJob('Plan the launch', 'Launch plan.\nfake-card pax r*: A=8 B=4 C=1 vote=endorse\nfake-card orion r*: A=7 B=5 C=2 vote=amend');
  const started = await call('POST', `/v1/jobs/${jobId}/council`, { mode: 'live', seats: ['pax', 'orion'], rounds: 1 });
  const id = started.json.council.id as string;
  await councilIn(id, ['verdict']);
  const asked = await call('POST', `/v1/councils/${id}/accept`, { actorId: 'winston', synthesise: true });
  assert.equal(asked.status, 200, JSON.stringify(asked.json));
  assert.equal(asked.json.liveState.synthesiser.identityId, 'orion');
  assert.match(asked.json.liveState.synthesiser.reason, /Orchestrator/);
  const accepted = await councilIn(id, ['accepted']);
  assert.equal(accepted.liveState.synthesiser.status, 'submitted');
  const job = (await call('GET', `/v1/jobs/${jobId}`)).json;
  assert.equal(job.plan.councilId, id);
  assert.equal(job.plan.submittedBy, 'orion');
  assert.equal(job.tasks[0].title, 'Fake synthesised task');
});

test('simulation runs are labelled, every card is simulated, they stay out of live queries and cannot become a plan', async () => {
  const jobId = await newJob('Demo council', 'Show the room.');
  const started = await call('POST', `/v1/jobs/${jobId}/council`, { mode: 'simulation', prompt: 'Should we demo?' });
  assert.equal(started.status, 201, JSON.stringify(started.json));
  assert.equal(started.json.runMode, 'simulation');
  const done = await councilIn(started.json.council.id, ['verdict']);
  assert.equal(done.runMode, 'simulation');
  assert.ok(done.cards.length > 0);
  assert.ok(done.cards.every((c: any) => c.simulated === true && c.sessionId === null));
  assert.match(done.verdict.payload.disclaimer, /SIMULATION/);
  assert.equal(done.events.find((e: any) => e.type === 'setup').runMode, 'simulation');
  assert.equal((await call('GET', `/v1/jobs/${jobId}/councils?runMode=live`)).json.length, 0);
  assert.equal((await call('GET', `/v1/jobs/${jobId}/councils?runMode=simulation`)).json.length, 1);
  const accept = await call('POST', `/v1/councils/${done.id}/accept`, { actorId: 'winston', tasks: [{ title: 'x' }] });
  assert.equal(accept.status, 409);
  assert.match(accept.json.error, /simulation/);
  const sessions = (await call('GET', '/v1/councils/sessions')).json.sessions;
  assert.equal(sessions.find((s: any) => s.id === done.id).runMode, 'simulation');
});

test('v20 migration is idempotent, additive, and labels earlier scripted councils as simulation', () => {
  const file = path.join(dir, 'pre-v20.db');
  const old = openStore(file, MIGRATIONS.filter((m) => m.version < 20));
  old.exec('PRAGMA foreign_keys = OFF');
  old.prepare("INSERT INTO councils (id, job_id, mode, status, created_at, events) VALUES ('council_old', 'job_x', 'full', 'verdict', 'now', '[{\"type\":\"setup\"}]')").run();
  old.prepare("INSERT INTO councils (id, job_id, mode, status, created_at) VALUES ('council_manual', 'job_x', 'quick', 'running', 'now')").run();
  old.prepare("INSERT INTO council_cards (id, council_id, round, seat, payload, created_at) VALUES ('card_old', 'council_old', 1, 'themis', '{}', 'now')").run();
  old.close();
  const db = openStore(file);
  const count = () => (db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n;
  const before = count();
  migrate(db);
  migrate(db);
  assert.equal(count(), before);
  assert.ok((db.prepare('SELECT version FROM schema_migrations WHERE version = 20').get() as any));
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  for (const c of ['run_mode', 'selection', 'live_state', 'absent_seats']) assert.ok(cols('councils').includes(c), c);
  for (const c of ['session_id', 'simulated']) assert.ok(cols('council_cards').includes(c), c);
  assert.equal((db.prepare("SELECT run_mode FROM councils WHERE id = 'council_old'").get() as any).run_mode, 'simulation');
  assert.equal((db.prepare("SELECT run_mode FROM councils WHERE id = 'council_manual'").get() as any).run_mode, null);
  assert.equal((db.prepare("SELECT simulated FROM council_cards WHERE id = 'card_old'").get() as any).simulated, 1);
  db.close();
});
