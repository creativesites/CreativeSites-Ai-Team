import { ChevronLeft } from 'lucide-react';
import type { Identity, JobDetail, Room } from '@runtime/types';
import { Avatar, OwnerAvatar } from '@/components/app/avatar';
import { EmptyState, EvidenceTag, jobLabel, SectionTitle, StageBar } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { cn } from '@/lib/utils';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function JobScreen({
  job,
  room,
  identities,
  ownerName,
}: {
  job: JobDetail;
  room: Room | undefined;
  identities: Identity[];
  ownerName: string;
}) {
  const pending = job.approvals.filter((a) => a.status === 'pending');
  const who = (id: string) => identities.find((i) => i.id === id);
  // Oldest first reads as a story; the API returns newest first.
  const timeline = [...job.evidence].reverse();

  return (
    <div className="flex flex-col gap-4 py-2">
      <header className="flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex min-w-0 items-center gap-3.5">
          <a href={room ? href({ name: 'room', roomId: room.id }) : href({ name: 'home' })} aria-label="Back to the room" className={buttonVariants({ variant: 'glass', size: 'icon' })}>
            <ChevronLeft />
          </a>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-xs text-muted-foreground">
              {jobLabel(job.number)} · #{room?.name ?? 'unknown room'} · started {time(job.createdAt)}
            </span>
            <h1 className="truncate text-lg font-semibold">{job.title}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={href({ name: 'verdict', jobId: job.id })} className={buttonVariants({ variant: 'glass' })}>
            See the plan
          </a>
          <a href={href({ name: 'dev', jobId: job.id })} className={buttonVariants({ variant: 'glass' })}>
            Open in Dev
          </a>
        </div>
      </header>

      <StageBar stage={job.stage} waitingOnYou={pending.length > 0} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <section aria-label="The brief" className="bg-card flex flex-col gap-3 rounded-xl px-5 py-4.5">
            <SectionTitle>The brief</SectionTitle>
            {job.brief ? (
              <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-foreground/90">{job.brief}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No brief written.</p>
            )}
          </section>

          <section aria-label="What happened" className="bg-card flex flex-col gap-1 rounded-xl px-5 py-4.5">
            <SectionTitle aside="from the evidence record">What happened</SectionTitle>
            {timeline.length === 0 ? (
              <EmptyState title="Nothing recorded yet" className="mt-2">
                Steps appear here as the runtime records them: commands it ran, files changed, checks re-run.
              </EmptyState>
            ) : (
              timeline.map((e) => {
                const actor = who(e.recordedBy);
                return (
                  <div key={e.id} className="grid grid-cols-[56px_28px_minmax(0,1fr)_auto] items-start gap-2.5 py-1.5">
                    <span className="pt-0.5 font-mono text-xs text-muted-foreground">{time(e.createdAt)}</span>
                    {actor ? <Avatar who={actor} size={24} /> : <OwnerAvatar name={e.recordedBy || ownerName} size={24} />}
                    <span className="text-sm text-foreground/90">{e.summary}</span>
                    <EvidenceTag value={e.class} />
                  </div>
                );
              })
            )}
          </section>
        </main>

        <aside className="flex w-full flex-col gap-4 lg:w-100">
          {pending.map((a) => (
            <section key={a.id} aria-label="Approval" className="bg-card flex flex-col gap-3 rounded-xl border-needs-you/30 p-5">
              <span className="text-[13px] font-medium text-needs-you">Needs your approval</span>
              <h2 className="text-lg font-semibold">{a.title}</h2>
              <p className="text-[13px] leading-relaxed text-foreground/80">{a.consequence}</p>
              <div className="flex flex-col gap-2">
                <button type="button" disabled title="Deciding approvals arrives in Phase 1" className={buttonVariants({ variant: 'default' })}>
                  Approve
                </button>
                <button type="button" disabled title="Deciding approvals arrives in Phase 1" className={buttonVariants({ variant: 'glass' })}>
                  Send back
                </button>
              </div>
            </section>
          ))}

          <section aria-label="Done means" className="bg-card flex flex-col gap-2.5 rounded-xl p-5">
            <SectionTitle>Done means</SectionTitle>
            {job.criteria.length === 0 ? (
              <p className="text-sm text-muted-foreground">No acceptance criteria yet.</p>
            ) : (
              job.criteria.map((c) => (
                <div key={c.id} className={cn('flex items-start justify-between gap-2.5 text-[13px]')}>
                  <span>{c.text}</span>
                  <EvidenceTag value={c.evidenceClass} />
                </div>
              ))
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
