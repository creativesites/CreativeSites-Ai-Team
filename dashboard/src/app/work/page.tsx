'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  Plus,
  RefreshCw,
  Clock,
  ArrowUpRight,
} from '@/components/icons';

export default function BentoWorkPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/tasks')
      .then((res) => res.json())
      .then((d) => setTasks(d.tasks || []))
      .finally(() => setLoading(false));
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', task_id: id, status: newStatus }),
      });
      const res = await fetch('/api/tasks');
      const d = await res.json();
      setTasks(d.tasks || []);
    } catch (e) {
      alert('Error updating status');
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 p-6 font-sans flex flex-col space-y-6">
      {/* Header */}
      <header className="bg-white p-4 px-6 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-inner">
            <Layers />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              Work & Execution Queue
            </h1>
            <p className="text-xs text-slate-500">
              Live task registry across MyaOS runtime and CreativeSites product initiatives
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
          <Link href="/work" className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold">
            Work
          </Link>
          <Link href="/agents" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
            Agents
          </Link>
        </nav>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl w-full mx-auto space-y-3">
        {loading && (
          <div className="p-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
            <RefreshCw />
            <span>Loading task queue...</span>
          </div>
        )}

        {tasks.map((t) => (
          <div
            key={t.id}
            className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs flex justify-between items-center text-xs hover:border-slate-300 transition"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  {t.id}
                </span>
                <h2 className="font-bold text-slate-900">{t.title}</h2>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-mono">
                Creator: <span className="text-slate-700">{t.creator}</span> • Assignee:{' '}
                <strong className="text-slate-800">{t.assignee_name || t.assignee_id || 'Unassigned'}</strong>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={t.status}
                onChange={(e) => handleUpdateStatus(t.id, e.target.value)}
                className={`text-[10px] font-bold uppercase rounded-lg px-2.5 py-1 border focus:outline-none cursor-pointer ${
                  t.status === 'done'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : t.status === 'in_progress'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                <option value="open">OPEN</option>
                <option value="in_progress">IN PROGRESS</option>
                <option value="verification">VERIFICATION</option>
                <option value="done">DONE</option>
                <option value="blocked">BLOCKED</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
