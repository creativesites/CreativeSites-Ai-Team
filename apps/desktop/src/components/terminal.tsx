import * as React from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';
import { cn } from '@/lib/utils';

// Global history buffer to preserve terminal output across view/tab switches
const globalTerminalBuffers = new Map<string, string>();

export const appendTerminalBuffer = (sessionId: string, data: string) => {
  const current = globalTerminalBuffers.get(sessionId) || '';
  // Cap at 256KB to avoid unbounded memory growth
  globalTerminalBuffers.set(sessionId, (current + data).slice(-262144));
};

export const getTerminalBuffer = (sessionId: string): string => {
  return globalTerminalBuffers.get(sessionId) || '';
};

export const clearTerminalBuffer = (sessionId: string) => {
  globalTerminalBuffers.delete(sessionId);
};

export interface TerminalProps {
  /** Working directory for the spawned shell (e.g. job worktree or project root). */
  cwd?: string;
  /** Existing session ID to connect to, or omit to spawn a new login shell. */
  sessionId?: string;
  className?: string;
  /** Called when the terminal session is active and ready. */
  onReady?: (sessionId: string) => void;
  /** Called when the shell process exits. */
  onExit?: (exitCode: number | null) => void;
  /** Called on user input keystrokes. */
  onData?: (data: string) => void;
}

export interface TerminalSessionInfo {
  session_id: string;
  command: string;
  args: string[];
  cwd: string;
  cols: u16;
  rows: u16;
  is_alive: boolean;
}

type u16 = number;

export function Terminal({
  cwd,
  sessionId: initialSessionId,
  className,
  onReady,
  onExit,
  onData,
}: TerminalProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const termRef = React.useRef<XTerm | null>(null);
  const fitAddonRef = React.useRef<FitAddon | null>(null);
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(initialSessionId ?? null);
  const [error, setError] = React.useState<string | null>(null);

  const onDataRef = React.useRef(onData);
  onDataRef.current = onData;
  const onReadyRef = React.useRef(onReady);
  onReadyRef.current = onReady;
  const onExitRef = React.useRef(onExit);
  onExitRef.current = onExit;

  // 1. Spawn or bind session
  React.useEffect(() => {
    let cancelled = false;

    if (!isTauri()) {
      setError('Terminal requires the MyaOS Desktop application (native PTY).');
      return;
    }

    if (initialSessionId) {
      setActiveSessionId(initialSessionId);
      onReadyRef.current?.(initialSessionId);
      return;
    }

    // Spawn a new login shell session
    const spawnSession = async () => {
      try {
        const info = await invoke<TerminalSessionInfo>('terminal_spawn', {
          cwd: cwd || null,
        }).catch(() => {
          // Fallback alias if terminal_spawn isn't available
          return invoke<TerminalSessionInfo>('pty_spawn_shell', { cwd: cwd || null });
        });

        if (cancelled) return;
        setActiveSessionId(info.session_id);
        onReadyRef.current?.(info.session_id);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to spawn terminal: ${msg}`);
      }
    };

    spawnSession();

    return () => {
      cancelled = true;
    };
  }, [cwd, initialSessionId]);

  // 2. Initialize XTerm and FitAddon once activeSessionId is known
  React.useEffect(() => {
    if (!activeSessionId || !containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      convertEol: true,
      allowProposedApi: true,
      cursorStyle: 'block',
      scrollback: 5000,
      theme: {
        background: '#121214',
        foreground: '#f8fafc',
        cursor: '#8db8ff',
        cursorAccent: '#121214',
        selectionBackground: 'rgba(141, 184, 255, 0.25)',
        selectionForeground: '#ffffff',
        black: '#1a1a1e',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#38bdf8',
        white: '#f1f5f9',
        brightBlack: '#475569',
        brightRed: '#ef4444',
        brightGreen: '#22c55e',
        brightYellow: '#eab308',
        brightBlue: '#3b82f6',
        brightMagenta: '#a855f7',
        brightCyan: '#0ea5e9',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Replay buffer history
    const history = getTerminalBuffer(activeSessionId);
    if (history) {
      term.write(history);
    }

    const fitAndResize = () => {
      try {
        if (!fitAddonRef.current || !termRef.current) return;
        fitAddonRef.current.fit();
        const cols = termRef.current.cols;
        const rows = termRef.current.rows;
        if (cols && rows && cols >= 10 && rows >= 3) {
          invoke('terminal_resize', { sessionId: activeSessionId, cols, rows }).catch(() => {
            invoke('pty_resize', { sessionId: activeSessionId, cols, rows }).catch(() => {});
          });
        }
      } catch (e) {
        console.error('Terminal resize fit error:', e);
      }
    };

    // Initial fit
    const timer = setTimeout(() => {
      fitAndResize();
      term.focus();
    }, 40);

    // Stream listener: pty_output or terminal_output
    const unlistenOutputPromise = listen<{ session_id: string; data: string }>(
      'pty_output',
      (event) => {
        if (event.payload.session_id === activeSessionId) {
          term.write(event.payload.data);
          appendTerminalBuffer(activeSessionId, event.payload.data);
        }
      }
    );

    const unlistenTerminalOutputPromise = listen<{ session_id: string; data: string }>(
      'terminal_output',
      (event) => {
        if (event.payload.session_id === activeSessionId) {
          term.write(event.payload.data);
          appendTerminalBuffer(activeSessionId, event.payload.data);
        }
      }
    );

    // Exit listener
    const unlistenExitPromise = listen<{ session_id: string; exit_code?: number | null }>(
      'pty_exit',
      (event) => {
        if (event.payload.session_id === activeSessionId) {
          onExitRef.current?.(event.payload.exit_code ?? null);
        }
      }
    );

    const unlistenTerminalExitPromise = listen<{ session_id: string; exit_code?: number | null }>(
      'terminal_exit',
      (event) => {
        if (event.payload.session_id === activeSessionId) {
          onExitRef.current?.(event.payload.exit_code ?? null);
        }
      }
    );

    // Keyboard input
    const disposable = term.onData((data) => {
      onDataRef.current?.(data);
      invoke('terminal_write', { sessionId: activeSessionId, data }).catch(() => {
        invoke('pty_write', { sessionId: activeSessionId, data }).catch((err) => {
          console.error('Failed to write to terminal:', err);
        });
      });
    });

    // Resize listeners
    const handleResize = () => {
      fitAndResize();
    };

    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(fitAndResize);
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      disposable.dispose();
      unlistenOutputPromise.then((u) => u());
      unlistenTerminalOutputPromise.then((u) => u());
      unlistenExitPromise.then((u) => u());
      unlistenTerminalExitPromise.then((u) => u());
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [activeSessionId]);

  if (error) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-xl border border-destructive/30 bg-card p-6 text-sm text-destructive',
          className
        )}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-full w-full overflow-hidden rounded-xl bg-[#121214] p-3 shadow-inner ring-1 ring-white/10',
        className
      )}
    />
  );
}

export default Terminal;
