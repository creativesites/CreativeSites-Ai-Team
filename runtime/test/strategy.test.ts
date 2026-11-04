import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { migrate, openStore } from '../src/store/db.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-strategy-'));
const workRoot = path.join(dir, 'work');
const dbPath = path.join(dir, 'store', 'runtime.db');
fs.mkdirSync(workRoot, { recursive: true });
let rt: RunningRuntime;
let side: DatabaseSync; // fixture access: milestones, VERIFIED evidence, legacy rows
let roomId: string;
let projectId: string;
let legacyBefore = '';

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

const legacyChecksum = () => {
  const rows = side.prepare('SELECT * FROM project_tasks ORDER BY id').all();
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
};

let seq = 0;
const newJob = async (title: string, extra: Record<string, unknown> = {}) =>
  ok('POST', '/v1/jobs', { roomId, title, createdBy: 'winston', projectId, ...extra });

const addVerifiedEvidence = (jobId: string) => {
  side
    .prepare(
      "INSERT INTO evidence (id, job_id, kind, class, summary, recorded_by, created_at) VALUES (?, ?, 'test', 'VERIFIED', 'verified by fixture', 'kael', ?)"
    )
    .run(`ev_${++seq}_${jobId}`, jobId, new Date().toISOString());
};
const addEvidence = (jobId: string, cls: string) => {
  side
    .prepare("INSERT INTO evidence (id, job_id, kind, class, summary, recorded_by, created_at) VALUES (?, ?, 'test', ?, 'fixture', 'astra', ?)")
    .run(`ev_${++seq}_${jobId}`, jobId, cls, new Date().toISOString());
};
const finish = async (jobId: string) => {
  for (const to of ['plan', 'build', 'verify', 'approve', 'done']) {
    await ok('POST', `/v1/jobs/${jobId}/stage`, { to, actorId: 'winston', force: true });
  }
};
const mkKr = async (id: string, extra: Record<string, unknown> = {}) => {
  await ok('POST', '/v1/okrs/objectives', { id: `OBJ_${id}`, title: `Objective ${id}`, quarter: 'Q4-2026' });
  return ok('POST', '/v1/okrs/key-results', { id, objective_id: `OBJ_${id}`, title: `KR ${id}`, kind: 'evidence', ...extra });
};
const kr = async (id: string) => (await ok('GET', '/v1/okrs')).keyResults.find((k: any) => k.id === id);
const entries = (id: string) => ok('GET', `/v1/okrs/key-results/${id}/progress`);

before(async () => {
  // legacy rows exist before the runtime opens the store at v19 (checksum compares across the migration)
  const old = openStore(dbPath, MIGRATIONS.filter((m) => m.version < 19));
  const now = new Date().toISOString();
  for (let i = 0; i < 5; i++) {
    old
      .prepare("INSERT INTO project_tasks (id, title, status, priority, created_at, updated_at) VALUES (?, ?, 'open', 'medium', ?, ?)")
      .run(`legacy_${i}`, `Legacy task ${i}`, now, now);
  }
  legacyBefore = crypto.createHash('sha256').update(JSON.stringify(old.prepare('SELECT * FROM project_tasks ORDER BY id').all())).digest('hex');
  old.close();

  rt = await startRuntime({ dbPath, workspaceRoots: [workRoot], cloneParentDir: workRoot, newProjectParentDir: workRoot });
  await ok('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston', role: 'Owner' },
    identities: [
      { id: 'astra', name: 'Astra', role: 'Team Leader', runtime: 'acp' },
      { id: 'kael', name: 'Kael', role: 'Lead Verifier', runtime: 'acp' },
    ],
  });
  side = new DatabaseSync(dbPath);
  side.exec('PRAGMA busy_timeout = 5000');
  const room = await ok('POST', '/v1/rooms', { name: 'strategy-room' });
  roomId = room.id;
  const project = rt.repo.createProject({ name: 'Strategy Project' } as any);
  projectId = project.id;
});

