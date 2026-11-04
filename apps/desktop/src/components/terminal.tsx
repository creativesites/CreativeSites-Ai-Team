import * as React from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { TranscriptEntry } from '@runtime/types';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

interface TauriTerminalSessionInfo {
  session_id: string;
  command: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  is_alive: boolean;
}

interface TauriTerminalOutputPayload {
  session_id: string;
  data: string;
}

interface TauriTerminalExitPayload {
  session_id: string;
  exit_code: number | null;
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
 * and paired `tool_call` updates) into clean, human-readable items.
 */
export function coalesceTranscriptEntries(entries: TranscriptEntry[]): {
  items: TranscriptEntry[];
  diagnostics: TranscriptEntry[];
} {
  const items: TranscriptEntry[] = [];
  const diagnostics: TranscriptEntry[] = [];

  for (const entry of entries) {
    const p = (entry.payload && typeof entry.payload === 'object' ? entry.payload : {}) as Record<string, unknown>;

    // Separate internal ACP startup stderr lines into diagnostics
    if (entry.kind === 'stderr' || entry.kind === 'adapter_stderr') {
      const text = String(p.text ?? p.line ?? '').trim();
      if (isInternalDiagnosticStderr(text)) {
        diagnostics.push(entry);
        continue;
      }
    }

    const prev = items[items.length - 1];

    // 1. Merge consecutive assistant message chunks into one readable turn card
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

    // 2. Merge consecutive thought chunks into one collapsible thinking block
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

    // 3. Merge adjacent tool_call_update into its preceding matching tool_call
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

    items.push({
      ...entry,
      payload: p ? { ...p } : entry.payload,
    });
  }

  return { items, diagnostics };
}

/**
 * Interactive PTY shell terminal backed by `xterm.js`.
 * Uses Tauri's native `portable-pty` (`pty.rs`) when running inside the Tauri shell,
 * and falls back to the runtime's `/v1/terminals` PTY endpoint in a standard browser.
 */
interface ShellTabInfo {
  id: string;
  title: string;
  status: 'starting' | 'running' | 'exited' | 'error';
  exitCode: number | null;
  resolvedCwd: string;
}

interface SingleTerminalViewProps {
  cwd?: string | null;
  isActive: boolean;
  onStatusChange: (status: 'starting' | 'running' | 'exited' | 'error', exitCode: number | null) => void;
  onCwdChange: (cwd: string) => void;
  actionRef: React.MutableRefObject<{
    sendInput: (data: string) => void;
    clear: () => void;
    restart: () => void;
  } | null>;
}

