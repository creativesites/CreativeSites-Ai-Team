// Strategy linkage (WP7, vision section 11): Strategy -> Objectives -> KRs -> Projects -> Jobs -> Tasks -> Evidence.
//
// Progress is derived from execution data, never from a stored percentage:
//   - kind 'evidence': weighted share of linked, non-archived jobs that reached done with at least
//     one VERIFIED evidence row. No linked jobs -> progress null, status UNKNOWN.
//   - kind 'manual': the latest manual entry in okr_progress_entries, labelled manual.
//   - kind 'computed': reserved. UNKNOWN ('no computation defined'). telemetry_query is never evaluated.
// Every recompute appends an okr_progress_entries row (append-only history with provenance).

import crypto from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type * as T from '../api/types.ts';
import { InputError, NotFoundError } from '../errors.ts';

type Row = Record<string, unknown>;

export type KrKind = 'manual' | 'evidence' | 'computed';
export type KrStatus = 'UNKNOWN' | 'on_track' | 'at_risk' | 'behind' | 'completed';
export type KrProvenance = 'manual' | 'verified' | 'runtime_observed' | 'UNKNOWN';

export interface KrProgress {
  krId: string;
  kind: KrKind;
  /** Percent 0-100, or null when the progress is UNKNOWN. Never a seeded number. */
  progress: number | null;
  status: KrStatus;
  /** What the figure rests on: typed-in (manual), counted verified jobs, or nothing (UNKNOWN). */
  provenance: KrProvenance;
  reason: string | null;
  linkedJobs: number;
  countedJobs: number;
  linkedWeight: number;
  countedWeight: number;
}

export interface ObjectiveProgress {
  objectiveId: string;
  progress: number | null;
  status: KrStatus;
  krCount: number;
  unknownKrCount: number;
}

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const statusFor = (progress: number | null): KrStatus =>
  progress === null ? 'UNKNOWN' : progress >= 100 ? 'completed' : progress >= 80 ? 'on_track' : progress >= 40 ? 'at_risk' : 'behind';

const one = (db: DatabaseSync, sql: string, ...p: SQLInputValue[]) => db.prepare(sql).get(...p) as Row | undefined;
const all = (db: DatabaseSync, sql: string, ...p: SQLInputValue[]) => db.prepare(sql).all(...p) as Row[];

/** A job counts when it is done and has at least one VERIFIED evidence row (on the job or one of its tasks). */
const HAS_VERIFIED = `EXISTS (SELECT 1 FROM evidence e WHERE e.class = 'VERIFIED'
  AND (e.job_id = j.id OR e.task_id IN (SELECT t.id FROM tasks t WHERE t.job_id = j.id)))`;

export function computeKrProgress(db: DatabaseSync, krOrId: string | Row): KrProgress {
  const kr = typeof krOrId === 'string' ? one(db, 'SELECT * FROM okr_key_results WHERE id = ?', krOrId) : krOrId;
  if (!kr) throw new NotFoundError(`key result ${String(krOrId)} not found`);
  const krId = String(kr.id);
  const kind = (String(kr.kind ?? 'manual') as KrKind);
  const base = { krId, kind, linkedJobs: 0, countedJobs: 0, linkedWeight: 0, countedWeight: 0 };

  if (kind === 'computed') {
    return { ...base, progress: null, status: 'UNKNOWN', provenance: 'UNKNOWN', reason: 'no computation defined' };
  }

  if (kind === 'manual') {
    const entry = one(
      db,
      "SELECT progress_percent FROM okr_progress_entries WHERE key_result_id = ? AND provenance = 'manual' AND progress_percent IS NOT NULL ORDER BY recorded_at DESC, rowid DESC LIMIT 1",
      krId
    );
    if (!entry) return { ...base, progress: null, status: 'UNKNOWN', provenance: 'UNKNOWN', reason: 'no manual entry recorded' };
    const progress = round1(Number(entry.progress_percent));
    return { ...base, progress, status: statusFor(progress), provenance: 'manual', reason: null };
  }

  // kind === 'evidence'
  const row = one(
    db,
    `SELECT COUNT(*) AS linked, COALESCE(SUM(j.kr_weight), 0) AS linked_weight,
            COALESCE(SUM(CASE WHEN j.stage = 'done' AND ${HAS_VERIFIED} THEN 1 ELSE 0 END), 0) AS counted,
            COALESCE(SUM(CASE WHEN j.stage = 'done' AND ${HAS_VERIFIED} THEN j.kr_weight ELSE 0 END), 0) AS counted_weight
     FROM jobs j WHERE j.okr_kr_id = ? AND j.archived_at IS NULL`,
    krId
  )!;
  const linkedJobs = Number(row.linked);
  const linkedWeight = Number(row.linked_weight);
  const countedJobs = Number(row.counted);
  const countedWeight = Number(row.counted_weight);
  if (linkedJobs === 0 || linkedWeight <= 0) {
    return { ...base, progress: null, status: 'UNKNOWN', provenance: 'UNKNOWN', reason: 'no linked jobs' };
  }
  const progress = round1((countedWeight / linkedWeight) * 100);
  return {
    ...base,
    progress,
    status: statusFor(progress),
    provenance: countedJobs > 0 ? 'verified' : 'runtime_observed',
    reason: null,
    linkedJobs,
    countedJobs,
    linkedWeight,
    countedWeight,
  };
}

