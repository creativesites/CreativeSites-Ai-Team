import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Cpu, Terminal, Clock } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export interface EvidenceRecord {
  id: number;
  task_id: string;
  verifier_identity: string;
  evidence_class: string;
  passed: number;
  details?: string | null;
  exit_code?: number | null;
  verified_files?: string | null;
  created_at: string;
}

export const QualityView: React.FC = () => {
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [filter, setFilter] = useState<'all' | 'verified' | 'passed'>('all');
  const [loading, setLoading] = useState(true);

  const fetchEvidence = async () => {
    try {
      setLoading(true);
      const res = await invoke<EvidenceRecord[]>('myaos_get_evidence', { limit: 50 });
      setEvidence(res);
    } catch (e) {
      console.error('Failed to load evidence records:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvidence();
  }, []);

  const filteredEvidence = evidence.filter((e) => {
    if (filter === 'verified') return e.evidence_class === 'VERIFIED';
    if (filter === 'passed') return e.passed === 1;
    return true;
  });

  const totalProofs = evidence.length;
  const passedProofs = evidence.filter((e) => e.passed === 1).length;
  const passRate = totalProofs > 0 ? Math.round((passedProofs / totalProofs) * 100) : 100;

  return (
    <div className="space-y-6 font-sans select-none animate-card-entry">
      {/* Header */}
      <div className="bg-white border border-white/80 p-6 rounded-3xl flex justify-between items-center shadow-mac-soft">
        <div>
          <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500 animate-pulse" />
            <span>Quality & Machine Proof Vault</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Independent machine-observed verification ledger enforcing the Anti-Self-Verification rule
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(['all', 'verified', 'passed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold font-mono uppercase tracking-wider transition cursor-pointer ${
                filter === f
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-white/80 shadow-mac-soft space-y-1">
          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
            Pass Rate
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 flex items-baseline gap-1 pt-1">
            <span>{passRate}%</span>
            <span className="text-xs text-slate-400 font-sans">({passedProofs}/{totalProofs} passed)</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-white/80 shadow-mac-soft space-y-1">
          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
            Independent Verifier
          </div>
          <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5 pt-1">
            <Cpu className="w-4 h-4 text-indigo-500" />
            <span>Kael 🛡️ & Antigravity Automated QA</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-white/80 shadow-mac-soft space-y-1">
          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
            Substrate Truth
          </div>
          <div className="text-xs font-mono font-bold text-indigo-600 pt-1">
            data/myaos.db (evidence table)
          </div>
        </div>
      </div>

      {/* Proofs List */}
      <div className="space-y-3">
        {filteredEvidence.length > 0 ? (
          filteredEvidence.map((rec) => (
            <div
              key={rec.id}
              className="bg-white border border-white/80 p-5 rounded-3xl shadow-mac-soft hover:shadow-mac-deep transition-all duration-300 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {rec.passed === 1 ? (
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                      <XCircle className="w-4 h-4" />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-indigo-600 text-xs">
                        {rec.task_id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider ${
                          rec.evidence_class === 'VERIFIED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rec.evidence_class === 'OBSERVED'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {rec.evidence_class}
                      </span>
                      {rec.exit_code !== undefined && rec.exit_code !== null && (
                        <span className="px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold bg-slate-100 text-slate-600">
                          Exit Code: {rec.exit_code}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                      Verified by <strong className="text-slate-800">{rec.verifier_identity}</strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                  <Clock className="w-3 h-3" />
                  <span>{rec.created_at}</span>
                </div>
              </div>

              {rec.details && (
                <p className="text-xs text-slate-700 font-sans leading-relaxed bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                  {rec.details}
                </p>
              )}

              {rec.verified_files && rec.verified_files !== '[]' && (
                <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2">
                  <span className="text-slate-400">Verified Files:</span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded-md text-slate-700">
                    {rec.verified_files}
                  </span>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-slate-400 font-mono text-xs">
            No verification proofs found.
          </div>
        )}
      </div>
    </div>
  );
};
