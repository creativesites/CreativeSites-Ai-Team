import * as React from 'react';
import {
  CheckCircle2,
  Clock,
  GitCommit,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Send,
  ShieldCheck,
  Square,
  Terminal as TerminalIcon,
  Zap,
} from 'lucide-react';
import type { Evidence, Identity, JobDetail, JobSummary, Session, TranscriptEntry, WorktreeFile } from '@runtime/types';
import { Avatar } from '@/components/app/avatar';
import { isLive } from '@/components/app/shell';
import { EmptyState, EvidenceTag, jobLabel, SectionTitle, StageBar, Tag } from '@/components/app/status';
import { AgentTerminal, StructuredTranscriptView, Terminal } from '@/components/terminal';
import { DiffView } from '@/components/ui/diff-view';
import { StepList, type Step } from '@/components/ui/tool-steps';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

type DevViewMode = 'stream' | 'agent-terminal' | 'split' | 'shell';
type InspectorTab = 'evidence' | 'files' | 'steps' | 'changes';

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
  const { client, revision } = useRuntime();
  const who = (id: string) => identities.find((i) => i.id === id) ?? { id, name: id, seats: [] };
  const steps = job ? stepsFrom(job.evidence) : [];
  const patches = job ? job.evidence.filter((e) => e.kind === 'diff' && (e.payload as { patch?: string })?.patch) : [];
  const evidenceCount = (job?.evidence.length ?? 0) + steps.length + patches.length;

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
  const activeAgent = selectedSession ? who(selectedSession.agentId) : null;

  // View mode & collapsible panels (persisted in localStorage)
  const [viewMode, setViewMode] = React.useState<DevViewMode>(() => {
    try {
      const saved = localStorage.getItem('myaos.dev.viewMode') as DevViewMode | null;
      if (saved && ['stream', 'agent-terminal', 'split', 'shell'].includes(saved)) return saved;
    } catch {
      /* ignore */
    }
    return 'stream';
  });
  const changeViewMode = (mode: DevViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('myaos.dev.viewMode', mode);
    } catch {
      /* ignore */
    }
  };

  const [sessionsRailOpen, setSessionsRailOpen] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('myaos.dev.sessionsRail') !== '0';
    } catch {
      return true;
    }
  });
  const toggleSessionsRail = () => {
    setSessionsRailOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('myaos.dev.sessionsRail', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const [evidenceOpen, setEvidenceOpen] = React.useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('myaos.dev.evidenceOpen');
      if (saved !== null) return saved === '1';
    } catch {
      /* ignore */
    }
    return false;
  });
  const toggleEvidence = () => {
    setEvidenceOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('myaos.dev.evidenceOpen', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const [inspectorTab, setInspectorTab] = React.useState<InspectorTab>('evidence');
  const [sessionFiles, setSessionFiles] = React.useState<WorktreeFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = React.useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = React.useState(false);

  React.useEffect(() => {
    if (!client || !selectedSession) {
      setSessionFiles([]);
      setSelectedFilePath(null);
      return;
    }
    let cancelled = false;
    setLoadingFiles(true);
    client
      .sessionFiles(selectedSession.id)
      .then((files) => {
        if (!cancelled) {
          setSessionFiles(files);
          setSelectedFilePath((prev) => (files.some((f) => f.path === prev) ? prev : (files[0]?.path ?? null)));
        }
      })
      .catch(() => {
        if (!cancelled) setSessionFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, selectedSession?.id, revision]);

  // Quick Wake bar state (left rail)
  const coworkers = identities.filter((i) => !i.isOwner);
  const [wakeTargetId, setWakeTargetId] = React.useState<string>(coworkers[0]?.id ?? 'atlas');
  const [wakePrompt, setWakePrompt] = React.useState('');
  const [waking, setWaking] = React.useState(false);
  const [wakeMessage, setWakeMessage] = React.useState<string | null>(null);

  // Unified Bottom Instruction Dock state
  const [instructionText, setInstructionText] = React.useState('');
  const [instructionTarget, setInstructionTarget] = React.useState<string>('current');
  const [sendingInstruction, setSendingInstruction] = React.useState(false);
  const [dockStatus, setDockStatus] = React.useState<string | null>(null);

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
        reason: 'Woken from Sessions rail',
        allowFallbackAdapter: true,
      });
      setWakePrompt('');
      if (res.session?.id) {
        setSelected(res.session.id);
        setWakeMessage(`Woke ${who(wakeTargetId).name} (${res.session.id.slice(0, 12)})`);
      } else if (res.deferredUntil) {
        setWakeMessage(`Rate limited — auto-resume at ${new Date(res.deferredUntil).toLocaleTimeString()}`);
      }
    } catch (err) {
      setWakeMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setWaking(false);
    }
  };

  const handleSendInstruction = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!client || !instructionText.trim() || sendingInstruction) return;
    setSendingInstruction(true);
    setDockStatus(null);
    const text = instructionText.trim();
    try {
      if (instructionTarget === 'team-leader') {
        const res = await client.dispatchTeamLeader({
          fromActorId: 'winston',
          jobId: job?.id ?? null,
          roomId: selectedSession?.roomId ?? job?.roomId ?? null,
          goal: text,
        });
        setInstructionText('');
        if (res.session?.id) {
          setSelected(res.session.id);
          setDockStatus(`Delegated to Team Leader (${res.session.id.slice(0, 12)})`);
        }
      } else if (instructionTarget === 'current' && selectedSession) {
        try {
          const pRes = await client.promptSession(selectedSession.id, text);
          setInstructionText('');
          if (pRes.session?.id && pRes.session.id !== selectedSession.id) {
            setSelected(pRes.session.id);
            setDockStatus(
              `Auto-rotated ${who(selectedSession.agentId).name} to Gen ${pRes.session.generation ?? 2} (${pRes.session.id.slice(0, 12)}) with Baton Capsule`
            );
          } else {
            setDockStatus(`Instruction sent to ${who(selectedSession.agentId).name}`);
          }
        } catch {
          const res = await client.wakeAgent(selectedSession.agentId, {
            fromActorId: 'winston',
            fromActorKind: 'human',
            sessionId: selectedSession.id,
            jobId: selectedSession.jobId ?? job?.id ?? null,
            roomId: selectedSession.roomId ?? null,
            prompt: text,
            reason: 'Follow-up instruction from Sessions dock',
            allowFallbackAdapter: true,
          });
          setInstructionText('');
          if (res.session?.id) setSelected(res.session.id);
          setDockStatus(`Woke ${who(selectedSession.agentId).name} with instruction`);
        }
      } else {
        const targetId =
          instructionTarget !== 'current'
            ? instructionTarget
            : selectedSession?.agentId ?? wakeTargetId ?? coworkers[0]?.id ?? 'atlas';
        const res = await client.wakeAgent(targetId, {
          fromActorId: 'winston',
          fromActorKind: 'human',
          jobId: job?.id ?? selectedSession?.jobId ?? null,
          roomId: selectedSession?.roomId ?? null,
          prompt: text,
          reason: 'Instruction from Sessions dock',
          allowFallbackAdapter: true,
        });
        setInstructionText('');
        if (res.session?.id) {
          setSelected(res.session.id);
          setDockStatus(`Started session with ${who(targetId).name}`);
        } else if (res.deferredUntil) {
          setDockStatus(`Rate limited — queued for ${new Date(res.deferredUntil).toLocaleTimeString()}`);
        }
      }
    } catch (err) {
      setDockStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingInstruction(false);
    }
  };

  const handleInterruptSession = async () => {
    if (!client || !selectedSession) return;
    try {
      await client.cancelSession(selectedSession.id, 'winston');
      setDockStatus(`Stopped session ${selectedSession.id.slice(0, 12)}`);
    } catch (err) {
      setDockStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const [rotatingSession, setRotatingSession] = React.useState(false);
  const handleRotateSession = async () => {
    if (!client || !selectedSession || rotatingSession) return;
    setRotatingSession(true);
    setDockStatus(null);
    try {
      const res = await client.rotateSession(selectedSession.id, {
        prompt: instructionText.trim() || undefined,
        reason: 'manual_ui_relay',
      });
      setInstructionText('');
      setSelected(res.newSession.id);
      setDockStatus(
        `Relayed Baton to Gen ${res.newSession.generation ?? 2} (${res.newSession.id.slice(0, 12)}) · Saved ~${res.estimatedSavedTokens.toLocaleString()} tokens`
      );
    } catch (err) {
      setDockStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setRotatingSession(false);
    }
  };

  const handleScheduleCheckIn = async (delaySeconds: number, label: string) => {
    if (!client) return;
    const targetId = selectedSession?.agentId ?? wakeTargetId ?? 'atlas';
    try {
      await client.createSchedule({
        targetAgentId: targetId,
        createdBy: 'winston',
        jobId: selectedSession?.jobId ?? job?.id ?? null,
        roomId: selectedSession?.roomId ?? job?.roomId ?? null,
        delaySeconds,
        prompt: `Scheduled ${label} check-in: inspect progress, check pending tasks, and continue or report status.`,
        reason: `Quick ${label} check-in from Sessions dock`,
      });
      setDockStatus(`Scheduled ${label} check-in for ${who(targetId).name}`);
    } catch (err) {
      setDockStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] min-h-[620px] flex-col gap-3 overflow-hidden lg:flex-row">
      {/* 1. Collapsible Left Sessions Rail */}
      {sessionsRailOpen ? (
        <section
          aria-label="Sessions"
          className="bg-card flex shrink-0 flex-col gap-3 overflow-hidden rounded-xl border border-border/50 p-3.5 lg:w-72"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Sessions</span>
              <Tag tone={allSessions.filter(isLive).length > 0 ? 'observed' : 'quiet'}>
                {allSessions.filter(isLive).length} live
              </Tag>
            </div>
            <button
              type="button"
              onClick={toggleSessionsRail}
              title="Minimize Sessions rail"
              className="rounded-md p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>

          {client && coworkers.length > 0 && (
            <form onSubmit={handleQuickWake} className="glass-panel flex flex-col gap-2 rounded-lg p-2.5">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Zap className="size-3 text-emerald-400" />
                New Agent Session / Wake
              </span>
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
                placeholder="Instruction to start session…"
                aria-label="Wake prompt"
                className="h-8 rounded border border-border/60 bg-background/70 px-2 text-xs outline-none"
              />
              <button
                type="submit"
                disabled={!wakePrompt.trim() || waking}
                className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'w-full')}
              >
                <Play className="size-3.5" />
                {waking ? 'Starting…' : 'Start / Wake Agent'}
              </button>
              {wakeMessage && <span className="text-[11px] text-emerald-400">{wakeMessage}</span>}
            </form>
          )}

          {allSessions.length === 0 ? (
            <EmptyState title="No agent sessions yet">
              Wake an agent above or send an instruction in the bottom dock to start a live session.
            </EmptyState>
          ) : (
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
              {allSessions.map((s) => {
                const agent = who(s.agentId);
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.04]',
                      selected === s.id && 'glass-chosen border-border/60'
                    )}
                  >
                    <Avatar
                      who={agent}
                      size={28}
                      dot={s.state === 'running' || s.state === 'starting' ? 'var(--observed)' : undefined}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-sm font-medium">{agent.name}</span>
                        <Tag
                          tone={
                            s.state === 'running' || s.state === 'starting'
                              ? 'observed'
                              : s.state === 'failed'
                                ? 'risk'
                                : 'quiet'
                          }
                        >
                          {s.state}
                        </Tag>
                      </div>
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        Gen {s.generation ?? 1} · {s.id.slice(0, 10)} · {Math.round((s.contextTokens ?? 0) / 100) / 10}k ctx
                      </span>
                      {s.acpSessionId && (
                        <span className="truncate font-mono text-[10px] text-muted-foreground/75">
                          acp: {s.acpSessionId}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-auto flex max-h-36 flex-col gap-1 overflow-y-auto border-t border-border/50 pt-2">
            <span className="text-[11px] font-medium text-muted-foreground">Filter by Job</span>
            {jobs.map((j) => (
              <a
                key={j.id}
                href={href({ name: 'dev', jobId: j.id })}
                className={cn(
                  'truncate rounded-md px-2 py-1 text-xs hover:bg-foreground/[0.05]',
                  job?.id === j.id && 'glass-chosen'
                )}
              >
                <span className="font-mono text-[11px] text-muted-foreground">{jobLabel(j.number)}</span> {j.title}
              </a>
            ))}
            {jobs.length === 0 && <span className="text-xs text-muted-foreground">No jobs yet.</span>}
          </div>
        </section>
      ) : (
        <div className="bg-card flex shrink-0 flex-col items-center gap-3 rounded-xl border border-border/50 px-2 py-3">
          <button
            type="button"
            onClick={toggleSessionsRail}
            title="Expand Sessions rail"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <PanelLeftOpen className="size-4" />
          </button>
          <span className="font-mono text-[10px] text-muted-foreground [writing-mode:vertical-rl]">
            Sessions ({allSessions.length})
          </span>
        </div>
      )}

      {/* 2. Center Full-Height Agent Session Stage */}
      <main className="bg-card flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/50">
        {/* Top Session Header */}
        <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/60 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {!sessionsRailOpen && (
              <button
                type="button"
                onClick={toggleSessionsRail}
                className={cn(buttonVariants({ variant: 'glass', size: 'xs' }))}
              >
                <PanelLeftOpen className="size-3.5" /> Sessions
              </button>
            )}
            {selectedSession && activeAgent ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar
                  who={activeAgent}
                  size={28}
                  dot={
                    selectedSession.state === 'running' || selectedSession.state === 'starting'
                      ? 'var(--observed)'
                      : undefined
                  }
                />
                <div className="flex min-w-0 flex-col leading-tight">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-sm font-semibold">{activeAgent.name}</h1>
                    <Tag
                      tone={
                        selectedSession.state === 'running' || selectedSession.state === 'starting'
                          ? 'observed'
                          : selectedSession.state === 'failed'
                            ? 'risk'
                            : 'quiet'
                      }
                    >
                      {selectedSession.state}
                    </Tag>
                    {selectedSession.adapterId && (
                      <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {selectedSession.adapterId}
                      </span>
                    )}
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                        (selectedSession.contextTokens ?? 0) >= 32000
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      )}
                      title="Role Session Relay Generation & Live Context Window Fill (Soft Relay Limit: 36k tokens)"
                    >
                      Gen {selectedSession.generation ?? 1} · {((selectedSession.contextTokens ?? 0) / 1000).toFixed(1)}k / 36k ctx
                    </span>
                    {selectedSession.parentSessionId && (
                      <button
                        type="button"
                        onClick={() => setSelected(selectedSession.parentSessionId!)}
                        className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-sky-400 hover:underline"
                        title="Jump to previous generation session"
                      >
                        ← Gen {(selectedSession.generation ?? 2) - 1}
                      </button>
                    )}
                    {selectedSession.supersededBySessionId && (
                      <button
                        type="button"
                        onClick={() => setSelected(selectedSession.supersededBySessionId!)}
                        className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-300 hover:underline"
                        title="Jump to next generation session"
                      >
                        Gen {(selectedSession.generation ?? 1) + 1} →
                      </button>
                    )}
                  </div>
                  <div className="flex max-w-xl items-center gap-2 truncate font-mono text-[11px] text-muted-foreground">
                    <span>{selectedSession.id}</span>
                    {selectedSession.acpSessionId && <span>· acp: {selectedSession.acpSessionId.slice(0, 14)}</span>}
                    {selectedSession.worktree && (
                      <span className="truncate" title={selectedSession.worktree}>
                        · {selectedSession.worktree.split('/').slice(-2).join('/')}
                      </span>
                    )}
                    <span>·</span>
                    {selectedSession.usage ? (
                      <span
                        className="text-zinc-300 font-medium"
                        title={`${selectedSession.usage.inputTokens.toLocaleString()} in · ${selectedSession.usage.outputTokens.toLocaleString()} out`}
                      >
                        {selectedSession.usage.totalTokens.toLocaleString()} tokens
                        {selectedSession.usage.costCents > 0
                          ? ` ($${(selectedSession.usage.costCents / 100).toFixed(2)})`
                          : ''}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">tokens: UNKNOWN</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <TerminalIcon className="size-4 text-muted-foreground" />
                <h1 className="text-sm font-semibold">Agent Sessions &amp; Live Terminal</h1>
              </div>
            )}
          </div>

          {/* View Mode Tabs + Minimize/Expand Evidence Button */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="glass-panel flex items-center gap-1 rounded-lg p-0.5" role="tablist" aria-label="Session view mode">
              {(
                [
                  { id: 'stream', label: 'Live Stream' },
                  { id: 'agent-terminal', label: 'Agent Terminal (ANSI)' },
                  { id: 'split', label: 'Split (Agent + Shell)' },
                  { id: 'shell', label: 'Worktree Shell (zsh)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === tab.id}
                  onClick={() => changeViewMode(tab.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    viewMode === tab.id
                      ? 'bg-foreground text-background shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {selectedSession && (
              <button
                type="button"
                onClick={handleRotateSession}
                disabled={rotatingSession}
                title="Rotate to a fresh Gen N+1 session for this role while carrying a compact 3-Tier Baton Capsule of recent context"
                className={cn(
                  buttonVariants({ variant: 'glass', size: 'sm' }),
                  'border-amber-400/30 text-amber-300 hover:bg-amber-500/15'
                )}
              >
                <Zap className="size-3.5 text-amber-400" />
                {rotatingSession ? 'Relaying…' : 'Rotate Session (Carry Baton)'}
              </button>
            )}

            <button
              type="button"
              onClick={toggleEvidence}
              aria-expanded={evidenceOpen}
              title={evidenceOpen ? 'Minimize Evidence & Diff Inspector' : 'Open Evidence & Diff Inspector'}
              className={cn(
                buttonVariants({ variant: evidenceOpen ? 'default' : 'glass', size: 'sm' }),
                'gap-1.5 text-xs'
              )}
            >
              <ShieldCheck className="size-3.5" />
              <span>Evidence</span>
              {evidenceCount > 0 && (
                <span className="rounded-full bg-foreground/15 px-1.5 py-0.2 font-mono text-[10px]">
                  {evidenceCount}
                </span>
              )}
              {evidenceOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
            </button>
          </div>
        </header>

        {/* Optional Job Stage Context Banner */}
        {job && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-foreground/[0.02] px-4 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono text-muted-foreground">{jobLabel(job.number)}</span>
              <span className="font-medium">{job.title}</span>
              <a
                href={href({ name: 'job', jobId: job.id })}
                className="text-sky-400 underline-offset-4 hover:underline"
              >
                Open Job Board →
              </a>
            </div>
            <StageBar stage={job.stage} compact className="max-w-xs" />
          </div>
        )}

        {/* Active Session Viewport (takes 100% of remaining height above the composer) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3.5">
          {/* 1. Live Stream View */}
          <div className={cn('min-h-0 flex-1 flex flex-col', viewMode !== 'stream' && 'hidden')}>
            {!selectedSession ? (
              <EmptyState title="No session selected">
                Select a session on the left or type an instruction below to wake an agent.
              </EmptyState>
            ) : transcript.status !== 'ready' ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {transcript.status === 'offline' ? 'Runtime offline.' : 'Loading session stream…'}
              </div>
            ) : (
              <StructuredTranscriptView
                entries={transcript.data}
                agentName={activeAgent?.name ?? selectedSession.agentId}
                sessionState={selectedSession.state}
                className="min-h-0 flex-1"
              />
            )}
          </div>

          {/* 2. Agent Terminal View (ANSI) */}
          <div className={cn('min-h-0 flex-1 flex flex-col', viewMode !== 'agent-terminal' && 'hidden')}>
            {!selectedSession ? (
              <EmptyState title="No session selected">
                Wake an agent on the left or send an instruction below to stream its full Claude Code / Codex / Gemini terminal output here.
              </EmptyState>
            ) : (
              <AgentTerminal
                sessionId={selectedSession.id}
                agentId={selectedSession.agentId}
                agentName={activeAgent?.name}
                hideComposer
                className="min-h-0 flex-1"
              />
            )}
          </div>

          {/* 3. Split & Shell Views: share persistent shell Terminal so PTY sessions stay alive across tab switches */}
          <div
            className={cn(
              'min-h-0 flex-1',
              viewMode === 'split' ? 'grid grid-cols-1 gap-3 xl:grid-cols-2' : viewMode === 'shell' ? 'flex flex-col' : 'hidden'
            )}
          >
            {viewMode === 'split' && (
              <div className="flex min-h-0 flex-col overflow-hidden">
                {selectedSession ? (
                  <AgentTerminal
                    sessionId={selectedSession.id}
                    agentId={selectedSession.agentId}
                    agentName={activeAgent?.name}
                    hideComposer
                    className="min-h-0 flex-1"
                  />
                ) : (
                  <EmptyState title="No agent session selected">Select or wake an agent to view its terminal.</EmptyState>
                )}
              </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Terminal cwd={selectedSession?.worktree ?? undefined} className="min-h-0 flex-1" />
            </div>
          </div>
        </div>

        {/* Sticky Bottom Instruction & Control Dock */}
        <footer className="border-t border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur-md">
          <form onSubmit={handleSendInstruction} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-muted-foreground">Instruct:</span>
                <select
                  value={instructionTarget}
                  onChange={(e) => setInstructionTarget(e.target.value)}
                  aria-label="Instruction target"
                  className="h-7 rounded-md border border-border/60 bg-card px-2 text-xs font-medium"
                >
                  {selectedSession && (
                    <option value="current">
                      Continue {activeAgent?.name ?? selectedSession.agentId} ({selectedSession.id.slice(0, 12)})
                    </option>
                  )}
                  <option value="team-leader">★ Team Leader (Auto-delegate &amp; wake team)</option>
                  {coworkers.map((c) => (
                    <option key={c.id} value={c.id}>
                      Wake {c.name} ({c.runtime ?? 'claude'})
                      {c.statusState === 'rate_limited' ? ' · RATE LIMITED' : ''}
                    </option>
                  ))}
                </select>

                {selectedSession && (selectedSession.state === 'running' || selectedSession.state === 'starting') && (
                  <button
                    type="button"
                    onClick={handleInterruptSession}
                    className={cn(buttonVariants({ variant: 'destructive', size: 'xs' }))}
                  >
                    <Square className="size-3" /> Stop / Interrupt
                  </button>
                )}
              </div>

              {/* Quick Autonomous Action Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleScheduleCheckIn(900, '15m')}
                  title="Schedule an automatic 15-minute progress check-in for this agent"
                  className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'text-[11px]')}
                >
                  <Clock className="size-3" /> +15m Check-in
                </button>
                <button
                  type="button"
                  onClick={() => handleScheduleCheckIn(3600, '1h')}
                  title="Schedule an automatic 1-hour wakeup timer for this agent"
                  className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'text-[11px]')}
                >
                  <Clock className="size-3" /> +1h Timer
                </button>
                {job && client && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        void client
                          .commitJob(job.id, 'checkpoint from Sessions dock')
                          .then((r) => setDockStatus(r.committed ? `Committed ${r.commitSha.slice(0, 8)}` : 'Worktree clean'))
                          .catch((e) => setDockStatus(e instanceof Error ? e.message : String(e)));
                      }}
                      className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'text-[11px]')}
                    >
                      <GitCommit className="size-3" /> Commit Worktree
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void client
                          .verifyJob(job.id, 'kael')
                          .then((r) => setDockStatus(r.ok ? 'Independent verification passed (Kael)' : 'Verification reported failures'))
                          .catch((e) => setDockStatus(e instanceof Error ? e.message : String(e)));
                      }}
                      className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'text-[11px]')}
                    >
                      <CheckCircle2 className="size-3" /> Verify (Kael)
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={instructionText}
                onChange={(e) => setInstructionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendInstruction();
                  }
                }}
                placeholder={
                  selectedSession
                    ? `Give instructions to ${activeAgent?.name ?? selectedSession.agentId} (Enter to send, Shift+Enter for newline)…`
                    : 'Type an instruction to wake an agent or tell the Team Leader what needs to be done…'
                }
                aria-label="Instruction to agent"
                className="min-h-[44px] flex-1 resize-none rounded-lg border border-border/60 bg-card px-3 py-2 text-xs leading-relaxed outline-none focus:border-foreground/40"
              />
              <button
                type="submit"
                disabled={!instructionText.trim() || sendingInstruction}
                className={cn(buttonVariants({ variant: 'default', size: 'default' }), 'h-[44px] shrink-0 px-4')}
              >
                <Send className="size-3.5" />
                <span>{sendingInstruction ? 'Sending…' : 'Send'}</span>
              </button>
            </div>

            {dockStatus && (
              <div className="flex items-center justify-between text-[11px] text-emerald-400">
                <span>{dockStatus}</span>
                <button
                  type="button"
                  onClick={() => setDockStatus(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>
            )}
          </form>
        </footer>
      </main>

      {/* 3. Minimizable Right Evidence, Steps & Diff Inspector Drawer */}
      {evidenceOpen && (
        <aside
          aria-label="Evidence"
          className="bg-card flex shrink-0 flex-col gap-3 overflow-hidden rounded-xl border border-border/50 p-4 lg:w-88"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Evidence &amp; Inspector</h2>
              <p className="text-[11px] text-muted-foreground">Substrate-native truth recorded by the runtime.</p>
            </div>
            <button
              type="button"
              onClick={toggleEvidence}
              title="Minimize Evidence drawer"
              className="rounded-md p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <PanelRightClose className="size-4" />
            </button>
          </div>

          {/* Drawer Sub-tabs: Evidence Ledger | Files | Steps | Changes */}
          <div className="glass-panel grid grid-cols-4 gap-1 rounded-lg p-0.5 text-xs">
            {(
              [
                { id: 'evidence', label: `Ledger (${job?.evidence.length ?? 0})` },
                { id: 'files', label: `Files (${sessionFiles.length})` },
                { id: 'steps', label: `Steps (${steps.length})` },
                { id: 'changes', label: `Diffs (${patches.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setInspectorTab(t.id)}
                className={cn(
                  'truncate rounded-md px-1 py-1 text-[11px] font-medium transition-colors',
                  inspectorTab === t.id
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
            {inspectorTab === 'files' && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <SectionTitle aside={`${sessionFiles.length} file${sessionFiles.length === 1 ? '' : 's'}`}>
                    Worktree Changes
                  </SectionTitle>
                  {selectedSession?.worktree && (
                    <span className="truncate font-mono text-[10px] text-muted-foreground" title={selectedSession.worktree}>
                      {selectedSession.worktree.split('/').slice(-2).join('/')}
                    </span>
                  )}
                </div>

                {loadingFiles && sessionFiles.length === 0 ? (
                  <p className="py-4 text-xs text-muted-foreground">Scanning session worktree…</p>
                ) : sessionFiles.length === 0 ? (
                  <EmptyState title="No modified or untracked files">
                    The worktree is clean. Any files written by the agent will appear here with click-to-view diffs.
                  </EmptyState>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {sessionFiles.map((file) => {
                      const isSelected = selectedFilePath === file.path;
                      const statusColor =
                        file.status === 'untracked'
                          ? 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20'
                          : file.status === 'added'
                            ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                            : file.status === 'deleted'
                              ? 'text-rose-400 bg-rose-400/10 border-rose-400/20'
                              : 'text-amber-400 bg-amber-400/10 border-amber-400/20';
                      const statusBadge =
                        file.status === 'untracked'
                          ? '??'
                          : file.status === 'added'
                            ? 'A'
                            : file.status === 'deleted'
                              ? 'D'
                              : file.status === 'renamed'
                                ? 'R'
                                : 'M';
                      return (
                        <div
                          key={file.path}
                          className="flex flex-col overflow-hidden rounded-lg border border-border/50 bg-background/40"
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedFilePath(isSelected ? null : file.path)}
                            className={cn(
                              'flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-foreground/[0.04]',
                              isSelected && 'bg-foreground/[0.06] font-medium'
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2 truncate font-mono text-[11px]">
                              <span
                                className={cn(
                                  'shrink-0 rounded border px-1 py-0.2 font-mono text-[9px] font-semibold uppercase',
                                  statusColor
                                )}
                              >
                                {statusBadge}
                              </span>
                              <span className="truncate text-foreground" title={file.path}>
                                {file.path}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                              {isSelected ? 'hide' : 'diff'}
                            </span>
                          </button>
                          {isSelected && (
                            <div className="border-t border-border/50 p-2">
                              {file.diff ? (
                                <DiffView patch={file.diff} />
                              ) : (
                                <p className="font-mono text-[11px] italic text-muted-foreground">
                                  (empty or binary file)
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {inspectorTab === 'evidence' && (
              <>
                {job && job.criteria.length > 0 && (
                  <div className="flex flex-col gap-1.5 rounded-lg border border-border/50 bg-background/40 p-2.5">
                    <span className="text-[11px] font-medium text-muted-foreground">Done means</span>
                    {job.criteria.map((c) => (
                      <div key={c.id} className="flex items-start justify-between gap-2 text-xs">
                        <span>{c.text}</span>
                        <EvidenceTag value={c.evidenceClass} />
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-col">
                  <SectionTitle aside={job ? `${job.evidence.length} items` : 'no job selected'}>Ledger</SectionTitle>
                  {!job || job.evidence.length === 0 ? (
                    <p className="py-4 text-xs text-muted-foreground">
                      Nothing recorded yet. Commands, diffs, and independent verifications appear here automatically.
                    </p>
                  ) : (
                    job.evidence.map((e) => (
                      <div
                        key={e.id}
                        className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/50 py-2 text-xs"
                      >
                        <span className="font-mono text-[11px] text-muted-foreground">{time(e.createdAt)}</span>
                        <span className="flex min-w-0 flex-col">
                          <span className="break-words">{e.summary}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {who(e.recordedBy).name} · {e.kind}
                          </span>
                        </span>
                        <EvidenceTag value={e.class} />
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {inspectorTab === 'steps' && (
              steps.length === 0 ? (
                <EmptyState title="No commands recorded">Commands and checks run by agents appear here.</EmptyState>
              ) : (
                <StepList steps={steps} />
              )
            )}

            {inspectorTab === 'changes' && (
              patches.length === 0 ? (
                <EmptyState title="No file changes recorded" />
              ) : (
                patches.map((e) => <DiffView key={e.id} patch={(e.payload as { patch: string }).patch} />)
              )
            )}
          </div>

          <Tag className="mt-auto self-start">Desktop reads the runtime; it makes no AI calls</Tag>
        </aside>
      )}
    </div>
  );
}
