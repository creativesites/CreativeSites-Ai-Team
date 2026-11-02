import * as React from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

interface TerminalOutputPayload {
  id: number;
  data: string;
}

interface TerminalExitPayload {
  id: number;
  exitCode: number | null;
}

export interface TerminalProps {
  /** Initial working directory for the shell (e.g. a job worktree). */
  cwd?: string | null;
  className?: string;
}

const XTERM_THEME = {
  background: '#0f1012',
  foreground: '#e5e7eb',
  cursor: '#e5e7eb',
  cursorAccent: '#0f1012',
  selectionBackground: 'rgba(255, 255, 255, 0.16)',
  black: '#181a1f',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e5e7eb',
  brightBlack: '#6b7280',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff',
};

/**
 * Interactive PTY shell terminal backed by `xterm.js`.
 * Uses Tauri's native `portable-pty` when running inside the Tauri shell, and
 * automatically falls back to the runtime's `/v1/terminals` PTY endpoint when
 * opened in a standard browser so it always works everywhere.
 */
export function Terminal({ cwd, className }: TerminalProps) {
  const { client } = useRuntime();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const xtermRef = React.useRef<XTerm | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const tauriIdRef = React.useRef<number | null>(null);
  const runtimeTermIdRef = React.useRef<string | null>(null);

  const [status, setStatus] = React.useState<'starting' | 'running' | 'exited' | 'error'>('starting');
  const [error, setError] = React.useState<string | null>(null);
  const [exitCode, setExitCode] = React.useState<number | null>(null);
  const [restartNonce, setRestartNonce] = React.useState(0);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const abort = new AbortController();
    let unlistenOutput: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;

    setStatus('starting');
    setError(null);
    setExitCode(null);

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12.5,
      lineHeight: 1.35,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: XTERM_THEME,
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      fit.fit();
    } catch {
      /* container may not be sized on first tick */
    }

    xtermRef.current = term;
    fitRef.current = fit;

    const inputDisposable = term.onData((data) => {
      const tauriId = tauriIdRef.current;
      if (tauriId !== null) {
        void invoke('terminal_write', { id: tauriId, data }).catch(() => {});
        return;
      }
      const rtId = runtimeTermIdRef.current;
      if (rtId && client) {
        void client.writeTerminalInput(rtId, data).catch(() => {});
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return;
      try {
        fit.fit();
        const tauriId = tauriIdRef.current;
        if (tauriId !== null && term.cols > 0 && term.rows > 0) {
          void invoke('terminal_resize', {
            id: tauriId,
            cols: term.cols,
            rows: term.rows,
          }).catch(() => {});
        }
      } catch {
        /* ignore transient layout errors */
      }
    });
    resizeObserver.observe(container);

    void (async () => {
      // 1. Try native Tauri PTY first when inside Tauri
      if (isTauri()) {
        try {
          unlistenOutput = await listen<TerminalOutputPayload>('terminal://output', (event) => {
            if (disposed) return;
            if (event.payload.id === tauriIdRef.current) {
              term.write(event.payload.data);
            }
          });

          unlistenExit = await listen<TerminalExitPayload>('terminal://exit', (event) => {
            if (disposed) return;
            if (event.payload.id === tauriIdRef.current) {
              setExitCode(event.payload.exitCode);
              setStatus('exited');
              term.writeln(
                `\r\n\x1b[90m[process exited${
                  event.payload.exitCode !== null ? ` with code ${event.payload.exitCode}` : ''
                }]\x1b[0m`
              );
            }
          });

          const cols = term.cols || 80;
          const rows = term.rows || 24;
          const id = await invoke<number>('terminal_spawn', {
            cwd: cwd ?? null,
            cols,
            rows,
          });

          if (disposed) {
            void invoke('terminal_kill', { id }).catch(() => {});
            return;
          }

          tauriIdRef.current = id;
          setStatus('running');
          term.focus();
          return;
        } catch {
          // Fall through to runtime PTY if native spawn fails
        }
      }

      // 2. Runtime-backed PTY shell (works in both Browser and Tauri)
      if (!client) {
        setStatus('error');
        setError('Waiting for the MyaOS runtime connection.');
        return;
      }

      try {
        const created = await client.createTerminal(cwd ?? null, term.cols || 100, term.rows || 30);
        if (disposed) {
          void client.killTerminal(created.id).catch(() => {});
          return;
        }
        runtimeTermIdRef.current = created.id;
        setStatus('running');
        term.focus();
        await client.streamTerminal(
          created.id,
          (ev) => {
            if (disposed) return;
            if (ev.type === 'data' && ev.data) {
              term.write(ev.data);
            } else if (ev.type === 'exit') {
              setExitCode(ev.exitCode ?? 0);
              setStatus('exited');
            } else if (ev.type === 'error' && ev.message) {
              setError(ev.message);
              setStatus('error');
            }
          },
          abort.signal
        );
      } catch (e) {
        if (disposed || abort.signal.aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus('error');
        term.writeln(`\r\n\x1b[31mFailed to spawn shell: ${msg}\x1b[0m`);
      }
    })();

    return () => {
      disposed = true;
      abort.abort();
      resizeObserver.disconnect();
      inputDisposable.dispose();
      unlistenOutput?.();
      unlistenExit?.();
      const tauriId = tauriIdRef.current;
      tauriIdRef.current = null;
      if (tauriId !== null) {
        void invoke('terminal_kill', { id: tauriId }).catch(() => {});
      }
      const rtId = runtimeTermIdRef.current;
      runtimeTermIdRef.current = null;
      if (rtId && client) {
        void client.killTerminal(rtId).catch(() => {});
      }
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [cwd, restartNonce, client]);

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-xl border border-border/60 bg-[#0f1012]', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'size-2 shrink-0 rounded-full',
              status === 'running'
                ? 'bg-emerald-400'
                : status === 'starting'
                  ? 'bg-amber-400'
                  : 'bg-zinc-500'
            )}
          />
          <span className="truncate font-mono text-[11px] text-zinc-400">
            {cwd ? `zsh — ${cwd}` : 'zsh — ~'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status === 'exited' && (
            <span className="font-mono text-[11px] text-zinc-400">
              exited{exitCode !== null ? ` (${exitCode})` : ''}
            </span>
          )}
          <button
            type="button"
            onClick={() => xtermRef.current?.clear()}
            className="rounded px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setRestartNonce((n) => n + 1)}
            className="rounded px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10"
          >
            Restart shell
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}

      <div ref={containerRef} className="min-h-[360px] flex-1 p-2" />
    </div>
  );
}

