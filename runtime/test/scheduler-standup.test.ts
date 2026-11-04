import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { callTool } from '../src/agent-tools/tools.ts';
import { Repo } from '../src/store/repo.ts';
import { openStore } from '../src/store/db.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';
import { Scheduler } from '../src/scheduler/scheduler.ts';
import { installRoutines } from '../src/scheduler/routines.ts';
import { cronMatches, parseCron, zonedParts } from '../src/scheduler/cron.ts';
import { StandupService } from '../src/standup/pipeline.ts';
import { parseStandupDirective, submitReply } from '../src/standup/replies.ts';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-wp6-'));

interface Rig {
  db: DatabaseSync;
  repo: Repo;
  scheduler: Scheduler;
  standups: StandupService;
  woken: string[];
  blocked: Set<string>;
  boot: (nowIso: string) => { scheduler: Scheduler; standups: StandupService };
}

function rig(dbPath = ':memory:', startIso = '2026-11-01T12:00:00Z'): Rig {
  const db = openStore(dbPath);
  const repo = new Repo(db);
  const woken: string[] = [];
  const blocked = new Set<string>();
  const boot = (nowIso: string) => {
    const scheduler = new Scheduler({ repo, db });
    const standups = new StandupService({
      repo,
      db,
      wake: async (id) => {
        woken.push(id);
      },
      adapterBlocked: (a) => (blocked.has(a.id) ? 'adapter not installed' : null),
    });
    installRoutines({ repo, scheduler, standups, probe: () => [] }, nowIso);
    return { scheduler, standups };
  };
  const { scheduler, standups } = boot(startIso);
  return { db, repo, scheduler, standups, woken, blocked, boot };
}

const runs = (r: Rig, name: string) => {
  const sched = r.db.prepare('SELECT id FROM agent_schedules WHERE name = ?').get(name) as { id: string };
  return r.scheduler.listRuns(sched.id, 1000).reverse();
};

async function advance(r: Rig, fromIso: string, toIso: string, stepMs = 60_000) {
  for (let t = Date.parse(fromIso); t <= Date.parse(toIso); t += stepMs) await r.scheduler.runDue(new Date(t).toISOString());
}

test('cron evaluates fields in the schedule timezone', () => {
  const c = parseCron('0 10 * * 1-5');
  assert.ok(cronMatches(c, Date.parse('2026-11-02T08:00:00Z'), 'Africa/Lusaka')); // Monday 10:00 CAT
  assert.ok(!cronMatches(c, Date.parse('2026-11-02T10:00:00Z'), 'Africa/Lusaka'));
  assert.ok(!cronMatches(c, Date.parse('2026-11-07T08:00:00Z'), 'Africa/Lusaka')); // Saturday
  assert.equal(zonedParts(Date.parse('2026-11-02T23:30:00Z'), 'Africa/Lusaka').date, '2026-11-03');
});

test('stand-up fires once per weekday at 10:00 Lusaka, never on weekends, and never twice across restarts', async () => {
  const r = rig();
  r.repo.updateSettings({ 'workflow.standups': true });
  await advance(r, '2026-11-01T12:00:00Z', '2026-11-08T12:00:00Z');
  const rows = runs(r, 'daily-standup');
  assert.deepEqual(rows.map((x) => x.dueAt), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((d) => `${d}T08:00:00.000Z`));
  assert.ok(rows.every((x) => x.status === 'ran'));
  assert.equal(r.db.prepare('SELECT COUNT(*) AS n FROM standup_runs').get()!.n, 5);

  // Simulated restart: a fresh scheduler on the same store re-evaluates the same instants.
  const again = r.boot('2026-11-06T08:00:30Z');
  assert.deepEqual(await again.scheduler.runDue('2026-11-06T08:00:30Z'), []);
  assert.deepEqual(await again.scheduler.catchUp('2026-11-06T09:00:00Z'), []);
  assert.equal(runs(r, 'daily-standup').length, 5);
  // The unique slot key is the hard guard.
  const id = (r.db.prepare("SELECT id FROM agent_schedules WHERE name = 'daily-standup'").get() as { id: string }).id;
  assert.throws(() => r.db.prepare("INSERT INTO schedule_runs (id, schedule_id, due_at, ran_at, status) VALUES ('x', ?, '2026-11-02T08:00:00.000Z', 'n', 'ran')").run(id));
});

test('flags default off: the slot is recorded skipped with detail disabled', async () => {
  const r = rig();
  await advance(r, '2026-11-02T07:00:00Z', '2026-11-02T08:05:00Z');
  const rows = runs(r, 'daily-standup');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.status, 'skipped');
  assert.equal(rows[0]!.detail, 'disabled');
  assert.equal(r.db.prepare('SELECT COUNT(*) AS n FROM standup_runs').get()!.n, 0);
});

