// Budgets as shares of a subscription limit (programme plan K6, WP10 10.4).
//
// The team is on subscription plans, so there are no prices and no invented token caps. A budget is one of:
//   tokens            a token count, summed from usage rows the adapter (or an estimate) reported
//   weekly_pct        a share of an account's weekly limit  (latest snapshot + attributed task_usage)
//   session_pct       a share of an account's 5-hour limit
//   requests_per_day  a request count (Gemini CLI)
// Legacy money budgets keep working through repo.assertBudget; nothing new uses money.
//
// checkBudgets() runs before EVERY prompt send (session start and follow-up). At the warn level it emits
// `budget.warning` once per budget per period. At the hard level the prompt is refused with a 409 and a
// 'budget.exceed' approval is created, so the exception shows in /v1/needs-you. Approving that card is a
// one-time override for the same budget, period and scope.

import type { DatabaseSync } from 'node:sqlite';
import type * as T from '../api/types.ts';
import { ConflictError } from '../errors.ts';
import type { Repo } from '../store/repo.ts';
import { latestSnapshot } from './accounts.ts';
import { listTaskUsage, type TaskUsage } from './taskUsage.ts';

export interface BudgetContext {
  agentId: string;
  sessionId?: string | null;
  taskId?: string | null;
  jobId?: string | null;
  projectId?: string | null;
  /** The AI account the work runs on, when known (K9). */
  accountId?: string | null;
}

export type BudgetLevel = 'ok' | 'warn' | 'hard';

export interface BudgetStatus {
  budgetId: string;
  kind: T.BudgetKind;
  scope: T.BudgetScope;
  scopeKey: string;
  periodKey: string;
  used: number;
  limit: number;
  pct: number;
  level: BudgetLevel;
  /** 'actual' for tokens and snapshots; 'estimated' where the figure is an attribution. */
  measurement: 'actual' | 'estimated';
  unit: string;
}

export interface BudgetCheck {
  warnings: BudgetStatus[];
  /** Set when a hard limit was passed through on a one-time override. */
  overrideUsed: string | null;
  statuses: BudgetStatus[];
}

type Row = Record<string, unknown>;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function periodOf(budget: T.Budget, ctx: BudgetContext, nowDate: Date): { key: string; start: string } | null {
  const d = new Date(nowDate);
  switch (budget.period) {
    case 'day': {
      d.setUTCHours(0, 0, 0, 0);
      return { key: `day:${d.toISOString().slice(0, 10)}`, start: d.toISOString() };
    }
    case 'week': {
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
      return { key: `week:${d.toISOString().slice(0, 10)}`, start: d.toISOString() };
    }
    case 'month': {
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return { key: `month:${d.toISOString().slice(0, 7)}`, start: d.toISOString() };
    }
    case 'job':
      return ctx.jobId ? { key: `job:${ctx.jobId}`, start: new Date(0).toISOString() } : null;
    case 'session':
      return ctx.sessionId ? { key: `session:${ctx.sessionId}`, start: new Date(0).toISOString() } : null;
  }
}

function scopeKeyOf(b: T.Budget): string {
  return `${b.scope}:${b.scopeId ?? b.projectId ?? ''}`;
}

function departmentOf(repo: Repo, agentId: string): string | null {
  try {
    const i = repo.getIdentity(agentId);
    return i.departmentId ?? i.teamId ?? null;
  } catch {
    return null;
  }
}

function applies(b: T.Budget, ctx: BudgetContext, dept: string | null): boolean {
  switch (b.scope) {
    case 'global':
      return true;
    case 'project':
      return Boolean(ctx.projectId) && b.projectId === ctx.projectId;
    case 'agent':
      return b.scopeId === ctx.agentId;
    case 'task':
      return Boolean(ctx.taskId) && b.scopeId === ctx.taskId;
    case 'department':
      return Boolean(dept) && b.scopeId === dept;
    case 'session':
      return Boolean(ctx.sessionId) && b.scopeId === ctx.sessionId;
  }
}

