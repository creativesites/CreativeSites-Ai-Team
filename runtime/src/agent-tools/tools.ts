import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Repo } from '../store/repo.ts';
import type { AgentPrincipal } from './tokens.ts';
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
