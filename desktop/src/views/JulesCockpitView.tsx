import React, { useState } from 'react';
import {
  Sun,
  Moon,
  Coffee,
  Activity,
  Layers,
  Users,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { HumanApprovalGate, HumanDecision } from '../components/HumanApprovalGate';
import { IntentBar } from '../components/IntentBar';
import { ActionStream } from '../components/ActionStream';
import { LiveConsolePane, PtySession } from '../components/LiveConsolePane';

interface JulesCockpitViewProps {
  summary: any;
  sessions: PtySession[];
  activeSessionId: string | null;
  currentWorkspace: string;
  sleepPrevented: boolean;
  onToggleSleepPrevention: () => void;
  onWorkspaceChange: (ws: string) => void;
  onSelectSession: (sessionId: string) => void;
  onKillSession: (sessionId: string) => void;
  onSendData: (sessionId: string, data: string) => void;
  onSpawnClaude: (agentId?: string) => void;
  onSpawnGemini: (agentId?: string) => void;
  onSpawnShell: () => void;
  onWakeTeam: () => void;
  onSleepTeam: () => void;
  onRefreshState: () => void;
}

export const JulesCockpitView: React.FC<JulesCockpitViewProps> = ({
  summary,
  sessions,
  activeSessionId,
  currentWorkspace,
  sleepPrevented,
  onToggleSleepPrevention,
  onWorkspaceChange,
  onSelectSession,
  onKillSession,
  onSendData,
  onSpawnClaude,
  onSpawnGemini,
  onSpawnShell,
  onWakeTeam,
  onSleepTeam,
  onRefreshState,
}) => {
  const [activeTask, setActiveTask] = useState<any>(
    summary?.recent_tasks?.[0] || null
  );
  const [viewMode, setViewMode] = useState<'split' | 'stream' | 'console'>('split');

  const pendingDecisions = summary?.pending_decisions || [];
  const recentTasks = summary?.recent_tasks || [];
  const recentEvents = summary?.recent_events || [];
  const totalIdentities = summary?.total_identities || 8;
  const liveIdentities = summary?.live_identities || 6;
  const openTasksCount = summary?.open_tasks || 0;
  const totalEvents = summary?.total_events || 0;

  const handleMissionDispatched = (task: any) => {
    setActiveTask(task);
    onRefreshState();
    if (!activeSessionId) {
      onSpawnClaude(task.assignee_id || 'atlas');
    }
  };

  const handleOpenTerminalForTask = (task: any) => {
    setActiveTask(task);
    onSpawnClaude(task.assignee_id || 'atlas');
    setViewMode('split');
  };

  return (
    <div className="h-full flex flex-col space-y-4 select-none">
      {/* 1. Morning Executive Briefing ("Today at a Glance") */}
      <div className="bg-white border border-white/80 p-5 rounded-3xl shadow-mac-soft transition-all duration-300">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">
                Today Briefing
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
            </div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <span>MyaOS Executive Command Center</span>
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              The autonomous organization is active across your repositories. Currently{' '}
              <strong className="text-slate-800">{liveIdentities} of {totalIdentities}</strong> agents are live,{' '}
              <strong className="text-slate-800">{openTasksCount}</strong> tasks are open, and{' '}
              <strong className={pendingDecisions.length > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                {pendingDecisions.length}
              </strong>{' '}
              human decisions are pending approval.
            </p>
          </div>

          {/* Quick Routine Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onWakeTeam}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Wake Team</span>
            </button>
            <button
              onClick={onSleepTeam}
              className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-2xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
            >
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Sleep Team</span>
            </button>
            <button
              onClick={onToggleSleepPrevention}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95 ${
                sleepPrevented
                  ? 'bg-amber-500 text-white shadow-amber-500/20'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>{sleepPrevented ? 'Mac Awake' : 'Caffeinate'}</span>
            </button>
          </div>
        </div>

        {/* Pulse Bento Mini-Counters */}
        <div className="grid grid-cols-4 gap-3 pt-4 border-t border-slate-100 mt-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-mono font-bold text-slate-400">Agents Live</div>
              <div className="text-sm font-bold font-mono text-slate-800">
                <span className="text-emerald-600">{liveIdentities}</span> / {totalIdentities}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-mono font-bold text-slate-400">Open Tasks</div>
              <div className="text-sm font-bold font-mono text-amber-600">{openTasksCount}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-mono font-bold text-slate-400">Event Stream</div>
              <div className="text-sm font-bold font-mono text-indigo-600">{totalEvents}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
              pendingDecisions.length > 0
                ? 'bg-rose-50 border-rose-200 text-rose-600'
                : 'bg-slate-50 border-slate-100 text-slate-400'
            }`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-mono font-bold text-slate-400">Sign-Offs Needed</div>
              <div className={`text-sm font-bold font-mono ${pendingDecisions.length > 0 ? 'text-rose-600 font-extrabold' : 'text-slate-600'}`}>
                {pendingDecisions.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Google Jules Human Approval Gate (Shows prominently if decisions are pending) */}
      <HumanApprovalGate
        decisions={pendingDecisions}
        onDecisionProcessed={onRefreshState}
      />

      {/* 3. Executive Intent Bar */}
      <IntentBar
        currentWorkspace={currentWorkspace}
        onWorkspaceChange={onWorkspaceChange}
        onMissionDispatched={handleMissionDispatched}
        onQuickLaunchClaude={() => onSpawnClaude('atlas')}
        onQuickLaunchGemini={() => onSpawnGemini('astra')}
        onWakeTeam={onWakeTeam}
      />

      {/* 4. Dual-Pane Cockpit / Split View */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-5">
        {/* Left Column: Mission Stream & Backlog */}
        {(viewMode === 'split' || viewMode === 'stream') && (
          <div
            className={`${
              viewMode === 'split' ? 'col-span-6' : 'col-span-12'
            } h-full overflow-y-auto pr-1`}
          >
            <ActionStream
              activeTask={activeTask}
              recentTasks={recentTasks}
              recentEvents={recentEvents}
              onSelectTask={setActiveTask}
              onOpenTerminalForTask={handleOpenTerminalForTask}
            />
          </div>
        )}

        {/* Right Column: Native Live PTY Console */}
        {(viewMode === 'split' || viewMode === 'console') && (
          <div
            className={`${
              viewMode === 'split' ? 'col-span-6' : 'col-span-12'
            } h-full min-h-[460px]`}
          >
            <LiveConsolePane
              sessions={sessions}
              activeSessionId={activeSessionId}
              currentWorkspace={currentWorkspace}
              isMaximized={viewMode === 'console'}
              onToggleMaximize={() =>
                setViewMode(viewMode === 'console' ? 'split' : 'console')
              }
              onSelectSession={onSelectSession}
              onKillSession={onKillSession}
              onSendData={onSendData}
              onSpawnClaude={onSpawnClaude}
              onSpawnGemini={onSpawnGemini}
              onSpawnShell={onSpawnShell}
            />
          </div>
        )}
      </div>
    </div>
  );
};
