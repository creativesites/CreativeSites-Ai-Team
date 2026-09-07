'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Clock,
  RefreshCw,
  CheckCircle,
} from '@/components/icons';
import { MarkdownDocument } from '@/components/MarkdownDocument';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  superseded: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function BentoProposalsPage() {
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/proposals')
      .then((r) => r.json())
      .then((d) => setProposals(d.proposals || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Header */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
            <FileText />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              Technical & Architecture Proposals
            </h1>
            <p className="text-xs text-slate-500">
              RFCs, design documents, and systemic improvement proposals submitted by team agents
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
          <Link href="/proposals" className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold">
            Proposals
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
            <span>Loading proposals...</span>
          </div>
        )}

        {!loading && proposals.length === 0 && (
          <div className="p-12 text-center bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-2">
            <p className="text-xs text-slate-500">No proposals on record.</p>
          </div>
        )}

        <div className="space-y-4">
          {proposals.map((p) => (
            <div
              key={p.id}
              className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">{p.title}</h2>
                  <div className="text-[11px] text-slate-500 font-mono mt-1">
                    Author: <strong className="text-slate-700">{p.author_identity}</strong>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                    STATUS_STYLE[p.status] || STATUS_STYLE.draft
                  }`}
                >
                  {p.status}
                </span>
              </div>

              {p.content && (
                <div className="pt-2 border-t border-slate-100">
                  <MarkdownDocument content={p.content} defaultExpanded={false} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