export function computeObjectiveProgress(db: DatabaseSync, objectiveId: string): ObjectiveProgress {
  const krs = all(db, 'SELECT * FROM okr_key_results WHERE objective_id = ?', objectiveId);
  let sum = 0;
  let weights = 0;
  let unknown = 0;
  for (const kr of krs) {
    const p = computeKrProgress(db, kr);
    if (p.progress === null) {
      unknown++;
      continue;
    }
    const w = Number(kr.weight ?? 1) > 0 ? Number(kr.weight ?? 1) : 1;
    sum += p.progress * w;
    weights += w;
  }
  const progress = weights > 0 ? round1(sum / weights) : null;
  return { objectiveId, progress, status: statusFor(progress), krCount: krs.length, unknownKrCount: unknown };
}

/** Fields the API adds to a key result row (the stored progress_percent is kept only for compatibility). */
export function describeKr(db: DatabaseSync, kr: Row): T.OkrKeyResultStrategy {
  const p = computeKrProgress(db, kr);
  return {
    kind: p.kind,
    source: kr.source == null ? null : String(kr.source),
    weight: Number(kr.weight ?? 1),
    progress: p.progress,
    status: p.status,
    provenance: p.provenance,
    reason: p.reason,
    linkedJobs: p.linkedJobs,
    countedJobs: p.countedJobs,
  };
}

export function describeObjective(db: DatabaseSync, objectiveId: string): T.OkrObjectiveStrategy {
  const o = computeObjectiveProgress(db, objectiveId);
  return { progress: o.progress, computedStatus: o.status, krCount: o.krCount, unknownKrCount: o.unknownKrCount };
}

