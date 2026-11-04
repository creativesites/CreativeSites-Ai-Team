// "Burning the week too fast" alert (programme plan K6).
//
// Raised when an account passes 70% of its weekly limit before the midpoint of
// ITS OWN weekly window. The window is the 7 days ending at weekly_resets_at, not
// a calendar week. One alert per account per window.

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { NotFoundError } from '../store/repo.ts';
import { latestSnapshot } from './accounts.ts';

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const ALERT_WEEKLY_PCT = 70;
export const ALERT_MAX_ELAPSED_FRACTION = 0.5;

export interface WeeklySnapshotLike {
  accountId: string;
  weeklyPct: number | null;
  weeklyResetsAt: string | null;
}

export interface WeeklyPaceAlert {
  accountId: string;
  windowResetsAt: string;
  weeklyPct: number;
  elapsedFraction: number;
}

export interface UsageAlert extends WeeklyPaceAlert {
  id: string;
  createdAt: string;
  acknowledgedAt: string | null;
}

/** Fraction (0..1) of the weekly window elapsed at `now`, or null if there is no usable reset time. */
export function elapsedFraction(weeklyResetsAt: string | null, now: Date): number | null {
  if (!weeklyResetsAt) return null;
  const end = Date.parse(weeklyResetsAt);
  if (!Number.isFinite(end)) return null;
  return Math.min(1, Math.max(0, (now.getTime() - (end - WEEK_MS)) / WEEK_MS));
}

/**
 * Pure. Returns the alert for this snapshot, or null. A window that has already
 * reset (now >= weekly_resets_at) is stale data and never alerts.
 */
export function weeklyPaceAlert(snapshot: WeeklySnapshotLike, now: Date): WeeklyPaceAlert | null {
  if (snapshot.weeklyPct == null || !snapshot.weeklyResetsAt) return null;
  const end = Date.parse(snapshot.weeklyResetsAt);
  if (!Number.isFinite(end) || now.getTime() >= end) return null;
  const elapsed = elapsedFraction(snapshot.weeklyResetsAt, now);
  if (elapsed == null) return null;
  if (snapshot.weeklyPct >= ALERT_WEEKLY_PCT && elapsed < ALERT_MAX_ELAPSED_FRACTION) {
    return {
      accountId: snapshot.accountId,
      windowResetsAt: new Date(end).toISOString(),
      weeklyPct: snapshot.weeklyPct,
      elapsedFraction: elapsed,
    };
  }
  return null;
}

type Row = Record<string, unknown>;
const toAlert = (r: Row): UsageAlert => ({
  id: String(r.id),
  accountId: String(r.account_id),
  windowResetsAt: String(r.window_resets_at),
  weeklyPct: Number(r.weekly_pct),
  elapsedFraction: Number(r.elapsed_fraction),
  createdAt: String(r.created_at),
  acknowledgedAt: r.acknowledged_at == null ? null : String(r.acknowledged_at),
});

/**
 * Evaluates the latest snapshot of an account and stores an alert if one is due.
 * Returns the NEW alert, or null (nothing due, or already alerted for this window).
 */
export function evaluateAlerts(db: DatabaseSync, accountId: string, now = new Date()): UsageAlert | null {
  const snap = latestSnapshot(db, accountId);
  if (!snap) return null;
  const alert = weeklyPaceAlert(snap, now);
  if (!alert) return null;
  const id = `ualert_${crypto.randomBytes(8).toString('hex')}`;
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO usage_alerts (id, account_id, window_resets_at, weekly_pct, elapsed_fraction, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, accountId, alert.windowResetsAt, alert.weeklyPct, alert.elapsedFraction, now.toISOString());
  if (Number(res.changes) === 0) return null;
  return toAlert(db.prepare('SELECT * FROM usage_alerts WHERE id = ?').get(id) as Row);
}

export function listAlerts(db: DatabaseSync, opts: { accountId?: string; unacknowledgedOnly?: boolean } = {}): UsageAlert[] {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.accountId) {
    where.push('account_id = ?');
    params.push(opts.accountId);
  }
  if (opts.unacknowledgedOnly) where.push('acknowledged_at IS NULL');
  const rows = db
    .prepare(`SELECT * FROM usage_alerts ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, rowid DESC`)
    .all(...params) as Row[];
  return rows.map(toAlert);
}

export function ackAlert(db: DatabaseSync, id: string, now = new Date().toISOString()): UsageAlert {
  const row = db.prepare('SELECT * FROM usage_alerts WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw new NotFoundError(`usage alert ${id} not found`);
  db.prepare('UPDATE usage_alerts SET acknowledged_at = COALESCE(acknowledged_at, ?) WHERE id = ?').run(now, id);
  return toAlert(db.prepare('SELECT * FROM usage_alerts WHERE id = ?').get(id) as Row);
}
