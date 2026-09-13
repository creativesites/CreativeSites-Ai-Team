import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

// Global history buffer to preserve terminal output across view/tab switches without triggering React re-renders
const globalPtyBuffers = new Map<string, string>();

export const appendTerminalBuffer = (sessionId: string, data: string) => {
  const current = globalPtyBuffers.get(sessionId) || '';
  // Cap at 256KB to avoid unbounded memory growth
  globalPtyBuffers.set(sessionId, (current + data).slice(-262144));
};

export const getTerminalBuffer = (sessionId: string): string => {
  return globalPtyBuffers.get(sessionId) || '';
};

export const clearTerminalBuffer = (sessionId: string) => {
  globalPtyBuffers.delete(sessionId);
};

interface XTermTerminalProps {
  sessionId: string;
  onData: (data: string) => void;
  outputData?: string[];
}

export const XTermTerminal: React.FC<XTermTerminalProps> = ({
  sessionId,
  onData,
  outputData = [],
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      convertEol: true,
      allowProposedApi: true,
      cursorStyle: 'block',
      scrollback: 5000,
      theme: {
        background: '#090d16',
        foreground: '#e2e8f0',
        cursor: '#6366f1',
        selectionBackground: 'rgba(99, 102, 241, 0.3)',
        black: '#000000',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#f8fafc',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    // 1. Replay buffer history or initial banner
    const history = getTerminalBuffer(sessionId);
    if (history) {
      term.write(history);
    } else if (outputData && outputData.length > 0) {
      for (const chunk of outputData) {
        term.write(chunk);
        appendTerminalBuffer(sessionId, chunk);
      }
    }

    // 2. Initial fit with layout stabilization & immediate focus
    const fitAndFocus = () => {
      try {
        fitAddon.fit();
        const cols = term.cols;
        const rows = term.rows;
        if (cols && rows && cols >= 20 && rows >= 5) {
          invoke('pty_resize', { sessionId, cols, rows }).catch((e) => {
            console.error('Failed to set initial PTY size:', e);
          });
        }
        term.focus();
      } catch (err) {
        console.error('Error fitting terminal:', err);
      }
    };

    const initialTimer = setTimeout(fitAndFocus, 50);

    // 3. Direct real-time stream listener for this session
    const unlistenPromise = listen<{ session_id: string; data: string }>('pty_output', (event) => {
      if (event.payload.session_id === sessionId) {
        term.write(event.payload.data);
      }
    });

    term.onData((data) => {
      onDataRef.current(data);
    });

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const fitTerminal = () => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit();
          const cols = xtermRef.current.cols;
          const rows = xtermRef.current.rows;
          if (cols && rows && cols >= 20 && rows >= 5) {
            invoke('pty_resize', { sessionId, cols, rows }).catch((e) => {
              console.error('Failed to resize backend PTY:', e);
            });
          }
        } catch (err) {
          console.error('Resize fit error:', err);
        }
      }
    };

    window.addEventListener('resize', fitTerminal);

    let resizeObserver: ResizeObserver | null = null;
    if (terminalRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(fitTerminal);
      });
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      clearTimeout(initialTimer);
      window.removeEventListener('resize', fitTerminal);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      unlistenPromise.then((unlisten) => unlisten());
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId]);

  return (
    <div
      ref={terminalRef}
      tabIndex={0}
      onClick={() => xtermRef.current?.focus()}
      onFocus={() => xtermRef.current?.focus()}
      className="w-full h-full bg-[#090d16] p-2 rounded-xl border border-slate-800/80 overflow-hidden cursor-text focus:outline-none"
    />
  );
};