/** Appends one history row. Entries are never updated or deleted (enforced by triggers). */
export function appendProgressEntry(
  db: DatabaseSync,
  input: {
    keyResultId: string;
    value?: number | null;
    progressPercent: number | null;
    provenance: 'manual' | 'agent_reported' | 'runtime_observed' | 'verified';
    jobId?: string | null;
    evidenceId?: string | null;
    recordedBy: string;
    note?: string | null;
  }
): string {
  const id = newId('okrp');
  db.prepare(
    `INSERT INTO okr_progress_entries (id, key_result_id, value, progress_percent, provenance, job_id, evidence_id, recorded_by, recorded_at, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.keyResultId,
    input.value ?? null,
    input.progressPercent,
    input.provenance,
    input.jobId ?? null,
    input.evidenceId ?? null,
    input.recordedBy,
    now(),
    input.note ?? null
  );
  return id;
}

export function listProgressEntries(db: DatabaseSync, keyResultId: string): T.OkrProgressEntry[] {
  return all(db, 'SELECT * FROM okr_progress_entries WHERE key_result_id = ? ORDER BY recorded_at, rowid', keyResultId).map((r) => ({
    id: String(r.id),
    keyResultId: String(r.key_result_id),
    value: r.value == null ? null : Number(r.value),
    progressPercent: r.progress_percent == null ? null : Number(r.progress_percent),
    provenance: String(r.provenance) as T.OkrProgressEntry['provenance'],
    jobId: r.job_id == null ? null : String(r.job_id),
    evidenceId: r.evidence_id == null ? null : String(r.evidence_id),
    recordedBy: String(r.recorded_by),
    recordedAt: String(r.recorded_at),
    note: r.note == null ? null : String(r.note),
  }));
}

/** Writes the derived figure back to the KR and its objective rows (compat columns). */
export function syncStoredProgress(db: DatabaseSync, krId: string): void {
  const kr = one(db, 'SELECT objective_id FROM okr_key_results WHERE id = ?', krId);
  if (!kr) return;
  const p = computeKrProgress(db, krId);
  db.prepare('UPDATE okr_key_results SET progress_percent = ?, updated_at = ? WHERE id = ?').run(Math.round(p.progress ?? 0), now(), krId);
  syncStoredObjective(db, String(kr.objective_id));
}

export function syncStoredObjective(db: DatabaseSync, objectiveId: string): void {
  const o = computeObjectiveProgress(db, objectiveId);
  // The stored status has no UNKNOWN value; leave it untouched until progress is known.
  if (o.progress === null) {
    db.prepare('UPDATE okr_objectives SET progress_percent = 0, updated_at = ? WHERE id = ?').run(now(), objectiveId);
    return;
  }
  const stored = o.progress >= 80 ? 'on_track' : o.progress >= 40 ? 'at_risk' : 'behind';
  db.prepare('UPDATE okr_objectives SET progress_percent = ?, status = ?, updated_at = ? WHERE id = ?').run(
    Math.round(o.progress),
    stored,
    now(),
    objectiveId
  );
}

/**
 * Recompute an evidence-derived KR after a job changed and append the history row.
 * 'verified' when at least one verified-done job backs the figure, else 'runtime_observed'.
 */
export function recomputeKr(db: DatabaseSync, krId: string, trigger: { jobId?: string | null; recordedBy?: string; note?: string }): KrProgress | null {
  const kr = one(db, 'SELECT * FROM okr_key_results WHERE id = ?', krId);
  if (!kr) return null;
  const p = computeKrProgress(db, kr);
  if (p.kind === 'evidence') {
    const ev = trigger.jobId
      ? one(
          db,
          `SELECT e.id FROM evidence e WHERE e.class = 'VERIFIED' AND (e.job_id = ? OR e.task_id IN (SELECT id FROM tasks WHERE job_id = ?))
           ORDER BY e.created_at DESC, e.rowid DESC LIMIT 1`,
          trigger.jobId,
          trigger.jobId
        )
      : undefined;
    appendProgressEntry(db, {
      keyResultId: krId,
      value: p.countedWeight,
      progressPercent: p.progress,
      provenance: p.provenance === 'verified' ? 'verified' : 'runtime_observed',
      jobId: trigger.jobId ?? null,
      evidenceId: ev ? String(ev.id) : null,
      recordedBy: trigger.recordedBy ?? 'runtime',
      note: trigger.note ?? null,
    });
  }
  syncStoredProgress(db, krId);
  return p;
}

const TRIGGER_EVENTS = new Set(['job.stage_changed', 'job.archived', 'job.unarchived', 'job.deleted', 'job.kr_linked', 'job.kr_unlinked', 'evidence.verified']);

/**
 * Hook for the runtime event stream (see app.ts). Recomputes the key results a job feeds when it
 * reaches done, is archived/unarchived/deleted, changes its link or gains verified evidence.
 * Never throws: a failed recompute must not break the transition that caused it.
 */
export function onStrategyEvent(db: DatabaseSync, e: { type: string; subjectId: string | null; payload?: unknown; jobId?: string | null }): void {
  if (!TRIGGER_EVENTS.has(e.type)) return;
  try {
    const payload = (e.payload ?? {}) as { to?: string; krId?: string | null; previousKrId?: string | null; jobId?: string };
    if (e.type === 'job.stage_changed' && payload.to !== 'done' && payload.to !== 'cancelled') {
      // Moving back out of done also changes the figure; only stages that never touched done are skipped.
      const from = (payload as { from?: string }).from;
      if (from !== 'done') return;
    }
    const jobId = e.subjectId;
    if (!jobId) return;
    const krs = new Set<string>();
    const row = one(db, 'SELECT okr_kr_id FROM jobs WHERE id = ?', jobId);
    if (row?.okr_kr_id) krs.add(String(row.okr_kr_id));
    if (payload.krId) krs.add(payload.krId);
    if (payload.previousKrId) krs.add(payload.previousKrId);
    for (const krId of krs) recomputeKr(db, krId, { jobId, note: e.type });
  } catch (err) {
    console.warn('[runtime] strategy: could not recompute progress:', (err as Error).message);
  }
}

// ------------------------------------------------------------------ linking

export interface LinkInput {
  /** Key result to link, or null to unlink. */
  krId: string | null;
  /** Milestone to link; null clears it; undefined leaves it as is. */
  milestoneId?: string | null;
  /** Weight of the job within its KR (default 1, must be > 0). */
  weight?: number;
  actorId: string;
}

export function linkJob(
  db: DatabaseSync,
  emit: (e: { type: string; subjectId: string; payload: Record<string, unknown>; actorId: string; jobId: string }) => void,
  jobId: string,
  input: LinkInput
): { jobId: string; krId: string | null; milestoneId: string | null; weight: number } {
  const job = one(db, 'SELECT * FROM jobs WHERE id = ?', jobId);
  if (!job) throw new NotFoundError(`job ${jobId} not found`);
  const actorId = typeof input.actorId === 'string' ? input.actorId.trim() : '';
  if (!actorId) throw new InputError('actorId is required');
  const previousKrId = job.okr_kr_id == null ? null : String(job.okr_kr_id);

  let krId: string | null = null;
  if (input.krId != null) {
    krId = String(input.krId).trim();
    if (!krId) throw new InputError('krId must not be empty');
    if (!one(db, 'SELECT 1 AS x FROM okr_key_results WHERE id = ?', krId)) throw new NotFoundError(`key result ${krId} not found`);
  }
  let milestoneId: string | null = job.milestone_id == null ? null : String(job.milestone_id);
  if (input.milestoneId !== undefined) {
    if (input.milestoneId === null || input.milestoneId === '') milestoneId = null;
    else {
      milestoneId = String(input.milestoneId).trim();
      if (!one(db, 'SELECT 1 AS x FROM milestones WHERE id = ?', milestoneId)) throw new NotFoundError(`milestone ${milestoneId} not found`);
    }
  }
  let weight = Number(job.kr_weight ?? 1);
  if (input.weight !== undefined) {
    weight = Number(input.weight);
    if (!Number.isFinite(weight) || weight <= 0) throw new InputError('weight must be a number greater than 0');
  }
  db.prepare('UPDATE jobs SET okr_kr_id = ?, milestone_id = ?, kr_weight = ?, updated_at = ? WHERE id = ?').run(krId, milestoneId, weight, now(), jobId);
  emit({
    type: krId ? 'job.kr_linked' : 'job.kr_unlinked',
    subjectId: jobId,
    payload: { krId, previousKrId, milestoneId, weight },
    actorId,
    jobId,
  });
  return { jobId, krId, milestoneId, weight };
}

// ------------------------------------------------------------------ health

export interface HealthFigure {
  /** Percent, or null (UNKNOWN) when the denominator is 0. */
  value: number | null;
  numerator: number;
  denominator: number;
  status: 'UNKNOWN' | 'measured';
  basis: string;
}

const figure = (numerator: number, denominator: number, basis: string): HealthFigure =>
  denominator > 0
    ? { value: Math.round((numerator / denominator) * 100), numerator, denominator, status: 'measured', basis }
    : { value: null, numerator, denominator, status: 'UNKNOWN', basis };

export function healthParts(db: DatabaseSync): { execution: HealthFigure; evidence: HealthFigure; strategy: HealthFigure & { objectives: number; objectivesWithProgress: number; unknownKeyResults: number } } {
  const active = Number(one(db, "SELECT COUNT(*) AS c FROM jobs WHERE archived_at IS NULL AND stage NOT IN ('done','cancelled')")!.c);
  const unhealthy = Number(
    one(
      db,
      `SELECT COUNT(*) AS c FROM jobs j WHERE j.archived_at IS NULL AND j.stage NOT IN ('done','cancelled') AND (
         (j.blocked_reason IS NOT NULL AND j.blocked_reason <> '')
         OR EXISTS (SELECT 1 FROM tasks t WHERE t.job_id = j.id AND t.archived_at IS NULL AND t.status IN ('blocked','needs_human','reassignment_required'))
         OR EXISTS (SELECT 1 FROM blockers b WHERE b.status = 'open' AND (b.job_id = j.id OR b.task_id IN (SELECT id FROM tasks WHERE job_id = j.id)))
         OR EXISTS (SELECT 1 FROM tasks t WHERE t.job_id = j.id AND t.archived_at IS NULL AND t.status IN ('failed','retrying')
              AND EXISTS (SELECT 1 FROM events ev WHERE ev.task_id = t.id AND (ev.type = 'task.ack_timeout'
                   OR (ev.type = 'task.failed' AND ev.payload LIKE '%"reason":"stale"%'))))
       )`
    )!.c
  );
  const done = Number(one(db, "SELECT COUNT(*) AS c FROM jobs j WHERE j.archived_at IS NULL AND j.stage = 'done'")!.c);
  const doneVerified = Number(one(db, `SELECT COUNT(*) AS c FROM jobs j WHERE j.archived_at IS NULL AND j.stage = 'done' AND ${HAS_VERIFIED}`)!.c);

  const objectives = all(db, 'SELECT id FROM okr_objectives');
  let withProgress = 0;
  let unknownKrs = 0;
  for (const o of objectives) {
    const p = computeObjectiveProgress(db, String(o.id));
    if (p.progress !== null) withProgress++;
    unknownKrs += p.unknownKrCount;
  }
  return {
    execution: figure(active - unhealthy, active, 'active non-archived jobs that are not blocked and have no ack-timeout or stale failures'),
    evidence: figure(doneVerified, done, 'done non-archived jobs with at least one VERIFIED evidence row'),
    strategy: {
      ...figure(withProgress, objectives.length, 'objectives with at least one key result whose progress is known'),
      objectives: objectives.length,
      objectivesWithProgress: withProgress,
      unknownKeyResults: unknownKrs,
    },
  };
}

export interface ProjectHealth {
  projectId: string;
  jobsByStage: Record<string, number>;
  archivedJobs: number;
  blockedTasks: number;
  openBlockers: number;
  verifiedDoneLast30Days: number;
  linkedKeyResults: Array<{ id: string; title: string; objectiveId: string; kind: KrKind; progress: number | null; status: KrStatus; provenance: KrProvenance; reason: string | null; linkedJobs: number }>;
  unknownKeyResults: number;
  derivedFrom: 'execution data only';
}

export function projectHealth(db: DatabaseSync, projectId: string): ProjectHealth {
  if (!one(db, 'SELECT 1 AS x FROM projects WHERE id = ?', projectId)) throw new NotFoundError(`project ${projectId} not found`);
  const jobsByStage: Record<string, number> = {};
  for (const r of all(db, 'SELECT stage, COUNT(*) AS c FROM jobs WHERE project_id = ? AND archived_at IS NULL GROUP BY stage', projectId)) {
    jobsByStage[String(r.stage)] = Number(r.c);
  }
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const krIds = all(db, 'SELECT DISTINCT okr_kr_id FROM jobs WHERE project_id = ? AND archived_at IS NULL AND okr_kr_id IS NOT NULL', projectId).map((r) => String(r.okr_kr_id));
  const linked = krIds.flatMap((id) => {
    const kr = one(db, 'SELECT * FROM okr_key_results WHERE id = ?', id);
    if (!kr) return [];
    const p = computeKrProgress(db, kr);
    return [{ id, title: String(kr.title), objectiveId: String(kr.objective_id), kind: p.kind, progress: p.progress, status: p.status, provenance: p.provenance, reason: p.reason, linkedJobs: p.linkedJobs }];
  });
  return {
    projectId,
    jobsByStage,
    archivedJobs: Number(one(db, 'SELECT COUNT(*) AS c FROM jobs WHERE project_id = ? AND archived_at IS NOT NULL', projectId)!.c),
    blockedTasks: Number(
      one(db, "SELECT COUNT(*) AS c FROM tasks t JOIN jobs j ON j.id = t.job_id WHERE j.project_id = ? AND j.archived_at IS NULL AND t.archived_at IS NULL AND t.status = 'blocked'", projectId)!.c
    ),
    openBlockers: Number(
      one(
        db,
        `SELECT COUNT(*) AS c FROM blockers b WHERE b.status = 'open' AND (
           b.job_id IN (SELECT id FROM jobs WHERE project_id = ? AND archived_at IS NULL)
           OR b.task_id IN (SELECT t.id FROM tasks t JOIN jobs j ON j.id = t.job_id WHERE j.project_id = ? AND j.archived_at IS NULL))`,
        projectId,
        projectId
      )!.c
    ),
    verifiedDoneLast30Days: Number(
      one(db, `SELECT COUNT(*) AS c FROM jobs j WHERE j.project_id = ? AND j.archived_at IS NULL AND j.stage = 'done' AND j.ended_at >= ? AND ${HAS_VERIFIED}`, projectId, since)!.c
    ),
    linkedKeyResults: linked,
    unknownKeyResults: linked.filter((k) => k.progress === null).length,
    derivedFrom: 'execution data only',
  };
}
