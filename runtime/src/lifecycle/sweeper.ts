// Ack timeout, retry with backoff and stale-run sweep (K3, WP1 1.5). Called from the
// orchestrator tick; the clock is injectable so tests need no real waiting.
import type { Repo } from '../store/repo.ts';

export const SWEEPER_ACTOR = 'runtime:lifecycle';

export interface SweepResult {
  ackTimeouts: string[];
  retriesScheduled: string[];
  reassignmentRequired: string[];
  retriesDispatched: string[];
  stale: string[];
}

export type Clock = () => Date | number | string;

function toMs(c: Date | number | string): number {
  return c instanceof Date ? c.getTime() : typeof c === 'number' ? c : Date.parse(c);
}

/**
 * One pass. Order matters so a task never skips a state within one pass:
 *  1. retrying tasks whose next_retry_at has passed go back to assigned;
 *  2. assigned tasks past their ack deadline fail (task.ack_timeout), then go to retrying
 *     (task.retry_scheduled, next_retry_at by backoff) while attempts remain, otherwise to
 *     reassignment_required;
 *  3. running tasks with no events for staleSweepSec fail with reason 'stale'.
 * A failure that did not come from the sweeper (a crashed session, a failed check) is left
 * as failed: retrying it automatically would re-dispatch work nobody asked to repeat.
 */
export function sweepTasks(repo: Repo, clock: Clock = () => new Date()): SweepResult {
  const nowMs = toMs(clock());
  const at = new Date(nowMs).toISOString();
  const settings = repo.lifecycleSettings();
  const out: SweepResult = { ackTimeouts: [], retriesScheduled: [], reassignmentRequired: [], retriesDispatched: [], stale: [] };
  const actor = { actorId: SWEEPER_ACTOR, actorKind: 'system' as const, at };

  for (const task of repo.listTasksWhere("status = 'retrying' AND next_retry_at IS NOT NULL AND next_retry_at <= ?", at)) {
    try {
      repo.transitionTask(task.id, 'assigned', { ...actor, reason: `retry ${task.attempt} of ${task.maxAttempts} is due` });
      out.retriesDispatched.push(task.id);
    } catch {
      /* the task changed under us; the next pass sees its new state */
    }
  }

  for (const task of repo.listTasksWhere("status = 'assigned' AND ack_deadline_at IS NOT NULL AND ack_deadline_at <= ?", at)) {
    try {
      const failed = repo.transitionTask(task.id, 'failed', {
        ...actor,
        reason: `no acknowledgement within ${settings.ackTimeoutSec}s`,
        eventType: 'task.ack_timeout',
      });
      out.ackTimeouts.push(task.id);
      if ((failed.attempt ?? 0) < (failed.maxAttempts ?? settings.maxAttempts)) {
        repo.transitionTask(task.id, 'retrying', { ...actor, reason: `attempt ${failed.attempt} failed; retrying` });
        out.retriesScheduled.push(task.id);
      } else {
        repo.transitionTask(task.id, 'reassignment_required', {
          ...actor,
          reason: `${failed.attempt} attempts without acknowledgement`,
        });
        out.reassignmentRequired.push(task.id);
      }
    } catch {
      /* raced with an acknowledgement */
    }
  }

  const staleBefore = new Date(nowMs - settings.staleSweepSec * 1000).toISOString();
  for (const task of repo.listTasksWhere(
    "status = 'running' AND COALESCE(last_event_at, started_at, updated_at, created_at) <= ?",
    staleBefore
  )) {
    try {
      repo.transitionTask(task.id, 'failed', { ...actor, reason: 'stale' });
      out.stale.push(task.id);
    } catch {
      /* the task moved on */
    }
  }
  return out;
}
