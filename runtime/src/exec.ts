import { spawn } from 'node:child_process';

// Commands the runtime runs itself are Observed evidence. Everything is bounded:
// time, output size, and the working directory (validated by the caller).

export interface CommandResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

const MAX_OUTPUT = 2 * 1024 * 1024;

export function runShell(command: string, cwd: string, timeoutMs = 15 * 60_000): Promise<CommandResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn('/bin/sh', ['-c', command], {
      cwd,
      detached: true,
      env: {
        ...process.env,
        CI: process.env.CI ?? '1',
        GIT_TERMINAL_PROMPT: '0',
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    const capture = (chunk: Buffer, which: 'out' | 'err') => {
      const text = chunk.toString('utf8');
      if (which === 'out') {
        if (stdout.length < MAX_OUTPUT) stdout += text.slice(0, MAX_OUTPUT - stdout.length);
        else truncated = true;
      } else {
        if (stderr.length < MAX_OUTPUT) stderr += text.slice(0, MAX_OUTPUT - stderr.length);
        else truncated = true;
      }
    };
    child.stdout?.on('data', (c: Buffer) => capture(c, 'out'));
    child.stderr?.on('data', (c: Buffer) => capture(c, 'err'));
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({
        command,
        cwd,
        exitCode: null,
        signal: null,
        stdout,
        stderr: `${stderr}\n${e.message}`.trim(),
        durationMs: Date.now() - started,
        timedOut,
        truncated,
      });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        command,
        cwd,
        exitCode: code,
        signal: signal ?? null,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
        truncated,
      });
    });
  });
}
