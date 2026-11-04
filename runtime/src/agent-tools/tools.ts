import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Repo } from '../store/repo.ts';
import { submitPlan } from '../planning/plan.ts';
import { submitReply } from '../standup/replies.ts';
import type { AgentPrincipal } from './tokens.ts';
import { skillServiceFor } from '../skills/service.ts';
import { councilServiceFor } from '../council/live.ts';
import { validate, type JsonSchema } from './validate.ts';

/**
 * The agent action interface v1 (programme plan K4; vision §15).
 *
 * Tool names use underscores because MCP clients restrict names to
 * [a-zA-Z0-9_-]; `job_get` is the vision's `job.get`, and so on.
 * Business logic lives here, independent of transport: MCP (mcp-server.ts),
 * and later HTTP or the bracket-directive fallback, call the same handlers.
 */

export class ToolRejected extends Error {}

export interface ToolContext {
  principal: AgentPrincipal;
  repo: Repo;
  db: DatabaseSync;
  now: () => Date;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchema & { type: 'object' };
  /** Roles allowed to call the tool; omitted means any agent. */
  roles?: string[];
  handler: (ctx: ToolContext, args: Record<string, unknown>) => unknown;
}

const s = (description: string, extra: Partial<JsonSchema> = {}): JsonSchema => ({ type: 'string', description, ...extra });
const IDEM = s('Optional key; repeating a call with the same key returns the first result instead of acting twice', { maxLength: 200 });

/** The job a call acts on: the token's job, and only that job. */
function jobOf(ctx: ToolContext, args: Record<string, unknown>): string {
  const requested = typeof args.jobId === 'string' ? args.jobId : null;
  const bound = ctx.principal.jobId;
  if (bound && requested && requested !== bound) throw new ToolRejected(`This session may act only on job ${bound}`);
  const jobId = bound ?? requested;
  if (!jobId) throw new ToolRejected('No job: this session is not bound to a job, and no jobId was given');
  return jobId;
}

function taskOf(ctx: ToolContext, args: Record<string, unknown>, jobId: string): string | null {
  const requested = typeof args.taskId === 'string' ? args.taskId : null;
  const bound = ctx.principal.taskId;
  if (bound && requested && requested !== bound) throw new ToolRejected(`This session may act only on task ${bound}`);
  const taskId = bound ?? requested;
  if (taskId) {
    const task = ctx.repo.getTask(taskId);
    if (task.jobId !== jobId) throw new ToolRejected('That task belongs to a different job');
  }
  return taskId;
}

