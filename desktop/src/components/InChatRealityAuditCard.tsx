import React, { useState } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Clock,
  Sparkles,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { RealityAuditPayload } from '../services/geminiOrchestrator';

interface InChatRealityAuditCardProps {
  audit: RealityAuditPayload;
  onRunAuditAndHeal: () => Promise<void>;
  onOpenProjects?: () => void;
  onOpenOkrs?: () => void;
}

export const InChatRealityAuditCard: React.FC<InChatRealityAuditCardProps> = ({
  audit,
  onRunAuditAndHeal,
  onOpenProjects,
  onOpenOkrs,
}) => {
  const [isHealing, setIsHealing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [lastHealedCount, setLastHealedCount] = useState(audit.autoHealedCount || 0);

  const handleHeal = async () => {
    setIsHealing(true);
    try {
      await onRunAuditAndHeal();
      setLastHealedCount((prev) => prev + 1);
    } finally {
      setIsHealing(false);
    }
  };

  const isHealthy = audit.healthScore >= 90;
  const isWarning = audit.healthScore >= 70 && audit.healthScore < 90;

  return (
    <div className="mt-3.5 rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/40 via-white/95 to-teal-50/30 backdrop-blur-2xl p-4.5 space-y-3 font-sans shadow-xs transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-emerald-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                Reality Engine Audit
              </span>
              <span className="text-xs font-mono font-semibold text-zinc-700">
                Substrate Truth Protocol
              </span>
            </div>
          </div>
        </div>

        {/* Health Score Pill */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl font-mono text-xs font-bold border shadow-2xs ${
              isHealthy
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : isWarning
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Health {audit.healthScore}%</span>
          </div>

          <button
            onClick={handleHeal}
            disabled={isHealing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-medium cursor-pointer shadow-xs active:scale-[0.98] transition disabled:opacity-50"
            title="Clean up stale tasks and reconcile untracked branches against git status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isHealing ? 'animate-spin' : ''}`} />
            <span>{isHealing ? 'Auditing...' : 'Auto-Heal'}</span>
          </button>
        </div>
      </div>

      {/* Summary Narrative */}
      <p className="text-[11.5px] text-zinc-600 leading-relaxed font-sans">
        {audit.summary}
      </p>

      {/* Key Finding Metric Badges */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="p-2.5 rounded-2xl bg-white/80 border border-zinc-200/80 flex flex-col">
          <span className="text-[9.5px] font-mono uppercase tracking-wider text-zinc-400">Untracked Branches</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm font-mono font-bold text-zinc-900">
              {audit.untrackedBranches?.length || 0}
            </span>
            <GitBranch className="w-3.5 h-3.5 text-zinc-400" />
          </div>
        </div>

        <div className="p-2.5 rounded-2xl bg-white/80 border border-zinc-200/80 flex flex-col">
          <span className="text-[9.5px] font-mono uppercase tracking-wider text-zinc-400">Stale Tasks</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm font-mono font-bold text-zinc-900">
              {audit.staleTasks?.length || 0}
            </span>
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
          </div>
        </div>

        <div className="p-2.5 rounded-2xl bg-white/80 border border-zinc-200/80 flex flex-col">
          <span className="text-[9.5px] font-mono uppercase tracking-wider text-zinc-400">Auto-Healed</span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm font-mono font-bold text-emerald-600">
              {lastHealedCount}
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
        </div>
      </div>

      {/* Collapsible Gaps & Untracked Items */}
      {((audit.untrackedBranches && audit.untrackedBranches.length > 0) || (audit.staleTasks && audit.staleTasks.length > 0)) && (
        <div className="pt-1">
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="flex items-center gap-1 text-[10.5px] font-mono text-zinc-500 hover:text-zinc-800 transition cursor-pointer"
          >
            {detailsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span>Inspect discrepancies ({ (audit.untrackedBranches?.length || 0) + (audit.staleTasks?.length || 0) } items)</span>
          </button>

          {detailsOpen && (
            <div className="mt-2 space-y-1.5 p-3 rounded-2xl bg-white border border-zinc-200/80 text-[11px] font-mono max-h-40 overflow-y-auto">
              {audit.untrackedBranches?.map((b, i) => (
                <div key={i} className="flex items-center justify-between text-zinc-700 py-0.5 border-b border-zinc-100 last:border-0">
                  <span className="flex items-center gap-1.5 truncate">
                    <GitBranch className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="truncate">{b.branch}</span>
                  </span>
                  <span className="text-[9.5px] text-zinc-400 shrink-0">{b.repo.split('/').pop()}</span>
                </div>
              ))}
              {audit.staleTasks?.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-zinc-700 py-0.5 border-b border-zinc-100 last:border-0">
                  <span className="flex items-center gap-1.5 truncate">
                    <Clock className="w-3 h-3 text-rose-500 shrink-0" />
                    <span className="truncate">{t.title}</span>
                  </span>
                  <span className="text-[9.5px] text-zinc-400 shrink-0">{t.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer Navigation Shortcuts */}
      <div className="flex items-center justify-between pt-2 border-t border-emerald-100 text-[10.5px]">
        <span className="text-zinc-400 font-mono">SQLite Single-Source of Truth: data/myaos.db</span>
        <div className="flex items-center gap-3">
          {onOpenProjects && (
            <button
              onClick={onOpenProjects}
              className="text-zinc-700 hover:text-zinc-950 font-medium flex items-center gap-1 cursor-pointer transition"
            >
              <span>View Tasks Board</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
          {onOpenOkrs && (
            <button
              onClick={onOpenOkrs}
              className="text-emerald-700 hover:text-emerald-950 font-medium flex items-center gap-1 cursor-pointer transition"
            >
              <span>View OKRs</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
