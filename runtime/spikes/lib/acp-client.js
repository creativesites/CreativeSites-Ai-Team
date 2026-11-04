// ACP v1 client used by the spike harness.
//
// It is deliberately a *probe*: it advertises the same client capabilities the
// runtime will advertise (fs.readTextFile, fs.writeTextFile, terminal), then
// records every client method the adapter actually calls. Nothing is assumed —
// if a capability is never used, the log shows zero calls.
//
// Safety properties:
//   - file writes are confined to the scenario workspace; anything else is refused
//     and recorded as blocked;
//   - reads are confined to the throwaway spike root;
//   - terminal commands run as real child processes and their exit codes are observed,
//     never reported by the agent;
//   - the adapter is spawned in its own process group so shutdown can kill grandchildren.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { JsonRpcError, StdioPeer, delay } from './jsonrpc.js';
import { redact, redactString, sha256, summarizeContent } from './redact.js';

export const PROTOCOL_VERSION = 1;

/** Exactly what the MyaOS runtime intends to advertise (see DESKTOP_V2_DECISIONS D5). */
export const CLIENT_CAPABILITIES = Object.freeze({
  fs: { readTextFile: true, writeTextFile: true },
  terminal: true,
});

/**
 * Resolve symlinks (macOS /tmp -> /private/tmp) so workspace confinement is not
 * defeated by a path spelling. Non-existent paths canonicalise their nearest
 * existing ancestor and keep the remaining suffix.
 */
function canonicalize(path) {
  const absolute = resolve(path);
  try {
    return realpathSync.native(absolute);
  } catch {
    const parent = dirname(absolute);
    if (parent === absolute) return absolute;
    return resolve(canonicalize(parent), basename(absolute));
  }
}

