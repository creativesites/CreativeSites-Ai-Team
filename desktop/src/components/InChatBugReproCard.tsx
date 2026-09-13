import React, { useState } from 'react';
import {
  Bug,
  AlertTriangle,
  Terminal,
  Play,
  CheckCircle2,
  RefreshCw,
  FileCode2,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { BugReproPayload } from '../services/geminiOrchestrator';

interface InChatBugReproCardProps {
  bug: BugReproPayload;
  onRunRepro: (cmd: string) => void;
  onTriggerAutoFix: (prompt: string, assignee: string) => void;
  isRunningRepro?: boolean;
}

export const InChatBugReproCard: React.FC<InChatBugReproCardProps> = ({
  bug,
  onRunRepro,
  onTriggerAutoFix,
  isRunningRepro = false,
}) => {
  const [reproRan, setReproRan] = useState(false);

  return (
    <div className="mt-3.5 rounded-3xl border border-rose-200/80 bg-gradient-to-br from-rose-50/40 via-white/95 to-amber-50/30 backdrop-blur-2xl p-4.5 space-y-3.5 font-sans shadow-xs transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-rose-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <Bug className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                Bug Triage & Repro
              </span>
              <span className="text-xs font-mono font-medium text-zinc-500">
                target: <strong className="text-zinc-800">@{bug.assignee}</strong>
              </span>
            </div>
            <h4 className="text-xs font-bold text-zinc-900 mt-0.5">{bug.errorHeadline}</h4>
          </div>
        </div>

        {/* 1-Click Repro & Fix Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onRunRepro(bug.reproCommand);
              setReproRan(true);
            }}
            disabled={isRunningRepro}
            className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200/80 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
            title="Execute test command in live console to confirm failure"
          >
            <Play className="w-3 h-3 text-rose-600" />
            <span>Run Repro in Shell</span>
          </button>

          <button
            onClick={() => onTriggerAutoFix(bug.autoFixPrompt, bug.assignee)}
            className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
            title="Dispatch implementing agent to resolve bug and pass repro test"
          >
            <RefreshCw className="w-3 h-3 text-emerald-400" />
            <span>Auto-Fix Loop</span>
            <ArrowRight className="w-3 h-3 ml-0.5" />
          </button>
        </div>
      </div>

      {/* Root Cause Hypothesis */}
      <div className="p-3 rounded-2xl bg-white/90 border border-rose-200/60 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-rose-700">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
          <span>Root-Cause Analysis</span>
        </div>
        <p className="text-xs text-zinc-700 leading-relaxed font-sans">{bug.rootCauseHypothesis}</p>
        {bug.detectedFile && (
          <div className="pt-1 flex items-center gap-2 text-[11px] font-mono text-zinc-500">
            <FileCode2 className="w-3 h-3 text-zinc-400" />
            <span>
              Pinned file: <strong className="text-zinc-800">{bug.detectedFile}</strong>
              {bug.detectedLine && ` (line ~${bug.detectedLine})`}
            </span>
          </div>
        )}
      </div>

      {/* Repro Command Terminal Snippet */}
      <div className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800 flex items-center justify-between gap-3 text-[11px] font-mono text-zinc-200 shadow-inner">
        <div className="flex items-center gap-2 truncate">
          <Terminal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="truncate">
            <span className="text-rose-400 font-bold">$</span> {bug.reproCommand}
          </span>
        </div>
        {reproRan && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
            Sent to terminal
          </span>
        )}
      </div>
    </div>
  );
};
