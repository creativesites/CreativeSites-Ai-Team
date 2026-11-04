// Daily stand-up pipeline (WP6 6.3). Phase one (the schedule slot, or run-now) gathers the roster, asks each
// active agent for a report through the wake path and records `standup.requested`. Phase two runs on later
// scheduler passes (poll): once everyone replied or the deadline passed it compiles one report, persists it,
// opens the reported blockers and records `standup.completed`. Nothing blocks while waiting.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type * as T from '../api/types.ts';
import { dateInZone } from '../scheduler/cron.ts';
import type { RoutineContext } from '../scheduler/scheduler.ts';
import type { Repo } from '../store/repo.ts';
import { activeActors, gatherFacts } from './facts.ts';
import { compileReport, renderMarkdown, type StandupReport } from './report.ts';
import { STANDUP_TEAM, type AgentEntry, type StandupReply } from './replies.ts';

export const STANDUP_SCHEDULE = 'daily-standup';
export const STANDUP_CRON = '0 10 * * 1-5';
export const STANDUP_TZ = 'Africa/Lusaka';
export const STANDUP_FLAG = 'workflow.standups';
export const STANDUP_ACTOR = 'runtime:standup';
export const DEFAULT_REPLY_MINUTES = 10;
const DEFAULT_WINDOW_MS = 24 * 3600_000;

export interface StandupDeps {
  repo: Repo;
  db: DatabaseSync;
  clock?: () => Date;
  /** Asks an agent to report, through the existing wake path. */
  wake: (agentId: string, prompt: string) => Promise<unknown>;
  /** Why the agent's adapter cannot run right now (rate limit, not installed, no auth); null when it can. */
  adapterBlocked?: (agent: T.Identity) => string | null;
}

export interface StandupRunInfo {
  id: string;
  teamId: string;
  date: string;
  status: 'collecting' | 'completed';
  requestedAt: string;
  deadlineAt: string;
  since: string;
  completedAt: string | null;
  agents: AgentEntry[];
  standupId: number | null;
}

type Row = Record<string, unknown>;

const toRun = (r: Row): StandupRunInfo => ({
  id: String(r.id),
  teamId: String(r.team_id),
  date: String(r.standup_date),
  status: String(r.status) as 'collecting' | 'completed',
  requestedAt: String(r.requested_at),
  deadlineAt: String(r.deadline_at),
  since: String(r.since),
  completedAt: r.completed_at == null ? null : String(r.completed_at),
  agents: JSON.parse(String(r.agents)) as AgentEntry[],
  standupId: r.standup_id == null ? null : Number(r.standup_id),
});

export class StandupService {
  private readonly repo: Repo;
  private readonly db: DatabaseSync;
  private readonly clock: () => Date;
  private readonly deps: StandupDeps;

  constructor(deps: StandupDeps) {
    this.deps = deps;
    this.repo = deps.repo;
    this.db = deps.db;
    this.clock = deps.clock ?? (() => new Date());
  }

  enabled(): boolean {
    return this.repo.getSetting(STANDUP_FLAG) === true;
  }

  replyMinutes(): number {
    const v = this.repo.getSetting('workflow.standupReplyMinutes');
    return typeof v === 'number' && v >= 0 ? v : DEFAULT_REPLY_MINUTES;
  }

  getRun(date: string, teamId = STANDUP_TEAM): StandupRunInfo | null {
    const row = this.db.prepare('SELECT * FROM standup_runs WHERE team_id = ? AND standup_date = ?').get(teamId, date) as Row | undefined;
    return row ? toRun(row) : null;
  }

  /** Scheduler handler for the 'daily-standup' slot. */
  async onSlot(ctx: RoutineContext): Promise<string> {
    const date = dateInZone(Date.parse(ctx.dueAt), STANDUP_TZ);
    const { run, existing } = await this.startRun(date, ctx.now);
    return existing ? `stand-up ${date} already ${run.status}` : `stand-up ${date} requested from ${run.agents.filter((a) => a.state === 'requested').length} agents`;
  }

  /** Owner-initiated run for today's date (Lusaka). Idempotent: a second call returns the same run. */
  async runNow(nowIso = this.clock().toISOString()): Promise<{ run: StandupRunInfo; existing: boolean }> {
    return this.startRun(dateInZone(Date.parse(nowIso), STANDUP_TZ), nowIso);
  }

