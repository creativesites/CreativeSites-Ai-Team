// WP4 4.4: the dependency-aware dispatcher. Each orchestrator tick (behind the setting
// `workflow.dispatcher`, default off) it takes the ready tasks of jobs in the build stage,
// picks an assignee, moves the task pending -> assigned through the K3 transition function
// and starts a session for it. Concurrency is capped globally and per agent.
import type * as T from '../api/types.ts';
import { ISOLATION_PREFIX } from '../usage/session-hooks.ts';
import type { SessionManager } from '../acp/session-manager.ts';
import type { Checker } from '../checks.ts';
import type { Repo } from '../store/repo.ts';

export const DISPATCHER_ACTOR = 'runtime:dispatcher';

export interface DispatchSettings {
  enabled: boolean;
  maxConcurrentSessions: number;
  maxSessionsPerAgent: number;
}

export const DEFAULT_DISPATCH_SETTINGS: DispatchSettings = { enabled: false, maxConcurrentSessions: 2, maxSessionsPerAgent: 1 };

export function resolveDispatchSettings(repo: Repo): DispatchSettings {
  const posInt = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : d);
  return {
    enabled: repo.getSetting('workflow.dispatcher') === true,
    maxConcurrentSessions: posInt(repo.getSetting('workflow.maxConcurrentSessions'), DEFAULT_DISPATCH_SETTINGS.maxConcurrentSessions),
    maxSessionsPerAgent: posInt(repo.getSetting('workflow.maxSessionsPerAgent'), DEFAULT_DISPATCH_SETTINGS.maxSessionsPerAgent),
  };
}

export interface DispatchedTask {
  taskId: string;
  agentId: string;
  sessionId: string;
  reason: string;
}

export interface DispatchResult {
  dispatched: DispatchedTask[];
  /** Ready tasks left waiting, with the reason (no capacity, no eligible agent, integration pending). */
  waiting: { taskId: string; reason: string }[];
  integrated: string[];
}

/** Retry cooldown for a task whose session failed to start, so a broken adapter is not hammered every tick. */
const START_RETRY_MS = 15_000;

export class Dispatcher {
  private readonly repo: Repo;
  private readonly sessions: SessionManager;
  private readonly checker: Checker;
  private busy = false;
  private readonly lastAttempt = new Map<string, number>();

  constructor(opts: { repo: Repo; sessions: SessionManager; checker: Checker }) {
    this.repo = opts.repo;
    this.sessions = opts.sessions;
    this.checker = opts.checker;
  }

  /** One pass. Returns an empty result when the flag is off or a pass is already running. */
  async dispatch(nowMs = Date.now()): Promise<DispatchResult> {
    const out: DispatchResult = { dispatched: [], waiting: [], integrated: [] };
    const settings = resolveDispatchSettings(this.repo);
    if (!settings.enabled || this.busy) return out;
    this.busy = true;
    try {
      for (const summary of this.repo.listJobs({ stage: 'build', limit: 500 })) {
        // Merge finished work first so tasks that depend on it branch from a job branch that has it.
        for (const { taskId } of this.repo.listUnintegratedTaskWorktrees(summary.id)) {
          const r = await this.checker.integrateTaskSafely(summary.id, taskId);
          if (r?.status === 'merged') out.integrated.push(taskId);
        }
      }
      const live = this.repo.liveSessionRows();
      const liveTasks = new Set(live.filter((l) => l.taskId).map((l) => l.taskId!));
      const perAgent = new Map<string, number>();
      for (const l of live) perAgent.set(l.agentId, (perAgent.get(l.agentId) ?? 0) + 1);
      let total = live.length;

      for (const summary of this.repo.listJobs({ stage: 'build', limit: 500 })) {
        const candidates: T.Task[] = [
          ...this.repo.readyTasks(summary.id),
          // A retry the sweeper moved back to assigned has an assignee but no session yet.
          ...this.repo.listTasksWhere("job_id = ? AND status = 'assigned' AND assignee_id IS NOT NULL", summary.id),
        ];
        for (const task of candidates) {
          if (liveTasks.has(task.id)) continue; // never dispatch a task twice
          if (total >= settings.maxConcurrentSessions) {
            out.waiting.push({ taskId: task.id, reason: `no free slot (${total}/${settings.maxConcurrentSessions} sessions running)` });
            continue;
          }
          if (nowMs - (this.lastAttempt.get(task.id) ?? 0) < START_RETRY_MS) continue;
          const pendingMerge = (task.dependsOn ?? []).find((d) => this.repo.findTaskWorktree(d)?.state === 'active');
          if (pendingMerge) {
            out.waiting.push({ taskId: task.id, reason: `dependency ${pendingMerge} is not integrated into the job branch yet` });
            continue;
          }
          const choice = this.chooseAssignee(task, perAgent, settings, nowMs);
          if ('blocked' in choice) {
            out.waiting.push({ taskId: task.id, reason: choice.blocked });
            continue;
          }
          const started = await this.start(task, summary.id, summary.number, choice.agent, choice.reason, nowMs);
          if (!started) continue;
          liveTasks.add(task.id);
          total += 1;
          perAgent.set(choice.agent.id, (perAgent.get(choice.agent.id) ?? 0) + 1);
          out.dispatched.push({ taskId: task.id, agentId: choice.agent.id, sessionId: started, reason: choice.reason });
        }
      }
      return out;
    } finally {
      this.busy = false;
    }
  }

