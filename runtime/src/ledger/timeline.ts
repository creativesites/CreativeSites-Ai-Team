import type { DatabaseSync } from 'node:sqlite';

/**
 * The unified job timeline (vision §14.4, plan WP11 minimum): one chronological list built from
 * the records the runtime already keeps. Nothing here is inferred; each item names its source.
 */
export interface TimelineItem {
  at: string;
  kind: string;
  source: string;
  actor: string | null;
  summary: string;
  ref: string | null;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));

export function jobTimeline(db: DatabaseSync, jobId: string, limit = 2000): TimelineItem[] {
  const all = (sql: string, ...p: string[]) => {
    try {
      return db.prepare(sql).all(...p) as Row[];
    } catch {
      return []; // a table from a later migration may be absent on an older store
    }
  };
  const items: TimelineItem[] = [];
  const job = (db.prepare('SELECT title, created_at, created_by FROM jobs WHERE id = ?').get(jobId) as Row | undefined) ?? {};
  if (job.created_at) items.push({ at: String(job.created_at), kind: 'job.created', source: 'jobs', actor: s(job.created_by), summary: `Job created: ${s(job.title) ?? ''}`, ref: jobId });

  for (const r of all("SELECT raw_text, source, requested_by, created_at, id FROM intake_requests WHERE job_id = ? OR duplicate_of_job_id = ?", jobId, jobId))
    items.push({ at: String(r.created_at), kind: 'intake', source: 'intake_requests', actor: s(r.requested_by), summary: `Request (${s(r.source)}): ${String(r.raw_text).slice(0, 200)}`, ref: s(r.id) });
  for (const r of all('SELECT from_stage, to_stage, actor_id, note, created_at, id FROM job_stage_history WHERE job_id = ?', jobId))
    items.push({ at: String(r.created_at), kind: 'stage', source: 'job_stage_history', actor: s(r.actor_id), summary: `Stage ${s(r.from_stage) ?? '—'} → ${s(r.to_stage)}${r.note ? `: ${s(r.note)}` : ''}`, ref: s(r.id) });
  for (const r of all("SELECT type, actor_id, created_at, seq, payload FROM events WHERE (job_id = ? OR subject_id = ? OR task_id IN (SELECT id FROM tasks WHERE job_id = ?)) AND type NOT IN ('session.transcript','job.updated')", jobId, jobId, jobId))
    items.push({ at: String(r.created_at), kind: String(r.type), source: 'events', actor: s(r.actor_id), summary: summarizeEvent(String(r.type), s(r.payload)), ref: `event:${s(r.seq)}` });
  for (const r of all('SELECT id, agent_id, task_id, state, started_at, ended_at, generation FROM sessions WHERE job_id = ?', jobId)) {
    items.push({ at: String(r.started_at), kind: 'session.started', source: 'sessions', actor: s(r.agent_id), summary: `Session ${s(r.id)} (gen ${s(r.generation) ?? 1})${r.task_id ? ` on task ${s(r.task_id)}` : ''}`, ref: s(r.id) });
    if (r.ended_at) items.push({ at: String(r.ended_at), kind: 'session.ended', source: 'sessions', actor: s(r.agent_id), summary: `Session ${s(r.id)} ended (${s(r.state)})`, ref: s(r.id) });
  }
  for (const r of all('SELECT id, class, kind, summary, recorded_by, created_at FROM evidence WHERE job_id = ?', jobId))
    items.push({ at: String(r.created_at), kind: 'evidence', source: 'evidence', actor: s(r.recorded_by), summary: `[${s(r.class)}] ${s(r.kind)}: ${s(r.summary)}`, ref: s(r.id) });
  for (const r of all('SELECT id, title, status, requested_by, decided_by, created_at, decided_at FROM approvals WHERE job_id = ?', jobId)) {
    items.push({ at: String(r.created_at), kind: 'approval.requested', source: 'approvals', actor: s(r.requested_by), summary: `Approval requested: ${s(r.title)}`, ref: s(r.id) });
    if (r.decided_at) items.push({ at: String(r.decided_at), kind: 'approval.decided', source: 'approvals', actor: s(r.decided_by), summary: `Approval ${s(r.status)}: ${s(r.title)}`, ref: s(r.id) });
  }
  for (const r of all('SELECT id, summary, raised_by, status, created_at FROM blockers WHERE job_id = ?', jobId))
    items.push({ at: String(r.created_at), kind: 'blocker', source: 'blockers', actor: s(r.raised_by), summary: `Blocker (${s(r.status)}): ${s(r.summary)}`, ref: s(r.id) });
  for (const r of all("SELECT id, identity_id, actor_kind, started_at, duration_ms, source FROM activity_intervals WHERE job_id = ? AND ended_at IS NOT NULL", jobId))
    items.push({ at: String(r.started_at), kind: 'time', source: 'activity_intervals', actor: s(r.identity_id), summary: `${s(r.actor_kind)} time ${Math.round(Number(r.duration_ms ?? 0) / 1000)}s (${s(r.source)})`, ref: s(r.id) });
  for (const r of all('SELECT id, session_id, model, input_tokens, output_tokens, source, created_at FROM usage WHERE job_id = ?', jobId))
    items.push({ at: String(r.created_at), kind: 'usage', source: 'usage', actor: null, summary: `Tokens in ${s(r.input_tokens)} / out ${s(r.output_tokens)} (${s(r.source)}${r.model ? `, ${s(r.model)}` : ''})`, ref: s(r.id) });

  return items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).slice(-limit);
}

function summarizeEvent(type: string, payload: string | null): string {
  try {
    const p = payload ? (JSON.parse(payload) as Record<string, unknown>) : {};
    const bits = ['to', 'from', 'reason', 'title', 'status', 'workflow'].filter((k) => p[k] !== undefined).map((k) => `${k}=${String(p[k]).slice(0, 120)}`);
    return bits.length ? `${type} (${bits.join(', ')})` : type;
  } catch {
    return type;
  }
}
