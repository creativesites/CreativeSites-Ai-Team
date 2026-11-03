// K3: the task state machine. Pure rules live here (transition table, actor rules,
// ready queue, dependency cycles, lifecycle settings); Repo.transitionTask applies a
// planned transition and its single event in one transaction.
import type * as T from '../api/types.ts';
import { ConflictError, InputError } from '../errors.ts';

export const TASK_STATES: readonly T.TaskStatus[] = [
  'pending', 'assigned', 'acknowledged', 'running', 'needs_review', 'verified', 'done',
  'blocked', 'failed', 'retrying', 'reassignment_required', 'needs_human',
];

/**
 * Legal moves. K3's chain plus: any non-terminal state may go to blocked or failed;
 * blocked may resume; failed leaves only through retry or reassignment; a task that
 * fails verification returns to its assignee (needs_review, verified and, for tasks
 * that were auto-completed, done may go back to assigned with a reason). A task whose
 * branch cannot be merged into the job branch (K8) goes from needs_review, verified or
 * done to needs_human.
 */
export const TASK_TRANSITIONS: Readonly<Record<T.TaskStatus, readonly T.TaskStatus[]>> = {
  pending: ['assigned', 'blocked', 'failed'],
  assigned: ['acknowledged', 'blocked', 'failed', 'needs_human'], // needs_human: a policy refusal at dispatch (K9)
  acknowledged: ['running', 'blocked', 'failed'],
  running: ['needs_review', 'done', 'blocked', 'failed'],
  needs_review: ['verified', 'assigned', 'blocked', 'failed', 'needs_human'],
  verified: ['done', 'assigned', 'blocked', 'failed', 'needs_human'],
  done: ['assigned', 'needs_human'],
  blocked: ['pending', 'assigned', 'acknowledged', 'running', 'failed'],
  failed: ['retrying', 'reassignment_required'],
  retrying: ['assigned', 'blocked', 'failed'],
  reassignment_required: ['assigned', 'needs_human', 'blocked', 'failed'],
  needs_human: ['assigned', 'pending', 'blocked', 'failed'],
};

/** Event type per destination state (K2 naming). */
export const TASK_EVENT_TYPES: Readonly<Record<T.TaskStatus, string>> = {
  pending: 'task.pending',
  assigned: 'task.assigned',
  acknowledged: 'task.acknowledged',
  running: 'task.running',
  needs_review: 'task.needs_review',
  verified: 'task.verified',
  done: 'task.done',
  blocked: 'task.blocked',
  failed: 'task.failed',
  retrying: 'task.retry_scheduled',
  reassignment_required: 'task.reassignment_required',
  needs_human: 'task.needs_human',
};

export interface LifecycleSettings {
  ackTimeoutSec: number;
  maxAttempts: number;
  backoffSec: number[];
  staleSweepSec: number;
}

/** Defaults from K3. Override with the settings keys of the same names. */
export const DEFAULT_LIFECYCLE_SETTINGS: LifecycleSettings = {
  ackTimeoutSec: 120,
  maxAttempts: 3,
  backoffSec: [60, 300],
  staleSweepSec: 600,
};

export function resolveLifecycleSettings(read: (key: string) => unknown): LifecycleSettings {
  const posInt = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : d);
  const backoff = read('backoffSec');
  return {
    ackTimeoutSec: posInt(read('ackTimeoutSec'), DEFAULT_LIFECYCLE_SETTINGS.ackTimeoutSec),
    maxAttempts: posInt(read('maxAttempts'), DEFAULT_LIFECYCLE_SETTINGS.maxAttempts),
    backoffSec:
      Array.isArray(backoff) && backoff.length && backoff.every((n) => typeof n === 'number' && n >= 0)
        ? (backoff as number[])
        : [...DEFAULT_LIFECYCLE_SETTINGS.backoffSec],
    staleSweepSec: posInt(read('staleSweepSec'), DEFAULT_LIFECYCLE_SETTINGS.staleSweepSec),
  };
}

/** Delay before retry number `failures` (1-based): backoff[failures-1], clamped to the last entry. */
export function backoffFor(settings: LifecycleSettings, failures: number): number {
  const list = settings.backoffSec;
  return list[Math.min(Math.max(failures, 1), list.length) - 1] ?? 0;
}

export interface TransitionOptions {
  actorId: string;
  actorKind?: T.ActorKind;
  reason?: string | null;
  /** New assignee, applied on a move to `assigned`. */
  assigneeId?: string | null;
  /** ISO timestamp, for an injected clock. */
  at?: string;
  /** Overrides the K2 event type (the sweeper uses task.ack_timeout for assigned to failed). */
  eventType?: string;
  /** A repeated key is a no-op. */
  idempotencyKey?: string;
}

export interface TaskRowView {
  id: string;
  jobId: string;
  status: T.TaskStatus;
  assigneeId: string | null;
  attempt: number;
  maxAttempts: number;
  verificationRequired: boolean;
  startedAt: string | null;
}

