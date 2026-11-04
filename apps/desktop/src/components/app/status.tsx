import * as React from 'react';
import type { EvidenceClass, JobStage } from '@runtime/types';
import { cn } from '@/lib/utils';

// One rule on every screen: each fact says where it came from.

export type Tone = 'observed' | 'verified' | 'claimed' | 'needs-you' | 'risk' | 'quiet';

const TONE_CLASS: Record<Tone, string> = {
  observed: 'text-observed border-observed/35 bg-observed/10',
  verified: 'text-verified border-verified/35 bg-verified/10',
  claimed: 'text-muted-foreground border-foreground/25 border-dashed',
  'needs-you': 'text-needs-you border-needs-you/40 bg-needs-you/10',
  risk: 'text-risk border-risk/40 bg-risk/10',
  quiet: 'text-muted-foreground border-border',
};

export function Tag({ tone = 'quiet', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-xs whitespace-nowrap', TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}

const EVIDENCE: Record<EvidenceClass, { label: string; tone: Tone; meaning: string }> = {
  OBSERVED: { label: 'Observed', tone: 'observed', meaning: 'The runtime saw it happen.' },
  VERIFIED: { label: 'Verified', tone: 'verified', meaning: 'A different agent re-ran the check and it held.' },
  DECLARED: { label: 'Claimed', tone: 'claimed', meaning: 'An agent said so. Nothing has checked it.' },
  ATTESTED: { label: 'Claimed', tone: 'claimed', meaning: 'Someone said so. Nothing has checked it.' },
  UNKNOWN: { label: 'Unknown', tone: 'quiet', meaning: 'No evidence yet.' },
};

export function EvidenceTag({ value, className }: { value: EvidenceClass; className?: string }) {
  const e = EVIDENCE[value];
  return (
    <span title={e.meaning}>
      <Tag tone={e.tone} className={className}>
        {e.label}
      </Tag>
    </span>
  );
}

export const STAGES: { id: JobStage; label: string }[] = [
  { id: 'brief', label: 'Brief' },
  { id: 'plan', label: 'Plan' },
  { id: 'build', label: 'Build' },
  { id: 'verify', label: 'Verify' },
  { id: 'approve', label: 'Approve' },
];

/** Five bars: done stages green, the current one blue (amber when it waits on you). */
export function StageBar({
  stage,
  waitingOnYou = false,
  compact = false,
  className,
}: {
  stage: JobStage;
  waitingOnYou?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const current = stage === 'done' ? STAGES.length : STAGES.findIndex((s) => s.id === stage);
  const label =
    stage === 'done' ? 'Done' : stage === 'cancelled' ? 'Cancelled' : `Stage ${current + 1} of ${STAGES.length}: ${STAGES[current]?.label}`;
  return (
    <ol aria-label={label} className={cn('grid grid-cols-5 gap-1.5', className)}>
      {STAGES.map((s, i) => {
        const bar =
          stage === 'cancelled'
            ? 'bg-foreground/10'
            : i < current
              ? 'bg-verified'
              : i === current
                ? waitingOnYou
                  ? 'bg-needs-you'
                  : 'bg-observed'
                : 'bg-foreground/12';
        return (
          <li key={s.id} className="flex flex-col gap-1.5">
            <span className={cn('h-1 rounded-full', bar)} />
            {!compact && <span className={cn('text-xs', i === current ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** What a screen shows when there is nothing to show yet. Never sample data. */
export function EmptyState({ title, children, className }: { title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-dashed border-foreground/15 px-5 py-6 text-sm text-muted-foreground', className)}>
      <p className="font-medium text-foreground/90">{title}</p>
      {children && <div className="mt-1.5 leading-relaxed">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
    </div>
  );
}

export function jobLabel(n: number) {
  return `JOB-${n}`;
}
