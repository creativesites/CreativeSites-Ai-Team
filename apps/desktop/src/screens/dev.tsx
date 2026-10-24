import type { Evidence, Identity, JobDetail, JobSummary, Session } from '@runtime/types';
import { Avatar } from '@/components/app/avatar';
import { isLive } from '@/components/app/shell';
import { EmptyState, EvidenceTag, jobLabel, SectionTitle, StageBar, Tag } from '@/components/app/status';
import { DiffView } from '@/components/ui/diff-view';
import { StepList, type Step } from '@/components/ui/tool-steps';
import { href } from '@/lib/route';
import { cn } from '@/lib/utils';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Commands and file changes the runtime recorded, shown as the agent's steps. */
function stepsFrom(evidence: Evidence[]): Step[] {
  return [...evidence]
    .reverse()
    .filter((e) => e.kind === 'command' || e.kind === 'diff' || e.kind === 'test')
    .map((e) => {
      const p = (e.payload ?? {}) as { command?: string; output?: string; exitCode?: number; patch?: string };
      return {
        id: e.id,
        label: e.summary,
        status: p.exitCode !== undefined && p.exitCode !== 0 ? 'error' : 'done',
        detail: p.command,
        detailLabel: 'Command',
        output: p.output,
        patch: p.patch,
      } satisfies Step;
    });
}

export function DevScreen({
  sessions,
  identities,
  jobs,
  job,
}: {
  sessions: Session[];
  identities: Identity[];
  jobs: JobSummary[];
  job: JobDetail | null;
}) {
  const who = (id: string) => identities.find((i) => i.id === id) ?? { name: id };
  const steps = job ? stepsFrom(job.evidence) : [];
  const patches = job ? job.evidence.filter((e) => e.kind === 'diff' && (e.payload as { patch?: string })?.patch) : [];

  return (
    <div className="flex min-h-full flex-col gap-3 lg:flex-row">
      <section aria-label="Sessions" className="bg-card flex flex-col gap-3 rounded-xl p-4 lg:w-64">
        <SectionTitle aside={`${sessions.filter(isLive).length} live`}>Sessions</SectionTitle>
        {sessions.length === 0 ? (
          <EmptyState title="No agent sessions yet">The runtime starts agent sessions over ACP from Phase 1.</EmptyState>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5">
              <Avatar who={who(s.agentId)} size={26} />
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="text-sm">{who(s.agentId).name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {s.runtimeCommand} · {s.state}
                </span>
              </div>
            </div>
          ))
        )}
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Jobs</span>
          {jobs.map((j) => (
            <a key={j.id} href={href({ name: 'dev', jobId: j.id })} className={cn('truncate rounded-md px-2 py-1 text-sm hover:bg-foreground/[0.05]', job?.id === j.id && 'glass-chosen')}>
              <span className="font-mono text-xs text-muted-foreground">{jobLabel(j.number)}</span> {j.title}
            </a>
          ))}
          {jobs.length === 0 && <span className="text-xs text-muted-foreground">No jobs yet.</span>}
        </div>
      </section>

      <main className="bg-card flex min-w-0 flex-1 flex-col rounded-xl">
        {!job ? (
          <div className="p-6">
            <EmptyState title="Pick a job">Its commands, diffs and evidence show here.</EmptyState>
          </div>
        ) : (
          <>
            <header className="flex flex-col gap-2.5 border-b border-border/60 px-5 pt-3.5 pb-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-xs text-muted-foreground">{jobLabel(job.number)}</span>
                <h1 className="text-base font-semibold">{job.title}</h1>
                <a href={href({ name: 'job', jobId: job.id })} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                  Work view
                </a>
              </div>
              <StageBar stage={job.stage} compact className="max-w-md" />
            </header>
            <div className="flex flex-1 flex-col gap-5 p-5 2xl:flex-row">
              <section aria-label="Steps" className="flex min-w-0 flex-1 flex-col gap-3">
                <SectionTitle aside="recorded by the runtime">Steps</SectionTitle>
                {steps.length === 0 ? (
                  <EmptyState title="No commands recorded">Agent transcripts and the commands they run arrive with Phase 1.</EmptyState>
                ) : (
                  <StepList steps={steps} />
                )}
              </section>
              <section aria-label="Diff" className="flex min-w-0 flex-1 flex-col gap-3">
                <SectionTitle>Changes</SectionTitle>
                {patches.length === 0 ? (
                  <EmptyState title="No file changes recorded" />
                ) : (
                  patches.map((e) => <DiffView key={e.id} patch={(e.payload as { patch: string }).patch} />)
                )}
              </section>
            </div>
          </>
        )}
      </main>

      <aside aria-label="Evidence" className="bg-card flex flex-col gap-4 rounded-xl p-4.5 lg:w-90">
        <div>
          <h2 className="text-[15px] font-semibold">Evidence</h2>
          <p className="text-xs text-muted-foreground">Recorded from what agents did, not from their summaries.</p>
        </div>
        {job && job.criteria.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Done means</span>
            {job.criteria.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2.5 text-[13px]">
                <span>{c.text}</span>
                <EvidenceTag value={c.evidenceClass} />
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col">
          <span className="pb-1 text-xs text-muted-foreground">Ledger</span>
          {!job || job.evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            job.evidence.map((e) => (
              <div key={e.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/50 py-1.5 text-xs">
                <span className="font-mono text-muted-foreground">{time(e.createdAt)}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="break-words">{e.summary}</span>
                  <span className="text-muted-foreground">
                    {who(e.recordedBy).name} · {e.kind}
                  </span>
                </span>
                <EvidenceTag value={e.class} />
              </div>
            ))
          )}
        </div>
        <Tag className="mt-auto self-start">Desktop reads the runtime; it makes no AI calls</Tag>
      </aside>
    </div>
  );
}
