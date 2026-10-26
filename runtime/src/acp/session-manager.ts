import type * as T from '../api/types.ts';
import { findExecutable, ADAPTER_PRESETS } from '../adapters.ts';
import type { Checker } from '../checks.ts';
import { ConflictError, InputError, type Repo } from '../store/repo.ts';
import { AcpClient, AcpError, type PermissionOutcome, type PermissionRequest } from './client.ts';

// One manager per runtime. It owns the ACP clients, turns their notifications
// into transcript rows, turns permission requests into approvals, and records a
// runtime-owned worktree snapshot before and after every turn.

export interface SessionManagerOptions {
  repo: Repo;
  checker: Checker;
  maxSessions?: number;
  permissionTimeoutMs?: number;
}

export interface StartSessionInput {
  jobId: string;
  taskId?: string | null;
  agentId: string;
  adapterId?: string | null;
  prompt?: string;
  mode?: T.Session['mode'];
}

interface LiveSession {
  client: AcpClient | null;
  sessionId: string;
  jobId: string;
  taskId: string | null;
  agentId: string;
  cancelled: boolean;
  closed: boolean;
  worktree: string;
}

const DEFAULTS = [
  'claude',
  'codex',
  'gemini',
  'dsh',
];

export class SessionManager {
  private readonly repo: Repo;
  private readonly checker: Checker;
  private readonly maxSessions: number;
  private readonly permissionTimeoutMs: number;
  private readonly live = new Map<string, LiveSession>();
  private readonly runs = new Map<string, Promise<void>>();

  constructor(opts: SessionManagerOptions) {
    this.repo = opts.repo;
    this.checker = opts.checker;
    this.maxSessions = opts.maxSessions ?? 4;
    this.permissionTimeoutMs = opts.permissionTimeoutMs ?? 15 * 60_000;
  }

  liveSessionIds(): string[] {
    return [...this.live.keys()];
  }

  /** Registers the session and starts the agent in the background; progress is streamed. */
  async start(input: StartSessionInput): Promise<T.Session> {
    const job = this.repo.getJob(input.jobId);
    const agentId = required(input.agentId, 'agentId');
    const identity = this.repo.getIdentity(agentId);
    const task = input.taskId ? this.repo.getTask(input.taskId) : null;
    if (task && task.jobId !== job.id) throw new InputError('The task belongs to a different job');
    if (this.live.size >= this.maxSessions) throw new ConflictError(`The runtime already has ${this.maxSessions} live sessions`);
    this.repo.assertBudget(job.id, 0);

    const adapterId = input.adapterId ?? identity.adapterId ?? 'claude';
    const adapter = this.resolveAdapter(adapterId);
    const worktree = await this.checker.worktreeForJob(job);
    const session = this.repo.registerSession({
      agentId,
      taskId: task?.id ?? null,
      runtimeCommand: [adapter.command, ...adapter.args].join(' '),
      adapterId,
      worktree: worktree.path,
      baseSha: worktree.baseSha,
      baseBranch: job.baseSha ? undefined : undefined,
      mode: input.mode ?? 'build',
      model: null,
    });
    const live: LiveSession = {
      client: null,
      sessionId: session.id,
      jobId: job.id,
      taskId: task?.id ?? null,
      agentId,
      cancelled: false,
      closed: false,
      worktree: worktree.path,
    };
    this.live.set(session.id, live);
    const run = this.run(live, job, task, identity, adapter, input.prompt).catch((e) => this.fail(live, e));
    this.runs.set(session.id, run);
    void run.finally(() => this.runs.delete(session.id));
    return session;
  }

  cancel(sessionId: string, actorId: string): T.Session {
    const live = this.live.get(sessionId);
    if (live) {
      live.cancelled = true;
      void live.client?.cancel();
    }
    return this.repo.requestCancel(sessionId, actorId);
  }

  async prompt(sessionId: string, text: string): Promise<void> {
    const live = this.live.get(sessionId);
    if (!live?.client) throw new ConflictError('This session is not running; start a new turn instead');
    const session = this.repo.getSession(sessionId);
    const prompt = required(text, 'text');
    this.repo.appendTranscript(sessionId, { kind: 'user_message', role: 'user', payload: { text: prompt } });
    const result = await live.client.prompt(prompt);
    this.repo.appendTranscript(sessionId, { kind: 'turn_end', role: null, payload: { stopReason: result.stopReason } });
    this.repo.updateSession(sessionId, { state: 'idle', turnCount: (session.turnCount ?? 0) + 1 });
    await this.snapshot(live, 'after');
  }

  async closeAll(): Promise<void> {
    for (const live of this.live.values()) {
      live.closed = true;
      live.cancelled = true;
      await live.client?.close();
    }
    await Promise.allSettled([...this.runs.values()]);
    this.live.clear();
  }

  // ---------------------------------------------------------------- run