after(async () => {
  side?.close();
  await rt?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('v19 keeps legacy project_tasks byte-identical and adds the columns', () => {
  assert.equal(legacyChecksum(), legacyBefore);
  const cols = (t: string) => (side.prepare(`PRAGMA table_info(${t})`).all() as any[]).map((c) => c.name);
  assert.ok(['kind', 'source', 'weight'].every((c) => cols('okr_key_results').includes(c)));
  assert.ok(cols('jobs').includes('archived_at') && cols('jobs').includes('kr_weight'));
  assert.ok(cols('tasks').includes('archived_at'));
  assert.ok(cols('okr_progress_entries').includes('provenance'));
});

test('v19 is idempotent and defaults existing KRs to manual', () => {
  const before = (side.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as any).n;
  const db = openStore(dbPath);
  migrate(db);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 19').get() as any).n, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as any).n, before);
  db.close();
});

test('upgrading a v18 store with KRs and jobs keeps rows and defaults', () => {
  const p = path.join(dir, 'mig', 'runtime.db');
  const old = openStore(p, MIGRATIONS.filter((m) => m.version < 19));
  const ts = new Date().toISOString();
  old.prepare("INSERT INTO okr_objectives (id, title, quarter, created_at, updated_at) VALUES ('O1','o','Q4-2026',?,?)").run(ts, ts);
  old.prepare("INSERT INTO okr_key_results (id, objective_id, title, created_at, updated_at) VALUES ('K1','O1','k',?,?)").run(ts, ts);
  old.close();
  const up = openStore(p);
  const row = up.prepare('SELECT kind, source, weight FROM okr_key_results WHERE id = ?').get('K1') as any;
  assert.deepEqual({ ...row }, { kind: 'manual', source: null, weight: 1 });
  up.close();
});

test('a KR with no linked jobs is UNKNOWN with null progress, never a number', async () => {
  const k = await mkKr('KR_EMPTY');
  assert.equal(k.progress, null);
  assert.equal(k.status, 'UNKNOWN');
  assert.equal(k.provenance, 'UNKNOWN');
  assert.equal(k.reason, 'no linked jobs');
  const obj = (await ok('GET', '/v1/okrs')).objectives.find((o: any) => o.id === 'OBJ_KR_EMPTY');
  assert.equal(obj.progress, null);
  assert.equal(obj.unknownKrCount, 1);
});

test('two linked jobs with weights 1 and 3: one done with VERIFIED evidence -> 25%; unverified done does not count', async () => {
  await mkKr('KR_W');
  const a = await newJob('weight one');
  const b = await newJob('weight three');
  await ok('POST', `/v1/jobs/${a.id}/kr-link`, { krId: 'KR_W', weight: 1 });
  await ok('POST', `/v1/jobs/${b.id}/kr-link`, { krId: 'KR_W', weight: 3 });
  let k = await kr('KR_W');
  assert.equal(k.progress, 0, 'linked but nothing verified is a measured 0, not UNKNOWN');
  assert.equal(k.status, 'behind');

  // done without VERIFIED evidence (only OBSERVED) does not count
  addEvidence(b.id, 'OBSERVED');
  await finish(b.id);
  k = await kr('KR_W');
  assert.equal(k.progress, 0);
  assert.equal(k.countedJobs, 0);

  // weight-1 job done with VERIFIED evidence -> 1 / 4
  addVerifiedEvidence(a.id);
  await finish(a.id);
  k = await kr('KR_W');
  assert.equal(k.progress, 25);
  assert.equal(k.provenance, 'verified');
  assert.equal(k.countedJobs, 1);
  const obj = (await ok('GET', '/v1/okrs')).objectives.find((o: any) => o.id === 'OBJ_KR_W');
  assert.equal(obj.progress, 25);
  assert.equal(obj.unknownKrCount, 0);
});

test('progress entries are appended with provenance and cannot be rewritten', async () => {
  const list = await entries('KR_W');
  assert.ok(list.length >= 2, JSON.stringify(list));
  const last = list[list.length - 1];
  assert.equal(last.provenance, 'verified');
  assert.equal(last.progressPercent, 25);
  assert.ok(last.jobId && last.evidenceId);
  assert.ok(list.some((e: any) => e.provenance === 'runtime_observed'), 'a move that counted nothing is runtime_observed');
  assert.throws(() => side.prepare('UPDATE okr_progress_entries SET progress_percent = 99').run(), /append-only/);
  assert.throws(() => side.prepare('DELETE FROM okr_progress_entries').run(), /append-only/);
});

test('archived jobs are excluded from KR math and archive/unarchive recompute', async () => {
  await mkKr('KR_ARCH');
  const a = await newJob('arch a');
  const b = await newJob('arch b');
  await ok('POST', `/v1/jobs/${a.id}/kr-link`, { krId: 'KR_ARCH' });
  await ok('POST', `/v1/jobs/${b.id}/kr-link`, { krId: 'KR_ARCH' });
  addVerifiedEvidence(a.id);
  await finish(a.id);
  assert.equal((await kr('KR_ARCH')).progress, 50);
  await ok('POST', `/v1/jobs/${b.id}/archive`, { actorId: 'winston' });
  assert.equal((await kr('KR_ARCH')).progress, 100, 'archived job leaves the denominator');
  await ok('POST', `/v1/jobs/${a.id}/archive`, { actorId: 'winston' });
  const k = await kr('KR_ARCH');
  assert.equal(k.progress, null, 'all linked jobs archived -> UNKNOWN');
  assert.equal(k.status, 'UNKNOWN');
  await ok('POST', `/v1/jobs/${a.id}/unarchive`, { actorId: 'winston' });
  assert.equal((await kr('KR_ARCH')).progress, 100);
  const list = await entries('KR_ARCH');
  assert.ok(list.length >= 4);
});

test('manual KR uses the latest manual entry, labelled manual; evidence/computed KRs refuse typed values', async () => {
  await ok('POST', '/v1/okrs/objectives', { id: 'OBJ_MAN', title: 'Manual objective' });
  const created = await ok('POST', '/v1/okrs/key-results', { id: 'KR_MAN', objective_id: 'OBJ_MAN', title: 'typed', kind: 'manual', target_value: 10 });
  assert.equal(created.progress, null, 'manual KR with no entry is UNKNOWN');
  await ok('POST', '/v1/okrs/key-results/KR_MAN/progress', { current_value: 2, actorId: 'winston' });
  const second = await ok('POST', '/v1/okrs/key-results/KR_MAN/progress', { current_value: 5, actorId: 'winston', note: 'checked by hand' });
  assert.equal(second.keyResult.progress, 50);
  assert.equal(second.keyResult.provenance, 'manual');
  assert.equal(second.keyResult.kind, 'manual');
  const list = await entries('KR_MAN');
  assert.deepEqual(list.map((e: any) => [e.provenance, e.progressPercent]), [['manual', 20], ['manual', 50]]);

  const refused = await call('POST', '/v1/okrs/key-results/KR_W/progress', { current_value: 100 });
  assert.equal(refused.status, 409);
  assert.equal((await kr('KR_W')).progress, 25, 'typed number did not change an evidence KR');
});

test('telemetry_query is stored but never evaluated; computed KRs are UNKNOWN', async () => {
  await ok('POST', '/v1/okrs/objectives', { id: 'OBJ_TEL', title: 'Telemetry objective' });
  const k = await ok('POST', '/v1/okrs/key-results', {
    id: 'KR_TEL',
    objective_id: 'OBJ_TEL',
    title: 'computed',
    kind: 'computed',
    telemetry_query: 'SELECT 100',
    current_value: 100,
  });
  assert.equal(k.progress, null);
  assert.equal(k.status, 'UNKNOWN');
  assert.equal(k.reason, 'no computation defined');
  assert.equal(k.telemetry_query, 'SELECT 100');
  assert.equal(k.provenance, 'UNKNOWN');
  assert.equal((await entries('KR_TEL')).length, 0, 'a computed KR records no manual entry');
});

test('linking validates the KR and milestone and can unlink', async () => {
  const j = await newJob('link validation');
  assert.equal((await call('POST', `/v1/jobs/${j.id}/kr-link`, { krId: 'KR_NOPE' })).status, 404);
  assert.equal((await call('POST', `/v1/jobs/${j.id}/kr-link`, { krId: 'KR_W', milestoneId: 'ms_nope' })).status, 404);
  assert.equal((await call('POST', '/v1/jobs/job_nope/kr-link', { krId: 'KR_W' })).status, 404);
  assert.equal((await call('POST', `/v1/jobs/${j.id}/kr-link`, { krId: 'KR_W', weight: 0 })).status, 400);
  side.prepare("INSERT INTO milestones (id, project_id, title, created_at) VALUES ('ms_1', ?, 'M1', ?)").run(projectId, new Date().toISOString());
  const linked = await ok('POST', `/v1/jobs/${j.id}/kr-link`, { krId: 'KR_W', milestoneId: 'ms_1', weight: 2 });
  assert.equal(linked.krId, 'KR_W');
  assert.equal(linked.milestoneId, 'ms_1');
  const detail = await ok('GET', `/v1/jobs/${j.id}`);
  assert.equal(detail.okrKrId, 'KR_W');
  assert.equal(detail.krWeight, 2);
  assert.equal((await kr('KR_W')).linkedJobs, 3);
  await ok('POST', `/v1/jobs/${j.id}/kr-link`, { krId: null });
  assert.equal((await ok('GET', `/v1/jobs/${j.id}`)).okrKrId, null);
  assert.equal((await kr('KR_W')).linkedJobs, 2);
  assert.ok(rt.repo.listEvents({ subjectId: j.id }).some((e) => e.type === 'job.kr_unlinked'));
});

test('health parts: zero denominators are null/UNKNOWN; the combined score is derived and deprecated', async () => {
  const empty = path.join(dir, 'empty');
  fs.mkdirSync(empty, { recursive: true });
  const rt2 = await startRuntime({ dbPath: path.join(empty, 'runtime.db'), workspaceRoots: [workRoot], cloneParentDir: workRoot, newProjectParentDir: workRoot });
  try {
    const res = await fetch(`${rt2.url}/v1/okrs/reality-audit`, { headers: { Authorization: `Bearer ${rt2.token}` } });
    const a = (await res.json()) as any;
    for (const part of ['execution', 'evidence']) {
      assert.equal(a[part].value, null, part);
      assert.equal(a[part].denominator, 0);
      assert.equal(a[part].status, 'UNKNOWN');
    }
    // A fresh store may import legacy objectives; their typed-in numbers must not count as known progress.
    assert.equal(a.strategy.numerator, 0, 'imported/seeded progress is UNKNOWN until measured');
    if (a.strategy.denominator === 0) assert.equal(a.strategy.value, null);
    assert.equal(a.healthScoreDeprecated, true);
    assert.equal(a.healthScoreUnknown, a.strategy.value === null);
  } finally {
    await rt2.close();
  }

  const a = await ok('GET', '/v1/okrs/reality-audit');
  assert.equal(typeof a.healthScore, 'number');
  assert.ok(a.evidence.denominator >= 2 && a.evidence.numerator >= 1);
  assert.equal(a.evidence.value, Math.round((a.evidence.numerator / a.evidence.denominator) * 100));
  assert.ok(a.execution.denominator >= 1);
  assert.ok(a.strategy.denominator >= 3 && a.strategy.numerator >= 1);
  assert.ok(a.strategy.unknownKeyResults >= 1);
  // blocking an active job lowers the execution figure
  const j = await newJob('blocked work');
  const before = (await ok('GET', '/v1/okrs/reality-audit')).execution;
  await ok('PATCH', `/v1/jobs/${j.id}`, { blockedReason: 'waiting for access' });
  const after2 = (await ok('GET', '/v1/okrs/reality-audit')).execution;
  assert.equal(after2.denominator, before.denominator);
  assert.equal(after2.numerator, before.numerator - 1);
});

test('project health comes from execution data only', async () => {
  const h = await ok('GET', `/v1/projects/${projectId}/health`);
  assert.equal(h.projectId, projectId);
  assert.ok(h.jobsByStage.done >= 1);
  assert.ok(h.verifiedDoneLast30Days >= 1);
  assert.equal(h.derivedFrom, 'execution data only');
  const w = h.linkedKeyResults.find((k: any) => k.id === 'KR_W');
  assert.equal(w.progress, 25);
  assert.equal(h.unknownKeyResults, h.linkedKeyResults.filter((k: any) => k.progress === null).length);
  assert.equal((await call('GET', '/v1/projects/proj_nope/health')).status, 404);
});

test('job archive / unarchive / confirmed delete; lists hide archived unless includeArchived=1', async () => {
  const j = await newJob('to delete');
  const ids = async (q = '') => (await ok('GET', `/v1/jobs${q}`)).map((x: any) => x.id);

  // delete refused while not archived
  assert.equal((await call('DELETE', `/v1/jobs/${j.id}?confirm=${j.id}`)).status, 409);
  assert.equal((await call('POST', `/v1/jobs/${j.id}/unarchive`, {})).status, 409, 'not archived yet');

  const archived = await ok('POST', `/v1/jobs/${j.id}/archive`, { actorId: 'winston' });
  assert.ok(archived.archivedAt);
  assert.equal((await call('POST', `/v1/jobs/${j.id}/archive`, {})).status, 409, 'already archived');
  assert.ok(!(await ids()).includes(j.id));
  assert.ok((await ids('?includeArchived=1')).includes(j.id));

  // confirm mismatch / missing refused
  assert.equal((await call('DELETE', `/v1/jobs/${j.id}?confirm=wrong`)).status, 409);
  assert.equal((await call('DELETE', `/v1/jobs/${j.id}`)).status, 409);
  assert.equal((await ok('GET', `/v1/jobs/${j.id}`)).id, j.id);

  // unarchive round trip
  await ok('POST', `/v1/jobs/${j.id}/unarchive`, { actorId: 'winston' });
  assert.ok((await ids()).includes(j.id));

  await ok('POST', `/v1/jobs/${j.id}/archive`, { actorId: 'winston' });
  const del = await call('DELETE', `/v1/jobs/${j.id}?confirm=${j.id}&actorId=winston`);
  assert.equal(del.status, 204);
  assert.equal((await call('GET', `/v1/jobs/${j.id}`)).status, 404);
  const types = rt.repo.listEvents({ subjectId: j.id }).map((e) => e.type);
  assert.ok(types.includes('job.archived') && types.includes('job.unarchived') && types.includes('job.deleted'), types.join(','));
});

test('deleting an archived job with evidence is refused: the ledger keeps it', async () => {
  const j = await newJob('has evidence');
  addEvidence(j.id, 'OBSERVED');
  await ok('POST', `/v1/jobs/${j.id}/archive`, { actorId: 'winston' });
  const res = await call('DELETE', `/v1/jobs/${j.id}?confirm=${j.id}`);
  assert.equal(res.status, 409);
  assert.match(JSON.stringify(res.json), /ledger/);
  assert.equal((await call('GET', `/v1/jobs/${j.id}`)).status, 200, 'still archived, not lost');
});

test('task archive / unarchive / confirmed delete and exclusion from lists and dispatch', async () => {
  const j = await newJob('task owner');
  const t1 = await ok('POST', `/v1/jobs/${j.id}/tasks`, { title: 'keep' });
  const t2 = await ok('POST', `/v1/jobs/${j.id}/tasks`, { title: 'drop' });
  const listIds = async (q = '') => (await ok('GET', `/v1/jobs/${j.id}/tasks${q}`)).map((t: any) => t.id);
  assert.deepEqual((await listIds()).sort(), [t1.id, t2.id].sort());

  assert.equal((await call('DELETE', `/v1/tasks/${t2.id}?confirm=${t2.id}`)).status, 409, 'not archived');
  const archived = await ok('POST', `/v1/tasks/${t2.id}/archive`, { actorId: 'winston' });
  assert.ok(archived.archivedAt);
  assert.deepEqual(await listIds(), [t1.id]);
  assert.deepEqual((await listIds('?includeArchived=1')).sort(), [t1.id, t2.id].sort());
  assert.ok(!(await ok('GET', '/v1/tasks/ready')).some((t: any) => t.id === t2.id), 'archived task is not dispatchable');
  assert.ok(!(await ok('GET', `/v1/jobs/${j.id}`)).tasks.some((t: any) => t.id === t2.id));

  assert.equal((await call('DELETE', `/v1/tasks/${t2.id}?confirm=nope`)).status, 409);
  await ok('POST', `/v1/tasks/${t2.id}/unarchive`, { actorId: 'winston' });
  assert.deepEqual((await listIds()).sort(), [t1.id, t2.id].sort());
  await ok('POST', `/v1/tasks/${t2.id}/archive`, {});
  assert.equal((await call('DELETE', `/v1/tasks/${t2.id}?confirm=${t2.id}`)).status, 204);
  assert.deepEqual(await listIds('?includeArchived=1'), [t1.id]);
  const types = rt.repo.listEvents({ subjectId: t2.id }).map((e) => e.type);
  assert.ok(types.includes('task.archived') && types.includes('task.deleted'), types.join(','));
});

test('legacy project_tasks are unchanged after migration and every operation above', () => {
  assert.equal(legacyChecksum(), legacyBefore);
  assert.equal((side.prepare('SELECT COUNT(*) AS n FROM project_tasks').get() as any).n, 5);
});
