import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { NavigationSidebar, ViewType } from './components/NavigationSidebar';
import { CommandCenterView } from './views/CommandCenterView';
import { TerminalsView } from './views/TerminalsView';
import { WorkView } from './views/WorkView';
import { AgentsView } from './views/AgentsView';
import { AutomationView } from './views/AutomationView';
import { IntelligenceView } from './views/IntelligenceView';
import { QualityView } from './views/QualityView';
import { SystemView } from './views/SystemView';

interface PtySession {
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
  const [currentView, setCurrentView] = useState<ViewType>('command_center');
  const [summary, setSummary] = useState<any>(null);
  const [identities, setIdentities] = useState<any[]>([]);
  const [adapters, setAdapters] = useState<any[]>([]);
  const [sessions, setSessions] = useState<PtySession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sleepPrevented, setSleepPrevented] = useState(false);

  // Fetch live MyaOS state via Tauri IPC
  const fetchState = async () => {
    try {
      const sum = await invoke('myaos_get_summary');
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
      setSessions((prev) =>
        prev.map((s) => {
          if (s.session_id === session_id) {
            return {
              ...s,
              outputData: [...(s.outputData || []), data],
            };
          }
          return s;
        })
      );
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

  // Spawn new PTY session
  const handleSpawnSession = async (agentId: string, runtimeType: string) => {
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
        cwd: '.',
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
        cwd: '.',
        is_alive: true,
        outputData: [`\r\n--- Spawned ${command} PTY session for ${agentId} ---\r\n\r\n`],
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(sessionId);
      setCurrentView('terminals');
    } catch (e: any) {
      alert(`Failed to spawn PTY session: ${e}`);
    }
  };

  const handleKillSession = async (sessionId: string) => {
    try {
      await invoke('pty_kill', { sessionId });
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

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <NavigationSidebar
        currentView={currentView}
        onViewSelect={setCurrentView}
        activeSessionsCount={sessions.filter((s) => s.is_alive).length}
        sleepPrevented={sleepPrevented}
        onToggleSleepPrevention={handleToggleSleepPrevention}
      />

      <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
        {currentView === 'command_center' && (
          <CommandCenterView summary={summary} onOpenTerminal={handleSpawnSession} />
        )}
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
        {currentView === 'work' && (
          <WorkView tasks={summary?.recent_tasks || []} onOpenTerminal={handleSpawnSession} />
        )}
        {currentView === 'agents' && (
          <AgentsView identities={identities} onOpenTerminal={handleSpawnSession} />
        )}
        {currentView === 'automation' && (
          <AutomationView
            sleepPrevented={sleepPrevented}
            onToggleSleepPrevention={handleToggleSleepPrevention}
            onOpenTerminal={handleSpawnSession}
          />
        )}
        {currentView === 'intelligence' && <IntelligenceView />}
        {currentView === 'quality' && <QualityView />}
        {currentView === 'system' && <SystemView />}
      </main>
    </div>
  );
}

export default App;
