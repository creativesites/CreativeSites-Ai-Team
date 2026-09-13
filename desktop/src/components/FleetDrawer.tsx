import React from 'react';
import { X, Users, Terminal, Zap, ShieldCheck, Activity, Cpu } from 'lucide-react';

interface Identity {
  id: string;
  display_name: string;
  symbol?: string | null;
  primary_domain?: string | null;
  lane?: string | null;
  observed_liveness?: string | null;
  is_active: number;
}

interface FleetDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  identities: Identity[];
  onLaunchClaudeForAgent: (agentId: string) => void;
  onLaunchGeminiForAgent: (agentId: string) => void;
  onLaunchAntigravityForAgent?: (agentId: string) => void;
}

export const FleetDrawer: React.FC<FleetDrawerProps> = ({
  isOpen,
  onClose,
  identities,
  onLaunchClaudeForAgent,
  onLaunchGeminiForAgent,
  onLaunchAntigravityForAgent,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-card-entry select-none">
      <div className="bg-white border border-white/80 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Agent Fleet Roster</h2>
              <p className="text-xs text-slate-500">
                Active identities and native runtime engines in MyaOS substrate
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-2xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-3">
          {identities.map((agent) => {
            const isLive = agent.observed_liveness === 'LIVE';
            return (
              <div
                key={agent.id}
                className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 font-bold font-mono text-sm shadow-sm">
                    {agent.symbol || agent.display_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">
                        {agent.display_name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">@{agent.id}</span>
                      <span
                        className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                          isLive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {agent.observed_liveness || 'UNKNOWN'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{agent.primary_domain}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onLaunchClaudeForAgent(agent.id);
                      onClose();
                    }}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Claude</span>
                  </button>

                  <button
                    onClick={() => {
                      onLaunchGeminiForAgent(agent.id);
                      onClose();
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    <span>Gemini</span>
                  </button>

                  {onLaunchAntigravityForAgent && (
                    <button
                      onClick={() => {
                        onLaunchAntigravityForAgent(agent.id);
                        onClose();
                      }}
                      className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/60 rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer shadow-sm"
                    >
                      <span>Antigravity</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
