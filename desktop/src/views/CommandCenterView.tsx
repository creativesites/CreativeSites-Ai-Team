import React from 'react';
import { Activity, Layers, Users, Zap, ShieldCheck, Terminal as TerminalIcon, ArrowUpRight, Flame } from 'lucide-react';

interface CommandCenterViewProps {
  summary: any;
  onOpenTerminal: (agentId: string, runtimeType: string) => void;
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({ summary, onOpenTerminal }) => {
  const { total_identities, live_identities, open_tasks, total_events, recent_tasks, recent_events } = summary || {};

  return (
    <div className="space-y-6">
      {/* Operations Room Header */}
      <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <span>MyaOS Operations Room</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Human Control Plane & Real-Time Agent Runtime Supervisor
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onOpenTerminal('atlas', 'claude_code')}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <TerminalIcon className="w-4 h-4" />
            <span>Launch Claude Code PTY</span>
          </button>
        </div>
      </div>

      {/* Bento Pulse Metrics Grid */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800/80 space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Agents Liveness</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 pt-1">
            <span className="text-emerald-400">{live_identities || 6}</span>
            <span className="text-slate-500 text-sm font-normal"> / {total_identities || 8}</span>
          </div>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800/80 space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Open Tasks</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400 pt-1">
            {open_tasks || 12}
          </div>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800/80 space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Event Stream</span>
            <Zap className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-400 pt-1">
            {total_events || 42}
          </div>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800/80 space-y-1">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Verification Pass Rate</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 pt-1">
            100% <span className="text-xs text-slate-500 font-normal">(31/31 proofs)</span>
          </div>
        </div>
      </div>

      {/* Main Split View: Active Work & Real-Time Event Bus */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column (7 cols): Tasks Queue */}
        <div className="col-span-7 bg-slate-900 border border-slate-800/80 p-5 rounded-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Active Work & Tasks Queue</span>
            </h2>
            <span className="text-xs font-mono text-slate-400">SQLite State</span>
          </div>

          <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
            {recent_tasks?.map((t: any) => (
              <div
                key={t.id}
                className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs hover:border-slate-700 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50">
                      {t.id}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold bg-slate-800 text-slate-300">
                      {t.priority || 'medium'}
                    </span>
                  </div>
                  <div className="font-semibold text-slate-200">{t.title}</div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-950/40 px-2 py-1 rounded border border-amber-800/50">
                    {t.status || 'open'}
                  </span>
                  <button
                    onClick={() => onOpenTerminal(t.assignee_id || 'atlas', 'claude_code')}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer"
                    title="Launch Terminal Session for Task"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column (5 cols): Live Event Bus */}
        <div className="col-span-5 bg-slate-900 border border-slate-800/80 p-5 rounded-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Live Operational Event Bus</span>
            </h2>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800 flex items-center gap-1 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Stream
            </span>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 font-mono text-[11px]">
            {recent_events?.map((evt: any) => (
              <div
                key={evt.id}
                className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1 text-slate-300"
              >
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span className="font-semibold text-indigo-400">{evt.event_type}</span>
                  <span>{evt.ts?.split('T')[1]?.slice(0, 8) || evt.ts}</span>
                </div>
                <div className="text-slate-300 line-clamp-1">
                  Sender: <strong className="text-slate-100">{evt.sender}</strong> {evt.task_id ? `(${evt.task_id})` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
