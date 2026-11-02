import * as React from 'react';
import type { Identity, JobSummary, Project, Room, Session } from '@runtime/types';
import { Avatar } from '@/components/app/avatar';
import { isLive } from '@/components/app/shell';
import { EmptyState, jobLabel, SectionTitle, StageBar, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { cn } from '@/lib/utils';

export interface StartJobRequest {
  roomId: string | null;
  newRoomName: string | null;
  /** When a new room is created, it is bound to this project (and therefore a repo). */
  projectId: string | null;
  text: string;
}

export function HomeScreen({
  rooms,
  jobs,
  identities,
  sessions,
  projects,
  onStartJob,
}: {
  rooms: Room[];
  jobs: JobSummary[];
  identities: Identity[];
  sessions: Session[];
  projects: Project[];
  /** Absent while the runtime is unreachable: the form then can't be sent. */
  onStartJob?: (req: StartJobRequest) => Promise<void>;
}) {
  const needsYou = jobs.filter((j) => j.pendingApprovals > 0);
  const running = jobs.filter((j) => !['done', 'cancelled'].includes(j.stage) && j.pendingApprovals === 0);
  const done = jobs.filter((j) => j.stage === 'done').slice(0, 5);
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? 'unknown room';

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col gap-7 px-1 py-6">
        <h1 className="text-[28px] font-medium tracking-tight">What do you want done?</h1>
        <BriefBox rooms={rooms} projects={projects} onStartJob={onStartJob} />

        <section aria-label="Needs you" className="flex flex-col gap-2.5">
          <SectionTitle aside={needsYou.length ? undefined : 'nothing waiting'}>
            Needs you {needsYou.length > 0 && <Tag tone="needs-you" className="ml-1.5">{needsYou.length}</Tag>}
          </SectionTitle>
          {needsYou.map((j) => (
            <div key={j.id} className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3.5">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Tag tone="needs-you">Approve</Tag>
                  <span className="font-mono">{jobLabel(j.number)}</span>
                  <span>#{roomName(j.roomId)}</span>
                </div>
                <span className="text-[15px]">{j.title}</span>
                <span className="text-[13px] text-muted-foreground">
                  {j.pendingApprovals} approval{j.pendingApprovals === 1 ? '' : 's'} waiting
                </span>
              </div>
              <a href={href({ name: 'job', jobId: j.id })} className={buttonVariants({ variant: 'glass' })}>
                Review
              </a>
            </div>
          ))}
        </section>

        <section aria-label="Running" className="flex flex-col gap-2.5">
          <SectionTitle>Running</SectionTitle>
          {running.length === 0 ? (
            <EmptyState title="No jobs running">Describe an outcome above to start one.</EmptyState>
          ) : (
            <div className="bg-card overflow-hidden rounded-xl">
              {running.map((j) => (
                <a
                  key={j.id}
                  href={href({ name: 'job', jobId: j.id })}
                  className="flex flex-wrap items-center gap-4 border-b border-border/60 px-4 py-3 last:border-b-0 hover:bg-foreground/[0.03]"
                >
                  <span className="w-16 font-mono text-xs text-muted-foreground">{jobLabel(j.number)}</span>
                  <span className="min-w-0 flex-1 basis-60 truncate">{j.title}</span>
                  <StageBar stage={j.stage} compact className="w-36" />
                  <span className="w-28 text-xs text-muted-foreground">#{roomName(j.roomId)}</span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Recently done" className="flex flex-col gap-2.5">
          <SectionTitle>Recently done</SectionTitle>
          {done.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing finished yet.</p>
          ) : (
            done.map((j) => (
              <a key={j.id} href={href({ name: 'job', jobId: j.id })} className="flex items-center gap-3 px-1 text-sm hover:text-foreground">
                <Tag tone="verified">Done</Tag>
                <span className="truncate">{j.title}</span>
              </a>
            ))
          )}
        </section>
      </div>

      <TeamNow identities={identities} sessions={sessions} className="lg:w-80" />
    </div>
  );
}

function BriefBox({ rooms, projects, onStartJob }: { rooms: Room[]; projects: Project[]; onStartJob?: (req: StartJobRequest) => Promise<void> }) {
  const [text, setText] = React.useState('');
  const [roomId, setRoomId] = React.useState<string>('');
  const [newRoom, setNewRoom] = React.useState('');
  const [projectId, setProjectId] = React.useState<string>('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const selected = roomId || rooms[0]?.id || '__new';
  const needsNewRoom = selected === '__new';
  const chosenProject = projectId || projects[0]?.id || '';
  const canSend = !!onStartJob && text.trim().length > 0 && (!needsNewRoom || (newRoom.trim().length > 0 && !!chosenProject)) && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await onStartJob!({ roomId: needsNewRoom ? null : selected, newRoomName: needsNewRoom ? newRoom.trim() : null, projectId: needsNewRoom ? chosenProject : null, text: text.trim() });
      setText('');
      setNewRoom('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-card flex flex-col gap-2.5 rounded-xl px-4 pt-3.5 pb-3">
      <label htmlFor="brief" className="sr-only">
        Describe the outcome
      </label>
      <textarea
        id="brief"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe the outcome, not the steps. Include what done looks like, any deadline, and which way you are leaning."
        className="resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="room">
            Room
          </label>
          <select
            id="room"
            value={selected}
            onChange={(e) => setRoomId(e.target.value)}
            className={cn(buttonVariants({ variant: 'glass' }), 'pr-2')}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.name}
              </option>
            ))}
            <option value="__new">New room…</option>
          </select>
          {needsNewRoom && (
            <>
              <label className="sr-only" htmlFor="new-room">
                New room name
              </label>
              <input
                id="new-room"
                value={newRoom}
                onChange={(e) => setNewRoom(e.target.value)}
                placeholder="room name, e.g. myavana-chatbot"
                className="glass-panel h-8 rounded-md px-2.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              <label className="sr-only" htmlFor="new-room-project">
                Project for the new room
              </label>
              <select
                id="new-room-project"
                value={chosenProject}
                onChange={(e) => setProjectId(e.target.value)}
                className={cn(buttonVariants({ variant: 'glass' }), 'pr-2')}
                title="A new room must be bound to a project so its jobs have a repository"
              >
                {projects.length === 0 && <option value="">No projects yet</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <button type="submit" disabled={!canSend} className={buttonVariants({ variant: 'default' })}>
          {busy ? 'Starting…' : 'Start job'}
        </button>
      </div>
      {!onStartJob && <p className="text-xs text-muted-foreground">Jobs can be started once the runtime is reachable.</p>}
      {needsNewRoom && projects.length === 0 && (
        <p className="text-xs text-needs-you">
          Create a project in <a className="underline" href={href({ name: 'workspaces' })}>Workspaces</a> first; a job needs a repository.
        </p>
      )}
      {error && <p className="text-xs text-risk">Could not start the job: {error}</p>}
    </form>
  );
}

export function TeamNow({ identities, sessions, className }: { identities: Identity[]; sessions: Session[]; className?: string }) {
  const sessionFor = (id: string) => sessions.find((s) => s.agentId === id && isLive(s));
  return (
    <aside aria-label="Team right now" className={cn('bg-card flex flex-col gap-3.5 rounded-xl p-4.5', className)}>
      <div>
        <h2 className="text-[15px] font-semibold">Team right now</h2>
        <p className="text-xs text-muted-foreground">Only what the runtime has seen. No guesses.</p>
      </div>
      {identities.length === 0 ? (
        <EmptyState title="No coworkers yet">
          Add them on the <a className="underline" href={href({ name: 'coworkers' })}>Coworkers</a> screen.
        </EmptyState>
      ) : (
        identities.map((i) => {
          const s = sessionFor(i.id);
          return (
            <div key={i.id} className="flex items-center gap-2.5">
              <Avatar who={i} size={30} />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-sm">
                  {i.name} {i.runtime && <span className="text-xs text-muted-foreground">· {i.runtime}</span>}
                </span>
                <span className="truncate text-xs text-muted-foreground">{s ? `Session ${s.state}` : 'No session seen'}</span>
              </div>
              <Tag tone={s ? 'observed' : 'quiet'}>{s ? 'Live' : 'Offline'}</Tag>
            </div>
          );
        })
      )}
      <p className="mt-auto rounded-lg border border-dashed border-foreground/15 p-3 text-xs text-muted-foreground">
        A coworker shows as Live only while the runtime sees its session running, whatever the registry says.
      </p>
    </aside>
  );
}
