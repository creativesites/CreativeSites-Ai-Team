import React, { useCallback, useEffect, useState } from 'react';
import { ki, EvidenceRef } from '../../services/knowledgeApi';

export function useKi<T = any>(method: string, params: Record<string, unknown> = {}, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(params);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await ki<T>(method, JSON.parse(key))); setError(null); } catch (e: any) { setError(String(e?.message || e)); } finally { setLoading(false); }
  }, [method, key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload, ...deps]);
  return { data, error, loading, reload };
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200', amber: 'bg-amber-50 text-amber-700 border-amber-200', red: 'bg-rose-50 text-rose-700 border-rose-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200', zinc: 'bg-zinc-100 text-zinc-600 border-zinc-200', blue: 'bg-sky-50 text-sky-700 border-sky-200',
};
export const Pill: React.FC<{ tone?: keyof typeof TONES | string; children: React.ReactNode; title?: string }> = ({ tone = 'zinc', children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-md border ${TONES[tone] || TONES.zinc}`}>{children}</span>
);

const STATUS_TONE: Record<string, string> = {
  available: 'green', accepted: 'green', verified: 'green', fulfilled: 'green', verified_done: 'green', approved: 'green', resolved: 'green', done: 'green',
  proposed: 'amber', needs_confirmation: 'amber', requested: 'amber', stored: 'amber', extracting: 'blue', indexing: 'blue', extracted: 'blue', indexed: 'blue', reprocessing: 'blue',
  in_progress: 'blue', assigned: 'indigo', reported_done_unverified: 'amber',
  failed: 'red', overdue: 'red', blocked: 'red', disputed: 'red', open: 'red', rejected: 'zinc', superseded: 'zinc', archived: 'zinc', cancelled: 'zinc', closed: 'zinc',
};
export const StatusPill: React.FC<{ status: string }> = ({ status }) => <Pill tone={STATUS_TONE[status] || 'zinc'}>{status.replace(/_/g, ' ')}</Pill>;

export const Card: React.FC<{ title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, right, children, className = '' }) => (
  <section className={`bg-white rounded-3xl border border-zinc-200/80 shadow-xs ${className}`}>
    {title && (
      <header className="px-5 py-3 flex items-center justify-between border-b border-zinc-100">
        <h3 className="text-[11px] font-mono uppercase tracking-wider font-bold text-zinc-500">{title}</h3>{right}
      </header>
    )}
    <div className="p-5">{children}</div>
  </section>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="text-xs text-zinc-400 py-4 text-center">{children}</div>;
export const ErrorBox: React.FC<{ error: string | null }> = ({ error }) => (error ? <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-2">{error}</div> : null);
export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'ghost' | 'danger' }> = ({ kind = 'ghost', className = '', ...p }) => (
  <button {...p} className={`h-8 px-3 rounded-xl text-[11px] font-semibold transition cursor-pointer border disabled:opacity-40 disabled:cursor-not-allowed ${
    kind === 'primary' ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-black' : kind === 'danger' ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' : 'bg-zinc-100 text-zinc-800 border-zinc-200/80 hover:bg-zinc-200'} ${className}`} />
);
export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...p }) => (
  <input {...p} className={`h-8 px-3 rounded-xl border border-zinc-200 bg-white text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${className}`} />
);
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', ...p }) => (
  <select {...p} className={`h-8 px-2 rounded-xl border border-zinc-200 bg-white text-xs text-zinc-800 ${className}`} />
);
export const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string; onClick?: () => void }> = ({ label, value, tone = 'zinc', onClick }) => (
  <button onClick={onClick} className="text-left bg-white rounded-2xl border border-zinc-200/80 px-4 py-3 hover:border-indigo-200 transition cursor-pointer">
    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">{label}</div>
    <div className={`text-xl font-bold mt-0.5 ${tone === 'red' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-emerald-600' : 'text-zinc-800'}`}>{value}</div>
  </button>
);
export const Evidence: React.FC<{ refs?: EvidenceRef[] }> = ({ refs }) => (
  <span className="inline-flex flex-wrap gap-1 ml-1">{(refs || []).slice(0, 4).map((r) => <code key={r.type + r.id} title={r.label} className="text-[9px] bg-zinc-100 text-zinc-500 rounded px-1">{r.type}:{r.id.slice(0, 12)}</code>)}</span>
);
export const Confidence: React.FC<{ value: number }> = ({ value }) => (
  <span className="inline-flex items-center gap-1" title={`confidence ${Math.round(value * 100)}%`}>
    <span className="w-12 h-1.5 bg-zinc-100 rounded-full overflow-hidden"><span className={`block h-full ${value >= 0.75 ? 'bg-emerald-500' : value >= 0.5 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${Math.round(value * 100)}%` }} /></span>
    <span className="text-[10px] font-mono text-zinc-500">{Math.round(value * 100)}%</span>
  </span>
);
export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex flex-col gap-1"><span className="text-[10px] font-mono uppercase text-zinc-400 font-bold">{label}</span>{children}</label>
);
