import React, { useState } from 'react';
import {
  Workflow,
  FolderGit2,
  MessageSquare,
  Layers,
  ShieldCheck,
  Flame,
  Terminal as TerminalIcon,
  Cpu,
  Radio,
  Sun,
  Moon,
  Coffee,
  PanelLeftClose,
  Plus,
  Sparkles,
  CheckCircle2,
  Clock,
  ChevronRight,
  SlidersHorizontal,
  Users,
  Target,
  Kanban,
  Settings,
  Palette,
} from 'lucide-react';

export type ViewType =
  | 'jules_flow'
  | 'jules_cockpit'
  | 'team'
  | 'agent_workspace'
  | 'projects'
  | 'okrs'
  | 'design'
  | 'workspace'
  | 'chat'
  | 'quality'
  | 'automation'
  | 'terminals'
  | 'settings';

interface NavigationSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  currentView: ViewType;
  onViewSelect: (view: ViewType) => void;
  activeSessionsCount: number;
  pendingDecisionsCount?: number;
  sleepPrevented: boolean;
  onToggleSleepPrevention: () => void;
  onWakeTeam: () => void;
  onSleepTeam: () => void;
  currentWorkspace?: string;
  onStartNewMission?: () => void;
}

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  isOpen,
  onToggle,
  currentView,
  onViewSelect,
  activeSessionsCount,
  pendingDecisionsCount = 0,
  sleepPrevented,
  onToggleSleepPrevention,
  onWakeTeam,
  onSleepTeam,
  currentWorkspace = '/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team',
  onStartNewMission,
}) => {
  const [showControlsPopover, setShowControlsPopover] = useState(false);

  const items: { id: ViewType; label: string; icon: any; badge?: number; badgeColor?: string }[] = [
    {
      id: 'jules_flow',
      label: 'MyaDesktop Flow',
      icon: Workflow,
    },
    {
      id: 'jules_cockpit',
      label: 'Executive Cockpit',
      icon: Cpu,
      badge: pendingDecisionsCount > 0 ? pendingDecisionsCount : undefined,
      badgeColor: 'bg-rose-500 text-white animate-pulse',
    },
    { id: 'projects', label: 'Project Management', icon: Kanban },
    { id: 'okrs', label: 'Strategic OKRs', icon: Target },
    { id: 'design', label: 'Design Studio', icon: Palette },
    { id: 'team', label: 'Team & Org Chart', icon: Users },
    { id: 'workspace', label: 'Codebases & Repos', icon: FolderGit2 },
    { id: 'terminals', label: 'PTY Hub', icon: TerminalIcon, badge: activeSessionsCount },
    { id: 'chat', label: 'Agent Communication Hub', icon: MessageSquare },
    { id: 'quality', label: 'Quality & Evidence', icon: ShieldCheck },
    { id: 'automation', label: 'Autonomy & Costs', icon: Flame },
    { id: 'settings', label: 'Settings & Secrets', icon: Settings },
  ];

  // Claude-style recent mission thread items
  const recentMissions = [
    { title: 'Chatbot UI Protocol', status: 'verified', agent: 'Astra', time: '10m ago' },
    { title: 'DeployFleet Auth Handoff', status: 'active', agent: 'Iris', time: '25m ago' },
    { title: 'Independent Proof Matrix', status: 'verified', agent: 'Kael', time: '1h ago' },
  ];

  const workspaceShortName = currentWorkspace.split('/').pop() || 'CreativeSites';

  return (
    <aside
      className={`bg-[#f4f3f0] border-r border-[#e8e6e1] flex flex-col justify-between shrink-0 font-sans select-none z-20 transition-all duration-300 ease-in-out ${
        isOpen
          ? 'w-64 opacity-100'
          : 'w-0 opacity-0 pointer-events-none border-none overflow-hidden'
      }`}
    >
      <div className="flex flex-col min-w-[256px] h-full justify-between">
        <div className="flex flex-col space-y-3">
          {/* Top Titlebar Row (40px - Perfectly matches macOS traffic lights baseline) */}
          <div className="h-10 px-3 flex items-center justify-between border-b border-black/[0.04]">
            {/* Native macOS Traffic Lights */}
            <div className="flex items-center gap-1.5 px-1">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] cursor-pointer hover:brightness-95 transition shadow-2xs" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e] border-[#d89e24] cursor-pointer hover:brightness-95 transition shadow-2xs" />
              <span className="w-3 h-3 rounded-full bg-[#28c840] border-[#1aab29] cursor-pointer hover:brightness-95 transition shadow-2xs" />
            </div>

            {/* Compact Zero-Waste Sidebar Toggle */}
            <button
              onClick={onToggle}
              className="w-7 h-7 rounded-lg hover:bg-black/5 text-zinc-400 hover:text-zinc-800 transition flex items-center justify-center cursor-pointer"
              title="Close sidebar (⌘B)"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <div className="px-3 space-y-3">
            {/* Brand Header */}
            <div className="flex items-center justify-between px-1 pt-1">
              <div className="flex items-center gap-2.5">
                <img
                  src="/app-icon.png"
                  alt="MyaOS"
                  className="w-7 h-7 rounded-xl object-cover shadow-2xs ring-1 ring-black/5"
                />
                <div>
                  <div className="text-xs font-bold text-zinc-900 tracking-tight flex items-center gap-1.5">
                    <span>MyaOS Cockpit</span>
                    <span className="text-[9px] font-mono text-zinc-400 bg-black/[0.04] px-1.5 py-0.2 rounded">v1.0</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    MyaDesktop Flow
                  </div>
                </div>
              </div>
            </div>

            {/* Claude Desktop-Style "+ Start new mission" Action Button */}
            <button
              onClick={() => {
                onViewSelect('jules_flow');
                if (onStartNewMission) onStartNewMission();
              }}
              className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all duration-150 cursor-pointer active:scale-[0.98] group"
              title="Start a new mission thread (⌘N)"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-3.5 h-3.5 text-zinc-300 group-hover:rotate-90 transition-transform" />
                <span>Start new mission</span>
              </div>
              <kbd className="text-[9px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.2 rounded border border-zinc-700">
                ⌘N
              </kbd>
            </button>

            {/* Primary Workspace Navigation Views */}
            <div className="space-y-0.5 pt-1">
              <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                Workspace
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                const active = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onViewSelect(item.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-100 cursor-pointer ${
                      active
                        ? 'bg-black/[0.07] text-zinc-950 font-semibold shadow-2xs'
                        : 'text-zinc-600 hover:bg-black/[0.04] hover:text-zinc-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`w-3.5 h-3.5 ${
                          active ? 'text-zinc-950' : 'text-zinc-400'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold ${
                          item.badgeColor
                            ? item.badgeColor
                            : active
                            ? 'bg-zinc-900 text-white'
                            : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Claude Desktop-Style "Recent Missions" List */}
            <div className="space-y-1 pt-2">
              <div className="px-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                <span>Recent Missions</span>
                <span className="text-[9px] text-zinc-400">Swarm</span>
              </div>
              <div className="space-y-0.5">
                {recentMissions.map((m, idx) => (
                  <button
                    key={idx}
                    onClick={() => onViewSelect('jules_flow')}
                    className="w-full px-2.5 py-1.5 rounded-xl text-left text-xs hover:bg-black/[0.04] text-zinc-600 hover:text-zinc-900 transition flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          m.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
                        }`}
                      />
                      <span className="truncate text-[11.5px] font-medium">{m.title}</span>
                    </div>
                    <span className="text-[9px] font-mono text-zinc-400 shrink-0 group-hover:text-zinc-600">
                      {m.agent}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer: Claude Desktop User & Team Control Capsule */}
        <div className="p-3 border-t border-black/[0.05] relative">
          <div className="p-2 bg-white/70 backdrop-blur-md rounded-2xl border border-black/[0.05] shadow-2xs flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs">
                WZ
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-900 truncate leading-tight">
                  Winston Zulu
                </div>
                <div className="text-[10px] text-zinc-400 font-mono truncate leading-tight">
                  {workspaceShortName}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Settings Direct Shortcut */}
              <button
                onClick={() => onViewSelect('settings')}
                className={`p-1.5 rounded-xl hover:bg-black/5 transition cursor-pointer text-zinc-500 hover:text-zinc-900 ${
                  currentView === 'settings' ? 'bg-black/10 text-zinc-900' : ''
                }`}
                title="Settings, Keys & Approvals"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              {/* Quick Controls Toggle Button */}
              <button
                onClick={() => setShowControlsPopover(!showControlsPopover)}
                className={`p-1.5 rounded-xl hover:bg-black/5 transition cursor-pointer text-zinc-500 ${
                  showControlsPopover ? 'bg-black/10 text-zinc-900' : ''
                }`}
                title="System & Sleep Controls"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Clean Controls Popover */}
          {showControlsPopover && (
            <div
              className="absolute bottom-16 left-3 right-3 bg-white/95 backdrop-blur-2xl border border-zinc-200/90 rounded-2xl p-3 shadow-xl z-50 animate-card-entry space-y-2.5"
              onMouseLeave={() => setShowControlsPopover(false)}
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold border-b border-zinc-100 pb-1">
                Substrate & Daemon Controls
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={onWakeTeam}
                  className="px-2.5 py-1.5 bg-zinc-50 hover:bg-emerald-50 text-zinc-700 hover:text-emerald-700 border border-zinc-200/70 rounded-xl text-[11px] font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  title="Wake all team agents"
                >
                  <Sun className="w-3 h-3 text-amber-500" />
                  <span>Wake</span>
                </button>
                <button
                  onClick={onSleepTeam}
                  className="px-2.5 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-800 border border-zinc-200/70 rounded-xl text-[11px] font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  title="Sleep agents"
                >
                  <Moon className="w-3 h-3 text-indigo-400" />
                  <span>Sleep</span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
                <div className="flex items-center gap-1.5 text-zinc-700 font-medium text-[11px]">
                  <Coffee className="w-3 h-3 text-amber-600" />
                  <span>Keep Awake</span>
                </div>
                <button
                  onClick={onToggleSleepPrevention}
                  className={`w-7 h-4 rounded-full transition-colors relative cursor-pointer ${
                    sleepPrevented ? 'bg-emerald-500' : 'bg-zinc-300'
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded-full bg-white absolute top-0.5 shadow-xs transition-transform ${
                      sleepPrevented ? 'left-3.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
