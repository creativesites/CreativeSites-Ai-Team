import React, { useState } from 'react';
import { Send, FolderGit2, Users, AlertTriangle, Terminal } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface IntentBarProps {
  currentWorkspace: string;
  onWorkspaceChange: (workspace: string) => void;
  onMissionDispatched: (task: any) => void;
  onQuickLaunchClaude: () => void;
  onQuickLaunchGemini: () => void;
  onWakeTeam: () => void;
}

export const WORKSPACES = [
  { id: 'CreativeSites-Ai-Team', name: 'CreativeSites AI Team', path: '/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team' },
  { id: 'DeployFleet', name: 'DeployFleet Core', path: '/Users/winstonzulu/Documents/GitHub/DeployFleet' },
  { id: 'DeployFleet-website', name: 'DeployFleet Website', path: '/Users/winstonzulu/Documents/GitHub/DeployFleet-website' },
  { id: 'DeployFleet-Team', name: 'DeployFleet Team', path: '/Users/winstonzulu/Documents/GitHub/DeployFleet-Team' },
];

export const IntentBar: React.FC<IntentBarProps> = ({
  currentWorkspace,
  onWorkspaceChange,
  onMissionDispatched,
  onQuickLaunchClaude,
  onQuickLaunchGemini,
  onWakeTeam,
}) => {
  const [intent, setIntent] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('orchestrator');
  const [priority, setPriority] = useState('high');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!intent.trim()) return;

    try {
      setIsSubmitting(true);
      const assignee = selectedAgent === 'orchestrator' ? null : selectedAgent;
      const currentWs = WORKSPACES.find((w) => w.path === currentWorkspace) || WORKSPACES[0];

      const newTask = await invoke<any>('myaos_create_task', {
        title: intent.trim(),
        description: `Executive intent dispatched via MyaDesktop Cockpit in ${currentWs.name}`,
        assigneeId: assignee,
        priority,
        repo: currentWs.id,
      });

      setIntent('');
      onMissionDispatched(newTask);
    } catch (err) {
      console.error('Failed to dispatch intent:', err);
      alert(`Error dispatching mission: ${err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuggestion = (prompt: string, agent: string = 'orchestrator') => {
    setIntent(prompt);
    setSelectedAgent(agent);
  };

  return (
    <div className="bg-white border border-white/80 p-5 rounded-3xl shadow-mac-soft space-y-3.5 select-none transition-all duration-300">
      {/* Top Header & Workspace Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-800 font-bold">
          <div className="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Send className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm tracking-tight">Executive Intent & Mission Dispatch</span>
        </div>

        {/* Target Workspace Selector */}
        <div className="flex items-center gap-2">
          <FolderGit2 className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-semibold text-slate-500">Target Workspace:</span>
          <select
            value={currentWorkspace}
            onChange={(e) => onWorkspaceChange(e.target.value)}
            className="bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-sm hover:bg-slate-100 transition"
          >
            {WORKSPACES.map((w) => (
              <option key={w.path} value={w.path}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative flex items-center">
          <input
            type="text"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="What should the team accomplish? (e.g. 'Audit unit tests on DeployFleet', 'Wake Atlas to triage backlog')..."
            className="w-full bg-slate-50/80 border border-slate-200/90 rounded-2xl pl-4 pr-32 py-3.5 text-[13px] font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 focus:bg-white transition-all shadow-inner"
          />
          <button
            type="submit"
            disabled={!intent.trim() || isSubmitting}
            className="absolute right-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 active:scale-95 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 shadow-sm cursor-pointer disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Dispatching...' : 'Dispatch'}</span>
          </button>
        </div>

        {/* Controls Row: Assignee, Priority & Fast Suggestions */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
              Assignee:
            </span>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="bg-white border border-slate-200/80 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer hover:bg-slate-50 transition shadow-sm"
            >
              <option value="orchestrator">Auto-Route (Orchestrator)</option>
              <option value="atlas">Atlas (Coordinator)</option>
              <option value="astra">Astra (AI Architecture)</option>
              <option value="vela">Vela (WordPress & Web)</option>
              <option value="iris">Iris (Observer & Telemetry)</option>
              <option value="kael">Kael (QA & Verifier)</option>
              <option value="lyra">Lyra (Mobile & SDK)</option>
              <option value="nexus">Nexus (Runtime Infrastructure)</option>
            </select>

            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono ml-2">
              Priority:
            </span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="bg-white border border-slate-200/80 rounded-xl px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer hover:bg-slate-50 transition shadow-sm"
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          {/* Quick Presets Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => handleSuggestion('Run full autonomous test suite & verification audit', 'kael')}
              className="px-2.5 py-1 bg-slate-100/90 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded-xl text-[11px] font-medium transition cursor-pointer border border-slate-200/50"
            >
              Audit Tests
            </button>
            <button
              type="button"
              onClick={() => handleSuggestion('Review pending PRs and git branches for DeployFleet', 'atlas')}
              className="px-2.5 py-1 bg-slate-100/90 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded-xl text-[11px] font-medium transition cursor-pointer border border-slate-200/50"
            >
              Triage PRs
            </button>
            <button
              type="button"
              onClick={onQuickLaunchClaude}
              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[11px] font-bold transition cursor-pointer border border-indigo-200/70"
            >
              ⚡ Claude Code
            </button>
            <button
              type="button"
              onClick={onQuickLaunchGemini}
              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[11px] font-bold transition cursor-pointer border border-indigo-200/70"
            >
              ♊ Gemini CLI
            </button>
            <button
              type="button"
              onClick={onWakeTeam}
              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-[11px] font-bold transition cursor-pointer border border-emerald-200/70"
            >
              ☀️ Wake Team
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
