import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import os from 'node:os';

export interface TerminalSessionInfo {
  id: string;
  cwd: string;
  shell: string;
  pid: number | null;
  alive: boolean;
  createdAt: string;
}

interface LiveTerminal {
  id: string;
  cwd: string;
  shell: string;
  proc: ChildProcessWithoutNullStreams;
  alive: boolean;
  createdAt: string;
  history: string[];
  subscribers: Set<http.ServerResponse>;
}

const MAX_HISTORY_CHUNKS = 400;

export class TerminalManager {
  private readonly terminals = new Map<string, LiveTerminal>();

  create(cwdInput?: string | null, cols = 100, rows = 30): TerminalSessionInfo {
    const fallbackCwd = os.homedir() || process.cwd();
    const cwd = cwdInput && fs.existsSync(cwdInput) ? cwdInput : fallbackCwd;
    const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh');
    const id = `term_${crypto.randomBytes(6).toString('hex')}`;

    // Use python3 pty bridge when available on macOS/Linux so interactive prompts, colors, and job control work cleanly
    const usePythonPty = process.platform !== 'win32' && fs.existsSync('/usr/bin/python3');
    const proc = usePythonPty
      ? spawn(
          '/usr/bin/python3',
          [
            '-c',
            `import os, pty, select, sys, struct, fcntl, termios
master, slave = pty.openpty()
try:
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', ${ Number(rows) || 30 }, ${ Number(cols) || 100 }, 0, 0))
except Exception:
    pass
pid = os.fork()
if pid == 0:
    os.setsid()
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    if slave > 2:
        os.close(slave)
    os.close(master)
    os.environ['TERM'] = 'xterm-256color'
    os.execvp(${JSON.stringify(shell)}, [${JSON.stringify(shell)}, '-i'])
os.close(slave)
stdin_fd = sys.stdin.fileno()
stdout_fd = sys.stdout.fileno()
try:
    while True:
        r, _, _ = select.select([master, stdin_fd], [], [])
        if master in r:
            data = os.read(master, 4096)
            if not data:
                break
            os.write(stdout_fd, data)
        if stdin_fd in r:
            data = os.read(stdin_fd, 4096)
            if not data:
                break
            os.write(master, data)
except Exception:
    pass
`,
          ],
          {
            cwd,
            env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
            stdio: ['pipe', 'pipe', 'pipe'],
          }
        )
      : spawn(shell, ['-i'], {
          cwd,
          env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

    const createdAt = new Date().toISOString();
    const banner = `\x1b[38;5;244m[MyaOS Shell · ${shell} · ${cwd} · pid ${proc.pid ?? '?'}]\x1b[0m\r\n`;
    const term: LiveTerminal = {
      id,
      cwd,
      shell,
      proc,
      alive: true,
      createdAt,
      history: [banner],
      subscribers: new Set(),
    };
    this.terminals.set(id, term);

    const pushData = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      term.history.push(text);
      if (term.history.length > MAX_HISTORY_CHUNKS) {
        term.history.splice(0, term.history.length - MAX_HISTORY_CHUNKS);
      }
      const payload = JSON.stringify({ type: 'data', data: text });
      for (const res of term.subscribers) {
        if (res.destroyed || res.writableEnded) {
          term.subscribers.delete(res);
          continue;
        }
        res.write(`data: ${payload}\n\n`);
      }
    };

    proc.stdout.on('data', pushData);
    proc.stderr.on('data', pushData);
    proc.on('close', (code) => {
      term.alive = false;
      const exitMsg = `\r\n\x1b[38;5;244m[process exited with code ${code ?? 0}]\x1b[0m\r\n`;
      pushData(exitMsg);
      const payload = JSON.stringify({ type: 'exit', exitCode: code ?? 0 });
      for (const res of term.subscribers) {
        if (!res.destroyed && !res.writableEnded) {
          res.write(`data: ${payload}\n\n`);
        }
      }
    });

    return this.info(term);
  }

  list(): TerminalSessionInfo[] {
    return [...this.terminals.values()].map((t) => this.info(t));
  }

  write(id: string, data: string): void {
    const term = this.terminals.get(id);
    if (!term || !term.alive) throw new Error(`Terminal ${id} is not running`);
    term.proc.stdin.write(data);
  }

  subscribe(id: string, res: http.ServerResponse): void {
    const term = this.terminals.get(id);
    if (!term) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Terminal ${id} not found` })}\n\n`);
      res.end();
      return;
    }
    for (const chunk of term.history) {
      res.write(`data: ${JSON.stringify({ type: 'data', data: chunk })}\n\n`);
    }
    term.subscribers.add(res);
    res.on('close', () => {
      term.subscribers.delete(res);
    });
  }

  kill(id: string): void {
    const term = this.terminals.get(id);
    if (!term) return;
    term.alive = false;
    try {
      term.proc.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    this.terminals.delete(id);
  }

  closeAll(): void {
    for (const id of this.terminals.keys()) {
      this.kill(id);
    }
  }

  private info(t: LiveTerminal): TerminalSessionInfo {
    return {
      id: t.id,
      cwd: t.cwd,
      shell: t.shell,
      pid: t.proc.pid ?? null,
      alive: t.alive,
      createdAt: t.createdAt,
    };
  }
}
