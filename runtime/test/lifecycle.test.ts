import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type * as T from '../src/api/types.ts';
import { assertAcyclic, findDependencyCycle, TASK_STATES, TASK_TRANSITIONS } from '../src/lifecycle/tasks.ts';
import { sweepTasks } from '../src/lifecycle/sweeper.ts';
import { tableCounts } from '../src/store/backup.ts';
import { migrate, openStore } from '../src/store/db.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';
import { ConflictError, Repo } from '../src/store/repo.ts';

function fresh() {
  const db = openStore(':memory:');
  const events: T.RuntimeEvent[] = [];
  const repo = new Repo(db, (e) => events.push(e));
  const room = repo.createRoom({ name: 'Lifecycle room' } as T.CreateRoomInput);
  const job = repo.createJob({ roomId: room.id, title: 'Lifecycle job', createdBy: 'winston' } as T.CreateJobInput);
  const mk = (input: Partial<T.CreateTaskInput> = {}) =>
    repo.createTask(job.id, { title: input.title ?? 't', assigneeId: 'atlas', ...input } as T.CreateTaskInput);
  return { db, repo, events, job, mk };
}

const RUNTIME = { actorId: 'runtime:test', actorKind: 'system' as const };

/** The shortest legal path from pending to each state, as [state, actorId] steps. */
const PATH_TO: Record<T.TaskStatus, string[]> = {
  pending: [],
  assigned: ['assigned'],
  acknowledged: ['assigned', 'acknowledged'],
  running: ['assigned', 'acknowledged', 'running'],
  needs_review: ['assigned', 'acknowledged', 'running', 'needs_review'],
  verified: ['assigned', 'acknowledged', 'running', 'needs_review', 'verified'],
  done: ['assigned', 'acknowledged', 'running', 'done'],
  blocked: ['blocked'],
  failed: ['failed'],
  retrying: ['failed', 'retrying'],
  reassignment_required: ['failed', 'reassignment_required'],
  needs_human: ['failed', 'reassignment_required', 'needs_human'],
};

function reach(h: ReturnType<typeof fresh>, status: T.TaskStatus, input: Partial<T.CreateTaskInput> = {}) {
  const task = h.mk(input);
  for (const step of PATH_TO[status]) h.repo.transitionTask(task.id, step as T.TaskStatus, { ...RUNTIME, reason: 'setup' });
  assert.equal(h.repo.getTask(task.id).status, status);
  return task.id;
}

test('every pair of states: the transition table decides, illegal moves are 409, legal moves emit exactly one event', () => {
  const h = fresh();
  let legal = 0;
  let illegal = 0;
  for (const from of TASK_STATES) {
    for (const to of TASK_STATES) {
      const id = reach(h, from);
      const before = h.events.length;
      const allowed = TASK_TRANSITIONS[from].includes(to);
      const opts = { ...RUNTIME, reason: 'table test', assigneeId: 'atlas' };
      if (allowed) {
        h.repo.transitionTask(id, to, opts);
        assert.equal(h.repo.getTask(id).status, to, `${from} -> ${to}`);
        const emitted = h.events.slice(before);
        assert.equal(emitted.length, 1, `${from} -> ${to} emits exactly one event`);
        assert.match(emitted[0]!.type, /^task\./);
        assert.equal(emitted[0]!.taskId, id);
        legal += 1;
      } else {
        assert.throws(() => h.repo.transitionTask(id, to, opts), ConflictError, `${from} -> ${to}`);
        assert.equal(h.repo.getTask(id).status, from, 'state is unchanged');
        assert.equal(h.events.length, before, 'a refused move emits nothing');
        illegal += 1;
      }
    }
  }
  assert.ok(legal > 20 && illegal > 60, `covered ${legal} legal and ${illegal} illegal pairs`);
});

test('K2 event names for the new task states', () => {
  const h = fresh();
  const id = h.mk().id;
  const seen: string[] = [];
  const step = (to: T.TaskStatus) => {
    const before = h.events.length;
    h.repo.transitionTask(id, to, { ...RUNTIME, reason: 'x' });
    seen.push(h.events[before]!.type);
  };
  step('assigned');
  step('acknowledged');
  step('running');
  step('needs_review');
  step('verified');
  assert.deepEqual(seen, ['task.assigned', 'task.acknowledged', 'task.running', 'task.needs_review', 'task.verified']);
  const f = reach(h, 'failed');
  const before = h.events.length;
  h.repo.transitionTask(f, 'retrying', { ...RUNTIME });
  h.repo.transitionTask(f, 'assigned', { ...RUNTIME });
  h.repo.transitionTask(f, 'failed', { ...RUNTIME });
  h.repo.transitionTask(f, 'reassignment_required', { ...RUNTIME });
  h.repo.transitionTask(f, 'needs_human', { ...RUNTIME });
  assert.deepEqual(
    h.events.slice(before).map((e) => e.type),
    ['task.retry_scheduled', 'task.assigned', 'task.failed', 'task.reassignment_required', 'task.needs_human']
  );
});

