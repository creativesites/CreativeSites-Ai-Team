import * as React from 'react';
import type { Evidence, Identity, JobDetail, JobSummary, Session, TranscriptEntry } from '@runtime/types';
import { Avatar } from '@/components/app/avatar';
import { isLive } from '@/components/app/shell';
import { EmptyState, EvidenceTag, jobLabel, SectionTitle, StageBar, Tag } from '@/components/app/status';
import { AgentTerminal, Terminal } from '@/components/terminal';
import { DiffView } from '@/components/ui/diff-view';
import { StepList, type Step } from '@/components/ui/tool-steps';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

type DevViewMode = 'agent-terminal' | 'split' | 'shell' | 'transcript';

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
  const { client } = useRuntime();
  const who = (id: string) => identities.find((i) => i.id === id) ?? { id, name: id, seats: [] };
  const steps = job ? stepsFrom(job.evidence) : [];
  const patches = job ? job.evidence.filter((e) => e.kind === 'diff' && (e.payload as { patch?: string })?.patch) : [];

  // Combine job-specific sessions and all recent runtime sessions so standalone wakes are also visible
  const allSessions = React.useMemo(() => {
    const map = new Map<string, Session>();
    for (const s of job?.sessions ?? []) map.set(s.id, s);
    for (const s of sessions) {
      if (!map.has(s.id)) map.set(s.id, s);
    }
    return Array.from(map.values());
  }, [job?.sessions, sessions]);

  const [selected, setSelected] = React.useState<string>(allSessions[0]?.id ?? '');
  React.useEffect(() => {
    setSelected((current) => (allSessions.some((s) => s.id === current) ? current : (allSessions[0]?.id ?? '')));
  }, [allSessions]);

  const selectedSession = allSessions.find((s) => s.id === selected) ?? null;
  const [viewMode, setViewMode] = React.useState<DevViewMode>('agent-terminal');

  // Quick Wake bar state
  const coworkers = identities.filter((i) => !i.isOwner);
  const [wakeTargetId, setWakeTargetId] = React.useState<string>(coworkers[0]?.id ?? 'atlas');
  const [wakePrompt, setWakePrompt] = React.useState('');
  const [waking, setWaking] = React.useState(false);
  const [wakeMessage, setWakeMessage] = React.useState<string | null>(null);

  const transcript = useRuntimeData(
    (c) => (selected ? c.transcript(selected) : Promise.resolve([] as TranscriptEntry[])),
    [selected]
  );

  const handleQuickWake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !wakeTargetId || !wakePrompt.trim() || waking) return;
    setWaking(true);
    setWakeMessage(null);
    try {
      const res = await client.wakeAgent(wakeTargetId, {
        fromActorId: 'winston',
        fromActorKind: 'human',
        jobId: job?.id ?? null,
        prompt: wakePrompt.trim(),
        reason: 'Woken from Dev terminal view',
        allowFallbackAdapter: true,
      });
      setWakePrompt('');
      if (res.session?.id) {
        setSelected(res.session.id);
        setViewMode('agent-terminal');
        setWakeMessage(`Woke ${who(wakeTargetId).name} (${res.session.id})`);
      } else if (res.deferredUntil) {
        setWakeMessage(`Rate limited — scheduled auto-resume at ${new Date(res.deferredUntil).toLocaleTimeString()}`);
      }
    } catch (err) {
      setWakeMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setWaking(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-3 lg:flex-row">
      <section aria-label="Sessions" className="bg-card flex flex-col gap-3 rounded-xl p-4 lg:w-72">
        <SectionTitle aside={`${allSessions.filter(isLive).length} live`}>Sessions</SectionTitle>

        {client && coworkers.length > 0 && (
          <form onSubmit={handleQuickWake} className="glass-panel flex flex-col gap-2 rounded-lg p-2.5">
            <span className="text-[11px] font-medium text-muted-foreground">Wake / Start Agent Terminal</span>
            <select
              value={wakeTargetId}
              onChange={(e) => setWakeTargetId(e.target.value)}
              aria-label="Agent to wake"
              className="h-8 rounded border border-border/60 bg-background/70 px-2 text-xs"
            >
              {coworkers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.runtime ?? 'claude'})
                  {c.statusState === 'rate_limited' ? ' · RATE LIMITED' : c.statusState === 'working' ? ' · LIVE' : ''}
                </option>
              ))}
            </select>
            <input
              value={wakePrompt}
              onChange={(e) => setWakePrompt(e.target.value)}
              placeholder="Instruction to run…"
              aria-label="Wake prompt"
              className="h-8 rounded border border-border/60 bg-background/70 px-2 text-xs outline-none"
            />
            <button
              type="submit"
              disabled={!wakePrompt.trim() || waking}
              className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'w-full')}
            >
              {waking ? 'Waking…' : 'Wake Agent'}
            </button>
            {wakeMessage && <span className="text-[11px] text-muted-foreground">{wakeMessage}</span>}
          </form>
        )}

        {allSessions.length === 0 ? (
          <EmptyState title="No agent sessions yet">Wake an agent above or start a builder from the Job screen; its live terminal appears here.</EmptyState>
        ) : (
          <div className="flex max-h-96 flex-col gap-1.5 overflow-y-auto pr-0.5">
            {allSessions.map((s) => {
              const agent = who(s.agentId);
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-foreground/[0.04]',
                    selected === s.id && 'glass-chosen'
                  )}
                >
                  <Avatar who={agent} size={26} />
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-medium">{agent.name}</span>
                      <Tag tone={s.state === 'running' || s.state === 'starting' ? 'observed' : s.state === 'failed' ? 'risk' : 'quiet'}>
                        {s.state}
                      </Tag>
                    </div>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {s.id} · {s.turnCount ?? 0}t
                    </span>
                    {s.acpSessionId && (
                      <span className="truncate font-mono text-[10px] text-muted-foreground/80">
                        acp: {s.acpSessionId}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2">
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
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 pt-3.5 pb-3">
          <div className="flex flex-col gap-1.5">
            {job ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-xs text-muted-foreground">{jobLabel(job.number)}</span>
                <h1 className="text-base font-semibold">{job.title}</h1>
                <a href={href({ name: 'job', jobId: job.id })} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                  Work view
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold">Live Agent Terminal &amp; Shell</h1>
                <span className="text-xs text-muted-foreground">Full CLI / ACP stream &amp; interactive PTY</span>
              </div>
            )}
            {job && <StageBar stage={job.stage} compact className="max-w-md" />}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Developer view mode">
            {(
              [
                { id: 'agent-terminal', label: 'Agent Terminal (Live Output)' },
                { id: 'split', label: 'Split (Agent + Shell)' },
                { id: 'shell', label: 'Worktree Shell (zsh)' },
                { id: 'transcript', label: 'Structured Transcript' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={viewMode === tab.id}
                onClick={() => setViewMode(tab.id)}
                className={cn(
                  buttonVariants({ variant: viewMode === tab.id ? 'default' : 'glass', size: 'sm' }),
                  'text-xs'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-5 p-5">
          {viewMode === 'agent-terminal' && (
            <section aria-label="Agent Terminal" className="flex flex-col gap-3">
              <SectionTitle aside={selectedSession ? `${selectedSession.runtimeCommand ?? 'ACP'} · ${selectedSession.worktree ?? 'workspace'}` : 'select or wake an agent session'}>
                Full Agent Terminal Output
              </SectionTitle>
              {!selectedSession ? (
                <EmptyState title="No session selected">
                  Wake an agent on the left or start a builder from a job to stream its full Claude Code / Codex / Gemini terminal output here.
                </EmptyState>
              ) : (
                <AgentTerminal
                  sessionId={selectedSession.id}
                  agentId={selectedSession.agentId}
                  agentName={who(selectedSession.agentId).name}
                  className="min-h-[440px]"
                />
              )}
            </section>
          )}

          {viewMode === 'split' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <section aria-label="Agent Terminal" className="flex flex-col gap-2">
                <SectionTitle aside="live agent CLI output">Agent Terminal</SectionTitle>
                {selectedSession ? (
                  <AgentTerminal
                    sessionId={selectedSession.id}
                    agentId={selectedSession.agentId}
                    agentName={who(selectedSession.agentId).name}
                    className="min-h-[420px]"
                  />
                ) : (
                  <EmptyState title="No agent session selected">Select or wake an agent on the left.</EmptyState>
                )}
              </section>
              <section aria-label="Interactive Shell" className="flex flex-col gap-2">
                <SectionTitle aside="interactive login shell">Worktree Shell (zsh)</SectionTitle>
                <Terminal cwd={selectedSession?.worktree ?? undefined} className="min-h-[420px]" />
              </section>
            </div>
          )}

          {viewMode === 'shell' && (
            <section aria-label="Terminal" className="flex flex-col gap-3">
              <SectionTitle aside="interactive PTY shell in the worktree or workspace">Terminal</SectionTitle>
              <Terminal cwd={selectedSession?.worktree ?? undefined} className="min-h-[460px]" />
            </section>
          )}

          {viewMode === 'transcript' && (
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
          )}

          <div className="grid grid-cols-1 gap-5 border-t border-border/60 pt-4 2xl:grid-cols-2">
            <section aria-label="Steps" className="flex min-w-0 flex-1 flex-col gap-3">
              <SectionTitle aside="recorded by the runtime">Steps</SectionTitle>
              {steps.length === 0 ? (
                <EmptyState title="No commands recorded">Commands and checks run by agents appear here.</EmptyState>
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
        </div>
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
