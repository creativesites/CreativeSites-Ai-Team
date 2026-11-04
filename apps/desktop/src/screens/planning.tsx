import type { JobSummary } from '@runtime/types';
import { LoadNote, Panel, ScreenHeader } from '@/components/app/metric';
import { EmptyState, jobLabel, SectionTitle, StageBar, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntimeData } from '@/lib/runtime-context';

// Planning Council (vision section 5, 14.2 item 4): where a job's plan is argued before it is accepted.
// The council itself opens per job; this page is the way in and the record of past sessions.

export function PlanningScreen({ jobs }: { jobs: JobSummary[] }) {
  const sessions = useRuntimeData((c) => c.councilSessions(), []);
  const open = jobs.filter((j) => !['done', 'cancelled'].includes(j.stage));
  const planning = open.filter((j) => j.stage === 'brief' || j.stage === 'plan');
  const rest = open.filter((j) => j.stage !== 'brief' && j.stage !== 'plan');

  const row = (j: JobSummary) => (
    <div key={j.id} className="flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
      <span className="w-16 font-mono text-xs text-muted-foreground">{jobLabel(j.number)}</span>
      <a href={href({ name: 'job', jobId: j.id })} className="min-w-0 flex-1 basis-56 truncate text-sm hover:underline">
        {j.title}
      </a>
      <StageBar stage={j.stage} compact className="w-32" />
      <a href={href({ name: 'council', jobId: j.id })} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
        Open council
      </a>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-4">
      <ScreenHeader kicker="Argue the plan before it is accepted; the verdict is recorded with the job" title="Planning Council">
        <Tag tone={planning.length ? 'needs-you' : 'quiet'}>{planning.length} job{planning.length === 1 ? '' : 's'} in brief or plan</Tag>
      </ScreenHeader>

      <Panel label="Jobs awaiting a plan" className="gap-0 p-0">
        <div className="px-5 pt-5 pb-3">
          <SectionTitle aside="brief and plan stages">Awaiting a plan</SectionTitle>
        </div>
        {planning.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title="No job is waiting for a plan">Start a job from Executive Home; its plan comes here first.</EmptyState>
          </div>
        ) : (
          planning.map(row)
        )}
      </Panel>

      {rest.length > 0 && (
        <Panel label="Other open jobs" className="gap-0 p-0">
          <div className="px-5 pt-5 pb-3">
            <SectionTitle aside="a council can still be convened">Other open jobs</SectionTitle>
          </div>
          {rest.slice(0, 12).map(row)}
        </Panel>
      )}

      <Panel label="Council sessions">
        <SectionTitle aside="recorded sessions">Council sessions</SectionTitle>
        <LoadNote what="council sessions" state={sessions} />
        {sessions.status === 'ready' && sessions.data.sessions.length === 0 && <EmptyState title="No council has run yet" />}
        {sessions.status === 'ready' &&
          sessions.data.sessions.slice(0, 15).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-2 text-sm last:border-b-0">
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <Tag tone="quiet">{s.mode}</Tag>
              <Tag tone={s.status === 'accepted' ? 'verified' : 'quiet'}>{s.status}</Tag>
              {s.jobId && (
                <a href={href({ name: 'verdict', jobId: s.jobId })} className="text-xs underline">
                  Verdict
                </a>
              )}
            </div>
          ))}
      </Panel>
    </div>
  );
}
