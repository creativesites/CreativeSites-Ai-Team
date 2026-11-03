// Weekly usage report per account (programme plan K6 priority metric).

import type { DatabaseSync } from 'node:sqlite';
import { listAccounts, latestSnapshot, type AiAccount, type LimitSnapshot } from './accounts.ts';
import { elapsedFraction, listAlerts, WEEK_MS, type UsageAlert } from './alerts.ts';

export interface UsageBreakdownRow {
  key: string | null;
  attributedWeeklyPct: number;
  tasks: number;
  measurement: 'estimated';
}

export interface AccountWeeklyReport {
  account: AiAccount;
  snapshot: LimitSnapshot | null;
  /** Label for the weekly figure: it is a value someone read, so 'actual'. Null when none. */
  weeklyMeasurement: 'actual' | 'estimated' | null;
  weeklyPct: number | null;
  weeklyResetsAt: string | null;
  /** Fraction of the weekly window elapsed (the window is weekly_resets_at minus 7 days). */
  elapsedFraction: number | null;
  /** (weekly_pct / 100) / elapsed fraction. Above 1 means ahead of an even burn. */
  pace: number | null;
  /** True when the latest snapshot's window has already reset, so the figures are out of date. */
  stale: boolean;
  topAgents: UsageBreakdownRow[];
  topTaskTypes: UsageBreakdownRow[];
  alerts: UsageAlert[];
}

function breakdown(db: DatabaseSync, column: 'agent_id' | 'task_type', accountId: string, since: string): UsageBreakdownRow[] {
  const rows = db
    .prepare(
      `SELECT ${column} AS k, SUM(attributed_weekly_pct) AS pct, COUNT(*) AS n
         FROM task_usage
        WHERE account_id = ? AND started_at >= ? AND attributed_weekly_pct IS NOT NULL
        GROUP BY ${column} ORDER BY pct DESC LIMIT 5`
    )
    .all(accountId, since) as Array<{ k: string | null; pct: number; n: number }>;
  return rows.map((r) => ({ key: r.k, attributedWeeklyPct: Number(r.pct), tasks: Number(r.n), measurement: 'estimated' }));
}

export function weeklyReport(db: DatabaseSync, now = new Date()): AccountWeeklyReport[] {
  return listAccounts(db).map((account) => {
    const snapshot = latestSnapshot(db, account.id);
    const resets = snapshot?.weeklyResetsAt ?? null;
    const elapsed = elapsedFraction(resets, now);
    const stale = resets != null && now.getTime() >= Date.parse(resets);
    const weeklyPct = snapshot?.weeklyPct ?? null;
    const pace = weeklyPct != null && elapsed != null && elapsed >= 0.01 && !stale ? weeklyPct / 100 / elapsed : null;
    const since = resets ? new Date(Date.parse(resets) - WEEK_MS).toISOString() : new Date(now.getTime() - WEEK_MS).toISOString();
    return {
      account,
      snapshot,
      weeklyMeasurement: weeklyPct != null ? snapshot!.measurement : null,
      weeklyPct,
      weeklyResetsAt: resets,
      elapsedFraction: elapsed,
      pace,
      stale,
      topAgents: breakdown(db, 'agent_id', account.id, since),
      topTaskTypes: breakdown(db, 'task_type', account.id, since),
      alerts: listAlerts(db, { accountId: account.id }).filter((a) => resets != null && a.windowResetsAt === new Date(Date.parse(resets)).toISOString()),
    };
  });
}