export const TOOLS: ToolDef[] = [
  {
    name: 'job_get',
    description: 'Read the job you are working on: brief, plan, acceptance criteria and tasks.',
    inputSchema: { type: 'object', properties: { jobId: s('Defaults to your session job') }, additionalProperties: false },
    handler: (ctx, args) => {
      const job = ctx.repo.getJob(jobOf(ctx, args));
      return {
        id: job.id,
        title: job.title,
        stage: job.stage,
        brief: job.brief,
        plan: job.plan ?? null,
        criteria: job.criteria.map((c) => ({ id: c.id, text: c.text, evidence: c.evidenceClass ?? null })),
        tasks: job.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, assigneeId: t.assigneeId, checkCommand: t.checkCommand })),
      };
    },
  },
  {
    name: 'task_report',
    description: 'Report progress on your task in one or two sentences. Use this instead of long chat messages. It does not mark the task done: the runtime and an independent verifier do that.',
    inputSchema: {
      type: 'object',
      required: ['summary'],
      properties: { summary: s('What changed since the last report', { minLength: 3, maxLength: 2000 }), taskId: s('Defaults to your session task'), idempotencyKey: IDEM },
      additionalProperties: false,
    },
    handler: (ctx, args) => {
      const jobId = jobOf(ctx, args);
      const taskId = taskOf(ctx, args, jobId);
      const ev = ctx.repo.appendEvidence({
        jobId,
        taskId,
        sessionId: ctx.principal.sessionId,
        kind: 'message',
        class: 'DECLARED',
        summary: String(args.summary),
        recordedBy: ctx.principal.identityId,
        recordedByKind: 'agent',
      });
      return { evidenceId: ev.id, class: ev.class };
    },
  },
  {
    name: 'evidence_add',
    description: 'Attach evidence you produced (a test you ran, a commit, an artifact). It is stored as DECLARED or ATTESTED. Only the runtime records OBSERVED evidence, and only an independent verifier records VERIFIED.',
    inputSchema: {
      type: 'object',
      required: ['kind', 'summary'],
      properties: {
        kind: s('Evidence kind', { enum: ['test', 'command', 'diff', 'file', 'artifact', 'review', 'message'] }),
        class: s('Your confidence class', { enum: ['DECLARED', 'ATTESTED'] }),
        summary: s('One sentence', { minLength: 3, maxLength: 2000 }),
        command: s('Command you ran, if any', { maxLength: 2000 }),
        exitCode: { type: 'integer' },
        commitSha: s('Commit, if any', { maxLength: 64 }),
        criterionId: s('Acceptance criterion this supports'),
        taskId: s('Defaults to your session task'),
        idempotencyKey: IDEM,
      },
      additionalProperties: false,
    },
    handler: (ctx, args) => {
      const jobId = jobOf(ctx, args);
      const taskId = taskOf(ctx, args, jobId);
      const ev = ctx.repo.appendEvidence({
        jobId,
        taskId,
        sessionId: ctx.principal.sessionId,
        criterionId: typeof args.criterionId === 'string' ? args.criterionId : null,
        kind: args.kind as never,
        class: (args.class as 'DECLARED' | 'ATTESTED' | undefined) ?? 'DECLARED',
        summary: String(args.summary),
        command: typeof args.command === 'string' ? args.command : null,
        exitCode: typeof args.exitCode === 'number' ? args.exitCode : null,
        commitSha: typeof args.commitSha === 'string' ? args.commitSha : null,
        recordedBy: ctx.principal.identityId,
        recordedByKind: 'agent',
      });
      return { evidenceId: ev.id, class: ev.class };
    },
  },
  {
    name: 'thread_post',
    description: "Post a short message to your job's thread (its room), visible to the owner and the team.",
    inputSchema: {
      type: 'object',
      required: ['body'],
      properties: { body: s('Message', { minLength: 1, maxLength: 4000 }), idempotencyKey: IDEM },
      additionalProperties: false,
    },
    handler: (ctx, args) => {
      const jobId = jobOf(ctx, args);
      const job = ctx.repo.getJob(jobId);
      if (!job.roomId) throw new ToolRejected('This job has no room to post to');
      const m = ctx.repo.postMessage(job.roomId, { authorId: ctx.principal.identityId, authorKind: 'agent', body: String(args.body), jobId });
      return { messageId: m.id };
    },
  },
  {
    name: 'blocker_raise',
    description: 'Say you are blocked and what you need. It becomes a Needs-You item for the owner or the lead. Do not keep working around a blocker silently.',
    inputSchema: {
      type: 'object',
      required: ['summary'],
      properties: {
        summary: s('What blocks you', { minLength: 3, maxLength: 1000 }),
        needs: s('What would unblock you (a decision, access, another task)', { maxLength: 1000 }),
        severity: s('How badly', { enum: ['low', 'normal', 'high'] }),
        taskId: s('Defaults to your session task'),
        idempotencyKey: IDEM,
      },
      additionalProperties: false,
    },
    handler: (ctx, args) => {
      const jobId = jobOf(ctx, args);
      const taskId = taskOf(ctx, args, jobId);
      const id = `blk_${crypto.randomBytes(8).toString('hex')}`;
      ctx.db
        .prepare('INSERT INTO blockers (id, job_id, task_id, raised_by, summary, needs, severity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, jobId, taskId, ctx.principal.identityId, String(args.summary), (args.needs as string) ?? null, (args.severity as string) ?? 'normal', ctx.now().toISOString());
      // Leave a durable, visible trace in the job as well.
      ctx.repo.appendEvidence({
        jobId,
        taskId,
        sessionId: ctx.principal.sessionId,
        kind: 'message',
        class: 'DECLARED',
        summary: `Blocked: ${String(args.summary)}`,
        payload: { blockerId: id, needs: args.needs ?? null },
        recordedBy: ctx.principal.identityId,
        recordedByKind: 'agent',
      });
      return { blockerId: id };
    },
  },
  {
    name: 'plan_submit',
    description:
      'Submit the structured plan for your job: summary, risk (low|medium|high), acceptance criteria and a task graph (keys, dependsOn keys, assignees). The runtime creates the tasks; low-risk plans may be accepted automatically, otherwise the owner is asked. Resubmitting while the job is still in plan replaces tasks that have not started.',
    roles: ['planner', 'lead'],
    inputSchema: {
      type: 'object',
      required: ['summary', 'risk', 'tasks'],
      properties: {
        jobId: s('Defaults to your session job'),
        summary: s('The plan in a few sentences', { minLength: 3, maxLength: 4000 }),
        requirements: { type: 'array', items: s('Requirement', { maxLength: 1000 }), maxItems: 100 },
        architecture: s('Approach and structure', { maxLength: 8000 }),
        risks: {
          type: 'array',
          maxItems: 50,
          items: { type: 'object', required: ['text'], properties: { text: s('Risk', { maxLength: 1000 }), severity: s('Severity', { maxLength: 20 }) }, additionalProperties: false },
        },
        risk: s('Overall risk', { enum: ['low', 'medium', 'high'] }),
        humanDecisions: { type: 'array', items: s('A decision only the owner can make', { maxLength: 1000 }), maxItems: 50 },
        estimates: { type: 'object', properties: { agentHours: { type: 'number', minimum: 0 }, notes: s('Notes', { maxLength: 2000 }) }, additionalProperties: false },
        criteria: { type: 'array', items: s('Acceptance criterion', { maxLength: 1000 }), maxItems: 100 },
        tasks: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            required: ['key', 'title'],
            properties: {
              key: s('Unique key within this plan', { maxLength: 100 }),
              title: s('Task title', { maxLength: 500 }),
              assigneeId: s('Identity id'),
              dependsOn: { type: 'array', items: s('Task key'), maxItems: 50 },
              checkCommand: s('Command that checks the task', { maxLength: 2000 }),
              verificationRequired: { type: 'boolean' },
              requiredSkills: { type: 'array', items: s('Skill'), maxItems: 50 },
              priority: { type: 'integer' },
              criteriaRefs: { type: 'array', items: { type: 'integer', minimum: 0 }, maxItems: 100 },
            },
            additionalProperties: false,
          },
        },
        idempotencyKey: IDEM,
      },
      additionalProperties: false,
    },
    handler: (ctx, args) => {
      const jobId = jobOf(ctx, args);
      const { jobId: _j, idempotencyKey: _i, ...packet } = args;
      // WP3 3.3: the synthesiser seat of an accepted live council submits the council's plan.
      const councils = councilServiceFor(ctx.repo);
      const councilId = councils?.councilForSynthesiser(ctx.principal) ?? null;
      const result = submitPlan(ctx.repo, jobId, packet, { id: ctx.principal.identityId, kind: 'agent' }, { councilId });
      if (councilId) councils!.planSubmitted(councilId, ctx.principal, result);
      return councilId ? { ...result, councilId } : result;
    },
  },
  {
    name: 'council_card_submit',
    description:
      'Submit your card for the open round of the Planning Council you hold a seat on: a 0-10 score for EVERY option, your vote (endorse, amend or dissent), your rationale and what would have to be true for you to change your mind. One card per seat per round; the round must be open. Your card is stored with your session id and scored by the runtime; dissent is recorded in the verdict.',
    inputSchema: {
      type: 'object',
      required: ['round', 'scores', 'vote', 'rationale'],
      properties: {
        round: { type: 'integer', minimum: 1, maximum: 10 },
        scores: { type: 'object', description: 'Option id -> score from 0 to 10, for every option' },
        vote: s('Your vote', { enum: ['endorse', 'amend', 'dissent'] }),
        rationale: s('Your argument', { minLength: 3, maxLength: 4000 }),
        wouldHaveToBeTrue: s('What would have to be true for you to change your mind', { maxLength: 2000 }),
        confidence: { type: 'number', minimum: 0, maximum: 10 },
        reversible: { type: 'boolean' },
        jobId: s('Defaults to your session job'),
      },
      additionalProperties: false,
    },
    handler: (ctx, args) => {
      const jobId = jobOf(ctx, args);
      const councils = councilServiceFor(ctx.repo);
      if (!councils) throw new ToolRejected('The live council is not enabled in this runtime');
      return councils.submitCard(ctx.principal, jobId, {
        round: Number(args.round),
        scores: args.scores as Record<string, number>,
        vote: args.vote as 'endorse' | 'amend' | 'dissent',
        rationale: String(args.rationale),
        wouldHaveToBeTrue: typeof args.wouldHaveToBeTrue === 'string' ? args.wouldHaveToBeTrue : undefined,
        confidence: typeof args.confidence === 'number' ? args.confidence : undefined,
        reversible: typeof args.reversible === 'boolean' ? args.reversible : undefined,
      });
    },
  },
  {
    name: 'standup_submit',
    description:
      'Answer the daily stand-up the runtime asked you about: what you finished, what you will do next, and anything blocking you. Only works while a stand-up is collecting replies. Report only what you actually did; the runtime checks it against its records and shows your text labelled as agent-reported. Each blocker you list becomes an open blocker.',
    inputSchema: {
      type: 'object',
      properties: {
        done: s('What you finished since the last stand-up', { maxLength: 4000 }),
        next: s('What you will do next', { maxLength: 4000 }),
        blockers: { type: 'array', description: 'Anything blocking you; empty or omitted if none', items: { type: 'string', maxLength: 500 }, maxItems: 10 },
      },
      additionalProperties: false,
    },
    handler: (ctx, args) => {
      const out = submitReply(ctx.repo, ctx.principal.identityId, args, ctx.now().toISOString(), 'tool');
      return { recorded: true, runId: out.runId };
    },
  },
  {
    name: 'task_claim',
    description:
      'Acknowledge that you accept your assigned task (assigned -> acknowledged). If the task is still pending, assigned to you and its dependencies are done, it is assigned and acknowledged in one step. Repeating the call is harmless.',
    inputSchema: { type: 'object', properties: { taskId: s('Defaults to your session task'), jobId: s('Defaults to your session job'), idempotencyKey: IDEM }, additionalProperties: false },
    handler: (ctx, args) => {
      const jobId = jobOf(ctx, args);
      const taskId = taskOf(ctx, args, jobId);
      if (!taskId) throw new ToolRejected('No task: give taskId, or use a session bound to a task');
      const task = ctx.repo.getTask(taskId);
      const me = ctx.principal.identityId;
      if (task.assigneeId !== me) {
        throw new ToolRejected(task.assigneeId ? `Task ${taskId} is assigned to ${task.assigneeId}, not to you` : `Task ${taskId} has no assignee, so you cannot claim it`);
      }
      const opts = { actorId: me, actorKind: 'agent' as const, reason: 'claimed by assignee' };
      if (task.status === 'acknowledged' || task.status === 'running') return { taskId, status: task.status, alreadyClaimed: true };
      if (task.status === 'pending') {
        if (!ctx.repo.dependenciesMet(taskId)) throw new ToolRejected('This task is not ready: its dependencies are not done yet');
        ctx.repo.transitionTask(taskId, 'assigned', { ...opts, assigneeId: me });
      } else if (task.status !== 'assigned') {
        throw new ToolRejected(`Task ${taskId} is ${task.status}; only an assigned (or ready pending) task can be claimed`);
      }
      const done = ctx.repo.transitionTask(taskId, 'acknowledged', opts);
      return { taskId, status: done.status, alreadyClaimed: false };
    },
  },
  {
    name: 'usage_report',
    description: 'Report token usage for your last turn when your client shows it. Reported usage is labelled as agent-reported, not provider-measured.',
    inputSchema: {
      type: 'object',
      required: ['inputTokens', 'outputTokens'],
      properties: { inputTokens: { type: 'integer', minimum: 0 }, outputTokens: { type: 'integer', minimum: 0 }, model: s('Model id', { maxLength: 120 }), idempotencyKey: IDEM },
      additionalProperties: false,
    },
    handler: (ctx, args) => {
      const u = ctx.repo.recordUsage({
        jobId: ctx.principal.jobId,
        sessionId: ctx.principal.sessionId,
        model: (args.model as string) ?? null,
        inputTokens: Number(args.inputTokens),
        outputTokens: Number(args.outputTokens),
        source: 'agent_reported',
      });
      return { usageId: u.id };
    },
  },
  {
    name: 'context_report',
    description: 'Report how full your context window is (tokens used and window size) when you know it. The runtime uses this to renew your session before it gets expensive.',
    inputSchema: {
      type: 'object',
      required: ['usedTokens'],
      properties: { usedTokens: { type: 'integer', minimum: 0 }, windowTokens: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    },
    handler: (ctx, args) => {
      if (!ctx.principal.sessionId) throw new ToolRejected('No session bound to this token');
      ctx.repo.updateSession(ctx.principal.sessionId, { contextTokens: Number(args.usedTokens) });
      const pct = typeof args.windowTokens === 'number' ? Math.round((Number(args.usedTokens) / Number(args.windowTokens)) * 100) : null;
      return { recorded: true, utilisationPct: pct };
    },
  },
  {
    name: 'skill_list',
    description: 'List the skills selected for your task (pinned versions) and the id and description of every available skill. Read any of them with skill_read.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: (ctx) => {
      const svc = skillServiceFor(ctx.repo);
      if (!svc) throw new ToolRejected('Skills are not enabled in this runtime');
      const taskId = ctx.principal.taskId;
      return {
        selected: taskId ? svc.taskSkills(taskId).map((x) => ({ id: x.skillId, version: x.version, contentHash: x.contentHash, reason: x.reason })) : [],
        available: svc.list().map((x) => ({ id: x.id, version: x.version, description: x.description })),
      };
    },
  },
  {
    name: 'skill_read',
    description: 'Read the instructions of a skill by id. If the skill is pinned to your task you get the pinned version; otherwise the current one.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: s('Skill id', { minLength: 1, maxLength: 120 }) }, additionalProperties: false },
    handler: (ctx, args) => {
      const svc = skillServiceFor(ctx.repo);
      if (!svc) throw new ToolRejected('Skills are not enabled in this runtime');
      const id = String(args.id);
      const taskId = ctx.principal.taskId;
      const pinned = taskId ? svc.taskSkills(taskId).find((x) => x.skillId === id) : undefined;
      const skill = svc.get(id, pinned?.contentHash);
      if (!skill) throw new ToolRejected(`No skill ${id}. Call skill_list to see what exists.`);
      return { id: skill.id, version: skill.version, contentHash: skill.contentHash, pinned: Boolean(pinned), description: skill.description, instructions: skill.body };
    },
  },
];

