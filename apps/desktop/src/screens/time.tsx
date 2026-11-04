import * as React from 'react';
import type { Identity } from '@runtime/types';
import { LoadNote, Panel, ScreenHeader, Stat } from '@/components/app/metric';
import { EmptyState, SectionTitle, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { dateOnly, dateTime, duration, hours, UNKNOWN, weekRange } from '@/lib/format';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';
import type { Timesheet, TimeInterval } from '@/lib/wp11-types';
import { cn } from '@/lib/utils';

// Time & Productivity (vision section 6, 14.2 item 11). Hours come from the runtime's ledger and are
// labelled "actual". Only the owner's human hours can be billable; agent hours never are.

const HUMAN_CATEGORIES = ['implementation', 'prompting', 'planning', 'review', 'meetings', 'testing', 'admin', 'other'];
const field = 'glass-panel h-9 rounded-md px-2.5 text-sm outline-none focus:ring-1 focus:ring-foreground/40';

function money(minor: number | null | undefined, currency: string | null | undefined): string {
  if (minor == null || !currency) return UNKNOWN;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return UNKNOWN;
  }
}

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function TimeScreen({ identities }: { identities: Identity[] }) {
  const { client } = useRuntime();
  const [bump, setBump] = React.useState(0);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [engagementId, setEngagementId] = React.useState('');
  const range = React.useMemo(() => weekRange(new Date(), weekOffset), [weekOffset]);
  const engagements = useRuntimeData((c) => c.engagements(), []);
  const chosen = engagementId || (engagements.status === 'ready' ? engagements.data[0]?.id : '') || '';
  const summary = useRuntimeData((c) => c.timeSummary(range.from, range.to, chosen || undefined), [range.from, range.to, chosen, bump]);
  const intervals = useRuntimeData((c) => c.timeIntervals({ from: range.from, to: range.to }), [range.from, range.to, bump]);
  const open = useRuntimeData((c) => c.timeIntervals({ actorKind: 'human' }), [bump]);
  const timesheets = useRuntimeData((c) => c.timesheets(chosen || undefined), [chosen, bump]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const refresh = () => setBump((n) => n + 1);
  const act = async (key: string, fn: () => Promise<unknown>) => {
    if (!client) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const running = open.status === 'ready' ? open.data.find((i) => i.source === 'timer' && !i.ended_at) : undefined;
  const nameOf = (id: string) => identities.find((i) => i.id === id)?.name ?? id;
  const rows: TimeInterval[] = intervals.status === 'ready' ? [...intervals.data].reverse() : [];
  const terms = summary.status === 'ready' ? summary.data.engagement : undefined;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-4">
      <ScreenHeader kicker="Hours the runtime has recorded: your time and your agents' time, kept apart" title="Time & Productivity">
        <button type="button" className={buttonVariants({ variant: 'glass', size: 'sm' })} onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">
          Previous
        </button>
        <span className="text-sm tabular-nums" aria-live="polite">
          {dateOnly(range.from)} to {dateOnly(new Date(Date.parse(range.to) - 1).toISOString())}
        </span>
        <button type="button" className={buttonVariants({ variant: 'glass', size: 'sm' })} onClick={() => setWeekOffset((w) => Math.min(0, w + 1))} disabled={weekOffset >= 0} aria-label="Next week">
          Next
        </button>
      </ScreenHeader>

      {error && (
        <div role="alert" className="rounded-xl border border-risk/40 bg-risk/10 px-4 py-2.5 text-sm text-risk">
          {error}
        </div>
      )}

      <Panel label="This week">
        <SectionTitle aside="agent hours are never billable">Hours this week</SectionTitle>
        <LoadNote what="the time summary" state={summary} />
        {summary.status === 'ready' && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Stat label="Your hours" value={hours(summary.data.humanHours)} measure="actual" tone="observed" />
            <Stat label="Billable (your hours only)" value={hours(summary.data.billableHumanHours)} measure="actual" tone="observed" note={summary.data.billableHumanHours === 0 ? 'none classified billable' : undefined} />
            <Stat label="Agent hours (sum)" value={hours(summary.data.agentHours)} measure="actual, non-billable" tone="observed" />
            <Stat label="Agent time elapsed" value={hours(summary.data.agentElapsedHours)} measure="actual" tone="observed" note="parallel agents overlap" />
          </div>
        )}
        {summary.status === 'ready' && Object.keys(summary.data.agentHoursByIdentity).length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {Object.entries(summary.data.agentHoursByIdentity).map(([id, h]) => (
              <span key={id}>
                {nameOf(id)} <span className="font-mono text-foreground">{hours(h)}</span>
              </span>
            ))}
          </div>
        )}
      </Panel>

      <Panel label="Engagement">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle aside="read from the runtime; nothing is assumed">Engagement</SectionTitle>
          {engagements.status === 'ready' && engagements.data.length > 0 && (
            <>
              <label htmlFor="engagement" className="sr-only">
                Engagement
              </label>
              <select id="engagement" className={field} value={chosen} onChange={(e) => setEngagementId(e.target.value)}>
                {engagements.data.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.client}
                    {e.role ? `, ${e.role}` : ''}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <LoadNote what="engagements" state={engagements} />
        {engagements.status === 'ready' && engagements.data.length === 0 && (
          <EmptyState title="No engagement recorded">
            Weekly minimum, maximum, pay schedule and estimated value all show {UNKNOWN} until an engagement is imported into the runtime.
          </EmptyState>
        )}
        {terms && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Stat label="Weekly minimum" value={terms.minWeeklyHours == null ? null : hours(terms.minWeeklyHours)} measure="declared" tone="claimed" unknownReason="not recorded" />
            <Stat label="Weekly maximum" value={terms.maxWeeklyHours == null ? null : hours(terms.maxWeeklyHours)} measure="declared" tone="claimed" unknownReason="not recorded" />
            <Stat label="Remaining to minimum" value={terms.remainingToMin == null ? null : hours(terms.remainingToMin)} measure="estimated" unknownReason="needs a minimum" />
            <Stat label="Remaining to maximum" value={terms.remainingToMax == null ? null : hours(terms.remainingToMax)} measure="estimated" unknownReason="needs a maximum" />
            <Stat label="Estimated billable value" value={money(terms.estimatedBillableValueMinor, terms.currency)} measure="estimated" unknownReason="rate or currency not recorded" />
            <Stat label="Pay schedule" value={terms.paySchedule === 'unknown' ? null : terms.paySchedule} measure="declared" tone="claimed" unknownReason="not recorded" />
            <Stat label="Agent hours billable" value={terms.agentHoursBillable ? 'Yes' : 'No'} measure="declared" tone="claimed" />
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="Timer">
          <SectionTitle aside={running ? 'running' : 'stopped'}>Timer</SectionTitle>
          <TimerControl running={running} engagementId={chosen} busy={busy} onStart={(category) => act('start', () => client!.startTimer({ category, engagementId: chosen || undefined }))} onStop={() => act('stop', () => client!.stopTimer())} />
        </Panel>
        <ManualEntry engagementId={chosen} busy={busy === 'manual'} onAdd={(input) => act('manual', () => client!.addTimeEntry(input))} />
      </div>

      <Panel label="Intervals">
        <SectionTitle aside={`${rows.length} this week`}>Recorded intervals</SectionTitle>
        <LoadNote what="intervals" state={intervals} />
        {intervals.status === 'ready' && rows.length === 0 && <EmptyState title="Nothing recorded this week">Start the timer, add an entry, or let agent turns accrue.</EmptyState>}
        {rows.length > 0 && (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Who</th>
                  <th className="py-1.5 pr-3 font-medium">Started</th>
                  <th className="py-1.5 pr-3 font-medium">Length</th>
                  <th className="py-1.5 pr-3 font-medium">Category</th>
                  <th className="py-1.5 pr-3 font-medium">Source</th>
                  <th className="py-1.5 pr-3 font-medium">Billable</th>
                  <th className="py-1.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 60).map((r) => (
                  <IntervalRow key={r.id} row={r} who={nameOf(r.identity_id)} busy={busy === `adjust:${r.id}`} onAdjust={(deltaMs, note) => act(`adjust:${r.id}`, () => client!.adjustInterval(r.id, { deltaMs, note }))} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <TimesheetsPanel
        engagementId={chosen}
        periodStart={range.from}
        timesheets={timesheets}
        busy={busy}
        onDraft={() => act('draft', () => client!.draftTimesheet(chosen, range.from))}
        onSubmit={(id) => act(`submit:${id}`, () => client!.submitTimesheet(id))}
        onApprove={(id) => act(`approve:${id}`, () => client!.approveTimesheet(id))}
      />
    </div>
  );
}

function TimerControl({ running, busy, engagementId, onStart, onStop }: { running?: TimeInterval; busy: string | null; engagementId: string; onStart: (category: string) => void; onStop: () => void }) {
  const [category, setCategory] = React.useState('implementation');
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  if (running) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-2xl tabular-nums">{duration(now - Date.parse(running.started_at))}</span>
          <span className="text-xs text-muted-foreground">
            {running.category} since {dateTime(running.started_at)} <Tag tone="observed">actual</Tag>
          </span>
        </div>
        <button type="button" className={buttonVariants({ variant: 'default' })} disabled={busy !== null} onClick={onStop}>
          {busy === 'stop' ? 'Stopping…' : 'Stop timer'}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="timer-category" className="sr-only">
        Category
      </label>
      <select id="timer-category" className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
        {HUMAN_CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <button type="button" className={buttonVariants({ variant: 'default' })} disabled={busy !== null} onClick={() => onStart(category)}>
        {busy === 'start' ? 'Starting…' : 'Start timer'}
      </button>
      <span className="text-xs text-muted-foreground">{engagementId ? 'Counts toward the selected engagement.' : 'No engagement selected: time stays unclassified.'}</span>
    </div>
  );
}

function ManualEntry({ engagementId, busy, onAdd }: { engagementId: string; busy: boolean; onAdd: (input: { startedAt: string; endedAt: string; category: string; engagementId?: string; note?: string }) => void }) {
  const [start, setStart] = React.useState(() => toLocalInput(new Date(Date.now() - 3600_000)));
  const [end, setEnd] = React.useState(() => toLocalInput(new Date()));
  const [category, setCategory] = React.useState('implementation');
  const [note, setNote] = React.useState('');
  const valid = start && end && new Date(end) > new Date(start);
  return (
    <form
      aria-label="Add a time entry"
      className="bg-card flex flex-col gap-3 rounded-xl p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onAdd({ startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(), category, engagementId: engagementId || undefined, note: note.trim() || undefined });
        setNote('');
      }}
    >
      <SectionTitle aside="saved as manual">Add an entry</SectionTitle>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Started
          <input type="datetime-local" className={field} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Ended
          <input type="datetime-local" className={field} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Category
          <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
            {HUMAN_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Note
          <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={!valid || busy} className={buttonVariants({ variant: 'glass' })}>
          {busy ? 'Saving…' : 'Add entry'}
        </button>
        {!valid && <span className="text-xs text-muted-foreground">The end must be after the start.</span>}
      </div>
    </form>
  );
}

function IntervalRow({ row, who, busy, onAdjust }: { row: TimeInterval; who: string; busy: boolean; onAdjust: (deltaMs: number, note: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [minutes, setMinutes] = React.useState('');
  const [note, setNote] = React.useState('');
  const canAdjust = row.actor_kind === 'human' && row.source !== 'adjustment' && !!row.ended_at;
  const delta = Number(minutes);
  return (
    <>
      <tr className="border-t border-border/40 align-top">
        <td className="py-2 pr-3">
          {who} <Tag tone={row.actor_kind === 'human' ? 'verified' : 'quiet'}>{row.actor_kind}</Tag>
        </td>
        <td className="py-2 pr-3 whitespace-nowrap">{dateTime(row.started_at)}</td>
        <td className="py-2 pr-3 font-mono whitespace-nowrap">{row.source === 'adjustment' ? `${row.duration_ms && row.duration_ms > 0 ? '+' : ''}${duration(row.duration_ms ?? 0)}` : duration(row.duration_ms)}</td>
        <td className="py-2 pr-3">{row.category}</td>
        <td className="py-2 pr-3">{row.source}</td>
        <td className="py-2 pr-3">{row.actor_kind === 'agent' ? 'never' : row.billable_status.replace('_', '-')}</td>
        <td className="py-2 text-right">
          {canAdjust && (
            <button type="button" className="text-xs underline" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              Adjust
            </button>
          )}
        </td>
      </tr>
      {editing && (
        <tr className="border-t border-border/20">
          <td colSpan={7} className="pb-3">
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!Number.isFinite(delta) || delta === 0 || !note.trim()) return;
                onAdjust(Math.round(delta * 60000), note.trim());
                setEditing(false);
                setMinutes('');
                setNote('');
              }}
            >
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Change by (minutes, negative to shorten)
                <input type="number" step="1" className={cn(field, 'w-40')} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </label>
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground">
                Reason (required, kept in the record)
                <input className={field} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button type="submit" disabled={busy || !note.trim() || !Number.isFinite(delta) || delta === 0} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
                Record adjustment
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

function TimesheetsPanel({
  engagementId,
  timesheets,
  busy,
  onDraft,
  onSubmit,
  onApprove,
}: {
  engagementId: string;
  periodStart: string;
  timesheets: ReturnType<typeof useRuntimeData<Timesheet[]>>;
  busy: string | null;
  onDraft: () => void;
  onSubmit: (id: string) => void;
  onApprove: (id: string) => void;
}) {
  const { client } = useRuntime();
  const [exported, setExported] = React.useState<Record<string, { hash: string; reconciles: boolean }>>({});
  const list = timesheets.status === 'ready' ? timesheets.data.filter((t) => t.state !== 'superseded') : [];
  return (
    <Panel label="Timesheets">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle aside="billable human hours only">Timesheets</SectionTitle>
        <button type="button" className={buttonVariants({ variant: 'glass', size: 'sm' })} disabled={!engagementId || busy !== null} onClick={onDraft} title={engagementId ? 'Draft or refresh the timesheet for the selected week' : 'Needs an engagement'}>
          {busy === 'draft' ? 'Drafting…' : 'Draft for this week'}
        </button>
      </div>
      <LoadNote what="timesheets" state={timesheets} />
      {timesheets.status === 'ready' && list.length === 0 && <EmptyState title="No timesheets yet">{engagementId ? 'Draft one for the selected week.' : 'A timesheet belongs to an engagement; none is recorded.'}</EmptyState>}
      {list.map((t) => {
        const ex = exported[t.id];
        return (
          <div key={t.id} className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-xs">
            <div className="flex min-w-0 flex-col gap-1">
              <span>
                Week of {dateOnly(t.period_start)} <span className="text-muted-foreground">revision {t.revision}</span>
              </span>
              <span className="font-mono text-[11px] break-all text-muted-foreground">hash {t.export_hash.slice(0, 16)}</span>
              {ex && <Tag tone={ex.reconciles ? 'verified' : 'risk'}>{ex.reconciles ? 'export reconciles with the records' : 'export does NOT reconcile'}</Tag>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={t.state === 'approved' ? 'verified' : t.state === 'submitted' ? 'needs-you' : 'quiet'}>{t.state}</Tag>
              <button
                type="button"
                className={buttonVariants({ variant: 'glass', size: 'sm' })}
                onClick={async () => {
                  const out = await client?.exportTimesheet(t.id).catch(() => null);
                  if (out) setExported((m) => ({ ...m, [t.id]: out }));
                }}
              >
                Check export
              </button>
              {t.state === 'draft' && (
                <button type="button" className={buttonVariants({ variant: 'glass', size: 'sm' })} disabled={busy !== null} onClick={() => onSubmit(t.id)}>
                  Submit
                </button>
              )}
              {t.state === 'submitted' && (
                <button type="button" className={buttonVariants({ variant: 'default', size: 'sm' })} disabled={busy !== null} onClick={() => onApprove(t.id)}>
                  Approve
                </button>
              )}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
