import React from 'react';
import { Users, Cpu, Terminal as TerminalIcon } from 'lucide-react';

interface AgentsViewProps {
  identities: any[];
  onOpenTerminal: (agentId: string, runtimeType: string) => void;
}

export const AgentsView: React.FC<AgentsViewProps> = ({ identities, onOpenTerminal }) => {
  return (
    <div className="space-y-6 font-sans select-none animate-card-entry">
      <div className="bg-white border border-white/60 p-6 rounded-3xl flex justify-between items-center shadow-mac-soft">
        <div>
          <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            <span>Agent Roster & Role Coverage</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Fluid identity model decoupling persistent identity from dynamic execution roles
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {identities && identities.length > 0 ? (
          identities.map((id) => (
            <div
              key={id.id}
              className="p-5 bg-white border border-white/60 rounded-3xl space-y-4 shadow-mac-soft hover:shadow-mac-deep hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 shadow-sm">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[14px] font-bold text-slate-800 flex items-center gap-2">
                      <span>{id.display_name}</span>
                      <span className="text-xs font-mono text-slate-400 font-normal">({id.id})</span>
                    </div>
                    <div className="text-xs text-slate-500 font-medium">{id.primary_domain || 'Platform & Infrastructure'}</div>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    id.observed_liveness === 'LIVE'
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                >
                  {id.observed_liveness || 'LIVE'}
                </span>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-100 text-xs font-mono">
                <span className="text-slate-500 font-medium">Lane: <strong className="text-slate-800 font-bold">{id.lane || 'engineering'}</strong></span>
                <button
                  onClick={() => onOpenTerminal(id.id, 'claude_code')}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all duration-300 flex items-center gap-1.5 cursor-pointer shadow-mac-bevel shadow-indigo-500/10 hover:shadow-md"
                >
                  <TerminalIcon className="w-3.5 h-3.5" />
                  <span className="font-sans">Console</span>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-2 text-center py-12 text-slate-400 font-mono text-xs">No agents loaded from database.</div>
        )}
      </div>
    </div>
  );
};