test('runtime off over the slot: one caught_up run with delay; older slots skipped; second start does not re-run', async () => {
  const r = rig(':memory:', '2026-11-02T06:00:00Z');
  r.repo.updateSettings({ 'workflow.standups': true, 'workflow.agentHealth': true });
  await r.scheduler.runDue('2026-11-02T06:30:00Z');
  // Off from 07:00Z (09:00 CAT) until 10:00Z (12:00 CAT) on Monday.
  const back = r.boot('2026-11-02T10:00:00Z');
  const first = await back.scheduler.catchUp('2026-11-02T10:00:00Z');
  const standup = runs(r, 'daily-standup');
  assert.equal(standup.length, 1);
  assert.equal(standup[0]!.status, 'caught_up');
  assert.equal(standup[0]!.delayMs, 2 * 3600_000);
  // Hourly health: 07:00 and 08:00 and 09:00 missed, only the latest (10:00, on time) runs.
  const health = runs(r, 'agent-health');
  assert.deepEqual(health.map((h) => [h.dueAt.slice(11, 13), h.status]), [['07', 'skipped'], ['08', 'skipped'], ['09', 'skipped'], ['10', 'ran']]);
  assert.ok(first.length >= 5);
  // Second start: nothing new.
  const again = r.boot('2026-11-02T10:00:20Z');
  assert.deepEqual(await again.scheduler.catchUp('2026-11-02T10:00:20Z'), []);
  assert.equal(runs(r, 'daily-standup').length, 1);
});

test('a gap longer than the catch-up window is recorded, not silently lost', async () => {
  const r = rig(':memory:', '2026-11-02T06:00:00Z');
  r.repo.updateSettings({ 'workflow.standups': true });
  await r.scheduler.catchUp('2026-11-04T10:00:00Z'); // Mon 08:00Z slot is 50h old
  const rows = runs(r, 'daily-standup');
  assert.deepEqual(rows.map((x) => [x.dueAt.slice(0, 10), x.status]), [['2026-11-02', 'skipped'], ['2026-11-04', 'caught_up']]);
  assert.match(rows[0]!.detail ?? '', /catch-up window/);
});

test('stand-up with three agents: replied, no_update, absent; nothing fabricated; blockers and discrepancies recorded', async () => {
  const r = rig();
  for (const id of ['ada', 'bo', 'cy']) r.repo.createIdentity({ id, name: id.toUpperCase(), role: 'builder', runtime: 'claude' });
  // Real-time activity so all three count as active; cy's adapter is blocked (offline).
  r.repo.transact((emit) => {
    for (const id of ['ada', 'bo', 'cy']) emit({ type: 'task.running', subjectId: 't1', subjectType: 'task', actorId: id, actorKind: 'agent' });
  });
  r.blocked.add('cy');
  r.repo.updateSettings({ 'workflow.standups': true });
  const outDir = tmp();
  const t0 = new Date();
  const iso = (ms: number) => new Date(t0.getTime() + ms).toISOString();

  assert.throws(() => submitReply(r.repo, 'ada', { done: 'x' }, iso(0)), /No stand-up is collecting/);

  const { run, existing } = await r.standups.startRun('2026-11-05', iso(0));
  assert.equal(existing, false);
  assert.deepEqual(r.woken.sort(), ['ada', 'bo']);
  assert.deepEqual(run.agents.map((a) => [a.agentId, a.state]), [['ada', 'requested'], ['bo', 'requested'], ['cy', 'absent']]);
  assert.equal((await r.standups.startRun('2026-11-05', iso(1000))).existing, true); // idempotent per date

  // The MCP tool: actor comes from the principal; the absent agent is rejected.
  const ctx = (id: string) => ({ principal: { kind: 'agent' as const, tokenId: 'tok', identityId: id, sessionId: null, jobId: null, taskId: null, role: 'member' }, repo: r.repo, db: r.db, now: () => new Date(iso(5000)) });
  const ok = callTool(ctx('ada'), 'standup_submit', { done: 'Finished task_0123456789abcdef', next: 'Review', blockers: ['Waiting for API key'] });
  assert.equal(ok.status, 'ok');
  assert.equal(callTool(ctx('cy'), 'standup_submit', { done: 'hi' }).status, 'rejected');

  // Before the deadline and with bo outstanding, nothing is compiled.
  assert.deepEqual(r.standups.poll(iso(60_000)), []);
  const done = r.standups.poll(iso(11 * 60_000));
  assert.equal(done.length, 1);

  const latest = r.standups.latest()!;
  const rep = latest.report!;
  const by = Object.fromEntries(rep.agents.map((a) => [a.agentId, a]));
  assert.equal(by.ada!.status, 'reported');
  assert.equal(by.ada!.reported!.label, 'agent-reported (unverified)');
  assert.equal(by.bo!.status, 'no_update');
  assert.equal(by.bo!.reported, null);
  assert.equal(by.cy!.status, 'absent');
  assert.equal(by.cy!.reported, null);
  assert.match(by.cy!.reason ?? '', /offline/);
  assert.match(by.ada!.discrepancies.join(' '), /task_0123456789abcdef/);
  assert.deepEqual(by.ada!.discrepancies.length, 1);
  assert.equal(latest.filePath, null);
  assert.ok(!latest.markdown!.includes('Finished task_0123456789abcdef') || latest.markdown!.includes('Agent-reported (unverified)'));

  const blockers = r.db.prepare("SELECT raised_by, summary, status FROM blockers").all() as { raised_by: string; summary: string; status: string }[];
  assert.deepEqual(blockers.map((b) => [b.raised_by, b.summary, b.status]), [['ada', 'Waiting for API key', 'open']]);
  const types = (r.db.prepare("SELECT type FROM events WHERE type LIKE 'standup.%'").all() as { type: string }[]).map((e) => e.type);
  assert.ok(types.includes('standup.requested') && types.includes('standup.completed'));
  assert.equal(fs.readdirSync(outDir).length, 0);
  assert.throws(() => submitReply(r.repo, 'bo', { done: 'late' }, iso(12 * 60_000)), /No stand-up is collecting/);

  // Markdown only when the directory is configured.
  r.repo.updateSettings({ 'workflow.standupMarkdownDir': outDir });
  await r.standups.startRun('2026-11-06', iso(20 * 60_000));
  r.standups.poll(iso(40 * 60_000));
  assert.deepEqual(fs.readdirSync(outDir), ['2026-11-06_standup.md']);
  assert.match(fs.readFileSync(path.join(outDir, '2026-11-06_standup.md'), 'utf8'), /Daily stand-up 2026-11-06/);
});

