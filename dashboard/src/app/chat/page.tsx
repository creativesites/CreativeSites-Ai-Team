'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ChatPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('atlas');
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((d) => setAgents(d.agents || []));
  }, []);

  const loadMessages = async () => {
    if (!selectedAgent) return;
    const res = await fetch(`/api/messages?agent_id=${selectedAgent}`);
    const data = await res.json();
    setMessages(data.messages || []);
  };

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [selectedAgent]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedAgent) return;

    setLoading(true);
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_id: selectedAgent,
          sender_id: 'winston',
          content: input,
        }),
      });
      setInput('');
      await loadMessages();
    } catch (err: any) {
      alert(`Error sending message: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8 flex flex-col">
      <div className="max-w-6xl w-full mx-auto flex-1 flex flex-col space-y-6">
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Live Agent Console & Intercom (/chat)</h1>
            <p className="text-sm text-slate-400">Direct multi-agent messaging & command dispatcher</p>
          </div>
          <nav className="flex gap-4 text-sm font-medium">
            <Link href="/" className="text-slate-400 hover:text-slate-200">Overview</Link>
            <Link href="/chat" className="text-blue-400 border-b-2 border-blue-400 pb-1">Agent Chat</Link>
            <Link href="/human" className="text-slate-400 hover:text-slate-200">Human Approvals</Link>
            <Link href="/phase5" className="text-slate-400 hover:text-slate-200">Phase 5 (Projects & Learning)</Link>
          </nav>
        </header>

        <div className="flex-1 grid grid-cols-4 gap-6 min-h-[500px]">
          {/* Agent Selector Sidebar */}
          <div className="col-span-1 bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Agent</h2>
            <div className="space-y-1">
              {agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAgent(a.id)}
                  className={`w-full text-left p-3 rounded-lg flex items-center justify-between text-sm transition ${
                    selectedAgent === a.id ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{a.symbol || '🤖'}</span>
                    <div>
                      <div>{a.display_name}</div>
                      <div className="text-[10px] opacity-75 font-normal">{a.primary_domain}</div>
                    </div>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${a.observed_liveness === 'LIVE' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Chat Stream Window */}
          <div className="col-span-3 bg-slate-900 border border-slate-800 rounded-lg flex flex-col">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <div>
                <h2 className="font-bold text-slate-100 flex items-center gap-2">
                  <span>Chatting with {selectedAgent.toUpperCase()}</span>
                </h2>
                <p className="text-xs text-slate-400">Direct message log & task dispatcher</p>
              </div>
              <button onClick={loadMessages} className="text-xs text-slate-400 hover:text-slate-200 underline">Refresh Stream</button>
            </div>

            {/* Message History */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[400px]">
              {messages.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">No messages yet with {selectedAgent}. Send a command below!</div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex flex-col ${m.sender_id === 'winston' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-xl p-3 rounded-lg text-sm ${
                      m.sender_id === 'winston' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700'
                    }`}>
                      <div className="text-[10px] opacity-75 mb-1 font-mono">{m.sender_id} → {m.recipient_id}</div>
                      <p>{m.content}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 font-mono">{m.timestamp}</span>
                  </div>
                ))
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={sendMessage} className="p-4 border-t border-slate-800 flex gap-2 bg-slate-950/50">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Message ${selectedAgent}...`}
                className="flex-1 bg-slate-900 border border-slate-700 rounded px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded text-sm transition"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
