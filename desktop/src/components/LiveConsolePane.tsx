import React, { useState } from 'react';
import {
  Terminal as TerminalIcon,
  X,
  Plus,
  Play,
  Maximize2,
  Minimize2,
  Trash2,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { XTermTerminal } from './XTermTerminal';

export interface PtySession {
  session_id: string;
  runtime_id: string;
  agent_id: string;
  command: string;
  args: string[];
  cwd: string;
  is_alive: boolean;
  outputData: string[];
}

interface LiveConsolePaneProps {
  sessions: PtySession[];
  activeSessionId: string | null;
  currentWorkspace: string;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onSelectSession: (sessionId: string) => void;
  onKillSession: (sessionId: string) => void;
  onSendData: (sessionId: string, data: string) => void;
  onSpawnClaude: (agentId?: string) => void;
  onSpawnGemini: (agentId?: string) => void;
  onSpawnAntigravity?: (agentId?: string) => void;
  onSpawnShell: () => void;
}

export const LiveConsolePane: React.FC<LiveConsolePaneProps> = ({
  sessions,
  activeSessionId,
  currentWorkspace,
  isMaximized,
  onToggleMaximize,
  onSelectSession,
  onKillSession,
  onSendData,
  onSpawnClaude,
  onSpawnGemini,
  onSpawnAntigravity,
  onSpawnShell,
}) => {
  const [showLauncherMenu, setShowLauncherMenu] = useState(false);

  const activeSession = sessions.find((s) => s.session_id === activeSessionId);

  const handleQuickCommand = (cmd: string) => {
    if (!activeSessionId) return;
    onSendData(activeSessionId, `${cmd}\n`);
  };

  return (
    <div className="h-full flex flex-col bg-white border border-white/80 rounded-3xl shadow-mac-soft overflow-hidden select-none transition-all duration-300">
      {/* Terminal Tab Bar & Controls */}
      <div className="bg-slate-100/80 border-b border-slate-200/80 px-4 py-2.5 flex items-center justify-between gap-2 shrink-0">
        {/* Session Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pr-2 max-w-[65%]">
          {sessions.length === 0 ? (
            <span className="text-xs text-slate-400 font-semibold px-1">
              No live PTY sessions active
            </span>
          ) : (
            sessions.map((s) => {
              const active = s.session_id === activeSessionId;
              const isClaude = s.command.includes('claude');
              const isGemini = s.command.includes('gemini');
              const isAntigravity = s.command.includes('antigravity') || s.command.includes('agy');

              return (
                <div
                  key={s.session_id}
                  onClick={() => onSelectSession(s.session_id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 cursor-pointer shrink-0 border ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200/80 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      s.is_alive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'
                    }`}
                  />
                  <span>
                    {isClaude ? '⚡ Claude' : isGemini ? '♊ Gemini' : isAntigravity ? '🔬 Antigravity' : '🖥️ Shell'} ({s.agent_id})
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onKillSession(s.session_id);
                    }}
                    className={`p-0.5 rounded transition ${
                      active
                        ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                        : 'hover:bg-slate-200 text-slate-400 hover:text-slate-700'
                    }`}
                    title="Close session"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Quick Launch Buttons & Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onSpawnClaude('atlas')}
            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer shadow-sm"
            title="Launch Claude Code session"
          >
            <span>Claude</span>
          </button>

          <button
            onClick={() => onSpawnGemini('astra')}
            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer shadow-sm"
            title="Launch Gemini CLI session"
          >
            <span>Gemini</span>
          </button>

          {onSpawnAntigravity && (
            <button
              onClick={() => onSpawnAntigravity('antigravity')}
              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer shadow-sm"
              title="Launch Antigravity QA session"
            >
              <span>Antigravity</span>
            </button>
          )}

          <button
            onClick={onSpawnShell}
            className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer shadow-sm"
            title="Launch Zsh Shell"
          >
            <TerminalIcon className="w-3 h-3 text-slate-500" />
            <span>Shell</span>
          </button>

          <button
            onClick={onToggleMaximize}
            className="p-1.5 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl transition cursor-pointer shadow-sm"
            title={isMaximized ? 'Restore split view' : 'Maximize terminal'}
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Active Session Meta Subheader */}
      {activeSession && (
        <div className="bg-slate-50 border-b border-slate-100 px-4 py-2 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">{activeSession.agent_id}</span>
            <span className="text-slate-300">|</span>
            <span className="font-mono text-[11px] text-slate-500 truncate max-w-[280px]">
              {activeSession.cwd}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {activeSession.is_alive ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                PTY STREAMING
              </span>
            ) : (
              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 font-mono">
                PROCESS EXITED
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Terminal Viewport */}
      <div className="flex-1 p-2 bg-[#090d16] overflow-hidden">
        {activeSession ? (
          <XTermTerminal
            sessionId={activeSession.session_id}
            onData={(data) => onSendData(activeSession.session_id, data)}
            outputData={activeSession.outputData}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400">
              <TerminalIcon className="w-7 h-7" />
            </div>
            <div className="text-sm font-bold text-slate-300">No Terminal Session Open</div>
            <p className="text-xs text-slate-500 max-w-xs text-center">
              Click above to launch a native <strong>Claude Code</strong> or <strong>Gemini CLI</strong> session with direct PTY streaming.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => onSpawnClaude('atlas')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>Launch Claude Code</span>
              </button>
              <button
                onClick={() => onSpawnGemini('astra')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>Launch Gemini CLI</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick PTY Command Bar Footer */}
      {activeSession && activeSession.is_alive && (
        <div className="bg-slate-900 border-t border-slate-800 px-3 py-1.5 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-1 text-[11px] font-mono">
            <span className="text-slate-500 mr-1 font-sans text-[10px] uppercase font-bold tracking-wider">
              Quick Input:
            </span>
            <button
              onClick={() => handleQuickCommand('/compact')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 transition cursor-pointer"
            >
              /compact
            </button>
            <button
              onClick={() => handleQuickCommand('/cost')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 transition cursor-pointer"
            >
              /cost
            </button>
            <button
              onClick={() => handleQuickCommand('git status')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              git status
            </button>
            <button
              onClick={() => handleQuickCommand('npm test')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              npm test
            </button>
          </div>

          <div className="text-[10px] text-slate-500 font-mono">
            Full Bidirectional PTY
          </div>
        </div>
      )}
    </div>
  );
};
