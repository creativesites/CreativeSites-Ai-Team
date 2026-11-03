// Minimal JSON-RPC 2.0 peer over a child process's stdio (newline-delimited JSON).
// This is the transport the runtime will use for ACP; the spike keeps it dependency-free
// so every byte on the wire is visible and testable.

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { redactString } from './redact.js';

export class JsonRpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
    this.data = data;
  }
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class StdioPeer {
  constructor({
    command,
    args = [],
    cwd,
    env,
    onInbound,
    onOutbound,
    onParseError,
    onStderr,
    onExit,
  }) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.onInbound = onInbound;
    this.onOutbound = onOutbound;
    this.onParseError = onParseError;
    this.onStderr = onStderr;
    this.onExit = onExit;
    this.onRequest = null;
    this.onNotification = null;
    this.nextId = 1;
    this.pending = new Map();
    this.child = null;
    this.exited = null;
    this.stderrTail = [];
    this.stdoutLines = 0;
  }

  start() {
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true, // own process group, so shutdown can kill grand-children too
    });
    this.child.once('error', (err) => {
      this.exited = { code: null, signal: null, error: err.message };
      this.#rejectPending(new JsonRpcError(-32001, `adapter spawn failed: ${err.message}`));
      this.onExit?.({ code: null, signal: null, error: err.message });
    });
    this.child.once('exit', (code, signal) => {
      this.exited = { code, signal };
      this.#rejectPending(
        new JsonRpcError(-32001, `adapter exited (code=${code}, signal=${signal}) before responding`),
      );
      this.onExit?.({ code, signal });
    });
    this.child.stdin.on('error', () => {
      /* EPIPE after exit: recorded through onExit */
    });
    readline
      .createInterface({ input: this.child.stdout, crlfDelay: Infinity })
      .on('line', (line) => {
        this.stdoutLines += 1;
        this.#handleLine(line);
      });
    readline
      .createInterface({ input: this.child.stderr, crlfDelay: Infinity })
      .on('line', (line) => {
        this.stderrTail.push(line);
        if (this.stderrTail.length > 300) this.stderrTail.shift();
        this.onStderr?.(line);
      });
    return this;
  }

  get pid() {
    return this.child?.pid ?? null;
  }

  get stdinWritable() {
    return Boolean(this.child?.stdin?.writable);
  }

  send(message) {
    if (!this.stdinWritable) throw new JsonRpcError(-32002, 'adapter stdin is not writable');
    this.onOutbound?.(message);
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params, { timeoutMs = 120000 } = {}) {
    const id = this.nextId++;
    const message = { jsonrpc: '2.0', id, method };
    if (params !== undefined) message.params = params;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new JsonRpcError(-32000, `timeout after ${timeoutMs}ms waiting for ${method}`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.send(message);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  notify(method, params) {
    const message = { jsonrpc: '2.0', method };
    if (params !== undefined) message.params = params;
    this.send(message);
  }

  respond(id, result) {
    this.send({ jsonrpc: '2.0', id, result });
  }

  respondError(id, code, message, data) {
    const error = { code, message };
    if (data !== undefined) error.data = data;
    this.send({ jsonrpc: '2.0', id, error });
  }

  #rejectPending(err) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  #handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (err) {
      this.onParseError?.(trimmed, err);
      return;
    }
    this.onInbound?.(message);
    if (message.method && message.id !== undefined && message.id !== null) {
      this.onRequest?.(message);
      return;
    }
    if (message.method) {
      this.onNotification?.(message);
      return;
    }
    if (message.id !== undefined && message.id !== null) {
      const pending = this.pending.get(message.id);
      if (!pending) return; // response to a request we already timed out
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(
          new JsonRpcError(message.error.code ?? -32603, message.error.message ?? 'unknown adapter error', message.error.data),
        );
      } else {
        pending.resolve(message.result);
      }
    }
  }

  /**
   * Stop the adapter process group. SIGTERM first, then SIGKILL.
   * Returns the observed exit and which signal stopped it.
   */
  async terminate({ sigtermMs = 4000, sigkillMs = 2000 } = {}) {
    const child = this.child;
    if (!child || this.exited) return { ...this.exited, stoppedBy: this.exited ? 'already-exited' : 'unknown' };
    const pid = child.pid;
    const exited = new Promise((resolve) => child.once('exit', () => resolve(true)));
    for (const [signal, graceMs] of [
      ['SIGTERM', sigtermMs],
      ['SIGKILL', sigkillMs],
    ]) {
      let sent = false;
      try {
        process.kill(-pid, signal); // whole process group
        sent = true;
      } catch {
        try {
          child.kill(signal);
          sent = true;
        } catch {
          /* already gone */
        }
      }
      const done = await Promise.race([exited, delay(graceMs).then(() => false)]);
      if (done) return { ...this.exited, stoppedBy: signal, groupSignalSent: sent };
    }
    return { ...this.exited, stoppedBy: 'still-running-after-sigkill' };
  }

  /** Last stderr lines, for summaries (already redacted before logging elsewhere). */
  stderrSummary(lines = 20) {
    return this.stderrTail.slice(-lines).map((line) => redactString(line, 2000));
  }
}
