// Central scheduler for recurring routines (WP6 6.1/6.2). Named cron schedules live in agent_schedules;
// every due slot gets exactly one schedule_runs row (UNIQUE(schedule_id, due_at)), so a slot never runs
// twice, across ticks or restarts. After downtime only the latest missed slot runs (as caught_up); older
// missed slots are recorded as skipped. The clock is injectable.

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type * as T from '../api/types.ts';
import { InputError, type Repo } from '../store/repo.ts';
import { isValidTimeZone, nextCronSlot, parseCron } from './cron.ts';

export const SCHEDULER_ACTOR = 'runtime:scheduler';
export const SYSTEM_SCHEDULE_AGENT = 'system';
export const DEFAULT_CATCH_UP_WINDOW_MS = 24 * 3600_000;
/** A slot handled within this delay counts as on time ('ran'); later is 'caught_up'. */
export const ON_TIME_GRACE_MS = 2 * 60_000;

export type RunStatus = 'ran' | 'caught_up' | 'skipped' | 'failed';

export interface ScheduleRun {
  id: string;
  scheduleId: string;
  dueAt: string;
  ranAt: string;
  status: RunStatus;
  delayMs: number;
  detail: string | null;
}

export interface RoutineContext {
  schedule: T.AgentSchedule;
  dueAt: string;
  now: string;
  status: 'ran' | 'caught_up';
  delayMs: number;
}

export interface RoutineDef {
  /** Setting that must be `true` for the routine to run; otherwise the slot is recorded skipped/disabled. */
  flag?: string;
  handler: (ctx: RoutineContext) => Promise<string | void> | string | void;
}

export interface ScheduleSpec {
  cron: string;
  timezone?: string;
  prompt?: string;
  reason?: string;
  enabled?: boolean;
}

export interface SchedulerOptions {
  repo: Repo;
  db: DatabaseSync;
  clock?: () => Date;
  /** Fallback when the setting `workflow.catchUpHours` is unset. */
  catchUpWindowMs?: number;
}

const toRun = (r: Record<string, unknown>): ScheduleRun => ({
  id: String(r.id),
  scheduleId: String(r.schedule_id),
  dueAt: String(r.due_at),
  ranAt: String(r.ran_at),
  status: String(r.status) as RunStatus,
  delayMs: Number(r.delay_ms ?? 0),
  detail: r.detail == null ? null : String(r.detail),
});

export class Scheduler {
  private readonly repo: Repo;
  private readonly db: DatabaseSync;
  private readonly clock: () => Date;
  private readonly defaultWindowMs: number;
  private readonly routines = new Map<string, RoutineDef>();
  private readonly pollers: ((nowIso: string) => Promise<void> | void)[] = [];
  private running = false;

  constructor(opts: SchedulerOptions) {
    this.repo = opts.repo;
    this.db = opts.db;
    this.clock = opts.clock ?? (() => new Date());
    this.defaultWindowMs = opts.catchUpWindowMs ?? DEFAULT_CATCH_UP_WINDOW_MS;
  }

  now(): Date {
    return this.clock();
  }

  register(name: string, def: RoutineDef): void {
    this.routines.set(name, def);
  }

  /** A second-phase hook run on every pass (e.g. collecting stand-up replies). Must be cheap when idle. */
  addPoller(fn: (nowIso: string) => Promise<void> | void): void {
    this.pollers.push(fn);
  }

  catchUpWindowMs(): number {
    const hours = this.repo.getSetting('workflow.catchUpHours');
    return typeof hours === 'number' && hours > 0 ? hours * 3600_000 : this.defaultWindowMs;
  }