  private async run(
    live: LiveSession,
    job: T.JobDetail,
    task: T.Task | null,
    identity: T.Identity,
    adapter: { command: string; args: string[]; name: string },
    promptOverride?: string
  ): Promise<void> {
    const client = new AcpClient({
      command: adapter.command,
      args: adapter.args,
      cwd: live.worktree,
      worktree: live.worktree,
      handlers: {
        onUpdate: (sessionId, update) => this.onUpdate(live, sessionId, update),
        onPermission: (request) => this.onPermission(live, request),
        onStderr: (line) => this.repo.appendTranscript(live.sessionId, { kind: 'adapter_stderr', role: null, payload: { line: line.slice(0, 4000) } }),
        onExit: (info) => {
          if (live.closed || live.cancelled) return;
          this.repo.updateSession(live.sessionId, {
            state: 'failed',
            exitCode: info.code,
            error: info.error ?? `Adapter exited (code=${info.code}, signal=${info.signal})`,
          });
          this.live.delete(live.sessionId);
        },
      },
    });
    live.client = client;
    try {
      await this.snapshot(live, 'before');
      client.spawnProcess();
      this.repo.updateSession(live.sessionId, { state: 'starting', pid: client.pid });
      const init = await client.initialize();
      const acpSessionId = await client.newSession();
      this.repo.updateSession(live.sessionId, { state: 'running', acpSessionId });
      this.repo.appendTranscript(live.sessionId, {
        kind: 'session_ready',
        role: null,
        payload: { protocolVersion: init?.protocolVersion ?? null, agentInfo: init?.agentInfo ?? null, acpSessionId },
      });
      const prompt = promptOverride?.trim() || this.buildPrompt(job, task, identity, live.worktree);
      this.repo.appendTranscript(live.sessionId, { kind: 'user_message', role: 'user', payload: { text: prompt } });
      const result = await client.prompt(prompt);
      this.repo.appendTranscript(live.sessionId, { kind: 'turn_end', role: null, payload: { stopReason: result.stopReason } });
      if (result.stopReason === 'cancelled' || live.cancelled) {
        this.repo.updateSession(live.sessionId, { state: 'stopped', error: null });
      } else {
        this.repo.updateSession(live.sessionId, { state: 'idle', error: null });
      }
      await this.snapshot(live, 'after');
    } catch (e) {
      this.fail(live, e);
    } finally {
      live.closed = true;
      await client.close();
      this.live.delete(live.sessionId);
    }
  }

  private fail(live: LiveSession, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.repo.appendTranscript(live.sessionId, { kind: 'error', role: null, payload: { message } });
    this.repo.updateSession(live.sessionId, {
      state: 'failed',
      error: error instanceof AcpError ? `${message}${error.code ? ` (code ${error.code})` : ''}` : message,
    });
    this.live.delete(live.sessionId);
  }

  private async snapshot(live: LiveSession, phase: 'before' | 'after'): Promise<void> {
    try {
      await this.checker.snapshot(live.jobId, `runtime:${phase}`);
    } catch (e) {
      this.repo.appendTranscript(live.sessionId, { kind: 'snapshot_error', role: null, payload: { phase, message: (e as Error).message } });
    }
  }

  private onUpdate(live: LiveSession, sessionId: string, update: Record<string, unknown>): void {
    const kind = String(update.sessionUpdate ?? update.type ?? 'unknown');
    const content = update.content as { type?: string; text?: string } | undefined;
    if (kind === 'agent_message_chunk' || kind === 'user_message_chunk' || kind === 'agent_thought_chunk') {
      this.repo.appendTranscript(live.sessionId, {
        kind,
        role: kind === 'user_message_chunk' ? 'user' : kind === 'agent_thought_chunk' ? 'thought' : 'assistant',
        payload: { text: content?.text ?? '' },
      });
      return;
    }
    if (kind === 'tool_call' || kind === 'tool_call_update') {
      this.repo.appendTranscript(live.sessionId, {
        kind,
        role: null,
        itemId: update.toolCallId ? String(update.toolCallId) : null,
        payload: {
          toolCallId: update.toolCallId ?? null,
          title: update.title ?? null,
          kind: update.kind ?? null,
          status: update.status ?? null,
          rawInput: update.rawInput ?? null,
          rawOutput: update.rawOutput ?? null,
          content: update.content ?? null,
          locations: update.locations ?? null,
        },
      });
      return;
    }
    if (kind === 'usage_update') {
      const inputTokens = Number(update.inputTokens ?? update.tokensIn ?? 0) || 0;
      const outputTokens = Number(update.outputTokens ?? update.tokensOut ?? 0) || 0;
      if (inputTokens || outputTokens) {
        this.repo.recordUsage({ jobId: live.jobId, sessionId: live.sessionId, model: null, inputTokens, outputTokens, costCents: 0, source: 'acp' });
      }
    }
    this.repo.appendTranscript(live.sessionId, { kind, role: null, payload: update });
  }

  // ---------------------------------------------------------------- permissions

