import crypto from 'node:crypto';
import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Workforce time ledger (programme plan K6, WP9 9.1–9.5).
 *
 * - Agent time = one interval per turn (prompt sent → turn end), keyed (session_id, turn_id), so a
 *   replay or reconnect can never count a turn twice. A session renewal starts new turns under the
 *   same identity.
 * - Human time comes only from explicit timers or manual entries, never from agent activity.
 * - Agent intervals are always non-billable; they may point at the human billable interval they
 *   supported (`supports_interval_id`).
 * - Corrections are new `adjustment` rows; original rows are never rewritten.
 */

type Row = Record<string, unknown>;
const id = (p: string) => `${p}_${crypto.randomBytes(8).toString('hex')}`;
const ms = (a: string, b: string) => Math.max(0, Date.parse(b) - Date.parse(a));

export const HUMAN_CATEGORIES = ['implementation', 'prompting', 'planning', 'review', 'meetings', 'testing', 'admin', 'other'] as const;
export const AGENT_CATEGORIES = ['execute', 'plan', 'review', 'verify', 'standup'] as const;

export class LedgerError extends Error {}

export class Ledger {
  private readonly db: DatabaseSync;
  private readonly now: () => Date;

  constructor(db: DatabaseSync, now: () => Date = () => new Date()) {
    this.db = db;
    this.now = now;
  }

  // ------------------------------------------------------------ agent turns

  /** Records the turn that ended at transcript entry `turnEndSeq` (idempotent). */
  recordTurn(sessionId: string, turnEndSeq: number): string | null {
    const end = this.db.prepare("SELECT seq, created_at FROM transcript_entries WHERE session_id = ? AND seq = ? AND kind = 'turn_end'").get(sessionId, turnEndSeq) as Row | undefined;
    if (!end) return null;
    const start = this.db
      .prepare("SELECT seq, created_at FROM transcript_entries WHERE session_id = ? AND kind = 'prompt' AND seq < ? ORDER BY seq DESC LIMIT 1")
      .get(sessionId, turnEndSeq) as Row | undefined;
    if (!start) return null;
    return this.insertTurn(sessionId, String(start.seq), String(start.created_at), String(end.created_at), 'turn_end');
  }

  /**
   * Closes turns that never got a turn_end (crash, restart, cancel) at the session's last event,
   * marked `closed_by = recovery`. Safe to call repeatedly.
   */
  reconcileOpenTurns(): number {
    const rows = this.db
      .prepare(
        `SELECT p.session_id, p.seq, p.created_at AS started, s.last_event_at, s.state, s.ended_at
           FROM transcript_entries p JOIN sessions s ON s.id = p.session_id
          WHERE p.kind = 'prompt'
            AND s.state IN ('idle','stopped','failed')
            AND NOT EXISTS (SELECT 1 FROM activity_intervals a WHERE a.session_id = p.session_id AND a.turn_id = CAST(p.seq AS TEXT))
            AND NOT EXISTS (SELECT 1 FROM transcript_entries e WHERE e.session_id = p.session_id AND e.kind = 'turn_end' AND e.seq > p.seq
                              AND NOT EXISTS (SELECT 1 FROM transcript_entries p2 WHERE p2.session_id = p.session_id AND p2.kind = 'prompt' AND p2.seq > p.seq AND p2.seq < e.seq))`
      )
      .all() as Row[];
    let n = 0;
    for (const r of rows) {
      const next = this.db
        .prepare("SELECT created_at FROM transcript_entries WHERE session_id = ? AND seq > ? ORDER BY seq DESC LIMIT 1")
        .get(String(r.session_id), Number(r.seq)) as Row | undefined;
      const endAt = String(next?.created_at ?? r.last_event_at ?? r.ended_at ?? r.started);
      if (this.insertTurn(String(r.session_id), String(r.seq), String(r.started), endAt, 'recovery')) n++;
    }
    return n;
  }