function tokensUsed(db: DatabaseSync, b: T.Budget, ctx: BudgetContext, start: string): number {
  const where: string[] = ["u.measurement IN ('actual', 'estimated')", 'u.created_at >= ?'];
  const params: (string | null)[] = [start];
  switch (b.scope) {
    case 'project':
      where.push('u.job_id IN (SELECT id FROM jobs WHERE project_id = ?)');
      params.push(b.projectId);
      break;
    case 'agent':
      where.push('COALESCE(u.agent_id, s.agent_id) = ?');
      params.push(b.scopeId ?? null);
      break;
    case 'task':
      where.push('COALESCE(u.task_id, s.task_id) = ?');
      params.push(b.scopeId ?? null);
      break;
    case 'department':
      where.push('COALESCE(u.agent_id, s.agent_id) IN (SELECT id FROM identities WHERE COALESCE(department_id, team_id) = ?)');
      params.push(b.scopeId ?? null);
      break;
    case 'session':
      where.push('u.session_id = ?');
      params.push(b.scopeId ?? null);
      break;
    case 'global':
      break;
  }
  if (b.period === 'job') {
    where.push('u.job_id = ?');
    params.push(ctx.jobId ?? null);
  } else if (b.period === 'session') {
    where.push('u.session_id = ?');
    params.push(ctx.sessionId ?? null);
  }
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(u.input_tokens + u.output_tokens), 0) AS n
         FROM usage u LEFT JOIN sessions s ON s.id = u.session_id WHERE ${where.join(' AND ')}`
    )
    .get(...params) as Row;
  return Number(row.n ?? 0);
}

function inScope(db: DatabaseSync, b: T.Budget, t: TaskUsage): boolean {
  switch (b.scope) {
    case 'global':
      return true;
    case 'project': {
      if (!t.jobId) return false;
      const r = db.prepare('SELECT project_id FROM jobs WHERE id = ?').get(t.jobId) as Row | undefined;
      return r?.project_id === b.projectId;
    }
    case 'agent':
      return t.agentId === b.scopeId;
    case 'task':
      return t.taskId === b.scopeId;
    case 'session':
      return t.sessionId === b.scopeId;
    case 'department': {
      if (!t.agentId) return false;
      const r = db.prepare('SELECT COALESCE(department_id, team_id) AS d FROM identities WHERE id = ?').get(t.agentId) as Row | undefined;
      return r?.d === b.scopeId;
    }
  }
}

/** The amount used against a limit-share budget, in the budget's unit, or null when it cannot be known. */
function limitShareUsed(db: DatabaseSync, b: T.Budget, ctx: BudgetContext, periodStart: string): { used: number; measurement: 'actual' | 'estimated' } | null {
  const accountId = b.accountId ?? ctx.accountId ?? null;
  if (!accountId) return null;
  const snap = latestSnapshot(db, accountId);
  if (b.scope === 'global') {
    // The whole account: what a person read from /usage is the measurement.
    if (!snap) return null;
    const v = b.kind === 'weekly_pct' ? snap.weeklyPct : b.kind === 'session_pct' ? snap.sessionPct : snap.requestsToday;
    return v == null ? null : { used: v, measurement: snap.measurement };
  }
  // A scope inside the account: the attributed share of its task_usage rows in the current window.
  const since = b.kind === 'weekly_pct' && snap?.weeklyResetsAt ? new Date(Date.parse(snap.weeklyResetsAt) - WEEK_MS).toISOString() : periodStart;
  let used = 0;
  for (const t of listTaskUsage(db, { accountId })) {
    if (t.startedAt < since || !inScope(db, b, t)) continue;
    if (b.kind === 'weekly_pct') used += t.attributedWeeklyPct ?? 0;
    else if (b.kind === 'session_pct') {
      if (t.sessionPctBefore != null && t.sessionPctAfter != null && t.sessionPctAfter >= t.sessionPctBefore) used += t.sessionPctAfter - t.sessionPctBefore;
    } else used += t.requests ?? 0;
  }
  return { used, measurement: 'estimated' };
}

function evaluate(db: DatabaseSync, b: T.Budget, ctx: BudgetContext, period: { key: string; start: string }): BudgetStatus | null {
  const limit = b.amount ?? 0;
  if (!(limit > 0)) return null;
  let used: number;
  let measurement: 'actual' | 'estimated' = 'actual';
  if (b.kind === 'tokens') {
    used = tokensUsed(db, b, ctx, period.start);
  } else {
    const r = limitShareUsed(db, b, ctx, period.start);
    if (!r) return null; // unknown means unknown: nothing is enforced on a figure that does not exist
    used = r.used;
    measurement = r.measurement;
  }
  const pct = (used / limit) * 100;
  const level: BudgetLevel = pct >= (b.hardPct ?? 100) ? 'hard' : pct >= (b.warnPct ?? 80) ? 'warn' : 'ok';
  return {
    budgetId: b.id,
    kind: b.kind ?? 'tokens',
    scope: b.scope,
    scopeKey: scopeKeyOf(b),
    periodKey: period.key,
    used,
    limit,
    pct: Math.round(pct * 10) / 10,
    level,
    measurement,
    unit: b.kind === 'tokens' ? 'tokens' : b.kind === 'requests_per_day' ? 'requests' : '% of limit',
  };
}

export const BUDGET_EXCEED_ACTION = 'budget.exceed';

function describe(s: BudgetStatus): string {
  return `${s.kind} budget for ${s.scopeKey}: ${s.used} of ${s.limit} ${s.unit} (${s.pct}%) this ${s.periodKey.split(':')[0]}`;
}

/**
 * Evaluates every applicable budget before a prompt is sent. Throws ConflictError (HTTP 409) at a hard
 * limit unless a one-time override from an approved 'budget.exceed' card is waiting.
 */
export function checkBudgets(repo: Repo, ctx: BudgetContext, nowDate = new Date()): BudgetCheck {
  // Legacy money budgets (jobs.budget_cents, kind 'money'): unchanged behaviour.
  if (ctx.jobId) repo.assertBudget(ctx.jobId, 0);

  const db = repo.sqlite();
  const rows = db.prepare("SELECT * FROM budgets WHERE kind <> 'money'").all() as Row[];
  const result: BudgetCheck = { warnings: [], overrideUsed: null, statuses: [] };
  if (!rows.length) return result;
  const budgets = repo.listBudgets().filter((b) => b.kind && b.kind !== 'money');
  const dept = departmentOf(repo, ctx.agentId);

  for (const b of budgets) {
    if (!applies(b, ctx, dept)) continue;
    const period = periodOf(b, ctx, nowDate);
    if (!period) continue;
    const status = evaluate(db, b, ctx, period);
    if (!status) continue;
    result.statuses.push(status);
    if (status.level === 'ok') continue;

    const fresh = db
      .prepare("INSERT OR IGNORE INTO budget_alerts (budget_id, period_key, level, created_at) VALUES (?, ?, 'warn', ?)")
      .run(b.id, period.key, nowDate.toISOString());
    if (Number(fresh.changes) > 0) {
      repo.emitEvent({
        type: 'budget.warning',
        subjectId: b.id,
        subjectType: 'budget',
        sessionId: ctx.sessionId ?? null,
        jobId: ctx.jobId ?? null,
        taskId: ctx.taskId ?? null,
        payload: { ...status },
      });
    }
    if (status.level === 'warn') {
      result.warnings.push(status);
      continue;
    }

    // Hard limit. A granted override is spent exactly once.
    const grant = db
      .prepare('SELECT id FROM budget_overrides WHERE budget_id = ? AND period_key = ? AND scope_key = ? AND used_at IS NULL ORDER BY granted_at LIMIT 1')
      .get(b.id, period.key, status.scopeKey) as Row | undefined;
    if (grant) {
      db.prepare('UPDATE budget_overrides SET used_at = ? WHERE id = ?').run(nowDate.toISOString(), String(grant.id));
      repo.emitEvent({
        type: 'budget.override_used',
        subjectId: b.id,
        subjectType: 'budget',
        sessionId: ctx.sessionId ?? null,
        jobId: ctx.jobId ?? null,
        taskId: ctx.taskId ?? null,
        payload: { overrideId: String(grant.id), ...status },
      });
      result.overrideUsed = String(grant.id);
      result.warnings.push(status);
      continue;
    }

    const approvalId = openExceedApproval(repo, db, ctx, status);
    throw new ConflictError(
      `Budget reached: ${describe(status)}. ` +
        (approvalId
          ? `Nothing was sent. A decision is waiting in Needs You (approval ${approvalId}): continue with approval, renew the session, use a smaller model, reassign, or escalate.`
          : 'Nothing was sent. Raise the budget, renew the session, use a smaller model, reassign, or escalate.')
    );
  }
  return result;
}

function openExceedApproval(repo: Repo, db: DatabaseSync, ctx: BudgetContext, s: BudgetStatus): string | null {
  const jobId = ctx.jobId ?? null;
  if (!jobId) return null;
  const existing = db
    .prepare(
      `SELECT id FROM approvals WHERE action_type = ? AND status = 'pending'
         AND json_extract(action, '$.budgetId') = ? AND json_extract(action, '$.periodKey') = ?
         AND json_extract(action, '$.scopeKey') = ? LIMIT 1`
    )
    .get(BUDGET_EXCEED_ACTION, s.budgetId, s.periodKey, s.scopeKey) as Row | undefined;
  if (existing) return String(existing.id);
  const approval = repo.createApproval({
    jobId,
    title: `Budget reached: ${s.scopeKey} (${s.kind})`,
    consequence:
      `${describe(s)}. The prompt was refused. Options: (1) continue with approval - approve this card for a one-time override; ` +
      '(2) renew the session; (3) switch to a smaller model; (4) reassign the work; (5) escalate to the owner.',
    actionType: BUDGET_EXCEED_ACTION,
    action: { budgetId: s.budgetId, periodKey: s.periodKey, scopeKey: s.scopeKey, kind: s.kind, used: s.used, limit: s.limit, agentId: ctx.agentId },
    risk: 'medium',
    requestedBy: 'runtime:budget',
    requestedKind: 'system',
    sessionId: ctx.sessionId ?? null,
    taskId: ctx.taskId ?? null,
    reversible: true,
  });
  return approval.id;
}
