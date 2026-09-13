import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PanelLeft } from 'lucide-react';
import { NavigationSidebar, ViewType } from './components/NavigationSidebar';
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
import { FleetDrawer } from './components/FleetDrawer';
import { appendTerminalBuffer, clearTerminalBuffer } from './components/XTermTerminal';

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
  const [currentView, setCurrentView] = useState<ViewType>('jules_flow');
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

  // Global keyboard shortcut to toggle navigation sidebar (⌘B / Ctrl+B)
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

  // Listen to native PTY output stream - buffered directly without triggering React re-render choke
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

  // Generic Adapter Spawn (backward compatible for TerminalsView)
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

  return (
    <div className="flex h-screen w-screen bg-[#faf9f6] text-zinc-800 overflow-hidden font-sans">
      <NavigationSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        currentView={currentView}
        onViewSelect={(v) => setCurrentView(v)}
        activeSessionsCount={sessions.filter((s) => s.is_alive).length}
        pendingDecisionsCount={summary?.pending_decisions_count || 0}
        sleepPrevented={sleepPrevented}
        onToggleSleepPrevention={handleToggleSleepPrevention}
        onWakeTeam={handleWakeTeam}
        onSleepTeam={handleSleepTeam}
        currentWorkspace={currentWorkspace}
      />

      <div className="flex-1 flex flex-col h-full min-w-0 bg-[#faf9f6] overflow-hidden">
        {/* Zero-Waste Top Titlebar Row (Active when sidebar is closed) */}
        {!sidebarOpen && (
          <div className="h-10 px-3 flex items-center justify-between border-b border-black/[0.05] bg-[#faf9f6]/95 backdrop-blur-md shrink-0 select-none z-30">
            <div className="flex items-center gap-2">
              {/* Native macOS Traffic Lights */}
              <div className="flex items-center gap-1.5 px-1">
                <span className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] cursor-pointer hover:brightness-95 transition shadow-2xs" />
                <span className="w-3 h-3 rounded-full bg-[#febc2e] border-[#d89e24] cursor-pointer hover:brightness-95 transition shadow-2xs" />
                <span className="w-3 h-3 rounded-full bg-[#28c840] border-[#1aab29] cursor-pointer hover:brightness-95 transition shadow-2xs" />
              </div>

              {/* Minimalist Sidebar Toggle (Zero App Space Taken) */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="w-7 h-7 rounded-lg hover:bg-black/5 text-zinc-500 hover:text-zinc-800 transition flex items-center justify-center cursor-pointer ml-1"
                title="Open Sidebar (⌘B)"
              >
                <PanelLeft className="w-4 h-4" />
              </button>

              <div className="h-3 w-px bg-zinc-200 mx-1" />

              {/* Minimalist Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                <span className="text-zinc-400">MyaOS</span>
                <span className="text-zinc-300">/</span>
                <span className="text-zinc-800 font-semibold">
                  {currentView === 'jules_flow'
                    ? 'MyaDesktop Flow'
                    : currentView === 'jules_cockpit'
                    ? 'Executive Cockpit'
                    : currentView === 'team'
                    ? 'Team & Org Chart'
                    : currentView === 'agent_workspace'
                    ? `Agent Workspace (@${selectedAgentId})`
                    : currentView === 'projects'
                    ? 'Projects & Tasks'
                    : currentView === 'okrs'
                    ? 'Strategic OKRs'
                    : currentView === 'workspace'
                    ? 'Codebases & Repos'
                    : currentView === 'chat'
                    ? 'Agent Communication Hub'
                    : currentView === 'quality'
                    ? 'Quality & Evidence'
                    : currentView === 'automation'
                    ? 'Autonomy & Costs'
                    : currentView === 'settings'
                    ? 'Settings & Substrate Governance'
                    : 'PTY Hub'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
              <span>{currentWorkspace.split('/').pop()}</span>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-5 bg-[#faf9f6]">
        {currentView === 'jules_flow' && (
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
        {currentView === 'jules_cockpit' && (
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
        {currentView === 'team' && (
          <TeamOrgChartView
            identities={identities}
            onOpenTerminal={handleSpawnSession}
            onRefreshIdentities={fetchState}
            onOpenAgentProfile={(agentId) => {
              setSelectedAgentId(agentId);
              setCurrentView('agent_workspace');
            }}
            onLaunchWithPrompt={(agentId, engine, prompt) => {
              if (engine === 'gemini') {
                handleSpawnGemini(agentId, currentWorkspace, false, prompt);
              } else if (engine === 'antigravity') {
                handleSpawnAntigravity(agentId, currentWorkspace, false, prompt);
              } else {
                handleSpawnClaude(agentId, currentWorkspace, false, prompt);
              }
              setCurrentView('terminals');
            }}
          />
        )}
        {currentView === 'agent_workspace' && (
          <AgentWorkspaceView
            agentId={selectedAgentId}
            onBack={() => setCurrentView('team')}
            onOpenSession={(agentId, runtimeType) => handleSpawnSession(agentId, runtimeType)}
            activeSessions={sessions}
            onSendData={handleSendData}
            onKillSession={handleKillSession}
          />
        )}
        {currentView === 'workspace' && (
          <WorkspaceExplorerView
            currentWorkspace={currentWorkspace}
            onSelectWorkspace={setCurrentWorkspace}
            onSpawnClaude={handleSpawnClaude}
            onSpawnGemini={handleSpawnGemini}
            onSpawnShell={handleSpawnShell}
          />
        )}
        {currentView === 'chat' && (
          <DirectChatView
            onSpawnClaude={handleSpawnClaude}
            onSpawnGemini={handleSpawnGemini}
          />
        )}
        {currentView === 'projects' && (
          <ProjectBoardView
            onSpawnClaude={handleSpawnClaude}
            onSpawnGemini={handleSpawnGemini}
            onSpawnShell={handleSpawnShell}
            currentWorkspace={currentWorkspace}
          />
        )}
        {currentView === 'okrs' && (
          <OKRIntelligenceView
            onSpawnClaude={handleSpawnClaude}
            currentWorkspace={currentWorkspace}
          />
        )}
        {currentView === 'design' && <DesignStudioView />}
        {currentView === 'quality' && <QualityView />}
        {currentView === 'automation' && (
          <AutomationView
            sleepPrevented={sleepPrevented}
            onToggleSleepPrevention={handleToggleSleepPrevention}
            onOpenTerminal={handleSpawnSession}
          />
        )}
        {currentView === 'settings' && <SettingsView />}
        {currentView === 'terminals' && (
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
