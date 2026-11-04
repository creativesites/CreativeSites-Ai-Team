import type { Evidence, JobDetail, JobSummary } from '@runtime/types';
import { LoadNote, Panel, ScreenHeader, Stat } from '@/components/app/metric';
import { EmptyState, EvidenceTag, jobLabel, SectionTitle, StageBar, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntimeData } from '@/lib/runtime-context';

// QA & Verification (vision section 11, 14.2 item 13). A criterion counts as met only on OBSERVED or
// VERIFIED evidence; anything an agent merely said stays "Claimed" and is listed as unproven.

const STRONG = new Set(['OBSERVED', 'VERIFIED']);

function count(evidence: Evidence[], cls: string) {
  return evidence.filter((e) => e.class === cls).length;
}

export function QaScreen({ jobs }: { jobs: JobSummary[] }) {
  const queue = jobs.filter((j) => j.stage === 'verify' || j.stage === 'approve');
  const key = queue.map((j) => `${j.id}:${j.updatedAt}`).join('|');
  const details = useRuntimeData(
    (c) => Promise.all(queue.map((j) => c.job(j.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );
  const done = jobs.filter((j) => j.stage === 'done').length;
  const all: JobDetail[] = details.status === 'ready' ? details.data : [];
  const criteria = all.flatMap((d) => d.criteria);
  const strong = criteria.filter((c) => STRONG.has(c.evidenceClass)).length;
  const verified = criteria.filter((c) => c.evidenceClass === 'VERIFIED').length;
  const evidence = all.flatMap((d) => d.evidence);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-4">
      <ScreenHeader kicker="Done means evidence, not an agent saying so" title="QA & Verification">
        <Tag tone={queue.length ? 'needs-you' : 'quiet'}>{queue.length} in verify or approve</Tag>
      </ScreenHeader>

      <Panel label="Verification summary">
        <SectionTitle aside="across jobs in verify or approve">Summary</SectionTitle>
        <LoadNote what="verification detail" state={details} />
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <Stat label="Criteria with strong evidence" value={details.status === 'ready' && criteria.length ? `${strong} of ${criteria.length}` : null} measure="recorded" tone="observed" unknownReason={details.status === 'ready' ? 'no criteria in the queue' : 'loading'} />
          <Stat label="Criteria independently verified" value={details.status === 'ready' && criteria.length ? `${verified} of ${criteria.length}` : null} measure="verified" tone="verified" unknownReason={details.status === 'ready' ? 'no criteria in the queue' : 'loading'} />
          <Stat label="Observed evidence items" value={details.status === 'ready' ? count(evidence, 'OBSERVED') : null} measure="observed" tone="observed" unknownReason="loading" />
          <Stat label="Jobs finished" value={done} measure="recorded" tone="observed" />
        </div>
      </Panel>

      {queue.length === 0 ? (
        <EmptyState title="Nothing waiting for verification">Jobs appear here once they leave build for verify, and stay until the owner approves them.</EmptyState>
      ) : (
        details.status === 'ready' && all.map((d) => <JobQa key={d.id} job={d} />)
      )}
    </div>
  );
}

function JobQa({ job }: { job: JobDetail }) {
  const unproven = job.criteria.filter((c) => !STRONG.has(c.evidenceClass));
  const needsVerify = job.tasks.filter((t) => t.verificationRequired && t.status !== 'verified');
  return (
    <Panel label={`Verification for ${job.title}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">{jobLabel(job.number)}</span>
          <h2 className="text-[15px] font-semibold">{job.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {job.pendingApprovals > 0 && <Tag tone="needs-you">{job.pendingApprovals} approval waiting</Tag>}
          <a href={href({ name: 'job', jobId: job.id })} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
            Open job
          </a>
        </div>
      </div>
      <StageBar stage={job.stage} compact className="w-48" />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">Done means ({job.criteria.length})</span>
          {job.criteria.length === 0 && <span className="text-xs text-risk">No criteria defined: nothing can be proven.</span>}
          {job.criteria.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-2 text-xs">
              <span className="min-w-0 flex-1">{c.text}</span>
              <EvidenceTag value={c.evidenceClass} />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">Tasks that need an independent check</span>
          {job.tasks.filter((t) => t.verificationRequired).length === 0 && <span className="text-xs text-muted-foreground">None flagged by the plan.</span>}
          {job.tasks
            .filter((t) => t.verificationRequired)
            .map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1">{t.title}</span>
                <Tag tone={t.status === 'verified' ? 'verified' : t.status === 'done' ? 'needs-you' : 'quiet'}>{t.status === 'verified' ? 'verified' : t.status === 'done' ? 'awaiting verifier' : t.status}</Tag>
              </div>
            ))}
        </div>
      </div>

      {(unproven.length > 0 || needsVerify.length > 0) && (
        <p className="rounded-md border border-needs-you/40 bg-needs-you/10 px-3 py-2 text-xs text-needs-you">
          {unproven.length} criteri{unproven.length === 1 ? 'on has' : 'a have'} no observed or verified evidence; {needsVerify.length} task{needsVerify.length === 1 ? '' : 's'} not yet verified.
        </p>
      )}

      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Evidence ({job.evidence.length})</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          {job.evidence.length === 0 && <span className="text-xs text-muted-foreground">Nothing recorded yet.</span>}
          {[...job.evidence].reverse().map((e) => (
            <div key={e.id} className="flex items-start gap-2 text-xs">
              <EvidenceTag value={e.class} />
              <span className="font-mono text-muted-foreground">{e.kind}</span>
              <span className="min-w-0 flex-1 break-words">{e.summary}</span>
            </div>
          ))}
        </div>
      </details>
    </Panel>
  );
}