export interface PlannedTransition {
  from: T.TaskStatus;
  to: T.TaskStatus;
  /** Column updates (always includes status, updated_at and last_event_at). */
  columns: [string, string | number | null][];
  eventType: string;
  payload: Record<string, unknown>;
}

export function isTaskStatus(v: unknown): v is T.TaskStatus {
  return typeof v === 'string' && (TASK_STATES as readonly string[]).includes(v);
}

/** Validates a move and works out what it changes. Throws ConflictError (409) when illegal. */
export function planTransition(
  task: TaskRowView,
  toInput: unknown,
  opts: TransitionOptions,
  settings: LifecycleSettings
): PlannedTransition {
  if (!isTaskStatus(toInput)) throw new InputError(`to must be one of: ${TASK_STATES.join(', ')}`);
  const to = toInput;
  const actorId = typeof opts.actorId === 'string' ? opts.actorId.trim() : '';
  if (!actorId) throw new InputError('actorId is required');
  const from = task.status;
  const allowed = TASK_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new ConflictError(`A task cannot move from ${from} to ${to}. Allowed: ${allowed.join(', ') || 'none'}.`);
  }
  if ((to === 'verified' || to === 'done') && task.assigneeId && task.assigneeId === actorId) {
    throw new ConflictError(`The assignee (${actorId}) cannot mark its own task ${to}; someone else must.`);
  }
  if (from === 'running' && to === 'done' && task.verificationRequired) {
    throw new ConflictError('This task requires verification: it must go through needs_review and verified before done.');
  }
  if (from === 'done' && to === 'assigned' && !opts.reason?.trim()) {
    throw new ConflictError('Reopening a done task needs a reason.');
  }
  const assigneeId = to === 'assigned' && opts.assigneeId !== undefined ? opts.assigneeId : task.assigneeId;
  if (to === 'assigned' && !assigneeId) throw new ConflictError('A task needs an assignee before it can be assigned.');

  const at = opts.at ?? new Date().toISOString();
  const columns: PlannedTransition['columns'] = [['status', to], ['updated_at', at], ['last_event_at', at]];
  const payload: Record<string, unknown> = { taskId: task.id, from, to, reason: opts.reason ?? null };

  switch (to) {
    case 'assigned':
      columns.push(
        ['assignee_id', assigneeId ?? null],
        ['acknowledged_at', null],
        ['ack_deadline_at', new Date(Date.parse(at) + settings.ackTimeoutSec * 1000).toISOString()],
        ['next_retry_at', null],
        ['ended_at', null]
      );
      payload.assigneeId = assigneeId;
      break;
    case 'acknowledged':
      columns.push(['acknowledged_at', at], ['ack_deadline_at', null]);
      break;
    case 'running':
      columns.push(['ack_deadline_at', null]);
      if (!task.startedAt) columns.push(['started_at', at]);
      break;
    case 'done':
      columns.push(['ended_at', at]);
      break;
    case 'failed': {
      const attempt = task.attempt + 1;
      columns.push(['attempt', attempt], ['ack_deadline_at', null], ['ended_at', at]);
      payload.attempt = attempt;
      break;
    }
    case 'retrying': {
      const delay = backoffFor(settings, task.attempt);
      const nextRetryAt = new Date(Date.parse(at) + delay * 1000).toISOString();
      columns.push(['next_retry_at', nextRetryAt]);
      payload.nextRetryAt = nextRetryAt;
      payload.attempt = task.attempt;
      break;
    }
    default:
      break;
  }
  return { from, to, columns, eventType: opts.eventType ?? TASK_EVENT_TYPES[to], payload };
}

// ---------------------------------------------------------------- ready queue

export interface QueueTask {
  id: string;
  status: T.TaskStatus;
  dependsOn: string[];
  priority: number;
  position: number;
  createdAt: string;
}

export function isSatisfied(status: T.TaskStatus | undefined): boolean {
  return status === 'done' || status === 'verified';
}

/** Pending tasks whose dependencies are all done or verified, by priority (high first), then position. */
export function selectReady<Q extends QueueTask>(tasks: Q[], statusOf: (id: string) => T.TaskStatus | undefined): Q[] {
  return tasks
    .filter((t) => t.status === 'pending' && t.dependsOn.every((d) => isSatisfied(statusOf(d))))
    .sort((a, b) => b.priority - a.priority || a.position - b.position || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/** Returns one dependency cycle as a path (first id repeated at the end), or null when the graph is acyclic. */
export function findDependencyCycle(graph: Record<string, string[]>): string[] | null {
  const state = new Map<string, 1 | 2>(); // 1 = on the current path, 2 = finished
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    state.set(id, 1);
    stack.push(id);
    for (const dep of graph[id] ?? []) {
      if (state.get(dep) === 1) return [...stack.slice(stack.indexOf(dep)), dep];
      if (!state.has(dep)) {
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const id of Object.keys(graph)) {
    if (!state.has(id)) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

export function assertAcyclic(graph: Record<string, string[]>): void {
  const cycle = findDependencyCycle(graph);
  if (cycle) throw new ConflictError(`The task dependencies contain a cycle: ${cycle.join(' -> ')}`);
}
