import * as React from 'react';
import type { Evidence, Identity, JobDetail, JobSummary, Session, TranscriptEntry } from '@runtime/types';
import { Avatar } from '@/components/app/avatar';
import { isLive } from '@/components/app/shell';
import { EmptyState, EvidenceTag, jobLabel, SectionTitle, StageBar, Tag } from '@/components/app/status';
import { Terminal } from '@/components/terminal';
import { DiffView } from '@/components/ui/diff-view';
import { StepList, type Step } from '@/components/ui/tool-steps';
import { href } from '@/lib/route';
import { useRuntimeData } from '@/lib/runtime-context';
import { buttonVariants } from '@/components/ui/button';
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
  const jobSessions = job?.sessions ?? sessions;
  const [selected, setSelected] = React.useState<string>(jobSessions[0]?.id ?? '');
  React.useEffect(() => {
    setSelected((current) => (jobSessions.some((s) => s.id === current) ? current : (jobSessions[0]?.id ?? '')));
  }, [jobSessions]);
  const selectedSession = jobSessions.find((s) => s.id === selected) ?? null;
  const [terminalOpen, setTerminalOpen] = React.useState(false);
  const transcript = useRuntimeData(
    (c) => (selected ? c.transcript(selected) : Promise.resolve([] as TranscriptEntry[])),
    [selected]
  );

  return (
    <div className="flex min-h-full flex-col gap-3 lg:flex-row">
      <section aria-label="Sessions" className="bg-card flex flex-col gap-3 rounded-xl p-4 lg:w-64">
        <SectionTitle aside={`${sessions.filter(isLive).length} live`}>Sessions</SectionTitle>
        {jobSessions.length === 0 ? (
          <EmptyState title="No agent sessions yet">Start a builder from the Job screen; its transcript appears here.</EmptyState>
        ) : (
          jobSessions.map((s) => (
            <button type="button" key={s.id} onClick={() => setSelected(s.id)} className={cn('flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left hover:bg-foreground/[0.04]', selected === s.id && 'glass-chosen')}>
              <Avatar who={who(s.agentId)} size={26} />
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="text-sm">{who(s.agentId).name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {s.state} · {s.turnCount ?? 0} turns
                </span>
              </div>
            </button>
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
              <section aria-label="Transcript" className="flex min-w-0 flex-1 flex-col gap-3">
                <SectionTitle aside={selected ? 'streamed from the session' : 'select a session'}>Transcript</SectionTitle>
                {!selected ? (
                  <EmptyState title="No session selected">Pick a session on the left.</EmptyState>
                ) : transcript.status !== 'ready' ? (
                  <p className="text-sm text-muted-foreground">{transcript.status === 'offline' ? 'Runtime offline.' : 'Loading…'}</p>
                ) : transcript.data.length === 0 ? (
                  <EmptyState title="No transcript yet">The session is starting; chunks appear as the agent works.</EmptyState>
                ) : (
                  <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto rounded-lg border border-border/50 p-3">
                    {transcript.data.map((entry) => (
                      <TranscriptLine key={entry.id} entry={entry} />
                    ))}
                  </div>
                )}
              </section>
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
            <section aria-label="Terminal" className="border-t border-border/60 p-5">
              <SectionTitle aside="your login shell, not the agent session">Terminal</SectionTitle>
              {!terminalOpen ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setTerminalOpen(true)} disabled={!selectedSession?.worktree} className={buttonVariants({ variant: 'glass' })}>
                    <TerminalIcon /> Open terminal in this worktree
                  </button>
                  {!selectedSession?.worktree && <span className="text-xs text-muted-foreground">Start a builder session first; the terminal opens in its worktree.</span>}
                </div>
              ) : (
                <div className="mt-2 h-80 w-full overflow-hidden rounded-lg border border-border/60">
                  <Terminal cwd={selectedSession?.worktree ?? undefined} />
                </div>
              )}
            </section>
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

function TerminalIcon() {
  return <span aria-hidden="true" className="mr-1 font-mono text-xs">&gt;_</span>;
}

function TranscriptLine({ entry }: { entry: TranscriptEntry }) {
  const payload = (entry.payload ?? {}) as { text?: string; title?: string; status?: string; message?: string; toolCallId?: string; commitSha?: string };
  const text = payload.text ?? payload.title ?? payload.message ?? '';
  if (!text && entry.kind === 'turn_end') {
    return <div className="text-xs text-muted-foreground">— turn ended —</div>;
  }
  const author = entry.role === 'user' ? 'You' : entry.role === 'assistant' ? 'Agent' : entry.role === 'thought' ? 'Thinking' : entry.kind;
  return (
    <div className={cn('flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-[13px]', entry.role === 'assistant' ? 'bg-foreground/[0.03]' : '')}>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        <span>{author}</span>
        {payload.status && <span>· {payload.status}</span>}
      </div>
      <span className="whitespace-pre-wrap break-words">{text || entry.kind}</span>
      {entry.kind === 'commit' && payload.commitSha && <code className="text-[11px] text-muted-foreground">{payload.commitSha}</code>}
    </div>
  );
}