  private async start(task: T.Task, jobId: string, jobNumber: number, agent: T.Identity, reason: string, nowMs: number): Promise<string | null> {
    this.lastAttempt.set(task.id, nowMs);
    try {
      if (task.status === 'pending') {
        this.repo.transitionTask(task.id, 'assigned', { actorId: DISPATCHER_ACTOR, actorKind: 'system', assigneeId: agent.id, reason });
      }
      const session = await this.sessions.start({ agentId: agent.id, jobId, taskId: task.id, prompt: dispatchPrompt(task, jobNumber, this.repo.listApprovedDesigns(jobId)) });
      this.repo.emitEvent({
        type: 'dispatch.started',
        subjectId: task.id,
        subjectType: 'task',
        payload: { taskId: task.id, agentId: agent.id, sessionId: session.id, reason },
        actorId: DISPATCHER_ACTOR,
        actorKind: 'system',
        jobId,
        taskId: task.id,
        sessionId: session.id,
      });
      return session.id;
    } catch (e) {
      // K9 refusals are not transient: retrying would only refuse again. Hand the task to the owner.
      if ((e as Error).message?.startsWith(ISOLATION_PREFIX)) {
        try {
          this.repo.transitionTask(task.id, 'needs_human', { actorId: DISPATCHER_ACTOR, actorKind: 'system', reason: (e as Error).message });
        } catch {
          /* the table may not allow it from this state; the failure event below still records it */
        }
      }
      // The task stays assigned: the ack timeout (K3) fails it and the sweeper retries with backoff.
      try {
        this.repo.emitEvent({
          type: 'dispatch.failed',
          subjectId: task.id,
          subjectType: 'task',
          payload: { taskId: task.id, agentId: agent.id, error: (e as Error).message },
          actorId: DISPATCHER_ACTOR,
          actorKind: 'system',
          jobId,
          taskId: task.id,
        });
      } catch {
        /* store closing */
      }
      return null;
    }
  }

