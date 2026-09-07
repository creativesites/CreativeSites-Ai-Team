'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Clock,
  Users,
  RefreshCw,
  ArrowUpRight,
} from '@/components/icons';
import { MarkdownDocument } from '@/components/MarkdownDocument';

export default function BentoAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/announcements')
      .then((r) => r.json())
      .then((d) => setAnnouncements(d.announcements || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Header */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-inner">
            <FileText />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              Announcements & Team Bulletins
            </h1>
            <p className="text-xs text-slate-500">
              Organization-wide broadcasts, major architectural milestones, and governance updates
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
          <Link href="/announcements" className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold">
            Announcements
          </Link>
          <Link href="/standups" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Standups
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
            <span>Loading announcements...</span>
          </div>
        )}

        {!loading && announcements.length === 0 && (
          <div className="p-12 text-center bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-2">
            <p className="text-xs text-slate-500">No broadcasts currently on record.</p>
          </div>
        )}

        <div className="space-y-4">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Audience: {a.audience || 'All'}
                  </span>
                  <h2 className="text-sm font-bold text-slate-900 mt-2">{a.title}</h2>
                </div>
                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                  <Clock />
                  <span>{a.ts}</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 font-mono">
                Author: <strong className="text-slate-700">{a.author_identity}</strong>
              </div>

              {a.content && (
                <div className="pt-2 border-t border-slate-100">
                  <MarkdownDocument content={a.content} defaultExpanded={true} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
