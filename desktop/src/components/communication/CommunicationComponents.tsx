import React, { useState } from 'react';
import {
  Sparkles,
  Terminal,
  Play,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Code2,
  ArrowRight,
  AlertTriangle,
  Info,
  HelpCircle,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

// --- 1. Rich Content Formatter with Callouts, Code Blocks, and Pill Badges ---

interface FormattedContentProps {
  content: string;
  onRunInTerminal?: (cmd: string) => void;
}

export const FormattedContent: React.FC<FormattedContentProps> = ({ content, onRunInTerminal }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Split content by code blocks
  const parts: { type: 'text' | 'code'; text: string; language?: string }[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', text: match[2], language: match[1] || 'sh' });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) });
  }

  const formatInlineText = (text: string) => {
    // Check for @agent mentions (e.g. @astra, @atlas, @kael, @winston)
    const mentionSegments = text.split(/(@[a-zA-Z0-9_-]+)/g);
    return mentionSegments.map((mSeg, mIdx) => {
      if (mSeg.startsWith('@')) {
        const agentName = mSeg.slice(1).toLowerCase();
        return (
          <span
            key={mIdx}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-indigo-50 border border-indigo-200/80 font-mono text-[10.5px] font-bold text-indigo-700 mx-0.5"
          >
            <span>@</span>
            <span>{agentName}</span>
          </span>
        );
      }

      // Format inline code
      const codeSegments = mSeg.split(/(`[^`]+`)/g);
      return codeSegments.map((cSeg, cIdx) => {
        if (cSeg.startsWith('`') && cSeg.endsWith('`')) {
          return (
            <code
              key={cIdx}
              className="font-mono text-[10.5px] bg-zinc-100 text-zinc-800 px-1.5 py-0.5 rounded-md border border-zinc-200"
            >
              {cSeg.slice(1, -1)}
            </code>
          );
        }

        // Format bold
        const boldSegments = cSeg.split(/(\*\*[^*]+\*\*)/g);
        return boldSegments.map((bSeg, bIdx) => {
          if (bSeg.startsWith('**') && bSeg.endsWith('**')) {
            return (
              <strong key={bIdx} className="font-semibold text-zinc-900">
                {bSeg.slice(2, -2)}
              </strong>
            );
          }
          return bSeg;
        });
      });
    });
  };

  return (
    <div className="space-y-2 text-xs leading-relaxed text-zinc-700">
      {parts.map((part, pIdx) => {
        if (part.type === 'code') {
          return (
            <div key={pIdx} className="my-2 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden shadow-xs">
              <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-950/80 border-b border-zinc-800 text-[10px] font-mono text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <Code2 className="w-3 h-3 text-indigo-400" />
                  <span>{part.language || 'code'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {onRunInTerminal && (
                    <button
                      onClick={() => onRunInTerminal(part.text)}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition font-medium"
                      title="Run snippet directly in active terminal"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>Execute</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleCopy(part.text, pIdx)}
                    className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer transition"
                  >
                    {copiedIndex === pIdx ? (
                      <>
                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <pre className="p-3 font-mono text-[11px] text-zinc-100 overflow-x-auto leading-relaxed select-text">
                {part.text}
              </pre>
            </div>
          );
        }

        // Render text with alerts and headings
        const lines = part.text.split('\n');
        return (
          <div key={pIdx} className="space-y-1">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="h-1" />;

              // GitHub style blockquotes / alerts
              if (trimmed.startsWith('> [!NOTE]') || trimmed.startsWith('> [!IMPORTANT]') || trimmed.startsWith('> [!WARNING]')) {
                const isWarning = trimmed.includes('WARNING');
                return (
                  <div
                    key={lIdx}
                    className={`p-3 rounded-2xl border flex items-start gap-2.5 my-1.5 ${
                      isWarning
                        ? 'bg-amber-50/70 border-amber-200/80 text-amber-950'
                        : 'bg-indigo-50/70 border-indigo-200/80 text-indigo-950'
                    }`}
                  >
                    {isWarning ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    )}
                    <div className="text-[11.5px] leading-relaxed">
                      {formatInlineText(trimmed.replace(/^>\s*\[![A-Z]+\]\s*/, ''))}
                    </div>
                  </div>
                );
              }

              // Standard blockquotes
              if (trimmed.startsWith('> ')) {
                return (
                  <div key={lIdx} className="border-l-2 border-indigo-300 pl-2.5 py-0.5 text-zinc-600 italic text-[11px]">
                    {formatInlineText(trimmed.slice(2))}
                  </div>
                );
              }

              // Headings
              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lIdx} className="font-bold text-zinc-900 text-xs mt-2 mb-0.5">
                    {trimmed.replace('### ', '')}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={lIdx} className="font-bold text-zinc-900 text-[13px] mt-2 mb-0.5">
                    {trimmed.replace('## ', '')}
                  </h3>
                );
              }

              // Bullet points
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0 mt-1.5" />
                    <span className="flex-1">{formatInlineText(trimmed.slice(2))}</span>
                  </div>
                );
              }

              return <p key={lIdx}>{formatInlineText(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
};

// --- 2. Interactive System AI Explainer & Instruction Tooltip ---

interface AIClarificationCardProps {
  originalText: string;
  contextType: 'instruction' | 'technical' | 'blocker' | 'summary';
  agentId?: string;
  onDispatchAction?: (prompt: string) => void;
}

export const AIClarificationCard: React.FC<AIClarificationCardProps> = ({
  originalText,
  contextType,
  agentId = 'orchestrator',
  onDispatchAction,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  const handleExplain = async () => {
    if (explanation) {
      setIsOpen(!isOpen);
      return;
    }

    setIsLoading(true);
    setIsOpen(true);
    try {
      const prompt = `You are the MyaOS Executive AI Copilot. Break down the following message into:
1. "What this actually means" (in plain English without jargon)
2. "Why it matters to Winston & CreativeSites"
3. "Actionable instruction you can dispatch right now"

[ORIGINAL MESSAGE]:
${originalText.slice(0, 1000)}

Format response in clean, crisp markdown with bullet points.`;

      const contents = [{ role: 'user', parts: [{ text: prompt }] }];
      const rawJson = await invoke<string>('myaos_call_gemini_orchestrator', { contents });
      const parsed = JSON.parse(rawJson);
      const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || 'Clarification completed.';
      setExplanation(text);
    } catch (err: any) {
      setExplanation(`Could not generate AI explanation: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-1.5">
      <button
        onClick={handleExplain}
        className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-indigo-600 hover:text-indigo-800 transition cursor-pointer bg-indigo-50/60 hover:bg-indigo-100/80 px-2 py-0.5 rounded-lg border border-indigo-200/60"
      >
        <Sparkles className="w-2.5 h-2.5 text-indigo-500" />
        <span>{isOpen ? 'Hide System AI Breakdown' : 'System AI: Explain & Make Actionable'}</span>
      </button>

      {isOpen && (
        <div className="mt-2 p-3 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-white to-purple-50/60 border border-indigo-200 text-xs shadow-xs space-y-2 animate-card-entry">
          <div className="flex items-center justify-between border-b border-indigo-100 pb-1.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-indigo-600" />
              <span>Executive AI Breakdown ({contextType})</span>
            </span>
            <span className="text-[9.5px] font-mono text-zinc-400">gemini-3.8-flash</span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-2 text-zinc-500 text-xs font-mono">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
              <span>Analyzing intent and generating actionable instructions...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <FormattedContent content={explanation || ''} />

              {onDispatchAction && (
                <div className="pt-2 border-t border-indigo-100 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-500">1-Click Dispatch Instruction</span>
                  <button
                    onClick={() => onDispatchAction(`Proceed with execution based on: ${originalText.slice(0, 120)}`)}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-[11px] transition cursor-pointer flex items-center gap-1"
                  >
                    <span>Dispatch to @{agentId}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- 3. Agent Badge & Participant Pill ---

interface AgentBadgeProps {
  name: string;
  role?: string;
  symbol?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const AgentBadge: React.FC<AgentBadgeProps> = ({ name, role, symbol = '🤖', size = 'sm' }) => {
  return (
    <div className="inline-flex items-center gap-1.5 bg-zinc-100/80 border border-zinc-200/80 px-2 py-0.5 rounded-xl text-xs font-sans">
      <span className="text-xs shrink-0">{symbol}</span>
      <span className="font-bold text-zinc-800">{name}</span>
      {role && <span className="text-[10px] text-zinc-400 font-mono">({role})</span>}
    </div>
  );
};
