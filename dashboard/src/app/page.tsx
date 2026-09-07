'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  Send,
  Users,
  Cpu,
  Layers,
  ShieldCheck,
  Plus,
  Zap,
  RefreshCw,
  Clock,
  FileText,
  Terminal,
  Database,
  ArrowUpRight,
} from '@/components/icons';
import { MarkdownDocument } from '@/components/MarkdownDocument';

export default function BentoDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Quick Action Dispatch Modal
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [targetAgent, setTargetAgent] = useState('atlas');
  const [dispatchType, setDispatchType] = useState('COORDINATION');
  const [dispatchPriority, setDispatchPriority] = useState('high');
  const [dispatchSubject, setDispatchSubject] = useState('');
  const [dispatchBody, setDispatchBody] = useState('');
  const [sending, setSending] = useState(false);

  // Quick Task Creation Modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('atlas');
  const [taskPriority, setTaskPriority] = useState('high');
  const [taskDesc, setTaskDesc] = useState('');

  // Selected Task Inspection Modal
  const [selectedTask, setSelectedTask] = useState<any>(null);

  const fetchLiveState = async () => {
    try {
      const res = await fetch('/api/control-center');
      const json = await res.json();
      setData(json);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveState();
    const interval = setInterval(fetchLiveState, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchBody.trim()) return;
    setSending(true);
    try {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_identity: 'Winston',
          to_identity: targetAgent,
          type: dispatchType,
          priority: dispatchPriority,
          subject: dispatchSubject || null,
          body: dispatchBody,
        }),
      });
      setDispatchBody('');
      setDispatchSubject('');
      setShowDispatchModal(false);
      await fetchLiveState();
    } catch (err: any) {
      alert(`Error dispatching message: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskId || !taskTitle) return;
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_task',
          id: taskId,
          title: taskTitle,
          description: taskDesc,
          assignee_id: taskAssignee,
          priority: taskPriority,
          creator: 'Winston',
        }),
      });
      setShowTaskModal(false);
      setTaskId('');
      setTaskTitle('');
      setTaskDesc('');
      await fetchLiveState();
    } catch (err: any) {
      alert(`Error creating task: ${err.message}`);
    }
  };

  const handleUpdateTaskStatus = async (id: string, newStatus: string) => {
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', task_id: id, status: newStatus }),
      });
      await fetchLiveState();
      if (selectedTask?.id === id) {
        setSelectedTask({ ...selectedTask, status: newStatus });
      }
    } catch (err: any) {
      alert(`Error updating task: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-500 p-8 flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <div className="flex justify-center text-indigo-600 animate-spin">
            <RefreshCw />
          </div>
          <div className="text-sm font-semibold text-slate-800">
            Initializing Bento Command Grid...
          </div>
          <p className="text-xs text-slate-400">Syncing live telemetry from MyaOS SQLite substrate</p>
        </div>
      </div>
    );
  }

  const { pulse, agents, recentEvents, activeTasks, pendingDecisions, recentMessages, contradictions } = data || {};

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Top Professional App Header */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
            <Cpu />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                CreativeSites AI Team
              </h1>
              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                Operational v3.0
              </span>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              <span>Organization Command Console</span>
              <span>•</span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                <Clock /> {lastRefreshed}
              </span>
            </p>
          </div>
        </div>

        {/* Quick Dispatch Actions & Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setTargetAgent('atlas');
              setShowDispatchModal(true);
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            <Zap />
            <span>Dispatch Command</span>
          </button>
          <button
            onClick={() => setShowTaskModal(true)}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus />
            <span>New Task</span>
          </button>

          <nav className="flex items-center gap-1 pl-4 border-l border-slate-200 text-xs font-medium">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold"
            >
              Cockpit
            </Link>
            <Link
              href="/chat"
              className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
            >
              Intercom
            </Link>
            <Link
              href="/bridge"
              className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
            >
              DeployFleet Bridge
            </Link>
            <Link
              href="/human"
              className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition flex items-center gap-1"
            >
              <span>Approvals</span>
              {pulse?.pending_approvals > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500" />
              )}
            </Link>
            <Link
              href="/phase5"
              className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
            >
              Learning & Memory
            </Link>
          </nav>
        </div>
      </header>

      {/* Bento Grid Top Pulse Metrics */}
      <section className="grid grid-cols-6 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Agents Online</span>
            <Users />
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono flex items-baseline gap-1.5 pt-1">
            <span className="text-emerald-600">{pulse?.live_agents}</span>
            <span className="text-slate-400 text-sm font-normal">/ {pulse?.total_agents}</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Active Tasks</span>
            <Layers />
          </div>
          <div className="text-2xl font-bold tracking-tight text-amber-600 font-mono pt-1">
            {pulse?.open_tasks}
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Approvals Needed</span>
            <AlertCircle />
          </div>
          <div className={`text-2xl font-bold tracking-tight font-mono pt-1 ${pulse?.pending_approvals > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
            {pulse?.pending_approvals}
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Event Stream</span>
            <Activity />
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono pt-1">
            {pulse?.total_events}
          </div>
        </div>

        {/* Metric 5 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Comms Recorded</span>
            <MessageSquare />
          </div>
          <div className="text-2xl font-bold tracking-tight text-indigo-600 font-mono pt-1">
            {pulse?.total_messages}
          </div>
        </div>

        {/* Metric 6 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Truth Provenance</span>
            <ShieldCheck />
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-800 font-mono pt-1">
            {contradictions?.length || 2} <span className="text-xs text-slate-400 font-normal">noted</span>
          </div>
        </div>
      </section>

      {/* Main Bento Multi-Column Surface */}
      <div className="grid grid-cols-12 gap-6 flex-1">
        {/* Left Column (7 cols): Interactive Agent Roster & Real-Time Event Bus */}
        <div className="col-span-7 space-y-6 flex flex-col">
          {/* Agent Roster Card */}
          <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users />
                  <span>Agent Operational Roster</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Select any agent to dispatch directives or review assigned responsibilities
                </p>
              </div>
              <Link
                href="/chat"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <span>Full Intercom</span>
                <ArrowUpRight />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {agents?.map((a: any) => (
                <div
                  key={a.id}
                  onClick={() => {
                    setTargetAgent(a.id);
                    setShowDispatchModal(true);
                  }}
                  className="p-3.5 bg-slate-50/70 border border-slate-200/60 hover:border-indigo-400 hover:bg-white rounded-xl space-y-2.5 cursor-pointer transition shadow-2xs group"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs group-hover:text-indigo-600 transition">
                        <Cpu />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{a.display_name}</span>
                          <span className="text-[10px] font-mono font-normal text-slate-400">
                            ({a.id})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[170px]">
                          {a.primary_domain}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
                        a.observed_liveness === 'LIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {a.observed_liveness}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-slate-100 font-mono">
                    <span className="truncate max-w-[150px]">
                      Task: <strong className="text-slate-600">{a.current_task_title || 'None assigned'}</strong>
                    </span>
                    <span className="text-indigo-600 font-semibold flex items-center gap-0.5 group-hover:translate-x-0.5 transition">
                      <span>Dispatch</span>
                      <ArrowUpRight />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Real-Time Immutable Event Stream */}
          <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3 flex-1 flex flex-col">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Activity />
                  <span>Real-Time Operational Event Bus</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Immutable record of state transitions, autonomous handoffs, and verifications
                </p>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1.5 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Feed
              </span>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto max-h-[360px] pr-1 font-mono text-xs">
              {recentEvents?.map((evt: any) => (
                <div
                  key={evt.id}
                  className="p-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl flex items-center justify-between text-[11px] hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="text-[10px] text-slate-400 font-semibold w-14">
                      {evt.ts.split('T')[1]?.slice(0, 8) || evt.ts}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                      {evt.type}
                    </span>
                    <span className="font-semibold text-slate-800">{evt.sender}</span>
                    <span className="text-slate-500 truncate max-w-[280px]">
                      {evt.task_title ? `[${evt.task_id}] ${evt.task_title}` : evt.payload || ''}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">{evt.task_id || ''}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column (5 cols): Tasks & Execution Queue + Recent Dispatches */}
        <div className="col-span-5 space-y-6 flex flex-col">
          {/* Work Queue & Interactive Task Manager */}
          <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 flex-1 flex flex-col">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers />
                  <span>Tasks & Execution Queue</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Update task statuses, assign agents, or inspect verification evidence
                </p>
              </div>
              <button
                onClick={() => setShowTaskModal(true)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                <Plus />
                <span>Add Task</span>
              </button>
            </div>

            <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[380px] pr-1">
              {activeTasks?.map((t: any) => (
                <div
                  key={t.id}
                  className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl space-y-2 text-xs hover:border-slate-300 transition"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                          {t.id}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                            t.priority === 'urgent'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {t.priority}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-800 mt-1">{t.title}</h3>
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

                  <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1.5 border-t border-slate-200/60 font-mono">
                    <span>
                      Assignee: <strong className="text-slate-700">{t.assignee_name || t.assignee_id || 'Unassigned'}</strong>
                    </span>
                    <button
                      onClick={() => setSelectedTask(t)}
                      className="text-indigo-600 font-semibold hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <span>Details</span>
                      <ArrowUpRight />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Direct Messages & Human Inboxes */}
          <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <MessageSquare />
                  <span>Recent Direct Inboxes & Messages</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Persistent inter-agent messages and human dispatches
                </p>
              </div>
              <Link
                href="/chat"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <span>Console</span>
                <ArrowUpRight />
              </Link>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto font-mono text-xs pr-1">
              {recentMessages?.map((m: any) => (
                <div
                  key={m.id}
                  className="p-2.5 bg-slate-50/60 border border-slate-200/60 rounded-xl space-y-1"
                >
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span className="font-semibold text-slate-700">
                      {m.from_identity} → {m.to_identity || 'Team'}
                    </span>
                    <span>{m.ts.split('T')[1]?.slice(0, 8) || m.ts}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 line-clamp-1 font-sans">
                    {m.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* MODAL 1: Dispatch Command to Agent */}
      {showDispatchModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Zap />
                <span>Dispatch Directive to Agent</span>
              </h3>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDispatch} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Target Agent</label>
                  <select
                    value={targetAgent}
                    onChange={(e) => setTargetAgent(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    {agents?.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.display_name} ({a.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Message Type</label>
                  <select
                    value={dispatchType}
                    onChange={(e) => setDispatchType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="COORDINATION">COORDINATION</option>
                    <option value="TASK_ASSIGNMENT">TASK_ASSIGNMENT</option>
                    <option value="APPROVAL_REQUEST">APPROVAL_REQUEST</option>
                    <option value="ESCALATION">ESCALATION</option>
                    <option value="BLOCKER">BLOCKER</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  Subject / Reference (Optional)
                </label>
                <input
                  type="text"
                  value={dispatchSubject}
                  onChange={(e) => setDispatchSubject(e.target.value)}
                  placeholder="e.g. DeployFleet bridge architecture review"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Directive Details</label>
                <textarea
                  value={dispatchBody}
                  onChange={(e) => setDispatchBody(e.target.value)}
                  rows={4}
                  placeholder={`Write directive or instructions for ${targetAgent}...`}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Send />
                  <span>{sending ? 'Dispatching...' : 'Dispatch'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create New Task */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Plus />
                <span>Assign New Task</span>
              </h3>
              <button
                onClick={() => setShowTaskModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Task ID</label>
                  <input
                    type="text"
                    value={taskId}
                    onChange={(e) => setTaskId(e.target.value)}
                    placeholder="e.g. TASK_008"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Assignee</label>
                  <select
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                  >
                    {agents?.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.display_name} ({a.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Verify DeployFleet Cross-DB Query Bridge"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  Description & Acceptance Criteria
                </label>
                <textarea
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  rows={3}
                  placeholder="Details and expected output artifacts..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Plus />
                  <span>Create Task</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Inspect Selected Task */}
      {selectedTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded">
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

            <div className="space-y-3 text-xs text-slate-600">
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
                  <strong>Creator:</strong> {selectedTask.creator}
                </div>
                <div>
                  <strong>Created:</strong> {selectedTask.created_at}
                </div>
              </div>

              {selectedTask.description && (
                <div>
                  <h4 className="font-semibold text-slate-700 mb-1">Description & Acceptance Criteria:</h4>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60">
                    <MarkdownDocument content={selectedTask.description} defaultExpanded={true} />
                  </div>
                </div>
              )}

              {selectedTask.original_file_path && (
                <div className="text-[10px] text-slate-400 font-mono">
                  Preserved file path: {selectedTask.original_file_path}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
