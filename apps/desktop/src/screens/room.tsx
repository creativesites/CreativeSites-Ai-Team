import * as React from 'react';
import { Hash } from 'lucide-react';
import type { Identity, JobDetail, JobSummary, Message, Room } from '@runtime/types';
import { Avatar, OwnerAvatar } from '@/components/app/avatar';
import { EmptyState, EvidenceTag, jobLabel, StageBar, Tag } from '@/components/app/status';
import { Composer } from '@/components/ui/composer';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function RoomScreen({
  room,
  messages,
  jobs,
  identities,
  focusJob,
  ownerName,
  onSend,
  onStartJob,
}: {
  room: Room;
  messages: Message[];
  jobs: JobSummary[];
  identities: Identity[];
  /** The job shown in the side panel: the newest open one in this room. */
  focusJob: JobDetail | null;
  ownerName: string;
  onSend?: (body: string) => Promise<void>;
  /** Turn the draft into a job in this room (same text becomes the brief). */
  onStartJob?: (text: string) => Promise<void>;
}) {
  const { client } = useRuntime();
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [delegating, setDelegating] = React.useState(false);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const shownJobCards = new Set<string>();

  const coworkers = identities.filter((i) => !i.isOwner);
  const rateLimited = coworkers.filter(
    (i) => i.statusState === 'rate_limited' && i.rateLimitResetAt && new Date(i.rateLimitResetAt).getTime() > Date.now()
  );

  const send = async (text: string) => {
    if (!onSend || !text.trim()) return;
    setError(null);
    setNotice(null);
    try {
      await onSend(text.trim());
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const delegateToLeader = async () => {
    if (!client || !draft.trim() || delegating) return;
    setDelegating(true);
    setError(null);
    setNotice(null);
    const goal = draft.trim();
    try {
      if (onSend) {
        await onSend(`@lead ${goal}`);
      } else {
        await client.dispatchTeamLeader({
          fromActorId: 'winston',
          roomId: room.id,
          jobId: focusJob?.id ?? null,
          goal,
        });
      }
      setDraft('');
      setNotice('Team Leader woken — coordinating coworkers in this room.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDelegating(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-3 lg:flex-row">
      <main className="bg-card flex min-w-0 flex-1 flex-col rounded-xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Hash className="size-4.5 text-muted-foreground" />
            <h1 className="text-[17px] font-semibold">{room.name}</h1>
            <span className="text-xs text-muted-foreground">{room.repoPath ? `Repo: ${room.repoPath}` : 'No repo bound yet'}</span>
          </div>
          <div className="flex items-center gap-2">
            {room.openJobCount > 0 && <Tag tone="observed">{room.openJobCount} open job{room.openJobCount === 1 ? '' : 's'}</Tag>}
            <a href={href({ name: 'dev', jobId: focusJob?.id })} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
              Live Terminal
            </a>
          </div>
        </header>

        {rateLimited.length > 0 && (
          <div className="mx-6 mt-3 rounded-lg border border-needs-you/40 bg-needs-you/10 px-3.5 py-2 text-xs text-needs-you">
            <strong>Session Limit Notice:</strong>{' '}
            {rateLimited
              .map(
                (i) =>
                  `${i.name} (${i.runtime ?? 'adapter'}) waiting for session reset at ${time(i.rateLimitResetAt!)}`
              )
              .join(' · ')}
            . Available coworkers on other adapters know this reset window and will cover or auto-resume on reset.
          </div>
        )}

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-6 py-5">
          {messages.length === 0 && (
            <EmptyState title="No messages yet">
              Say what you want done, tag <code className="font-mono">@lead</code> or <code className="font-mono">@atlas</code> to wake an agent immediately, or start a job.
            </EmptyState>
          )}
          {messages.map((m) => {
            const who = identities.find((i) => i.id === m.authorId);
            const job = m.jobId ? jobById.get(m.jobId) : undefined;
            const showCard = job && !shownJobCards.has(job.id);
            if (job) shownJobCards.add(job.id);
            return (
              <React.Fragment key={m.id}>
                <div className="flex gap-3">
                  {m.authorKind === 'human' ? <OwnerAvatar name={ownerName} size={32} /> : <Avatar who={who ?? { name: m.authorId }} size={32} />}
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="font-semibold">{m.authorKind === 'human' ? ownerName : (who?.name ?? m.authorId)}</span>
                      <span className="text-xs text-muted-foreground">
                        {who?.runtime ? `${who.runtime} · ` : ''}
                        {time(m.createdAt)}
                      </span>
                      {who?.statusState === 'rate_limited' && who.rateLimitResetAt && (
                        <Tag tone="needs-you">Resets {time(who.rateLimitResetAt)}</Tag>
                      )}
                    </div>
                    <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-foreground/90">{m.body}</p>
                  </div>
                </div>
                {showCard && <JobCard job={job} />}
              </React.Fragment>
            );
          })}
        </div>

        <div className="mx-auto w-full max-w-3xl px-6 pb-4">
          {coworkers.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Wake with @mention:</span>
              <button
                type="button"
                onClick={() => setDraft((d) => (d.includes('@lead') ? d : `@lead ${d}`))}
                className="rounded-md border border-border/60 bg-foreground/[0.03] px-2 py-0.5 font-mono text-[11px] hover:bg-foreground/[0.08]"
              >
                @lead
              </button>
              {coworkers.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setDraft((d) => (d.includes(`@${c.id}`) ? d : `@${c.id} ${d}`))}
                  className="rounded-md border border-border/60 bg-foreground/[0.03] px-2 py-0.5 font-mono text-[11px] hover:bg-foreground/[0.08]"
                >
                  @{c.id}
                  {c.statusState === 'rate_limited' ? ' (limit)' : c.statusState === 'working' ? ' ●' : ''}
                </button>
              ))}
            </div>
          )}

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Mention <code className="font-mono">@lead</code> or any <code className="font-mono">@agent</code> to wake them autonomously, or start a tracked job.
            </span>
            <div className="flex items-center gap-2">
              {client && (
                <button
                  type="button"
                  disabled={!draft.trim() || delegating}
                  onClick={delegateToLeader}
                  className={buttonVariants({ variant: 'glass', size: 'sm' })}
                >
                  {delegating ? 'Waking Leader…' : 'Tell Team Leader'}
                </button>
              )}
              {onStartJob && (
                <button
                  type="button"
                  disabled={!draft.trim() || starting}
                  onClick={async () => {
                    setStarting(true);
                    setError(null);
                    try {
                      await onStartJob(draft.trim());
                      setDraft('');
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setStarting(false);
                    }
                  }}
                  className={buttonVariants({ variant: 'default', size: 'sm' })}
                >
                  {starting ? 'Starting…' : 'Start a job from this draft'}
                </button>
              )}
            </div>
          </div>

          <Composer
            value={draft}
            onValueChange={setDraft}
            onSubmit={send}
            canSubmit={!!onSend && draft.trim().length > 0}
            placeholder={`Message #${room.name} (tag @lead or @atlas to wake an agent)`}
            textareaProps={{ 'aria-label': `Message ${room.name}` }}
          />
          {!onSend && <p className="mt-1.5 text-xs text-muted-foreground">Messages can be sent once the runtime is reachable.</p>}
          {notice && <p className="mt-1.5 text-xs text-verified">{notice}</p>}
          {error && <p className="mt-1.5 text-xs text-risk">Not sent: {error}</p>}
        </div>
      </main>

      <JobPanel job={focusJob} />
    </div>
  );
}

