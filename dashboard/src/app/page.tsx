'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function OverviewPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/overview')
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-slate-400">Loading Command Center...</div>;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-100">CreativeSites AI Team — Command Center</h1>
            <p className="text-sm text-slate-400">MyaOS v3.0 Real-time Multi-Agent Operations</p>
          </div>
          <nav className="flex gap-4 text-sm font-medium">
            <Link href="/" className="text-blue-400 border-b-2 border-blue-400 pb-1">Overview</Link>
            <Link href="/human" className="text-slate-400 hover:text-slate-200">Human Approval Queue</Link>
            <Link href="/agents" className="text-slate-400 hover:text-slate-200">Agents</Link>
            <Link href="/work" className="text-slate-400 hover:text-slate-200">Work</Link>
          </nav>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase">Total Agents</div>
            <div className="text-3xl font-bold text-slate-100 mt-2">{data?.summary?.total_agents || 0}</div>
          </div>
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase">Open Tasks</div>
            <div className="text-3xl font-bold text-amber-400 mt-2">{data?.summary?.open_tasks || 0}</div>
          </div>
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase">Pending Human Approvals</div>
            <div className="text-3xl font-bold text-rose-400 mt-2">{data?.summary?.pending_decisions || 0}</div>
          </div>
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase">Logged System Events</div>
            <div className="text-3xl font-bold text-emerald-400 mt-2">{data?.summary?.recent_events || 0}</div>
          </div>
        </div>

        {/* Agents Grid */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-slate-200">Active Roster & Identities</h2>
          <div className="grid grid-cols-4 gap-4">
            {data?.agents?.map((agent: any) => (
              <div key={agent.id} className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{agent.symbol || '🤖'}</span>
                  <div>
                    <h3 className="font-bold text-sm text-slate-100">{agent.display_name}</h3>
                    <p className="text-xs text-slate-500">{agent.lane}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2">{agent.primary_domain}</p>
                <div className="pt-2 flex justify-between items-center text-xs">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    agent.observed_liveness === 'LIVE' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {agent.observed_liveness}
                  </span>
                  <span className="text-slate-500 font-mono text-[10px]">{agent.confidence_provenance}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
