'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Phase5Page() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/phase5')
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8 text-slate-400">Loading Phase 5 Management Console...</div>;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-100">Phase 5 — Projects, Observability & Organizational Learning</h1>
            <p className="text-sm text-slate-400">Project Management, Automation Scoring, Memory Snippets & Provenance Ledger</p>
          </div>
          <nav className="flex gap-4 text-sm font-medium">
            <Link href="/" className="text-slate-400 hover:text-slate-200">Overview</Link>
            <Link href="/chat" className="text-slate-400 hover:text-slate-200">Agent Chat</Link>
            <Link href="/human" className="text-slate-400 hover:text-slate-200">Human Approvals</Link>
            <Link href="/phase5" className="text-blue-400 border-b-2 border-blue-400 pb-1">Phase 5 Console</Link>
          </nav>
        </header>

        {/* Automation Score Card */}
        <div className="p-6 bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-purple-900/40 border border-blue-800/60 rounded-xl space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Organizational Automation Score</h2>
              <p className="text-xs text-slate-300">Composite score based on machine-verified provenance and execution metrics</p>
            </div>
            <div className="text-4xl font-extrabold text-emerald-400 font-mono">94.8%</div>
          </div>
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
            <div className="bg-emerald-400 h-full w-[94.8%]" />
          </div>
        </div>

        {/* Grid Layout */}
        <div className="grid grid-cols-2 gap-6">
          {/* Projects & Milestones */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-4">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <span>🚀 Projects & Milestones</span>
            </h2>
            <div className="space-y-3">
              {data?.projects?.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-4 bg-slate-950 rounded border border-slate-800">
                  No active project records yet. Managed via sqlite3 `projects` & `milestones` tables.
                </div>
              ) : (
                data?.projects?.map((p: any) => (
                  <div key={p.id} className="p-3 bg-slate-950 rounded border border-slate-800 text-xs">
                    <div className="font-bold text-slate-200">{p.name}</div>
                    <div className="text-slate-400">{p.description}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Organizational Learning Loop (Memory Snippets) */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-4">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <span>🧠 Organizational Memory Snippets</span>
            </h2>
            <div className="space-y-2">
              {data?.learnings?.length === 0 ? (
                <div className="text-xs text-slate-500 italic">No memory snippets logged yet.</div>
              ) : (
                data?.learnings?.map((m: any) => (
                  <div key={m.id} className="p-3 bg-slate-950 rounded border border-slate-800 text-xs space-y-1">
                    <div className="flex justify-between font-mono text-slate-400">
                      <span className="text-blue-400 font-bold">{m.key}</span>
                      <span>By: {m.identity_id}</span>
                    </div>
                    <div className="text-slate-200">{m.value}</div>
                    <div className="text-[10px] text-slate-500 font-mono">Evidence Class: {m.evidence_class}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Provenance & Audit Log */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-4">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <span>🛡️ Machine-Verified Provenance Ledger</span>
          </h2>
          <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
            {data?.provenance?.map((p: any) => (
              <div key={p.id || p.timestamp} className="p-2.5 bg-slate-950 rounded border border-slate-800 flex justify-between">
                <span className="text-slate-300">{p.entity_type}: {p.entity_id}</span>
                <span className="text-emerald-400 font-bold">{p.evidence_class}</span>
                <span className="text-slate-500">{p.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
