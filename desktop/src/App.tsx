import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PanelLeft, Sparkles, Code2 } from 'lucide-react';
import { NavigationSidebar, DevViewType, WorkViewType, AppMode } from './components/NavigationSidebar';
import { JulesMissionFlowView } from './views/JulesMissionFlowView';
import { JulesCockpitView } from './views/JulesCockpitView';
import { WorkspaceExplorerView } from './views/WorkspaceExplorerView';
import { DirectChatView } from './views/DirectChatView';
import { TerminalsView } from './views/TerminalsView';
import { AutomationView } from './views/AutomationView';
import { QualityView } from './views/QualityView';
import { TeamOrgChartView } from './views/TeamOrgChartView';
import { ProjectBoardView } from './views/ProjectBoardView';
import { OKRIntelligenceView } from './views/OKRIntelligenceView';
import { DesignStudioView } from './views/DesignStudioView';
import { AgentWorkspaceView } from './views/AgentWorkspaceView';
import { SettingsView } from './views/SettingsView';

// Normal Mode Views
import { HomeView } from './views/normal/HomeView';
import { JobDetailView } from './views/normal/JobDetailView';
import { JobsListView } from './views/normal/JobsListView';
import { CoworkersView } from './views/normal/CoworkersView';
import { ConnectedToolsView } from './views/normal/ConnectedToolsView';
import { ApprovalCenterView } from './views/normal/ApprovalCenterView';
import { RoutinesView } from './views/normal/RoutinesView';
import { ActivityView } from './views/normal/ActivityView';
import { DesignStudioNormalView } from './views/normal/DesignStudioNormalView';

import { FleetDrawer } from './components/FleetDrawer';
import { appendTerminalBuffer, clearTerminalBuffer } from './components/XTermTerminal';
import {
  DEFAULT_COWORKERS,
  DEFAULT_CONNECTED_TOOLS,
  DEFAULT_JOBS,
  DEFAULT_APPROVALS,
  DEFAULT_ROUTINES,
  DEFAULT_SKILLS,
  DEFAULT_ACTIVITIES,
} from './services/normalModeData';
import { Job, Coworker, ConnectedTool, Approval, Routine, Skill, ActivityItem } from './types/normalMode';