  /** Creates or updates a named recurring schedule. Safe to call on every start. */
  ensureSchedule(name: string, spec: ScheduleSpec, nowIso = this.clock().toISOString()): T.AgentSchedule {
    const key = name.trim();
    if (!key) throw new InputError('schedule name is required');
    const timezone = spec.timezone ?? 'UTC';
    if (!isValidTimeZone(timezone)) throw new InputError(`unknown timezone ${timezone}`);
    try {
      parseCron(spec.cron);
    } catch (e) {
      throw new InputError((e as Error).message);
    }
    const prompt = spec.prompt ?? `Recurring routine ${key}`;
    const existing = this.db.prepare('SELECT * FROM agent_schedules WHERE name = ?').get(key) as Record<string, unknown> | undefined;
    const nextRunAt = nextCronSlot(spec.cron, Date.parse(nowIso), timezone)?.toISOString();
    if (!nextRunAt) throw new InputError(`cron "${spec.cron}" never fires in ${timezone}`);

    if (existing) {
      const changed = existing.cron_expr !== spec.cron || existing.timezone !== timezone;
      this.repo.transact((emit, db) => {
        db.prepare(
          `UPDATE agent_schedules SET cron_expr = ?, timezone = ?, prompt = ?, reason = ?,
             next_run_at = CASE WHEN ? THEN ? ELSE next_run_at END,
             enabled = COALESCE(?, enabled) WHERE id = ?`
        ).run(spec.cron, timezone, prompt, spec.reason ?? null, changed ? 1 : 0, nextRunAt, spec.enabled === undefined ? null : spec.enabled ? 1 : 0, String(existing.id));
        if (changed) {
          emit({ type: 'schedule.updated', subjectId: String(existing.id), subjectType: 'schedule', actorId: SCHEDULER_ACTOR, actorKind: 'system', payload: { name: key, cron: spec.cron, timezone } });
        }
      });
      return this.repo.getSchedule(String(existing.id));
    }

    const id = `sched_${crypto.randomBytes(8).toString('hex')}`;
    this.repo.transact((emit, db) => {
      db.prepare(
        `INSERT INTO agent_schedules
           (id, agent_id, created_by, created_by_kind, kind, cron_expr, next_run_at, prompt, reason, enabled, max_runs, run_count, created_at, timezone, name)
         VALUES (?, ?, ?, 'system', 'cron', ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?)`
      ).run(id, SYSTEM_SCHEDULE_AGENT, SCHEDULER_ACTOR, spec.cron, nextRunAt, prompt, spec.reason ?? null, spec.enabled === false ? 0 : 1, nowIso, timezone, key);
      emit({ type: 'schedule.created', subjectId: id, subjectType: 'schedule', actorId: SCHEDULER_ACTOR, actorKind: 'system', payload: { scheduleId: id, name: key, cron: spec.cron, timezone, nextRunAt } });
    });
    return this.repo.getSchedule(id);
  }

  listRuns(scheduleId?: string, limit = 100): ScheduleRun[] {
    const cap = Math.min(Math.max(1, Math.floor(limit) || 100), 1000);
    const rows = scheduleId
      ? this.db.prepare('SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY due_at DESC, rowid DESC LIMIT ?').all(scheduleId, cap)
      : this.db.prepare('SELECT * FROM schedule_runs ORDER BY due_at DESC, rowid DESC LIMIT ?').all(cap);
    return (rows as Record<string, unknown>[]).map(toRun);
  }

