'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function WorkPage() {
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/tasks')
      .then((res) => res.json())
      .then((d) => setTasks(d.tasks || []));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Work & Task Queue (/work)</h1>
            <p className="text-sm text-slate-400">All tasks tracked in MyaOS v3.0</p>
          </div>
          <Link href="/" className="text-xs text-blue-400 hover:underline">← Back to Command Center</Link>
        </header>

        <div className="space-y-3">
          {tasks.map((t) => (
            <div key={t.id} className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-400">{t.id}</span>
                  <h2 className="font-semibold text-sm text-slate-200">{t.title}</h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">Creator: {t.creator} | Assignee: {t.assignee_id || 'Unassigned'}</p>
              </div>
              <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase ${
                t.status === 'done' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300'
              }`}>
                {t.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
