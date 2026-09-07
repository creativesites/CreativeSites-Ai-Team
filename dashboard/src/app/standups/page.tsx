'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  Users,
  RefreshCw,
  FileText,
} from '@/components/icons';
import { MarkdownDocument } from '@/components/MarkdownDocument';

export default function BentoStandupsPage() {
  const [standups, setStandups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/standups')
      .then((r) => r.json())
      .then((d) => setStandups(d.standups || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Header */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
            <Clock />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              Daily Standups & Operational Check-ins
            </h1>
            <p className="text-xs text-slate-500">
              Historical record of morning synchronization sessions, blockers, and commitments
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
          <Link href="/standups" className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold">
            Standups
          </Link>
          <Link href="/announcements" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Announcements
          </Link>
          <Link href="/incidents" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Incidents
          </Link>
        </nav>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl w-full mx-auto space-y-4">
        {loading && (
          <div className="p-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
            <RefreshCw />
            <span>Loading standup history...</span>
          </div>
        )}

        {!loading && standups.length === 0 && (
          <div className="p-12 text-center bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-2">
            <p className="text-xs text-slate-500">No standup logs on record.</p>
          </div>
        )}

        <div className="space-y-4">
          {standups.map((s) => (
            <div
              key={s.id}
              className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-3"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                    {s.standup_date}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    Facilitator: <strong className="text-slate-800">{s.facilitator || 'Self-Organized'}</strong>
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">{s.ts}</span>
              </div>

              {s.content && (
                <div className="pt-1">
                  <MarkdownDocument content={s.content} defaultExpanded={false} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
