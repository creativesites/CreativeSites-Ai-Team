import { spawn, type ChildProcess } from 'node:child_process';
import { agentEnv } from '../agent-tools/env.ts';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// A lean ACP v1 client: JSON-RPC over the adapter's stdio. The runtime is the
// client, so when an adapter asks it to read/write a file or run a terminal
// command, the runtime does it itself — that is the only Observed I/O we trust.

export const PROTOCOL_VERSION = 1;
const CLIENT_CAPABILITIES = Object.freeze({
  fs: { readTextFile: true, writeTextFile: true },
  terminal: true,
});

export class AcpError extends Error {
  readonly code: number;
  readonly data: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'AcpError';
    this.code = code;
    this.data = data;
  }
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

export interface PermissionOption {
  optionId: string;
  name?: string;
  kind?: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' | string;
}

export interface PermissionRequest {
  sessionId: string;
  toolCall: Record<string, unknown>;
  options: PermissionOption[];
}

export type PermissionOutcome = { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' };

export interface AcpClientHandlers {
  onUpdate: (sessionId: string, update: Record<string, unknown>) => void;
  onPermission: (request: PermissionRequest) => Promise<PermissionOutcome>;
  onStderr?: (line: string) => void;
  onExit?: (info: { code: number | null; signal: string | null; error?: string }) => void;
}

export interface AcpClientOptions {
  command: string;
  args: string[];
  cwd: string;
  /** Everything the client writes/executes must stay inside this directory. */
  worktree: string;
  handlers: AcpClientHandlers;
  env?: NodeJS.ProcessEnv;
  /** MCP servers offered to the agent (the runtime's agent action interface, K4). */
  mcpServers?: unknown[];
}

interface TerminalState {
  id: string;
  command: string;
  cwd: string;
  child: ChildProcess;
  output: string;
  truncated: boolean;
  exit: { exitCode: number | null; signal: string | null; error?: string } | null;
  waiters: ((exit: { exitCode: number | null; signal: string | null; error?: string }) => void)[];
  limit: number;
}

const MAX_OUTPUT = 1024 * 1024;

function canonical(p: string): string {
  const absolute = path.resolve(p);
  let existing = absolute;
  const suffix: string[] = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  try {
    return path.join(fs.realpathSync(existing), ...suffix);
  } catch {
    return absolute;
  }
}

function isInside(root: string, target: string): boolean {
  const r = canonical(root);
  const t = canonical(target);
  return t === r || t.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

export class AcpClient {
  private readonly opts: AcpClientOptions;
  private child: ChildProcess | null = null;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout; method: string }
  >();
  private readonly terminals = new Map<string, TerminalState>();
  private terminalSeq = 0;
  private closing = false;
  private cancelled = false;
  private exited: { code: number | null; signal: string | null; error?: string } | null = null;
  private readonly stderrTail: string[] = [];

  sessionId: string | null = null;
  initializeResult: Record<string, unknown> | null = null;

  constructor(opts: AcpClientOptions) {
    this.opts = opts;
  }

  get pid(): number | null {
    return this.child?.pid ?? null;
  }

  spawnProcess(): void {
    // A client that has been closed must never start a process (shutdown racing a session that had not spawned yet).
    if (this.closing) throw new AcpError(-32001, 'client closed before the agent process started');
    this.child = spawn(this.opts.command, this.opts.args, {
      cwd: this.opts.cwd,
      env: agentEnv(process.env, (this.opts.env ?? {}) as Record<string, string>),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });
    this.child.once('error', (error) => {
      this.exited = { code: null, signal: null, error: error.message };
      this.rejectPending(new AcpError(-32001, `adapter spawn failed: ${error.message}`));
      this.opts.handlers.onExit?.({ ...this.exited, error: error.message });
    });
    this.child.once('exit', (code, signal) => {
      this.exited = { code, signal };
      this.rejectPending(new AcpError(-32001, `adapter exited (code=${code}, signal=${signal})`));
      if (!this.closing) this.opts.handlers.onExit?.({ code, signal });
    });
    this.child.stdin?.on('error', () => {
      /* EPIPE after exit is reported through onExit */
    });
    readline.createInterface({ input: this.child.stdout!, crlfDelay: Infinity }).on('line', (line) => this.handleLine(line));
    readline.createInterface({ input: this.child.stderr!, crlfDelay: Infinity }).on('line', (line) => {
      this.stderrTail.push(line);
      if (this.stderrTail.length > 200) this.stderrTail.shift();
      this.opts.handlers.onStderr?.(line);
    });
  }

  async initialize(timeoutMs = 60_000): Promise<Record<string, unknown>> {
    const result = (await this.request('initialize', { protocolVersion: PROTOCOL_VERSION, clientCapabilities: CLIENT_CAPABILITIES }, timeoutMs)) as Record<string, unknown>;
    this.initializeResult = result;
    return result;
  }

  async newSession(timeoutMs = 60_000): Promise<string> {
    const result = (await this.request('session/new', { cwd: this.opts.worktree, mcpServers: this.offeredMcpServers() }, timeoutMs)) as { sessionId?: string };
    if (!result?.sessionId) throw new AcpError(-32002, 'session/new returned no sessionId');
    this.newSessionResult = result as Record<string, unknown>;
    this.sessionId = result.sessionId;
    return result.sessionId;
  }

  /**
   * MCP servers the agent can actually use. ACP agents must support stdio; HTTP is optional and
   * advertised as `agentCapabilities.mcpCapabilities.http`. HTTP servers are dropped for agents
   * that do not advertise it (they fall back to bracket directives), and that is recorded.
   */
  offeredMcpServers(): unknown[] {
    const servers = this.opts.mcpServers ?? [];
    const caps = ((this.initializeResult?.agentCapabilities ?? {}) as { mcpCapabilities?: { http?: boolean } }).mcpCapabilities;
    const kept = servers.filter((sv) => (sv as { type?: string }).type !== 'http' || caps?.http === true);
    this.mcpDropped = servers.length - kept.length;
    return kept;
  }

  /** How many offered MCP servers the agent could not take (0 when all were offered). */
  mcpDropped = 0;

  /** The raw `session/new` or `session/load` result, kept so the runtime can read the model id the adapter reports. */
  newSessionResult: Record<string, unknown> | null = null;

  /** True when the adapter advertised `agentCapabilities.loadSession` during initialize. */
  get canLoadSession(): boolean {
    const caps = (this.initializeResult?.agentCapabilities ?? {}) as { loadSession?: boolean };
    return caps.loadSession === true;
  }

  /**
   * Resumes an existing ACP session via `session/load`. The adapter replays the prior
   * conversation as `session/update` notifications before it responds; callers that do
   * not want that replay in their transcript must suppress updates while this runs.
   */
  async loadSession(acpSessionId: string, timeoutMs = 60_000): Promise<string> {
    if (!this.canLoadSession) throw new AcpError(-32601, 'adapter does not advertise session/load');
    const result = (await this.request(
      'session/load',
      { sessionId: acpSessionId, cwd: this.opts.worktree, mcpServers: this.offeredMcpServers() },
      timeoutMs
    )) as { sessionId?: string } | undefined;
    const resolvedId = result?.sessionId || acpSessionId;
    if (result && typeof result === 'object') this.newSessionResult = result as Record<string, unknown>;
    this.sessionId = resolvedId;
    return resolvedId;
  }

  async prompt(text: string, timeoutMs = 30 * 60_000): Promise<{ stopReason: string | null; usage?: Record<string, unknown> }> {
    if (!this.sessionId) throw new AcpError(-32003, 'No ACP session');
    const result = (await this.request(
      'session/prompt',
      { sessionId: this.sessionId, prompt: [{ type: 'text', text }] },
      timeoutMs
    )) as { stopReason?: string; usage?: Record<string, unknown>; _meta?: Record<string, unknown> } | undefined;
    const usage = result?.usage ?? (result?._meta?.usage as Record<string, unknown> | undefined);
    return { stopReason: result?.stopReason ?? null, usage };
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    if (this.sessionId) this.notify('session/cancel', { sessionId: this.sessionId });
  }

  async close(graceMs = 4000): Promise<void> {
    this.closing = true;
    try {
      await this.stopProcess(graceMs);
    } finally {
      // Whatever the process did (even if its exit event never arrives), nothing may stay waiting on it:
      // a prompt left pending would keep the session run, and runtime shutdown, waiting forever.
      this.rejectPending(new AcpError(-32001, 'client closed'));
    }
  }

  private async stopProcess(graceMs: number): Promise<void> {
    for (const state of this.terminals.values()) {
      if (!state.exit) {
        try {
          if (state.child.pid) process.kill(-state.child.pid, 'SIGTERM');
        } catch {
          /* gone */
        }
      }
    }
    const child = this.child;
    if (!child || this.exited) return;
    const exited = new Promise<boolean>((resolve) => child.once('exit', () => resolve(true)));
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
    if (await Promise.race([exited, new Promise<boolean>((r) => setTimeout(() => r(false), graceMs))])) return;
    try {
      if (child.pid) process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
    await Promise.race([exited, new Promise<boolean>((r) => setTimeout(() => r(false), 2000))]);
  }

  stderrSummary(): string {
    return this.stderrTail.slice(-10).join('\n');
  }

  // ---------------------------------------------------------------- transport

  private send(message: JsonRpcMessage): void {
    if (!this.child?.stdin?.writable) throw new AcpError(-32004, 'adapter stdin is not writable');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new AcpError(-32000, `timeout after ${timeoutMs}ms waiting for ${method}`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.send({ jsonrpc: '2.0', id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error as Error);
      }
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  private respond(id: number | string, result: unknown): void {
    try {
      this.send({ jsonrpc: '2.0', id, result });
    } catch {
      /* adapter gone */
    }
  }

  private respondError(id: number | string, code: number, message: string): void {
    try {
      this.send({ jsonrpc: '2.0', id, error: { code, message } });
    } catch {
      /* adapter gone */
    }
  }

  private rejectPending(error: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(trimmed) as JsonRpcMessage;
    } catch {
      return;
    }
    if (message.method && message.id !== undefined && message.id !== null) {
      void this.handleRequest(message);
      return;
    }
    if (message.method) {
      this.handleNotification(message);
      return;
    }
    if (message.id !== undefined && message.id !== null) {
      const pending = this.pending.get(Number(message.id));
      if (!pending) return;
      this.pending.delete(Number(message.id));
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new AcpError(message.error.code ?? -32603, message.error.message ?? 'adapter error', message.error.data));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  private handleNotification(message: JsonRpcMessage): void {
    if (message.method === 'session/update') {
      const params = message.params ?? {};
      const update = (params.update ?? params) as Record<string, unknown>;
      this.opts.handlers.onUpdate(String(params.sessionId ?? this.sessionId ?? ''), update);
    }
  }

  private async handleRequest(message: JsonRpcMessage): Promise<void> {
    const id = message.id!;
    try {
      const params = message.params ?? {};
      switch (message.method) {
        case 'session/request_permission': {
          const options = (Array.isArray(params.options) ? params.options : []) as PermissionOption[];
          const outcome = this.cancelled
            ? ({ outcome: 'cancelled' } as PermissionOutcome)
            : await this.opts.handlers.onPermission({
                sessionId: String(params.sessionId ?? this.sessionId ?? ''),
                toolCall: (params.toolCall ?? {}) as Record<string, unknown>,
                options,
              });
          this.respond(id, { outcome });
          return;
        }
        case 'fs/read_text_file': {
          this.respond(id, { content: this.readFile(String(params.path ?? ''), params.line, params.limit) });
          return;
        }
        case 'fs/write_text_file': {
          this.writeFile(String(params.path ?? ''), String(params.content ?? ''));
          this.respond(id, {});
          return;
        }
        case 'terminal/create': {
          this.respond(id, { terminalId: this.createTerminal(params) });
          return;
        }
        case 'terminal/output': {
          this.respond(id, this.terminalOutput(String(params.terminalId ?? '')));
          return;
        }
        case 'terminal/wait_for_exit': {
          this.respond(id, await this.terminalWait(String(params.terminalId ?? '')));
          return;
        }
        case 'terminal/kill': {
          this.terminalKill(String(params.terminalId ?? ''));
          this.respond(id, {});
          return;
        }
        case 'terminal/release': {
          this.terminalRelease(String(params.terminalId ?? ''));
          this.respond(id, {});
          return;
        }
        default:
          this.respondError(id, -32601, `Method not found: ${message.method}`);
      }
    } catch (error) {
      this.respondError(id, error instanceof AcpError ? error.code : -32000, (error as Error).message);
    }
  }

  // ---------------------------------------------------------------- fs, confined

  private resolveInside(raw: string): string {
    const absolute = path.isAbsolute(raw) ? raw : path.resolve(this.opts.worktree, raw);
    if (!isInside(this.opts.worktree, absolute)) throw new AcpError(-32012, `blocked: path outside the worktree (${absolute})`);
    return absolute;
  }

  private readFile(raw: string, line: unknown, limit: unknown): string {
    const absolute = this.resolveInside(raw);
    const text = fs.readFileSync(absolute, 'utf8');
    if (line == null) return text;
    const start = Math.max(0, Number(line) - 1);
    const end = limit != null ? start + Number(limit) : undefined;
    return text.split('\n').slice(start, end).join('\n');
  }

  private writeFile(raw: string, content: string): void {
    const absolute = this.resolveInside(raw);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }

  // ---------------------------------------------------------------- terminals (runtime-run)

  private createTerminal(params: Record<string, unknown>): string {
    const id = `term-${++this.terminalSeq}`;
    const cwd = params.cwd ? this.resolveInside(String(params.cwd)) : this.opts.worktree;
    const command = String(params.command ?? '');
    const args = Array.isArray(params.args) ? params.args.map(String) : [];
    const envAdditions = Array.isArray(params.env) ? (params.env as { name?: string; value?: string }[]) : [];
    const env: NodeJS.ProcessEnv = agentEnv(process.env, (this.opts.env ?? {}) as Record<string, string>);
    for (const entry of envAdditions) if (entry?.name) env[entry.name] = String(entry.value ?? '');
    const limit = Number(params.outputByteLimit) > 0 ? Number(params.outputByteLimit) : MAX_OUTPUT;
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const state: TerminalState = { id, command, cwd, child, output: '', truncated: false, exit: null, waiters: [], limit };
    const append = (chunk: Buffer) => {
      state.output += chunk.toString('utf8');
      if (state.output.length > limit) {
        state.truncated = true;
        state.output = state.output.slice(-limit);
      }
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.once('exit', (code, signal) => {
      state.exit = { exitCode: code, signal };
      for (const waiter of state.waiters.splice(0)) waiter(state.exit);
    });
    child.once('error', (error) => {
      state.exit = { exitCode: null, signal: null, error: error.message };
      for (const waiter of state.waiters.splice(0)) waiter(state.exit);
    });
    this.terminals.set(id, state);
    return id;
  }

  private terminalState(id: string): TerminalState {
    const state = this.terminals.get(id);
    if (!state) throw new AcpError(-32021, `unknown terminalId ${id}`);
    return state;
  }

  private terminalOutput(id: string): Record<string, unknown> {
    const state = this.terminalState(id);
    const result: Record<string, unknown> = { output: state.output, truncated: state.truncated };
    if (state.exit) result.exitStatus = { exitCode: state.exit.exitCode, signal: state.exit.signal };
    return result;
  }

  private async terminalWait(id: string): Promise<{ exitCode: number | null; signal: string | null }> {
    const state = this.terminalState(id);
    if (state.exit) return { exitCode: state.exit.exitCode, signal: state.exit.signal };
    const exit = await new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
      state.waiters.push(resolve);
      const timer = setTimeout(() => resolve({ exitCode: null, signal: null }), 30 * 60_000);
      timer.unref?.();
    });
    return exit;
  }

  private terminalKill(id: string): void {
    const state = this.terminalState(id);
    if (state.exit) return;
    try {
      if (state.child.pid) process.kill(-state.child.pid, 'SIGTERM');
    } catch {
      state.child.kill('SIGTERM');
    }
  }

  private terminalRelease(id: string): void {
    const state = this.terminals.get(id);
    if (state && !state.exit) this.terminalKill(id);
    this.terminals.delete(id);
  }
}
