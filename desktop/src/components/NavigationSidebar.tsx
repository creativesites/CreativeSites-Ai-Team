import React from 'react';
import {
  Activity,
  Terminal as TerminalIcon,
  Layers,
  Users,
  Zap,
  ShieldCheck,
  Cpu,
  Clock,
  Settings,
  Flame,
  Radio,
} from 'lucide-react';

export type ViewType =
  | 'command_center'
  | 'terminals'
  | 'work'
  | 'agents'
  | 'automation'
  | 'intelligence'
  | 'quality'
  | 'system';

interface NavigationSidebarProps {
  currentView: ViewType;
  onViewSelect: (view: ViewType) => void;
  activeSessionsCount: number;
  sleepPrevented: boolean;
  onToggleSleepPrevention: () => void;
}

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  currentView,
  onViewSelect,
  activeSessionsCount,
  sleepPrevented,
  onToggleSleepPrevention,
}) => {
  const items: { id: ViewType; label: string; icon: any; badge?: number }[] = [
    { id: 'command_center', label: 'Command Center', icon: Activity },
    { id: 'terminals', label: 'Agent Console / PTY', icon: TerminalIcon, badge: activeSessionsCount },
    { id: 'work', label: 'Work & DAG Graph', icon: Layers },
    { id: 'agents', label: 'Agents & Roles', icon: Users },
    { id: 'automation', label: 'Autonomous Runner', icon: Flame },
    { id: 'intelligence', label: 'Intelligence Layer', icon: Zap },
    { id: 'quality', label: 'Evidence & Quality', icon: ShieldCheck },
    { id: 'system', label: 'System & Diagnostics', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800/80 flex flex-col justify-between p-4 shrink-0 font-sans">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-100 tracking-tight">MyaOS Control Plane</div>
            <div className="text-[10px] text-slate-400 font-mono">v3.0 Native · Desktop</div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewSelect(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      active ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* System Status Footbar */}
      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-[11px]">Sleep Prevention</span>
          <button
            onClick={onToggleSleepPrevention}
            className={`w-7 h-4 rounded-full transition-colors relative cursor-pointer ${
              sleepPrevented ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                sleepPrevented ? 'left-3.5' : 'left-0.5'
              }`}
            />
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span>Local PTY & SQLite Active</span>
        </div>
      </div>
    </aside>
  );
};
