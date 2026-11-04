import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { openStore, migrate } from '../src/store/db.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';
import { Repo } from '../src/store/repo.ts';
import { jaccard } from '../src/intake/dedupe.ts';
import { applyOverride, triage, type Workflow } from '../src/intake/triage.ts';
import { applyDepartmentMapping } from '../src/intake/departments.ts';
import { DEPARTMENT_MAPPING } from '../scripts/apply-departments.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-intake-'));
const workRoot = path.join(dir, 'work');
fs.mkdirSync(workRoot, { recursive: true });
let rt: RunningRuntime;

const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, json };
};
const ok = async (method: string, route: string, body?: unknown) => {
  const res = await call(method, route, body);
  assert.ok(res.status >= 200 && res.status < 300, `${method} ${route} -> ${res.status}: ${JSON.stringify(res.json)}`);
  return res.json as any;
};
const eventsOf = (type: string) => rt.repo.listEvents({ type, limit: 1000 });

before(async () => {
  rt = await startRuntime({ dbPath: path.join(dir, 'store', 'runtime.db'), workspaceRoots: [workRoot], cloneParentDir: workRoot, newProjectParentDir: workRoot });
  await ok('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston', role: 'Owner' },
    identities: [
      { id: 'vega', name: 'Vega', role: 'CTO', runtime: 'acp' },
      { id: 'kael', name: 'Kael', role: 'QA', runtime: 'acp' },
      { id: 'tessera', name: 'Tessera', role: 'Design', runtime: 'acp' },
    ],
  });
});

