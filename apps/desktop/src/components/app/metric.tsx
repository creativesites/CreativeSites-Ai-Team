import * as React from 'react';
import { Tag, type Tone } from '@/components/app/status';
import { UNKNOWN } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Page header used by the WP11 screens, matching Jobs and Needs you. */
export function ScreenHeader({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col leading-tight">
        <span className="text-xs text-muted-foreground">{kicker}</span>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/**
 * One figure with its label. `value` null renders UNKNOWN plus the reason it is unknown;
 * `measure` says what kind of figure it is (actual / estimated / declared / recorded).
 */
export function Stat({
  label,
  value,
  measure,
  tone = 'quiet',
  note,
  unknownReason,
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  measure?: string;
  tone?: Tone;
  note?: React.ReactNode;
  unknownReason?: string;
  className?: string;
}) {
  const unknown = value == null || value === UNKNOWN;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-xl leading-none tabular-nums', unknown && 'text-muted-foreground')}>{unknown ? UNKNOWN : value}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {measure && <Tag tone={tone}>{measure}</Tag>}
        {unknown && unknownReason ? <span>{unknownReason}</span> : note}
      </span>
    </div>
  );
}

export function Panel({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className={cn('bg-card flex flex-col gap-3 rounded-xl p-5', className)}>
      {children}
    </section>
  );
}

/** A load failure or offline state, in the same words on every screen. */
export function LoadNote({ what, state }: { what: string; state: { status: string; message?: string } }) {
  if (state.status === 'error') return <p role="alert" className="text-xs text-risk">Could not load {what}: {state.message}</p>;
  if (state.status === 'offline') return <p className="text-xs text-muted-foreground">Waiting for the runtime to load {what}.</p>;
  if (state.status === 'loading') return <p className="text-xs text-muted-foreground">Loading {what}…</p>;
  return null;
}
