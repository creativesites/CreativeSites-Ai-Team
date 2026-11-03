// S1-C: structured plan submission, risk-based auto-accept (programme plan 2.5).
import type * as T from '../api/types.ts';
import { assertAcyclic } from '../lifecycle/tasks.ts';
import { InputError, NotFoundError } from '../errors.ts';
import type { Repo } from '../store/repo.ts';

export interface PlanActor {
  id: string;
  kind: T.ActorKind;
}

export interface SubmitPlanResult {
  jobId: string;
  taskKeys: Record<string, string>;
  replaced: number;
  outcome: 'auto_accepted' | 'approval_requested';
  approvalId: string | null;
  stage: T.JobStage;
}

const MAX_TASKS = 50;
const RISKS = ['low', 'medium', 'high'] as const;

function strList(v: unknown, field: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) throw new InputError(`${field} must be an array of non-empty strings`);
  return v.map((x) => (x as string).trim());
}

/** Validates the raw packet into a PlanPacket. Throws InputError (400) or ConflictError (409). */
export function validatePacket(repo: Repo, raw: unknown): T.PlanPacket {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('packet must be an object');
  const p = raw as Record<string, unknown>;
  if (typeof p.summary !== 'string' || !p.summary.trim()) throw new InputError('summary is required');
  if (!RISKS.includes(p.risk as never)) throw new InputError(`risk must be one of: ${RISKS.join(', ')}`);
  if (!Array.isArray(p.tasks) || p.tasks.length === 0) throw new InputError('tasks must be a non-empty array');
  if (p.tasks.length > MAX_TASKS) throw new InputError(`a plan may have at most ${MAX_TASKS} tasks`);

  const criteria = strList(p.criteria, 'criteria');
  const keys = new Set<string>();
  const tasks: T.PlanTaskInput[] = p.tasks.map((rawTask, i) => {
    if (!rawTask || typeof rawTask !== 'object' || Array.isArray(rawTask)) throw new InputError(`tasks[${i}] must be an object`);
    const t = rawTask as Record<string, unknown>;
    if (typeof t.key !== 'string' || !t.key.trim()) throw new InputError(`tasks[${i}].key is required`);
    if (typeof t.title !== 'string' || !t.title.trim()) throw new InputError(`tasks[${i}].title is required`);
    const key = t.key.trim();
    if (keys.has(key)) throw new InputError(`duplicate task key "${key}"`);
    keys.add(key);
    if (t.assigneeId != null && typeof t.assigneeId !== 'string') throw new InputError(`tasks[${i}].assigneeId must be a string`);
    if (t.checkCommand != null && typeof t.checkCommand !== 'string') throw new InputError(`tasks[${i}].checkCommand must be a string`);
    if (t.priority != null && !Number.isInteger(t.priority)) throw new InputError(`tasks[${i}].priority must be an integer`);
    const refs = t.criteriaRefs;
    if (refs != null) {
      if (!Array.isArray(refs) || refs.some((r) => !Number.isInteger(r) || (r as number) < 0 || (r as number) >= (criteria?.length ?? 0))) {
        throw new InputError(`tasks[${i}].criteriaRefs must be indexes into criteria (0..${(criteria?.length ?? 0) - 1})`);
      }
    }
    return {
      key,
      title: t.title.trim(),
      assigneeId: (t.assigneeId as string | null | undefined)?.trim() || null,
      dependsOn: [...new Set(strList(t.dependsOn, `tasks[${i}].dependsOn`) ?? [])],
      checkCommand: (t.checkCommand as string | null | undefined)?.trim() || null,
      verificationRequired: t.verificationRequired === true,
      requiredSkills: strList(t.requiredSkills, `tasks[${i}].requiredSkills`) ?? [],
      priority: (t.priority as number | undefined) ?? 0,
      criteriaRefs: (refs as number[] | undefined) ?? [],
    };
  });

  const graph: Record<string, string[]> = {};
  for (const t of tasks) {
    for (const d of t.dependsOn ?? []) if (!keys.has(d)) throw new InputError(`task "${t.key}" depends on unknown key "${d}"`);
    graph[t.key] = t.dependsOn ?? [];
  }
  assertAcyclic(graph); // ConflictError -> 409

  for (const id of new Set(tasks.map((t) => t.assigneeId).filter((x): x is string => !!x))) {
    try {
      repo.getIdentity(id);
    } catch (e) {
      if (e instanceof NotFoundError) throw new InputError(`assignee "${id}" does not exist`);
      throw e;
    }
  }

  let risks: T.PlanPacket['risks'];
  if (p.risks != null) {
    if (!Array.isArray(p.risks)) throw new InputError('risks must be an array');
    risks = p.risks.map((r, i) => {
      const x = r as Record<string, unknown>;
      if (!x || typeof x.text !== 'string' || !x.text.trim()) throw new InputError(`risks[${i}].text is required`);
      return { text: x.text.trim(), severity: typeof x.severity === 'string' ? x.severity : 'medium' };
    });
  }
  let estimates: T.PlanPacket['estimates'];
  if (p.estimates != null) {
    const e = p.estimates as Record<string, unknown>;
    if (typeof e !== 'object' || (e.agentHours != null && typeof e.agentHours !== 'number') || (e.notes != null && typeof e.notes !== 'string')) {
      throw new InputError('estimates must be { agentHours?: number, notes?: string }');
    }
    estimates = { agentHours: e.agentHours as number | undefined, notes: e.notes as string | undefined };
  }
  if (p.architecture != null && typeof p.architecture !== 'string') throw new InputError('architecture must be a string');

  return {
    summary: p.summary.trim(),
    requirements: strList(p.requirements, 'requirements'),
    architecture: p.architecture as string | undefined,
    risks,
    risk: p.risk as T.PlanPacket['risk'],
    humanDecisions: strList(p.humanDecisions, 'humanDecisions'),
    estimates,
    criteria,
    tasks,
  };
}

