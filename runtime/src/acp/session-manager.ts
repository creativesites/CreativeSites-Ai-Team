import os from 'node:os';
import { decideSessionAccount, ISOLATION_PREFIX, startSessionUsage } from '../usage/session-hooks.ts';
import type { DatabaseSync } from 'node:sqlite';
import { issueAgentToken, revokeSessionTokens } from '../agent-tools/tokens.ts';
import path from 'node:path';
import type * as T from '../api/types.ts';
import { ADAPTER_PRESETS, adapterBlockReason, adapterInfo, findExecutable } from '../adapters.ts';
import type { Checker } from '../checks.ts';
import { ConflictError, ForbiddenError, InputError, type Repo } from '../store/repo.ts';
import { compileBatonCapsule, shouldRotateSession } from './baton.ts';
import { afterTurn, emitSessionRenewed } from './renewal.ts';
import { extractModelId, mapAcpUsage, providerOfAdapter } from '../usage/mapAcpUsage.ts';
import { checkBudgets } from '../usage/budgets.ts';
import { AcpClient, AcpError, type PermissionOption, type PermissionOutcome, type PermissionRequest } from './client.ts';
import { skillServiceFor } from '../skills/service.ts';

export interface StartSessionInput {
  jobId?: string | null;
  roomId?: string | null;
  taskId?: string | null;
  agentId: string;
  adapterId?: string | null;
  prompt?: string;
  mode?: T.Session['mode'];
  parentSessionId?: string | null;
  generation?: number;
  batonCapsule?: string | null;
  /** Working folder for sessions that are not job builds (design boards). */
  worktree?: string | null;
  /** Send `prompt` exactly as written, without the job/team coordination wrapper. */
  rawPrompt?: boolean;
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
  antigravity: 'antigravity',
  'antigravity --acp': 'antigravity',
  'antigravity ide': 'antigravity',
  agy: 'antigravity',
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
      case 'baton_handoff': {
        lines.push(
          `${magenta}⚡ [${ts}] ${entry.title ?? 'Baton Handoff Capsule Received'}${reset}`,
          `${dim}   Context carried seamlessly from session ${String(p.parentSessionId ?? '')} (~${Number(p.capsuleTokens ?? 0)} tokens, saved ~${Number(p.estimatedSavedTokens ?? 0)} tokens)${reset}`,
          ''
        );
        break;
      }
      case 'session_rotated': {
        lines.push(
          `${magenta}↻ [${ts}] ${entry.title ?? 'Session Rotated to Next Generation'}${reset}`,
          `${dim}   New Session: ${String(p.newSessionId ?? '')} (reason: ${String(p.reason ?? 'threshold')})${reset}`,
          ''
        );
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

  private agentTools: { db: DatabaseSync; url: () => string | null } | null = null;

  /** Enables the agent action interface (K4): each agent process gets a fresh session-bound token. */
  enableAgentTools(opts: { db: DatabaseSync; url: () => string | null }): void {
    this.agentTools = opts;
  }

  /**
   * MCP servers offered to an agent process. Any earlier token for the session is revoked first,
   * so only the live process can act. The actor of every call is the token's identity.
   */
  private agentToolServers(sessionId: string, agent: T.Identity, jobId: string | null, taskId: string | null): unknown[] {
    const tools = this.agentTools;
    const base = tools?.url();
    if (!tools || !base) return [];
    revokeSessionTokens(tools.db, sessionId);
    const role =
      agent.approvalLevel === 'lead' || agent.approvalLevel === 'owner'
        ? 'lead'
        : /plan|orchestrat/i.test(agent.role ?? '') || agent.departmentId === 'planning-strategy'
          ? 'planner'
          : 'member';
    const { token } = issueAgentToken(tools.db, { identityId: agent.id, sessionId, jobId, taskId, role });
    return [{ type: 'http', name: 'myaos', url: `${base}/mcp`, headers: [{ name: 'Authorization', value: `Bearer ${token}` }] }];
  }

  async start(input: StartSessionInput): Promise<T.Session> {
    const agent = this.repo.getIdentity(input.agentId);
    const job = input.jobId ? this.repo.getJob(input.jobId) : null;
    const room = input.roomId ? this.repo.getRoom(input.roomId) : job ? this.repo.getRoom(job.roomId) : null;
    const task = input.taskId ? this.repo.getTask(input.taskId) : null;
    if (task && job && task.jobId !== job.id) throw new InputError('task belongs to a different job');
    if (task && task.status === 'pending' && !this.repo.dependenciesMet(task.id)) {
      throw new ConflictError('This task depends on work that is not done yet');
    }

    const adapter = this.resolveAdapter(input.adapterId ?? agent.adapterId ?? agent.runtime);

    // K9: client work runs only on that client's AI account, and that account runs only that client's work.
    let usageAccountId: string | null = null;
    if (this.agentTools) {
      const projectId = job?.projectId ?? room?.projectId ?? null;
      const decision = decideSessionAccount(this.agentTools.db, projectId, adapterInfo(adapter.id)?.auth.account?.id ?? null);
      if (!decision.ok) throw new ForbiddenError(`${ISOLATION_PREFIX}${decision.reason} Nothing was started.`);
      usageAccountId = decision.accountId;
    }

    // K6/WP10 10.4: budgets are checked before every prompt send, including this first one.
    checkBudgets(this.repo, {
      agentId: agent.id,
      taskId: task?.id ?? null,
      jobId: job?.id ?? null,
      projectId: job?.projectId ?? room?.projectId ?? null,
      accountId: usageAccountId,
    });

    let worktreePath = input.worktree ?? room?.repoPath ?? process.cwd() ?? os.homedir();
    let baseSha: string | null = null;
    let baseBranch: string | null = null;

    if (job) {
      try {
        // K8: a task runs in its own worktree and branch; anything else shares the job worktree.
        let worktree: { path: string; baseSha: string } | null = null;
        if (task) {
          try {
            worktree = await this.checker.worktreeForTask(job, task);
          } catch {
            worktree = null; // fall back to the job worktree below
          }
        }
        if (!worktree) worktree = await this.checker.worktreeForJob(job);
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
      parentSessionId: input.parentSessionId ?? null,
      generation: input.generation,
      batonCapsule: input.batonCapsule ?? null,
    });

    if (task) this.startTask(task, agent.id);
    if (this.agentTools && usageAccountId) {
      startSessionUsage(this.agentTools.db, {
        accountId: usageAccountId,
        sessionId: session.id,
        taskId: task?.id ?? null,
        jobId: job?.id ?? null,
        agentId: agent.id,
        taskType: (job as { workflow?: string | null } | null)?.workflow ?? job?.kind ?? null,
      });
    }

    if (input.batonCapsule) {
      const capsuleTokens = Math.ceil(input.batonCapsule.length / 3.8);
      this.repo.appendTranscript(session.id, {
        kind: 'baton_handoff',
        role: 'system',
        title: `Baton Handoff Capsule (Gen ${session.generation ?? 2})`,
        payload: {
          parentSessionId: input.parentSessionId ?? null,
          generation: session.generation ?? 2,
          capsuleTokens,
          text: input.batonCapsule,
        },
      });
    }

    const baseAcpPrompt =
      input.rawPrompt && input.prompt?.trim() ? input.prompt.trim() : this.buildPrompt(job, room, task, agent, input.prompt);
    const acpPrompt = input.batonCapsule ? `${input.batonCapsule}\n\n${baseAcpPrompt}` : baseAcpPrompt;
    const displayPrompt = stripCoordinationBoilerplate(input.prompt?.trim() ? input.prompt : baseAcpPrompt);
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
      // Only runtime-provided extras here: AcpClient adds the allowlisted part of process.env (security S3).
      env: { ...this.env, ...(adapter.env ?? {}) },
      mcpServers: this.agentToolServers(session.id, agent, job?.id ?? null, task?.id ?? null),
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
   * Rotates a session into a fresh Gen N+1 session for the same role, carrying a
   * deterministic 3-Tier Baton Capsule so zero recent context is lost while shedding
   * accumulated token bloat.
   */
  async rotate(
    sessionId: string,
    opts?: { prompt?: string; taskId?: string | null; reason?: string }
  ): Promise<T.SessionRotationResult> {
    const existing = this.repo.getSession(sessionId);
    const { capsule, previousContextTokens, capsuleTokens, continuation } = compileBatonCapsule(this.repo, sessionId);
    const estimatedSavedTokens = Math.max(0, previousContextTokens - capsuleTokens);

    // Close live subprocess on old session if still active
    const live = this.live.get(sessionId);
    if (live && !live.closed) {
      live.closed = true;
      await live.client.close().catch(() => {});
      this.live.delete(sessionId);
    }

    const nextGen = (existing.generation ?? 1) + 1;
    const nextPrompt =
      opts?.prompt?.trim() ||
      'Continue from your Baton Handoff Capsule (Tier 3 Hot Working Memory) and complete the next step.';

    const newSession = await this.start({
      agentId: existing.agentId,
      jobId: existing.jobId ?? null,
      roomId: existing.roomId ?? null,
      taskId: opts?.taskId !== undefined ? opts.taskId : existing.taskId ?? null,
      adapterId: existing.adapterId ?? null,
      mode: existing.mode ?? 'build',
      parentSessionId: existing.id,
      generation: nextGen,
      batonCapsule: capsule,
      prompt: nextPrompt,
    });

    this.repo.updateSession(newSession.id, { continuationPackage: continuation as unknown as Record<string, unknown> });
    emitSessionRenewed(this.repo, {
      from: sessionId,
      to: newSession.id,
      reason: opts?.reason ?? 'manual',
      agentId: existing.agentId,
      jobId: existing.jobId ?? null,
      taskId: existing.taskId ?? null,
    });
    this.repo.appendTranscript(sessionId, {
      kind: 'session_rotated',
      role: 'system',
      title: `Rotated to Gen ${nextGen} (${newSession.id})`,
      payload: {
        newSessionId: newSession.id,
        generation: nextGen,
        reason: opts?.reason ?? 'manual',
        previousContextTokens,
        capsuleTokens,
        estimatedSavedTokens,
      },
    });
    if (existing.state === 'running' || existing.state === 'starting') {
      this.repo.updateSession(sessionId, { state: 'idle', supersededBySessionId: newSession.id });
    } else {
      this.repo.updateSession(sessionId, { supersededBySessionId: newSession.id });
    }

    return {
      previousSession: this.repo.getSession(sessionId),
      newSession: this.repo.getSession(newSession.id),
      batonCapsule: capsule,
      estimatedSavedTokens,
    };
  }

  /**
   * Sends a follow-up prompt to a live session, OR seamlessly resumes/continues
   * the session if its previous turn already completed and closed the subprocess.
   * Automatically rotates to a fresh Gen N+1 session carrying a 3-Tier Baton Capsule
   * when the session crosses the internal context token or turn threshold.
   */
  async prompt(sessionId: string, text: string, opts?: { taskId?: string | null; skipAutoRotate?: boolean }): Promise<T.Session> {
    const cleanText = stripCoordinationBoilerplate(text);
    const existing = this.repo.getSession(sessionId);

    // K6: budgets are checked before every prompt send. A hard limit refuses with a 409 and opens a Needs You card.
    checkBudgets(this.repo, this.budgetContextFor(existing));

    // K7: ONE renewal decision (baton.shouldRotateSession). At the renew band the prompt is carried into a
    // fresh generation; at the block band a prompt that cannot be carried (skipAutoRotate, or auto-renew off)
    // is refused unless the owner set renewal.allowOverBlock.
    const rotCheck = shouldRotateSession(this.repo, existing, opts?.taskId);
    const autoRenew = this.repo.getSetting('renewal.autoRenew') !== false;
    if (rotCheck.blocked && (opts?.skipAutoRotate || !autoRenew)) {
      throw new ConflictError(
        `This session is at the context block level (${rotCheck.pct != null ? `${rotCheck.pct}% of its ${rotCheck.contextWindow}-token window` : `about ${rotCheck.contextTokens} tokens, ${rotCheck.measurement}`}). ` +
          'Renew it (POST /v1/sessions/:id/rotate) or set renewal.allowOverBlock to true to send anyway. Nothing was sent.'
      );
    }
    if (!opts?.skipAutoRotate && autoRenew && rotCheck.rotate) {
      const rotated = await this.rotate(sessionId, {
        prompt: cleanText,
        taskId: opts?.taskId,
        reason: rotCheck.reason,
      });
      return rotated.newSession;
    }

    const live = this.live.get(sessionId);
    if (live && !live.closed && live.acpSessionId && !this.runs.has(sessionId)) {
      this.repo.appendTranscript(sessionId, { kind: 'prompt', role: 'user', payload: { text: cleanText } });
      this.repo.updateSession(sessionId, { state: 'running' });
      const result = await live.client.prompt(text);
      this.recordTurnUsage(live, result.usage);
      this.repo.appendTranscript(sessionId, { kind: 'turn', role: 'system', payload: result });
      this.repo.updateSession(sessionId, { state: 'idle' });
      afterTurn(this.repo, sessionId);
      return this.repo.getSession(sessionId);
    }

    // Session turn already exited: run a continuation turn on the existing session record
    const agent = this.repo.getIdentity(existing.agentId);
    const job = existing.jobId ? this.repo.getJob(existing.jobId) : null;
    const room = existing.roomId ? this.repo.getRoom(existing.roomId) : job ? this.repo.getRoom(job.roomId) : null;
    const task = existing.taskId ? this.repo.getTask(existing.taskId) : null;
    const adapter = this.resolveAdapter(existing.adapterId ?? agent.adapterId ?? agent.runtime);
    const worktreePath = existing.worktree ?? process.cwd() ?? os.homedir();
    const acpPrompt = existing.mode === 'design' ? cleanText : this.buildPrompt(job, room, task, agent, cleanText);
    // Summarise before appending this turn's prompt, so the summary covers only earlier turns.
    const priorSummary = buildResumeSummary(this.repo.listTranscript(sessionId, 0, 10000));
    this.repo.appendTranscript(sessionId, { kind: 'prompt', role: 'user', title: 'Wake / follow-up prompt', payload: { text: cleanText } });
    this.repo.updateSession(sessionId, { state: 'starting', error: null });

    const client = new AcpClient({
      command: adapter.command,
      args: adapter.args,
      cwd: worktreePath,
      worktree: worktreePath,
      env: { ...this.env, ...(adapter.env ?? {}) },
      mcpServers: this.agentToolServers(sessionId, agent, existing.jobId ?? null, existing.taskId ?? null),
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
    return this.repo.getSession(sessionId);
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
    // Runs settle once their client is closed; never let a stuck one block shutdown.
    await Promise.race([Promise.allSettled([...this.runs.values()]), new Promise((r) => setTimeout(r, 10_000).unref())]);
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
          await this.checker.snapshot(live.jobId, `runtime:before`, live.taskId);
        } catch {
          /* non-git or clean worktree */
        }
      }
      if (live.closed) return; // shut down while preparing: do not start an agent process
      client.spawnProcess();
      this.repo.updateSession(live.sessionId, { state: 'starting', pid: client.pid });
      const init = await client.initialize();
      const opened = await this.openAcpSession(live, init, prompt);
      const acpSessionId = opened.acpSessionId;
      live.acpSessionId = acpSessionId;
      const agentInfo = (init.agentInfo ?? {}) as { name?: string };
      // `model` keeps the ACP agent name for compatibility; `modelId` is the real model the adapter reports (WP10 10.1).
      const reportedModelId = extractModelId(init, client.newSessionResult);
      this.repo.updateSession(live.sessionId, {
        state: 'running',
        pid: client.pid,
        acpSessionId,
        model: agentInfo.name ?? null,
        ...(reportedModelId ? { modelId: reportedModelId } : {}),
      });

      const result = await client.prompt(opened.prompt);
      if (live.closed) return;

      this.recordTurnUsage(live, result.usage);
      afterTurn(this.repo, live.sessionId);

      this.repo.appendTranscript(live.sessionId, {
        kind: 'turn_end',
        role: 'system',
        title: `Turn finished (${result.stopReason ?? 'end_turn'})`,
        payload: { stopReason: result.stopReason, usage: result.usage ?? null },
      });

      let checkPassed = false;
      if (live.jobId && !live.closed) {
        try {
          await this.checker.snapshot(live.jobId, `runtime:after`, live.taskId);
          const commit = await this.checker.commitWorktree(live.jobId, `${live.agentId} session ${live.sessionId.slice(-6)}`, live.taskId);
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
            this.finishTask(task, checkPassed, checkPassed ? null : `check exited ${check.result.exitCode}`);
          } else {
            this.finishTask(task, true, null);
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
        this.moveTask(live.taskId, rl ? 'blocked' : 'failed', rl ? `rate limited: ${rl.reason}` : message);
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

  /** Records what an ACP `usage_update` reported. A context-only update records the window, not tokens. */
  private recordUpdateUsage(live: LiveSession, update: Record<string, unknown>): void {
    const m = mapAcpUsage(update);
    if (m.measurement === 'unavailable') return;
    this.persistUsage(live, m, 'acp');
  }

  /** Records a finished turn's usage; a turn that reported nothing is stored as 'unavailable', never as zero. */
  private recordTurnUsage(live: LiveSession, usage: Record<string, unknown> | undefined): void {
    const m = mapAcpUsage(usage ? { usage } : {});
    if (m.measurement === 'unavailable') {
      this.repo.recordUsage({
        jobId: live.jobId,
        sessionId: live.sessionId,
        agentId: live.agentId,
        taskId: live.taskId,
        provider: providerOfAdapter(live.adapterId),
        measurement: 'unavailable',
        source: 'acp',
      });
    } else {
      this.persistUsage(live, m, 'acp');
    }
  }

  private persistUsage(live: LiveSession, m: ReturnType<typeof mapAcpUsage>, source: string): void {
    this.repo.recordUsage({
      jobId: live.jobId,
      sessionId: live.sessionId,
      agentId: live.agentId,
      taskId: live.taskId,
      provider: providerOfAdapter(live.adapterId),
      modelId: m.modelId ?? this.sessionModelId(live.sessionId),
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cachedInputTokens: m.cachedInputTokens,
      cacheWriteTokens: m.cacheWriteTokens,
      reasoningTokens: m.reasoningTokens,
      costCents: m.costCents,
      contextUsed: m.contextUsed,
      contextSize: m.contextSize,
      measurement: m.measurement,
      source,
    });
    if (m.modelId && !this.sessionModelId(live.sessionId)) this.repo.updateSession(live.sessionId, { modelId: m.modelId });
  }

  private sessionModelId(sessionId: string): string | null {
    try {
      return this.repo.getSession(sessionId).modelId ?? null;
    } catch {
      return null;
    }
  }

  private budgetContextFor(session: T.Session): Parameters<typeof checkBudgets>[1] {
    const job = session.jobId ? this.repo.getJob(session.jobId) : null;
    const room = session.roomId ? this.repo.getRoom(session.roomId) : null;
    let accountId: string | null = null;
    try {
      const row = this.repo
        .sqlite()
        .prepare('SELECT account_id FROM task_usage WHERE session_id = ? ORDER BY rowid DESC LIMIT 1')
        .get(session.id) as { account_id?: string } | undefined;
      accountId = row?.account_id ?? null;
    } catch {
      /* older store */
    }
    return {
      agentId: session.agentId,
      sessionId: session.id,
      taskId: session.taskId ?? null,
      jobId: session.jobId ?? null,
      projectId: job?.projectId ?? room?.projectId ?? null,
      accountId,
    };
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
      this.recordUpdateUsage(live, update);
    }
    this.repo.appendTranscript(sessionId, {
      kind,
      role: 'system',
      payload: update,
    });
  }

  /** Routes a runtime-driven task move through the K3 transition function; illegal or stale moves are skipped. */
  private moveTask(taskId: string, to: T.TaskStatus, reason: string | null, actorId = 'runtime:session', actorKind: T.ActorKind = 'system'): boolean {
    try {
      this.repo.transitionTask(taskId, to, { actorId, actorKind, reason });
      return true;
    } catch (e) {
      if (e instanceof ConflictError || (e as Error).constructor.name === 'NotFoundError') return false;
      throw e;
    }
  }

  /** Session start: pending->assigned->acknowledged->running (or the later part of that path). */
  private startTask(task: T.Task, agentId: string): void {
    let status = task.status;
    if (status === 'pending') {
      try {
        this.repo.transitionTask(task.id, 'assigned', {
          actorId: 'runtime:session',
          actorKind: 'system',
          assigneeId: task.assigneeId ?? agentId,
          reason: 'session started',
        });
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
        return;
      }
      status = 'assigned';
    }
    if (status === 'assigned') {
      if (!this.moveTask(task.id, 'acknowledged', 'session started', agentId, 'agent')) return;
      status = 'acknowledged';
    }
    if (status === 'acknowledged' || status === 'blocked') this.moveTask(task.id, 'running', 'session started', agentId, 'agent');
  }

  /**
   * A finished turn: a passing check completes the task, or sends it to review when it
   * requires verification; a failing check fails it. The runtime, not the assignee, makes the move.
   */
  private finishTask(task: T.Task, passed: boolean, failure: string | null): void {
    if (!passed) {
      this.moveTask(task.id, 'failed', failure);
      return;
    }
    const to: T.TaskStatus = task.verificationRequired ? 'needs_review' : 'done';
    this.moveTask(task.id, to, 'check passed');
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

    // Design sessions have no job: decide here instead of filing an approval on an unrelated job.
    const sessionRow = this.repo.getSession(sessionId);
    if (sessionRow.mode === 'design') {
      const decision = designPermission(sessionRow.worktree ?? '', toolCall, raw);
      const pick = options.find((o) => (decision.allow ? o.kind === 'allow_once' || o.kind === 'allow_always' : o.kind === 'reject_once' || o.kind === 'reject_always'));
      this.repo.appendTranscript(sessionId, {
        kind: 'permission_request',
        role: 'system',
        title: `${decision.allow ? 'Allowed' : 'Refused'}: ${String(toolCall.title ?? toolCall.kind ?? 'tool action')}`,
        payload: { reason: decision.reason, toolCall },
      });
      return pick ? { outcome: 'selected', optionId: pick.optionId } : { outcome: 'cancelled' };
    }
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

  /**
   * Why work given to this agent could not start now (adapter missing, signed out, unsupported),
   * or null when it can. Used by the dispatcher so it never assigns a task it cannot start.
   */
  adapterBlockedReason(agent: T.Identity): string | null {
    try {
      this.resolveAdapter(agent.adapterId ?? agent.runtime);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
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
    // WP0-T6: an adapter that is known to be unusable (signed out, unsupported) receives no work.
    const probed = adapterInfo(preset.id);
    const blocked = probed ? adapterBlockReason(probed) : null;
    if (blocked) throw new ConflictError(`${blocked} Nothing was started.`);
    const requires = preset.id === 'codex' ? findExecutable('codex') : null;
    return { id: preset.id, command: binary, args: preset.args, name: preset.name, env: pathEnv(binary, requires) };
  }

  /** Skills for this task (WP8): selected once when the task's session starts, pinned by content hash. */
  private skillBlockFor(job: T.JobDetail, task: T.Task | null): string {
    const svc = skillServiceFor(this.repo);
    if (!svc || !task) return '';
    try {
      svc.selectSkills(task, job);
      const packet = svc.skillPacket(task.id);
      return packet ? `\nSkills for this task (follow them; skill_read gives the full text):\n${packet}` : '';
    } catch (e) {
      console.warn('[runtime] skills: could not prepare the skill packet:', (e as Error).message);
      return '';
    }
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
      '  - Spawn a new specialist agent:    [SPAWN: <newAgentId> name="<Name>" role="<Role>" adapter="<claude|codex|gemini>"] <initial prompt>',
      '  - Self-checkpoint at the end of every turn (preserves your hot working memory across token-lean session relays):',
      '    [STATE: done=<what you finished> | active=<files/focus> | next=<immediate next step>]'
    );
    if (this.agentTools) {
      teamStatusLines.push(
        'MyaOS tools (MCP server "myaos", if your client lists it): job_get (read your job), task_report (short progress),',
        '  evidence_add (tests/commits you produced; stored as DECLARED), thread_post (job room), blocker_raise (you need a decision or access),',
        '  usage_report / context_report. You act only as yourself, only on this job and task. You cannot mark work verified or done.'
      );
    }

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
    const skillBlock = this.skillBlockFor(job, task);
    return [
      `Job #${job.number}: ${job.title} (kind: ${job.kind ?? 'code'})`,
      job.brief ? `\nBrief:\n${job.brief}` : '',
      job.plan?.summary ? `\nAccepted plan:\n${job.plan.summary}` : '',
      criteria ? `\nDone means:\n${criteria}` : '',
      task ? `\nYour task (${agent.name}): ${task.title}` : '',
      task?.checkCommand ? `Check command the runtime will run after your turn: ${task.checkCommand}` : '',
      '\nWork only inside the current workspace directory.',
      skillBlock,
      ...teamStatusLines,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

/**
 * Permission rule for design sessions. The agent works in its board folder and
 * may only read elsewhere: writes inside the board folder, read-only commands
 * and reads are allowed; anything else is refused.
 */
export function designPermission(
  boardDir: string,
  toolCall: Record<string, unknown>,
  raw: Record<string, unknown>
): { allow: boolean; reason: string } {
  const kind = String(toolCall.kind ?? '');
  const target =
    typeof raw.file_path === 'string'
      ? raw.file_path
      : typeof raw.path === 'string'
        ? raw.path
        : typeof raw.filePath === 'string'
          ? raw.filePath
          : typeof raw.filename === 'string'
            ? raw.filename
            : typeof raw.file === 'string'
              ? raw.file
              : typeof raw.destination === 'string'
                ? raw.destination
                : '';
  const command = typeof raw.command === 'string' ? raw.command.trim() : '';
  const inside = (p: string) => {
    if (!boardDir || !p) return false;
    const abs = path.resolve(boardDir, p);
    return abs === boardDir || abs.startsWith(boardDir.endsWith(path.sep) ? boardDir : boardDir + path.sep);
  };
  if (kind === 'read' || kind === 'search' || kind === 'think' || kind === 'fetch') return { allow: true, reason: 'read-only' };
  if (kind === 'edit' || kind === 'delete' || kind === 'move') {
    return inside(target) && !target.includes(`${path.sep}source${path.sep}`)
      ? { allow: true, reason: 'inside the board folder' }
      : { allow: false, reason: 'design sessions may only change files in their board folder' };
  }
  if (kind === 'execute' && command) {
    const readOnly = /^(ls|cat|head|tail|wc|rg|grep|find|tree|file|pwd|git (status|log|show|diff|ls-files))\b/.test(command) && !/[>|;&`$]/.test(command);
    return readOnly ? { allow: true, reason: 'read-only command' } : { allow: false, reason: 'design sessions may only run read-only commands' };
  }
  return { allow: false, reason: `not allowed in a design session (${kind || 'unknown tool'})` };
}
