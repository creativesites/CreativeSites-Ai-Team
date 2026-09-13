import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Terminal as TerminalIcon,
  Sparkles,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  FileCode2,
  Bookmark,
  Coins,
  Cpu,
  Layers,
  Edit3,
  ExternalLink,
  Loader2,
  TrendingUp,
  FolderGit2,
  Play,
  Target,
  UserCheck,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { XTermTerminal } from '../components/XTermTerminal';
import { EditRoleModal } from '../components/EditRoleModal';
import {
  summarizeAgentWorkWithGemini,
  AgentWorkSummary,
} from '../services/geminiOrchestrator';

interface AgentWorkspaceViewProps {
  agentId: string;
  onBack: () => void;
  onOpenSession: (agentId: string, runtimeType: string) => void;
  activeSessions: any[];
  onSendData: (sessionId: string, data: string) => void;
  onKillSession: (sessionId: string) => void;
}

type TabType = 'workspace' | 'performance' | 'tasks' | 'evidence' | 'contract';

export const AgentWorkspaceView: React.FC<AgentWorkspaceViewProps> = ({
  agentId,
  onBack,
  onOpenSession,
  activeSessions,
  onSendData,
  onKillSession,
}) => {
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('workspace');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Gemini Executive Performance Summary
  const [summary, setSummary] = useState<AgentWorkSummary | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [agentOkrs, setAgentOkrs] = useState<any[]>([]);
  const [agentKrs, setAgentKrs] = useState<any[]>([]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await invoke<any>('myaos_get_agent_profile_details', { agentId });
      setProfileData(res);

      // Fetch active OKRs assigned to this agent
      try {
        const okrRes = await invoke<[any[], any[]]>('myaos_list_okrs');
        if (okrRes) {
          const myObjs = (okrRes[0] || []).filter((o: any) => o.owner_id === agentId);
          const myKrs = (okrRes[1] || []).filter((k: any) => myObjs.some((o: any) => o.id === k.objective_id));
          setAgentOkrs(myObjs);
          setAgentKrs(myKrs);
        }
      } catch (err) {
        console.warn('Failed to load agent OKRs:', err);
      }

      // Trigger automatic AI assessment
      if (res?.identity) {
        setSummarizing(true);
        summarizeAgentWorkWithGemini({
          agent: res.identity,
          tasks: res.tasks || [],
          events: res.events || [],
          evidence: res.evidence || [],
          memoryBookmarks: res.memory_bookmarks || [],
        })
          .then((s) => setSummary(s))
          .finally(() => setSummarizing(false));
      }
    } catch (e) {
      console.error('Failed to load agent profile details:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [agentId]);

  const liveSession = activeSessions.find((s) => s.agent_id === agentId && s.is_alive);

  const parseJsonArray = (val: any): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        const p = JSON.parse(val);
        if (Array.isArray(p)) return p;
      } catch (_) {}
      return [val];
    }
    return [];
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-12 text-zinc-400 font-mono text-xs">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-zinc-800" />
        <span>Loading AI employee workspace and telemetry substrate...</span>
      </div>
    );
  }

  const identity = profileData?.identity || {};
  const tasks = profileData?.tasks || [];
  const evidence = profileData?.evidence || [];
  const memoryBookmarks = profileData?.memory_bookmarks || [];
  const totalCostUsd = profileData?.total_cost_usd || 0;
  const totalTokens = profileData?.total_tokens || 0;
  const defaultWorkspace = profileData?.default_workspace || '';

  const completedTasks = tasks.filter((t: any) => t.status === 'done');
  const openTasks = tasks.filter((t: any) => t.status !== 'done');

  return (
    <div className="space-y-5 font-sans select-none animate-card-entry pb-12">
      {/* Top Navigation & Agent Employee Header */}
      <div className="bg-white/80 backdrop-blur-md border border-black/[0.06] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-2xl bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 transition cursor-pointer"
            title="Return to Org Chart"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="w-13 h-13 rounded-2xl bg-zinc-900 text-white flex items-center justify-center text-2xl shadow-sm">
            {identity.symbol || '🤖'}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-zinc-900">{identity.display_name}</h1>
              <span className="text-xs font-mono text-zinc-400 font-normal">({identity.id})</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-zinc-100 text-zinc-700">
                {identity.lane}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                {identity.observed_liveness || 'LIVE'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5 font-medium">{identity.primary_domain}</p>
          </div>
        </div>

        {/* Telemetry Metrics & Primary Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-zinc-50 border border-black/[0.06] px-3.5 py-2 rounded-2xl shadow-2xs text-xs font-mono">
            <div>
              <div className="text-[10px] uppercase text-zinc-400 font-bold">Total Spend</div>
              <div className="font-bold text-zinc-800">${totalCostUsd.toFixed(4)}</div>
            </div>
            <div className="w-px h-6 bg-black/[0.06]" />
            <div>
              <div className="text-[10px] uppercase text-zinc-400 font-bold">Total Tokens</div>
              <div className="font-bold text-zinc-800">{totalTokens.toLocaleString()}</div>
            </div>
          </div>

          <button
            onClick={() => setIsEditModalOpen(true)}
            className="px-3.5 py-2 bg-white hover:bg-black/5 text-zinc-700 border border-black/10 rounded-2xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Employee Profile</span>
          </button>

          <button
            onClick={() => onOpenSession(identity.id, 'claude_code')}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            <span>{liveSession ? 'Resume CLI Session' : 'Spawn Live CLI'}</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex border-b border-black/[0.06] bg-[#f4f3f0] px-4 pt-2 gap-2 rounded-2xl">
        {[
          { id: 'workspace', label: 'Employee Workspace & PTY', icon: FolderGit2 },
          { id: 'performance', label: 'AI Performance & Summary', icon: Sparkles },
          { id: 'tasks', label: `Assigned Tasks (${tasks.length})`, icon: Layers },
          { id: 'evidence', label: `Verified Evidence (${evidence.length})`, icon: ShieldCheck },
          { id: 'contract', label: 'AI Employee & Governance', icon: Cpu },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 border-b-2 ${
              activeTab === tab.id
                ? 'bg-white text-zinc-900 border-zinc-900 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 border-transparent'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: Employee Workspace & Live Terminal */}
      {activeTab === 'workspace' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left 2 Cols: Live Terminal Shell / Workspace console */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-black/[0.06] rounded-3xl p-4 shadow-xs flex flex-col h-[520px]">
              <div className="flex items-center justify-between border-b border-black/[0.05] pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-zinc-800">
                    {liveSession ? `Active CLI Session (${liveSession.command})` : 'Standby Console'}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-md">
                    {defaultWorkspace.split('/').pop() || 'Workspace'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenSession(identity.id, 'claude_code')}
                    className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold transition"
                  >
                    ⚡ Claude
                  </button>
                  <button
                    onClick={() => onOpenSession(identity.id, 'gemini_cli')}
                    className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold transition"
                  >
                    ♊ Gemini
                  </button>
                </div>
              </div>

              {liveSession ? (
                <div className="flex-1 rounded-2xl overflow-hidden bg-[#090d16] p-2">
                  <XTermTerminal
                    sessionId={liveSession.session_id}
                    onData={(data) => onSendData(liveSession.session_id, data)}
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-zinc-50/50 rounded-2xl border border-dashed border-black/10">
                  <TerminalIcon className="w-8 h-8 text-zinc-300 mb-2" />
                  <h3 className="text-xs font-bold text-zinc-700">No Active Terminal Session for @{identity.id}</h3>
                  <p className="text-[11px] text-zinc-400 max-w-sm mt-1">
                    Spawn Claude Code, Gemini CLI, or Antigravity in this agent's home directory:
                    <br />
                    <span className="font-mono text-zinc-600 mt-1 block">{defaultWorkspace}</span>
                  </p>
                  <button
                    onClick={() => onOpenSession(identity.id, 'claude_code')}
                    className="mt-4 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Launch Claude Code Session</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Col: Home Repository, Memory Bookmarks, Active Directives */}
          <div className="space-y-4">
            {/* Target Workspace Info */}
            <div className="bg-white border border-black/[0.06] p-5 rounded-3xl shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-900">
                <FolderGit2 className="w-4 h-4 text-zinc-700" />
                <span>Home Codebase & Directory</span>
              </div>
              <div className="p-3 bg-zinc-50 border border-black/[0.04] rounded-2xl space-y-1">
                <div className="text-[10px] uppercase font-mono font-bold text-zinc-400">Path on Disk</div>
                <div className="text-xs font-mono text-zinc-700 break-all">{defaultWorkspace}</div>
              </div>
            </div>

            {/* Agent Memory Bookmarks */}
            <div className="bg-white border border-black/[0.06] p-5 rounded-3xl shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-900">
                  <Bookmark className="w-4 h-4 text-indigo-600" />
                  <span>Agent Memory Substrate</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">{memoryBookmarks.length} records</span>
              </div>

              {memoryBookmarks.length === 0 ? (
                <div className="text-xs text-zinc-400 font-mono text-center py-4">
                  No memory bookmarks pinned for this agent.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {memoryBookmarks.map((bm: any) => (
                    <div
                      key={bm.id}
                      className="p-3 rounded-2xl bg-zinc-50/70 border border-black/[0.04] space-y-1 hover:border-black/10 transition"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="font-bold text-indigo-700">{bm.category}</span>
                        <span className="text-zinc-400">{new Date(bm.created_at).toLocaleDateString()}</span>
                      </div>
                      <h4 className="text-xs font-bold text-zinc-800">{bm.title}</h4>
                      <p className="text-[11px] text-zinc-600 line-clamp-2">{bm.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AI Performance & Executive Summary (Powered by Gemini 3.8 Flash) */}
      {activeTab === 'performance' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 border border-amber-200/80 p-6 rounded-3xl shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                  <Sparkles className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-zinc-900">Gemini 3.8 Flash Performance Synthesis</h2>
                  <p className="text-xs text-zinc-500">Autonomous evaluation based on tasks, events, and verified evidence</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {summarizing && (
                  <span className="text-xs font-mono text-amber-800 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing telemetry...</span>
                  </span>
                )}
                {summary && (
                  <span className="px-3 py-1 bg-amber-200/80 text-amber-950 font-bold font-mono text-xs rounded-full shadow-2xs">
                    {summary.performanceEvaluation}
                  </span>
                )}
              </div>
            </div>

            {summary ? (
              <div className="space-y-4 pt-2">
                <div>
                  <h3 className="text-[11px] font-mono uppercase tracking-wider font-bold text-zinc-400 mb-1">
                    Executive Overview
                  </h3>
                  <p className="text-xs text-zinc-700 leading-relaxed font-medium whitespace-pre-line bg-white/80 p-4 rounded-2xl border border-black/[0.04]">
                    {summary.executiveOverview}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Accomplishments */}
                  <div className="bg-white/80 p-4 rounded-2xl border border-black/[0.04] space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Accomplishments</span>
                    </div>
                    <ul className="space-y-1 text-xs text-zinc-700 list-disc list-inside">
                      {summary.recentAccomplishments.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Risks & Bottlenecks */}
                  <div className="bg-white/80 p-4 rounded-2xl border border-black/[0.04] space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Risks & Blockers</span>
                    </div>
                    <ul className="space-y-1 text-xs text-zinc-700 list-disc list-inside">
                      {summary.blockersAndRisks.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Actionable Next Steps */}
                  <div className="bg-white/80 p-4 rounded-2xl border border-black/[0.04] space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800">
                      <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Actionable Next Steps</span>
                    </div>
                    <ul className="space-y-1 text-xs text-zinc-700 list-disc list-inside">
                      {summary.actionableNextSteps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-zinc-400 font-mono text-xs">
                Generating comprehensive performance review...
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Assigned Tasks */}
      {activeTab === 'tasks' && (
        <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-400">
              Assigned Tasks ({tasks.length})
            </h2>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
              <span className="text-emerald-600 font-bold">{completedTasks.length} Completed</span>
              <span>·</span>
              <span className="text-amber-600 font-bold">{openTasks.length} In Progress</span>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 font-mono text-xs">
              No tasks explicitly assigned to @{identity.id} yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {tasks.map((task: any) => (
                <div
                  key={task.id}
                  className="p-4 rounded-2xl border border-black/[0.05] bg-zinc-50/50 hover:bg-white hover:border-black/10 transition flex items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-zinc-100 font-mono font-bold text-[10px] text-zinc-600">
                        {task.id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-mono font-bold text-[9px] uppercase ${
                          task.status === 'done'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {task.status}
                      </span>
                      {task.priority && (
                        <span className="text-[10px] font-mono text-zinc-400 uppercase">
                          Priority: {task.priority}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-zinc-900 leading-snug">{task.title}</h4>
                    {task.description && (
                      <p className="text-[11px] text-zinc-500 line-clamp-1">{task.description}</p>
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                    {new Date(task.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Evidence & Verifier Proofs */}
      {activeTab === 'evidence' && (
        <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-400">
              Independent Verifier Evidence ({evidence.length})
            </h2>
            <span className="text-xs text-zinc-400 font-mono">SQLite Evidence Substrate</span>
          </div>

          {evidence.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 font-mono text-xs">
              No evidence records filed for this agent yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {evidence.map((ev: any) => (
                <div
                  key={ev.id}
                  className="p-4 rounded-2xl border border-black/[0.05] bg-zinc-50/50 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          ev.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {ev.passed ? 'PASSED' : 'FAILED'}
                      </span>
                      <span className="font-mono text-zinc-500">Task: {ev.task_id}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">
                      {new Date(ev.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-800 font-medium">{ev.details || 'Verification recorded.'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: AI Employee Dossier & Governance */}
      {activeTab === 'contract' && (
        <div className="space-y-6">
          {/* Top Employee Overview Card */}
          <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/[0.06] pb-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-zinc-900 text-white flex items-center justify-center text-2xl shadow-sm">
                  {identity.symbol || '🤖'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-zinc-900">{identity.display_name}</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700">
                      @{identity.id}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      AUTONOMOUS EMPLOYEE
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 font-medium mt-1">
                    {identity.primary_domain} • Lane: <span className="font-bold uppercase text-zinc-700">{identity.lane}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Modify Contract & Objectives</span>
                </button>
              </div>
            </div>

            {/* Employee Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-zinc-50/70 border border-black/[0.04]">
                <div className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Employment Status</div>
                <div className="text-xs font-bold text-zinc-800 mt-1 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Substrate Active</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-50/70 border border-black/[0.04]">
                <div className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Supervisor / Reporting</div>
                <div className="text-xs font-bold text-zinc-800 mt-1 truncate">
                  Winston Zulu & Orchestrator
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-50/70 border border-black/[0.04]">
                <div className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Verification Gate</div>
                <div className="text-xs font-bold text-zinc-800 mt-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Independent Verifier (Kael)</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-50/70 border border-black/[0.04]">
                <div className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Workspace Path</div>
                <div className="text-xs font-mono font-bold text-zinc-800 mt-1 truncate" title={defaultWorkspace}>
                  {defaultWorkspace ? defaultWorkspace.split('/').pop() : 'Default Repository'}
                </div>
              </div>
            </div>
          </div>

          {/* Active Strategic OKRs Assigned to this Agent */}
          <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-800">
                  Strategic OKRs & Key Results Mandate ({agentOkrs.length})
                </h3>
              </div>
              <span className="text-[10px] font-mono text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200/80">
                Substrate Pinned
              </span>
            </div>

            {agentOkrs.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                No quarterly OKR objectives currently assigned to @{identity.id}. Manage in Strategic OKRs view.
              </div>
            ) : (
              <div className="space-y-4">
                {agentOkrs.map((obj) => {
                  const krs = agentKrs.filter((k) => k.objective_id === obj.id);
                  return (
                    <div key={obj.id} className="p-4 rounded-2xl bg-zinc-50/70 border border-black/[0.04] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-white">
                            {obj.id}
                          </span>
                          <h4 className="text-xs font-bold text-zinc-900">{obj.title}</h4>
                        </div>
                        <span className="text-xs font-mono font-bold text-indigo-700">{obj.progress_percent}%</span>
                      </div>
                      <div className="w-full bg-zinc-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all"
                          style={{ width: `${obj.progress_percent}%` }}
                        />
                      </div>
                      {krs.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {krs.map((kr) => (
                            <div key={kr.id} className="p-2.5 rounded-xl bg-white border border-zinc-200 text-xs space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className="text-zinc-500 font-bold">{kr.id}</span>
                                <span className="text-indigo-600 font-semibold">{kr.current_value}/{kr.target_value} {kr.unit || ''}</span>
                              </div>
                              <p className="text-[11px] font-medium text-zinc-800 line-clamp-1">{kr.title}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Objectives, Responsibilities & Scope */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Responsibilities & Mission Objectives */}
            <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-black/[0.06]">
                <Target className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-800">
                  Mission Objectives & Core Mandate
                </h3>
              </div>
              <ul className="space-y-2.5">
                {parseJsonArray(identity.declared_responsibilities).map((resp, i) => (
                  <li
                    key={i}
                    className="p-3 rounded-xl bg-zinc-50/80 border border-black/[0.03] text-xs font-medium text-zinc-800 flex items-start gap-2.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                    <span>{resp}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Declared Capabilities & Tooling Matrix */}
            <div className="bg-white border border-black/[0.06] p-6 rounded-3xl shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-black/[0.06]">
                <Cpu className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-800">
                  Declared Capabilities & Tooling Matrix
                </h3>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {parseJsonArray(identity.declared_capabilities).map((cap, i) => (
                  <div
                    key={i}
                    className="px-3 py-1.5 bg-zinc-50 border border-black/[0.06] rounded-xl text-xs font-mono font-semibold text-zinc-800 shadow-2xs flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>{cap}</span>
                  </div>
                ))}
              </div>

              {/* Substrate Governance Mandates */}
              <div className="mt-4 pt-4 border-t border-black/[0.05] space-y-2">
                <div className="text-[10px] font-mono font-bold uppercase text-zinc-400">
                  Foundational Mandates (Committed in Substrate)
                </div>
                <div className="space-y-1.5 text-xs text-zinc-600 font-medium">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Outcome-Led Problem Solving (Winston's Directives)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Substrate-Native Truth (`data/myaos.db` as single record)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Self-Verification Prohibited: Independent Verifier Required</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      <EditRoleModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        identity={identity}
        onSaved={fetchProfile}
      />
    </div>
  );
};