test('an assignee can never move its own task to verified or done', () => {
  const h = fresh();
  const review = reach(h, 'needs_review');
  assert.throws(() => h.repo.transitionTask(review, 'verified', { actorId: 'atlas', actorKind: 'agent' }), (e: Error) => e instanceof ConflictError && /own task/.test(e.message));
  const running = reach(h, 'running');
  assert.throws(() => h.repo.transitionTask(running, 'done', { actorId: 'atlas', actorKind: 'agent' }), ConflictError);
  assert.equal(h.repo.getTask(running).status, 'running');
  // Someone else may.
  assert.equal(h.repo.transitionTask(review, 'verified', { actorId: 'kael', actorKind: 'agent' }).status, 'verified');
  assert.equal(h.repo.transitionTask(running, 'done', { actorId: 'winston', actorKind: 'human' }).status, 'done');
});

test('a task that requires verification cannot skip needs_review', () => {
  const h = fresh();
  const id = reach(h, 'running', { verificationRequired: true });
  assert.throws(() => h.repo.transitionTask(id, 'done', RUNTIME), (e: Error) => e instanceof ConflictError && /verification/.test(e.message));
  h.repo.transitionTask(id, 'needs_review', RUNTIME);
  h.repo.transitionTask(id, 'verified', { actorId: 'kael', actorKind: 'agent' });
});

test('idempotency: a repeated key is a no-op for events and for transitions', () => {
  const h = fresh();
  const id = h.mk().id;
  const first = h.repo.transitionTask(id, 'assigned', { ...RUNTIME, idempotencyKey: 'k-1' });
  const count = h.events.length;
  const again = h.repo.transitionTask(id, 'assigned', { ...RUNTIME, idempotencyKey: 'k-1' });
  assert.equal(again.status, first.status);
  assert.equal(h.events.length, count);
  const rows = (h.db.prepare("SELECT COUNT(*) AS c FROM events WHERE idempotency_key = 'k-1'").get() as { c: number }).c;
  assert.equal(rows, 1);
  // The unique index backs the rule even for a raw duplicate insert.
  assert.throws(() =>
    h.db
      .prepare("INSERT INTO events (type, payload, created_at, idempotency_key) VALUES ('x', '{}', 'now', 'k-1')")
      .run()
  );
});

test('recordEvent honours idempotencyKey directly', () => {
  const h = fresh();
  const send = () => (h.repo as unknown as { recordEvent(e: T.RuntimeEvent[], i: object): T.RuntimeEvent }).recordEvent([], { type: 'decision.recorded', subjectId: null, idempotencyKey: 'dup' });
  const a = send();
  const b = send();
  assert.equal(a.seq, b.seq);
  assert.equal((h.db.prepare("SELECT COUNT(*) AS c FROM events WHERE type = 'decision.recorded'").get() as { c: number }).c, 1);
});

test('ready queue: dependencies must be done or verified, ordered by priority then position', () => {
  const h = fresh();
  const a = h.mk({ title: 'A' });
  const b = h.mk({ title: 'B', dependsOn: [a.id] });
  const c = h.mk({ title: 'C', priority: 5 });
  const d = h.mk({ title: 'D', priority: 5 });
  assert.deepEqual(h.repo.readyTasks(h.job.id).map((t) => t.title), ['C', 'D', 'A'], 'B waits for A; priority first, then position');
  // A runs and is done: B becomes ready.
  for (const to of ['assigned', 'acknowledged', 'running'] as const) h.repo.transitionTask(a.id, to, RUNTIME);
  assert.ok(!h.repo.readyTasks().some((t) => t.id === b.id), 'B still waits while A is running');
  assert.equal(h.repo.dependenciesMet(b.id), false);
  h.repo.transitionTask(a.id, 'done', { actorId: 'winston', actorKind: 'human' });
  assert.deepEqual(h.repo.readyTasks(h.job.id).map((t) => t.title), ['C', 'D', 'B']);
  assert.equal(h.repo.dependenciesMet(b.id), true);
  // verified satisfies a dependency too.
  const e = h.mk({ title: 'E' });
  const f = h.mk({ title: 'F', dependsOn: [e.id] });
  for (const to of ['assigned', 'acknowledged', 'running', 'needs_review'] as const) h.repo.transitionTask(e.id, to, RUNTIME);
  assert.ok(!h.repo.readyTasks().some((t) => t.id === f.id));
  h.repo.transitionTask(e.id, 'verified', { actorId: 'kael', actorKind: 'agent' });
  assert.ok(h.repo.readyTasks().some((t) => t.id === f.id));
  void [c, d];
});