  /**
   * The task's own assignee when it has one and can work now; otherwise the eligible identity
   * with the fewest running tasks. Eligible means: skills or capabilities overlap the task's
   * required skills (any agent when none are required), not rate-limited, adapter usable,
   * below the per-agent session cap.
   */
  private chooseAssignee(
    task: T.Task,
    perAgent: Map<string, number>,
    settings: DispatchSettings,
    nowMs: number
  ): { agent: T.Identity; reason: string } | { blocked: string } {
    const unavailable = (agent: T.Identity): string | null => {
      if ((perAgent.get(agent.id) ?? 0) >= settings.maxSessionsPerAgent) return `${agent.id} is at its session limit (${settings.maxSessionsPerAgent})`;
      return agentUnavailableReason(this.repo, this.sessions, agent, nowMs);
    };

    if (task.assigneeId) {
      let agent: T.Identity;
      try {
        agent = this.repo.getIdentity(task.assigneeId);
      } catch {
        return { blocked: `assignee ${task.assigneeId} does not exist` };
      }
      const why = unavailable(agent);
      return why ? { blocked: why } : { agent, reason: `dispatcher: task already assigned to ${agent.id}` };
    }

    const required = (task.requiredSkills ?? []).map((x) => x.toLowerCase());
    const running = new Map<string, number>();
    for (const t of this.repo.listTasksWhere("assignee_id IS NOT NULL AND status IN ('assigned', 'acknowledged', 'running')")) {
      running.set(t.assigneeId!, (running.get(t.assigneeId!) ?? 0) + 1);
    }
    const pool = this.repo.listIdentities().filter((i) => !i.isOwner);
    const eligible: { agent: T.Identity; overlap: string[]; load: number }[] = [];
    const rejected: string[] = [];
    for (const agent of pool) {
      const have = new Set([...(agent.skills ?? []), ...(agent.capabilities ?? [])].map((x) => x.toLowerCase()));
      const overlap = required.filter((r) => have.has(r));
      if (required.length && !overlap.length) continue;
      const why = unavailable(agent);
      if (why) {
        rejected.push(why);
        continue;
      }
      eligible.push({ agent, overlap, load: running.get(agent.id) ?? 0 });
    }
    if (!eligible.length) {
      return { blocked: required.length ? `no available agent has any of the skills: ${required.join(', ')}${rejected.length ? ` (${rejected.join('; ')})` : ''}` : `no available agent${rejected.length ? ` (${rejected.join('; ')})` : ''}` };
    }
    eligible.sort((a, b) => a.load - b.load || b.overlap.length - a.overlap.length || a.agent.id.localeCompare(b.agent.id));
    const best = eligible[0]!;
    const skills = required.length ? `skills matched: ${best.overlap.join(', ')}` : 'no skills required';
    return {
      agent: best.agent,
      reason: `dispatcher: ${skills}; ${best.load} running task${best.load === 1 ? '' : 's'}; chosen from ${eligible.length} available`,
    };
  }
}

/** Why an agent cannot take work right now (rate limit, blocked adapter), or null. Shared with the design-request flow. */
export function agentUnavailableReason(repo: Repo, sessions: Pick<SessionManager, 'adapterBlockedReason'>, agent: T.Identity, nowMs: number): string | null {
  if (agent.rateLimitResetAt && Date.parse(agent.rateLimitResetAt) > nowMs) return `${agent.id} is rate-limited until ${agent.rateLimitResetAt}`;
  if (agent.statusState === 'rate_limited') return `${agent.id} is rate-limited`;
  const adapterId = (agent.adapterId ?? '').toLowerCase();
  const row = adapterId ? repo.listAdapterOverrides().find((a) => String(a.id) === adapterId) : undefined;
  if (row?.rate_limit_reset_at && Date.parse(String(row.rate_limit_reset_at)) > nowMs) return `adapter ${adapterId} is rate-limited until ${String(row.rate_limit_reset_at)}`;
  const blocked = sessions.adapterBlockedReason(agent);
  return blocked ? `${agent.id}: ${blocked}` : null;
}

/** The first message of a dispatched session: claim, work, report. */
export function dispatchPrompt(task: T.Task, jobNumber: number, approvedDesigns: T.ApprovedDesignRef[] = []): string {
  return [
    `MyaOS dispatch: you are assigned task "${task.title}" (id ${task.id}) on job #${jobNumber}.`,
    `1. Call the myaos tool task_claim with taskId ${task.id} to acknowledge the task before anything else.`,
    '2. Do the work in your current working directory. It is a worktree and branch dedicated to this task; other tasks have their own.',
    '3. When finished, call task_report with a short summary of what changed. The runtime commits your work, runs the check and merges the branch into the job branch.',
    task.checkCommand ? `Check command the runtime will run: ${task.checkCommand}` : '',
    approvedDesigns.length && task.mode !== 'design'
      ? [
          'Approved designs for this job (implement these faithfully; report any deviation with design_conformance_report):',
          ...approvedDesigns.map((d) => `- ${d.title} (frame ${d.frameId}, v${d.version}, ${d.device})${d.path ? `: ${d.path}` : ''}`),
        ].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
