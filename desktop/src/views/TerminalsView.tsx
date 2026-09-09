import React, { useState } from 'react';
import { Terminal as TerminalIcon, Plus, X, Play, Cpu, ShieldCheck } from 'lucide-react';
import { XTermTerminal } from '../components/XTermTerminal';

interface PtySession {
  session_id: String;
  runtime_id: String;
  agent_id: String;
  command: String;
  args: String[];
  cwd: String;
  is_alive: boolean;
  outputData: String[];
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
    <div className="h-[calc(100vh-2rem)] flex flex-col space-y-4 font-sans">
      {/* Top Session Bar & Spawner Controls */}
      <div className="bg-slate-900 border border-slate-800/80 p-3 rounded-2xl flex items-center justify-between shrink-0 shadow-md">
        {/* Session Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pr-2">
          {sessions.length === 0 ? (
            <span className="text-xs text-slate-500 font-mono px-2">No active PTY sessions spawned.</span>
          ) : (
            sessions.map((s) => {
              const active = s.session_id === activeSessionId;
              return (
                <div
                  key={s.session_id as string}
                  onClick={() => onSelectSession(s.session_id as string)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition cursor-pointer shrink-0 border ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <TerminalIcon className="w-3.5 h-3.5" />
                  <span>{s.agent_id} ({s.command})</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onKillSession(s.session_id as string);
                    }}
                    className="p-0.5 hover:bg-slate-700/80 rounded transition text-slate-300 hover:text-white"
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
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-200 focus:outline-none font-mono"
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
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-200 focus:outline-none font-mono"
          >
            {adapters.map((a) => (
              <option key={a.runtime_type} value={a.runtime_type}>
                {a.display_name}
              </option>
            ))}
          </select>

          <button
            onClick={() => onSpawnSession(selectedAgent, selectedAdapter)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Spawn PTY</span>
          </button>
        </div>
      </div>

      {/* Main Terminal Viewport */}
      <div className="flex-1 bg-slate-900 border border-slate-800/80 p-3 rounded-2xl flex flex-col overflow-hidden shadow-lg">
        {activeSession ? (
          <div className="w-full h-full flex flex-col space-y-2">
            <div className="flex justify-between items-center text-xs text-slate-400 font-mono px-1">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-slate-200">{activeSession.agent_id}</span>
                <span>·</span>
                <span>Command: {activeSession.command} {activeSession.args.join(' ')}</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>PTY ALIVE</span>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <XTermTerminal
                sessionId={activeSession.session_id as string}
                onData={(data) => onSendData(activeSession.session_id as string, data)}
                outputData={activeSession.outputData as string[]}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-3 font-mono">
            <TerminalIcon className="w-12 h-12 text-slate-700" />
            <div className="text-sm font-semibold text-slate-400">No Terminal Session Selected</div>
            <p className="text-xs text-slate-600">Select an active session tab above or spawn a new agent PTY</p>
          </div>
        )}
      </div>
    </div>
  );
};
