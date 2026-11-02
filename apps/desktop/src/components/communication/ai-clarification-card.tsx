import * as React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { FormattedContent } from './formatted-content';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

export interface AIClarificationCardProps {
  originalText: string;
  contextType: 'instruction' | 'technical' | 'blocker' | 'summary';
  agentId?: string;
  onDispatchAction?: (prompt: string) => void;
  className?: string;
}

export function AIClarificationCard({
  originalText,
  contextType,
  agentId = 'orchestrator',
  onDispatchAction,
  className,
}: AIClarificationCardProps) {
  const { client } = useRuntime();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [explanation, setExplanation] = React.useState<string | null>(null);

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

      if (client) {
        const res = await client.generateAi(prompt, contextType, agentId);
        setExplanation(res.text || 'Clarification completed.');
      } else {
        setExplanation(
          `### Executive AI Breakdown\n\n- **What this actually means**: Direct coordination request for @${agentId}.\n- **Why it matters**: Aligns active tasks and verifies evidence before job transitions.\n- **Actionable instruction**: Proceed with execution and record independent verification.`
        );
      }
    } catch (err: any) {
      setExplanation(`Could not generate AI explanation: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('mt-2', className)}>
      <button
        type="button"
        onClick={handleExplain}
        className="inline-flex items-center gap-1.5 text-[11px] font-mono font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/20"
      >
        <Sparkles className="w-3 h-3 text-indigo-400" />
        <span>{isOpen ? 'Hide Executive AI Breakdown' : 'Executive AI: Explain & Make Actionable'}</span>
      </button>

      {isOpen && (
        <div className="mt-2.5 p-3.5 rounded-2xl glass-panel border border-indigo-500/30 text-xs shadow-md space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Executive AI Breakdown ({contextType})</span>
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">gemini-executive-copilot</span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-3 text-muted-foreground text-xs font-mono">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <span>Analyzing intent and generating actionable instructions...</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              <FormattedContent content={explanation || ''} />

              {onDispatchAction && (
                <div className="pt-2.5 border-t border-border/40 flex items-center justify-between">
                  <span className="text-[10.5px] font-mono text-muted-foreground">1-Click Dispatch Instruction</span>
                  <button
                    type="button"
                    onClick={() =>
                      onDispatchAction(
                        `Proceed with execution based on: ${originalText.slice(0, 120)}`
                      )
                    }
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
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
}
