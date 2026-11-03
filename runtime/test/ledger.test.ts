import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { openStore } from '../src/store/db.ts';
import { Ledger, unionMs } from '../src/ledger/ledger.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-ledger-'));

function seedSession(db: DatabaseSync, id: string, agent: string, turns: [string, string | null][], state = 'idle') {
  db.prepare("INSERT OR IGNORE INTO identities (id, name, role, runtime, avatar_mark, avatar_color, seats, created_at) VALUES (?, ?, 'builder', 'claude', 'X', '#000', '[]', ?)").run(agent, agent, '2026-11-03T00:00:00Z');
  db.prepare('INSERT INTO sessions (id, agent_id, runtime_command, state, started_at, last_event_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, agent, 'x', state, turns[0]![0], turns.at(-1)![1] ?? turns.at(-1)![0]);
  let seq = 0;
  for (const [start, end] of turns) {
    db.prepare("INSERT INTO transcript_entries (session_id, kind, payload, created_at, seq) VALUES (?, 'prompt', '{}', ?, ?)").run(id, start, ++seq);
    if (end) db.prepare("INSERT INTO transcript_entries (session_id, kind, payload, created_at, seq) VALUES (?, 'turn_end', '{}', ?, ?)").run(id, end, ++seq);
  }
}

test('4 agents working 1 hour in parallel = 4 agent-hours in 1 elapsed hour; replays never double-count (18.3)', () => {
  const db = openStore(path.join(dir, 'a.db'));
  const L = new Ledger(db);
  for (const a of ['a1', 'a2', 'a3', 'a4']) {
    seedSession(db, `s_${a}`, a, [['2026-11-03T10:00:00.000Z', '2026-11-03T11:00:00.000Z']]);
    assert.ok(L.recordTurn(`s_${a}`, 2));
    assert.equal(L.recordTurn(`s_${a}`, 2), null, 'second record of the same turn is a no-op');
  }
  const sum = L.summary('2026-11-03T00:00:00Z', '2026-11-04T00:00:00Z');
  assert.equal(sum.agentHours, 4);
  assert.equal(sum.agentElapsedHours, 1);
  assert.equal(sum.humanHours, 0, 'agent time is never human time');
  const rows = L.list({ actorKind: 'agent' });
  assert.ok(rows.every((r) => r.billable_status === 'non_billable'), 'agent hours are never billable');
  db.close();
});

test('a turn cut off by a crash is closed at the last event, once (restart safety)', () => {
  const db = openStore(path.join(dir, 'b.db'));
  const L = new Ledger(db);
  seedSession(db, 's_crash', 'c1', [['2026-11-03T09:00:00.000Z', null]], 'failed');
  db.prepare("INSERT INTO transcript_entries (session_id, kind, payload, created_at, seq) VALUES ('s_crash', 'agent_message', '{}', '2026-11-03T09:20:00.000Z', 2)").run();
  assert.equal(L.reconcileOpenTurns(), 1);
  assert.equal(L.reconcileOpenTurns(), 0, 'idempotent');
  const [row] = L.list({ identityId: 'c1' });
  assert.equal(row!.closed_by, 'recovery');
  assert.equal(row!.duration_ms, 20 * 60_000);
  db.close();
});

test('human timers, manual entries and audited adjustments; engagement totals; agent work links to billed hours', () => {
  const db = openStore(path.join(dir, 'c.db'));
  let clock = new Date('2026-11-03T08:00:00Z');
  const L = new Ledger(db, () => clock);
  const file = path.join(dir, 'engagements.local.json');
  fs.writeFileSync(file, JSON.stringify({ engagements: [{ id: 'client-a', client: 'Client A', hourly_rate_minor: 1000, currency: 'USD', min_weekly_hours: 20, max_weekly_hours: 40, pay_schedule: 'unknown' }] }));
  assert.equal(L.loadEngagements(file), 1);

  L.startTimer({ identityId: 'owner', engagementId: 'client-a', category: 'implementation' });
  assert.throws(() => L.startTimer({ identityId: 'owner' }), /already running/);
  clock = new Date('2026-11-03T10:00:00Z');
  const timed = L.stopTimer('owner');
  assert.equal(timed.duration_ms, 2 * 3_600_000);
  assert.equal(timed.billable_status, 'billable');

  const manual = L.addManual({ identityId: 'owner', engagementId: 'client-a', startedAt: '2026-11-03T12:00:00Z', endedAt: '2026-11-03T13:00:00Z', category: 'review' });
  const adj = L.adjust(String(manual.id), { deltaMs: -30 * 60_000, note: 'Forgot to stop', by: 'owner' });
  assert.equal(L.get(String(manual.id)).duration_ms, 3_600_000, 'original row unchanged');
  assert.equal(adj.adjusts_interval_id, manual.id);

  seedSession(db, 's_help', 'helper', [['2026-11-03T08:30:00.000Z', '2026-11-03T09:30:00.000Z']]);
  const agentRow = L.recordTurn('s_help', 2)!;
  const linked = L.linkSupport(agentRow, String(timed.id));
  assert.equal(linked.supports_interval_id, timed.id);
  assert.equal(linked.billable_status, 'non_billable');

  const sum = L.summary('2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z', 'client-a') as any;
  assert.equal(sum.billableHumanHours, 2.5, '2h timer + 1h manual − 0.5h adjustment');
  assert.equal(sum.agentHours, 1);
  assert.equal(sum.engagement.remainingToMin, 17.5);
  assert.equal(sum.engagement.estimatedBillableValueMinor, 2500);
  assert.equal(sum.engagement.agentHoursBillable, false);
  assert.equal(sum.engagement.paySchedule, 'unknown');
  assert.throws(() => L.adjust(String(manual.id), { deltaMs: 5, note: ' ', by: 'owner' }), /needs a note/);
  db.close();
});

test('unionMs merges overlapping ranges', () => {
  assert.equal(unionMs([[0, 10], [5, 15], [20, 25]]), 20);
  assert.equal(unionMs([]), 0);
});

let rt: RunningRuntime;
before(async () => {
  rt = await startRuntime({ dbPath: path.join(dir, 'api.db') });
});
after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, { method, headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as any };
};

test('time API and job timeline', async () => {
  const room = (await call('POST', '/v1/rooms', { name: 'ledger-room' })).json;
  const job = (await call('POST', '/v1/jobs', { roomId: room.id, title: 'Timeline job', createdBy: 'winston', criteria: ['x'] })).json;
  assert.equal((await call('POST', '/v1/time/timer/start', { category: 'planning', jobId: job.id })).status, 201);
  assert.equal((await call('POST', '/v1/time/timer/start', {})).status, 400);
  assert.equal((await call('POST', '/v1/time/timer/stop')).status, 200);
  assert.equal((await call('POST', '/v1/time/entries', { startedAt: '2026-11-03T10:00:00Z', endedAt: '2026-11-03T09:00:00Z' })).status, 400);
  await call('POST', `/v1/jobs/${job.id}/stage`, { to: 'plan', actorId: 'winston' });
  const tl = (await call('GET', `/v1/jobs/${job.id}/timeline`)).json as any[];
  const kinds = tl.map((i) => i.kind);
  assert.ok(kinds.includes('job.created'));
  assert.ok(kinds.includes('stage'));
  assert.ok(kinds.includes('time'));
  assert.deepEqual([...tl].map((i) => i.at), [...tl].map((i) => i.at).sort(), 'chronological');
  const sum = (await call('GET', '/v1/time/summary?from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z')).json;
  assert.equal(sum.measurement, 'actual');
});