/**
 * Live `xterm.js` terminal view of an agent session's complete CLI / ACP output
 * (Claude Code, Codex, Gemini CLI / Antigravity) with live streaming updates
 * and an interactive prompt bar to send follow-up instructions or wake the agent.
 */
export function AgentTerminal({
  sessionId,
  agentId,
  agentName,
  className,
}: {
  sessionId: string;
  agentId?: string;
  agentName?: string;
  className?: string;
}) {
  const { client, revision } = useRuntime();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const xtermRef = React.useRef<XTerm | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const lastOutputRef = React.useRef<string>('');

  const [meta, setMeta] = React.useState<{
    acpSessionId: string | null;
    state: string;
    worktree: string | null;
    pid: number | null;
  } | null>(null);
  const [promptInput, setPromptInput] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Mount XTerm instance
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      cursorBlink: false,
      disableStdin: true,
      fontSize: 12.5,
      lineHeight: 1.38,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: XTERM_THEME,
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      fit.fit();
    } catch {
      /* ignore */
    }

    xtermRef.current = term;
    fitRef.current = fit;
    lastOutputRef.current = '';

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // Fetch & incrementally write formatted agent terminal output whenever revision bumps
  React.useEffect(() => {
    if (!client || !sessionId) return;
    let cancelled = false;
    client
      .sessionTerminal(sessionId)
      .then((res) => {
        if (cancelled) return;
        setMeta({
          acpSessionId: res.acpSessionId,
          state: res.state,
          worktree: res.worktree,
          pid: res.pid,
        });
        const term = xtermRef.current;
        if (!term) return;
        const prev = lastOutputRef.current;
        if (res.output.startsWith(prev)) {
          const delta = res.output.slice(prev.length);
          if (delta) {
            term.write(delta);
            term.scrollToBottom();
          }
        } else {
          term.clear();
          term.write(res.output);
          term.scrollToBottom();
        }
        lastOutputRef.current = res.output;
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [client, sessionId, revision]);

  const sendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !promptInput.trim() || sending) return;
    setSending(true);
    setError(null);
    const text = promptInput.trim();
    try {
      await client.promptSession(sessionId, text);
      setPromptInput('');
    } catch (err) {
      // Fallback: wake the agent by ID if session prompt failed
      if (agentId) {
        try {
          await client.wakeAgent(agentId, {
            fromActorId: 'winston',
            fromActorKind: 'human',
            sessionId,
            prompt: text,
            reason: 'Direct prompt from Agent Terminal',
            allowFallbackAdapter: true,
          });
          setPromptInput('');
        } catch (wakeErr) {
          setError(wakeErr instanceof Error ? wakeErr.message : String(wakeErr));
        }
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-xl border border-border/60 bg-[#0f1012]', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'size-2 shrink-0 rounded-full',
              meta?.state === 'running' || meta?.state === 'starting'
                ? 'animate-pulse bg-emerald-400'
                : meta?.state === 'idle'
                  ? 'bg-sky-400'
                  : meta?.state === 'failed'
                    ? 'bg-red-400'
                    : 'bg-zinc-500'
            )}
          />
          <span className="truncate font-mono text-[11px] text-zinc-200">
            {agentName ?? agentId ?? 'Agent'} · session {sessionId}
          </span>
          {meta?.acpSessionId && (
            <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              acp: {meta.acpSessionId}
            </span>
          )}
          {meta?.pid && (
            <span className="font-mono text-[10px] text-zinc-400">pid {meta.pid}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-zinc-400">{meta?.state ?? 'loading'}</span>
          <button
            type="button"
            onClick={() => xtermRef.current?.scrollToBottom()}
            className="rounded px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10"
          >
            Bottom
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}

      <div ref={containerRef} className="min-h-[380px] flex-1 p-2" />

      <form onSubmit={sendPrompt} className="flex items-center gap-2 border-t border-border/50 bg-[#141619] px-3 py-2">
        <span className="font-mono text-xs text-emerald-400">❯</span>
        <input
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          placeholder={`Send follow-up prompt or wake ${agentName ?? agentId ?? 'agent'}…`}
          aria-label="Send prompt to agent session"
          className="h-8 flex-1 bg-transparent font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <button
          type="submit"
          disabled={!promptInput.trim() || sending}
          className="rounded-md bg-emerald-500/20 px-3 py-1 font-mono text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
        >
          {sending ? 'Sending…' : 'Send / Wake'}
        </button>
      </form>
    </div>
  );
}
