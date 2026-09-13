import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Terminal,
  ShieldCheck,
  FileText,
  ChevronDown,
  ChevronUp,
  Share2,
  RotateCw,
  ExternalLink,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { Job, Coworker } from '../../types/normalMode';

interface JobDetailViewProps {
  job: Job;
  coworkers: Coworker[];
  onBack: () => void;
  onApprove?: (approvalId: string) => void;
  onDecline?: (approvalId: string) => void;
}

export const JobDetailView: React.FC<JobDetailViewProps> = ({
  job,
  coworkers,
  onBack,
  onApprove,
  onDecline,
}) => {
  const [showTechnicalLogs, setShowTechnicalLogs] = useState(false);

  const assignedCoworkerObjects = coworkers.filter((cw) =>
    job.assignedCoworkers.includes(cw.id)
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 px-2 font-sans select-none">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-200 text-xs font-semibold text-zinc-700 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to My Work</span>
        </button>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span>Job ID: {job.id}</span>
        </div>
      </div>

      {/* Main Job Banner Header */}
      <div className="bg-white border border-black/[0.08] shadow-sm rounded-3xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-bold ${
                job.status === 'completed'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : job.status === 'working'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {job.status.replace('_', ' ')}
              </span>

              {job.evidencePassed && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>Verified Proof</span>
                </span>
              )}
            </div>

            <h1 className="text-xl font-bold text-zinc-900 leading-snug">
              {job.title}
            </h1>
            <p className="text-xs text-zinc-500 font-mono">
              Prompt: "{job.userPrompt}"
            </p>
          </div>

          {/* Coworker Monograms */}
          <div className="flex items-center -space-x-2 shrink-0">
            {assignedCoworkerObjects.map((cw) => (
              <div
                key={cw.id}
                className={`w-9 h-9 rounded-2xl ${cw.color} text-white font-bold flex items-center justify-center text-xs ring-2 ring-white shadow-sm`}
                title={`${cw.name} (${cw.title})`}
              >
                {cw.monogram}
              </div>
            ))}
          </div>
        </div>

        {/* Progress Stepper Bar */}
        <div className="space-y-2 pt-2 border-t border-zinc-100">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-500">
            <span>Stage Progression</span>
            <span>{job.progressPercentage}% Complete</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {job.stages.map((st) => {
              const isDone = st.status === 'completed';
              const isWorking = st.status === 'working';
              return (
                <div key={st.id} className="space-y-1">
                  <div className={`h-1.5 rounded-full transition-all duration-300 ${
                    isDone ? 'bg-emerald-500' : isWorking ? 'bg-indigo-600 animate-pulse' : 'bg-zinc-200'
                  }`} />
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 truncate">
                    <span className={isWorking ? 'font-bold text-indigo-700' : ''}>{st.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pending Risk Approval Banner (If applicable) */}
      {job.pendingApproval && job.pendingApproval.status === 'pending' && (
        <div className="bg-amber-50/80 border border-amber-300/80 rounded-3xl p-5 space-y-3 animate-card-entry">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-900">
                  Approval Required ({job.pendingApproval.riskLevel})
                </span>
                <span className="text-xs text-amber-700 font-mono">
                  Requested by {job.pendingApproval.coworkerName}
                </span>
              </div>
              <h3 className="text-sm font-bold text-amber-950">
                {job.pendingApproval.actionSummary}
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed">
                {job.pendingApproval.details}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/60">
            {onDecline && (
              <button
                onClick={() => onDecline(job.pendingApproval!.id)}
                className="px-4 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Decline
              </button>
            )}
            {onApprove && (
              <button
                onClick={() => onApprove(job.pendingApproval!.id)}
                className="px-4 py-1.5 bg-amber-900 hover:bg-amber-950 text-white rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
              >
                Approve Action
              </button>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────  HUMANIZED ACTIVITY STREAM  ────────────────── */}
      <div className="bg-white border border-black/[0.08] shadow-sm rounded-3xl p-6 space-y-4">
        <h2 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span>Coworker Activity Feed</span>
        </h2>

        <div className="space-y-3 pl-2 border-l-2 border-zinc-100">
          {job.humanizedLog.map((logItem, idx) => (
            <div key={idx} className="flex items-start gap-3 text-xs leading-relaxed text-zinc-700 font-sans">
              <span className="w-2 h-2 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
              <span>{logItem}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ──────────────────  GENERATED ARTIFACTS  ────────────────── */}
      {job.artifacts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>Generated Artifact Result</span>
          </h2>

          {job.artifacts.map((art) => (
            <div key={art.id} className="bg-white border border-black/[0.08] shadow-md rounded-3xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    {art.type.replace('_', ' ')}
                  </span>
                  <h3 className="text-base font-bold text-zinc-900">{art.title}</h3>
                  {art.subtitle && (
                    <p className="text-xs font-mono text-zinc-500">{art.subtitle}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(art.content)}
                    className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Metrics row */}
              {art.metrics && art.metrics.length > 0 && (
                <div className="grid grid-cols-3 gap-3 py-2 bg-zinc-50/70 rounded-2xl p-3 border border-zinc-100">
                  {art.metrics.map((m, mIdx) => (
                    <div key={mIdx} className="space-y-0.5">
                      <span className="text-[10px] font-mono text-zinc-400 uppercase">{m.label}</span>
                      <div className="text-sm font-bold text-zinc-900">{m.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Artifact Markdown Content */}
              <div className="prose prose-zinc max-w-none text-xs leading-relaxed font-sans text-zinc-800 whitespace-pre-wrap">
                {art.content}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ──────────────────  EXPANDABLE TECHNICAL LOGS DRAWER  ────────────────── */}
      <div className="bg-white border border-black/[0.08] shadow-2xs rounded-3xl overflow-hidden">
        <button
          onClick={() => setShowTechnicalLogs(!showTechnicalLogs)}
          className="w-full px-6 py-4 flex items-center justify-between text-xs font-mono font-semibold text-zinc-600 hover:text-zinc-900 transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-zinc-500" />
            <span>Technical Logs & Machine Proofs</span>
            <span className="text-[10px] bg-zinc-100 px-2 py-0.5 rounded-full text-zinc-500">
              {job.technicalLogs.length} entries
            </span>
          </div>
          {showTechnicalLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showTechnicalLogs && (
          <div className="p-4 bg-zinc-900 text-zinc-200 font-mono text-xs leading-relaxed border-t border-zinc-800 space-y-2 max-h-80 overflow-y-auto">
            {job.technicalLogs.map((log, lIdx) => (
              <div key={lIdx} className="flex items-start gap-2">
                <span className="text-zinc-500 select-none">$</span>
                <span className="select-text">{log}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