  private insertTurn(sessionId: string, turnId: string, startedAt: string, endedAt: string, closedBy: string): string | null {
    const s = this.db
      .prepare('SELECT s.agent_id, s.job_id, s.task_id, s.mode, j.project_id FROM sessions s LEFT JOIN jobs j ON j.id = s.job_id WHERE s.id = ?')
      .get(sessionId) as Row | undefined;
    if (!s) return null;
    const category = s.mode === 'design' ? 'execute' : s.task_id ? 'execute' : s.job_id ? 'plan' : 'execute';
    const rid = id('ai');
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO activity_intervals
           (id, actor_kind, identity_id, session_id, turn_id, job_id, task_id, project_id, category, started_at, ended_at, duration_ms, source, billable_status, closed_by, created_by, created_at)
         VALUES (?, 'agent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'turn', 'non_billable', ?, 'runtime', ?)`
      )
      .run(rid, String(s.agent_id), sessionId, turnId, (s.job_id as string) ?? null, (s.task_id as string) ?? null, (s.project_id as string) ?? null, category, startedAt, endedAt, ms(startedAt, endedAt), closedBy, this.now().toISOString());
    return Number(res.changes) > 0 ? rid : null;
  }

  // ------------------------------------------------------------ human time

  startTimer(input: { identityId: string; category?: string; jobId?: string | null; taskId?: string | null; projectId?: string | null; engagementId?: string | null; note?: string | null }): Row {
    const category = this.humanCategory(input.category);
    const open = this.db.prepare("SELECT id FROM activity_intervals WHERE identity_id = ? AND source = 'timer' AND ended_at IS NULL").get(input.identityId);
    if (open) throw new LedgerError('A timer is already running; stop it first');
    const rid = id('ai');
    const t = this.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO activity_intervals (id, actor_kind, identity_id, job_id, task_id, project_id, engagement_id, category, started_at, source, billable_status, note, created_by, created_at)
         VALUES (?, 'human', ?, ?, ?, ?, ?, ?, ?, 'timer', ?, ?, ?, ?)`
      )
      .run(rid, input.identityId, input.jobId ?? null, input.taskId ?? null, input.projectId ?? null, input.engagementId ?? null, category, t, this.defaultBillable(input.engagementId ?? null, category), input.note ?? null, input.identityId, t);
    return this.get(rid);
  }

  stopTimer(identityId: string): Row {
    const open = this.db.prepare("SELECT * FROM activity_intervals WHERE identity_id = ? AND source = 'timer' AND ended_at IS NULL").get(identityId) as Row | undefined;
    if (!open) throw new LedgerError('No timer is running');
    const t = this.now().toISOString();
    this.db.prepare('UPDATE activity_intervals SET ended_at = ?, duration_ms = ? WHERE id = ?').run(t, ms(String(open.started_at), t), String(open.id));
    return this.get(String(open.id));
  }

  addManual(input: { identityId: string; startedAt: string; endedAt: string; category?: string; jobId?: string | null; taskId?: string | null; projectId?: string | null; engagementId?: string | null; billable?: boolean; note?: string | null }): Row {
    const category = this.humanCategory(input.category);
    if (!(Date.parse(input.endedAt) > Date.parse(input.startedAt))) throw new LedgerError('endedAt must be after startedAt');
    const rid = id('ai');
    const billable = input.billable === undefined ? this.defaultBillable(input.engagementId ?? null, category) : input.billable ? 'billable' : 'non_billable';
    this.db
      .prepare(
        `INSERT INTO activity_intervals (id, actor_kind, identity_id, job_id, task_id, project_id, engagement_id, category, started_at, ended_at, duration_ms, source, billable_status, note, created_by, created_at)
         VALUES (?, 'human', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?)`
      )
      .run(rid, input.identityId, input.jobId ?? null, input.taskId ?? null, input.projectId ?? null, input.engagementId ?? null, category, input.startedAt, input.endedAt, ms(input.startedAt, input.endedAt), billable, input.note ?? null, input.identityId, this.now().toISOString());
    return this.get(rid);
  }

  /** Corrects an interval by adding an adjustment row (± milliseconds). The original is never changed. */
  adjust(intervalId: string, input: { deltaMs: number; note: string; by: string }): Row {
    const orig = this.get(intervalId);
    if (!input.note?.trim()) throw new LedgerError('An adjustment needs a note');
    if (!Number.isFinite(input.deltaMs) || input.deltaMs === 0) throw new LedgerError('deltaMs must be a non-zero number');
    const rid = id('ai');
    const t = this.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO activity_intervals (id, actor_kind, identity_id, session_id, job_id, task_id, project_id, engagement_id, category, started_at, ended_at, duration_ms, source, billable_status, adjusts_interval_id, note, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'adjustment', ?, ?, ?, ?, ?)`
      )
      .run(rid, String(orig.actor_kind), String(orig.identity_id), (orig.session_id as string) ?? null, (orig.job_id as string) ?? null, (orig.task_id as string) ?? null, (orig.project_id as string) ?? null, (orig.engagement_id as string) ?? null, String(orig.category), String(orig.started_at), (orig.ended_at as string) ?? null, Math.round(input.deltaMs), String(orig.billable_status), intervalId, input.note, input.by, t);
    return this.get(rid);
  }

  /** Links an agent interval to the human billable interval it supported. The agent row stays non-billable. */
  linkSupport(agentIntervalId: string, humanIntervalId: string): Row {
    const a = this.get(agentIntervalId);
    const h = this.get(humanIntervalId);
    if (a.actor_kind !== 'agent' || h.actor_kind !== 'human') throw new LedgerError('Link an agent interval to a human interval');
    this.db.prepare('UPDATE activity_intervals SET supports_interval_id = ? WHERE id = ?').run(humanIntervalId, agentIntervalId);
    return this.get(agentIntervalId);
  }

  get(intervalId: string): Row {
    const r = this.db.prepare('SELECT * FROM activity_intervals WHERE id = ?').get(intervalId) as Row | undefined;
    if (!r) throw new LedgerError(`interval ${intervalId} not found`);
    return r;
  }

  list(filter: { from?: string; to?: string; identityId?: string; jobId?: string; actorKind?: string } = {}): Row[] {
    const where: string[] = [];
    const params: string[] = [];
    if (filter.from) (where.push('started_at >= ?'), params.push(filter.from));
    if (filter.to) (where.push('started_at < ?'), params.push(filter.to));
    if (filter.identityId) (where.push('identity_id = ?'), params.push(filter.identityId));
    if (filter.jobId) (where.push('job_id = ?'), params.push(filter.jobId));
    if (filter.actorKind) (where.push('actor_kind = ?'), params.push(filter.actorKind));
    return this.db.prepare(`SELECT * FROM activity_intervals ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at`).all(...params) as Row[];
  }

  // ------------------------------------------------------------ summaries

  /**
   * Totals for a period. Agent-hours sum every agent interval; elapsed agent time is the union of
   * agent intervals (4 agents for 1 hour = 4 agent-hours in 1 elapsed hour). Adjustments are included.
   */
  summary(from: string, to: string, engagementId?: string): Record<string, unknown> {
    const rows = this.list({ from, to }).filter((r) => r.ended_at || r.source === 'adjustment');
    const scoped = engagementId ? rows.filter((r) => r.actor_kind === 'agent' || r.engagement_id === engagementId) : rows;
    const sum = (pred: (r: Row) => boolean) => scoped.filter(pred).reduce((a, r) => a + Number(r.duration_ms ?? 0), 0);
    const human = (r: Row) => r.actor_kind === 'human';
    const agent = (r: Row) => r.actor_kind === 'agent';
    const hours = (x: number) => Math.round((x / 3_600_000) * 100) / 100;
    const agentIntervals = scoped.filter((r) => agent(r) && r.source !== 'adjustment' && r.ended_at).map((r) => [Date.parse(String(r.started_at)), Date.parse(String(r.ended_at))] as [number, number]);
    const byAgent: Record<string, number> = {};
    for (const r of scoped.filter(agent)) byAgent[String(r.identity_id)] = (byAgent[String(r.identity_id)] ?? 0) + Number(r.duration_ms ?? 0);
    const out: Record<string, unknown> = {
      from,
      to,
      humanHours: hours(sum(human)),
      billableHumanHours: hours(sum((r) => human(r) && r.billable_status === 'billable')),
      nonBillableHumanHours: hours(sum((r) => human(r) && r.billable_status !== 'billable')),
      agentHours: hours(sum(agent)),
      agentElapsedHours: hours(unionMs(agentIntervals)),
      agentHoursByIdentity: Object.fromEntries(Object.entries(byAgent).map(([k, v]) => [k, hours(v)])),
      combinedHours: hours(sum(() => true)),
      measurement: 'actual',
    };
    if (engagementId) {
      const e = this.db.prepare('SELECT * FROM engagements WHERE id = ?').get(engagementId) as Row | undefined;
      if (e) {
        const billable = Number(out.billableHumanHours);
        out.engagement = {
          id: e.id,
          minWeeklyHours: e.min_weekly_hours ?? null,
          maxWeeklyHours: e.max_weekly_hours ?? null,
          remainingToMin: e.min_weekly_hours == null ? null : Math.max(0, Number(e.min_weekly_hours) - billable),
          remainingToMax: e.max_weekly_hours == null ? null : Math.max(0, Number(e.max_weekly_hours) - billable),
          estimatedBillableValueMinor: e.hourly_rate_minor == null ? null : Math.round(billable * Number(e.hourly_rate_minor)),
          currency: e.currency ?? null,
          paySchedule: e.pay_schedule ?? 'unknown',
          agentHoursBillable: Number(e.allow_agent_billing) === 1,
        };
      }
    }
    return out;
  }

  // ------------------------------------------------------------ engagements (local file only)

  /**
   * Loads engagement profiles from an untracked local file (default ~/.myaos/engagements.local.json).
   * Client terms never live in the repository (programme plan K6/K9).
   */
  loadEngagements(file: string): number {
    if (!fs.existsSync(file)) return 0;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { engagements?: Row[] };
    let n = 0;
    for (const e of parsed.engagements ?? []) {
      if (typeof e.id !== 'string' || typeof e.client !== 'string') continue;
      this.db
        .prepare(
          `INSERT INTO engagements (id, client, role, hourly_rate_minor, currency, min_weekly_hours, max_weekly_hours, start_date, end_date, external_time_system, external_task_system, pay_schedule, allow_agent_billing, ai_account_id, confidential, source, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_file', ?)
           ON CONFLICT(id) DO UPDATE SET client=excluded.client, role=excluded.role, hourly_rate_minor=excluded.hourly_rate_minor, currency=excluded.currency,
             min_weekly_hours=excluded.min_weekly_hours, max_weekly_hours=excluded.max_weekly_hours, start_date=excluded.start_date, end_date=excluded.end_date,
             external_time_system=excluded.external_time_system, external_task_system=excluded.external_task_system, pay_schedule=excluded.pay_schedule,
             allow_agent_billing=excluded.allow_agent_billing, ai_account_id=excluded.ai_account_id, confidential=excluded.confidential, updated_at=excluded.updated_at`
        )
        .run(
          e.id, e.client, (e.role as string) ?? null, (e.hourly_rate_minor as number) ?? null, (e.currency as string) ?? null,
          (e.min_weekly_hours as number) ?? null, (e.max_weekly_hours as number) ?? null, (e.start_date as string) ?? null, (e.end_date as string) ?? null,
          (e.external_time_system as string) ?? null, (e.external_task_system as string) ?? null, (e.pay_schedule as string) ?? 'unknown',
          e.allow_agent_billing === true ? 1 : 0, (e.ai_account_id as string) ?? null, e.confidential === false ? 0 : 1, this.now().toISOString()
        );
      n++;
    }
    return n;
  }

  private humanCategory(c: string | undefined): string {
    const category = c ?? 'implementation';
    if (!(HUMAN_CATEGORIES as readonly string[]).includes(category)) throw new LedgerError(`category must be one of ${HUMAN_CATEGORIES.join(', ')}`);
    return category;
  }

  private defaultBillable(engagementId: string | null, _category: string): string {
    // Human time on an engagement is billable by default (the owner can mark it otherwise); without one it is unclassified.
    return engagementId ? 'billable' : 'unclassified';
  }
}

/** Total length of the union of [start, end] ranges, in milliseconds. */
export function unionMs(ranges: [number, number][]): number {
  const sorted = ranges.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const r of sorted) {
    if (!cur || r[0] > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [r[0], r[1]];
    } else cur[1] = Math.max(cur[1], r[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}
