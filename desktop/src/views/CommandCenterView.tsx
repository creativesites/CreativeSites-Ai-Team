import React from 'react';
import { Activity, Layers, Users, Zap, ShieldCheck, Terminal as TerminalIcon, ArrowUpRight } from 'lucide-react';

interface CommandCenterViewProps {
  summary: any;
  onOpenTerminal: (agentId: string, runtimeType: string) => void;
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({ summary, onOpenTerminal }) => {
  const { total_identities, live_identities, open_tasks, total_events, recent_tasks, recent_events } = summary || {};

  return (
    <div className="space-y-6 select-none animate-card-entry">
      {/* Operations Room Header */}
      <div className="bg-white border border-white/60 p-6 rounded-3xl flex justify-between items-center shadow-mac-soft">
        <div>
          <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500 animate-pulse" />
            <span>MyaOS Operations Room</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Human Control Plane & Real-Time Agent Runtime Supervisor
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onOpenTerminal('atlas', 'claude_code')}
            className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-2xl text-xs font-semibold tracking-tight transition-all duration-300 flex items-center gap-1.5 cursor-pointer shadow-mac-bevel shadow-indigo-500/10 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
          >
            <TerminalIcon className="w-4 h-4" />
            <span>Launch Claude Code PTY</span>
          </button>
        </div>
      </div>

      {/* Bento Pulse Metrics Grid */}
      <div className="grid grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-5 rounded-3xl border border-white/60 space-y-1 shadow-mac-soft hover:shadow-mac-deep hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300">
          <div className="flex justify-between items-center text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Agents Liveness</span>
            <Users className="w-4.5 h-4.5 text-emerald-500 bg-emerald-50 p-1 rounded-lg" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-800 pt-1 flex items-baseline gap-1">
            <span className="text-emerald-500">{live_identities || 6}</span>
            <span className="text-slate-400 text-xs font-semibold">/ {total_identities || 8} live</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-5 rounded-3xl border border-white/60 space-y-1 shadow-mac-soft hover:shadow-mac-deep hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300">
          <div className="flex justify-between items-center text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Open Tasks</span>
            <Layers className="w-4.5 h-4.5 text-amber-500 bg-amber-50 p-1 rounded-lg" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-500 pt-1">
            {open_tasks || 12}
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-5 rounded-3xl border border-white/60 space-y-1 shadow-mac-soft hover:shadow-mac-deep hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300">
          <div className="flex justify-between items-center text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Event Stream</span>
            <Zap className="w-4.5 h-4.5 text-indigo-500 bg-indigo-50 p-1 rounded-lg animate-pulse" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-600 pt-1">
            {total_events || 42}
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-5 rounded-3xl border border-white/60 space-y-1 shadow-mac-soft hover:shadow-mac-deep hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300">
          <div className="flex justify-between items-center text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Verification Rate</span>
            <ShieldCheck className="w-4.5 h-4.5 text-emerald-500 bg-emerald-50 p-1 rounded-lg" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 pt-1 flex items-baseline gap-1">
            <span>100%</span>
            <span className="text-slate-400 text-[10px] font-semibold font-sans">(31/31 proofs)</span>
          </div>
        </div>
      </div>

      {/* Main Split View: Active Work & Real-Time Event Bus */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column (7 cols): Tasks Queue */}
        <div className="col-span-7 bg-white border border-white/60 p-6 rounded-3xl space-y-4 shadow-mac-soft">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h2 className="text-[14px] font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              <span>Active Work & Tasks Queue</span>
            </h2>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">SQLite State</span>
          </div>

          <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
            {recent_tasks && recent_tasks.length > 0 ? (
              recent_tasks.map((t: any) => (
                <div
                  key={t.id}
                  className="p-3.5 bg-slate-50/50 border border-slate-100 rounded-2xl flex items-center justify-between text-xs hover:border-slate-200 hover:bg-slate-50 transition duration-300 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                        {t.id}
                      </span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-lg uppercase tracking-wider bg-slate-200 text-slate-600">
                        {t.priority || 'medium'}
                      </span>
                    </div>
                    <div className="font-bold text-slate-700">{t.title}</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                      {t.status || 'open'}
                    </span>
                    <button
                      onClick={() => onOpenTerminal(t.assignee_id || 'atlas', 'claude_code')}
                      className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-xl transition cursor-pointer shadow-sm"
                      title="Launch Terminal Session for Task"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400 font-mono text-xs">No active tasks in queue.</div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Live Event Bus */}
        <div className="col-span-5 bg-white border border-white/60 p-6 rounded-3xl space-y-4 shadow-mac-soft">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h2 className="text-[14px] font-bold text-slate-800 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              <span>Live Operational Event Bus</span>
            </h2>
            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Stream
            </span>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 font-mono text-[11px]">
            {recent_events && recent_events.length > 0 ? (
              recent_events.map((evt: any) => (
                <div
                  key={evt.id}
                  className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl space-y-1.5 text-slate-600"
                >
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span className="font-bold text-indigo-500 uppercase">{evt.event_type}</span>
                    <span className="font-semibold">{evt.ts?.split('T')[1]?.slice(0, 8) || evt.ts}</span>
                  </div>
                  <div className="text-slate-600 line-clamp-2 leading-relaxed">
                    Sender: <strong className="text-slate-800">{evt.sender}</strong> {evt.task_id ? `(${evt.task_id})` : ''}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400 font-mono text-xs">Waiting for live system events...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
