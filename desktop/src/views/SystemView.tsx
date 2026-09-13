import React from 'react';
import { Settings, Database, CheckCircle2 } from 'lucide-react';

export const SystemView: React.FC = () => {
  return (
    <div className="space-y-6 font-sans select-none animate-card-entry">
      <div className="bg-white border border-white/60 p-6 rounded-3xl flex justify-between items-center shadow-mac-soft">
        <div>
          <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-500 animate-pulse" />
            <span>System Diagnostics & Substrate Health</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Local SQLite substrate, PTY process manager, and MyaOS doctor checks
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 font-mono text-xs">
        {/* Card 1 */}
        <div className="p-5 bg-white border border-white/60 rounded-3xl space-y-2 shadow-mac-soft hover:shadow-mac-deep hover:-translate-y-0.5 transition-all duration-300">
          <div className="text-slate-500 font-bold uppercase flex items-center gap-2 tracking-wider text-[10px]">
            <Database className="w-4.5 h-4.5 text-indigo-500 bg-indigo-50 p-0.5 rounded" /> SQLite WAL Database
          </div>
          <div className="text-emerald-600 font-extrabold text-xs pt-1">CONNECTED · data/myaos.db</div>
        </div>

        {/* Card 2 */}
        <div className="p-5 bg-white border border-white/60 rounded-3xl space-y-2 shadow-mac-soft hover:shadow-mac-deep hover:-translate-y-0.5 transition-all duration-300">
          <div className="text-slate-500 font-bold uppercase flex items-center gap-2 tracking-wider text-[10px]">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 bg-emerald-50 p-0.5 rounded" /> MyaOS Doctor Health
          </div>
          <div className="text-emerald-600 font-extrabold text-xs pt-1">PASSED · 0 Orphan Tasks</div>
        </div>
      </div>
    </div>
  );
};