function SingleTerminalView({
  cwd,
  isActive,
  onStatusChange,
  onCwdChange,
  actionRef,
}: SingleTerminalViewProps) {
  const { client } = useRuntime();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const xtermRef = React.useRef<XTerm | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const tauriSessionIdRef = React.useRef<string | null>(null);
  const runtimeTermIdRef = React.useRef<string | null>(null);

  const [error, setError] = React.useState<string | null>(null);
  const [restartNonce, setRestartNonce] = React.useState(0);

  const sendShellInput = React.useCallback(
    (data: string) => {
      const tauriSessionId = tauriSessionIdRef.current;
      if (tauriSessionId) {
        void invoke('terminal_write', { sessionId: tauriSessionId, data }).catch(() => {});
        return;
      }
      const rtId = runtimeTermIdRef.current;
      if (rtId && client) {
        void client.writeTerminalInput(rtId, data).catch(() => {});
      }
    },
    [client]
  );

  const clear = React.useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  const restart = React.useCallback(() => {
    setRestartNonce((n) => n + 1);
  }, []);

  if (isActive) {
    actionRef.current = {
      sendInput: sendShellInput,
      clear,
      restart,
    };
  }

  React.useEffect(() => {
    if (isActive && fitRef.current && xtermRef.current) {
      const handle = requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
          xtermRef.current?.focus();
        } catch {
          /* ignore layout race */
        }
      });
      return () => cancelAnimationFrame(handle);
    }
  }, [isActive]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const abort = new AbortController();
    let unlistenOutput: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    const pendingOutputQueue: string[] = [];

    onStatusChange('starting', null);
    setError(null);
    onCwdChange(cwd ?? '~');

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12.5,
      lineHeight: 1.38,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: XTERM_THEME,
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    requestAnimationFrame(() => {
      if (!disposed) {
        try {
          fit.fit();
        } catch {
          /* ignore */
        }
      }
    });

    xtermRef.current = term;
    fitRef.current = fit;

    const inputDisposable = term.onData((data) => {
      const tauriSessionId = tauriSessionIdRef.current;
      if (tauriSessionId) {
        void invoke('terminal_write', { sessionId: tauriSessionId, data }).catch(() => {});
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
        const tauriSessionId = tauriSessionIdRef.current;
        if (tauriSessionId && term.cols > 0 && term.rows > 0) {
          void invoke('terminal_resize', {
            sessionId: tauriSessionId,
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
          unlistenOutput = await listen<TauriTerminalOutputPayload>('terminal_output', (event) => {
            if (disposed) return;
            const currentId = tauriSessionIdRef.current;
            if (!currentId) {
              pendingOutputQueue.push(event.payload.data);
              return;
            }
            if (event.payload.session_id === currentId) {
              term.write(event.payload.data);
            }
          });

          unlistenExit = await listen<TauriTerminalExitPayload>('terminal_exit', (event) => {
            if (disposed) return;
            if (event.payload.session_id === tauriSessionIdRef.current) {
              onStatusChange('exited', event.payload.exit_code);
              term.writeln(
                `\r\n\x1b[90m[process exited${
                  event.payload.exit_code !== null ? ` with code ${event.payload.exit_code}` : ''
                }]\x1b[0m`
              );
            }
          });

          const cols = term.cols || 100;
          const rows = term.rows || 30;
          const info = await invoke<TauriTerminalSessionInfo>('terminal_spawn', {
            cwd: cwd ?? null,
            cols,
            rows,
          });

          if (disposed) {
            void invoke('terminal_kill', { sessionId: info.session_id }).catch(() => {});
            return;
          }

          tauriSessionIdRef.current = info.session_id;
          onCwdChange(info.cwd || cwd || '~');
          onStatusChange('running', null);
          while (pendingOutputQueue.length > 0) {
            const chunk = pendingOutputQueue.shift();
            if (chunk) term.write(chunk);
          }
          if (isActive) term.focus();
          return;
        } catch {
          // Fall through to runtime PTY if native spawn fails
          unlistenOutput?.();
          unlistenExit?.();
          unlistenOutput = null;
          unlistenExit = null;
        }
      }

      // 2. Runtime-backed PTY shell (works in both Browser and Tauri)
      if (!client) {
        onStatusChange('error', null);
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
        onCwdChange(created.cwd || cwd || '~');
        onStatusChange('running', null);
        if (isActive) term.focus();
        await client.streamTerminal(
          created.id,
          (ev) => {
            if (disposed) return;
            if (ev.type === 'data' && ev.data) {
              term.write(ev.data);
            } else if (ev.type === 'exit') {
              onStatusChange('exited', ev.exitCode ?? 0);
            } else if (ev.type === 'error' && ev.message) {
              setError(ev.message);
              onStatusChange('error', null);
            }
          },
          abort.signal
        );
      } catch (e) {
        if (disposed || abort.signal.aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        onStatusChange('error', null);
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
      const tauriSessionId = tauriSessionIdRef.current;
      tauriSessionIdRef.current = null;
      if (tauriSessionId) {
        void invoke('terminal_kill', { sessionId: tauriSessionId }).catch(() => {});
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
    <div className={cn('min-h-[340px] flex-1 flex flex-col overflow-hidden', !isActive && 'hidden')}>
      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        onClick={() => xtermRef.current?.focus()}
        className="flex-1 overflow-hidden p-2"
      />
    </div>
  );
}

/**
 * Interactive Multi-Tab PTY shell terminal backed by `xterm.js`.
 * Supports opening multiple persistent tabs (`zsh #1`, `zsh #2`, `+ New Tab`)
 * per workspace/worktree, keeping PTY sessions alive across tab switches.
 */
export function Terminal({ cwd, className }: TerminalProps) {
  const [tabs, setTabs] = React.useState<ShellTabInfo[]>([
    { id: 'tab-1', title: 'zsh #1', status: 'starting', exitCode: null, resolvedCwd: cwd ?? '~' },
  ]);
  const [activeTabId, setActiveTabId] = React.useState('tab-1');
  const nextTabNumRef = React.useRef(2);
  const activeActionRef = React.useRef<{
    sendInput: (data: string) => void;
    clear: () => void;
    restart: () => void;
  } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const addNewTab = React.useCallback(() => {
    const num = nextTabNumRef.current++;
    const newId = `tab-${Date.now()}-${num}`;
    const newTab: ShellTabInfo = {
      id: newId,
      title: `zsh #${num}`,
      status: 'starting',
      exitCode: null,
      resolvedCwd: cwd ?? '~',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  }, [cwd]);

  const closeTab = React.useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId) {
          const closedIdx = prev.findIndex((t) => t.id === tabId);
          const nextActive = next[Math.min(closedIdx, next.length - 1)];
          if (nextActive) setActiveTabId(nextActive.id);
        }
        return next;
      });
    },
    [activeTabId]
  );

  const updateTabStatus = React.useCallback(
    (tabId: string, status: 'starting' | 'running' | 'exited' | 'error', exitCode: number | null) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, status, exitCode } : t))
      );
    },
    []
  );

  const updateTabCwd = React.useCallback((tabId: string, newCwd: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, resolvedCwd: newCwd } : t))
    );
  }, []);

  return (
    <div className={cn('flex flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-[#0f1012]', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-[#14161a] px-3 py-1.5 text-xs">
        {/* Multi-Tab Buttons */}
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isTabActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={cn(
                  'group flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[11px] cursor-pointer transition-colors',
                  isTabActive
                    ? 'bg-white/10 text-zinc-100 font-medium shadow-sm'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    tab.status === 'running'
                      ? 'bg-emerald-400'
                      : tab.status === 'starting'
                        ? 'animate-pulse bg-amber-400'
                        : 'bg-zinc-500'
                  )}
                />
                <span>{tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    title={`Close ${tab.title}`}
                    className="ml-0.5 rounded px-1 text-[10px] text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addNewTab}
            title="Open new shell tab"
            className="flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            <span className="text-xs font-bold leading-none">+</span>
            <span>New Tab</span>
          </button>
          {activeTab && (
            <span className="ml-2 truncate font-mono text-[10px] text-zinc-500" title={activeTab.resolvedCwd}>
              · {activeTab.resolvedCwd}
            </span>
          )}
        </div>

        {/* Tab Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          {activeTab?.status === 'running' && (
            <>
              <button
                type="button"
                onClick={() => activeActionRef.current?.sendInput('git status -s\n')}
                className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-white/10"
              >
                git status
              </button>
              <button
                type="button"
                onClick={() => activeActionRef.current?.sendInput('git log -n 5 --oneline\n')}
                className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-white/10"
              >
                git log
              </button>
              <button
                type="button"
                onClick={() => activeActionRef.current?.sendInput('ls -la\n')}
                className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-white/10"
              >
                ls -la
              </button>
            </>
          )}
          {activeTab?.status === 'exited' && (
            <span className="font-mono text-[11px] text-zinc-400">
              exited{activeTab.exitCode !== null ? ` (${activeTab.exitCode})` : ''}
            </span>
          )}
          <button
            type="button"
            onClick={() => activeActionRef.current?.clear()}
            className="rounded px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => activeActionRef.current?.restart()}
            className="rounded px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10"
          >
            Restart shell
          </button>
        </div>
      </div>

      {tabs.map((tab) => (
        <SingleTerminalView
          key={tab.id}
          cwd={cwd}
          isActive={tab.id === activeTabId}
          onStatusChange={(status, exitCode) => updateTabStatus(tab.id, status, exitCode)}
          onCwdChange={(newCwd) => updateTabCwd(tab.id, newCwd)}
          actionRef={activeActionRef}
        />
      ))}
    </div>
  );
}

/**
 * Live `xterm.js` terminal view of an agent session's complete CLI / ACP output
 * (Claude Code, Codex, Gemini CLI / Antigravity) with live streaming updates
 * and an optional prompt bar to send follow-up instructions or wake the agent.
 */
export function AgentTerminal({
  sessionId,
  agentId,
  agentName,
  hideComposer = false,
  className,
}: {
  sessionId: string;
  agentId?: string;
  agentName?: string;
  hideComposer?: boolean;
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
  const [pollTick, setPollTick] = React.useState(0);

  // Mount XTerm instance
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      cursorBlink: false,
      disableStdin: true,
      fontSize: 12.5,
      lineHeight: 1.4,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: XTERM_THEME,
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });

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

  // Poll every 1.2s while session is starting/running so streaming terminal stays real-time
  React.useEffect(() => {
    if (meta?.state !== 'running' && meta?.state !== 'starting') return;
    const timer = window.setInterval(() => {
      setPollTick((t) => t + 1);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [meta?.state]);

  // Fetch & incrementally write formatted agent terminal output
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
        try {
          fitRef.current?.fit();
        } catch {
          /* ignore */
        }
        const prev = lastOutputRef.current;
        if (prev && res.output.startsWith(prev)) {
          const delta = res.output.slice(prev.length);
          if (delta) {
            term.write(delta);
            term.scrollToBottom();
          }
        } else if (res.output !== prev) {
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
  }, [client, sessionId, revision, pollTick]);

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
    <div className={cn('flex flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-[#0f1012]', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-[#14161a] px-3 py-1.5 text-xs">
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
          <span className="truncate font-mono text-[11px] font-medium text-zinc-200">
            {agentName ?? agentId ?? 'Agent'} · {sessionId}
          </span>
          {meta?.acpSessionId && (
            <span
              className="max-w-[200px] truncate rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
              title={`ACP Session ID: ${meta.acpSessionId}`}
            >
              acp: {meta.acpSessionId}
            </span>
          )}
          {meta?.pid && <span className="font-mono text-[10px] text-zinc-400">pid {meta.pid}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 font-mono text-[10px] uppercase',
              meta?.state === 'running' || meta?.state === 'starting'
                ? 'bg-emerald-500/15 text-emerald-300'
                : meta?.state === 'failed'
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-white/5 text-zinc-400'
            )}
          >
            {meta?.state ?? 'loading'}
          </span>
          <button
            type="button"
            onClick={() => xtermRef.current?.scrollToBottom()}
            className="rounded px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10"
          >
            Scroll to Bottom
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}

      <div ref={containerRef} className="min-h-[340px] flex-1 overflow-hidden p-2" />

      {!hideComposer && (
        <form onSubmit={sendPrompt} className="flex items-center gap-2 border-t border-border/50 bg-[#141619] px-3 py-2">
          <span className="font-mono text-xs text-emerald-400">❯</span>
          <input
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder={`Give instructions to ${agentName ?? agentId ?? 'agent'}…`}
            aria-label="Send prompt to agent session"
            className="h-8 flex-1 bg-transparent font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <button
            type="submit"
            disabled={!promptInput.trim() || sending}
            className="rounded-md bg-emerald-500/20 px-3 py-1 font-mono text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
          >
            {sending ? 'Sending…' : 'Send Instruction'}
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * Coalesced, Claude-Code / Antigravity style structured session console.
 * Merges streaming token chunks into clean conversation turns, collapses internal
 * thinking and ACP startup diagnostics, and highlights tool calls and commits.
 */
export function StructuredTranscriptView({
  entries,
  agentName,
  sessionState,
  className,
}: {
  entries: TranscriptEntry[];
  agentName?: string;
  sessionState?: string;
  className?: string;
}) {
  const { items, diagnostics } = React.useMemo(() => coalesceTranscriptEntries(entries), [entries]);
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items.length, sessionState]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-border/50 bg-background/40 p-8 text-sm text-muted-foreground">
        Session is starting — output and tool activity will stream here live.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-border/60 bg-[#0f1012] p-4', className)}>
      {items.map((entry) => {
        const p = (entry.payload ?? {}) as {
          text?: string;
          title?: string;
          status?: string;
          message?: string;
          toolCallId?: string;
          commitSha?: string;
          stopReason?: string;
          rawInput?: Record<string, unknown>;
          command?: string;
          args?: string[];
          op?: string;
          bytes?: number;
        };
        const ts = new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

        if (entry.kind === 'prompt' || entry.kind === 'user_message' || entry.role === 'user') {
          const cleanPrompt = stripCoordinationBoilerplate(String(p.text ?? p.title ?? ''));
          return (
            <div key={entry.id} className="flex flex-col gap-1.5 rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-sky-300/90">
                <span className="font-medium">You → {agentName ?? 'Agent'}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{ts}</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-100">
                {cleanPrompt}
              </div>
            </div>
          );
        }

        if (entry.kind === 'thought' || entry.kind === 'agent_thought_chunk' || entry.role === 'thought') {
          const thoughtText = String(p.text ?? '').trim();
          if (!thoughtText) return null;
          return (
            <details key={entry.id} className="group rounded-lg border border-border/40 bg-white/[0.02] px-3 py-1.5 text-xs">
              <summary className="flex cursor-pointer items-center justify-between gap-2 text-muted-foreground select-none">
                <span className="font-mono text-[11px]">💭 Thinking ({thoughtText.length} chars)</span>
                <span className="font-mono text-[10px]">{ts}</span>
              </summary>
              <div className="mt-2 whitespace-pre-wrap break-words border-t border-border/30 pt-2 font-mono text-[11.5px] text-zinc-400">
                {thoughtText}
              </div>
            </details>
          );
        }

        if (entry.kind === 'tool' || entry.kind === 'tool_call' || entry.kind === 'tool_call_update') {
          const status = p.status ?? 'running';
          const title = entry.title ?? p.title ?? 'Tool execution';
          const rawInputStr = p.rawInput && Object.keys(p.rawInput).length > 0 ? JSON.stringify(p.rawInput, null, 2) : null;
          return (
            <details key={entry.id} className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] px-3 py-2 text-xs">
              <summary className="flex cursor-pointer items-center justify-between gap-2 select-none">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex size-4 shrink-0 items-center justify-center rounded-full font-mono text-[10px]',
                      status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : status === 'failed'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-cyan-500/20 text-cyan-300'
                    )}
                  >
                    {status === 'completed' ? '✓' : status === 'failed' ? '✗' : '⚙'}
                  </span>
                  <span className="truncate font-mono text-xs text-zinc-200">{title}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{status}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{ts}</span>
                </div>
              </summary>
              {(rawInputStr || p.text) && (
                <div className="mt-2 flex flex-col gap-1.5 border-t border-border/30 pt-2 font-mono text-[11px] text-zinc-300">
                  {rawInputStr && <pre className="overflow-x-auto whitespace-pre-wrap text-zinc-400">{rawInputStr}</pre>}
                  {p.text && <pre className="overflow-x-auto whitespace-pre-wrap text-zinc-200">{p.text}</pre>}
                </div>
              )}
            </details>
          );
        }

        if (entry.kind === 'command') {
          const cmd = entry.title ?? p.command ?? 'command';
          const args = Array.isArray(p.args) ? p.args.join(' ') : '';
          return (
            <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-white/[0.02] px-3 py-1.5 font-mono text-xs text-cyan-300">
              <span className="truncate">$ {cmd} {args}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{ts}</span>
            </div>
          );
        }

        if (entry.kind === 'file') {
          return (
            <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-1.5 font-mono text-xs text-emerald-300">
              <span className="truncate">
                ✎ {(p.op ?? 'file').toUpperCase()} {entry.title}
                {p.bytes != null ? ` (${p.bytes} bytes)` : ''}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{ts}</span>
            </div>
          );
        }

        if (entry.kind === 'commit') {
          return (
            <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs text-emerald-200">
              <span>Committed worktree changes · {p.commitSha?.slice(0, 12) ?? 'HEAD'}</span>
              <span className="text-[10px] text-emerald-300/80">{ts}</span>
            </div>
          );
        }

        if (entry.kind === 'turn' || entry.kind === 'turn_end') {
          return (
            <div key={entry.id} className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
              <span className="h-px flex-1 bg-border/40" />
              <span className="font-mono">Turn complete ({p.stopReason ?? 'end_turn'}) · {ts}</span>
              <span className="h-px flex-1 bg-border/40" />
            </div>
          );
        }

        if (entry.kind === 'baton_handoff' || entry.kind === 'session_rotated') {
          const bp = p as {
            parentSessionId?: string;
            supersededBySessionId?: string;
            generation?: number;
            capsuleTokens?: number;
            parentTokens?: number;
            reason?: string;
            capsule?: string;
          };
          return (
            <details
              key={entry.id}
              className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2.5 text-xs text-indigo-100"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-2 select-none">
                <div className="flex items-center gap-2 font-mono text-[11.5px] font-semibold text-indigo-300">
                  <span>↺ {entry.title ?? 'Session Baton Relay'}</span>
                  {bp.capsuleTokens != null && (
                    <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-200">
                      {bp.capsuleTokens} baton tokens
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px] text-indigo-300/80">{ts}</span>
              </summary>
              <div className="mt-2 flex flex-col gap-1.5 border-t border-indigo-500/25 pt-2 font-mono text-[11px] text-indigo-200/90">
                {bp.reason && <div>Reason: {bp.reason}</div>}
                {bp.parentSessionId && <div>Parent Session: {bp.parentSessionId}</div>}
                {bp.supersededBySessionId && <div>Successor Session: {bp.supersededBySessionId}</div>}
                {bp.capsule && (
                  <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2.5 text-[10.5px] text-zinc-300">
                    {bp.capsule}
                  </pre>
                )}
              </div>
            </details>
          );
        }

        if (entry.kind === 'error') {
          return (
            <div key={entry.id} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">
              <div className="mb-1 flex items-center justify-between font-mono text-[11px] font-semibold text-red-300">
                <span>✖ {entry.title ?? 'Session Error'}</span>
                <span>{ts}</span>
              </div>
              <div className="whitespace-pre-wrap break-words font-mono">{p.message ?? p.text ?? 'Unknown error'}</div>
            </div>
          );
        }

        if (entry.kind === 'stderr' || entry.kind === 'adapter_stderr') {
          const text = String(p.text ?? '').trim();
          if (!text) return null;
          return (
            <div key={entry.id} className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-1.5 font-mono text-[11px] text-amber-200">
              <span className="mr-2 text-amber-400">[{ts} stderr]</span>
              <span className="whitespace-pre-wrap break-words">{text}</span>
            </div>
          );
        }

        // Default: Assistant message block
        const text = String(p.text ?? p.title ?? p.message ?? '').trim();
        if (!text) return null;
        return (
          <div key={entry.id} className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-white/[0.03] px-4 py-3">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                {agentName ?? 'Agent'}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">{ts}</span>
            </div>
            <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-zinc-100">
              {text}
            </div>
          </div>
        );
      })}

      {(sessionState === 'running' || sessionState === 'starting') && (
        <div className="flex items-center gap-2 px-2 py-1 font-mono text-xs text-emerald-400">
          <span className="size-2 animate-ping rounded-full bg-emerald-400" />
          <span>{agentName ?? 'Agent'} is working…</span>
        </div>
      )}

      {diagnostics.length > 0 && (
        <div className="mt-1 border-t border-border/30 pt-2">
          <button
            type="button"
            onClick={() => setShowDiagnostics((s) => !s)}
            className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            {showDiagnostics ? '▾ Hide' : '▸ Show'} {diagnostics.length} internal ACP diagnostic event{diagnostics.length === 1 ? '' : 's'}
          </button>
          {showDiagnostics && (
            <div className="mt-1.5 flex flex-col gap-1 rounded-lg bg-black/40 p-2 font-mono text-[10.5px] text-zinc-500">
              {diagnostics.map((d) => {
                const dp = (d.payload ?? {}) as { text?: string };
                return (
                  <div key={d.id} className="truncate">
                    {dp.text}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
