// Design Studio lifecycle integration (vision section 12): a design request becomes a job (via the
// unified intake) plus a linked design task assigned to an eligible design agent and a board
// the designer works on.
import type * as T from './api/types.ts';
import { agentUnavailableReason } from './dispatch/dispatcher.ts';
import { extractProjectDesignTokens } from './design-studio.ts';
import { createIntake, titleFromText } from './intake/intake.ts';
import { InputError, type Repo } from './store/repo.ts';
import type { SessionManager } from './acp/session-manager.ts';

export const DESIGN_SKILL = 'design-artifact';
export const DESIGN_DEPARTMENT = 'design';

const DEVICES: T.DesignDeviceKind[] = ['phone', 'tablet', 'desktop', 'custom'];

/**
 * The design identity that should take a task now: department 'design', not the owner, not
 * rate-limited, adapter usable; least loaded first. Returns the reasons candidates were rejected otherwise.
 */
export function pickDesignAgent(
  repo: Repo,
  sessions: Pick<SessionManager, 'adapterBlockedReason'>,
  nowMs = Date.now()
): { agent: T.Identity; reason: string } | { blocked: string } {
  const running = new Map<string, number>();
  for (const t of repo.listTasksWhere("assignee_id IS NOT NULL AND status IN ('assigned', 'acknowledged', 'running')")) {
    running.set(t.assigneeId!, (running.get(t.assigneeId!) ?? 0) + 1);
  }
  const pool = repo.listIdentities().filter((i) => !i.isOwner && i.departmentId === DESIGN_DEPARTMENT);
  if (!pool.length) return { blocked: 'no identity belongs to the design department' };
  const eligible: { agent: T.Identity; load: number }[] = [];
  const rejected: string[] = [];
  for (const agent of pool) {
    const why = agentUnavailableReason(repo, sessions, agent, nowMs);
    if (why) rejected.push(why);
    else eligible.push({ agent, load: running.get(agent.id) ?? 0 });
  }
  if (!eligible.length) return { blocked: `no design agent is available (${rejected.join('; ')})` };
  eligible.sort((a, b) => a.load - b.load || a.agent.id.localeCompare(b.agent.id));
  const best = eligible[0]!;
  return { agent: best.agent, reason: `design request: ${best.agent.id} is in the design department; ${best.load} running task${best.load === 1 ? '' : 's'}; chosen from ${eligible.length} available` };
}

export function createDesignRequest(
  repo: Repo,
  sessions: Pick<SessionManager, 'adapterBlockedReason'>,
  input: T.CreateDesignRequestInput
): T.DesignRequestResult {
  const brief = typeof input.brief === 'string' ? input.brief.trim() : '';
  if (!brief) throw new InputError('brief is required');
  const targets = (input.deviceTargets ?? []).map((d) => {
    if (!DEVICES.includes(d)) throw new InputError(`deviceTargets must be among ${DEVICES.join(', ')}`);
    return d;
  });
  const requestedBy = input.requestedBy?.trim() || 'winston';

  let job: T.JobDetail;
  let duplicateJob = false;
  if (input.jobId) {
    job = repo.getJob(input.jobId);
  } else {
    const res = createIntake(repo, { text: brief, source: 'design', requestedBy, projectId: input.projectId });
    job = res.job;
    duplicateJob = res.duplicate;
  }
  const projectId = input.projectId ?? job.projectId ?? null;
  let projectRoot: string | null = null;
  if (projectId) {
    try {
      projectRoot = repo.getProject(projectId).rootPath;
    } catch {
      /* project without a root: default tokens */
    }
  }

  const title = `Design: ${titleFromText(brief).slice(0, 70)}`;
  const choice = pickDesignAgent(repo, sessions);
  const task = repo.createTask(job.id, {
    title,
    mode: 'design',
    requiredSkills: [DESIGN_SKILL],
    assigneeId: 'agent' in choice ? choice.agent.id : null,
    evidenceRequired: true,
  });
  const assignmentReason = 'agent' in choice ? choice.reason : `left unassigned: ${choice.blocked}`;
  if (!('agent' in choice)) {
    repo.appendEvidence({
      jobId: job.id,
      taskId: task.id,
      kind: 'message',
      class: 'OBSERVED',
      summary: `Design task created unassigned: ${choice.blocked}`,
      recordedBy: 'runtime',
      recordedByKind: 'system',
    });
  }

  const board = repo.createDesignBoard({
    projectId,
    jobId: job.id,
    roomId: job.roomId ?? null,
    taskId: task.id,
    title: titleFromText(brief).slice(0, 80),
    description: [brief, targets.length ? `Device targets: ${targets.join(', ')}` : ''].filter(Boolean).join('\n\n'),
    createdBy: requestedBy,
    designTokens: extractProjectDesignTokens(projectRoot),
  });

  repo.emitEvent({
    type: 'design.requested',
    subjectId: board.id,
    subjectType: 'design_board',
    payload: { jobId: job.id, taskId: task.id, boardId: board.id, assigneeId: 'agent' in choice ? choice.agent.id : null, assignmentReason, deviceTargets: targets, duplicateJob },
    actorId: requestedBy,
    actorKind: 'human',
    jobId: job.id,
    taskId: task.id,
  });

  return { jobId: job.id, boardId: board.id, taskId: task.id, assigneeId: 'agent' in choice ? choice.agent.id : null, assignmentReason, duplicateJob };
}
