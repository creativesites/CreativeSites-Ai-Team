import React from 'react';
import { CheckSquare, AlertTriangle, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';
import { Approval } from '../../types/normalMode';

interface ApprovalCenterViewProps {
  approvals: Approval[];
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
}

export const ApprovalCenterView: React.FC<ApprovalCenterViewProps> = ({
  approvals,
  onApprove,
  onDecline,
}) => {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const pastApprovals = approvals.filter((a) => a.status !== 'pending');

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 px-2 font-sans select-none">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-amber-500" />
          <span>Approval & Autonomy Center</span>
        </h1>
        <p className="text-xs text-zinc-500">
          Review consequential external actions, deployments, and sensitive operations requested by digital coworkers.
        </p>
      </div>

      {/* Pending Approvals */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
          Needs Your Attention ({pendingApprovals.length})
        </h2>

        {pendingApprovals.length === 0 ? (
          <div className="bg-white border border-black/[0.06] rounded-3xl p-8 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <h3 className="text-sm font-semibold text-zinc-800">No pending approvals</h3>
            <p className="text-xs text-zinc-400">All digital coworker actions are running within defined safe boundaries.</p>
          </div>
        ) : (
          pendingApprovals.map((appr) => (
            <div
              key={appr.id}
              className="bg-amber-50/70 border border-amber-300/80 rounded-3xl p-5 space-y-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white font-bold flex items-center justify-center shrink-0 shadow-sm">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200 text-amber-950">
                        {appr.riskLevel} Risk
                      </span>
                      <span className="text-xs text-amber-800 font-mono">
                        Requested by {appr.coworkerName}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-amber-950">{appr.actionSummary}</h3>
                    <p className="text-xs text-amber-800 leading-relaxed">{appr.details}</p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-amber-200/70 flex items-center justify-between text-xs text-amber-900 font-mono">
                <span>Target: {appr.target}</span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onDecline(appr.id)}
                    className="px-4 py-1.5 bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => onApprove(appr.id)}
                    className="px-4 py-1.5 bg-amber-900 hover:bg-amber-950 text-white rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
                  >
                    Approve Action
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Past Decision History */}
      {pastApprovals.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-zinc-200">
          <h2 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
            Approval History
          </h2>

          {pastApprovals.map((appr) => (
            <div
              key={appr.id}
              className="bg-white border border-black/[0.06] rounded-2xl p-4 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-3">
                {appr.status === 'approved' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-500" />
                )}
                <div>
                  <h4 className="font-semibold text-zinc-900">{appr.actionSummary}</h4>
                  <span className="text-[10px] font-mono text-zinc-400">Target: {appr.target}</span>
                </div>
              </div>

              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono capitalize font-semibold ${
                  appr.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {appr.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
