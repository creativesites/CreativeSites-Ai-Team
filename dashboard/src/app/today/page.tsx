'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Zap,
  Clock,
  RefreshCw,
  Users,
  Layers,
  AlertCircle,
  CheckCircle,
  Cpu,
  ArrowUpRight,
  MessageSquare,
} from '@/components/icons';
import { MarkdownDocument } from '@/components/MarkdownDocument';

export default function BentoTodayPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadTodayState = async () => {
    try {
      const res = await fetch('/api/today');
      const d = await res.json();
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTodayState();
  }, []);

  const triggerAction = async (action: string, payload: any = {}) => {
    setProcessing(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const resData = await res.json();
      setActionMessage(resData.message || 'Action executed.');
      await loadTodayState();
    } catch (err: any) {
      alert(`Error executing ${action}: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-500 p-8 flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <div className="flex justify-center text-indigo-600 animate-spin">
            <RefreshCw />
          </div>
          <div className="text-sm font-semibold text-slate-800">
            Synthesizing Today&apos;s Orchestrator Briefing...
          </div>
        </div>
      </div>
    );
  }

  const { stats, narrative, openTasks, recentEvents, recentLearnings } = data || {};

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Minimalistic Today Briefing Header */}
      <header className="bg-white/80 backdrop-blur-xs px-5 py-3 rounded-2xl border border-slate-200/80 shadow-2xs flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-700">
            <Clock width={15} height={15} />
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">
              Today&apos;s Briefing
            </h1>
            <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200/60 font-mono">
              {data?.date}
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-xs text-slate-400">Orchestrator narrative & team lifecycle</span>
          </div>
        </div>

        {/* Global Batch Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => triggerAction('wake_all')}
            disabled={processing}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            <Zap width={12} height={12} />
            <span>Wake All</span>
          </button>

          <button
            onClick={() => triggerAction('wrap_up', { minutes: 30 })}
            disabled={processing}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            <Clock width={12} height={12} />
            <span>Wrap Up (30m)</span>
          </button>

          <button
            onClick={() => triggerAction('sleep_all')}
            disabled={processing}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span>Sleep</span>
          </button>
        </div>
      </header>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex justify-between items-center shadow-xs">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle />
            <span>{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-emerald-600 text-xs font-bold cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <section className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Agents Ready</span>
            <Users />
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono pt-1">
            <span className="text-emerald-600">{stats?.live_agents}</span>
            <span className="text-slate-400 text-sm font-normal"> / {stats?.total_agents}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Pipeline In Progress</span>
            <Layers />
          </div>
          <div className="text-2xl font-bold tracking-tight text-amber-600 font-mono pt-1">
            {stats?.open_tasks}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Verified Finished</span>
            <CheckCircle />
          </div>
          <div className="text-2xl font-bold tracking-tight text-emerald-600 font-mono pt-1">
            {stats?.done_tasks}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Pending Decisions</span>
            <AlertCircle />
          </div>
          <div className={`text-2xl font-bold tracking-tight font-mono pt-1 ${stats?.pending_decisions > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
            {stats?.pending_decisions}
          </div>
        </div>
      </section>

      {/* Main Grid: Narrative Story + Today's Priority Queue */}
      <div className="grid grid-cols-12 gap-6 flex-1">
        {/* Left Column (7 cols): Full Narrative Story */}
        <section className="col-span-7 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock />
                <span>Orchestrator Morning Briefing & State Narrative</span>
              </h2>
              <p className="text-xs text-slate-500">Autonomous synthesis of progress, blockers, and planned cycles</p>
            </div>
            <button
              onClick={loadTodayState}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw />
              <span>Resynthesize</span>
            </button>
          </div>

          <div className="p-4 bg-slate-50/70 border border-slate-200/60 rounded-xl leading-relaxed">
            <MarkdownDocument content={narrative} defaultExpanded={true} />
          </div>
        </section>

        {/* Right Column (5 cols): Active Tasks & Immediate Handoffs */}
        <section className="col-span-5 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers />
                <span>Active Execution Pipeline</span>
              </h2>
              <p className="text-xs text-slate-500">Tasks ready for pickup or actively running</p>
            </div>
            <Link href="/" className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1">
              <span>View Cockpit</span>
              <ArrowUpRight />
            </Link>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[440px] pr-1">
            {openTasks?.map((t: any) => (
              <div
                key={t.id}
                className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl space-y-2 text-xs"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                      {t.id}
                    </span>
                    <h3 className="font-semibold text-slate-800 mt-1">{t.title}</h3>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    {t.status}
                  </span>
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1.5 border-t border-slate-200/60 font-mono">
                  <span>Assignee: @{t.assignee_id || 'Unassigned'}</span>
                  <span className="uppercase text-slate-400 font-bold">{t.priority}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