test('dependency cycles are rejected', () => {
  assert.deepEqual(findDependencyCycle({ a: ['b'], b: ['c'], c: [] }), null);
  const cycle = findDependencyCycle({ a: ['b'], b: ['c'], c: ['a'] });
  assert.ok(cycle && cycle[0] === cycle[cycle.length - 1] && cycle.length === 4, JSON.stringify(cycle));
  assert.throws(() => assertAcyclic({ x: ['x'] }), ConflictError);

  const h = fresh();
  const a = h.mk({ title: 'A' });
  const b = h.mk({ title: 'B', dependsOn: [a.id] });
  const c = h.mk({ title: 'C', dependsOn: [b.id] });
  assert.throws(() => h.repo.updateTask(a.id, { dependsOn: [c.id] }), (e: Error) => e instanceof ConflictError && /cycle/.test(e.message));
  assert.throws(() => h.repo.updateTask(a.id, { dependsOn: [a.id] }), ConflictError);
  assert.deepEqual(h.repo.getTask(a.id).dependsOn, [], 'a rejected update changes nothing');
});

test('ack timeout: retry at 60s, then 300s, then reassignment_required (injected clock)', () => {
  const h = fresh();
  const t0 = Date.parse('2026-11-03T10:00:00.000Z');
  const at = (sec: number) => new Date(t0 + sec * 1000);
  const id = h.mk().id;
  h.repo.transitionTask(id, 'assigned', { ...RUNTIME, at: at(0).toISOString() });
  const typesFrom = (n: number) => h.events.slice(n).map((e) => e.type);

  assert.equal(h.repo.getTask(id).ackDeadlineAt, at(120).toISOString());
  let r = sweepTasks(h.repo, () => at(119));
  assert.deepEqual(r.ackTimeouts, [], 'not yet due');

  let mark = h.events.length;
  r = sweepTasks(h.repo, () => at(121));
  assert.deepEqual(r.ackTimeouts, [id]);
  assert.deepEqual(typesFrom(mark), ['task.ack_timeout', 'task.retry_scheduled']);
  let task = h.repo.getTask(id);
  assert.equal(task.status, 'retrying');
  assert.equal(task.attempt, 1);
  assert.equal(task.nextRetryAt, at(121 + 60).toISOString(), 'first backoff is 60s');

  r = sweepTasks(h.repo, () => at(121 + 59));
  assert.deepEqual(r.retriesDispatched, []);
  r = sweepTasks(h.repo, () => at(121 + 60));
  assert.deepEqual(r.retriesDispatched, [id]);
  assert.equal(h.repo.getTask(id).status, 'assigned');

  // Second ack timeout: backoff 300s.
  const secondAssign = 121 + 60;
  mark = h.events.length;
  r = sweepTasks(h.repo, () => at(secondAssign + 121));
  assert.deepEqual(r.retriesScheduled, [id]);
  task = h.repo.getTask(id);
  assert.equal(task.attempt, 2);
  assert.equal(task.nextRetryAt, at(secondAssign + 121 + 300).toISOString(), 'second backoff is 300s');
  r = sweepTasks(h.repo, () => at(secondAssign + 121 + 300));
  assert.deepEqual(r.retriesDispatched, [id]);

  // Third ack timeout: attempts exhausted.
  const thirdAssign = secondAssign + 121 + 300;
  mark = h.events.length;
  r = sweepTasks(h.repo, () => at(thirdAssign + 121));
  assert.deepEqual(r.reassignmentRequired, [id]);
  assert.deepEqual(typesFrom(mark), ['task.ack_timeout', 'task.reassignment_required']);
  task = h.repo.getTask(id);
  assert.equal(task.status, 'reassignment_required');
  assert.equal(task.attempt, 3);

  // An acknowledged task is never swept.
  const ok = h.mk().id;
  h.repo.transitionTask(ok, 'assigned', { ...RUNTIME, at: at(0).toISOString() });
  h.repo.transitionTask(ok, 'acknowledged', { ...RUNTIME, at: at(30).toISOString() });
  sweepTasks(h.repo, () => at(100000));
  assert.equal(h.repo.getTask(ok).status, 'acknowledged');
});

