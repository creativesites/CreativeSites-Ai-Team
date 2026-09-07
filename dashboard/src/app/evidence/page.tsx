'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Terminal,
} from '@/components/icons';
import { MarkdownDocument } from '@/components/MarkdownDocument';

const CLASS_STYLE: Record<string, string> = {
  VERIFIED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OBSERVED: 'bg-blue-50 text-blue-700 border-blue-200',
  ATTESTED: 'bg-amber-50 text-amber-700 border-amber-200',
  DECLARED: 'bg-slate-100 text-slate-600 border-slate-200',
  UNKNOWN: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function BentoEvidencePage() {
  const [data, setData] = useState<any>({ evidence: [], summary: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/evidence')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Header */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-inner">
            <ShieldCheck />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              Evidence & Machine-Verification Ledger
            </h1>
            <p className="text-xs text-slate-500">
              &ldquo;Task complete&rdquo; is a claim. This page is the verifiable machine proof behind it.
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
          <Link href="/evidence" className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold">
            Evidence
          </Link>
          <Link href="/phase5" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Learning
          </Link>
        </nav>
      </header>

      {/* Summary Scoreboard */}
      <div className="max-w-5xl w-full mx-auto space-y-6">
        <div className="grid grid-cols-5 gap-3 text-center">
          {['total', 'verified', 'declared', 'unknown', 'failed'].map((k) => (
            <div key={k} className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
              <div className="text-2xl font-bold font-mono text-slate-900">
                {data.summary?.[k] ?? 0}
              </div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">
                {k}
              </div>
            </div>
          ))}
        </div>

        {/* Evidence Records */}
        <div className="space-y-4">
          {data.evidence.map((e: any) => (
            <div
              key={e.id}
              className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {e.task_title || e.task_id}
                  </h2>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    Verifier: <strong className="text-slate-700">{e.verifier_identity}</strong>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                    CLASS_STYLE[e.evidence_class] || CLASS_STYLE.UNKNOWN
                  }`}
                >
                  {e.evidence_class}
                </span>
              </div>

              {e.details && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs text-slate-700 leading-relaxed font-mono">
                  {e.details}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
