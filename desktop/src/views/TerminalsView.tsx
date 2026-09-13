import React, { useState } from 'react';
import { Terminal as TerminalIcon, X, Play, Cpu } from 'lucide-react';
import { XTermTerminal } from '../components/XTermTerminal';

interface PtySession {
  session_id: string;
  runtime_id: string;
  agent_id: string;
  command: string;
  args: string[];
  cwd: string;
  is_alive: boolean;
  outputData: string[];
}

interface TerminalsViewProps {
  sessions: PtySession[];
  activeSessionId: string | null;
  adapters: any[];
  onSelectSession: (sessionId: string) => void;
  onSpawnSession: (agentId: string, runtimeType: string) => void;
  onKillSession: (sessionId: string) => void;
  onSendData: (sessionId: string, data: string) => void;
}

export const TerminalsView: React.FC<TerminalsViewProps> = ({
  sessions,
  activeSessionId,
  adapters,
  onSelectSession,
  onSpawnSession,
  onKillSession,
  onSendData,
}) => {
  const [selectedAgent, setSelectedAgent] = useState('atlas');
  const [selectedAdapter, setSelectedAdapter] = useState('claude_code');

  const activeSession = sessions.find((s) => s.session_id === activeSessionId);

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col space-y-4 font-sans select-none animate-card-entry">
      {/* Top Session Bar & Spawner Controls */}
      <div className="bg-white border border-white/60 p-4 rounded-3xl flex items-center justify-between shrink-0 shadow-mac-soft">
        {/* Session Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pr-2">
          {sessions.length === 0 ? (
            <span className="text-xs text-slate-400 font-semibold px-2">No active PTY sessions spawned.</span>
          ) : (
            sessions.map((s) => {
              const active = s.session_id === activeSessionId;
              return (
                <div
                  key={s.session_id}
                  onClick={() => onSelectSession(s.session_id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl text-xs font-mono font-bold transition-all duration-300 cursor-pointer shrink-0 border ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200/60 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  <TerminalIcon className="w-3.5 h-3.5" />
                  <span>{s.agent_id} ({s.command})</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onKillSession(s.session_id);
                    }}
                    className={`p-0.5 rounded transition ${
                      active ? 'hover:bg-indigo-700 text-indigo-200 hover:text-white' : 'hover:bg-slate-200 text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Quick Launch Agent Session Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="bg-slate-50 border border-slate-200/80 rounded-2xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer hover:bg-slate-100 transition shadow-sm"
          >
            <option value="atlas">Atlas (Coordinator)</option>
            <option value="astra">Astra (AI Lead)</option>
            <option value="vela">Vela (WordPress)</option>
            <option value="iris">Iris (Observer)</option>
            <option value="kael">Kael (QA)</option>
            <option value="lyra">Lyra (Mobile)</option>
            <option value="nexus">Nexus (Runtime)</option>
          </select>

          <select
            value={selectedAdapter}
            onChange={(e) => setSelectedAdapter(e.target.value)}
            className="bg-slate-50 border border-slate-200/80 rounded-2xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer hover:bg-slate-100 transition shadow-sm"
          >
            {adapters.map((a) => (
              <option key={a.runtime_type} value={a.runtime_type}>
                {a.display_name}
              </option>
            ))}
          </select>

          <button
            onClick={() => onSpawnSession(selectedAgent, selectedAdapter)}
            className="px-4 py-1.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-2xl text-xs font-bold transition-all duration-300 flex items-center gap-1.5 cursor-pointer shadow-mac-bevel shadow-indigo-500/10 hover:shadow-md hover:-translate-y-0.5"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Spawn PTY</span>
          </button>
        </div>
      </div>

      {/* Main Terminal Viewport (macOS Glass Window Frame) */}
      <div className="flex-1 bg-white border border-white/60 p-4 rounded-3xl flex flex-col overflow-hidden shadow-mac-deep">
        {activeSession ? (
          <div className="w-full h-full flex flex-col space-y-3">
            {/* macOS Style Internal App Titlebar */}
            <div className="flex justify-between items-center text-xs font-semibold text-slate-500 border-b border-slate-100 pb-2.5 px-1 shrink-0">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-500 bg-indigo-50 p-0.5 rounded-lg" />
                <span className="font-bold text-slate-800">{activeSession.agent_id} console</span>
                <span className="text-slate-300 font-light">|</span>
                <span className="text-slate-400 font-mono text-[11px] font-medium">CWD: {activeSession.cwd}</span>
              </div>
              {activeSession.is_alive ? (
                <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>PTY LIVE</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span>PTY EXITED</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-hidden rounded-2xl border border-slate-900 shadow-inner">
              <XTermTerminal
                sessionId={activeSession.session_id}
                onData={(data) => onSendData(activeSession.session_id, data)}
                outputData={activeSession.outputData}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shadow-inner animate-pulse">
              <TerminalIcon className="w-8 h-8" />
            </div>
            <div className="text-sm font-bold text-slate-600">No Terminal Session Selected</div>
            <p className="text-xs text-slate-400 font-medium">Select an active session tab above or spawn a new agent PTY</p>
          </div>
        )}
      </div>
    </div>
  );
};
