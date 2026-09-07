'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  ShieldCheck,
  Cpu,
  Clock,
  RefreshCw,
  ArrowUpRight,
} from '@/components/icons';

export default function BentoAgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((d) => setAgents(d.agents || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Header */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
            <Users />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              Agent Operational Roster & Identity Registry
            </h1>
            <p className="text-xs text-slate-500">
              Persistent agent identities, runtime session states, and verification evidence
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-1 text-xs font-medium">
          <Link href="/" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Cockpit
          </Link>
          <Link href="/chat" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Intercom
          </Link>
          <Link href="/agents" className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold">
            Agents
          </Link>
          <Link href="/work" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Work
          </Link>
        </nav>
      </header>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4 max-w-5xl mx-auto w-full">
        {agents.map((a) => (
          <div
            key={a.id}
            className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-3"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 shadow-2xs">
                  <Cpu />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-slate-900">
                    {a.display_name} ({a.id})
                  </h2>
                  <p className="text-xs text-slate-500">{a.primary_domain}</p>
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

            <div className="text-xs text-slate-600 space-y-1 font-mono bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
              <div>
                <strong>Lane:</strong> <span className="text-slate-800">{a.lane}</span>
              </div>
              <div>
                <strong>Confidence:</strong>{' '}
                <span className="text-emerald-700 font-bold">{a.confidence_provenance}</span>
              </div>
              <div className="truncate">
                <strong>Evidence:</strong>{' '}
                <span className="text-slate-500">{a.evidence_source || 'None on record'}</span>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Link
                href="/chat"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <span>Open in Cockpit</span>
                <ArrowUpRight />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
