import React from 'react';
import {
  Users,
  ArrowRight,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { InterAgentDialoguePayload } from '../services/geminiOrchestrator';

interface InChatInterAgentDialogueCardProps {
  dialogue: InterAgentDialoguePayload;
  onIntervene?: (message: string) => void;
  onConfirmHandoff?: () => void;
}

export const InChatInterAgentDialogueCard: React.FC<InChatInterAgentDialogueCardProps> = ({
  dialogue,
  onIntervene,
  onConfirmHandoff,
}) => {
  return (
    <div className="mt-3.5 rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 via-white/95 to-purple-50/40 backdrop-blur-2xl p-4.5 space-y-3 font-sans shadow-xs transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-indigo-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                GrokBot Swarm Dialogue
              </span>
              <span className="text-xs font-mono font-medium text-zinc-500">
                {dialogue.handoffTopic}
              </span>
            </div>
          </div>
        </div>

        {/* Handoff Route Pill */}
        <div className="flex items-center gap-2 bg-white/90 border border-zinc-200/80 px-2.5 py-1 rounded-xl shadow-2xs">
          <span className="text-xs font-mono font-bold text-zinc-800 flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-zinc-900 text-white text-[9px] flex items-center justify-center font-bold">
              {dialogue.originAgent.symbol}
            </span>
            <span>{dialogue.originAgent.name}</span>
          </span>
          <ArrowRight className="w-3 h-3 text-zinc-400" />
          <span className="text-xs font-mono font-bold text-indigo-600 flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-indigo-600 text-white text-[9px] flex items-center justify-center font-bold">
              {dialogue.targetAgent.symbol}
            </span>
            <span>{dialogue.targetAgent.name}</span>
          </span>
        </div>
      </div>

      {/* Autonomous Inter-Agent Message Bubble */}
      <div className="p-3.5 rounded-2xl bg-white/90 border border-indigo-100 shadow-2xs space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
          <span>Handoff Memo:</span>
          <span className="flex items-center gap-1 text-emerald-600 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active Substrate Relay
          </span>
        </div>
        <p className="text-xs text-zinc-800 leading-relaxed font-sans">{dialogue.message}</p>
      </div>

      {/* Action Footer */}
      {dialogue.suggestedAction && (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-indigo-100/60 text-xs font-medium">
          <span className="text-zinc-500 text-[11px] truncate">
            Target action: <strong className="text-zinc-800">{dialogue.suggestedAction}</strong>
          </span>
          {onConfirmHandoff && (
            <button
              onClick={onConfirmHandoff}
              className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1 shadow-xs active:scale-95 shrink-0"
            >
              <span>Authorize Handoff</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
