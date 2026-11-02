import os from 'node:os';
import path from 'node:path';
import type * as T from '../api/types.ts';
import { ADAPTER_PRESETS, findExecutable } from '../adapters.ts';
import type { Checker } from '../checks.ts';
import { ConflictError, InputError, type Repo } from '../store/repo.ts';
import { AcpClient, AcpError, type PermissionOption, type PermissionOutcome, type PermissionRequest } from './client.ts';

export interface StartSessionInput {
  jobId?: string | null;
  roomId?: string | null;
  taskId?: string | null;
  agentId: string;
  adapterId?: string | null;
  prompt?: string;
  mode?: T.Session['mode'];
}

export interface SessionLifecycleHooks {
  onTurnComplete?: (info: {
    sessionId: string;
    agentId: string;
    adapterId: string;
    jobId: string | null;
    roomId: string | null;
    taskId: string | null;
    assistantText: string;
    checkPassed: boolean;
  }) => void | Promise<void>;
  onRateLimit?: (info: {
    sessionId: string;
    agentId: string;
    adapterId: string;
    jobId: string | null;
    roomId: string | null;
    taskId: string | null;
    reason: string;
    resetAt: string;
    prompt: string;
  }) => void | Promise<void>;
}

interface LiveSession {
  sessionId: string;
  jobId: string | null;
  roomId: string | null;
  taskId: string | null;
  agentId: string;
  adapterId: string;
  worktree: string;
  client: AcpClient;
  acpSessionId: string | null;
  assistantText: string;
  cancelled: boolean;
  closed: boolean;
  /** Set while the adapter replays a loaded session; the replay is already in the transcript. */
  replaying: boolean;
  /** Set on a continuation: the prior ACP session to load, plus a summary for the fallback path. */
  resume: { acpSessionId: string | null; priorSummary: string } | null;
}

const RESUME_SUMMARY_LIMIT = 6000;
const RESUME_PREAMBLE =
  'Earlier in this session the adapter could not reload the previous conversation, so here is a summary of it. Continue from it:';

const RUNTIME_TO_ADAPTER: Record<string, string> = {
  'claude code': 'claude',
  claude: 'claude',
  'claude-agent-acp': 'claude',
  codex: 'codex',
  'codex-acp': 'codex',
  gemini: 'gemini',
  'gemini cli': 'gemini',
  'gemini --acp': 'gemini',
  antigravity: 'gemini',
};

function pathEnv(...binaries: (string | null)[]): Record<string, string> {
  const dirs = binaries
    .filter((b): b is string => Boolean(b))
    .map((b) => path.dirname(b))
    .filter((d) => d && d !== '.');
  const current = process.env.PATH ?? '';
  return { PATH: [...new Set([...dirs, ...current.split(path.delimiter)])].join(path.delimiter) };
}

/**
 * Parses rate-limit / session-limit messages from stderr or ACP errors (Claude Code 5h/weekly
 * session limits, Codex/OpenAI usage limits, Gemini quota exhaustion) and computes the ISO
 * `resetAt` timestamp.
 */
export function parseRateLimitFromText(text: string, nowMs = Date.now()): { isRateLimited: boolean; reason: string; resetAt: string } | null {
  const clean = text.trim();
  if (!clean) return null;
  const hit =
    /(?:session|usage|rate|weekly|5[- ]hour)\s+limit/i.test(clean) ||
    /\b(?:rate_limit_error|rate_limit_exceeded|RESOURCE_EXHAUSTED|quota\s+exceeded|too\s+many\s+requests)\b/i.test(clean) ||
    /\bresets?\s+(?:at|in)\s+\d/i.test(clean);
  if (!hit) return null;

  const firstLine = clean.split('\n').map((l) => l.trim()).find(Boolean) ?? 'Session limit reached';
  const reason = firstLine.slice(0, 260);

  // 1. Check relative duration: "resets in 2h 15m", "in 45m", "in 30 minutes", "in 120s"
  const relMatch = clean.match(/(?:resets?\s+in|try\s+again\s+in|after)\s+(?:(\d+)\s*h(?:ours?|r)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+)\s*s(?:ec(?:ond)?s?)?)?/i);
  if (relMatch && (relMatch[1] || relMatch[2] || relMatch[3])) {
    const hours = Number(relMatch[1] ?? 0);
    const mins = Number(relMatch[2] ?? 0);
    const secs = Number(relMatch[3] ?? 0);
    const deltaMs = (hours * 3600 + mins * 60 + secs) * 1000;
    if (deltaMs > 0) {
      return {
        isRateLimited: true,
        reason,
        resetAt: new Date(nowMs + deltaMs).toISOString(),
      };
    }
  }

  // 2. Check clock time: "resets 2pm", "resets at 14:30", "resets at 3:15 PM"
  const clockMatch = clean.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (clockMatch) {
    let hour = Number(clockMatch[1]);
    const minute = Number(clockMatch[2] ?? 0);
    const ampm = clockMatch[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      const target = new Date(nowMs);
      target.setHours(hour, minute, 0, 0);
      if (target.getTime() <= nowMs) {
        target.setDate(target.getDate() + 1);
      }
      return {
        isRateLimited: true,
        reason,
        resetAt: target.toISOString(),
      };
    }
  }

  // 3. Default cooldown window when limit is hit without an explicit reset clock
  return {
    isRateLimited: true,
    reason,
    resetAt: new Date(nowMs + 30 * 60 * 1000).toISOString(),
  };
}

