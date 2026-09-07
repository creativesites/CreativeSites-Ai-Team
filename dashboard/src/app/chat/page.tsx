'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ChatConsole() {
  const [agents, setAgents] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'agents' | 'threads'>('agents');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('atlas');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  
  // Cockpit details
  const [cockpitData, setCockpitData] = useState<any>(null);
  const [threadData, setThreadData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Message compose form
  const [messageBody, setMessageBody] = useState('');
  const [messageType, setMessageType] = useState('COORDINATION');
  const [priority, setPriority] = useState('normal');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);

  // Initial load
  useEffect(() => {
    fetch('/api/conversations')
      .then((res) => res.json())
      .then((d) => {
        setAgents(d.agents || []);
        setThreads(d.threads || []);
      });
  }, []);

  // Fetch Agent Cockpit
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

  // Fetch Thread Timeline
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
          priority: priority
        })
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
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="text-xl font-black tracking-tight text-white flex items-center gap-2">
            <span className="text-blue-500">◈</span> MyaOS Multi-Agent Intercom & Cockpit
          </div>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">v3.0 Operational</span>
        </div>
        <nav className="flex gap-4 text-xs font-semibold">
          <Link href="/" className="text-slate-400 hover:text-white transition">Overview</Link>
          <Link href="/chat" className="text-blue-400 border-b border-blue-400 pb-0.5">Console & Intercom</Link>
          <Link href="/human" className="text-slate-400 hover:text-white transition">Decisions</Link>
          <Link href="/phase5" className="text-slate-400 hover:text-white transition">Phase 5 (Projects & Memory)</Link>
        </nav>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Nav Column: Select Agent or Thread */}
        <aside className="w-72 border-r border-slate-800 bg-slate-900/30 flex flex-col">
          {/* Switcher Tabs */}
          <div className="grid grid-cols-2 p-2 gap-1 border-b border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('agents')}
              className={`py-1.5 rounded transition ${activeTab === 'agents' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              Agents ({agents.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('threads');
                if (!selectedThreadId && threads.length > 0) setSelectedThreadId(threads[0].id);
              }}
              className={`py-1.5 rounded transition ${activeTab === 'threads' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              Threads ({threads.length})
            </button>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {activeTab === 'agents' ? (
              agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAgentId(a.id)}
                  className={`w-full text-left p-2.5 rounded-lg flex items-center justify-between text-xs transition ${
                    selectedAgentId === a.id ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{a.symbol || '🤖'}</span>
                    <div>
                      <div className="font-bold text-slate-200">{a.display_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[130px]">{a.primary_domain}</div>
                    </div>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${a.observed_liveness === 'LIVE' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                </button>
              ))
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedThreadId(t.id)}
                  className={`w-full text-left p-2.5 rounded-lg text-xs space-y-1 transition ${
                    selectedThreadId === t.id ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-bold text-slate-200 line-clamp-1">{t.title}</div>
                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                    <span>{t.message_count || 0} messages</span>
                    <span className="uppercase text-[9px] px-1 bg-slate-900 rounded">{t.status}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Center: Real-Time Chat & Timeline Stream */}
        <section className="flex-1 flex flex-col border-r border-slate-800">
          {/* Header Info */}
          <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/20 flex justify-between items-center">
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                {activeTab === 'agents' ? (
                  <>
                    <span>{cockpitData?.identity?.symbol}</span>
                    <span>Chatting with {cockpitData?.identity?.display_name || selectedAgentId}</span>
                  </>
                ) : (
                  <span>{threadData?.thread?.title || selectedThreadId}</span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                {activeTab === 'agents' 
                  ? `${cockpitData?.identity?.lane || 'Lane'} • ${cockpitData?.identity?.primary_domain || ''}`
                  : `Thread Status: ${threadData?.thread?.status || 'open'}`}
              </p>
            </div>
            <button
              onClick={() => activeTab === 'agents' ? loadAgentCockpit(selectedAgentId) : loadThreadTimeline(selectedThreadId!)}
              className="text-xs text-slate-400 hover:text-white bg-slate-800 px-2.5 py-1 rounded"
            >
              Refresh
            </button>
          </div>

          {/* Conversation Feed */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4 max-h-[calc(100vh-250px)]">
            {activeTab === 'agents' ? (
              cockpitData?.messages?.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs">No direct message history found with this agent. Send a command below.</div>
              ) : (
                cockpitData?.messages?.map((m: any) => (
                  <div key={m.id} className={`flex flex-col ${m.from_identity === 'Winston' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-xl p-3.5 rounded-lg text-xs leading-relaxed space-y-1.5 ${
                      m.from_identity === 'Winston' ? 'bg-blue-600 text-white' : 'bg-slate-900 border border-slate-800 text-slate-200'
                    }`}>
                      <div className="flex justify-between items-center text-[10px] opacity-75 font-mono">
                        <span className="font-bold">{m.from_identity} → {m.to_identity || 'Team'}</span>
                        <span className="uppercase px-1 rounded bg-black/20">{m.type}</span>
                      </div>
                      {m.subject && <div className="font-semibold text-[11px]">{m.subject}</div>}
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                    <span className="text-[9px] text-slate-500 font-mono mt-1">{m.ts}</span>
                  </div>
                ))
              )
            ) : (
              threadData?.messages?.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs">No messages recorded in this thread yet.</div>
              ) : (
                threadData?.messages?.map((m: any) => (
                  <div key={m.id} className="p-3.5 bg-slate-900 border border-slate-800 rounded-lg text-xs space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span className="font-bold text-slate-200">{m.from_identity}</span>
                      <span>{m.ts}</span>
                    </div>
                    {m.subject && <div className="font-semibold text-slate-100">{m.subject}</div>}
                    <p className="text-slate-300 whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))
              )
            )}
          </div>

          {/* Dispatch Bar */}
          <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 bg-slate-900/40 space-y-2">
            <div className="flex gap-2 text-xs">
              <select
                value={messageType}
                onChange={(e) => setMessageType(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-300 focus:outline-none"
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
                className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-300 focus:outline-none"
              >
                <option value="normal">Normal Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent</option>
              </select>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Optional subject / task ref..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded px-3 py-1 text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                rows={2}
                placeholder={activeTab === 'agents' ? `Dispatch command or message to ${selectedAgentId}...` : `Reply to thread ${selectedThreadId}...`}
                className="flex-1 bg-slate-900 border border-slate-800 rounded p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              />
              <button
                type="submit"
                disabled={sending}
                className="px-6 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-xs transition disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Dispatch'}
              </button>
            </div>
          </form>
        </section>

        {/* Right Sidebar: Contextual Cockpit */}
        {activeTab === 'agents' && (
          <aside className="w-80 p-5 overflow-y-auto bg-slate-900/20 space-y-6 text-xs border-l border-slate-800/60">
            <div>
              <h3 className="font-bold text-slate-100 uppercase tracking-wider text-[10px] text-slate-400 mb-3">Agent Cockpit</h3>
              <div className="p-3.5 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{cockpitData?.identity?.symbol}</span>
                  <div>
                    <div className="font-bold text-slate-200 text-sm">{cockpitData?.identity?.display_name}</div>
                    <div className="text-slate-400 text-[10px]">{cockpitData?.identity?.lane} lane</div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-300 font-mono pt-1">
                  Confidence: <span className="text-emerald-400 font-bold">{cockpitData?.identity?.confidence_provenance}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Evidence: {cockpitData?.identity?.evidence_source || 'None'}
                </div>
              </div>
            </div>

            {/* Active Tasks */}
            <div>
              <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[10px] mb-2 flex justify-between">
                <span>Active Tasks</span>
                <span className="text-amber-400">{cockpitData?.activeTasks?.length || 0}</span>
              </h4>
              <div className="space-y-2">
                {cockpitData?.activeTasks?.length === 0 ? (
                  <div className="p-2.5 bg-slate-900/50 rounded border border-slate-800/60 text-slate-500 text-[11px]">No open tasks assigned.</div>
                ) : (
                  cockpitData?.activeTasks?.map((t: any) => (
                    <div key={t.id} className="p-2.5 bg-slate-900 rounded border border-slate-800 space-y-1">
                      <div className="font-bold text-slate-200 text-[11px]">{t.title}</div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span className="font-mono">{t.id}</span>
                        <span className="uppercase text-amber-400">{t.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Organizational Memory Snippets */}
            <div>
              <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[10px] mb-2 flex justify-between">
                <span>Learnings & Memory</span>
                <span className="text-blue-400">{cockpitData?.memory?.length || 0}</span>
              </h4>
              <div className="space-y-1.5">
                {cockpitData?.memory?.length === 0 ? (
                  <div className="p-2.5 bg-slate-900/50 rounded border border-slate-800/60 text-slate-500 text-[11px]">No snippets logged.</div>
                ) : (
                  cockpitData?.memory?.map((m: any) => (
                    <div key={m.id} className="p-2 bg-slate-900 rounded border border-slate-800 text-[10px] space-y-0.5">
                      <div className="font-bold text-blue-400 font-mono">{m.key}</div>
                      <div className="text-slate-300">{m.value}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Verification Records */}
            <div>
              <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[10px] mb-2 flex justify-between">
                <span>Verification Authority</span>
                <span className="text-purple-400">{cockpitData?.verificationRecords?.length || 0}</span>
              </h4>
              <div className="space-y-1.5">
                {cockpitData?.verificationRecords?.length === 0 ? (
                  <div className="p-2.5 bg-slate-900/50 rounded border border-slate-800/60 text-slate-500 text-[11px]">No verified tasks.</div>
                ) : (
                  cockpitData?.verificationRecords?.map((v: any) => (
                    <div key={v.id} className="p-2 bg-slate-900 rounded border border-slate-800 text-[10px]">
                      <div className="font-mono font-bold text-purple-300">{v.task_id}</div>
                      <div className="text-slate-400">Class: {v.evidence_class}</div>
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