function isInside(child, parent) {
  const rel = relative(canonicalize(parent), canonicalize(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function collectStrings(value, out, depth = 0) {
  if (value == null || depth > 5) return out;
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out, depth + 1);
  }
  return out;
}

function looksLikePath(value) {
  return (
    /^(\.\.?\/|\/|~\/)/.test(value) ||
    /^[\w.-]+(?:\/[\w.-]+)+$/u.test(value) ||
    /^[\w.-]+\.[A-Za-z0-9]{1,8}$/u.test(value)
  );
}

export class AcpClient {
  constructor({
    name,
    command,
    args = [],
    cwd,
    env,
    log,
    workspaceRoot,
    spikeRoot,
    promptTimeoutMs = 180000,
    initTimeoutMs = 60000,
  }) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.log = log;
    this.workspaceRoot = canonicalize(workspaceRoot);
    this.spikeRoot = canonicalize(spikeRoot);
    this.promptTimeoutMs = promptTimeoutMs;
    this.initTimeoutMs = initTimeoutMs;

    this.sessionId = null;
    this.sessionCwd = null;
    this.initializeResult = null;

    this.calls = { fsRead: [], fsWrite: [], terminal: [], permission: [], otherMethods: [] };
    this.updates = { count: 0, byKind: {} };
    this.toolCalls = new Map();
    this.terminals = new Map();
    this.terminalResults = [];
    this.termSeq = 0;
    this.responseMethods = new Map();
    this.agentText = '';

    this.cancelRequested = false;
    this.current = { scenarioId: 'none', rejectPermissions: false };

    this.peer = new StdioPeer({
      command,
      args,
      cwd,
      env,
      onInbound: (message) => this.#onInbound(message),
      onOutbound: (message) => this.#onOutbound(message),
      onParseError: (line) => this.log.event('protocol/parse-error', { line: redactString(line, 2000) }),
      onStderr: (line) => this.log.event('adapter/stderr', { line: redactString(line, 4000) }),
      onExit: (exit) => this.log.event('adapter/exit', exit),
    });
    this.peer.onRequest = (message) => this.#handleRequest(message);
    this.peer.onNotification = (message) => this.#handleNotification(message);
  }

  start() {
    this.log.event('adapter/spawn', {
      command: this.command,
      args: this.args,
      cwd: this.cwd,
      pid: undefined,
    });
    this.peer.start();
    this.log.event('adapter/spawned', { pid: this.peer.pid });
    return this;
  }

  // ---------------------------------------------------------------- lifecycle

  async initialize() {
    const started = Date.now();
    const result = await this.peer.request(
      'initialize',
      { protocolVersion: PROTOCOL_VERSION, clientCapabilities: CLIENT_CAPABILITIES },
      { timeoutMs: this.initTimeoutMs },
    );
    this.initializeResult = result;
    this.log.event('acp/initialized', {
      ms: Date.now() - started,
      protocolVersion: result?.protocolVersion ?? null,
      agentInfo: result?.agentInfo ?? null,
      agentCapabilities: result?.agentCapabilities ?? null,
      authMethods: Array.isArray(result?.authMethods)
        ? result.authMethods.map((m) => ({ id: m?.id, name: m?.name, description: m?.description }))
        : [],
    });
    return result;
  }

  async newSession(cwd = this.workspaceRoot, { mcpServers = [] } = {}) {
    const started = Date.now();
    const result = await this.peer.request('session/new', { cwd, mcpServers }, { timeoutMs: this.initTimeoutMs });
    this.sessionId = result?.sessionId ?? null;
    this.sessionCwd = cwd;
    this.log.event('acp/session-created', {
      ms: Date.now() - started,
      sessionId: this.sessionId,
      cwd,
      modes: result?.modes ?? null,
      models: result?.models ?? null,
      resultKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    });
    if (!this.sessionId) throw new Error('session/new returned no sessionId');
    return result;
  }

  setScenario({ scenarioId, rejectPermissions = false }) {
    this.current = { scenarioId, rejectPermissions };
    this.cancelRequested = false;
  }

  async prompt(text, { timeoutMs = this.promptTimeoutMs } = {}) {
    const started = Date.now();
    const result = await this.peer.request(
      'session/prompt',
      { sessionId: this.sessionId, prompt: [{ type: 'text', text }] },
      { timeoutMs },
    );
    return { result, ms: Date.now() - started };
  }

  async cancel() {
    this.cancelRequested = true;
    this.log.event('client/cancel', { sessionId: this.sessionId, at: Date.now() });
    this.peer.notify('session/cancel', { sessionId: this.sessionId });
  }

  async close({ sigtermMs = 4000 } = {}) {
    for (const state of this.terminals.values()) {
      try {
        if (!state.exit) process.kill(-state.child.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
    const exit = await this.peer.terminate({ sigtermMs });
    this.log.event('acp/closed', { exit, stderrTail: this.peer.stderrSummary(10) });
    return exit;
  }

  // ------------------------------------------------------------------ logging

  #onInbound(message) {
    let safe = message;
    if (message.method === 'fs/write_text_file' && message.params) {
      safe = { ...message, params: { ...message.params, content: summarizeContent(message.params.content) } };
    }
    this.log.message('recv', redact(safe, { maxLen: 4000, maxItems: 80 }));
  }

  #onOutbound(message) {
    let safe = message;
    const responseMethod = message.id != null ? this.responseMethods.get(message.id) : null;
    if (responseMethod === 'fs/read_text_file' && message.result && typeof message.result === 'object' && 'content' in message.result) {
      safe = { ...message, result: { ...message.result, content: summarizeContent(message.result.content) } };
    } else if (responseMethod === 'terminal/output' && message.result && typeof message.result === 'object') {
      safe = { ...message, result: { ...message.result, output: redactString(message.result.output ?? '', 2000) } };
    }
    this.log.message('send', redact(safe, { maxLen: 4000, maxItems: 80 }));
  }

  // --------------------------------------------------------------- requests

  async #handleRequest(message) {
    try {
      const result = await this.#dispatchRequest(message);
      this.log.event('client/method', { method: message.method, id: message.id, outcome: 'ok' });
      this.responseMethods.set(message.id, message.method);
      this.peer.respond(message.id, result);
    } catch (err) {
      const code = err instanceof JsonRpcError ? err.code : -32603;
      this.log.event('client/method', {
        method: message.method,
        id: message.id,
        outcome: 'error',
        code,
        message: err.message,
      });
      this.responseMethods.set(message.id, message.method);
      this.peer.respondError(message.id, code, err.message, err instanceof JsonRpcError ? err.data : undefined);
    }
  }

  #dispatchRequest(message) {
    const params = message.params ?? {};
    switch (message.method) {
      case 'session/request_permission':
        return this.#permission(params, message.id);
      case 'fs/read_text_file':
        return this.#fsRead(params);
      case 'fs/write_text_file':
        return this.#fsWrite(params);
      case 'terminal/create':
        return this.#terminalCreate(params);
      case 'terminal/output':
        return this.#terminalOutput(params);
      case 'terminal/wait_for_exit':
        return this.#terminalWait(params);
      case 'terminal/kill':
        return this.#terminalKill(params);
      case 'terminal/release':
        return this.#terminalRelease(params);
      default: {
        this.calls.otherMethods.push({ method: message.method, params: redact(params, { maxLen: 500 }) });
        throw new JsonRpcError(-32601, `Method not found: ${message.method}`);
      }
    }
  }

  #resolvePath(path) {
    const raw = String(path ?? '');
    const absolute = isAbsolute(raw) ? raw : resolve(this.sessionCwd ?? this.cwd, raw);
    return canonicalize(absolute);
  }

  async #fsRead(params) {
    const abs = this.#resolvePath(params.path);
    const record = {
      path: abs,
      insideWorkspace: isInside(abs, this.workspaceRoot),
      line: params.line ?? null,
      limit: params.limit ?? null,
    };
    try {
      if (!isInside(abs, this.spikeRoot)) {
        throw new JsonRpcError(-32010, `spike client: read outside spike root blocked: ${abs}`);
      }
      const text = readFileSync(abs, 'utf8');
      let content = text;
      if (params.line != null) {
        const start = Math.max(0, Number(params.line) - 1);
        const end = params.limit != null ? start + Number(params.limit) : undefined;
        content = text.split('\n').slice(start, end).join('\n');
      }
      Object.assign(record, { ok: true, bytes: Buffer.byteLength(text), sha256: sha256(text) });
      this.calls.fsRead.push(record);
      this.log.event('client/fs-read', record);
      return { content };
    } catch (err) {
      Object.assign(record, { ok: false, error: err.message });
      this.calls.fsRead.push(record);
      this.log.event('client/fs-read', record);
      if (err instanceof JsonRpcError) throw err;
      throw new JsonRpcError(-32011, `spike client: read failed: ${err.message}`);
    }
  }

  async #fsWrite(params) {
    const abs = this.#resolvePath(params.path);
    const content = String(params.content ?? '');
    const insideWorkspace = isInside(abs, this.workspaceRoot);
    const record = { path: abs, insideWorkspace, content: summarizeContent(content) };
    if (!insideWorkspace) {
      record.blocked = 'outside-workspace';
      this.calls.fsWrite.push(record);
      this.log.event('client/fs-write', record);
      throw new JsonRpcError(-32012, `spike client: write outside workspace blocked: ${abs}`);
    }
    try {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
      Object.assign(record, { ok: true, wrote: true });
      this.calls.fsWrite.push(record);
      this.log.event('client/fs-write', record);
      return {};
    } catch (err) {
      Object.assign(record, { ok: false, error: err.message });
      this.calls.fsWrite.push(record);
      this.log.event('client/fs-write', record);
      throw new JsonRpcError(-32013, `spike client: write failed: ${err.message}`);
    }
  }

  // --------------------------------------------------------------- permission

  #permission(params, requestId) {
    const toolCall = params.toolCall ?? {};
    const options = Array.isArray(params.options) ? params.options : [];
    const pathCandidates = collectStrings(toolCall.rawInput ?? {}, [])
      .filter(looksLikePath)
      .slice(0, 20);
    const outsideCandidates = pathCandidates.filter((candidate) => {
      try {
        return !isInside(this.#resolvePath(candidate), this.workspaceRoot);
      } catch {
        return true;
      }
    });
    const reason = this.current.rejectPermissions
      ? 'scenario-policy:reject-outside-workspace'
      : outsideCandidates.length > 0
        ? 'path-outside-workspace'
        : 'workspace-policy:allow-once';
    const reject = reason !== 'workspace-policy:allow-once';
    const chosen = this.#chooseOption(options, reject);
    const record = {
      scenarioId: this.current.scenarioId,
      toolCallId: toolCall.toolCallId ?? null,
      title: toolCall.title ?? null,
      kind: toolCall.kind ?? null,
      status: toolCall.status ?? null,
      rawInput: redact(toolCall.rawInput ?? null, { maxLen: 600, maxItems: 20 }),
      pathCandidates,
      outsideCandidates,
      options: options.map((option) => ({ optionId: option?.optionId, name: option?.name, kind: option?.kind })),
      policy: reason,
      decision: this.cancelRequested ? 'cancelled' : reject ? 'reject' : 'allow_once',
      chose: chosen ? { optionId: chosen.optionId, kind: chosen.kind } : null,
    };
    this.calls.permission.push(record);
    this.log.event('client/permission', record);

    if (this.cancelRequested) {
      return { outcome: { outcome: 'cancelled' } };
    }
    if (!chosen) return { outcome: { outcome: 'cancelled' } };
    return { outcome: { outcome: 'selected', optionId: chosen.optionId } };
  }

  #chooseOption(options, reject) {
    const preference = reject ? ['reject_once', 'reject_always'] : ['allow_once', 'allow_always'];
    for (const kind of preference) {
      const match = options.find((option) => option?.kind === kind);
      if (match) return match;
    }
    return options[0] ?? null;
  }

  // ----------------------------------------------------------------- terminals

  async #terminalCreate(params) {
    const terminalId = `term-${++this.termSeq}`;
    const command = String(params.command ?? '');
    const args = Array.isArray(params.args) ? params.args.map(String) : [];
    const cwd = params.cwd ? String(params.cwd) : (this.sessionCwd ?? this.cwd);
    const envAdditions = Array.isArray(params.env) ? params.env : [];
    const env = { ...process.env };
    for (const entry of envAdditions) {
      if (entry && typeof entry.name === 'string') env[entry.name] = String(entry.value ?? '');
    }
    const outputByteLimit =
      Number(params.outputByteLimit) > 0 ? Number(params.outputByteLimit) : 1024 * 1024;

    const record = {
      terminalId,
      command,
      args,
      cwd,
      envNames: envAdditions.map((entry) => entry?.name).filter(Boolean),
      insideWorkspace: isInside(cwd, this.workspaceRoot),
    };

    let child;
    try {
      child = await this.#spawnTerminal(command, args, { cwd, env });
    } catch (err) {
      Object.assign(record, { ok: false, error: err.message });
      this.calls.terminal.push(record);
      this.log.event('client/terminal-create', record);
      throw new JsonRpcError(-32020, `spike client: terminal spawn failed: ${err.message}`);
    }

    const state = {
      terminalId,
      command,
      args,
      cwd,
      child,
      output: '',
      truncated: false,
      outputByteLimit,
      exit: null,
      waiters: [],
    };
    const append = (chunk) => {
      state.output += chunk.toString('utf8');
      if (state.output.length > state.outputByteLimit) {
        state.truncated = true;
        state.output = state.output.slice(-state.outputByteLimit);
      }
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.once('exit', (code, signal) => {
      state.exit = { exitCode: code, signal };
      this.log.event('terminal/exit', { terminalId, exitCode: code, signal });
      for (const waiter of state.waiters.splice(0)) waiter(state.exit);
    });
    child.once('close', () => {
      // Final capture after stdio closes: this is the Observed exit record the
      // evidence ledger would store for a client-run command.
      this.terminalResults.push({
        terminalId,
        command,
        args,
        cwd,
        exitCode: state.exit?.exitCode ?? null,
        signal: state.exit?.signal ?? null,
        error: state.exit?.error ?? null,
        outputTail: state.output.slice(-500),
        truncated: state.truncated,
      });
    });
    child.once('error', (err) => {
      state.exit = { exitCode: null, signal: null, error: err.message };
      this.log.event('terminal/error', { terminalId, error: err.message });
      for (const waiter of state.waiters.splice(0)) waiter(state.exit);
    });
    this.terminals.set(terminalId, state);
    Object.assign(record, { ok: true, pid: child.pid });
    this.calls.terminal.push(record);
    this.log.event('client/terminal-create', record);
    return { terminalId };
  }

  #spawnTerminal(command, args, options) {
    return new Promise((resolveSpawn, reject) => {
      let child;
      try {
        child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      } catch (err) {
        reject(err);
        return;
      }
      let settled = false;
      child.once('spawn', () => {
        settled = true;
        resolveSpawn(child);
      });
      child.once('error', (err) => {
        if (settled) return;
        if (err.code === 'ENOENT' && args.length === 0) {
          // Some agents hand the client a whole shell line with no args.
          const fallback = spawn('sh', ['-c', command], { ...options, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
          fallback.once('spawn', () => {
            settled = true;
            resolveSpawn(fallback);
          });
          fallback.once('error', (fallbackErr) => {
            if (!settled) reject(fallbackErr);
          });
          return;
        }
        reject(err);
      });
    });
  }

  #terminalState(terminalId) {
    const state = this.terminals.get(String(terminalId));
    if (!state) throw new JsonRpcError(-32021, `spike client: unknown terminalId ${terminalId}`);
    return state;
  }

  #terminalOutput(params) {
    const state = this.#terminalState(params.terminalId);
    const result = { output: state.output, truncated: state.truncated };
    if (state.exit) {
      result.exitStatus = { exitCode: state.exit.exitCode, signal: state.exit.signal };
      if (state.exit.error) result.exitStatus.error = state.exit.error;
    }
    return result;
  }

  async #terminalWait(params) {
    const state = this.#terminalState(params.terminalId);
    if (state.exit) return { exitCode: state.exit.exitCode, signal: state.exit.signal };
    const exit = await new Promise((resolveExit) => {
      state.waiters.push(resolveExit);
      setTimeout(() => resolveExit({ exitCode: null, signal: null, timeout: true }), 120000).unref?.();
    });
    return { exitCode: exit.exitCode, signal: exit.signal };
  }

  #terminalKill(params) {
    const state = this.#terminalState(params.terminalId);
    if (!state.exit) {
      try {
        process.kill(-state.child.pid, 'SIGTERM');
      } catch {
        try {
          state.child.kill('SIGTERM');
        } catch {
          /* already gone */
        }
      }
    }
    return {};
  }

  #terminalRelease(params) {
    const state = this.terminals.get(String(params.terminalId));
    if (state && !state.exit) {
      try {
        process.kill(-state.child.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
      this.log.event('terminal/killed-on-release', { terminalId: state.terminalId });
    }
    this.terminals.delete(String(params.terminalId));
    return {};
  }

  // -------------------------------------------------------------- notifications

  #handleNotification(message) {
    if (message.method === 'session/update') {
      const update = message.params?.update ?? message.params ?? {};
      const kind = update.sessionUpdate ?? update.type ?? 'unknown';
      this.updates.count += 1;
      this.updates.byKind[kind] = (this.updates.byKind[kind] ?? 0) + 1;
      if (kind === 'tool_call' || kind === 'tool_call_update') {
        const id = update.toolCallId ?? `anon-${this.toolCalls.size + 1}`;
        const entry = this.toolCalls.get(id) ?? { toolCallId: id, title: null, kind: null, status: null, updateCount: 0 };
        if (update.title) entry.title = update.title;
        if (update.kind) entry.kind = update.kind;
        if (update.status) entry.status = update.status;
        if (update.rawInput && typeof update.rawInput === 'object') entry.rawInputKeys = Object.keys(update.rawInput);
        entry.updateCount += 1;
        this.toolCalls.set(id, entry);
      }
      if (kind === 'agent_message_chunk' && update.content?.type === 'text') {
        this.agentText = `${this.agentText}${update.content.text ?? ''}`.slice(-4000);
      }
      this.log.event('acp/session-update', redact({
        kind,
        toolCallId: update.toolCallId ?? null,
        title: update.title ?? null,
        status: update.status ?? null,
        content: update.content ?? null,
      }, { maxLen: 800, maxItems: 20 }));
      return;
    }
    this.log.event('acp/notification', { method: message.method, params: redact(message.params, { maxLen: 500 }) });
  }

  // ------------------------------------------------------------------- summary

  stats() {
    const terminals = [...this.terminals.values()].map((state) => ({
      terminalId: state.terminalId,
      command: state.command,
      args: state.args,
      exit: state.exit,
    }));
    return {
      initialize: {
        protocolVersion: this.initializeResult?.protocolVersion ?? null,
        agentInfo: this.initializeResult?.agentInfo ?? null,
        agentCapabilities: this.initializeResult?.agentCapabilities ?? null,
        authMethods: this.initializeResult?.authMethods ?? null,
      },
      sessionId: this.sessionId,
      sessionCwd: this.sessionCwd,
      calls: {
        fsRead: this.calls.fsRead,
        fsWrite: this.calls.fsWrite,
        terminal: this.calls.terminal,
        permission: this.calls.permission,
        otherMethods: this.calls.otherMethods,
      },
      updates: this.updates,
      toolCalls: [...this.toolCalls.values()],
      terminals,
      terminalResults: this.terminalResults,
      lastAgentText: this.agentText,
    };
  }

  resetScenarioStats() {
    this.calls = { fsRead: [], fsWrite: [], terminal: [], permission: [], otherMethods: [] };
    this.updates = { count: 0, byKind: {} };
    this.toolCalls = new Map();
    this.terminalResults = [];
    this.agentText = '';
  }
}

export { delay, sha256 };
