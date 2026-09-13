'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Layers,
  Plus,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle,
  MessageSquare,
  Zap,
  Check,
  Send,
} from '@/components/icons';
import { MarkdownDocument } from '@/components/MarkdownDocument';

interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  due_at: string;
  completed_at?: string;
  total_tasks: number;
  completed_tasks: number;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id?: string;
  assignee_name?: string;
  assignee_symbol?: string;
  required_capabilities: string;
  acceptance_criteria: string;
  created_at: string;
}

interface Evidence {
  id: number;
  task_id: string;
  task_title?: string;
  verifier_identity: string;
  evidence_class: string;
  passed: number;
  details: string;
  exit_code?: number;
  command_output?: string;
  created_at: string;
}

interface Message {
  id: number;
  from_identity: string;
  to_identity: string;
  type: string;
  priority: string;
  subject?: string;
  body: string;
  ts: string;
}

interface HumanDecision {
  id: number;
  task_id?: string;
  decision_type: string;
  urgency: string;
  description: string;
  requested_by: string;
  status: string;
  decision_note?: string;
  requested_at: string;
}

export default function ProjectWorkspacePage() {
  const params = useParams();
  const projectId = params?.id ? String(params.id) : '';

  const [project, setProject] = useState<any>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [decisions, setDecisions] = useState<HumanDecision[]>([]);
  const [metrics, setMetrics] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active workspace tab
  const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'tasks' | 'evidence' | 'communication' | 'decisions'>('overview');

  // Selected Task Inspector Modal
  const [selectedTask, setSelectedTask] = useState<any>(null);

  // New Milestone Modal State
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [msId, setMsId] = useState('');
  const [msTitle, setMsTitle] = useState('');
  const [msDesc, setMsDesc] = useState('');
  const [msDue, setMsDue] = useState('');
  const [creatingMs, setCreatingMs] = useState(false);

  // Direct Team Chat Input State
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);

  const fetchWorkspace = async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects?id=${projectId}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setProject(data.project);
      setMilestones(data.milestones || []);
      setTasks(data.tasks || []);
      setEvidences(data.evidence || []);
      setMessages(data.messages || []);
      setDecisions(data.decisions || []);
      setMetrics(data.metrics || {});
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load workspace data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    
    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        const res = await fetch(`/api/projects?id=${projectId}`);
        const data = await res.json();
        if (!isMounted) return;
        if (data.error) throw new Error(data.error);

        setProject(data.project);
        setMilestones(data.milestones || []);
        setTasks(data.tasks || []);
        setEvidences(data.evidence || []);
        setMessages(data.messages || []);
        setDecisions(data.decisions || []);
        setMetrics(data.metrics || {});
        setError(null);
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load workspace');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msId || !msTitle) return;
    setCreatingMs(true);

    try {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_milestone',
          id: msId,
          project_id: projectId,
          title: msTitle,
          description: msDesc,
          due_at: msDue || null,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setMsId('');
      setMsTitle('');
      setMsDesc('');
      setMsDue('');
      setShowMilestoneModal(false);
      await fetchWorkspace();
    } catch (err: any) {
      alert(`Error creating milestone: ${err.message}`);
    } finally {
      setCreatingMs(false);
    }
  };

  const handleUpdateMilestoneStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    try {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          milestone_id: id,
          status: nextStatus,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchWorkspace();
    } catch (err: any) {
      alert(`Error updating milestone: ${err.message}`);
    }
  };

  const handleUpdateTaskStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', task_id: id, status: newStatus }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchWorkspace();
      if (selectedTask?.id === id) {
        setSelectedTask({ ...selectedTask, status: newStatus });
      }
    } catch (err: any) {
      alert(`Error updating task status: ${err.message}`);
    }
  };

  const handleSendTeamMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatSending) return;
    setChatSending(true);

    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_identity: 'Winston',
          to_identity: 'Team',
          body: chatInput.trim(),
          type: 'COORDINATION',
          priority: 'normal',
          related_project_id: projectId,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChatInput('');
      await fetchWorkspace();
    } catch (err: any) {
      alert(`Error sending message: ${err.message}`);
    } finally {
      setChatSending(false);
    }
  };

  const handleDecision = async (id: number, decision: string) => {
    try {
      const res = await fetch('/api/human', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision, decided_by: 'Winston' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchWorkspace();
    } catch (err: any) {
      alert(`Error submitting decision: ${err.message}`);
    }
  };

  const getHealthBadgeStyle = (health: string) => {
    switch (health) {
      case 'ON TRACK':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'AT RISK':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'BLOCKED':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-500 p-8 flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <div className="flex justify-center text-indigo-600 animate-spin">
            <RefreshCw />
          </div>
          <div className="text-sm font-semibold text-slate-800">
            Mapping initiative telemetry, graphs, and evidence...
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <main className="min-h-screen bg-slate-100 p-6 flex flex-col items-center justify-center font-sans space-y-4">
        <div className="p-5 max-w-md bg-white border border-rose-200 rounded-2xl text-center space-y-3 shadow-sm">
          <AlertCircle className="mx-auto text-rose-500" width={32} height={32} />
          <h2 className="font-bold text-slate-900">Initiative Workspace Error</h2>
          <p className="text-xs text-slate-500">Failed to establish dynamic database bridge: {error || 'Project not found'}</p>
          <Link href="/work/projects" className="inline-block px-4 py-2 bg-slate-900 text-white font-medium rounded-xl text-xs hover:bg-slate-800 transition">
            Back to Portfolio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-5">
      {/* Back link & refresh */}
      <div className="flex justify-between items-center text-xs">
        <Link href="/work/projects" className="text-slate-500 hover:text-slate-900 font-medium flex items-center gap-1">
          ← Back to Initiatives Portfolio
        </Link>
        <button onClick={fetchWorkspace} className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold cursor-pointer">
          <RefreshCw width={12} height={12} /> Sync Workspace
        </button>
      </div>

      {/* Project Header Card */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                {project.id.toUpperCase()}
              </span>
              <h1 className="text-base font-bold text-slate-900">{project.title}</h1>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">{project.description}</p>
          </div>

          <div className="flex gap-2">
            {project.repo && (
              <span className="text-[10px] font-mono font-medium border border-slate-200 bg-slate-50 px-2.5 py-1 rounded-xl text-slate-500">
                repo: {project.repo}
              </span>
            )}
            <span className={`text-[10px] font-bold border rounded-xl px-2.5 py-1 uppercase tracking-wider ${getHealthBadgeStyle(metrics.health)}`}>
              {metrics.health}
            </span>
          </div>
        </div>

        {/* Dynamic Rates and Metics Grid */}
        <div className="grid grid-cols-4 gap-4 pt-4 border-t border-slate-100 text-xs">
          <div className="space-y-1 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-sans">Task Completion</span>
            <div className="flex justify-between items-baseline pt-1">
              <span className="text-base font-bold font-mono text-slate-800">{metrics.task_completion_rate}%</span>
              <span className="text-[10px] text-slate-400 font-mono">{metrics.completed_tasks} / {metrics.total_tasks} completed</span>
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-600 h-1.5 rounded-full transition-all" style={{ width: `${metrics.task_completion_rate}%` }} />
            </div>
          </div>

          <div className="space-y-1 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-sans">Verification Progress</span>
            <div className="flex justify-between items-baseline pt-1">
              <span className="text-base font-bold font-mono text-emerald-600">{metrics.verification_progress_rate}%</span>
              <span className="text-[10px] text-slate-400 font-mono">{metrics.verified_tasks} / {metrics.total_tasks} verified</span>
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${metrics.verification_progress_rate}%` }} />
            </div>
          </div>

          <div className="space-y-1 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-sans">Attention Required</span>
            <div className="flex justify-between items-baseline pt-1">
              <span className={`text-base font-bold font-mono ${metrics.blocked_tasks + metrics.failed_tasks + metrics.pending_decisions > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {metrics.blocked_tasks + metrics.failed_tasks + metrics.pending_decisions}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">blockers & failed tests</span>
            </div>
            <div className="text-[9px] text-slate-500 font-mono truncate">
              {metrics.blocked_tasks} blocked • {metrics.failed_tasks} failed • {metrics.pending_decisions} escalations
            </div>
          </div>

          <div className="space-y-1 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-sans">Project Phase</span>
            <div className="text-sm font-bold text-slate-800 pt-1">
              {milestones.find((m) => m.status === 'in_progress')?.title || 'Planning & Formulation'}
            </div>
            <div className="text-[9px] text-slate-400 font-mono truncate">
              {milestones.filter((m) => m.status === 'completed').length} / {milestones.length} milestones completed
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigators */}
      <nav className="flex gap-1.5 border-b border-slate-200 pb-px text-xs font-semibold text-slate-500">
        {[
          { id: 'overview', label: 'Overview', icon: Briefcase },
          { id: 'plan', label: 'Plan & Milestones', icon: Clock },
          { id: 'tasks', label: 'Tasks & Phases', icon: Layers },
          { id: 'evidence', label: 'Evidence & QA', icon: ShieldCheck },
          { id: 'communication', label: 'Communications', icon: MessageSquare },
          { id: 'decisions', label: 'Human Gates', icon: AlertCircle, alert: metrics.pending_decisions > 0 },
        ].map((tab) => {
          const ActiveIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 border-b-2 font-medium flex items-center gap-1.5 cursor-pointer transition ${
                isActive
                  ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-xl'
                  : 'border-transparent hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <ActiveIcon width={14} height={14} />
              <span>{tab.label}</span>
              {tab.alert && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Tab Panels */}
      <div className="flex-1 max-w-5xl w-full mx-auto">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-3 gap-6">
            {/* Left 2 Cols: Description, Objectives, and Roadmap */}
            <div className="col-span-2 space-y-6">
              {/* Objectives List */}
              <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Initiative Objectives</h2>
                <div className="space-y-2">
                  {project.objectives.length === 0 ? (
                    <p className="text-xs italic text-slate-400">No structured objectives configured.</p>
                  ) : (
                    project.objectives.map((obj: string, i: number) => (
                      <div key={i} className="flex gap-2.5 p-3 bg-slate-50/50 border border-slate-100 rounded-xl text-xs text-slate-700">
                        <div className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0">
                          {i + 1}
                        </div>
                        <p className="leading-normal">{obj}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* What Happens Next / Active Path */}
              <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Pipeline Strategy</h2>
                <div className="p-3.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs space-y-2">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Zap className="text-amber-500 animate-pulse" width={14} height={14} />
                    <span>Current Operational Recommendation</span>
                  </div>
                  <p className="text-slate-600 leading-normal">
                    The active milestone is <strong className="text-slate-800">{milestones.find((m) => m.status === 'in_progress')?.title || 'Planning'}</strong>.
                    To maintain velocity, proceed with resolving the uncompleted task payloads under Tasks. Verify execution evidence on the Evidence tab prior to initiating Winston approval gates.
                  </p>
                </div>
              </section>
            </div>

            {/* Right 1 Col: Risks, Blockers & Human Gate Summary */}
            <div className="col-span-1 space-y-6">
              {/* Risks & Blockers Panel */}
              <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Security & Operational Gates</h2>
                
                {/* Blockers lists */}
                <div className="space-y-2.5 text-xs">
                  <div className="font-semibold text-slate-800">Critical Blockers ({tasks.filter(t => t.status === 'blocked').length})</div>
                  {tasks.filter(t => t.status === 'blocked').length === 0 ? (
                    <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 flex items-center gap-1.5 text-[11px]">
                      <CheckCircle width={13} height={13} />
                      <span>No technical blockers recorded</span>
                    </div>
                  ) : (
                    tasks.filter(t => t.status === 'blocked').map(t => (
                      <div key={t.id} className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-[11px] text-rose-800 space-y-1">
                        <div className="font-bold flex items-center gap-1 font-mono">
                          <AlertCircle width={12} height={12} />
                          <span>{t.id}</span>
                        </div>
                        <p className="line-clamp-1">{t.title}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Human Gates */}
                <div className="space-y-2.5 text-xs pt-3 border-t border-slate-100">
                  <div className="font-semibold text-slate-800">Pending Human Signoffs ({decisions.filter(d => d.status === 'pending').length})</div>
                  {decisions.filter(d => d.status === 'pending').length === 0 ? (
                    <div className="p-2.5 bg-slate-50 text-slate-500 rounded-xl border border-slate-100 flex items-center gap-1.5 text-[11px] font-mono">
                      <span>No pending Winston authorizations</span>
                    </div>
                  ) : (
                    decisions.filter(d => d.status === 'pending').map(d => (
                      <div key={d.id} className="p-2.5 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-800 space-y-1 cursor-pointer hover:border-amber-300 transition" onClick={() => setActiveTab('decisions')}>
                        <div className="font-bold flex items-center gap-1 font-mono">
                          <Clock width={12} height={12} />
                          <span>{d.decision_type}</span>
                        </div>
                        <p className="line-clamp-1 leading-normal font-sans">{d.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* TAB 2: PLAN & MILESTONES */}
        {activeTab === 'plan' && (
          <div className="space-y-6">
            <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Project Road-Map Milestones</h2>
                  <p className="text-xs text-slate-500">Phased validation points defined during project planning</p>
                </div>
                <button
                  onClick={() => setShowMilestoneModal(true)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Plus width={12} height={12} /> Add Milestone
                </button>
              </div>

              <div className="space-y-3">
                {milestones.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">No milestones defined.</div>
                ) : (
                  milestones.map((m) => (
                    <div
                      key={m.id}
                      className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl flex justify-between items-center text-xs hover:border-slate-300 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[9px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                            {m.id.toUpperCase()}
                          </span>
                          <h3 className="font-bold text-slate-900">{m.title}</h3>
                        </div>
                        <p className="text-slate-500 text-[11px] max-w-xl">{m.description}</p>
                        {m.due_at && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            Target Delivery: {m.due_at} {m.completed_at && `• Completed: ${m.completed_at.slice(0, 10)}`}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Dynamic Tasks mapping summary */}
                        <span className="text-[10px] font-mono text-slate-400">
                          {m.completed_tasks} / {m.total_tasks} tasks complete
                        </span>

                        <button
                          onClick={() => handleUpdateMilestoneStatus(m.id, m.status)}
                          className={`px-3 py-1.5 border rounded-xl text-[10px] font-bold uppercase transition cursor-pointer flex items-center gap-1 ${
                            m.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {m.status === 'completed' ? (
                            <>
                              <Check width={12} height={12} />
                              <span>Completed</span>
                            </>
                          ) : (
                            <span>Mark Completed</span>
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: TASKS & PHASES */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Operational Task Graph</h2>
                <p className="text-xs text-slate-500">Traceable work segments with associated required capabilities and assignees</p>
              </div>

              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">No active tasks linked.</div>
                ) : (
                  tasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl space-y-2 hover:border-slate-300 transition"
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                              {t.id}
                            </span>
                            <span className="text-[9px] uppercase font-bold border rounded-full px-1.5 py-0.5 border-slate-200 bg-white text-slate-500">
                              Priority: {t.priority}
                            </span>
                          </div>
                          <h3 className="font-bold text-xs text-slate-900">{t.title}</h3>
                          <div className="text-[11px] text-slate-500 line-clamp-1 font-sans leading-normal">
                            {t.description}
                          </div>
                        </div>

                        {/* Interactive Status Selector */}
                        <select
                          value={t.status}
                          onChange={(e) => handleUpdateTaskStatus(t.id, e.target.value)}
                          className={`text-[10px] font-bold uppercase rounded-lg px-2.5 py-1 border focus:outline-none cursor-pointer ${
                            t.status === 'done'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : t.status === 'in_progress'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : t.status === 'blocked'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          <option value="open">OPEN</option>
                          <option value="in_progress">IN PROGRESS</option>
                          <option value="verification">VERIFICATION</option>
                          <option value="done">DONE</option>
                          <option value="blocked">BLOCKED</option>
                        </select>
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
                        <span>
                          Assignee: <strong className="text-slate-700">{t.assignee_name || t.assignee_id || 'Unassigned'}</strong>
                        </span>
                        <div className="flex gap-2.5">
                          <button
                            onClick={() => setSelectedTask(t)}
                            className="text-indigo-600 font-semibold hover:underline cursor-pointer flex items-center gap-0.5 text-[11px]"
                          >
                            <span>Inspect Contract</span>
                            <ArrowUpRight width={11} height={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: EVIDENCE & QA */}
        {activeTab === 'evidence' && (
          <div className="space-y-6">
            <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Falsifiable Verification Ledger</h2>
                <p className="text-xs text-slate-500">Observed test executions and machine-produced evidence blocks</p>
              </div>

              <div className="space-y-4">
                {evidences.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">No verification records recorded yet.</div>
                ) : (
                  evidences.map((e) => (
                    <div
                      key={e.id}
                      className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <div className="space-y-0.5">
                          <span className="font-mono text-[9px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                            TASK: {e.task_id}
                          </span>
                          <h3 className="font-bold text-xs text-slate-800 mt-1">{e.task_title || 'Linked Work Item'}</h3>
                        </div>

                        <span
                          className={`text-[9px] font-bold border rounded-full px-2 py-0.5 uppercase tracking-wider ${
                            e.passed
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {e.passed ? 'VERIFIED PASS' : 'VERIFICATION FAILED'}
                        </span>
                      </div>

                      <div className="text-xs space-y-2">
                        <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[10px] space-y-1">
                          <div><span className="text-slate-400">Verifier Agent:</span> @{e.verifier_identity}</div>
                          <div><span className="text-slate-400">Evidence Class:</span> {e.evidence_class}</div>
                          {e.exit_code !== undefined && <div><span className="text-slate-400">Exit Code:</span> {e.exit_code}</div>}
                          <div><span className="text-slate-400">Timestamp:</span> {e.created_at}</div>
                        </div>

                        {e.details && (
                          <div className="p-3 bg-white border border-slate-200 rounded-xl text-slate-700 leading-relaxed font-sans">
                            <strong>Observed Details:</strong> {e.details}
                          </div>
                        )}

                        {e.command_output && (
                          <div className="space-y-1.5">
                            <span className="font-semibold text-slate-500 font-mono text-[10px]">Console Buffer Output:</span>
                            <pre className="p-3 bg-slate-950 text-indigo-400 rounded-xl font-mono text-[10px] overflow-x-auto max-h-40">
                              {e.command_output}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 5: COMMUNICATIONS */}
        {activeTab === 'communication' && (
          <div className="space-y-6">
            <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Initiative Workspace Intercom</h2>
                <p className="text-xs text-slate-500">Live conversations and coordination threads between agents around this work</p>
              </div>

              {/* Chat timeline feed */}
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {messages.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">No messages found on this workspace.</div>
                ) : (
                  [...messages].reverse().map((m) => {
                    const isMe = m.from_identity === 'Winston';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col space-y-1 max-w-[80%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                      >
                        <span className="text-[10px] text-slate-400 font-mono">
                          @{m.from_identity} → @{m.to_identity} • {m.ts.split('T')[1]?.slice(0, 8) || m.ts}
                        </span>
                        <div
                          className={`p-3 rounded-2xl text-xs leading-normal ${
                            isMe
                              ? 'bg-indigo-600 text-white rounded-tr-none'
                              : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/60'
                          }`}
                        >
                          {m.subject && <div className="font-bold mb-1 font-mono text-[10px] border-b pb-0.5 border-white/20">{m.subject}</div>}
                          <p className="whitespace-pre-line">{m.body}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Chat direct dispatch form */}
              <form onSubmit={handleSendTeamMessage} className="flex gap-2 pt-4 border-t border-slate-100">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Dispatch coordination directive to workspace team..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  required
                />
                <button
                  type="submit"
                  disabled={chatSending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Send width={12} height={12} />
                  <span>{chatSending ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            </section>
          </div>
        )}

        {/* TAB 6: DECISIONS / HUMAN GATES */}
        {activeTab === 'decisions' && (
          <div className="space-y-6">
            <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Winston Authorization Escapes</h2>
                <p className="text-xs text-slate-500">Autonomous workflow gates requiring human authority before executing next phase</p>
              </div>

              <div className="space-y-3">
                {decisions.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">No decisions require human attention on this workspace.</div>
                ) : (
                  decisions.map((d) => (
                    <div
                      key={d.id}
                      className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-2xl space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5">
                            {d.decision_type}
                          </span>
                          <span className="text-[9px] uppercase font-bold text-slate-400">
                            Urgency: {d.urgency}
                          </span>
                        </div>

                        <span
                          className={`text-[9px] font-bold border rounded-full px-2 py-0.5 uppercase tracking-wider ${
                            d.status === 'pending'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {d.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                        {d.description}
                      </p>

                      <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
                        <span>Escalated by: @{d.requested_by} • {d.requested_at}</span>
                        {d.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDecision(d.id, 'rejected')}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-rose-600 cursor-pointer font-bold uppercase text-[9px]"
                            >
                              Reject Plan
                            </button>
                            <button
                              onClick={() => handleDecision(d.id, 'approved')}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white cursor-pointer font-bold uppercase text-[9px]"
                            >
                              Approve & Continue
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Selected Task Inspection Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  {selectedTask.id}
                </span>
                <h3 className="font-bold text-base text-slate-900 mt-1">{selectedTask.title}</h3>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-600 max-h-96 overflow-y-auto pr-1">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1.5 font-mono">
                <div>
                  <strong>Status:</strong>{' '}
                  <span className="uppercase text-amber-700 font-bold">{selectedTask.status}</span>
                </div>
                <div>
                  <strong>Priority:</strong> <span className="uppercase">{selectedTask.priority}</span>
                </div>
                <div>
                  <strong>Assignee:</strong>{' '}
                  {selectedTask.assignee_name || selectedTask.assignee_id || 'Unassigned'}
                </div>
                <div>
                  <strong>Created:</strong> {selectedTask.created_at}
                </div>
              </div>

              {selectedTask.description && (
                <div>
                  <h4 className="font-semibold text-slate-700 mb-1">Description & Goal:</h4>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 leading-normal">
                    <MarkdownDocument content={selectedTask.description} defaultExpanded={true} />
                  </div>
                </div>
              )}

              {selectedTask.required_capabilities && selectedTask.required_capabilities !== '[]' && (
                <div>
                  <h4 className="font-semibold text-slate-700 mb-1">Required Agent Capabilities:</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {JSON.parse(selectedTask.required_capabilities || '[]').map((cap: string) => (
                      <span key={cap} className="font-mono text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedTask.acceptance_criteria && selectedTask.acceptance_criteria !== '[]' && (
                <div>
                  <h4 className="font-semibold text-slate-700 mb-1">Acceptance Criteria (Falsifiable Checks):</h4>
                  <div className="space-y-1.5">
                    {JSON.parse(selectedTask.acceptance_criteria || '[]').map((item: string, i: number) => (
                      <div key={i} className="flex gap-2 p-2 bg-slate-50 rounded-lg text-slate-700">
                        <CheckCircle className="text-slate-400 mt-0.5 shrink-0" width={14} height={14} />
                        <span className="leading-normal">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-xs cursor-pointer"
              >
                Close Contract
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Milestone Modal */}
      {showMilestoneModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Plus />
                <span>Establish New Milestone</span>
              </h3>
              <button
                onClick={() => setShowMilestoneModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMilestone} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Milestone ID</label>
                  <input
                    type="text"
                    value={msId}
                    onChange={(e) => setMsId(e.target.value)}
                    placeholder="e.g. ms_analytics_v1"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Target Delivery Date</label>
                  <input
                    type="date"
                    value={msDue}
                    onChange={(e) => setMsDue(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Milestone Title</label>
                <input
                  type="text"
                  value={msTitle}
                  onChange={(e) => setMsTitle(e.target.value)}
                  placeholder="e.g. Pipeline Reporting Core"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Description</label>
                <textarea
                  value={msDesc}
                  onChange={(e) => setMsDesc(e.target.value)}
                  rows={3}
                  placeholder="What validation goals must this milestone check?"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMilestoneModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingMs}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Plus />
                  <span>{creatingMs ? 'Creating...' : 'Establish Milestone'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