export function stripCoordinationBoilerplate(text: string): string {
  return text.split('\n--- MyaOS Autonomous Team Coordination ---')[0]?.trim() || text.trim();
}

export function isInternalDiagnosticStderr(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^\[session\/(create|prompt|load|cancel|new)\]/i.test(trimmed)) return true;
  if (/\bphase=(validate-cwd|settings|init|spawn|auth)\b/i.test(trimmed) && /\bdurationMs=\d+/i.test(trimmed)) return true;
  return false;
}

/**
 * Coalesces raw streaming transcript rows (token-level `message` / `thought` chunks
 * and paired `tool_call` updates) into logical turns for both terminal and UI rendering.
 */
function coalesceTranscriptEntries(entries: T.TranscriptEntry[]): T.TranscriptEntry[] {
  const result: T.TranscriptEntry[] = [];

  for (const entry of entries) {
    const p = (entry.payload && typeof entry.payload === 'object' ? entry.payload : {}) as Record<string, unknown>;
    const prev = result[result.length - 1];

    // 1. Merge consecutive assistant message chunks into one block
    if (
      (entry.kind === 'message' || entry.kind === 'agent_message_chunk') &&
      prev &&
      (prev.kind === 'message' || prev.kind === 'agent_message_chunk') &&
      prev.role === entry.role
    ) {
      const prevPayload = (prev.payload && typeof prev.payload === 'object' ? prev.payload : {}) as Record<string, unknown>;
      prev.payload = {
        ...prevPayload,
        text: `${String(prevPayload.text ?? '')}${String(p.text ?? '')}`,
      };
      continue;
    }

    // 2. Merge consecutive thought chunks into one block
    if (
      (entry.kind === 'thought' || entry.kind === 'agent_thought_chunk') &&
      prev &&
      (prev.kind === 'thought' || prev.kind === 'agent_thought_chunk')
    ) {
      const prevPayload = (prev.payload && typeof prev.payload === 'object' ? prev.payload : {}) as Record<string, unknown>;
      prev.payload = {
        ...prevPayload,
        text: `${String(prevPayload.text ?? '')}${String(p.text ?? '')}`,
      };
      continue;
    }

    // 3. Merge tool_call_update into its preceding matching tool_call when adjacent
    if (
      (entry.kind === 'tool' || entry.kind === 'tool_call_update') &&
      prev &&
      (prev.kind === 'tool' || prev.kind === 'tool_call' || prev.kind === 'tool_call_update')
    ) {
      const prevPayload = (prev.payload && typeof prev.payload === 'object' ? prev.payload : {}) as Record<string, unknown>;
      const prevToolId = prev.itemId ?? String(prevPayload.toolCallId ?? '');
      const curToolId = entry.itemId ?? String(p.toolCallId ?? '');
      if (prevToolId && curToolId && prevToolId === curToolId) {
        prev.title = entry.title ?? prev.title;
        prev.payload = {
          ...prevPayload,
          ...p,
          rawInput: p.rawInput ?? prevPayload.rawInput,
        };
        continue;
      }
    }

    result.push({
      ...entry,
      payload: p ? { ...p } : entry.payload,
    });
  }

  return result;
}

/**
 * Condenses a session's prior transcript into plain text for the resume fallback, used when the
 * adapter cannot `session/load` the earlier conversation. Keeps the most recent exchanges when the
 * transcript is longer than `limit` characters.
 */
export function buildResumeSummary(entries: T.TranscriptEntry[], limit = RESUME_SUMMARY_LIMIT): string {
  const lines: string[] = [];
  for (const entry of coalesceTranscriptEntries(entries)) {
    const p = (entry.payload && typeof entry.payload === 'object' ? entry.payload : {}) as Record<string, unknown>;
    const text = String(p.text ?? '').trim();
    if (!text) continue;
    if (entry.kind === 'prompt' || entry.kind === 'user_message') {
      lines.push(`User: ${stripCoordinationBoilerplate(text)}`);
    } else if (entry.kind === 'message' || entry.kind === 'agent_message_chunk') {
      lines.push(`Agent: ${text}`);
    }
  }
  const joined = lines.join('\n\n');
  return joined.length > limit ? `…${joined.slice(-limit)}` : joined;
}

/**
 * Formats a session and its transcript entries into a full ANSI terminal log
 * (matching the feel of Claude Code / Codex / Antigravity terminal output).
 */