export interface CallOutcome {
  status: 'ok' | 'rejected' | 'error';
  result?: unknown;
  error?: string;
  replayed?: boolean;
}

/** Validates, authorises, runs and audits one tool call. Never throws. */
export function callTool(ctx: ToolContext, name: string, rawArgs: unknown, tools: ToolDef[] = TOOLS): CallOutcome {
  const started = Date.now();
  const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
  const idem = typeof args.idempotencyKey === 'string' && args.idempotencyKey ? args.idempotencyKey : null;
  const audit = (o: CallOutcome) => {
    ctx.db
      .prepare(
        `INSERT INTO tool_calls (id, token_id, identity_id, session_id, job_id, task_id, tool, args, status, error, result, idempotency_key, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `tc_${crypto.randomBytes(8).toString('hex')}`,
        ctx.principal.tokenId,
        ctx.principal.identityId,
        ctx.principal.sessionId,
        ctx.principal.jobId,
        ctx.principal.taskId,
        name,
        JSON.stringify(args).slice(0, 8000),
        o.status,
        o.error ?? null,
        o.status === 'ok' ? JSON.stringify(o.result ?? null).slice(0, 8000) : null,
        o.status === 'ok' ? idem : null,
        Date.now() - started,
        ctx.now().toISOString()
      );
    return o;
  };

  const tool = tools.find((t) => t.name === name);
  if (!tool) return audit({ status: 'rejected', error: `Unknown tool ${name}. Call tools/list to see what you can use.` });
  if (tool.roles && !tool.roles.includes(ctx.principal.role)) {
    return audit({ status: 'rejected', error: `${name} needs one of the roles ${tool.roles.join(', ')}; your session role is ${ctx.principal.role}` });
  }
  const errors = validate(tool.inputSchema, args);
  if (errors.length) return audit({ status: 'rejected', error: `Invalid arguments: ${errors.join('; ')}` });

  if (idem) {
    const prior = ctx.db
      .prepare("SELECT result FROM tool_calls WHERE identity_id = ? AND tool = ? AND idempotency_key = ? AND status = 'ok'")
      .get(ctx.principal.identityId, name, idem) as { result: string | null } | undefined;
    if (prior) return { status: 'ok', result: prior.result ? JSON.parse(prior.result) : null, replayed: true };
  }

  try {
    return audit({ status: 'ok', result: tool.handler(ctx, args) });
  } catch (e) {
    const err = e as Error;
    const rejected = err instanceof ToolRejected || ['InputError', 'NotFoundError', 'ConflictError', 'ForbiddenError'].includes(err.constructor?.name);
    return audit({ status: rejected ? 'rejected' : 'error', error: err.message });
  }
}
