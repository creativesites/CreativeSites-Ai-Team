'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Clock,
  RefreshCw,
  ShieldCheck,
  CheckCircle,
} from '@/components/icons';
import { MarkdownDocument } from '@/components/MarkdownDocument';

const SEV_STYLE: Record<string, string> = {
  P0: 'bg-rose-50 text-rose-700 border-rose-200',
  P1: 'bg-amber-50 text-amber-700 border-amber-200',
  P2: 'bg-blue-50 text-blue-700 border-blue-200',
  P3: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function BentoIncidentsPage() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/incidents')
      .then((r) => r.json())
      .then((d) => setIncidents(d.incidents || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Header */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-inner">
            <AlertCircle />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              System & Registry Incidents
            </h1>
            <p className="text-xs text-slate-500">
              Organizational learning starts here. A mistake in this record is data, not something to hide.
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
          <Link href="/incidents" className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold">
            Incidents
          </Link>
          <Link href="/announcements" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Announcements
          </Link>
          <Link href="/standups" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Standups
          </Link>
        </nav>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl w-full mx-auto space-y-4">
        {loading && (
          <div className="p-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
            <RefreshCw />
            <span>Loading incident history...</span>
          </div>
        )}

        {!loading && incidents.length === 0 && (
          <div className="p-12 text-center bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle />
            </div>
            <h3 className="font-bold text-sm text-slate-800">No Open Incidents</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              All runtime sockets, registry writers, and event streams operating without active Sev0/Sev1 breaches.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-xs text-slate-400">{inc.id}</div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      SEV_STYLE[inc.severity] || SEV_STYLE.P3
                    }`}
                  >
                    {inc.severity}
                  </span>
                  <span className="text-[10px] uppercase font-mono font-semibold text-slate-500">
                    {inc.status}
                  </span>
                </div>
              </div>

              <h2 className="text-sm font-bold text-slate-900">{inc.title}</h2>

              {inc.resolution && (
                <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                  <span className="text-slate-400 font-semibold">Resolution: </span>
                  {inc.resolution}
                </div>
              )}

              {inc.learning && (
                <div className="text-xs text-emerald-800 bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
                  <span className="text-emerald-600 font-semibold">Institutional Learning: </span>
                  {inc.learning}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
