'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((d) => setAgents(d.agents || []));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Agent Roster (/agents)</h1>
            <p className="text-sm text-slate-400">All registered agents and runtime statuses</p>
          </div>
          <Link href="/" className="text-xs text-blue-400 hover:underline">← Back to Command Center</Link>
        </header>

        <div className="grid grid-cols-2 gap-4">
          {agents.map((a) => (
            <div key={a.id} className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{a.symbol || '🤖'}</span>
                  <div>
                    <h2 className="font-bold text-slate-100">{a.display_name} ({a.id})</h2>
                    <p className="text-xs text-slate-400">{a.primary_domain}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                  a.observed_liveness === 'LIVE' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-800 text-slate-400'
                }`}>
                  {a.observed_liveness}
                </span>
              </div>

              <div className="text-xs text-slate-400 space-y-1 font-mono bg-slate-950 p-3 rounded border border-slate-800">
                <div><strong>Lane:</strong> {a.lane}</div>
                <div><strong>Confidence:</strong> {a.confidence_provenance}</div>
                <div><strong>Evidence Source:</strong> {a.evidence_source || 'N/A'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
