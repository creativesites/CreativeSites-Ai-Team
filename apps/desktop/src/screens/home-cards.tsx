import type { JobStage, JobSummary } from '@runtime/types';
import { LoadNote, Stat } from '@/components/app/metric';
import { SectionTitle, STAGES, Tag } from '@/components/app/status';
import { dateOnly, hours, percent, weekRange } from '@/lib/format';
import { href } from '@/lib/route';
import { useRuntimeData } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

// The compact cards on Executive Home. Each one links to the screen that owns the figure, says what kind
// of figure it is, and shows UNKNOWN (with the reason) instead of a guess.

function Card({ title, to, aside, className, children }: { title: string; to: string; aside?: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className={cn('bg-card flex min-w-0 flex-col gap-3 rounded-xl p-4', className)}>
      <SectionTitle aside={aside}>
        <a href={to} className="hover:underline">
          {title}
        </a>
      </SectionTitle>
      {children}
    </section>
  );
}

export function HomeCards({ jobs }: { jobs: JobSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <StandupCard />
      <HoursCard />
      <UsageCard />
      <OrgHealthCard />
      <StageCard jobs={jobs} />
    </div>
  );
}

function StandupCard() {
  const latest = useRuntimeData((c) => c.latestStandup(), []);
  const today = new Date().toISOString().slice(0, 10);
  const s = latest.status === 'ready' ? latest.data : null;
  return (
    <Card title="Today's stand-up" to={href({ name: 'standups' })} aside={s ? dateOnly(s.date) : undefined}>
      <LoadNote what="the stand-up" state={latest} />
      {latest.status === 'ready' && !s && <p className="text-sm text-muted-foreground">None yet.</p>}
      {s && (
        <>
          {s.date.slice(0, 10) !== today && <Tag tone="quiet">latest is from {dateOnly(s.date)}, not today</Tag>}
          {s.report ? (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Reported" value={s.report.summary.reported} measure="recorded" tone="observed" />
              <Stat label="No update" value={s.report.summary.noUpdate} measure="recorded" tone="observed" />
              <Stat label="Unbacked claims" value={s.report.summary.discrepancies} measure="checked" tone={s.report.summary.discrepancies ? 'risk' : 'verified'} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Recorded without a structured report.</p>
          )}
        </>
      )}
    </Card>
  );
}

function HoursCard() {
  const range = weekRange();
  const summary = useRuntimeData((c) => c.timeSummary(range.from, range.to), [range.from]);
  const d = summary.status === 'ready' ? summary.data : null;
  return (
    <Card title="This week's hours" to={href({ name: 'time' })} aside="Mon to Sun">
      <LoadNote what="hours" state={summary} />
      {d && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Your hours" value={hours(d.humanHours)} measure="actual" tone="observed" />
          <Stat label="Agent hours" value={hours(d.agentHours)} measure="actual" tone="observed" note={`${hours(d.agentElapsedHours)} elapsed`} />
        </div>
      )}
    </Card>
  );
}

function UsageCard() {
  const weekly = useRuntimeData((c) => c.weeklyUsage(), []);
  const rows = weekly.status === 'ready' ? weekly.data.filter((r) => r.weeklyPct != null && !r.stale) : [];
  const top = [...rows].sort((a, b) => (b.weeklyPct ?? 0) - (a.weeklyPct ?? 0))[0];
  const alerts = weekly.status === 'ready' ? weekly.data.reduce((n, r) => n + r.alerts.filter((a) => !a.acknowledgedAt).length, 0) : 0;
  return (
    <Card title="Most-used AI plan" to={href({ name: 'ai' })} aside="weekly %">
      <LoadNote what="usage" state={weekly} />
      {weekly.status === 'ready' && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Stat
            label={top ? top.account.label : 'No current reading'}
            value={top ? percent(top.weeklyPct) : null}
            measure={top?.weeklyMeasurement ?? undefined}
            tone="observed"
            unknownReason={weekly.data.length ? 'no reading in the current window' : 'no AI account tracked'}
          />
          {alerts > 0 && <Tag tone="needs-you">{alerts} pace alert{alerts === 1 ? '' : 's'}</Tag>}
        </div>
      )}
    </Card>
  );
}

function OrgHealthCard() {
  const audit = useRuntimeData((c) => c.realityAudit(), []);
  const a = audit.status === 'ready' ? audit.data : null;
  const fig = (label: string, f: { value: number | null; numerator: number; denominator: number; basis: string }) => (
    <Stat label={label} value={f.value == null ? null : percent(f.value)} measure={f.value == null ? undefined : 'measured'} tone="observed" unknownReason={f.denominator === 0 ? 'nothing to measure yet' : f.basis} note={`${f.numerator} of ${f.denominator}`} />
  );
  return (
    <Card title="Organisation health" to={href({ name: 'okrs' })} aside="three separate figures">
      <LoadNote what="the audit" state={audit} />
      {a && (
        <div className="grid grid-cols-3 gap-2">
          {fig('Execution', a.execution)}
          {fig('Evidence', a.evidence)}
          {fig('Strategy', a.strategy)}
        </div>
      )}
    </Card>
  );
}

const ORDER: JobStage[] = ['brief', 'plan', 'build', 'verify', 'approve'];

function StageCard({ jobs }: { jobs: JobSummary[] }) {
  const open = jobs.filter((j) => !['done', 'cancelled'].includes(j.stage));
  return (
    <Card title="Active jobs by stage" to={href({ name: 'jobs' })} aside={`${open.length} open`} className="md:col-span-2">
      <div className="grid grid-cols-5 gap-2">
        {ORDER.map((id) => {
          const n = open.filter((j) => j.stage === id).length;
          return (
            <a key={id} href={href({ name: 'jobs' })} className="glass-panel flex flex-col gap-0.5 rounded-lg px-3 py-2 hover:bg-foreground/[0.04]">
              <span className="font-mono text-xl tabular-nums">{n}</span>
              <span className="text-xs text-muted-foreground">{STAGES.find((s) => s.id === id)?.label ?? id}</span>
            </a>
          );
        })}
      </div>
    </Card>
  );
}