  /** Records a slot; false when the slot already has a row (it was handled before). */
  private claim(scheduleId: string, dueAt: string, nowIso: string, status: RunStatus, delayMs: number, detail: string | null): boolean {
    const res = this.db
      .prepare('INSERT OR IGNORE INTO schedule_runs (id, schedule_id, due_at, ran_at, status, delay_ms, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(`run_${crypto.randomBytes(8).toString('hex')}`, scheduleId, dueAt, nowIso, status, delayMs, detail);
    return Number(res.changes) > 0;
  }

  /** Startup catch-up is the same pass as a tick: any slot whose time passed while the runtime was off is handled once. */
  async catchUp(nowIso = this.clock().toISOString()): Promise<ScheduleRun[]> {
    return this.runDue(nowIso);
  }

  /** One pass: runs due named schedules, then the pollers. Returns the runs recorded in this pass. */
  async runDue(nowIso = this.clock().toISOString()): Promise<ScheduleRun[]> {
    if (this.running) return [];
    this.running = true;
    const recorded: ScheduleRun[] = [];
    try {
      const nowMs = Date.parse(nowIso);
      const due = this.db
        .prepare("SELECT * FROM agent_schedules WHERE enabled = 1 AND name IS NOT NULL AND kind = 'cron' AND cron_expr IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at")
        .all(nowIso) as Record<string, unknown>[];
      for (const row of due) {
        try {
          recorded.push(...(await this.handleSchedule(row, nowMs, nowIso)));
        } catch (e) {
          console.error(`[scheduler] ${String(row.name)} failed:`, e);
        }
      }
      for (const poll of this.pollers) {
        try {
          await poll(nowIso);
        } catch (e) {
          console.error('[scheduler] poller failed:', e);
        }
      }
    } finally {
      this.running = false;
    }
    return recorded;
  }

  private async handleSchedule(row: Record<string, unknown>, nowMs: number, nowIso: string): Promise<ScheduleRun[]> {
    const id = String(row.id);
    const name = String(row.name);
    const expr = String(row.cron_expr);
    const tz = String(row.timezone ?? 'UTC');
    const window = this.catchUpWindowMs();
    const firstDue = Date.parse(String(row.next_run_at));

    // Slots from the stored next_run_at up to now. Beyond the catch-up window they are not enumerated: one
    // skipped row marks the gap, so nothing is lost silently and a long outage costs one query.
    const slots: number[] = [];
    let beyondWindow = false;
    let cursor = firstDue;
    if (firstDue < nowMs - window) {
      beyondWindow = true;
      cursor = nowMs - window;
      let s = nextCronSlot(expr, cursor, tz)?.getTime();
      while (s !== undefined && s <= nowMs) {
        slots.push(s);
        s = nextCronSlot(expr, s, tz)?.getTime();
      }
    } else {
      slots.push(firstDue);
      let s = nextCronSlot(expr, firstDue, tz)?.getTime();
      while (s !== undefined && s <= nowMs) {
        slots.push(s);
        s = nextCronSlot(expr, s, tz)?.getTime();
      }
    }

    const out: ScheduleRun[] = [];
    const record = (dueMs: number, status: RunStatus, detail: string | null): boolean => {
      const dueAt = new Date(dueMs).toISOString();
      const delay = Math.max(0, nowMs - dueMs);
      return this.claim(id, dueAt, nowIso, status, delay, detail);
    };
    const fetchRun = (dueMs: number) => toRun(this.db.prepare('SELECT * FROM schedule_runs WHERE schedule_id = ? AND due_at = ?').get(id, new Date(dueMs).toISOString()) as Record<string, unknown>);

    if (beyondWindow && record(firstDue, 'skipped', `missed beyond the ${Math.round(window / 3600_000)}h catch-up window; slots up to ${new Date(nowMs - window).toISOString()} are not run`)) {
      out.push(fetchRun(firstDue));
    }
    const latest = slots[slots.length - 1];
    for (const s of slots.slice(0, -1)) {
      if (record(s, 'skipped', 'missed while the runtime was off; only the latest due slot is run')) out.push(fetchRun(s));
    }

    let executed = false;
    if (latest !== undefined) {
      const def = this.routines.get(name);
      const delay = Math.max(0, nowMs - latest);
      const status: 'ran' | 'caught_up' = delay <= ON_TIME_GRACE_MS ? 'ran' : 'caught_up';
      const flagOn = !def?.flag || this.repo.getSetting(def.flag) === true;
      if (!def) {
        if (record(latest, 'skipped', 'no handler registered')) out.push(fetchRun(latest));
      } else if (!flagOn) {
        if (record(latest, 'skipped', 'disabled')) out.push(fetchRun(latest));
      } else if (record(latest, status, null)) {
        executed = true;
        const dueAt = new Date(latest).toISOString();
        let finalStatus: RunStatus = status;
        let detail: string | null = null;
        try {
          const schedule = this.repo.getSchedule(id);
          const result = await def.handler({ schedule, dueAt, now: nowIso, status, delayMs: delay });
          detail = typeof result === 'string' ? result : null;
        } catch (e) {
          finalStatus = 'failed';
          detail = (e as Error).message;
        }
        this.db.prepare('UPDATE schedule_runs SET status = ?, detail = ? WHERE schedule_id = ? AND due_at = ?').run(finalStatus, detail, id, dueAt);
        out.push(fetchRun(latest));
      }
    }

    const next = nextCronSlot(expr, nowMs, tz)?.toISOString() ?? new Date(nowMs + 24 * 3600_000).toISOString();
    this.repo.transact((emit, db) => {
      db.prepare('UPDATE agent_schedules SET next_run_at = ?, last_run_at = ?, run_count = run_count + ? WHERE id = ?').run(next, nowIso, executed ? 1 : 0, id);
      for (const r of out) {
        emit({
          type: 'schedule.run',
          subjectId: id,
          subjectType: 'schedule',
          actorId: SCHEDULER_ACTOR,
          actorKind: 'system',
          payload: { name, dueAt: r.dueAt, status: r.status, delayMs: r.delayMs, detail: r.detail },
        });
      }
    });
    return out;
  }
}
