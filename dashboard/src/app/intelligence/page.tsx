'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zap, RefreshCw, AlertCircle } from '@/components/icons';

const AVAIL_STYLE: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unavailable: 'bg-slate-100 text-slate-500 border-slate-200',
  degraded: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function IntelligencePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch('/api/intelligence').then((r) => r.json()).then(setData).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
            <Zap />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">Intelligence Layer</h1>
            <p className="text-xs text-slate-500">Real provider/model state, routing decisions, and usage — every field is a live query, nothing simulated</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={load} className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition text-xs font-medium flex items-center gap-1">
            <RefreshCw width={12} height={12} /> Refresh
          </button>
          <Link href="/" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition text-xs font-medium">Cockpit</Link>
        </div>
      </header>

      {loading && <div className="p-12 text-center text-slate-400 text-xs">Loading...</div>}

      {data && (
        <div className="max-w-6xl w-full mx-auto space-y-6">
          {/* Models */}
          <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Models</h2>
            <div className="space-y-2">
              {data.models.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs">
                  <div>
                    <span className="font-mono font-semibold text-slate-800">{m.display_name || m.model_id}</span>
                    <span className="text-slate-400 ml-2">{m.provider} · {m.capability_tier}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">{m.last_checked ? `checked ${m.last_checked}` : 'never checked'}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${AVAIL_STYLE[m.availability] || AVAIL_STYLE.unavailable}`}>
                      {m.availability}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Usage */}
          <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 mb-1">Token Usage</h2>
            <p className="text-[11px] text-slate-400 mb-3">{data.usage.note}</p>
            {data.usage.byModel.length === 0 ? (
              <div className="text-xs text-slate-400 italic">No executions logged yet.</div>
            ) : (
              <div className="space-y-2">
                {data.usage.byModel.map((u: any) => (
                  <div key={u.modelId} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs font-mono">
                    <span>{u.modelId}</span>
                    <span className="text-slate-500">{u.attempts} attempts · {u.successes} ok · in {u.totalInputTokens ?? 'UNKNOWN'} / out {u.totalOutputTokens ?? 'UNKNOWN'} tokens · cost UNKNOWN</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent routing decisions - the "why" */}
          <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Recent Routing Decisions</h2>
            {data.recentDecisions.length === 0 ? (
              <div className="text-xs text-slate-400 italic">None yet.</div>
            ) : (
              <div className="space-y-2">
                {data.recentDecisions.map((d: any) => (
                  <div key={d.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs">
                    <div className="flex justify-between">
                      <span className="font-mono font-semibold">{d.task_id}</span>
                      <span className="text-slate-400">{d.created_at}</span>
                    </div>
                    <div className="text-slate-600 mt-1">Selected: <strong>{d.selected_model || 'none'}</strong> — {d.selected_reason}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Escalations */}
          <section className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5"><AlertCircle width={14} height={14} /> Escalations</h2>
            {data.recentEscalations.length === 0 ? (
              <div className="text-xs text-slate-400 italic">None yet — nothing has failed and escalated so far.</div>
            ) : (
              <div className="space-y-2">
                {data.recentEscalations.map((e: any) => (
                  <div key={e.id} className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs">
                    <span className="font-mono">{e.from_model_id} → {e.to_model_id}</span>
                    <span className="text-amber-700 ml-2">({e.failure_reason})</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
