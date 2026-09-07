'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  MessageSquare,
  Send,
  Layers,
  ShieldCheck,
  Zap,
  RefreshCw,
  Cpu,
  Clock,
  ArrowUpRight,
} from '@/components/icons';
import { MarkdownDocument } from '@/components/MarkdownDocument';

export default function BentoChatConsole() {
  const [agents, setAgents] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'agents' | 'threads'>('agents');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('atlas');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // Cockpit details
  const [cockpitData, setCockpitData] = useState<any>(null);
  const [threadData, setThreadData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Message compose
  const [messageBody, setMessageBody] = useState('');
  const [messageType, setMessageType] = useState('COORDINATION');
  const [priority, setPriority] = useState('normal');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch('/api/conversations')
      .then((res) => res.json())
      .then((d) => {
        setAgents(d.agents || []);
        setThreads(d.threads || []);
      });
  }, []);

  const loadAgentCockpit = async (agentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations?agentId=${agentId}`);
      const data = await res.json();
      setCockpitData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadThreadTimeline = async (threadId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations?threadId=${threadId}`);
      const data = await res.json();
      setThreadData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'agents' && selectedAgentId) {
      loadAgentCockpit(selectedAgentId);
    }
  }, [activeTab, selectedAgentId]);

  useEffect(() => {
    if (activeTab === 'threads' && selectedThreadId) {
      loadThreadTimeline(selectedThreadId);
    }
  }, [activeTab, selectedThreadId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageBody.trim()) return;

    setSending(true);
    try {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_identity: 'Winston',
          to_identity: activeTab === 'agents' ? selectedAgentId : null,
          thread_id: activeTab === 'threads' ? selectedThreadId : null,
          subject: subject || null,
          body: messageBody,
          type: messageType,
          priority: priority,
        }),
      });

      setMessageBody('');
      setSubject('');

      if (activeTab === 'agents') {
        await loadAgentCockpit(selectedAgentId);
      } else if (selectedThreadId) {
        await loadThreadTimeline(selectedThreadId);
      }
    } catch (err: any) {
      alert(`Error sending: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Minimalistic Intercom Header */}
      <header className="bg-white/80 backdrop-blur-xs px-6 py-3 border-b border-slate-200/80 flex justify-between items-center shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-700">
            <MessageSquare width={15} height={15} />
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">
              Intercom & Chat
            </h1>
            <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200/60 font-mono">
              Dual-Store
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-xs text-slate-400">Direct agent & thread communication</span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Left Sidebar: Select Agent or Thread */}
        <aside className="w-80 bg-white border border-slate-200/80 rounded-2xl flex flex-col shadow-xs overflow-hidden">
          {/* Tabs */}
          <div className="grid grid-cols-2 p-2 gap-1 border-b border-slate-100 text-xs font-semibold bg-slate-50/50">
            <button
              onClick={() => setActiveTab('agents')}
              className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'agents' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Users />
              <span>Agents ({agents.length})</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('threads');
                if (!selectedThreadId && threads.length > 0) setSelectedThreadId(threads[0].id);
              }}
              className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'threads' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Layers />
              <span>Threads ({threads.length})</span>
            </button>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {activeTab === 'agents' ? (
              agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAgentId(a.id)}
                  className={`w-full text-left p-3 rounded-xl flex items-center justify-between text-xs transition cursor-pointer ${
                    selectedAgentId === a.id
                      ? 'bg-indigo-50/80 border border-indigo-200 text-slate-900'
                      : 'hover:bg-slate-50 text-slate-600 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs">
                      <Cpu />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{a.display_name}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[130px]">
                        {a.primary_domain}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      a.observed_liveness === 'LIVE' ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  />
                </button>
              ))
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedThreadId(t.id)}
                  className={`w-full text-left p-3 rounded-xl text-xs space-y-1 transition cursor-pointer ${
                    selectedThreadId === t.id
                      ? 'bg-indigo-50/80 border border-indigo-200 text-slate-900'
                      : 'hover:bg-slate-50 text-slate-600 border border-transparent'
                  }`}
                >
                  <div className="font-bold text-slate-900 line-clamp-1">{t.title}</div>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                    <span>{t.message_count || 0} messages</span>
                    <span className="uppercase text-[9px] px-1.5 py-0.5 bg-slate-100 rounded font-bold">
                      {t.status}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Center: Real-Time Communication Feed */}
        <section className="flex-1 bg-white border border-slate-200/80 rounded-2xl flex flex-col shadow-xs overflow-hidden">
          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare />
                <span>
                  {activeTab === 'agents'
                    ? `Conversation with ${cockpitData?.identity?.display_name || selectedAgentId}`
                    : threadData?.thread?.title || selectedThreadId}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeTab === 'agents'
                  ? `${cockpitData?.identity?.lane} lane • ${cockpitData?.identity?.primary_domain || ''}`
                  : `Status: ${threadData?.thread?.status || 'open'}`}
              </p>
            </div>
            <button
              onClick={() =>
                activeTab === 'agents'
                  ? loadAgentCockpit(selectedAgentId)
                  : loadThreadTimeline(selectedThreadId!)
              }
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw />
              <span>Refresh</span>
            </button>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4 max-h-[calc(100vh-340px)]">
            {activeTab === 'agents' ? (
              cockpitData?.messages?.length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-xs">
                  No recorded messages found for this agent. Send instructions below.
                </div>
              ) : (
                cockpitData?.messages?.map((m: any) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      m.from_identity === 'Winston' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-xl p-4 rounded-2xl text-xs leading-relaxed space-y-1.5 shadow-2xs ${
                        m.from_identity === 'Winston'
                          ? 'bg-indigo-600 text-white rounded-br-xs'
                          : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-xs'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] opacity-75 font-mono gap-4">
                        <span className="font-bold">
                          {m.from_identity} → {m.to_identity || 'Team'}
                        </span>
                        <span className="uppercase px-1.5 py-0.5 rounded bg-black/10 font-semibold">
                          {m.type}
                        </span>
                      </div>
                      {m.subject && (
                        <div className="font-semibold text-xs border-b border-black/10 pb-1">
                          {m.subject}
                        </div>
                      )}
                      <div className="pt-1">
                        <MarkdownDocument content={m.body} />
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono mt-1 px-1">
                      {m.ts}
                    </span>
                  </div>
                ))
              )
            ) : (
              threadData?.messages?.length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-xs">
                  No thread timeline entries recorded yet.
                </div>
              ) : (
                threadData?.messages?.map((m: any) => (
                  <div
                    key={m.id}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-2 shadow-2xs"
                  >
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span className="font-bold text-slate-800">{m.from_identity}</span>
                      <span>{m.ts}</span>
                    </div>
                    {m.subject && <div className="font-semibold text-slate-900">{m.subject}</div>}
                    <div className="pt-1">
                      <MarkdownDocument content={m.body} />
                    </div>
                  </div>
                ))
              )
            )}
          </div>

          {/* Dispatch Input Box */}
          <form
            onSubmit={handleSendMessage}
            className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2.5"
          >
            <div className="flex gap-2 text-xs">
              <select
                value={messageType}
                onChange={(e) => setMessageType(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:border-indigo-500"
              >
                <option value="COORDINATION">COORDINATION</option>
                <option value="TASK_ASSIGNMENT">TASK_ASSIGNMENT</option>
                <option value="APPROVAL_REQUEST">APPROVAL_REQUEST</option>
                <option value="ESCALATION">ESCALATION</option>
                <option value="BLOCKER">BLOCKER</option>
              </select>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:border-indigo-500"
              >
                <option value="normal">Normal Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent</option>
              </select>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Optional subject / task reference..."
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                rows={2}
                placeholder={
                  activeTab === 'agents'
                    ? `Dispatch directive to ${selectedAgentId}...`
                    : `Reply to thread...`
                }
                className="flex-1 bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 resize-none font-sans"
              />
              <button
                type="submit"
                disabled={sending}
                className="px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Send />
                <span>{sending ? 'Sending...' : 'Dispatch'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Right Sidebar: Contextual Cockpit */}
        {activeTab === 'agents' && (
          <aside className="w-80 bg-white border border-slate-200/80 rounded-2xl p-5 overflow-y-auto space-y-6 shadow-xs">
            {/* Identity Card */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldCheck />
                <span>Agent Identity</span>
              </div>
              <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/60 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-800 shadow-2xs">
                    <Cpu />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs">
                      {cockpitData?.identity?.display_name}
                    </div>
                    <div className="text-slate-500 text-[10px]">
                      {cockpitData?.identity?.lane} lane
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-600 font-mono pt-1">
                  Confidence:{' '}
                  <span className="text-emerald-700 font-bold">
                    {cockpitData?.identity?.confidence_provenance}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Evidence: {cockpitData?.identity?.evidence_source || 'None'}
                </div>
              </div>
            </div>

            {/* Active Tasks */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <Layers />
                  <span>Active Tasks</span>
                </span>
                <span className="text-amber-600 font-mono font-bold">
                  {cockpitData?.activeTasks?.length || 0}
                </span>
              </div>
              <div className="space-y-2">
                {cockpitData?.activeTasks?.length === 0 ? (
                  <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-200/60 text-slate-400 text-xs text-center">
                    No active tasks assigned.
                  </div>
                ) : (
                  cockpitData?.activeTasks?.map((t: any) => (
                    <div
                      key={t.id}
                      className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/60 space-y-1 text-xs"
                    >
                      <div className="font-semibold text-slate-900">{t.title}</div>
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                        <span>{t.id}</span>
                        <span className="uppercase font-bold text-amber-700">{t.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Institutional Memory Snippets */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <Zap />
                  <span>Learnings & Memory</span>
                </span>
                <span className="text-indigo-600 font-mono font-bold">
                  {cockpitData?.memory?.length || 0}
                </span>
              </div>
              <div className="space-y-2">
                {cockpitData?.memory?.length === 0 ? (
                  <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-200/60 text-slate-400 text-xs text-center">
                    No snippets recorded.
                  </div>
                ) : (
                  cockpitData?.memory?.map((m: any) => (
                    <div
                      key={m.id}
                      className="p-2.5 bg-slate-50/70 rounded-xl border border-slate-200/60 text-xs space-y-0.5"
                    >
                      <div className="font-mono font-bold text-[10px] text-indigo-600">{m.key}</div>
                      <div className="text-slate-700 text-[11px] leading-relaxed">{m.value}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