function JobCard({ job }: { job: JobSummary }) {
  return (
    <section aria-label={jobLabel(job.number)} className="glass-panel flex flex-col gap-3.5 rounded-xl px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-xs text-muted-foreground">{jobLabel(job.number)}</span>
          <span className="text-[15px] font-semibold">{job.title}</span>
          {job.kind && job.kind !== 'code' && <Tag tone="quiet">{job.kind}</Tag>}
          {job.shipStatus === 'shipped' && <Tag tone="verified">Shipped</Tag>}
        </div>
        <a href={href({ name: 'job', jobId: job.id })} className={buttonVariants({ variant: 'glass' })}>
          Open job
        </a>
      </div>
      <StageBar stage={job.stage} waitingOnYou={job.pendingApprovals > 0} />
    </section>
  );
}

export function JobPanel({ job, className }: { job: JobDetail | null; className?: string }) {
  if (!job) {
    return (
      <aside aria-label="Job details" className={cn('bg-card flex flex-col gap-3 rounded-xl p-4.5 lg:w-90', className)}>
        <EmptyState title="No open job in this room" />
      </aside>
    );
  }
  const pending = job.approvals.filter((a) => a.status === 'pending');
  return (
    <aside aria-label="Job details" className={cn('bg-card flex flex-col gap-4.5 rounded-xl p-4.5 lg:w-90', className)}>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-muted-foreground">{jobLabel(job.number)} · in this room</span>
        <h2 className="text-base font-semibold">{job.title}</h2>
        <StageBar stage={job.stage} waitingOnYou={pending.length > 0} compact className="mt-1.5" />
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="text-xs text-muted-foreground">Done means</div>
        {job.criteria.length === 0 ? (
          <EmptyState title="No acceptance criteria yet">Add them on the job screen.</EmptyState>
        ) : (
          job.criteria.map((c) => (
            <div key={c.id} className="glass-panel flex flex-col gap-1.5 rounded-lg px-3 py-2.5">
              <span className="text-[13px]">{c.text}</span>
              <EvidenceTag value={c.evidenceClass} className="self-start" />
            </div>
          ))
        )}
      </div>
      <div className="mt-auto flex gap-2">
        <a href={href({ name: 'job', jobId: job.id })} className={cn(buttonVariants({ variant: 'glass' }), 'flex-1')}>
          Open job
        </a>
        <a href={href({ name: 'dev', jobId: job.id })} className={cn(buttonVariants({ variant: 'glass' }), 'flex-1')}>
          Open in Dev
        </a>
      </div>
    </aside>
  );
}
