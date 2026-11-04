// Per-task usage log (programme plan K6): which account, agent and model a task
// used, when, and how far the account's percentages moved. The attribution is an
// estimate and is always stored as such (the column is CHECK-constrained).

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { InputError, NotFoundError } from '../store/repo.ts';
import { getAccount, latestSnapshot, toSnapshot, type LimitSnapshot } from './accounts.ts';
import { attributeUsage, type TaskInterval } from './attribution.ts';

export interface TaskUsage {
  id: string;
  taskId: string | null;
  jobId: string | null;
  sessionId: string | null;
  accountId: string;
  agentId: string | null;
  modelId: string | null;
  taskType: string | null;
  startedAt: string;
  endedAt: string | null;
  sessionPctBefore: number | null;
  sessionPctAfter: number | null;
  weeklyPctBefore: number | null;
  weeklyPctAfter: number | null;
  requests: number | null;
  concurrentTasksOnAccount: number;
  attributedWeeklyPct: number | null;
  measurement: 'estimated';
}

export interface StartTaskUsageInput {
  taskId?: string | null;
  jobId?: string | null;
  sessionId?: string | null;
  accountId: string;
  agentId?: string | null;
  modelId?: string | null;
  taskType?: string | null;
  startedAt?: string;
}

type Row = Record<string, unknown>;
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

function toTaskUsage(r: Row): TaskUsage {
  return {
    id: String(r.id),
    taskId: strOrNull(r.task_id),
    jobId: strOrNull(r.job_id),
    sessionId: strOrNull(r.session_id),
    accountId: String(r.account_id),
    agentId: strOrNull(r.agent_id),
    modelId: strOrNull(r.model_id),
    taskType: strOrNull(r.task_type),
    startedAt: String(r.started_at),
    endedAt: strOrNull(r.ended_at),
    sessionPctBefore: numOrNull(r.session_pct_before),
    sessionPctAfter: numOrNull(r.session_pct_after),
    weeklyPctBefore: numOrNull(r.weekly_pct_before),
    weeklyPctAfter: numOrNull(r.weekly_pct_after),
    requests: numOrNull(r.requests),
    concurrentTasksOnAccount: Number(r.concurrent_tasks_on_account ?? 1),
    attributedWeeklyPct: numOrNull(r.attributed_weekly_pct),
    measurement: 'estimated',
  };
}

export function getTaskUsage(db: DatabaseSync, id: string): TaskUsage {
  const row = db.prepare('SELECT * FROM task_usage WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw new NotFoundError(`task usage ${id} not found`);
  return toTaskUsage(row);
}

export function listTaskUsage(db: DatabaseSync, opts: { accountId?: string; taskId?: string } = {}): TaskUsage[] {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.accountId) (where.push('account_id = ?'), params.push(opts.accountId));
  if (opts.taskId) (where.push('task_id = ?'), params.push(opts.taskId));
  const rows = db
    .prepare(`SELECT * FROM task_usage ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC, rowid DESC`)
    .all(...params) as Row[];
  return rows.map(toTaskUsage);
}

/** Starts a usage row, taking the account's latest snapshot as the "before" values. */
export function startTaskUsage(db: DatabaseSync, input: StartTaskUsageInput, now = new Date().toISOString()): TaskUsage {
  const account = getAccount(db, input.accountId);
  if (account.archivedAt) throw new InputError('AI account is archived');
  const before = latestSnapshot(db, account.id);
  const id = `tu_${crypto.randomBytes(8).toString('hex')}`;
  db.prepare(
    `INSERT INTO task_usage
       (id, task_id, job_id, session_id, account_id, agent_id, model_id, task_type, started_at,
        session_pct_before, weekly_pct_before, requests, concurrent_tasks_on_account)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    id,
    input.taskId ?? null,
    input.jobId ?? null,
    input.sessionId ?? null,
    account.id,
    input.agentId ?? null,
    input.modelId ?? null,
    input.taskType ?? null,
    input.startedAt ?? now,
    before?.sessionPct ?? null,
    before?.weeklyPct ?? null,
    account.limitModel === 'gemini_cli_requests_per_day' ? 0 : null
  );
  return getTaskUsage(db, id);
}

/** Counts Gemini CLI requests against a running task (the runtime knows; the CLI does not report a percentage). */
export function countRequests(db: DatabaseSync, id: string, n = 1): TaskUsage {
  if (!Number.isInteger(n) || n < 0) throw new InputError('n must be a whole number, 0 or more');
  const tu = getTaskUsage(db, id);
  if (tu.endedAt) throw new InputError('task usage already ended');
  db.prepare('UPDATE task_usage SET requests = COALESCE(requests, 0) + ? WHERE id = ?').run(n, id);
  return getTaskUsage(db, id);
}

function snapshotAtOrBefore(db: DatabaseSync, accountId: string, iso: string): LimitSnapshot | null {
  const row = db
    .prepare('SELECT * FROM account_limit_snapshots WHERE account_id = ? AND captured_at <= ? ORDER BY captured_at DESC, rowid DESC LIMIT 1')
    .get(accountId, iso) as Row | undefined;
  return row ? toSnapshot(row) : null;
}

/**
 * Ends a usage row. The latest snapshot becomes the "after" values, and the change
 * since the task's own "before" snapshot is split across the tasks that overlapped
 * it on the same account, by active time. Stored as an estimate; null when the
 * change cannot be known (no new snapshot, a window reset, or a decrease).
 */
export function stopTaskUsage(db: DatabaseSync, id: string, now = new Date().toISOString()): TaskUsage {
  const tu = getTaskUsage(db, id);
  if (tu.endedAt) return tu;
  const after = latestSnapshot(db, tu.accountId);
  const before = snapshotAtOrBefore(db, tu.accountId, tu.startedAt);

  let attributed: number | null = null;
  let concurrent = 1;
  if (before && after && after.id !== before.id) {
    const winStart = before.capturedAt;
    const winEnd = after.capturedAt;
    const rows = db
      .prepare(
        `SELECT id, started_at, ended_at FROM task_usage
          WHERE account_id = ? AND started_at < ? AND (ended_at IS NULL OR ended_at > ?)`
      )
      .all(tu.accountId, winEnd, winStart) as Array<{ id: string; started_at: string; ended_at: string | null }>;
    const intervals: TaskInterval[] = rows.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      endedAt: r.id === id ? now : r.ended_at,
    }));
    if (!intervals.some((i) => i.id === id)) intervals.push({ id, startedAt: tu.startedAt, endedAt: now });
    const result = attributeUsage(before, after, intervals);
    const mine = result.tasks.find((t) => t.id === id);
    attributed = mine?.weeklyPct ?? null;
    concurrent = Math.max(1, mine?.concurrentMax ?? 1);
  }

  db.prepare(
    `UPDATE task_usage
        SET ended_at = ?, session_pct_after = ?, weekly_pct_after = ?,
            concurrent_tasks_on_account = ?, attributed_weekly_pct = ?
      WHERE id = ?`
  ).run(now, after?.sessionPct ?? null, after?.weeklyPct ?? null, concurrent, attributed, id);
  return getTaskUsage(db, id);
}
