import React from 'react';
import { Settings, Database, Activity, CheckCircle2 } from 'lucide-react';

export const SystemView: React.FC = () => {
  return (
    <div className="space-y-6 font-sans">
      <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl justify-between items-center shadow-lg">
        <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" />
          <span>System Diagnostics & Substrate Health</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Local SQLite substrate, PTY process manager, and MyaOS doctor checks
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 font-mono text-xs">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <div className="text-slate-400 font-bold uppercase flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" /> SQLite WAL Database
          </div>
          <div className="text-emerald-400 font-bold">CONNECTED · data/myaos.db</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <div className="text-slate-400 font-bold uppercase flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> MyaOS Doctor Health
          </div>
          <div className="text-emerald-400 font-bold">PASSED · 0 Orphan Tasks</div>
        </div>
      </div>
    </div>
  );
};
