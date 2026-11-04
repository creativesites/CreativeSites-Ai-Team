import * as React from 'react';
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  Info,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FormattedContentProps {
  content: string;
  onRunInTerminal?: (cmd: string) => void;
  className?: string;
}

export function FormattedContent({ content, onRunInTerminal, className }: FormattedContentProps) {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

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
            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-indigo-500/10 border border-indigo-500/30 font-mono text-[11px] font-semibold text-indigo-400 mx-0.5"
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
              className="font-mono text-[11px] bg-muted/80 text-foreground px-1.5 py-0.5 rounded-md border border-border/60"
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
              <strong key={bIdx} className="font-semibold text-foreground">
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
    <div className={cn('space-y-2 text-xs leading-relaxed text-muted-foreground', className)}>
      {parts.map((part, pIdx) => {
        if (part.type === 'code') {
          return (
            <div key={pIdx} className="my-2 rounded-xl bg-zinc-950 border border-border/60 overflow-hidden shadow-xs">
              <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-border/40 text-[10.5px] font-mono text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{part.language || 'code'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {onRunInTerminal && (
                    <button
                      type="button"
                      onClick={() => onRunInTerminal(part.text)}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition font-medium"
                      title="Run snippet directly in active terminal"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>Execute</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopy(part.text, pIdx)}
                    className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer transition"
                  >
                    {copiedIndex === pIdx ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
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
              if (
                trimmed.startsWith('> [!NOTE]') ||
                trimmed.startsWith('> [!IMPORTANT]') ||
                trimmed.startsWith('> [!WARNING]')
              ) {
                const isWarning = trimmed.includes('WARNING');
                return (
                  <div
                    key={lIdx}
                    className={cn(
                      'p-3 rounded-xl border flex items-start gap-2.5 my-1.5',
                      isWarning
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                    )}
                  >
                    {isWarning ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
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
                  <div key={lIdx} className="border-l-2 border-indigo-500/60 pl-2.5 py-0.5 text-muted-foreground italic text-[11px]">
                    {formatInlineText(trimmed.slice(2))}
                  </div>
                );
              }

              // Headings
              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lIdx} className="font-bold text-foreground text-xs mt-2 mb-0.5">
                    {trimmed.replace('### ', '')}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={lIdx} className="font-bold text-foreground text-[13px] mt-2 mb-0.5">
                    {trimmed.replace('## ', '')}
                  </h3>
                );
              }

              // Bullet points
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 shrink-0 mt-1.5" />
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
}