  async startRun(date: string, nowIso: string): Promise<{ run: StandupRunInfo; existing: boolean }> {
    const prior = this.getRun(date);
    if (prior) return { run: prior, existing: true };

    const lastDone = this.db.prepare("SELECT completed_at FROM standup_runs WHERE status = 'completed' AND team_id = ? ORDER BY completed_at DESC LIMIT 1").get(STANDUP_TEAM) as Row | undefined;
    const since = lastDone?.completed_at ? String(lastDone.completed_at) : new Date(Date.parse(nowIso) - DEFAULT_WINDOW_MS).toISOString();
    const deadlineAt = new Date(Date.parse(nowIso) + this.replyMinutes() * 60_000).toISOString();

    const active = activeActors(this.db, since);
    const entries: AgentEntry[] = [];
    for (const a of this.repo.listIdentities().filter((i) => !i.isOwner && !i.archived)) {
      const blocked = this.deps.adapterBlocked?.(a) ?? null;
      if (!active.has(a.id)) entries.push({ agentId: a.id, state: 'absent', reason: 'not active: no sessions or task events since the last stand-up' });
      else if (blocked) entries.push({ agentId: a.id, state: 'absent', reason: `offline: ${blocked}` });
      else entries.push({ agentId: a.id, state: 'requested', reason: null });
    }

    const id = `sur_${crypto.randomBytes(8).toString('hex')}`;
    const inserted = this.repo.transact((emit, db) => {
      const res = db
        .prepare('INSERT OR IGNORE INTO standup_runs (id, team_id, standup_date, status, requested_at, deadline_at, since, agents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, STANDUP_TEAM, date, 'collecting', nowIso, deadlineAt, since, JSON.stringify(entries));
      if (Number(res.changes) === 0) return false;
      emit({
        type: 'standup.requested',
        subjectId: id,
        subjectType: 'standup',
        actorId: STANDUP_ACTOR,
        actorKind: 'system',
        payload: { runId: id, date, since, deadlineAt, requested: entries.filter((e) => e.state === 'requested').map((e) => e.agentId), absent: entries.filter((e) => e.state === 'absent').map((e) => e.agentId) },
      });
      return true;
    });
    if (!inserted) return { run: this.getRun(date)!, existing: true };

    const prompt = [
      `Daily stand-up for ${date}. Please report briefly on your work since ${since}.`,
      'Call the MCP tool `standup_submit` with {done, next, blockers}: done = what you finished, next = what you will do next, blockers = a list of anything blocking you (empty if none).',
      'Report only what you actually did; the runtime checks your claims against its records. Do not start new work for this.',
      'If you cannot call tools, reply with a single line: [STANDUP: done=... | next=... | blockers=first; second]',
    ].join('\n');
    for (const e of entries.filter((x) => x.state === 'requested')) {
      try {
        await this.deps.wake(e.agentId, prompt);
      } catch (err) {
        e.state = 'absent';
        e.reason = `offline: could not be woken (${(err as Error).message.slice(0, 120)})`;
        this.db.prepare('UPDATE standup_runs SET agents = ? WHERE id = ?').run(JSON.stringify(entries), id);
      }
    }

    // Nobody to wait for: compile now. Otherwise phase two happens in poll().
    if (!entries.some((e) => e.state === 'requested')) this.finalize(id, nowIso);
    return { run: this.getRun(date)!, existing: false };
  }

  /** Phase two. Finalises each collecting run once all asked agents replied or the deadline passed. */
  poll(nowIso: string): string[] {
    const done: string[] = [];
    for (const r of this.db.prepare("SELECT * FROM standup_runs WHERE status = 'collecting'").all() as Row[]) {
      const run = toRun(r);
      const asked = run.agents.filter((a) => a.state === 'requested').map((a) => a.agentId);
      const replied = new Set((this.db.prepare('SELECT agent_id FROM standup_replies WHERE run_id = ?').all(run.id) as Row[]).map((x) => String(x.agent_id)));
      if (nowIso >= run.deadlineAt || asked.every((a) => replied.has(a))) {
        this.finalize(run.id, nowIso);
        done.push(run.id);
      }
    }
    return done;
  }

  private finalize(runId: string, nowIso: string): void {
    const row = this.db.prepare('SELECT * FROM standup_runs WHERE id = ?').get(runId) as Row | undefined;
    if (!row) return;
    const run = toRun(row);
    if (run.status !== 'collecting') return;

    const replies = new Map<string, StandupReply>();
    for (const r of this.db.prepare('SELECT * FROM standup_replies WHERE run_id = ?').all(runId) as Row[]) {
      replies.set(String(r.agent_id), { done: String(r.done), next: String(r.next), blockers: JSON.parse(String(r.blockers)) as string[] });
    }
    const roster = this.repo.listIdentities().filter((i) => !i.isOwner && !i.archived).map((i) => ({ id: i.id, name: i.name }));
    const report = compileReport({ date: run.date, generatedAt: nowIso, teamId: run.teamId, facts: gatherFacts(this.db, run.since), roster, entries: run.agents, replies });
    const markdown = renderMarkdown(report);

    let standupId = 0;
    this.repo.transact((emit, db) => {
      const claimed = db.prepare("UPDATE standup_runs SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'collecting'").run(nowIso, runId);
      if (Number(claimed.changes) === 0) return;
      db.prepare(
        `INSERT OR IGNORE INTO standups (standup_date, facilitator, present_identities, absent_identities, content, parsed_updates, ts, team_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        run.date,
        STANDUP_ACTOR,
        JSON.stringify(report.agents.filter((a) => a.status === 'reported').map((a) => a.agentId)),
        JSON.stringify(report.agents.filter((a) => a.status !== 'reported').map((a) => a.agentId)),
        markdown,
        JSON.stringify(report),
        nowIso,
        run.teamId
      );
      standupId = Number((db.prepare('SELECT id FROM standups WHERE team_id = ? AND standup_date = ?').get(run.teamId, run.date) as Row).id);
      db.prepare('UPDATE standup_runs SET standup_id = ? WHERE id = ?').run(standupId, runId);

      for (const a of report.agents) {
        for (const summary of a.reported?.blockers ?? []) {
          const blockerId = `blk_${crypto.randomBytes(8).toString('hex')}`;
          db.prepare('INSERT INTO blockers (id, job_id, task_id, raised_by, summary, needs, severity, created_at) VALUES (?, NULL, NULL, ?, ?, NULL, ?, ?)').run(blockerId, a.agentId, summary, 'normal', nowIso);
          emit({ type: 'blocker.opened', subjectId: blockerId, subjectType: 'blocker', actorId: a.agentId, actorKind: 'agent', payload: { blockerId, source: 'standup', runId, summary } });
        }
      }
      emit({
        type: 'standup.completed',
        subjectId: runId,
        subjectType: 'standup',
        actorId: STANDUP_ACTOR,
        actorKind: 'system',
        payload: { runId, standupId, date: run.date, ...report.summary },
      });
    });

    this.writeMarkdown(run.date, markdown, standupId);
  }

  /** Markdown copy, only when `workflow.standupMarkdownDir` is set. */
  private writeMarkdown(date: string, markdown: string, standupId: number): void {
    const dir = this.repo.getSetting('workflow.standupMarkdownDir');
    if (typeof dir !== 'string' || !dir.trim() || !standupId) return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${date}_standup.md`);
      fs.writeFileSync(file, markdown);
      this.db.prepare('UPDATE standups SET original_file_path = ? WHERE id = ?').run(file, standupId);
    } catch (e) {
      console.warn('[standup] could not write the markdown copy:', (e as Error).message);
    }
  }

  /** Latest V2 stand-up, with its structured report. */
  latest(): { id: number; date: string; ts: string; report: StandupReport | null; markdown: string | null; filePath: string | null } | null {
    const r = this.db.prepare('SELECT * FROM standups WHERE team_id = ? ORDER BY standup_date DESC LIMIT 1').get(STANDUP_TEAM) as Row | undefined;
    if (!r) return null;
    let report: StandupReport | null = null;
    try {
      report = JSON.parse(String(r.parsed_updates)) as StandupReport;
    } catch {
      report = null;
    }
    return { id: Number(r.id), date: String(r.standup_date), ts: String(r.ts), report, markdown: r.content == null ? null : String(r.content), filePath: r.original_file_path == null ? null : String(r.original_file_path) };
  }
}
