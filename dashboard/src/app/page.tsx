'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function OperationalControlCenter() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Quick Action Dispatch Modal / Drawer
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

  // Selected Task Modal / Inspection
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
      <div className="min-h-screen bg-slate-950 text-slate-400 p-8 flex items-center justify-center font-sans">
        <div className="text-center space-y-2">
          <div className="text-2xl font-black text-white flex items-center justify-center gap-2">
            <span className="animate-spin text-blue-500">◈</span> Connecting to MyaOS Operational Substrate...
          </div>
          <p className="text-xs text-slate-500">Reading live state from data/myaos.db and community event bus...</p>
        </div>
      </div>
    );
  }

  const { pulse, agents, recentEvents, activeTasks, pendingDecisions, recentMessages, contradictions } = data || {};

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans flex flex-col space-y-6">
      {/* Global Top Command Header */}
      <header className="flex justify-between items-center bg-slate-900/60 p-4 rounded-xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 text-xl font-black">
            ◈
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white">CreativeSites MyaOS Operational Cockpit</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                LIVE SUBSTRATE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Preserved Multi-Agent Organization • Direct Winston Command Interface • Auto-refreshed: {lastRefreshed}
            </p>
          </div>
        </div>

        {/* Action Controls & Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setTargetAgent('atlas');
              setShowDispatchModal(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-blue-900/30 transition flex items-center gap-1.5"
          >
            <span>⚡</span> Dispatch Command
          </button>
          <button
            onClick={() => setShowTaskModal(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
          >
            <span>+</span> Assign New Task
          </button>
          <nav className="flex gap-2 text-xs font-semibold pl-4 border-l border-slate-800">
            <Link href="/" className="text-blue-400 px-3 py-2 rounded bg-slate-800/60 border border-slate-700">Cockpit</Link>
            <Link href="/chat" className="text-slate-400 hover:text-white px-3 py-2 rounded hover:bg-slate-800 transition">Intercom</Link>
            <Link href="/human" className="text-slate-400 hover:text-white px-3 py-2 rounded hover:bg-slate-800 transition">
              Approvals ({pulse?.pending_approvals || 0})
            </Link>
            <Link href="/phase5" className="text-slate-400 hover:text-white px-3 py-2 rounded hover:bg-slate-800 transition">Learning & Memory</Link>
          </nav>
        </div>
      </header>

      {/* Operational Pulse Metrics */}
      <div className="grid grid-cols-6 gap-3">
        <div className="p-3.5 bg-slate-900/50 border border-slate-800/80 rounded-xl space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agents Live / Total</div>
          <div className="text-2xl font-black text-white font-mono flex items-center gap-2">
            <span className="text-emerald-400">{pulse?.live_agents}</span>
            <span className="text-slate-600 text-base">/</span>
            <span className="text-slate-300 text-base">{pulse?.total_agents}</span>
          </div>
        </div>

        <div className="p-3.5 bg-slate-900/50 border border-slate-800/80 rounded-xl space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Open Tasks</div>
          <div className="text-2xl font-black text-amber-400 font-mono">{pulse?.open_tasks}</div>
        </div>

        <div className="p-3.5 bg-slate-900/50 border border-slate-800/80 rounded-xl space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Approvals</div>
          <div className={`text-2xl font-black font-mono ${pulse?.pending_approvals > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>
            {pulse?.pending_approvals}
          </div>
        </div>

        <div className="p-3.5 bg-slate-900/50 border border-slate-800/80 rounded-xl space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Recorded Events</div>
          <div className="text-2xl font-black text-emerald-400 font-mono">{pulse?.total_events}</div>
        </div>

        <div className="p-3.5 bg-slate-900/50 border border-slate-800/80 rounded-xl space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Persistent Messages</div>
          <div className="text-2xl font-black text-blue-400 font-mono">{pulse?.total_messages}</div>
        </div>

        <div className="p-3.5 bg-slate-900/50 border border-slate-800/80 rounded-xl space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contradictions Preserved</div>
          <div className="text-2xl font-black text-purple-400 font-mono">{contradictions?.length || 2}</div>
        </div>
      </div>

      {/* Main Two-Column Control Surface */}
      <div className="grid grid-cols-12 gap-6 flex-1">
        {/* Left 7 Columns: Active Agent Roster & Real-Time Operational Event Feed */}
        <div className="col-span-7 space-y-6 flex flex-col">
          {/* Active Agents Interactive Deck */}
          <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <span>👥</span> Active Agent Operational Roster
                </h2>
                <p className="text-xs text-slate-500">Click any agent to dispatch commands or open their full context</p>
              </div>
              <Link href="/chat" className="text-xs text-blue-400 hover:underline">
                Open Full Intercom →
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
                  className="p-3.5 bg-slate-950 border border-slate-800 hover:border-blue-500 rounded-lg space-y-2 cursor-pointer transition group shadow-sm hover:shadow-md hover:bg-slate-900/80"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl group-hover:scale-110 transition transform">{a.symbol || '🤖'}</span>
                      <div>
                        <div className="font-bold text-slate-100 text-xs flex items-center gap-1.5">
                          <span>{a.display_name}</span>
                          <span className="text-[9px] font-mono text-slate-500">({a.id})</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[170px]">{a.primary_domain}</div>
                      </div>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                        a.observed_liveness === 'LIVE'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {a.observed_liveness}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-900 pt-2 font-mono">
                    <span className="truncate max-w-[140px]">
                      Task: <strong className="text-slate-300">{a.current_task_title || 'None active'}</strong>
                    </span>
                    <span className="text-blue-400 group-hover:translate-x-0.5 transition font-bold">Dispatch →</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Real-Time Immutable Event Stream */}
          <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-3 flex-1 flex flex-col">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <span>📡</span> Live Operational Event Bus (What Is Happening Now)
                </h2>
                <p className="text-xs text-slate-500">Immutable ledger of autonomous task execution, dispatches, and state transitions</p>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" /> Real-Time Polling
              </span>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto max-h-[380px] font-mono text-xs pr-1">
              {recentEvents?.map((evt: any) => (
                <div
                  key={evt.id}
                  className="p-2.5 bg-slate-950 border border-slate-800/80 rounded-lg flex items-center justify-between text-[11px] hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="text-[9px] text-slate-500 font-bold w-12">{evt.ts.split('T')[1]?.slice(0, 8) || evt.ts}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-blue-300">
                      {evt.type}
                    </span>
                    <span className="font-bold text-slate-200">{evt.sender}</span>
                    <span className="text-slate-400 truncate max-w-[280px]">
                      {evt.task_title ? `[${evt.task_id}] ${evt.task_title}` : evt.payload || ''}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-600">{evt.task_id || ''}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right 5 Columns: Work & Task Queue with Interactive Actions + Recent Comms */}
        <div className="col-span-5 space-y-6 flex flex-col">
          {/* Work Queue & Interactive Task Manager */}
          <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4 flex-1 flex flex-col">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <span>📋</span> Tasks & Operational Execution
                </h2>
                <p className="text-xs text-slate-500">Live task states across MyaOS and the CreativeSites team</p>
              </div>
              <button
                onClick={() => setShowTaskModal(true)}
                className="text-xs text-blue-400 hover:underline font-bold"
              >
                + Add Task
              </button>
            </div>

            <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[420px] pr-1">
              {activeTasks?.map((t: any) => (
                <div
                  key={t.id}
                  className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2 text-xs hover:border-slate-700 transition"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-blue-400">{t.id}</span>
                        <span
                          className={`text-[8px] font-mono px-1 rounded uppercase font-bold ${
                            t.priority === 'urgent'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {t.priority}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-200 mt-1">{t.title}</h3>
                    </div>

                    {/* Status Toggle Dropdown */}
                    <select
                      value={t.status}
                      onChange={(e) => handleUpdateTaskStatus(t.id, e.target.value)}
                      className={`text-[10px] font-bold uppercase rounded px-2 py-1 border focus:outline-none cursor-pointer ${
                        t.status === 'done'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          : t.status === 'in_progress'
                          ? 'bg-blue-950 text-blue-300 border-blue-800'
                          : 'bg-amber-950 text-amber-300 border-amber-800'
                      }`}
                    >
                      <option value="open">OPEN</option>
                      <option value="in_progress">IN PROGRESS</option>
                      <option value="verification">VERIFICATION</option>
                      <option value="done">DONE</option>
                      <option value="blocked">BLOCKED</option>
                    </select>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-900 font-mono">
                    <span>
                      Assignee: <strong className="text-slate-300">{t.assignee_name || t.assignee_id || 'Unassigned'}</strong>
                    </span>
                    <button
                      onClick={() => setSelectedTask(t)}
                      className="text-blue-400 hover:underline"
                    >
                      View Details & Notes →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Direct Messages & Human Inboxes */}
          <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <span>💬</span> Recent Dispatches & Comms
                </h2>
                <p className="text-xs text-slate-500">Persistent inter-agent messages and human replies</p>
              </div>
              <Link href="/chat" className="text-xs text-blue-400 hover:underline">
                Open Console →
              </Link>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto font-mono text-xs pr-1">
              {recentMessages?.map((m: any) => (
                <div key={m.id} className="p-2.5 bg-slate-950 border border-slate-800/80 rounded-lg space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                    <span className="font-bold text-slate-300">
                      {m.from_identity} → {m.to_identity || 'Team'}
                    </span>
                    <span>{m.ts.split('T')[1]?.slice(0, 8) || m.ts}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 line-clamp-1 font-sans">{m.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* MODAL 1: Dispatch Command to Agent */}
      {showDispatchModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-black text-sm text-white flex items-center gap-2">
                <span>⚡</span> Dispatch Operational Command to Agent
              </h3>
              <button onClick={() => setShowDispatchModal(false)} className="text-slate-500 hover:text-white text-sm">
                ✕
              </button>
            </div>

            <form onSubmit={handleDispatch} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Target Agent</label>
                  <select
                    value={targetAgent}
                    onChange={(e) => setTargetAgent(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                  >
                    {agents?.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.symbol} {a.display_name} ({a.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Message Type</label>
                  <select
                    value={dispatchType}
                    onChange={(e) => setDispatchType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
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
                <label className="block text-slate-400 mb-1">Subject / Task Reference (Optional)</label>
                <input
                  type="text"
                  value={dispatchSubject}
                  onChange={(e) => setDispatchSubject(e.target.value)}
                  placeholder="e.g. DeployFleet bridge status audit"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Command Directive</label>
                <textarea
                  value={dispatchBody}
                  onChange={(e) => setDispatchBody(e.target.value)}
                  rows={4}
                  placeholder={`Provide instructions or request to ${targetAgent}...`}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-200 resize-none font-sans"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 bg-slate-800 rounded text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white font-bold transition disabled:opacity-50"
                >
                  {sending ? 'Dispatching...' : 'Dispatch Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create New Task */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-black text-sm text-white flex items-center gap-2">
                <span>📋</span> Assign New Task to Team
              </h3>
              <button onClick={() => setShowTaskModal(false)} className="text-slate-500 hover:text-white text-sm">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Task ID</label>
                  <input
                    type="text"
                    value={taskId}
                    onChange={(e) => setTaskId(e.target.value)}
                    placeholder="e.g. TASK_008"
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Assignee</label>
                  <select
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                  >
                    {agents?.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.symbol} {a.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Verify DeployFleet Cross-DB Query Bridge"
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description & Acceptance Criteria</label>
                <textarea
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  rows={3}
                  placeholder="Details and expected output artifacts..."
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 resize-none font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 bg-slate-800 rounded text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white font-bold transition"
                >
                  Create & Dispatch Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Inspect Selected Task Details */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <span className="font-mono text-xs text-blue-400">{selectedTask.id}</span>
                <h3 className="font-black text-base text-white">{selectedTask.title}</h3>
              </div>
              <button onClick={() => setSelectedTask(null)} className="text-slate-500 hover:text-white text-sm">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1">
                <div>
                  <strong>Status:</strong> <span className="uppercase text-amber-400">{selectedTask.status}</span>
                </div>
                <div>
                  <strong>Priority:</strong> <span className="uppercase">{selectedTask.priority}</span>
                </div>
                <div>
                  <strong>Assignee:</strong> {selectedTask.assignee_name || selectedTask.assignee_id || 'Unassigned'}
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
                  <h4 className="font-bold text-slate-400 mb-1">Description:</h4>
                  <p className="p-3 bg-slate-950 rounded border border-slate-800 text-slate-300 leading-relaxed">
                    {selectedTask.description}
                  </p>
                </div>
              )}

              {selectedTask.original_file_path && (
                <div className="text-[10px] text-slate-500 font-mono">
                  Preserved source file: {selectedTask.original_file_path}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 bg-slate-800 rounded text-slate-300 font-bold text-xs"
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
