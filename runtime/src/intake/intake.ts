// Unified intake (WP2 tasks 2.1-2.3): every entry point (home, room, design, sessions, api, agent, schedule)
// calls createIntake. It keeps the raw text verbatim, resolves the project, detects duplicates, triages by
// rules (with an optional Orchestrator override) and creates exactly one durable job, or links a duplicate.

import type { Repo } from '../store/repo.ts';
import { InputError } from '../store/repo.ts';
import type * as T from '../api/types.ts';
import { findDuplicate } from './dedupe.ts';
import { applyOverride, triage } from './triage.ts';

export const INTAKE_SOURCES: T.IntakeSource[] = ['home', 'room', 'design', 'sessions', 'api', 'agent', 'schedule'];

/** Title = first non-empty line of the request, trimmed to 80 characters. The raw text is kept verbatim as the brief. */
export function titleFromText(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find(Boolean) ?? 'Untitled request';
  return line.length > 80 ? `${line.slice(0, 77).trimEnd()}...` : line;
}

export function createIntake(repo: Repo, input: T.CreateIntakeInput): T.IntakeResult {
  const text = typeof input.text === 'string' ? input.text : '';
  if (!text.trim()) throw new InputError('text is required');
  if (!INTAKE_SOURCES.includes(input.source)) throw new InputError(`source must be one of ${INTAKE_SOURCES.join(', ')}`);
  const requestedBy = typeof input.requestedBy === 'string' ? input.requestedBy.trim() : '';
  if (!requestedBy) throw new InputError('requestedBy is required');

  const roomId = input.roomId ?? null;
  const projectId = repo.resolveIntakeProject(input.projectId, roomId);

  // Triage first: it is pure, so a bad override fails before anything is written.
  let classification = triage(text);
  if (input.override) {
    try {
      classification = applyOverride(classification, input.override);
    } catch (e) {
      throw new InputError((e as Error).message);
    }
  }

  const dupe = findDuplicate(text, repo.listOpenJobsForDedupe(projectId, roomId));
  return repo.recordIntake({
    text,
    source: input.source,
    sourceRef: input.sourceRef ?? null,
    projectId,
    roomId,
    requestedBy,
    title: titleFromText(text),
    classification: dupe ? { ...classification, duplicateScore: Number(dupe.score.toFixed(3)) } : { ...classification },
    duplicateOf: dupe ? { jobId: dupe.jobId, reason: dupe.reason } : null,
  });
}
