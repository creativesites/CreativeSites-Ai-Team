'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  Users,
  FileText,
  ArrowUpRight,
} from '@/components/icons';

interface HumanDecision {
  id: string;
  task_id?: string;
  project_id?: string;
  decision_type: string;
  urgency: string;
  description: string;
  requested_by: string;
  status: string;
  decided_by?: string;
  decision_note?: string;
  requested_at: string;
  decided_at?: string;
}

export default function BentoHumanPage() {
  const [decisions, setDecisions] = useState<HumanDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDecisions = async () => {
    try {
      const res = await fetch('/api/human');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDecisions(data.decisions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDecisions();
  }, []);

  const handleDecision = async (id: string, decision: string) => {
    try {
      const res = await fetch('/api/human', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision, decided_by: 'Winston' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      fetchDecisions();
    } catch (err: any) {
      alert(`Error submitting decision: ${err.message}`);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Header */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-inner">
            <AlertCircle />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                Human Decisions & Approval Queue
              </h1>
              <span className="text-[10px] font-semibold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200">
                Winston Authorization Gate
              </span>
            </div>
            <p className="text-xs text-slate-500">
              High-impact actions requiring human signoff before autonomous execution
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
          <Link href="/human" className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold">
            Approvals
          </Link>
          <Link href="/phase5" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Learning & Memory
          </Link>
        </nav>
      </header>

      {/* Decision Queue Content */}
      <div className="max-w-4xl w-full mx-auto space-y-4">
        {loading && (
          <div className="p-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
            <RefreshCw />
            <span>Loading decision ledger...</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
            {error}
          </div>
        )}

        {!loading && decisions.length === 0 && (
          <div className="p-12 text-center bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle />
            </div>
            <h3 className="font-bold text-sm text-slate-800">All Approvals Clear</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No pending approval blockers or escalated actions requiring human signoff at this time.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {decisions.map((dec) => (
            <div
              key={dec.id}
              className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-3"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                      dec.urgency === 'urgent'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}
                  >
                    {dec.urgency}
                  </span>
                  <span className="text-xs font-mono font-semibold text-slate-600">
                    {dec.decision_type}
                  </span>
                  {dec.task_id && (
                    <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                      Task: {dec.task_id}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                  <Clock /> {dec.requested_at}
                </span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed font-sans">
                {dec.description}
              </p>

              <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                <div className="text-[11px] text-slate-400">
                  Requested by: <strong className="text-slate-700">{dec.requested_by}</strong>
                </div>

                {dec.status === 'pending' ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDecision(dec.id, 'APPROVED')}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
                    >
                      Approve Action
                    </button>
                    <button
                      onClick={() => handleDecision(dec.id, 'REJECTED')}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
                    >
                      Reject Action
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 font-mono">
                    Status: <strong className="text-slate-800">{dec.status}</strong> • Decision:{' '}
                    <strong className="text-slate-800">{dec.decided_by}</strong>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