  private async onPermission(live: LiveSession, request: PermissionRequest): Promise<PermissionOutcome> {
    if (live.cancelled) return { outcome: 'cancelled' };
    const toolCallId = String(request.toolCall?.toolCallId ?? `perm-${Date.now()}`);
    const title = String(request.toolCall?.title ?? request.toolCall?.kind ?? 'tool call');
    const rawInput = (request.toolCall?.rawInput ?? {}) as Record<string, unknown>;
    const outside = JSON.stringify(rawInput).includes('..') || JSON.stringify(rawInput).includes('/etc/');
    const approval = this.repo.createApproval({
      jobId: live.jobId,
      title: `Permission: ${title}`,
      consequence: `The agent asked to ${title}. Approving lets it proceed; declining stops this action.`,
      actionType: 'permission',
      action: {
        toolCallId,
        title,
        kind: request.toolCall?.kind ?? null,
        rawInput,
        options: request.options.map((o) => ({ optionId: o.optionId, kind: o.kind, name: o.name })),
      },
      risk: outside ? 'high' : 'medium',
      requestedBy: live.agentId,
      requestedKind: 'agent',
      sessionId: live.sessionId,
      taskId: live.taskId,
      requestId: `${live.sessionId}:${toolCallId}`,
    });
    this.repo.appendTranscript(live.sessionId, {
      kind: 'permission_request',
      role: null,
      itemId: toolCallId,
      payload: { approvalId: approval.id, title, assignedTo: approval.assignedTo, options: request.options, rawInput },
    });
    const decision = await this.waitForDecision(live, approval.id);
    this.repo.appendTranscript(live.sessionId, {
      kind: 'permission_decision',
      role: null,
      itemId: toolCallId,
      payload: { approvalId: approval.id, decision },
    });
    if (decision === 'approved') {
      const allow = request.options.find((o) => o.kind === 'allow_once') ?? request.options.find((o) => o.kind === 'allow_always');
      return allow ? { outcome: 'selected', optionId: allow.optionId } : { outcome: 'cancelled' };
    }
    const reject = request.options.find((o) => o.kind === 'reject_once') ?? request.options.find((o) => o.kind === 'reject_always');
    return reject ? { outcome: 'selected', optionId: reject.optionId } : { outcome: 'cancelled' };
  }

  private async waitForDecision(live: LiveSession, approvalId: string): Promise<'approved' | 'declined' | 'cancelled'> {
    const deadline = Date.now() + this.permissionTimeoutMs;
    while (Date.now() < deadline) {
      if (live.cancelled) return 'cancelled';
      const approval = this.repo.getApproval(approvalId);
      if (approval.status === 'approved') return 'approved';
      if (approval.status === 'declined' || approval.status === 'expired') return 'declined';
      await new Promise((r) => setTimeout(r, 750));
    }
    return 'declined';
  }

  // ---------------------------------------------------------------- adapters

  private resolveAdapter(id: string): { command: string; args: string[]; name: string } {
    const override = this.repo.listAdapterOverrides().find((row) => String(row.id) === id);
    if (override) {
      const command = String(override.command ?? '');
      if (!command) throw new ConflictError(`Adapter ${id} has no command configured`);
      const args = (() => {
        try {
          return JSON.parse(String(override.args ?? '[]')) as string[];
        } catch {
          return [];
        }
      })();
      return { command, args, name: id };
    }
    const preset = ADAPTER_PRESETS.find((a) => a.id === id);
    if (!preset) throw new ConflictError(`Unknown adapter ${id}. Add it in Settings or use one of: ${DEFAULTS.join(', ')}`);
    const binary = findExecutable(preset.command, preset.aliases);
    if (!binary) throw new ConflictError(`${preset.name} is not installed (looked for ${preset.command}). Nothing was started.`);
    return { command: binary, args: preset.args, name: preset.name };
  }

  private buildPrompt(job: T.JobDetail, task: T.Task | null, identity: T.Identity, worktree: string): string {
    const lines = [
      `You are ${identity.name}${identity.role ? ` (${identity.role})` : ''}, working on JOB-${job.number}: ${job.title}.`,
      `Work only inside this worktree: ${worktree}`,
      '',
      'Brief:',
      job.brief || '(no brief)',
      '',
      job.plan?.summary ? `Plan: ${job.plan.summary}` : '',
      task ? `Your task: ${task.title}` : 'Your job is the whole brief. Do not stop at a plan; make the change.',
      task?.checkCommand ? `Check command: ${task.checkCommand}` : '',
      task?.gate ? `Gate: ${task.gate}` : '',
      '',
      'Acceptance criteria:',
      ...job.criteria.map((c) => `- ${c.text}`),
      '',
      'Rules: work in this worktree. Run the check yourself and report the exact commands and results. Do not claim anything you did not observe. If you need a consequential action outside the worktree, ask for permission.',
    ];
    return lines.filter((line) => line !== '').join('\n');
  }
}

function required(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new InputError(`${field} is required`);
  return value.trim();
}