export function formatSessionTerminalOutput(session: T.Session, entries: T.TranscriptEntry[], agentName?: string): string {
  const lines: string[] = [];
  const headerColor = '\x1b[38;5;39m';
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';
  const green = '\x1b[32m';
  const yellow = '\x1b[33m';
  const red = '\x1b[31m';
  const cyan = '\x1b[36m';
  const magenta = '\x1b[35m';

  lines.push(
    `${headerColor}╭─── MyaOS Agent Terminal · ${agentName ?? session.agentId} (${session.adapterId ?? session.runtimeCommand}) ───╮${reset}`,
    `${dim}│ Session ID: ${session.id}  ·  ACP ID: ${session.acpSessionId ?? 'pending'}  ·  State: ${session.state}${reset}`,
    `${dim}│ Worktree:   ${session.worktree ?? '(room context)'}  ·  PID: ${session.pid ?? '—'}${reset}`,
    `${headerColor}╰──────────────────────────────────────────────────────────────────────────────╯${reset}`,
    ''
  );

  const coalesced = coalesceTranscriptEntries(entries);

  for (const entry of coalesced) {
    const p = (entry.payload && typeof entry.payload === 'object' ? entry.payload : {}) as Record<string, unknown>;
    const ts = new Date(entry.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    switch (entry.kind) {
      case 'prompt':
      case 'user_message': {
        const text = String(p.text ?? '');
        const display = stripCoordinationBoilerplate(text);
        lines.push(`${magenta}❯ [${ts}] Instruction → ${agentName ?? session.agentId}:${reset}`);
        for (const l of display.split('\n')) {
          lines.push(`  ${l}`);
        }
        lines.push('');
        break;
      }
      case 'thought':
      case 'agent_thought_chunk': {
        const text = String(p.text ?? '').trim();
        if (text) {
          lines.push(`${dim}💭 [${ts}] Thinking:${reset}`);
          for (const l of text.split('\n')) {
            lines.push(`  ${dim}${l}${reset}`);
          }
          lines.push('');
        }
        break;
      }
      case 'tool':
      case 'tool_call':
      case 'tool_call_update': {
        const status = String(p.status ?? 'running');
        const title = entry.title ?? String(p.title ?? 'Tool call');
        const icon = status === 'completed' ? `${green}✓${reset}` : status === 'failed' ? `${red}✗${reset}` : `${cyan}⚙${reset}`;
        lines.push(`${icon} ${cyan}[${ts}] ${title}${reset} ${dim}(${status})${reset}`);
        if (p.rawInput && typeof p.rawInput === 'object') {
          const rawStr = JSON.stringify(p.rawInput);
          if (rawStr && rawStr !== '{}') {
            lines.push(`  ${dim}input: ${rawStr.slice(0, 300)}${reset}`);
          }
        }
        if (typeof p.text === 'string' && p.text.trim()) {
          for (const l of p.text.trim().split('\n').slice(0, 40)) {
            lines.push(`  ${dim}│${reset} ${l}`);
          }
        }
        break;
      }
      case 'command': {
        const cmd = entry.title ?? String(p.command ?? 'command');
        const args = Array.isArray(p.args) ? (p.args as string[]).join(' ') : '';
        lines.push(`${cyan}$ [${ts}] ${cmd}${args ? ` ${args}` : ''}${reset}`);
        break;
      }
      case 'file': {
        const op = String(p.op ?? 'file');
        const filePath = entry.title ?? '';
        lines.push(`${green}✎ [${ts}] ${op.toUpperCase()} ${filePath}${reset}${p.bytes != null ? ` ${dim}(${p.bytes} bytes)${reset}` : ''}`);
        break;
      }
      case 'message':
      case 'agent_message_chunk': {
        const text = String(p.text ?? '').trim();
        if (text) {
          lines.push(`${green}● [${ts}] ${agentName ?? session.agentId}:${reset}`);
          for (const l of text.split('\n')) {
            lines.push(`  ${l}`);
          }
          lines.push('');
        }
        break;
      }
      case 'stderr':
      case 'adapter_stderr': {
        const text = String(p.text ?? p.line ?? '').trim();
        if (text && !isInternalDiagnosticStderr(text)) {
          lines.push(`${yellow}⚠ [${ts}] [stderr] ${text}${reset}`);
        }
        break;
      }
      case 'approval':
      case 'permission_request': {
        lines.push(`${yellow}⏳ [${ts}] Permission requested: ${entry.title ?? String(p.title ?? '')} → ${String(p.status ?? 'pending')}${reset}`);
        break;
      }
      case 'turn':
      case 'turn_end': {
        const stopReason = String(p.stopReason ?? 'end_turn');
        lines.push(`${dim}─── [${ts}] Turn complete (${stopReason}) ───${reset}`, '');
        break;
      }
      case 'error': {
        lines.push(`${red}✖ [${ts}] Error: ${String(p.message ?? 'unknown error')}${reset}`);
        break;
      }
      default: {
        if (typeof p.text === 'string' && p.text.trim()) {
          lines.push(`${dim}[${ts}] ${p.text.trim()}${reset}`);
        }
        break;
      }
    }
  }

  return lines.join('\r\n') + '\r\n';
}

export class SessionManager {
  private readonly repo: Repo;
  private readonly checker: Checker;
  private readonly env: Record<string, string>;
  private readonly live = new Map<string, LiveSession>();
  private readonly runs = new Map<string, Promise<void>>();
  private hooks: SessionLifecycleHooks = {};

  constructor(opts: { repo: Repo; checker: Checker; env?: Record<string, string> }) {
    this.repo = opts.repo;
    this.checker = opts.checker;
    this.env = opts.env ?? {};
  }

  setHooks(hooks: SessionLifecycleHooks): void {
    this.hooks = hooks;
  }

  async start(input: StartSessionInput): Promise<T.Session> {
    const agent = this.repo.getIdentity(input.agentId);
    const job = input.jobId ? this.repo.getJob(input.jobId) : null;
    const room = input.roomId ? this.repo.getRoom(input.roomId) : job ? this.repo.getRoom(job.roomId) : null;
    const task = input.taskId ? this.repo.getTask(input.taskId) : null;
    if (task && job && task.jobId !== job.id) throw new InputError('task belongs to a different job');
    if (job) this.repo.assertBudget(job.id, 0);

    const adapter = this.resolveAdapter(input.adapterId ?? agent.adapterId ?? agent.runtime);

    let worktreePath = room?.repoPath ?? process.cwd() ?? os.homedir();
    let baseSha: string | null = null;
    let baseBranch: string | null = null;

    if (job) {
      try {
        const worktree = await this.checker.worktreeForJob(job);
        worktreePath = worktree.path;
        baseSha = worktree.baseSha;
        baseBranch = `myaos/job-${job.number}`;
      } catch {
        worktreePath = room?.repoPath ?? process.cwd() ?? os.homedir();
      }
    }

    const session = this.repo.registerSession({
      agentId: agent.id,
      taskId: task?.id ?? null,
      jobId: job?.id ?? null,
      roomId: room?.id ?? null,
      runtimeCommand: [adapter.command, ...adapter.args].join(' '),
      adapterId: adapter.id,
      worktree: worktreePath,
      baseSha,
      baseBranch,
      mode: input.mode ?? task?.mode ?? 'build',
    });

    if (task && task.status === 'pending') {
      this.repo.updateTask(task.id, { status: 'running' });
    }

    const acpPrompt = this.buildPrompt(job, room, task, agent, input.prompt);
    const displayPrompt = stripCoordinationBoilerplate(input.prompt?.trim() ? input.prompt : acpPrompt);
    this.repo.appendTranscript(session.id, {
      kind: 'prompt',
      role: 'user',
      title: 'Session prompt',
      payload: { text: displayPrompt },
    });

    const client = new AcpClient({
      command: adapter.command,
      args: adapter.args,
      cwd: worktreePath,
      worktree: worktreePath,
      env: { ...process.env, ...this.env, ...(adapter.env ?? {}) },
      handlers: {
        onUpdate: (_acpSessionId, update) => {
          if (!live.closed) this.handleUpdate(session.id, update);
        },
        onPermission: (req) => {
          if (live.closed) return Promise.resolve({ outcome: 'cancelled' as const });
          return this.handlePermission(session.id, job?.id ?? null, agent.id, task?.id ?? null, req);
        },
        onStderr: (line) => {
          if (live.closed) return;
          try {
            this.repo.appendTranscript(session.id, {
              kind: 'stderr',
              role: 'system',
              payload: { text: line },
            });
            const rl = parseRateLimitFromText(line);
            if (rl) {
              this.recordRateLimit(session.id, agent.id, adapter.id, job?.id ?? null, room?.id ?? null, task?.id ?? null, rl.reason, rl.resetAt, displayPrompt);
            }
          } catch {
            /* store closed */
          }
        },
      },
    });

    const live: LiveSession = {
      sessionId: session.id,
      jobId: job?.id ?? null,
      roomId: room?.id ?? null,
      taskId: task?.id ?? null,
      agentId: agent.id,
      adapterId: adapter.id,
      worktree: worktreePath,
      client,
      acpSessionId: null,
      assistantText: '',
      cancelled: false,
      closed: false,
      replaying: false,
      resume: null,
    };
    this.live.set(session.id, live);

    const run = this.run(live, acpPrompt);
    this.runs.set(session.id, run);
    void run.finally(() => this.runs.delete(session.id));
    return this.repo.getSession(session.id);
  }

  /**
   * Sends a follow-up prompt to a live session, OR seamlessly resumes/continues
   * the session if its previous turn already completed and closed the subprocess.
   */
  async prompt(sessionId: string, text: string): Promise<void> {
    const cleanText = stripCoordinationBoilerplate(text);
    const live = this.live.get(sessionId);
    if (live && !live.closed && live.acpSessionId && !this.runs.has(sessionId)) {
      this.repo.appendTranscript(sessionId, { kind: 'prompt', role: 'user', payload: { text: cleanText } });
      this.repo.updateSession(sessionId, { state: 'running' });
      const result = await live.client.prompt(text);
      if (result && typeof result === 'object' && 'usage' in result && result.usage) {
        const u = result.usage as Record<string, unknown>;
        const inputTokens = Number(u.inputTokens ?? u.input_tokens ?? 0) || 0;
        const outputTokens = Number(u.outputTokens ?? u.output_tokens ?? 0) || 0;
        const costCents = Number(u.costCents ?? u.cost_cents ?? 0) || 0;
        if (inputTokens || outputTokens || costCents) {
          this.repo.recordUsage({
            jobId: live.jobId,
            sessionId: live.sessionId,
            inputTokens,
            outputTokens,
            costCents,
            source: 'acp',
          });
        }
      }
      this.repo.appendTranscript(sessionId, { kind: 'turn', role: 'system', payload: result });
      this.repo.updateSession(sessionId, { state: 'idle' });
      return;
    }

    // Session turn already exited: run a continuation turn on the existing session record
    const existing = this.repo.getSession(sessionId);
    const agent = this.repo.getIdentity(existing.agentId);
    const job = existing.jobId ? this.repo.getJob(existing.jobId) : null;
    const room = existing.roomId ? this.repo.getRoom(existing.roomId) : job ? this.repo.getRoom(job.roomId) : null;
    const task = existing.taskId ? this.repo.getTask(existing.taskId) : null;
    const adapter = this.resolveAdapter(existing.adapterId ?? agent.adapterId ?? agent.runtime);
    const worktreePath = existing.worktree ?? process.cwd() ?? os.homedir();
    const acpPrompt = this.buildPrompt(job, room, task, agent, cleanText);
    // Summarise before appending this turn's prompt, so the summary covers only earlier turns.
    const priorSummary = buildResumeSummary(this.repo.listTranscript(sessionId, 0, 10000));
    this.repo.appendTranscript(sessionId, { kind: 'prompt', role: 'user', title: 'Wake / follow-up prompt', payload: { text: cleanText } });
    this.repo.updateSession(sessionId, { state: 'starting', error: null });

    const client = new AcpClient({
      command: adapter.command,
      args: adapter.args,
      cwd: worktreePath,
      worktree: worktreePath,
      env: { ...process.env, ...this.env, ...(adapter.env ?? {}) },
      handlers: {
        onUpdate: (_acpSessionId, update) => {
          if (!resumedLive.closed) this.handleUpdate(sessionId, update);
        },
        onPermission: (req) => {
          if (resumedLive.closed) return Promise.resolve({ outcome: 'cancelled' as const });
          return this.handlePermission(sessionId, existing.jobId ?? null, agent.id, existing.taskId ?? null, req);
        },
        onStderr: (line) => {
          if (resumedLive.closed) return;
          try {
            this.repo.appendTranscript(sessionId, {
              kind: 'stderr',
              role: 'system',
              payload: { text: line },
            });
            const rl = parseRateLimitFromText(line);
            if (rl) {
              this.recordRateLimit(sessionId, agent.id, adapter.id, existing.jobId ?? null, existing.roomId ?? null, existing.taskId ?? null, rl.reason, rl.resetAt, cleanText);
            }
          } catch {
            /* store closed */
          }
        },
      },
    });

    const resumedLive: LiveSession = {
      sessionId,
      jobId: existing.jobId ?? null,
      roomId: existing.roomId ?? null,
      taskId: existing.taskId ?? null,
      agentId: agent.id,
      adapterId: adapter.id,
      worktree: worktreePath,
      client,
      acpSessionId: null,
      assistantText: '',
      cancelled: false,
      closed: false,
      replaying: false,
      resume: { acpSessionId: existing.acpSessionId ?? null, priorSummary },
    };
    this.live.set(sessionId, resumedLive);
    const run = this.run(resumedLive, acpPrompt);
    this.runs.set(sessionId, run);
    void run.finally(() => this.runs.delete(sessionId));
  }

  cancel(sessionId: string, actorId: string): T.Session {
    const updated = this.repo.requestCancel(sessionId, actorId);
    const live = this.live.get(sessionId);
    if (live && !live.closed) {
      live.cancelled = true;
      void live.client.cancel();
      setTimeout(() => {
        if (!live.closed) void live.client.close();
      }, 2500).unref();
    }
    return updated;
  }

  async closeAll(): Promise<void> {
    for (const live of this.live.values()) {
      live.closed = true;
      live.cancelled = true;
      await live.client.close().catch(() => {});
    }
    await Promise.allSettled([...this.runs.values()]);
    this.live.clear();
  }

  private recordRateLimit(
    sessionId: string,
    agentId: string,
    adapterId: string,
    jobId: string | null,
    roomId: string | null,
    taskId: string | null,
    reason: string,
    resetAt: string,
    prompt: string
  ) {
    try {
      this.repo.setIdentityRateLimit(agentId, reason, resetAt);
      this.repo.setAdapterRateLimit(adapterId, reason, resetAt);
      void this.hooks.onRateLimit?.({
        sessionId,
        agentId,
        adapterId,
        jobId,
        roomId,
        taskId,
        reason,
        resetAt,
        prompt,
      });
    } catch {
      /* ignore if already recorded */
    }
  }

  private async run(live: LiveSession, prompt: string): Promise<void> {
    const { client } = live;
    try {
      if (live.jobId) {
        try {
          await this.checker.snapshot(live.jobId, `runtime:before`);
        } catch {
          /* non-git or clean worktree */
        }
      }
      client.spawnProcess();
      this.repo.updateSession(live.sessionId, { state: 'starting', pid: client.pid });
      const init = await client.initialize();
      const opened = await this.openAcpSession(live, init, prompt);
      const acpSessionId = opened.acpSessionId;
      live.acpSessionId = acpSessionId;
      const agentInfo = (init.agentInfo ?? {}) as { name?: string };
      this.repo.updateSession(live.sessionId, {
        state: 'running',
        pid: client.pid,
        acpSessionId,
        model: agentInfo.name ?? null,
      });

      const result = await client.prompt(opened.prompt);
      if (live.closed) return;

      if (result.usage) {
        const u = result.usage as Record<string, unknown>;
        const inputTokens = Number(u.inputTokens ?? u.input_tokens ?? u.tokensIn ?? 0) || 0;
        const outputTokens = Number(u.outputTokens ?? u.output_tokens ?? u.tokensOut ?? 0) || 0;
        const costCents = Number(u.costCents ?? u.cost_cents ?? (typeof u.cost === 'object' && u.cost ? (u.cost as any).amount : 0)) || 0;
        if (inputTokens || outputTokens || costCents) {
          this.repo.recordUsage({
            jobId: live.jobId,
            sessionId: live.sessionId,
            model: (u.model as string) ?? null,
            inputTokens,
            outputTokens,
            costCents,
            source: 'acp',
          });
        }
      }

      this.repo.appendTranscript(live.sessionId, {
        kind: 'turn_end',
        role: 'system',
        title: `Turn finished (${result.stopReason ?? 'end_turn'})`,
        payload: { stopReason: result.stopReason, usage: result.usage ?? null },
      });

      let checkPassed = false;
      if (live.jobId && !live.closed) {
        try {
          await this.checker.snapshot(live.jobId, `runtime:after`);
          const commit = await this.checker.commitWorktree(live.jobId, `${live.agentId} session ${live.sessionId.slice(-6)}`);
          if (commit.committed) {
            this.repo.appendTranscript(live.sessionId, {
              kind: 'commit',
              role: null,
              payload: { commitSha: commit.commitSha, evidenceId: commit.evidence?.id ?? null },
            });
          }
        } catch {
          /* non-git or clean worktree */
        }
        if (live.taskId && !live.closed) {
          const task = this.repo.getTask(live.taskId);
          if (task.checkCommand) {
            const check = await this.checker.runTaskCheck(live.jobId, task.id);
            checkPassed = check.result.exitCode === 0;
            this.repo.updateTask(task.id, { status: checkPassed ? 'done' : 'failed' });
          } else {
            this.repo.updateTask(task.id, { status: 'done' });
            checkPassed = true;
          }
        }
      }

      if (result.stopReason !== 'cancelled' && !live.cancelled && !live.closed) {
        await this.hooks.onTurnComplete?.({
          sessionId: live.sessionId,
          agentId: live.agentId,
          adapterId: live.adapterId,
          jobId: live.jobId,
          roomId: live.roomId,
          taskId: live.taskId,
          assistantText: live.assistantText,
          checkPassed,
        });
      }

      const stoppedState: T.SessionState = result.stopReason === 'cancelled' || live.cancelled ? 'stopped' : 'idle';
      this.repo.updateSession(live.sessionId, { state: stoppedState, exitCode: 0, error: null });
    } catch (e) {
      if (live.closed) return;
      const message = e instanceof AcpError ? `${e.message} (code ${e.code})` : (e as Error).message;
      const rl = parseRateLimitFromText(message);
      if (rl) {
        this.recordRateLimit(
          live.sessionId,
          live.agentId,
          live.adapterId,
          live.jobId,
          live.roomId,
          live.taskId,
          rl.reason,
          rl.resetAt,
          prompt
        );
      }
      this.repo.appendTranscript(live.sessionId, {
        kind: 'error',
        role: 'system',
        title: rl ? 'Session limit reached' : 'Session failed',
        payload: { message, rateLimit: rl ?? undefined },
      });
      this.repo.updateSession(live.sessionId, { state: 'failed', error: message });
      if (live.taskId) {
        try {
          this.repo.updateTask(live.taskId, { status: rl ? 'blocked' : 'failed' });
        } catch {
          /* task may have been removed */
        }
      }
    } finally {
      live.closed = true;
      await client.close();
      this.live.delete(live.sessionId);
    }
  }

  private async openAcpSession(
    live: LiveSession,
    _init: Record<string, unknown>,
    prompt: string
  ): Promise<{ acpSessionId: string; prompt: string }> {
    if (live.resume?.acpSessionId && live.client.canLoadSession) {
      try {
        live.replaying = true;
        const id = await live.client.loadSession(live.resume.acpSessionId);
        this.repo.appendTranscript(live.sessionId, {
          kind: 'session_load',
          role: 'system',
          title: `Resumed ACP session ${id}`,
          payload: { acpSessionId: id },
        });
        return { acpSessionId: id, prompt };
      } catch {
        /* fallback to new session */
      } finally {
        live.replaying = false;
      }
    }
    const acpSessionId = await live.client.newSession();
    if (live.resume?.priorSummary) {
      return {
        acpSessionId,
        prompt: `${RESUME_PREAMBLE}\n\n${live.resume.priorSummary}\n\n${prompt}`,
      };
    }
    return { acpSessionId, prompt };
  }

  private handleUpdate(sessionId: string, update: Record<string, unknown>): void {
    const live = this.live.get(sessionId);
    if (!live || live.closed || !update || live.replaying) return;
    const kind = String(update.sessionUpdate ?? update.type ?? 'unknown');
    if (kind === 'agent_message_chunk' || kind === 'user_message_chunk' || kind === 'agent_thought_chunk') {
      const content = (update.content ?? {}) as { type?: string; text?: string };
      const text = content?.text ?? '';
      if (kind === 'agent_message_chunk') {
        live.assistantText += text;
      }
      this.repo.appendTranscript(sessionId, {
        kind: kind === 'agent_thought_chunk' ? 'thought' : kind === 'user_message_chunk' ? 'user_message' : 'message',
        role: kind === 'user_message_chunk' ? 'user' : kind === 'agent_thought_chunk' ? 'thought' : 'assistant',
        payload: { text },
      });
      return;
    }
    if (kind === 'tool_call' || kind === 'tool_call_update') {
      const contentArr = Array.isArray(update.content) ? (update.content as Record<string, unknown>[]) : [];
      const chunkText = contentArr
        .map((c) => {
          const inner = (c.content ?? {}) as { text?: string };
          return inner.text ?? (typeof c.path === 'string' ? `${String(c.type ?? 'file')}: ${c.path}` : '');
        })
        .filter(Boolean)
        .join('\n');
      this.repo.appendTranscript(sessionId, {
        kind: 'tool',
        role: 'tool',
        itemId: typeof update.toolCallId === 'string' ? update.toolCallId : null,
        title: typeof update.title === 'string' ? update.title : kind,
        payload: {
          toolCallId: update.toolCallId ?? null,
          title: update.title ?? null,
          status: typeof update.status === 'string' ? update.status : (kind === 'tool_call' ? 'pending' : 'updated'),
          rawInput: update.rawInput ?? null,
          text: chunkText || undefined,
        },
      });
      return;
    }
    if (kind === 'usage_update' || kind === 'usage' || Boolean(update.usage)) {
      const u = (update.usage && typeof update.usage === 'object' ? update.usage : update) as Record<string, unknown>;
      const inputTokens = Number(u.inputTokens ?? u.input_tokens ?? u.tokensIn ?? 0) || 0;
      const outputTokens = Number(u.outputTokens ?? u.output_tokens ?? u.tokensOut ?? 0) || 0;
      const costCents = Number(u.costCents ?? u.cost_cents ?? (typeof u.cost === 'object' && u.cost ? (u.cost as any).amount : 0)) || 0;
      if (inputTokens || outputTokens || costCents) {
        this.repo.recordUsage({
          jobId: live.jobId,
          sessionId: live.sessionId,
          model: (u.model as string) ?? null,
          inputTokens,
          outputTokens,
          costCents,
          source: 'acp',
        });
      }
    }
    this.repo.appendTranscript(sessionId, {
      kind,
      role: 'system',
      payload: update,
    });
  }

  private async handlePermission(
    sessionId: string,
    jobId: string | null,
    agentId: string,
    taskId: string | null,
    req: PermissionRequest
  ): Promise<PermissionOutcome> {
    const toolCall = req.toolCall ?? {};
    const options: PermissionOption[] = req.options ?? [];
    const raw = (toolCall.rawInput && typeof toolCall.rawInput === 'object' ? toolCall.rawInput : {}) as Record<string, unknown>;
    const title = typeof toolCall.title === 'string' && toolCall.title ? toolCall.title : `Allow ${String(toolCall.kind ?? 'tool action')}`;
    const target = typeof raw.file_path === 'string' ? raw.file_path : typeof raw.command === 'string' ? raw.command : '';
    const consequence = target
      ? `${agentId} wants to run "${title}" on ${target}.`
      : `${agentId} asked for permission: "${title}".`;
    const toolKind = String(toolCall.kind ?? '');
    const outside = JSON.stringify(raw).includes('..') || JSON.stringify(raw).includes('/etc/');
    const risk: T.Risk =
      outside || toolKind === 'delete' || /\b(rm|reset|push|drop)\b/i.test(title + ' ' + target)
        ? 'high'
        : toolKind === 'edit' || toolKind === 'execute'
          ? 'medium'
          : 'low';

    const resolvedJobId = jobId ?? this.repo.listJobs({ limit: 1 })[0]?.id ?? null;
    if (!resolvedJobId) {
      const allowOpt = options.find((o) => o.kind === 'allow_once' || o.kind === 'allow_always') ?? options[0];
      return allowOpt ? { outcome: 'selected', optionId: allowOpt.optionId } : { outcome: 'cancelled' };
    }

    const approval = this.repo.createApproval({
      jobId: resolvedJobId,
      title: `Permission: ${title}`,
      consequence,
      actionType: 'permission',
      action: { toolCall, options },
      risk,
      requestedBy: agentId,
      requestedKind: 'agent',
      sessionId,
      taskId,
      reversible: toolKind !== 'delete',
    });
    this.repo.appendTranscript(sessionId, {
      kind: 'permission_request',
      role: 'system',
      itemId: approval.id,
      title,
      payload: { approvalId: approval.id, status: 'pending', consequence, options },
    });

    const allow = options.find((o) => o.kind === 'allow_once' || o.kind === 'allow_always') ?? options[0];
    const reject = options.find((o) => o.kind === 'reject_once' || o.kind === 'reject_always');
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      const live = this.live.get(sessionId);
      if (!live || live.closed || live.cancelled) return { outcome: 'cancelled' };
      const current = this.repo.getApproval(approval.id);
      const session = this.repo.getSession(sessionId);
      if (session.cancelRequestedAt) return { outcome: 'cancelled' };
      if (current.status === 'approved') {
        this.repo.appendTranscript(sessionId, {
          kind: 'permission_decision',
          role: 'system',
          itemId: approval.id,
          title,
          payload: { approvalId: approval.id, status: 'approved', decidedBy: current.decidedBy },
        });
        return allow ? { outcome: 'selected', optionId: allow.optionId } : { outcome: 'cancelled' };
      }
      if (current.status === 'declined' || current.status === 'expired') {
        this.repo.appendTranscript(sessionId, {
          kind: 'permission_decision',
          role: 'system',
          itemId: approval.id,
          title,
          payload: { approvalId: approval.id, status: current.status, decidedBy: current.decidedBy },
        });
        return reject ? { outcome: 'selected', optionId: reject.optionId } : { outcome: 'cancelled' };
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return { outcome: 'cancelled' };
  }

  private resolveAdapter(requested?: string | null): { id: string; command: string; args: string[]; name: string; env?: Record<string, string> } {
    const key = requested ? (RUNTIME_TO_ADAPTER[requested.toLowerCase()] ?? requested.toLowerCase()) : 'claude';
    const override = this.repo.listAdapterOverrides().find((r) => String(r.id) === key);
    if (override?.command) {
      const command = String(override.command);
      const args = (() => {
        try {
          return JSON.parse(String(override.args ?? '[]')) as string[];
        } catch {
          return [];
        }
      })();
      return { id: key, command, args, name: key, env: pathEnv(command) };
    }
    const preset = ADAPTER_PRESETS.find((a) => a.id === key) ?? ADAPTER_PRESETS[0]!;
    const binary = findExecutable(preset.command, preset.aliases);
    if (!binary) {
      throw new ConflictError(`${preset.name} is not installed (looked for ${preset.command}). Nothing was started.`);
    }
    const requires = preset.id === 'codex' ? findExecutable('codex') : null;
    return { id: preset.id, command: binary, args: preset.args, name: preset.name, env: pathEnv(binary, requires) };
  }

  private buildPrompt(job: T.JobDetail | null, room: T.Room | null, task: T.Task | null, agent: T.Identity, override?: string): string {
    if (override?.trim()) {
      if (/^(echo ok|write outside|sleep|create a file|edit\.txt|exit 3|simulate rate limit|emit directive:|report usage)/i.test(override.trim())) {
        return override.trim();
      }
    }

    const identities = this.repo.listIdentities();
    const rateLimitedAgents = identities.filter((i) => i.statusState === 'rate_limited' || i.rateLimitResetAt);
    const workingAgents = identities.filter((i) => i.statusState === 'working' && i.id !== agent.id);
    const overrides = this.repo.listAdapterOverrides();
    const rateLimitedAdapters = overrides.filter((a) => a.rate_limit_reset_at);

    const teamStatusLines: string[] = [
      '',
      '--- MyaOS Autonomous Team Coordination ---',
      `Your Identity: ${agent.name} (id: ${agent.id}, role: ${agent.role ?? 'coworker'}, level: ${agent.approvalLevel ?? 'member'})`,
    ];
    if (workingAgents.length > 0) {
      teamStatusLines.push(
        `Currently Working Coworkers: ${workingAgents.map((a) => `${a.name} (${a.id}, session ${a.activeSessionId ?? 'active'})`).join(', ')}`
      );
    }
    if (rateLimitedAgents.length > 0 || rateLimitedAdapters.length > 0) {
      teamStatusLines.push('⚠️ SESSION / RATE LIMIT AWARENESS (Cross-Adapter Visibility):');
      for (const a of rateLimitedAgents) {
        teamStatusLines.push(
          `  - Agent ${a.name} (${a.id}, runtime: ${a.runtime ?? a.adapterId ?? 'unknown'}) is WAITING FOR SESSION RESET until ${a.rateLimitResetAt ?? 'unknown'} (${a.rateLimitReason ?? 'limit reached'}).`
        );
      }
      for (const ad of rateLimitedAdapters) {
        teamStatusLines.push(
          `  - Adapter ${String(ad.id)} is RATE-LIMITED until ${String(ad.rate_limit_reset_at)} (${String(ad.rate_limit_reason ?? 'limit reached')}).`
        );
      }
      teamStatusLines.push(
        '  -> If a Claude Code agent is waiting for session reset, Antigravity/Gemini or Codex agents should pick up urgent tasks or schedule a handoff at resetAt, and vice-versa.'
      );
    } else {
      teamStatusLines.push('Adapter Session Limits: All adapters (Claude Code, Codex, Gemini/Antigravity) are currently OK (no active session limits).');
    }
    teamStatusLines.push(
      'Autonomous Directives (include on their own line in your response when needed):',
      '  - Wake another agent immediately: [WAKE: <agentId>] <instructions for that agent>',
      '  - Schedule a self-wakeup or timer: [SCHEDULE: 10m] <what to check when woken> (or cron: [SCHEDULE: */15 * * * *] <prompt>)',
      '  - Spawn a new specialist agent:    [SPAWN: <newAgentId> name="<Name>" role="<Role>" adapter="<claude|codex|gemini>"] <initial prompt>'
    );

    if (override?.trim()) {
      return [override.trim(), ...teamStatusLines].join('\n');
    }

    if (!job) {
      return [
        `You are ${agent.name} (${agent.role ?? 'coworker'}) in room #${room?.name ?? 'general'}.`,
        'Respond helpfully and coordinate with the team as needed.',
        ...teamStatusLines,
      ].join('\n');
    }

    const criteria = job.criteria.map((c, idx) => `${idx + 1}. ${c.text}`).join('\n');
    return [
      `Job #${job.number}: ${job.title} (kind: ${job.kind ?? 'code'})`,
      job.brief ? `\nBrief:\n${job.brief}` : '',
      job.plan?.summary ? `\nAccepted plan:\n${job.plan.summary}` : '',
      criteria ? `\nDone means:\n${criteria}` : '',
      task ? `\nYour task (${agent.name}): ${task.title}` : '',
      task?.checkCommand ? `Check command the runtime will run after your turn: ${task.checkCommand}` : '',
      '\nWork only inside the current workspace directory.',
      ...teamStatusLines,
    ]
      .filter(Boolean)
      .join('\n');
  }
}
