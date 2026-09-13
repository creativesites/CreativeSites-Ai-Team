import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, XCircle, Clock, Send } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export interface HumanDecision {
  id: number;
  task_id?: string | null;
  project_id?: string | null;
  decision_type: string;
  urgency?: string | null;
  description: string;
  requested_by?: string | null;
  status: string;
  decided_by?: string | null;
  decision_note?: string | null;
  requested_at: string;
  decided_at?: string | null;
}

interface HumanApprovalGateProps {
  decisions: HumanDecision[];
  onDecisionProcessed: () => void;
}

export const HumanApprovalGate: React.FC<HumanApprovalGateProps> = ({
  decisions,
  onDecisionProcessed,
}) => {
  const [notes, setNotes] = useState<{ [key: number]: string }>({});
  const [submitting, setSubmitting] = useState<number | null>(null);

  if (!decisions || decisions.length === 0) {
    return null;
  }

  const handleDecision = async (decisionId: number, status: 'approved' | 'rejected') => {
    try {
      setSubmitting(decisionId);
      const note = notes[decisionId] || undefined;
      await invoke('myaos_record_decision', {
        decisionId,
        status,
        decidedBy: 'Executive',
        note,
      });
      onDecisionProcessed();
    } catch (err) {
      console.error('Failed to record decision:', err);
      alert(`Error recording decision: ${err}`);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-3 mb-5 select-none animate-card-entry">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-600">
          <ShieldAlert className="w-4 h-4 animate-bounce" />
          <span>Executive Sign-Off Required ({decisions.length})</span>
        </div>
        <span className="text-[10px] font-mono text-slate-400">MyaDesktop Approval Gate</span>
      </div>

      {decisions.map((dec) => {
        const isUrgent = dec.urgency === 'urgent' || dec.urgency === 'high';
        return (
          <div
            key={dec.id}
            className={`p-4.5 rounded-3xl border transition-all duration-300 shadow-mac-soft ${
              isUrgent
                ? 'bg-rose-50/70 border-rose-200/80 shadow-rose-500/5'
                : 'bg-amber-50/60 border-amber-200/70'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider ${
                      isUrgent
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-amber-500 text-white shadow-sm'
                    }`}
                  >
                    {dec.decision_type || 'APPROVAL'}
                  </span>
                  {dec.urgency && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider bg-white/80 text-slate-700 border border-slate-200/60">
                      Urgency: {dec.urgency}
                    </span>
                  )}
                  {dec.requested_by && (
                    <span className="text-xs font-semibold text-slate-600">
                      Requested by <strong className="text-slate-900">{dec.requested_by}</strong>
                    </span>
                  )}
                  {dec.task_id && (
                    <span className="text-[11px] font-mono font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-md border border-indigo-100">
                      {dec.task_id}
                    </span>
                  )}
                </div>

                <p className="text-xs font-semibold text-slate-800 leading-relaxed pt-1">
                  {dec.description}
                </p>

                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 pt-0.5 font-mono">
                  <Clock className="w-3 h-3" />
                  <span>{dec.requested_at}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                <button
                  disabled={submitting === dec.id}
                  onClick={() => handleDecision(dec.id, 'approved')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 shadow-mac-bevel shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve</span>
                </button>
                <button
                  disabled={submitting === dec.id}
                  onClick={() => handleDecision(dec.id, 'rejected')}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 active:scale-95 text-slate-700 border border-slate-200/80 rounded-2xl text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4 text-rose-500" />
                  <span>Reject</span>
                </button>
              </div>
            </div>

            {/* Optional Guidance Note Input */}
            <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center gap-2">
              <input
                type="text"
                placeholder="Optional executive feedback or instruction..."
                value={notes[dec.id] || ''}
                onChange={(e) =>
                  setNotes((prev) => ({ ...prev, [dec.id]: e.target.value }))
                }
                className="flex-1 bg-white/90 border border-slate-200/80 rounded-xl px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-inner"
              />
              <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                Logged to events
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
