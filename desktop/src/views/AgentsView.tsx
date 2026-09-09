import React from 'react';
import { Users, Cpu, ShieldCheck, Terminal as TerminalIcon, Radio } from 'lucide-react';

interface AgentsViewProps {
  identities: any[];
  onOpenTerminal: (agentId: string, runtimeType: string) => void;
}

export const AgentsView: React.FC<AgentsViewProps> = ({ identities, onOpenTerminal }) => {
  return (
    <div className="space-y-6 font-sans">
      <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <span>Agent Roster & Role Coverage</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Fluid identity model decoupling persistent identity from dynamic execution roles
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {identities?.map((id) => (
          <div
            key={id.id}
            className="p-4 bg-slate-900 border border-slate-800/80 rounded-2xl space-y-3 hover:border-slate-700 transition"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-indigo-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>{id.display_name}</span>
                    <span className="text-xs font-mono text-slate-500 font-normal">({id.id})</span>
                  </div>
                  <div className="text-xs text-slate-400">{id.primary_domain || 'Platform & Infrastructure'}</div>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase ${
                  id.observed_liveness === 'LIVE'
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {id.observed_liveness || 'LIVE'}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-800/60 text-xs font-mono">
              <span className="text-slate-400">Lane: <strong className="text-slate-200">{id.lane || 'engineering'}</strong></span>
              <button
                onClick={() => onOpenTerminal(id.id, 'claude_code')}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition cursor-pointer flex items-center gap-1 font-sans"
              >
                <TerminalIcon className="w-3.5 h-3.5" />
                <span>Console</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
