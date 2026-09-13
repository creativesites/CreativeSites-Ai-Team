import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Terminal,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { OrchestratorSynthesisResult } from '../services/geminiOrchestrator';

interface InChatOrchestratorAnalysisCardProps {
  analysis: OrchestratorSynthesisResult;
  autoPilot: boolean;
  onDispatchVerifier: () => void;
  isDispatching?: boolean;
}

export const InChatOrchestratorAnalysisCard: React.FC<InChatOrchestratorAnalysisCardProps> = ({
  analysis,
  autoPilot,
  onDispatchVerifier,
  isDispatching = false,
}) => {
  const getRiskBadge = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'high':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="w-3 h-3 text-rose-600" />
            <span>High Risk Area</span>
          </span>
        );
      case 'medium':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <ShieldAlert className="w-3 h-3 text-amber-600" />
            <span>Moderate Scope</span>
          </span>
        );
      case 'low':
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Low Risk Verification</span>
          </span>
        );
    }
  };

  return (
    <div className="mt-3.5 rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/40 via-white/90 to-purple-50/30 backdrop-blur-2xl p-4.5 space-y-3.5 font-sans shadow-xs transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-indigo-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-900 flex items-center gap-2">
              <span>Gemini Orchestrator Synthesis</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-indigo-100/80 text-indigo-800 rounded-full">
                Gemini 3.6 Flash
              </span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              Autonomous Verification Brief & Risk Audit
            </div>
          </div>
        </div>

        {getRiskBadge(analysis.riskLevel)}
      </div>

      {/* Executive Summary */}
      <div className="text-xs text-zinc-700 leading-relaxed font-sans select-text">
        <p className="font-medium text-zinc-900 mb-1">Executive Assessment:</p>
        <p className="p-3 bg-white/90 rounded-2xl border border-indigo-100/80 shadow-2xs">
          {analysis.executiveSummary}
        </p>
      </div>

      {/* Risk Notes */}
      {analysis.riskNotes && (
        <div className="flex items-start gap-2 p-2.5 bg-amber-50/50 rounded-2xl border border-amber-100 text-[11px] text-amber-900">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Architectural Scope: </span>
            <span>{analysis.riskNotes}</span>
          </div>
        </div>
      )}

      {/* Verifier Brief Box */}
      <div className="p-3 bg-zinc-950 text-zinc-200 rounded-2xl border border-zinc-800 space-y-2 select-text">
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
          <span className="flex items-center gap-1.5 text-indigo-300 font-semibold">
            <Terminal className="w-3.5 h-3.5" />
            <span>Target: Lead Verifier {analysis.verifierTarget.toUpperCase()} [KL]</span>
          </span>
          <span>Rule: Anti-Self-Verification</span>
        </div>

        <p className="text-xs font-mono text-zinc-300 leading-relaxed">
          &gt; {analysis.verifierPrompt}
        </p>

        {/* Recommended Commands */}
        {analysis.recommendedCommands && analysis.recommendedCommands.length > 0 && (
          <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-mono text-zinc-500">Suggested test commands:</span>
            {analysis.recommendedCommands.map((cmd, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-700/80 text-[10px] font-mono text-emerald-400"
              >
                {cmd}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Auto-Handoff Status & Dispatch Action */}
      <div className="pt-2 border-t border-indigo-100/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onDispatchVerifier}
            disabled={isDispatching}
            className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95 disabled:opacity-50"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              {isDispatching
                ? 'Dispatching Kael...'
                : autoPilot
                ? 'Dispatched to Kael (Auto-Pilot Active)'
                : 'Dispatch Kael with this Brief'}
            </span>
            <ArrowRight className="w-3 h-3 text-zinc-400" />
          </button>
        </div>

        <span className="text-[10px] font-mono text-zinc-400">
          {autoPilot ? '⚡ Autonomous pipeline active' : '⏸ Manual gate awaiting confirmation'}
        </span>
      </div>
    </div>
  );
};
