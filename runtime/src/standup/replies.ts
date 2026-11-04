// Agent replies for the open stand-up run (WP6 6.3). Shared by the `standup_submit` MCP tool and the
// bracket-directive fallback. Replies are stored verbatim and always labelled agent-reported.

import crypto from 'node:crypto';
import { InputError, type Repo } from '../store/repo.ts';

export const STANDUP_TEAM = 'default';

export interface StandupReply {
  done: string;
  next: string;
  blockers: string[];
}

export interface AgentEntry {
  agentId: string;
  /** requested = asked to report; absent = not asked (offline or not active in the window). */
  state: 'requested' | 'absent';
  reason: string | null;
}

const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function normaliseReply(input: { done?: unknown; next?: unknown; blockers?: unknown }): StandupReply {
  const raw = Array.isArray(input.blockers) ? input.blockers : typeof input.blockers === 'string' ? input.blockers.split(/\n|;/) : [];
  const blockers = raw.map((b) => clip(b, 500)).filter((b) => b && !/^(none|n\/a|no blockers?|-)$/i.test(b)).slice(0, 10);
  return { done: clip(input.done, 4000), next: clip(input.next, 4000), blockers };
}

/** `[STANDUP: done=… | next=… | blockers=a; b]`, a single line. Returns null when the line is not that directive. */
export function parseStandupDirective(line: string): StandupReply | null {
  const m = line.trim().match(/^\[STANDUP:\s*(.*)\]$/i);
  if (!m) return null;
  const fields: Record<string, string> = {};
  for (const part of m[1]!.split(/\s*\|\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0) fields[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  if (!('done' in fields) && !('next' in fields) && !('blockers' in fields)) return null;
  return normaliseReply(fields);
}

/** The run currently collecting replies, if any. */
export function collectingRun(repo: Repo): { id: string; agents: AgentEntry[]; deadlineAt: string } | null {
  return repo.transact((_emit, db) => {
    const row = db.prepare("SELECT id, agents, deadline_at FROM standup_runs WHERE status = 'collecting' ORDER BY requested_at DESC LIMIT 1").get() as
      | { id: string; agents: string; deadline_at: string }
      | undefined;
    if (!row) return null;
    return { id: row.id, agents: JSON.parse(row.agents) as AgentEntry[], deadlineAt: row.deadline_at };
  });
}

/**
 * Stores the agent's reply for the open run. Rejects (InputError) when no stand-up is collecting or the
 * agent was not asked to report. A second submission replaces the first while the run is still open.
 */
export function submitReply(repo: Repo, agentId: string, input: { done?: unknown; next?: unknown; blockers?: unknown }, nowIso: string, source: 'tool' | 'directive' = 'tool'): { runId: string } {
  const reply = normaliseReply(input);
  if (!reply.done && !reply.next && !reply.blockers.length) throw new InputError('Provide at least one of done, next or blockers');
  const run = collectingRun(repo);
  if (!run) throw new InputError('No stand-up is collecting replies right now');
  if (!run.agents.some((a) => a.agentId === agentId && a.state === 'requested')) {
    throw new InputError('You were not asked to report in the open stand-up');
  }
  repo.transact((emit, db) => {
    db.prepare(
      `INSERT INTO standup_replies (id, run_id, agent_id, done, next, blockers, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id, agent_id) DO UPDATE SET done = excluded.done, next = excluded.next, blockers = excluded.blockers, source = excluded.source, created_at = excluded.created_at`
    ).run(`sur_${crypto.randomBytes(8).toString('hex')}`, run.id, agentId, reply.done, reply.next, JSON.stringify(reply.blockers), source, nowIso);
    emit({ type: 'standup.reply_received', subjectId: run.id, subjectType: 'standup', actorId: agentId, actorKind: 'agent', payload: { runId: run.id, source } });
  });
  return { runId: run.id };
}
