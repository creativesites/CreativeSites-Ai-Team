// Facts for a stand-up come from the store's events and records, never from what an agent says (WP6 6.3 a).
// Reference for the gather logic: scripts/generate_daily_standup.mjs (v1).

import type { DatabaseSync } from 'node:sqlite';

export interface AgentFacts {
  tasksCompleted: { taskId: string; title: string; status: 'done' | 'verified'; jobId: string | null }[];
  evidence: { id: string; kind: string; class: string; summary: string; taskId: string | null; jobId: string | null }[];
  blockersOpened: { id: string; summary: string }[];
  blockersResolved: { id: string; summary: string }[];
  jobStageChanges: { jobId: string; from: string | null; to: string | null }[];
  sessionsFailed: { sessionId: string; error: string | null }[];
}

export const emptyFacts = (): AgentFacts => ({
  tasksCompleted: [],
  evidence: [],
  blockersOpened: [],
  blockersResolved: [],
  jobStageChanges: [],
  sessionsFailed: [],
});

export interface GatheredFacts {
  since: string;
  byActor: Record<string, AgentFacts>;
  /** Everything in the window, whoever did it. */
  all: AgentFacts;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v == null ? null : String(v));

export function gatherFacts(db: DatabaseSync, since: string): GatheredFacts {
  const byActor: Record<string, AgentFacts> = {};
  const all = emptyFacts();
  const of = (actor: string | null): AgentFacts => {
    const k = actor ?? 'unknown';
    return (byActor[k] ??= emptyFacts());
  };

  // Tasks transitioned to done / verified. Credit goes to the assignee, else the actor of the transition.
  for (const r of db
    .prepare(
      `SELECT e.type, e.actor_id, e.task_id, e.job_id, t.title, t.assignee_id
         FROM events e LEFT JOIN tasks t ON t.id = e.task_id
        WHERE e.type IN ('task.done','task.verified') AND e.created_at > ? ORDER BY e.seq`
    )
    .all(since) as Row[]) {
    const item = {
      taskId: String(r.task_id ?? ''),
      title: String(r.title ?? '(task removed)'),
      status: (r.type === 'task.verified' ? 'verified' : 'done') as 'done' | 'verified',
      jobId: str(r.job_id),
    };
    of(str(r.assignee_id) ?? str(r.actor_id)).tasksCompleted.push(item);
    all.tasksCompleted.push(item);
  }

  for (const r of db
    .prepare('SELECT id, kind, class, summary, task_id, job_id, recorded_by FROM evidence WHERE created_at > ? ORDER BY created_at')
    .all(since) as Row[]) {
    const item = {
      id: String(r.id),
      kind: String(r.kind),
      class: String(r.class),
      summary: String(r.summary).slice(0, 200),
      taskId: str(r.task_id),
      jobId: str(r.job_id),
    };
    of(str(r.recorded_by)).evidence.push(item);
    all.evidence.push(item);
  }

  for (const r of db.prepare('SELECT id, summary, raised_by FROM blockers WHERE created_at > ? ORDER BY created_at').all(since) as Row[]) {
    const item = { id: String(r.id), summary: String(r.summary).slice(0, 200) };
    of(str(r.raised_by)).blockersOpened.push(item);
    all.blockersOpened.push(item);
  }
  for (const r of db.prepare("SELECT id, summary, resolved_by FROM blockers WHERE status = 'resolved' AND resolved_at > ? ORDER BY resolved_at").all(since) as Row[]) {
    const item = { id: String(r.id), summary: String(r.summary).slice(0, 200) };
    of(str(r.resolved_by)).blockersResolved.push(item);
    all.blockersResolved.push(item);
  }

  for (const r of db.prepare("SELECT subject_id, actor_id, payload FROM events WHERE type = 'job.stage_changed' AND created_at > ? ORDER BY seq").all(since) as Row[]) {
    let payload: { from?: string; to?: string } = {};
    try {
      payload = JSON.parse(String(r.payload));
    } catch {
      /* keep empty */
    }
    const item = { jobId: String(r.subject_id), from: payload.from ?? null, to: payload.to ?? null };
    of(str(r.actor_id)).jobStageChanges.push(item);
    all.jobStageChanges.push(item);
  }

  for (const r of db
    .prepare("SELECT id, agent_id, error FROM sessions WHERE state = 'failed' AND COALESCE(ended_at, last_event_at, started_at) > ? ORDER BY started_at")
    .all(since) as Row[]) {
    const item = { sessionId: String(r.id), error: str(r.error) };
    of(str(r.agent_id)).sessionsFailed.push(item);
    all.sessionsFailed.push(item);
  }

  return { since, byActor, all };
}

/** Identities with a session or task/evidence activity since `since`. */
export function activeActors(db: DatabaseSync, since: string): Set<string> {
  const out = new Set<string>();
  for (const r of db.prepare('SELECT DISTINCT agent_id AS a FROM sessions WHERE COALESCE(last_event_at, started_at) > ? OR started_at > ?').all(since, since) as Row[]) out.add(String(r.a));
  for (const r of db.prepare("SELECT DISTINCT actor_id AS a FROM events WHERE type LIKE 'task.%' AND actor_id IS NOT NULL AND created_at > ?").all(since) as Row[]) out.add(String(r.a));
  for (const r of db.prepare("SELECT DISTINCT assignee_id AS a FROM events e JOIN tasks t ON t.id = e.task_id WHERE e.type LIKE 'task.%' AND t.assignee_id IS NOT NULL AND e.created_at > ?").all(since) as Row[]) out.add(String(r.a));
  return out;
}