export interface PtySession {
  session_id: string;
  runtime_id: string;
  agent_id: string;
  command: string;
  args: string[];
  cwd: string;
  is_alive: boolean;
  outputData: string[];
}

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>('work');
  const [devView, setDevView] = useState<DevViewType>('jules_flow');
  const [workView, setWorkView] = useState<WorkViewType>('home');

  // Normal Mode Data State
  const [jobs, setJobs] = useState<Job[]>(DEFAULT_JOBS);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [coworkers, setCoworkers] = useState<Coworker[]>(DEFAULT_COWORKERS);
  const [connectedTools, setConnectedTools] = useState<ConnectedTool[]>(DEFAULT_CONNECTED_TOOLS);
  const [approvals, setApprovals] = useState<Approval[]>(DEFAULT_APPROVALS);
  const [routines, setRoutines] = useState<Routine[]>(DEFAULT_ROUTINES);
  const [skills, setSkills] = useState<Skill[]>(DEFAULT_SKILLS);
  const [activities, setActivities] = useState<ActivityItem[]>(DEFAULT_ACTIVITIES);

  const [selectedAgentId, setSelectedAgentId] = useState<string>('astra');
  const [summary, setSummary] = useState<any>(null);
  const [identities, setIdentities] = useState<any[]>([]);
  const [adapters, setAdapters] = useState<any[]>([]);
  const [sessions, setSessions] = useState<PtySession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sleepPrevented, setSleepPrevented] = useState(false);
  const [currentWorkspace, setCurrentWorkspace] = useState(
    '/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team'
  );
  const [fleetDrawerOpen, setFleetDrawerOpen] = useState(false);

  // Global keyboard shortcut to toggle navigation sidebar (⌘B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch live MyaOS state via Tauri IPC
  const fetchState = async () => {
    try {
      const sum = await invoke<any>('myaos_get_summary');
      setSummary(sum);

      const ids = await invoke<any[]>('myaos_get_identities');
      setIdentities(ids);

      const adp = await invoke<any[]>('runtime_list_adapters');
      setAdapters(adp);

      const sp = await invoke<boolean>('system_is_sleep_prevented');
      setSleepPrevented(sp);
    } catch (e) {
      console.error('Error fetching MyaOS state:', e);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, []);

  // Listen to native PTY output stream
  useEffect(() => {
    const unlistenOutput = listen<{ session_id: string; data: string }>('pty_output', (event) => {
      const { session_id, data } = event.payload;
      appendTerminalBuffer(session_id, data);
    });

    const unlistenExit = listen<{ session_id: string; exit_code?: number }>('pty_exit', (event) => {
      const { session_id } = event.payload;
      setSessions((prev) =>
        prev.map((s) => (s.session_id === session_id ? { ...s, is_alive: false } : s))
      );
    });

    return () => {
      unlistenOutput.then((f) => f());
      unlistenExit.then((f) => f());
    };
  }, []);

  // Fast Launch Claude Code
  const handleSpawnClaude = async (
    agentId: string = 'atlas',
    cwd?: string,
    resume: boolean = true,
    prompt?: string
  ) => {
    try {
      const targetCwd = cwd || currentWorkspace;
      const info = await invoke<any>('pty_spawn_claude', {
        agentId,
        cwd: targetCwd,
        resume,
        prompt: prompt || null,
      });

      const newSession: PtySession = {
        session_id: info.session_id,
        runtime_id: info.runtime_id,
        agent_id: agentId,
        command: 'claude',
        args: resume ? ['--continue'] : [],
        cwd: info.cwd || targetCwd,
        is_alive: true,
        outputData: [
          `\r\n--- Claude Code Session Launched for ${agentId} (${resume ? 'Resumed latest chat' : 'New session'}) ---\r\n\r\n`,
        ],
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(info.session_id);
    } catch (e: any) {
      alert(`Failed to launch Claude Code: ${e}`);
    }
  };

  // Fast Launch Gemini CLI
  const handleSpawnGemini = async (
    agentId: string = 'astra',
    cwd?: string,
    resume: boolean = true,
    prompt?: string
  ) => {
    try {
      const targetCwd = cwd || currentWorkspace;
      const info = await invoke<any>('pty_spawn_gemini', {
        agentId,
        cwd: targetCwd,
        resume,
        prompt: prompt || null,
      });

      const newSession: PtySession = {
        session_id: info.session_id,
        runtime_id: info.runtime_id,
        agent_id: agentId,
        command: 'gemini',
        args: resume ? ['-r', 'latest'] : [],
        cwd: info.cwd || targetCwd,
        is_alive: true,
        outputData: [
          `\r\n--- Gemini CLI Session Launched for ${agentId} (${resume ? 'Resumed latest chat' : 'New session'}) ---\r\n\r\n`,
        ],
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(info.session_id);
    } catch (e: any) {
      alert(`Failed to launch Gemini CLI: ${e}`);
    }
  };

  // Fast Launch Antigravity QA
  const handleSpawnAntigravity = async (
    agentId: string = 'antigravity',
    cwd?: string,
    resume: boolean = true,
    prompt?: string
  ) => {
    try {
      const targetCwd = cwd || currentWorkspace;
      const info = await invoke<any>('pty_spawn_antigravity', {
        agentId,
        cwd: targetCwd,
        resume,
        prompt: prompt || null,
      });

      const newSession: PtySession = {
        session_id: info.session_id,
        runtime_id: info.runtime_id,
        agent_id: agentId,
        command: 'antigravity',
        args: resume ? ['-r', 'latest'] : [],
        cwd: info.cwd || targetCwd,
        is_alive: true,
        outputData: [
          `\r\n--- Antigravity Session Launched for ${agentId} (${resume ? 'Resumed latest chat' : 'New session'}) ---\r\n\r\n`,
        ],
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(info.session_id);
    } catch (e: any) {
      alert(`Failed to launch Antigravity: ${e}`);
    }
  };

  // Fast Launch System Shell
  const handleSpawnShell = async (cwd?: string) => {
    try {
      const targetCwd = cwd || currentWorkspace;
      const info = await invoke<any>('pty_spawn_shell', {
        cwd: targetCwd,
      });

      const newSession: PtySession = {
        session_id: info.session_id,
        runtime_id: info.runtime_id,
        agent_id: 'system',
        command: 'zsh',
        args: [],
        cwd: info.cwd || targetCwd,
        is_alive: true,
        outputData: [`\r\n--- Interactive Shell Session Launched ---\r\n\r\n`],
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(info.session_id);
    } catch (e: any) {
      alert(`Failed to launch Shell: ${e}`);
    }
  };

  // Generic Adapter Spawn
  const handleSpawnSession = async (agentId: string, runtimeType: string) => {
    if (runtimeType === 'claude_code') {
      return handleSpawnClaude(agentId);
    }
    if (runtimeType === 'gemini_cli') {
      return handleSpawnGemini(agentId);
    }
    if (runtimeType === 'antigravity') {
      return handleSpawnAntigravity(agentId);
    }

    const sessionId = `pty_${agentId}_${Date.now()}`;
    const adapter = adapters.find((a) => a.runtime_type === runtimeType) || adapters[0];
    const command = adapter ? adapter.command : 'claude';
    const args = adapter ? adapter.default_args : [];

    try {
      const info = await invoke<any>('pty_spawn', {
        sessionId,
        runtimeId: `rt_${agentId}_${Date.now()}`,
        agentId,
        projectId: null,
        taskId: null,
        command,
        args,
        cwd: currentWorkspace,
        cols: 100,
        rows: 30,
        env: null,
      });

      const newSession: PtySession = {
        session_id: sessionId,
        runtime_id: info.runtime_id,
        agent_id: agentId,
        command,
        args,
        cwd: currentWorkspace,
        is_alive: true,
        outputData: [`\r\n--- Spawned ${command} PTY session for ${agentId} ---\r\n\r\n`],
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(sessionId);
    } catch (e: any) {
      alert(`Failed to spawn PTY session: ${e}`);
    }
  };

  const handleKillSession = async (sessionId: string) => {
    try {
      await invoke('pty_kill', { sessionId });
      clearTerminalBuffer(sessionId);
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.session_id !== sessionId);
        setActiveSessionId(remaining.length > 0 ? remaining[0].session_id : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendData = async (sessionId: string, data: string) => {
    try {
      await invoke('pty_write', { sessionId, data });
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleSleepPrevention = async () => {
    try {
      if (sleepPrevented) {
        await invoke('system_disable_sleep_prevention');
        setSleepPrevented(false);
      } else {
        await invoke('system_enable_sleep_prevention');
        setSleepPrevented(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleWakeTeam = async () => {
    try {
      await invoke('myaos_wake_all_agents');
      await fetchState();
    } catch (e) {
      console.error('Failed to wake agents:', e);
    }
  };

  const handleSleepTeam = async () => {
    try {
      await invoke('myaos_sleep_all_agents');
      await fetchState();
    } catch (e) {
      console.error('Failed to sleep agents:', e);
    }
  };

  // Normal Mode Job Creators & Action Handlers
  const handleStartNormalJob = (userPrompt: string, coworkerIdPreference?: string) => {
    const assignedCoworker = coworkerIdPreference || 'vela';
    const newJob: Job = {
      id: `job_${Date.now()}`,
      title: userPrompt.length > 50 ? `${userPrompt.slice(0, 50)}...` : userPrompt,
      userPrompt,
      status: 'working',
      progressPercentage: 35,
      assignedCoworkers: [assignedCoworker, 'kael'],
      targetWorkspace: currentWorkspace,
      connectedToolsUsed: ['web_search', 'local_files', 'sqlite_substrate'],
      stages: [
        { id: 's1', stepNumber: 1, label: 'Understanding Request', status: 'completed' },
        { id: 's2', stepNumber: 2, label: 'Coworker Execution', status: 'working' },
        { id: 's3', stepNumber: 3, label: 'Independent Verification', status: 'pending' },
        { id: 's4', stepNumber: 4, label: 'Artifact Delivery', status: 'pending' },
      ],
      humanizedLog: [
        `Assigned ${assignedCoworker.toUpperCase()} and KAEL to task.`,
        'Analyzing parameters and inspecting workspace context.',
        'Executing work pipeline with live substrate logging...',
      ],
      technicalLogs: [
        `pty_spawn_claude agent=${assignedCoworker} prompt="${userPrompt}"`,
        `myaos_log_mission_event event=job.started cwd=${currentWorkspace}`,
      ],
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setJobs((prev) => [newJob, ...prev]);
    setSelectedJobId(newJob.id);
    setWorkView('my_work');

    // Trigger actual background agent execution via PTY CLI
    handleSpawnClaude(assignedCoworker, currentWorkspace, true, userPrompt);
  };

  const handleApproveAction = (approvalId: string) => {
    setApprovals((prev) =>
      prev.map((a) => (a.id === approvalId ? { ...a, status: 'approved' } : a))
    );
    setJobs((prev) =>
      prev.map((j) => {
        if (j.pendingApproval?.id === approvalId) {
          return {
            ...j,
            status: 'completed',
            progressPercentage: 100,
            pendingApproval: { ...j.pendingApproval, status: 'approved' },
          };
        }
        return j;
      })
    );
  };

  const handleDeclineAction = (approvalId: string) => {
    setApprovals((prev) =>
      prev.map((a) => (a.id === approvalId ? { ...a, status: 'declined' } : a))
    );
    setJobs((prev) =>
      prev.map((j) => {
        if (j.pendingApproval?.id === approvalId) {
          return {
            ...j,
            status: 'paused',
            pendingApproval: { ...j.pendingApproval, status: 'declined' },
          };
        }
        return j;
      })
    );
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0];

  return (
    <div className="flex h-screen w-screen bg-[#faf9f6] text-zinc-800 overflow-hidden font-sans select-none">
      <NavigationSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        appMode={appMode}
        onModeChange={setAppMode}
        devView={devView}
        onDevViewSelect={setDevView}
        workView={workView}
        onWorkViewSelect={setWorkView}
        activeSessionsCount={sessions.filter((s) => s.is_alive).length}
        pendingDecisionsCount={summary?.pending_decisions_count || 0}
        pendingApprovalsCount={approvals.filter((a) => a.status === 'pending').length}
        sleepPrevented={sleepPrevented}
        onToggleSleepPrevention={handleToggleSleepPrevention}
        onWakeTeam={handleWakeTeam}
        onSleepTeam={handleSleepTeam}
        currentWorkspace={currentWorkspace}
        onStartNewJob={() => setWorkView('home')}
      />

      <div className="flex-1 flex flex-col h-full min-w-0 bg-[#faf9f6] overflow-hidden">
        {/* Zero-Waste Top Titlebar Row */}
        <div className="h-10 px-3 flex items-center justify-between border-b border-black/[0.05] bg-[#faf9f6]/95 backdrop-blur-md shrink-0 select-none z-30">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <>
                <div className="flex items-center gap-1.5 px-1">
                  <span className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] cursor-pointer hover:brightness-95 transition shadow-2xs" />
                  <span className="w-3 h-3 rounded-full bg-[#febc2e] border-[#d89e24] cursor-pointer hover:brightness-95 transition shadow-2xs" />
                  <span className="w-3 h-3 rounded-full bg-[#28c840] border-[#1aab29] cursor-pointer hover:brightness-95 transition shadow-2xs" />
                </div>

                <button
                  onClick={() => setSidebarOpen(true)}
                  className="w-7 h-7 rounded-lg hover:bg-black/5 text-zinc-500 hover:text-zinc-800 transition flex items-center justify-center cursor-pointer ml-1"
                  title="Open Sidebar (⌘B)"
                >
                  <PanelLeft className="w-4 h-4" />
                </button>

                <div className="h-3 w-px bg-zinc-200 mx-1" />
              </>
            )}

            {/* Titlebar Dual Mode Switcher Pill */}
            <div className="p-0.5 rounded-lg bg-zinc-200/60 flex items-center gap-1">
              <button
                onClick={() => setAppMode('work')}
                className={`py-0.5 px-2 rounded-md text-[10.5px] font-semibold transition flex items-center gap-1 cursor-pointer ${
                  appMode === 'work'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Sparkles className="w-3 h-3 text-indigo-600" />
                <span>Work Mode</span>
              </button>
              <button
                onClick={() => setAppMode('developer')}
                className={`py-0.5 px-2 rounded-md text-[10.5px] font-semibold transition flex items-center gap-1 cursor-pointer ${
                  appMode === 'developer'
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <Code2 className="w-3 h-3" />
                <span>Developer Cockpit</span>
              </button>
            </div>

            <div className="h-3 w-px bg-zinc-200 mx-1" />

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
              <span className="text-zinc-400">MyaOS</span>
              <span className="text-zinc-300">/</span>
              <span className="text-zinc-800 font-semibold capitalize">
                {appMode === 'work' ? workView.replace('_', ' ') : devView.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
            <span>{currentWorkspace.split('/').pop()}</span>
          </div>
        </div>

        {/* Main Content Pane */}
        <main className="flex-1 overflow-y-auto p-4 md:p-5 bg-[#faf9f6]">
          {/* ──────────────────  WORK MODE VIEWS  ────────────────── */}
          {appMode === 'work' && (
            <>
              {workView === 'home' && (
                <HomeView
                  coworkers={coworkers}
                  activeJobs={jobs.filter((j) => j.status !== 'completed')}
                  onStartJob={handleStartNormalJob}
                  onSelectJob={(jobId) => {
                    setSelectedJobId(jobId);
                    setWorkView('my_work');
                  }}
                  onSelectCoworker={(cwId) => {
                    handleStartNormalJob(`Execute task with ${cwId.toUpperCase()}`, cwId);
                  }}
                />
              )}

              {workView === 'design' && (
                <DesignStudioNormalView
                  currentWorkspace={currentWorkspace}
                  onBuildWithMyaOS={(title, html) => {
                    handleStartNormalJob(`Implement verified React component for design '${title}'`, 'astra');
                  }}
                />
              )}

              {workView === 'my_work' && selectedJobId && (
                <JobDetailView
                  job={selectedJob}
                  coworkers={coworkers}
                  onBack={() => setSelectedJobId(null)}
                  onApprove={handleApproveAction}
                  onDecline={handleDeclineAction}
                />
              )}

              {workView === 'my_work' && !selectedJobId && (
                <JobsListView
                  jobs={jobs}
                  onSelectJob={(id) => setSelectedJobId(id)}
                  onStartNewJob={() => setWorkView('home')}
                />
              )}

              {workView === 'coworkers' && (
                <CoworkersView
                  coworkers={coworkers}
                  onStartJobWithCoworker={(cwId) => {
                    handleStartNormalJob(`Execute task with ${cwId.toUpperCase()}`, cwId);
                  }}
                />
              )}

              {workView === 'connected_tools' && (
                <ConnectedToolsView tools={connectedTools} />
              )}

              {workView === 'approvals' && (
                <ApprovalCenterView
                  approvals={approvals}
                  onApprove={handleApproveAction}
                  onDecline={handleDeclineAction}
                />
              )}

              {workView === 'routines' && (
                <RoutinesView
                  routines={routines}
                  skills={skills}
                  coworkers={coworkers}
                  onToggleRoutine={(id) => {
                    setRoutines((prev) =>
                      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
                    );
                  }}
                  onRunRoutineNow={(id) => {
                    const r = routines.find((item) => item.id === id);
                    if (r) handleStartNormalJob(r.prompt, r.coworkerId);
                  }}
                  onCreateRoutine={() => setWorkView('home')}
                />
              )}

              {workView === 'activity' && (
                <ActivityView
                  activities={activities}
                  coworkers={coworkers}
                  onSelectJob={(id) => {
                    setSelectedJobId(id);
                    setWorkView('my_work');
                  }}
                />
              )}
            </>
          )}

          {/* ──────────────────  DEVELOPER MODE VIEWS  ────────────────── */}
          {appMode === 'developer' && (
            <>
              {devView === 'jules_flow' && (
                <JulesMissionFlowView
                  summary={summary}
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  currentWorkspace={currentWorkspace}
                  onWorkspaceChange={setCurrentWorkspace}
                  onSelectSession={setActiveSessionId}
                  onKillSession={handleKillSession}
                  onSendData={handleSendData}
                  onSpawnClaude={handleSpawnClaude}
                  onSpawnGemini={handleSpawnGemini}
                  onSpawnAntigravity={handleSpawnAntigravity}
                  onSpawnShell={handleSpawnShell}
                />
              )}
              {devView === 'jules_cockpit' && (
                <JulesCockpitView
                  summary={summary}
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  currentWorkspace={currentWorkspace}
                  sleepPrevented={sleepPrevented}
                  onToggleSleepPrevention={handleToggleSleepPrevention}
                  onWorkspaceChange={setCurrentWorkspace}
                  onSelectSession={setActiveSessionId}
                  onKillSession={handleKillSession}
                  onSendData={handleSendData}
                  onSpawnClaude={handleSpawnClaude}
                  onSpawnGemini={handleSpawnGemini}
                  onSpawnShell={handleSpawnShell}
                  onWakeTeam={handleWakeTeam}
                  onSleepTeam={handleSleepTeam}
                  onRefreshState={fetchState}
                />
              )}
              {devView === 'team' && (
                <TeamOrgChartView
                  identities={identities}
                  onOpenTerminal={handleSpawnSession}
                  onRefreshIdentities={fetchState}
                  onOpenAgentProfile={(agentId) => {
                    setSelectedAgentId(agentId);
                    setDevView('agent_workspace');
                  }}
                  onLaunchWithPrompt={(agentId, engine, prompt) => {
                    if (engine === 'gemini') {
                      handleSpawnGemini(agentId, currentWorkspace, false, prompt);
                    } else if (engine === 'antigravity') {
                      handleSpawnAntigravity(agentId, currentWorkspace, false, prompt);
                    } else {
                      handleSpawnClaude(agentId, currentWorkspace, false, prompt);
                    }
                    setDevView('terminals');
                  }}
                />
              )}
              {devView === 'agent_workspace' && (
                <AgentWorkspaceView
                  agentId={selectedAgentId}
                  onBack={() => setDevView('team')}
                  onOpenSession={(agentId, runtimeType) => handleSpawnSession(agentId, runtimeType)}
                  activeSessions={sessions}
                  onSendData={handleSendData}
                  onKillSession={handleKillSession}
                />
              )}
              {devView === 'workspace' && (
                <WorkspaceExplorerView
                  currentWorkspace={currentWorkspace}
                  onSelectWorkspace={setCurrentWorkspace}
                  onSpawnClaude={handleSpawnClaude}
                  onSpawnGemini={handleSpawnGemini}
                  onSpawnShell={handleSpawnShell}
                />
              )}
              {devView === 'chat' && (
                <DirectChatView
                  onSpawnClaude={handleSpawnClaude}
                  onSpawnGemini={handleSpawnGemini}
                />
              )}
              {devView === 'projects' && (
                <ProjectBoardView
                  onSpawnClaude={handleSpawnClaude}
                  onSpawnGemini={handleSpawnGemini}
                  onSpawnShell={handleSpawnShell}
                  currentWorkspace={currentWorkspace}
                />
              )}
              {devView === 'okrs' && (
                <OKRIntelligenceView
                  onSpawnClaude={handleSpawnClaude}
                  currentWorkspace={currentWorkspace}
                />
              )}
              {devView === 'design' && <DesignStudioView />}
              {devView === 'quality' && <QualityView />}
              {devView === 'automation' && (
                <AutomationView
                  sleepPrevented={sleepPrevented}
                  onToggleSleepPrevention={handleToggleSleepPrevention}
                  onOpenTerminal={handleSpawnSession}
                />
              )}
              {devView === 'settings' && <SettingsView />}
              {devView === 'terminals' && (
                <TerminalsView
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  adapters={adapters}
                  onSelectSession={setActiveSessionId}
                  onSpawnSession={handleSpawnSession}
                  onKillSession={handleKillSession}
                  onSendData={handleSendData}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Agent Fleet Roster Drawer */}
      <FleetDrawer
        isOpen={fleetDrawerOpen}
        onClose={() => setFleetDrawerOpen(false)}
        identities={identities}
        onLaunchClaudeForAgent={(agentId) => handleSpawnClaude(agentId)}
        onLaunchGeminiForAgent={(agentId) => handleSpawnGemini(agentId)}
        onLaunchAntigravityForAgent={(agentId) => handleSpawnAntigravity(agentId)}
      />
    </div>
  );
}

export default App;
