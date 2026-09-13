import React from 'react';
import {
  FileCheck2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  GitPullRequest,
  Check,
  ArrowRight,
  Gauge,
} from 'lucide-react';
import { CodeReviewPayload } from '../services/geminiOrchestrator';

interface InChatCodeReviewCardProps {
  review: CodeReviewPayload;
  onApproveAndPR: (prTitle: string) => void;
  isApproving?: boolean;
}

export const InChatCodeReviewCard: React.FC<InChatCodeReviewCardProps> = ({
  review,
  onApproveAndPR,
  isApproving = false,
}) => {
  const isHighQuality = review.overallScore >= 80;

  return (
    <div className="mt-3.5 rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/40 via-white/95 to-teal-50/30 backdrop-blur-2xl p-4.5 space-y-3.5 font-sans shadow-xs transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-emerald-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                Code Review & Audit
              </span>
              <span className="text-xs font-mono font-medium text-zinc-500">
                Security: <strong className={review.securityAssessment === 'clean' ? 'text-emerald-700' : 'text-amber-700'}>{review.securityAssessment.toUpperCase()}</strong>
              </span>
            </div>
            <h4 className="text-xs font-bold text-zinc-900 mt-0.5">{review.headline}</h4>
          </div>
        </div>

        {/* Quality Gauge & 1-Click PR */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-emerald-200 shadow-2xs">
            <Gauge className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs font-mono font-bold text-zinc-800">{review.overallScore}/100</span>
          </div>

          <button
            onClick={() => onApproveAndPR(review.suggestedPrTitle)}
            disabled={isApproving}
            className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
          >
            <GitPullRequest className="w-3.5 h-3.5 text-emerald-400" />
            <span>Approve & Create PR</span>
            <ArrowRight className="w-3 h-3 ml-0.5" />
          </button>
        </div>
      </div>

      <p className="text-xs text-zinc-600 leading-relaxed font-sans">{review.impactSummary}</p>

      {/* High-Risk Areas / Scrutiny Points */}
      {review.highRiskAreas && review.highRiskAreas.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
            Critical Points Audited:
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {review.highRiskAreas.map((area, idx) => (
              <div
                key={idx}
                className="p-2 rounded-xl bg-white/90 border border-zinc-200/80 text-[11px] text-zinc-700 flex items-center gap-2"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">{area}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-1 border-t border-emerald-100/60">
        <span>Suggested PR: <strong>{review.suggestedPrTitle}</strong></span>
        <span className="text-emerald-700 font-bold">Un-mocked audit passed</span>
      </div>
    </div>
  );
};