test('lifecycle settings override the K3 defaults', () => {
  const h = fresh();
  h.repo.updateSettings({ ackTimeoutSec: 10, backoffSec: [5], maxAttempts: 2 } as T.Settings);
  const t0 = Date.parse('2026-11-03T10:00:00.000Z');
  const id = h.mk().id;
  assert.equal(h.repo.getTask(id).maxAttempts, 2);
  h.repo.transitionTask(id, 'assigned', { ...RUNTIME, at: new Date(t0).toISOString() });
  sweepTasks(h.repo, () => t0 + 11_000);
  assert.equal(h.repo.getTask(id).nextRetryAt, new Date(t0 + 16_000).toISOString());
});

test('stale sweep: a running task with no events for more than 600s fails with reason stale', () => {
  const h = fresh();
  const t0 = Date.parse('2026-11-03T10:00:00.000Z');
  const at = (sec: number) => new Date(t0 + sec * 1000);
  const stale = h.mk().id;
  const live = h.mk().id;
  for (const id of [stale, live]) {
    h.repo.transitionTask(id, 'assigned', { ...RUNTIME, at: at(0).toISOString() });
    h.repo.transitionTask(id, 'acknowledged', { ...RUNTIME, at: at(1).toISOString() });
    h.repo.transitionTask(id, 'running', { ...RUNTIME, at: at(2).toISOString() });
  }
  h.repo.touchTask(live, at(500).toISOString()); // session activity
  const mark = h.events.length;
  const r = sweepTasks(h.repo, () => at(700));
  assert.deepEqual(r.stale, [stale]);
  assert.equal(h.repo.getTask(live).status, 'running');
  const failed = h.repo.getTask(stale);
  assert.equal(failed.status, 'failed');
  const ev = h.events.slice(mark);
  assert.equal(ev.length, 1);
  assert.equal(ev[0]!.type, 'task.failed');
  assert.equal((ev[0]!.payload as { reason: string }).reason, 'stale');
  // The live one goes stale once its own silence passes the limit.
  assert.deepEqual(sweepTasks(h.repo, () => at(500 + 601)).stale, [live]);
});

test('failed verification returns the task to its assignee and the job to build', () => {
  const h = fresh();
  const crit = h.repo.addCriterion(h.job.id, { text: 'Users stay signed in for an hour' } as T.CreateCriterionInput);
  const task = h.mk({ criterionIds: [crit.id], verificationRequired: true });
  h.repo.updateJob(h.job.id, {} as T.UpdateJobInput);
  h.repo.setPlan(h.job.id, { plan: { summary: 'plan' }, actorId: 'winston' } as T.SetPlanInput);
  h.repo.transitionJob(h.job.id, { to: 'plan', actorId: 'winston' });
  h.repo.transitionJob(h.job.id, { to: 'build', actorId: 'winston' });
  for (const to of ['assigned', 'acknowledged', 'running', 'needs_review'] as const) h.repo.transitionTask(task.id, to, RUNTIME);
  h.repo.appendEvidence({ jobId: h.job.id, taskId: task.id, kind: 'command', class: 'OBSERVED', summary: 'ran', recordedBy: 'runtime', recordedByKind: 'system' } as T.CreateEvidenceInput);
  h.repo.transitionJob(h.job.id, { to: 'verify', actorId: 'winston', force: true } as T.TransitionJobInput);
  assert.equal(h.repo.getJob(h.job.id).stage, 'verify');

  const mark = h.events.length;
  const out = h.repo.returnFailedVerification(
    h.job.id,
    [{ taskId: task.id, reason: `Verification failed on criterion "${h.repo.taskCriterionTexts(task.id)[0]}": exit 1` }],
    'kael'
  );
  assert.deepEqual(out, { returned: [task.id], jobMovedToBuild: true });
  const back = h.repo.getTask(task.id);
  assert.equal(back.status, 'assigned');
  assert.equal(back.assigneeId, 'atlas', 'same owner');
  assert.equal(h.repo.getJob(h.job.id).stage, 'build');
  const assigned = h.events.slice(mark).find((e) => e.type === 'task.assigned')!;
  assert.match((assigned.payload as { reason: string }).reason, /Users stay signed in for an hour/);
});

