import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { migrate, openStore } from '../src/store/db.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';
import { DatabaseSync } from 'node:sqlite';
import { addSnapshot, createAccount, latestSnapshot, type AiAccount } from '../src/usage/accounts.ts';
import { ackAlert, evaluateAlerts, listAlerts, weeklyPaceAlert, WEEK_MS } from '../src/usage/alerts.ts';
import { attributeUsage } from '../src/usage/attribution.ts';
import { computeEstimates, median } from '../src/usage/estimates.ts';
import { checkAccountIsolation } from '../src/usage/isolation.ts';
import { countRequests, startTaskUsage, stopTaskUsage } from '../src/usage/taskUsage.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-usage-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const MIN = 60_000;
const T0 = Date.parse('2026-11-02T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const freshDb = (name: string) => openStore(path.join(dir, `${name}.db`));

// ------------------------------------------------------------ attribution

test('attribution splits the delta across two concurrent tasks by active time and flags it', () => {
  const resets = iso(T0 + 3 * 24 * 60 * MIN);
  const before = { capturedAt: iso(T0), sessionPct: 10, sessionResetsAt: iso(T0 + 300 * MIN), weeklyPct: 20, weeklyResetsAt: resets };
  const after = { capturedAt: iso(T0 + 60 * MIN), sessionPct: 30, sessionResetsAt: iso(T0 + 300 * MIN), weeklyPct: 26, weeklyResetsAt: resets };
  // A runs the whole hour; B runs the second half. Segments: 30 min A alone, 30 min A+B.
  const r = attributeUsage(before, after, [
    { id: 'A', startedAt: iso(T0), endedAt: iso(T0 + 60 * MIN) },
    { id: 'B', startedAt: iso(T0 + 30 * MIN), endedAt: iso(T0 + 60 * MIN) },
  ]);
  const a = r.tasks.find((t) => t.id === 'A')!;
  const b = r.tasks.find((t) => t.id === 'B')!;
  assert.equal(r.weeklyDelta, 6);
  // weights: A = 30 + 15 = 45, B = 15  -> 4.5 and 1.5
  assert.ok(Math.abs(a.weeklyPct! - 4.5) < 1e-9);
  assert.ok(Math.abs(b.weeklyPct! - 1.5) < 1e-9);
  assert.ok(Math.abs(a.weeklyPct! + b.weeklyPct! - 6) < 1e-9);
  assert.equal(a.concurrentMax, 2);
  assert.ok(a.sharedWithOthers && b.sharedWithOthers);
  assert.equal(a.measurement, 'estimated');
  assert.equal(r.measurement, 'estimated');
});

test('a task running alone is not flagged as shared', () => {
  const resets = iso(T0 + 3 * 24 * 60 * MIN);
  const s = (t: number, w: number) => ({ capturedAt: iso(T0 + t * MIN), sessionPct: null, sessionResetsAt: null, weeklyPct: w, weeklyResetsAt: resets });
  const r = attributeUsage(s(0, 5), s(30, 8), [{ id: 'A', startedAt: iso(T0), endedAt: null }]);
  assert.equal(r.tasks[0]!.weeklyPct, 3);
  assert.equal(r.tasks[0]!.sharedWithOthers, false);
  assert.equal(r.tasks[0]!.concurrentMax, 1);
});

test('a weekly reset between snapshots is unknown, never negative', () => {
  const before = { capturedAt: iso(T0), sessionPct: 50, sessionResetsAt: iso(T0 + 60 * MIN), weeklyPct: 90, weeklyResetsAt: iso(T0 + 60 * MIN) };
  const after = {
    capturedAt: iso(T0 + 120 * MIN),
    sessionPct: 4,
    sessionResetsAt: iso(T0 + 360 * MIN),
    weeklyPct: 2,
    weeklyResetsAt: iso(T0 + 60 * MIN + WEEK_MS),
  };
  const r = attributeUsage(before, after, [{ id: 'A', startedAt: iso(T0), endedAt: iso(T0 + 120 * MIN) }]);
  assert.equal(r.weeklyDelta, null);
  assert.equal(r.weeklyUnknown, 'window_reset');
  assert.equal(r.sessionUnknown, 'window_reset');
  assert.equal(r.tasks[0]!.weeklyPct, null);
  assert.equal(r.tasks[0]!.sessionPct, null);
});

test('a percentage that goes down without a reset is unknown, not negative', () => {
  const resets = iso(T0 + 24 * 60 * MIN);
  const mk = (t: number, w: number) => ({ capturedAt: iso(T0 + t * MIN), sessionPct: null, sessionResetsAt: null, weeklyPct: w, weeklyResetsAt: resets });
  const r = attributeUsage(mk(0, 40), mk(30, 35), [{ id: 'A', startedAt: iso(T0), endedAt: iso(T0 + 30 * MIN) }]);
  assert.equal(r.tasks[0]!.weeklyPct, null);
  assert.equal(r.weeklyUnknown, 'decreased');
});

// ------------------------------------------------------------ alerts

const windowAt = (fractionElapsed: number) => {
  const resets = T0 + WEEK_MS; // window is [T0, T0 + 7d]
  return { resets: iso(resets), now: new Date(T0 + fractionElapsed * WEEK_MS) };
};

test('alert fires at 71% with 40% of the window elapsed, not at 60%', () => {
  const early = windowAt(0.4);
  const hit = weeklyPaceAlert({ accountId: 'a', weeklyPct: 71, weeklyResetsAt: early.resets }, early.now);
  assert.ok(hit);
  assert.ok(Math.abs(hit!.elapsedFraction - 0.4) < 1e-9);
  const late = windowAt(0.6);
  assert.equal(weeklyPaceAlert({ accountId: 'a', weeklyPct: 71, weeklyResetsAt: late.resets }, late.now), null);
  assert.equal(weeklyPaceAlert({ accountId: 'a', weeklyPct: 69.9, weeklyResetsAt: early.resets }, early.now), null);
  assert.ok(weeklyPaceAlert({ accountId: 'a', weeklyPct: 70, weeklyResetsAt: early.resets }, early.now));
});

test('the window comes from weekly_resets_at, not the calendar week', () => {
  // Resets on a Saturday evening: the midpoint is Wednesday-ish only by coincidence of this fixture.
  const resets = Date.parse('2026-11-07T20:00:00Z');
  const mid = resets - WEEK_MS / 2;
  const snap = { accountId: 'a', weeklyPct: 80, weeklyResetsAt: iso(resets) };
  assert.ok(weeklyPaceAlert(snap, new Date(mid - 60 * MIN)));
  assert.equal(weeklyPaceAlert(snap, new Date(mid + 60 * MIN)), null);
  assert.equal(weeklyPaceAlert(snap, new Date(resets + MIN)), null, 'a window that already reset never alerts');
});

test('alerts are stored once per account per window and can be acknowledged', () => {
  const db = freshDb('alerts');
  const acct = createAccount(db, { provider: 'anthropic', plan: 'claude_pro', label: 'Fake Claude', limitModel: 'claude_5h_weekly_pct' });
  const w = windowAt(0.3);
  addSnapshot(db, acct.id, { weeklyPct: 72, weeklyResetsAt: w.resets }, w.now.toISOString());
  const first = evaluateAlerts(db, acct.id, w.now);
  assert.ok(first);
  addSnapshot(db, acct.id, { weeklyPct: 75, weeklyResetsAt: w.resets }, new Date(w.now.getTime() + MIN).toISOString());
  assert.equal(evaluateAlerts(db, acct.id, new Date(w.now.getTime() + MIN)), null, 'deduped within the window');
  assert.equal(listAlerts(db, { accountId: acct.id }).length, 1);
  // A new window raises a new alert.
  const nextResets = iso(Date.parse(w.resets) + WEEK_MS);
  const nextNow = new Date(Date.parse(w.resets) + 0.2 * WEEK_MS);
  addSnapshot(db, acct.id, { weeklyPct: 71, weeklyResetsAt: nextResets }, nextNow.toISOString());
  assert.ok(evaluateAlerts(db, acct.id, nextNow));
  assert.equal(listAlerts(db, { accountId: acct.id }).length, 2);
  const acked = ackAlert(db, first!.id);
  assert.ok(acked.acknowledgedAt);
  assert.equal(listAlerts(db, { unacknowledgedOnly: true }).length, 1);
  db.close();
});

// ------------------------------------------------------------ accounts, validation, task usage

test('snapshot validation: percentages 0-100, ISO reset times, reset time required', () => {
  const db = freshDb('validation');
  const acct = createAccount(db, { provider: 'anthropic', plan: 'claude_pro', label: 'Fake Claude', limitModel: 'claude_5h_weekly_pct' });
  const r = iso(T0 + 1000 * MIN);
  assert.throws(() => addSnapshot(db, acct.id, { weeklyPct: 101, weeklyResetsAt: r }), /0 to 100/);
  assert.throws(() => addSnapshot(db, acct.id, { sessionPct: -1, sessionResetsAt: r }), /0 to 100/);
  assert.throws(() => addSnapshot(db, acct.id, { weeklyPct: 10, weeklyResetsAt: 'tomorrow' }), /ISO/);
  assert.throws(() => addSnapshot(db, acct.id, { weeklyPct: 10 }), /weeklyResetsAt is required/);
  assert.throws(() => addSnapshot(db, acct.id, {}), /at least one/);
  assert.throws(() => createAccount(db, { provider: 'google', plan: 'x', label: 'x', limitModel: 'claude_5h_weekly_pct' }), /does not match/);
  assert.throws(() => createAccount(db, { provider: 'anthropic', plan: 'x', label: 'x', ownerScope: 'someone', limitModel: 'claude_5h_weekly_pct' }), /ownerScope/);
  const ok = addSnapshot(db, acct.id, { weeklyPct: 0, weeklyResetsAt: r });
  assert.equal(ok.measurement, 'actual');
  assert.equal(latestSnapshot(db, acct.id)!.id, ok.id);
  db.close();
});

test('task usage: before/after from snapshots, attribution stored as estimated, Gemini CLI requests counted', () => {
  const db = freshDb('taskusage');
  const acct = createAccount(db, { provider: 'anthropic', plan: 'claude_pro', label: 'Fake Claude', limitModel: 'claude_5h_weekly_pct' });
  const resets = iso(T0 + 3 * 24 * 60 * MIN);
  const sessionResets = iso(T0 + 240 * MIN);
  addSnapshot(db, acct.id, { sessionPct: 10, sessionResetsAt: sessionResets, weeklyPct: 20, weeklyResetsAt: resets }, iso(T0));
  const tu = startTaskUsage(db, { accountId: acct.id, taskId: 't1', agentId: 'astra', modelId: 'm-fake', taskType: 'implement' }, iso(T0 + MIN));
  assert.equal(tu.weeklyPctBefore, 20);
  assert.equal(tu.measurement, 'estimated');
  addSnapshot(db, acct.id, { sessionPct: 25, sessionResetsAt: sessionResets, weeklyPct: 23, weeklyResetsAt: resets }, iso(T0 + 31 * MIN));
  const done = stopTaskUsage(db, tu.id, iso(T0 + 30 * MIN));
  assert.equal(done.weeklyPctAfter, 23);
  assert.equal(done.sessionPctAfter, 25);
  assert.ok(Math.abs(done.attributedWeeklyPct! - 3) < 1e-9);
  assert.equal(done.measurement, 'estimated');
  assert.ok(computeEstimates(db).length === 1);
  assert.throws(() => db.prepare("UPDATE task_usage SET measurement = 'actual' WHERE id = ?").run(tu.id), /CHECK/);

  // No new snapshot: unknown, not zero.
  const t2 = startTaskUsage(db, { accountId: acct.id, taskId: 't2' }, iso(T0 + 40 * MIN));
  assert.equal(stopTaskUsage(db, t2.id, iso(T0 + 50 * MIN)).attributedWeeklyPct, null);

  const cli = createAccount(db, { provider: 'google', plan: 'google_ai_pro', label: 'Fake CLI', limitModel: 'gemini_cli_requests_per_day' });
  assert.equal(cli.dailyRequestQuota, 1500);
  const g = startTaskUsage(db, { accountId: cli.id, taskId: 't3', agentId: 'gem' });
  countRequests(db, g.id, 3);
  assert.equal(countRequests(db, g.id).requests, 4);
  assert.equal(addSnapshot(db, cli.id, { requestsToday: 120 }).requestsToday, 120);
  db.close();
});

test('two concurrent task_usage rows split the account delta', () => {
  const db = freshDb('concurrent');
  const acct = createAccount(db, { provider: 'anthropic', plan: 'claude_pro', label: 'Fake Claude', limitModel: 'claude_5h_weekly_pct' });
  const resets = iso(T0 + 3 * 24 * 60 * MIN);
  addSnapshot(db, acct.id, { weeklyPct: 10, weeklyResetsAt: resets }, iso(T0));
  const a = startTaskUsage(db, { accountId: acct.id, taskId: 'a', agentId: 'x', taskType: 'review' }, iso(T0));
  const b = startTaskUsage(db, { accountId: acct.id, taskId: 'b', agentId: 'y', taskType: 'review' }, iso(T0));
  addSnapshot(db, acct.id, { weeklyPct: 14, weeklyResetsAt: resets }, iso(T0 + 60 * MIN));
  const ra = stopTaskUsage(db, a.id, iso(T0 + 60 * MIN));
  assert.equal(ra.concurrentTasksOnAccount, 2);
  assert.ok(Math.abs(ra.attributedWeeklyPct! - 2) < 1e-9);
  db.close();
});

test('estimates: median per (task type, model, agent) with n', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  const db = freshDb('estimates');
  const acct = createAccount(db, { provider: 'anthropic', plan: 'claude_pro', label: 'Fake Claude', limitModel: 'claude_5h_weekly_pct' });
  const ins = db.prepare(
    `INSERT INTO task_usage (id, account_id, agent_id, model_id, task_type, started_at, attributed_weekly_pct) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  [1, 5, 3].forEach((v, i) => ins.run(`u${i}`, acct.id, 'astra', 'm1', 'implement', iso(T0), v));
  ins.run('u9', acct.id, 'kael', 'm1', 'review', iso(T0), 0.5);
  ins.run('u10', acct.id, 'kael', 'm1', 'review', iso(T0), null);
  const est = computeEstimates(db);
  assert.equal(est.length, 2);
  const impl = est.find((e) => e.taskType === 'implement')!;
  assert.equal(impl.medianWeeklyPct, 3);
  assert.equal(impl.n, 3);
  assert.equal(impl.measurement, 'estimated');
  assert.equal(est.find((e) => e.taskType === 'review')!.n, 1, 'null attributions are excluded');
  db.close();
});

// ------------------------------------------------------------ K9 isolation

const acc = (over: Partial<AiAccount>): AiAccount => ({
  id: 'x',
  provider: 'anthropic',
  plan: 'claude_pro',
  label: 'Fake',
  ownerScope: 'personal',
  limitModel: 'claude_5h_weekly_pct',
  dailyRequestQuota: null,
  adapterAccountId: null,
  createdAt: iso(T0),
  archivedAt: null,
  ...over,
});

test('K9 isolation', () => {
  const client = acc({ id: 'acct_client', ownerScope: 'client:c1', adapterAccountId: 'login-client' });
  const personal = acc({ id: 'acct_personal', adapterAccountId: 'login-personal' });
  const accounts = [client, personal];

  assert.deepEqual(checkAccountIsolation({ aiAccountId: 'acct_client' }, 'login-client', accounts), { ok: true });
  assert.deepEqual(checkAccountIsolation({ aiAccountId: 'acct_personal' }, 'login-personal', accounts), { ok: true });

  const wrongLogin = checkAccountIsolation({ aiAccountId: 'acct_client' }, 'login-personal', accounts);
  assert.equal(wrongLogin.ok, false);
  const clientOnPersonalProject = checkAccountIsolation({ aiAccountId: 'acct_personal' }, 'login-client', accounts);
  assert.equal(clientOnPersonalProject.ok, false);
  const clientOnUnassigned = checkAccountIsolation({ aiAccountId: null }, 'login-client', accounts);
  assert.equal(clientOnUnassigned.ok, false);
  assert.deepEqual(checkAccountIsolation({ aiAccountId: null }, 'login-personal', accounts), { ok: true });
  assert.deepEqual(checkAccountIsolation({ aiAccountId: null }, null, accounts), { ok: true });

  assert.equal(checkAccountIsolation({ aiAccountId: 'acct_client' }, null, accounts).ok, false, 'unknown adapter login');
  assert.equal(checkAccountIsolation({ aiAccountId: 'acct_missing' }, 'login-client', accounts).ok, false);
  assert.equal(checkAccountIsolation({ aiAccountId: 'acct_x' }, 'l', [acc({ id: 'acct_x' })]).ok, false, 'account has no adapter login recorded');
  assert.equal(checkAccountIsolation({ aiAccountId: 'acct_client' }, 'login-client', [{ ...client, archivedAt: iso(T0) }]).ok, false);
  assert.equal(checkAccountIsolation({ aiAccountId: null, confidential: 1 }, 'login-personal', accounts).ok, false);
});

// ------------------------------------------------------------ migration

test('v13 migration is idempotent and preserves rows', () => {
  const file = path.join(dir, 'mig.db');
  const upTo12 = MIGRATIONS.filter((m) => m.version <= 12);
  const db = new DatabaseSync(file);
  migrate(db, upTo12);
  db.prepare("INSERT INTO projects (id, name, created_at) VALUES ('p1', 'Fake project', ?)").run(iso(T0));
  db.prepare("INSERT INTO projects (id, name, created_at) VALUES ('p2', 'Other fake project', ?)").run(iso(T0));
  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  const beforeProjects = count('projects');
  assert.equal(migrate(db, MIGRATIONS) >= 13, true);
  assert.equal(count('projects'), beforeProjects);
  const cols = (db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.ok(cols.includes('ai_account_id') && cols.includes('confidential'));
  assert.equal((db.prepare('SELECT confidential FROM projects WHERE id = ?').get('p1') as { confidential: number }).confidential, 0);
  for (const t of ['ai_accounts', 'account_limit_snapshots', 'task_usage', 'usage_alerts']) assert.equal(count(t), 0);
  // Running again changes nothing and does not throw.
  migrate(db, MIGRATIONS);
  assert.equal(count('projects'), beforeProjects);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 13').get() as { n: number }).n, 1);
  db.close();
});

// ------------------------------------------------------------ API

let rt: RunningRuntime;
const workRoot = path.join(dir, 'work');
before(async () => {
  fs.mkdirSync(workRoot, { recursive: true });
  rt = await startRuntime({
    dbPath: path.join(dir, 'store', 'runtime.db'),
    workspaceRoots: [workRoot],
    cloneParentDir: workRoot,
    newProjectParentDir: workRoot,
    teamRepo: null,
  });
});
after(async () => {
  await rt?.close();
});

const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

test('API round trip: create account, post snapshot, weekly report, alert, ack', async () => {
  const created = await call('POST', '/v1/ai-accounts', {
    provider: 'anthropic',
    plan: 'claude_pro',
    label: 'Fake API account',
    limitModel: 'claude_5h_weekly_pct',
  });
  assert.equal(created.status, 201);
  const id = created.json.id as string;
  assert.equal((await call('GET', '/v1/ai-accounts')).json.length, 1);

  const now = Date.now();
  const resets = new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(); // about 29% elapsed
  const bad = await call('POST', `/v1/ai-accounts/${id}/snapshots`, { weeklyPct: 150, weeklyResetsAt: resets });
  assert.equal(bad.status, 400);
  const posted = await call('POST', `/v1/ai-accounts/${id}/snapshots`, {
    sessionPct: 12,
    sessionResetsAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
    weeklyPct: 71,
    weeklyResetsAt: resets,
  });
  assert.equal(posted.status, 201);
  assert.equal(posted.json.snapshot.measurement, 'actual');
  assert.ok(posted.json.alert, 'alert raised on post');

  const again = await call('POST', `/v1/ai-accounts/${id}/snapshots`, { weeklyPct: 72, weeklyResetsAt: resets });
  assert.equal(again.json.alert, null, 'deduped');

  assert.equal((await call('GET', `/v1/ai-accounts/${id}/snapshots`)).json.length, 2);
  assert.equal((await call('GET', '/v1/ai-accounts/nope/snapshots')).status, 404);

  const weekly = await call('GET', '/v1/usage/weekly');
  assert.equal(weekly.status, 200);
  const row = weekly.json.find((r: any) => r.account.id === id);
  assert.equal(row.weeklyPct, 72);
  assert.equal(row.weeklyMeasurement, 'actual');
  assert.ok(row.pace > 1);
  assert.equal(row.weeklyResetsAt, resets);
  assert.equal(row.alerts.length, 1);

  const est = await call('GET', '/v1/usage/estimates');
  assert.equal(est.status, 200);
  assert.deepEqual(est.json, []);

  const ack = await call('POST', `/v1/usage/alerts/${row.alerts[0].id}/ack`, {});
  assert.equal(ack.status, 200);
  assert.ok(ack.json.acknowledgedAt);
  assert.equal((await call('POST', '/v1/usage/alerts/missing/ack', {})).status, 404);

  const unauth = await fetch(`${rt.url}/v1/usage/weekly`);
  assert.equal(unauth.status, 401);
});