test('bracket directive fallback parses', () => {
  const d = parseStandupDirective('[STANDUP: done=shipped login | next=tests | blockers=no CI; need keys]')!;
  assert.deepEqual(d, { done: 'shipped login', next: 'tests', blockers: ['no CI', 'need keys'] });
  assert.equal(parseStandupDirective('[WAKE: x] hi'), null);
});

test('weekly routines create a job brief through intake with source schedule', async () => {
  const r = rig(':memory:', '2026-11-05T12:00:00Z');
  r.repo.updateSettings({ 'workflow.weeklyRetro': true });
  await advance(r, '2026-11-06T13:50:00Z', '2026-11-06T14:05:00Z'); // Fri 16:00 CAT = 14:00Z
  const job = r.db.prepare("SELECT title FROM jobs WHERE title = 'Weekly retrospective'").get();
  assert.ok(job);
  assert.equal((r.db.prepare("SELECT source FROM intake_requests WHERE source_ref LIKE 'weekly-retro:%'").get() as { source: string }).source, 'schedule');
  assert.equal(runs(r, 'weekly-retro')[0]!.status, 'ran');
});

test('API: schedule runs, run-now gated by the flag and idempotent per date, latest', async () => {
  const { startRuntime } = await import('../src/app.ts');
  const dir = tmp();
  const rt = await startRuntime({ dbPath: path.join(dir, 'runtime.db') });
  const call = async (method: string, route: string, body?: unknown) => {
    const res = await fetch(`${rt.url}${route}`, { method, headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  try {
    assert.equal((await call('GET', '/v1/schedules/runs')).status, 200);
    assert.equal((await call('POST', '/v1/standups/run-now', {})).status, 409);
    assert.equal((await call('GET', '/v1/standups/latest')).json, null);
    await call('POST', '/v1/settings', { 'workflow.standups': true });
    const first = await call('POST', '/v1/standups/run-now', {});
    assert.equal(first.json.existing, false);
    const second = await call('POST', '/v1/standups/run-now', {});
    assert.equal(second.json.existing, true);
    assert.equal(second.json.run.id, first.json.run.id);
    assert.ok((await call('GET', '/v1/standups/latest')).json.report.date);
  } finally {
    await rt.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('v17 migration is idempotent and preserves rows; duplicate legacy dates survive the unique key', () => {
  const dir = tmp();
  const file = path.join(dir, 'runtime.db');
  const old = openStore(file, MIGRATIONS.slice(0, -1));
  const ins = old.prepare("INSERT INTO standups (standup_date, content, ts) VALUES (?, 'c', 't')");
  ins.run('2026-10-01');
  ins.run('2026-10-01');
  old.close();
  for (let i = 0; i < 2; i++) {
    const db = openStore(file);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM standups').get() as { n: number }).n, 2);
    assert.equal((db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v, 17);
    db.close();
  }
});