function autoAcceptEnabled(repo: Repo): boolean {
  if (repo.getSetting('workflow.autoAcceptLowRisk') === true) return true;
  const nested = repo.getSetting('workflow') as { autoAcceptLowRisk?: unknown } | undefined;
  return nested?.autoAcceptLowRisk === true;
}

export function budgetExceeded(repo: Repo, jobId: string): boolean {
  const b = repo.budget(jobId);
  return b.configured && b.limitCents != null && b.spentCents >= b.limitCents;
}

export function submitPlan(repo: Repo, jobId: string, rawPacket: unknown, actor: PlanActor): SubmitPlanResult {
  const packet = validatePacket(repo, rawPacket);
  repo.getJob(jobId); // 404 before 409
  const { taskKeys, replaced } = repo.materialisePlan(jobId, packet, actor);

  const decisions = packet.humanDecisions ?? [];
  const flagOn = autoAcceptEnabled(repo);
  const over = budgetExceeded(repo, jobId);
  if (flagOn && packet.risk === 'low' && decisions.length === 0 && !over) {
    const system = { id: 'runtime', kind: 'system' as const };
    repo.recordPlanEvent(jobId, 'plan.auto_accepted', { reason: 'workflow.autoAcceptLowRisk is on, risk is low, no human decisions, budget not exceeded', risk: packet.risk }, system);
    repo.acceptPlanAndBuild(jobId, system, 'plan auto-accepted (low risk)');
    return { jobId, taskKeys, replaced: replaced.length, outcome: 'auto_accepted', approvalId: null, stage: repo.getJob(jobId).stage };
  }

  const why: string[] = [];
  if (!flagOn) why.push('auto-accept is off');
  if (packet.risk !== 'low') why.push(`risk is ${packet.risk}`);
  if (decisions.length) why.push(`${decisions.length} human decision(s) needed`);
  if (over) why.push('job budget is exceeded');
  const consequence = [
    `Risk: ${packet.risk}. Approving accepts the plan (${packet.tasks.length} task(s)) and starts the build stage.`,
    decisions.length ? `Decisions for you: ${decisions.join('; ')}.` : null,
    `Why you are asked: ${why.join(', ')}.`,
  ]
    .filter(Boolean)
    .join(' ');
  const approval = repo.createApproval({
    jobId,
    title: `Accept plan: ${packet.summary.slice(0, 120)}`,
    consequence,
    actionType: 'plan.accept',
    action: { recommendation: packet.summary, risk: packet.risk, humanDecisions: decisions },
    risk: packet.risk,
    requestedBy: actor.id,
    requestedKind: actor.kind,
    reversible: true,
  });
  return { jobId, taskKeys, replaced: replaced.length, outcome: 'approval_requested', approvalId: approval.id, stage: repo.getJob(jobId).stage };
}