test('migration v10 preserves rows, indexes and foreign keys from a v9 store; re-running is a no-op', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-v10-'));
  try {
    const dbPath = path.join(dir, 'runtime.db');
    const old = openStore(dbPath, MIGRATIONS.filter((m) => m.version <= 9));
    const insert = (table: string, values: Record<string, unknown>) => {
      const cols = old.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string; notnull: number; dflt_value: unknown; pk: number }[];
      const row: Record<string, unknown> = { ...values };
      for (const c of cols) {
        if (c.name in row || !c.notnull || c.dflt_value != null) continue;
        row[c.name] = /INT/i.test(c.type) ? 0 : 'x';
      }
      const names = Object.keys(row);
      old.prepare(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...(Object.values(row) as never[]));
    };
    insert('rooms', { id: 'room1' });
    insert('jobs', { id: 'job1', room_id: 'room1' });
    insert('criteria', { id: 'crit1', job_id: 'job1' });
    const statuses = ['pending', 'running', 'done', 'failed', 'blocked'];
    statuses.forEach((status, i) => insert('tasks', { id: `task${i}`, job_id: 'job1', status, position: i, assignee_id: 'atlas', title: `T${i}` }));
    insert('sessions', { id: 'sess1', task_id: 'task1', state: 'running' });
    insert('evidence', { id: 'ev1', task_id: 'task2', job_id: 'job1', kind: 'command', class: 'OBSERVED' });
    insert('worktrees', { id: 'wt1', job_id: 'job1', task_id: 'task1' });
    insert('task_criteria', { task_id: 'task0', criterion_id: 'crit1' });
    insert('events', { type: 'x.y' });
    const before = tableCounts(old);
    const tasksBefore = old.prepare('SELECT * FROM tasks ORDER BY id').all();
    old.close();

    const db = openStore(dbPath);
    const after: Record<string, number> = tableCounts(db);
    assert.deepEqual(after, { ...before, schema_migrations: before.schema_migrations! + 1 });
    assert.equal(tableCounts(db).tasks, statuses.length);

    // Every old column value survived.
    const tasksAfter = db.prepare('SELECT * FROM tasks ORDER BY id').all() as Record<string, unknown>[];
    tasksAfter.forEach((row, i) => {
      for (const [k, v] of Object.entries(tasksBefore[i] as Record<string, unknown>)) assert.equal(row[k], v, `tasks.${k}`);
      assert.equal(row.depends_on, '[]');
      assert.equal(row.priority, 0);
      assert.equal(row.attempt, 0);
      assert.equal(row.max_attempts, 3);
      assert.equal(row.verification_required, 0);
      assert.equal(row.required_skills, '[]');
    });

    // Widened CHECK, children intact, enforcement back on, no violations.
    db.prepare("UPDATE tasks SET status = 'needs_human' WHERE id = 'task0'").run();
    assert.throws(() => db.prepare("UPDATE tasks SET status = 'bogus' WHERE id = 'task0'").run());
    assert.equal((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.equal((db.prepare("SELECT task_id FROM sessions WHERE id = 'sess1'").get() as { task_id: string }).task_id, 'task1');
    assert.throws(() => db.prepare("INSERT INTO sessions (id, agent_id, task_id, runtime_command, state, started_at) VALUES ('s2','a','nope','c','running','now')").run(), /FOREIGN KEY/);
    const idx = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map((r) => r.name);
    assert.ok(idx.includes('events_idempotency') && idx.includes('idx_tasks_job'));

    // The tasks -> jobs foreign key (with its cascade) was preserved.
    const fks = db.prepare('PRAGMA foreign_key_list(tasks)').all() as { table: string; on_delete: string }[];
    assert.deepEqual(fks.map((f) => [f.table, f.on_delete]), [['jobs', 'CASCADE']]);
    db.close();

    // Re-run is a no-op.
    const again = new DatabaseSync(dbPath);
    const versionsBefore = (again.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get() as { c: number }).c;
    const countsBefore = tableCounts(again);
    migrate(again);
    assert.equal((again.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get() as { c: number }).c, versionsBefore);
    assert.deepEqual(tableCounts(again), countsBefore);
    again.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