after(async () => {
  await rt?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- triage

const FIXTURE: [string, Workflow][] = [
  ['The production API is returning 500s for every request', 'incident'],
  ['Site is down for all customers', 'incident'],
  ['Security: leaked API key found in the repo', 'incident'],
  ['URGENT: checkout fails for EU users', 'incident'],
  ['Database outage since 3am', 'incident'],
  ['Build a booking app from scratch for dog walkers', 'strategic'],
  ['Define the architecture for the new reporting service', 'strategic'],
  ['Plan a new product line for the school market', 'strategic'],
  ['We need a platform for managing client onboarding', 'strategic'],
  ['Rearchitect the notification pipeline', 'strategic'],
  ['Add dark mode to the dashboard', 'feature'],
  ['Design a new onboarding flow for trial users', 'feature'],
  ['Improve search results ranking on the projects page', 'feature'],
  ['Implement CSV export for time reports', 'feature'],
  ['Plan the next sprint', 'feature'],
  ['Fix typo in the README', 'quick'],
  ['Bump lodash to the latest patch version', 'quick'],
  ['Rename the Settings tab to Preferences', 'quick'],
  ['Small copy tweak on the pricing page', 'quick'],
  ['Fix the broken link in the footer', 'quick'],
];

test('triage fixture: 20/20 requests classified as expected, with reasons', () => {
  assert.equal(FIXTURE.length, 20);
  for (const w of ['quick', 'feature', 'strategic', 'incident']) assert.ok(FIXTURE.some(([, x]) => x === w), `fixture covers ${w}`);
  const wrong: string[] = [];
  for (const [text, expected] of FIXTURE) {
    const r = triage(text);
    if (r.workflow !== expected || !r.reason) wrong.push(`${text} -> ${r.workflow} (${r.reason}), expected ${expected}`);
  }
  assert.deepEqual(wrong, []);
  assert.equal(triage('Plan the next sprint').reason, 'default');
});

test('triage override replaces workflow and reason and is attributed', () => {
  const base = triage('Add dark mode to the dashboard');
  const o = applyOverride(base, { workflow: 'strategic', reason: 'touches the design system', by: 'orchestrator' });
  assert.equal(o.workflow, 'strategic');
  assert.equal(o.override, true);
  assert.equal(o.by, 'orchestrator');
  assert.match(o.reason, /touches the design system/);
  assert.throws(() => applyOverride(base, { workflow: 'strategic', reason: '', by: 'x' }));
});

test('jaccard: near-identical text scores >= 0.8, unrelated text does not', () => {
  assert.ok(jaccard('Add dark mode to the dashboard', 'add dark mode to the dashboard!') >= 0.8);
  assert.ok(jaccard('Add dark mode to the dashboard', 'Fix typo in the README') < 0.3);
});

// ---------------------------------------------------------------- intake entry points

test('each entry point source produces exactly one job and one intake.received event', async () => {
  const project = await ok('POST', '/v1/projects', { name: 'Intake Project' });
  const room = await ok('POST', '/v1/rooms', { name: 'intake-proj-room', projectId: project.id });
  const texts: Record<string, string> = {
    home: 'Add a weekly digest email to the dashboard',
    design: 'Design a new empty state for the calendar',
    sessions: 'Rename the Sessions tab to Activity',
    api: 'Implement webhook retries for the bridge',
    agent: 'Bump the vitest dependency to the latest version',
    schedule: 'Improve the nightly report formatting',
  };
  for (const [source, text] of Object.entries(texts)) {
    const jobsBefore = (await ok('GET', '/v1/jobs')).length;
    const evBefore = eventsOf('intake.received').length;
    const res = await call('POST', '/v1/intake', { text, source, sourceRef: `ref-${source}`, projectId: project.id, requestedBy: 'winston' });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.equal(res.json.duplicate, false);
    assert.equal(res.json.job.brief, text, 'raw text is kept verbatim');
    assert.equal(res.json.job.projectId, project.id);
    assert.equal(res.json.job.roomId, room.id, 'job lands in the project room');
    assert.equal(res.json.job.intakeId, res.json.intake.id);
    assert.ok(res.json.job.workflow);
    assert.equal(res.json.intake.source, source);
    assert.equal(res.json.intake.sourceRef, `ref-${source}`);
    assert.equal(res.json.intake.jobId, res.json.job.id);
    assert.equal((await ok('GET', '/v1/jobs')).length, jobsBefore + 1, `${source}: exactly one job`);
    assert.equal(eventsOf('intake.received').length, evBefore + 1, `${source}: exactly one intake.received`);
  }
  const triaged = eventsOf('job.triaged');
  assert.ok(triaged.length >= 6);
  assert.equal((triaged.at(-1)!.payload as any).by, 'rules');
});

test('intake without project or room falls back to the intake room and no project; validation errors are 400', async () => {
  const res = await call('POST', '/v1/intake', { text: 'Improve onboarding copy everywhere', source: 'api', requestedBy: 'winston' });
  assert.equal(res.status, 201);
  assert.equal(res.json.job.projectId, null);
  assert.equal(rt.repo.getRoom(res.json.job.roomId).name, 'intake');
  assert.equal((await call('POST', '/v1/intake', { text: '  ', source: 'api', requestedBy: 'w' })).status, 400);
  assert.equal((await call('POST', '/v1/intake', { text: 'x y z', source: 'carrier-pigeon', requestedBy: 'w' })).status, 400);
  assert.equal((await call('POST', '/v1/intake', { text: 'x y z', source: 'api' })).status, 400);
  assert.equal((await call('POST', '/v1/intake', { text: 'x y z', source: 'api', requestedBy: 'w', projectId: 'nope' })).status, 404);
});

test('duplicate links to the open job, creates no job, records the reason; closed jobs are not matched', async () => {
  const project = await ok('POST', '/v1/projects', { name: 'Dupe Project' });
  const body = { source: 'home', projectId: project.id, requestedBy: 'winston' };
  const first = await ok('POST', '/v1/intake', { ...body, text: 'Add a CSV export button to the invoices table' });
  const jobs = (await ok('GET', '/v1/jobs')).length;
  const received = eventsOf('intake.received').length;
  const triaged = eventsOf('job.triaged').length;
  const second = await call('POST', '/v1/intake', { ...body, text: 'add a CSV export button to the invoices table!' });
  assert.equal(second.status, 201);
  assert.equal(second.json.duplicate, true);
  assert.equal(second.json.job.id, first.job.id, 'returns the existing job');
  assert.equal(second.json.intake.jobId, null);
  assert.equal(second.json.intake.duplicateOfJobId, first.job.id);
  assert.match(second.json.intake.dedupeReason, /similarity/);
  assert.equal((await ok('GET', '/v1/jobs')).length, jobs, 'no new job');
  assert.equal(eventsOf('intake.received').length, received + 1, 'still recorded as received');
  assert.equal(eventsOf('job.triaged').length, triaged, 'a duplicate is not triaged again');

  // different project: not a duplicate
  const other = await ok('POST', '/v1/projects', { name: 'Other Project' });
  const elsewhere = await ok('POST', '/v1/intake', { ...body, projectId: other.id, text: 'Add a CSV export button to the invoices table' });
  assert.equal(elsewhere.duplicate, false);

  // a cancelled job is no longer open
  await ok('POST', `/v1/jobs/${first.job.id}/stage`, { to: 'cancelled', actorId: 'winston', actorKind: 'human' });
  const again = await ok('POST', '/v1/intake', { ...body, text: 'Add a CSV export button to the invoices table' });
  assert.equal(again.duplicate, false);
});

test('override at intake and after the fact is recorded on the job and in job.triaged', async () => {
  const res = await ok('POST', '/v1/intake', {
    text: 'Add audit logging to the admin panel',
    source: 'api',
    requestedBy: 'winston',
    override: { workflow: 'strategic', reason: 'cross-cutting change', by: 'orchestrator' },
  });
  assert.equal(res.job.workflow, 'strategic');
  assert.match(res.job.triageReason, /override by orchestrator: cross-cutting change/);
  assert.equal(res.intake.classification.override, true);
  const ev = eventsOf('job.triaged').find((e) => e.subjectId === res.job.id)!;
  assert.equal((ev.payload as any).override, true);
  assert.equal((ev.payload as any).by, 'orchestrator');

  const later = await ok('POST', `/v1/jobs/${res.job.id}/triage`, { workflow: 'feature', reason: 'council narrowed scope', by: 'orchestrator' });
  assert.equal(later.workflow, 'feature');
  assert.match(later.triageReason, /council narrowed scope/);
  const evs = eventsOf('job.triaged').filter((e) => e.subjectId === res.job.id);
  assert.equal(evs.length, 2);
  assert.equal((evs[1]!.payload as any).previousWorkflow, 'strategic');
  assert.equal((await call('POST', `/v1/jobs/${res.job.id}/triage`, { workflow: 'bogus', reason: 'r', by: 'o' })).status, 400);
});

test('room messages: intake only when the room has intake enabled; @mentions are untouched', async () => {
  const project = await ok('POST', '/v1/projects', { name: 'Room Intake Project' });
  const room = await ok('POST', '/v1/rooms', { name: 'room-intake', projectId: project.id });
  assert.equal(room.intakeEnabled, false, 'default off');
  const post = (body: string, authorKind = 'human') => ok('POST', `/v1/rooms/${room.id}/messages`, { authorId: 'winston', authorKind, body });
  const settle = () => new Promise((r) => setTimeout(r, 150));
  const countJobs = async () => (await ok('GET', `/v1/jobs?roomId=${room.id}`)).length;

  await post('Add keyboard shortcuts to the board');
  await settle();
  assert.equal(await countJobs(), 0, 'off by default');

  const updated = await ok('POST', `/v1/rooms/${room.id}`, { intakeEnabled: true });
  assert.equal(updated.intakeEnabled, true);
  const before = eventsOf('intake.received').length;
  const msg = await post('Add keyboard shortcuts to the board');
  await settle();
  const jobs = await ok('GET', `/v1/jobs?roomId=${room.id}`);
  assert.equal(jobs.length, 1);
  assert.equal(eventsOf('intake.received').length, before + 1);
  const intake = rt.repo.getIntake(jobs[0].intakeId);
  assert.equal(intake.source, 'room');
  assert.equal(intake.sourceRef, msg.id);
  assert.equal(jobs[0].projectId, project.id);

  await post('@vega please review the board spacing issue');
  await post('Agent chatter about something unrelated to intake', 'agent');
  await post('[SCHEDULE: 5m] Check progress on delegated tasks');
  await settle();
  assert.equal(await countJobs(), 1, '@mentions, agent messages and directives do not create intakes');
  assert.equal(eventsOf('intake.received').length, before + 1);
});

// ---------------------------------------------------------------- migration and departments

test('migration v11 preserves row counts, is idempotent, and seeds the six departments once', () => {
  const dbPath = path.join(dir, 'mig', 'runtime.db');
  const old = MIGRATIONS.filter((m) => m.version < 11);
  const db = openStore(dbPath, old);
  const repo = new Repo(db);
  repo.createRoom({ name: 'legacy-room' });
  const room = repo.listRooms().find((r) => r.name === 'legacy-room')!;
  repo.createJob({ roomId: room.id, title: 'Legacy job', createdBy: 'winston' });
  repo.createJob({ roomId: room.id, title: 'Legacy job 2', createdBy: 'winston' });
  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  const before = { jobs: count('jobs'), rooms: count('rooms'), identities: count('identities'), events: count('events') };
  assert.ok(before.jobs === 2 && before.rooms >= 1);
  db.close();

  const upgraded = openStore(dbPath);
  const after = { jobs: count2(upgraded, 'jobs'), rooms: count2(upgraded, 'rooms'), identities: count2(upgraded, 'identities'), events: count2(upgraded, 'events') };
  assert.deepEqual(after, before, 'row counts preserved');
  const job = upgraded.prepare('SELECT workflow, triage_reason, intake_id FROM jobs LIMIT 1').get() as Record<string, unknown>;
  assert.deepEqual({ ...job }, { workflow: null, triage_reason: null, intake_id: null });
  assert.equal((upgraded.prepare('SELECT intake_enabled FROM rooms LIMIT 1').get() as any).intake_enabled, null);
  assert.equal(count2(upgraded, 'departments'), 6);

  // re-running (migrate again, then reopen) changes nothing
  migrate(upgraded);
  upgraded.close();
  const reopened = openStore(dbPath);
  assert.equal(count2(reopened, 'departments'), 6, 'seeded once');
  assert.equal(count2(reopened, 'jobs'), before.jobs);
  const ids = (reopened.prepare('SELECT id FROM departments ORDER BY id').all() as { id: string }[]).map((r) => r.id);
  assert.deepEqual(ids, ['design', 'engineering', 'operations', 'planning-strategy', 'platform-runtime', 'quality-verification']);
  assert.equal((reopened.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 11").get() as any).n, 1);
  reopened.close();
});

const count2 = (db: ReturnType<typeof openStore>, t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

test('applyDepartmentMapping: encodes 34 agents, maps existing identities, sets leads, is idempotent', () => {
  assert.equal(Object.keys(DEPARTMENT_MAPPING).length, 34);
  const first = applyDepartmentMapping(rt.repo, DEPARTMENT_MAPPING);
  assert.deepEqual(first.changed.map((c) => c.id).sort(), ['kael', 'tessera', 'vega']);
  assert.equal(first.missing.length, 31);
  const vega = rt.repo.getIdentity('vega');
  assert.equal(vega.departmentId, 'engineering');
  assert.equal(vega.seniority, 'lead');
  assert.equal(rt.repo.getIdentity('tessera').departmentId, 'design');
  assert.equal(rt.repo.getIdentity('tessera').seniority, 'member');
  assert.equal(rt.repo.getIdentity('kael').departmentId, 'quality-verification');
  const depts = rt.repo.listDepartments();
  assert.equal(depts.find((d) => d.id === 'engineering')!.leadIdentityId, 'vega');
  assert.equal(depts.find((d) => d.id === 'quality-verification')!.leadIdentityId, 'kael');

  const second = applyDepartmentMapping(rt.repo, DEPARTMENT_MAPPING);
  assert.equal(second.changed.length, 0);
  assert.deepEqual(second.unchanged.sort(), ['kael', 'tessera', 'vega']);
  assert.throws(() => applyDepartmentMapping(rt.repo, { vega: { department: 'nonsense' } }));
});

test('GET /v1/departments lists the six departments', async () => {
  const list = await ok('GET', '/v1/departments');
  assert.equal(list.length, 6);
});
