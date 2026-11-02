import * as React from 'react';
import {
  ChevronLeft,
  Check,
  GitMerge,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import type { AdapterInfo, Evidence, Identity, JobDetail, JobKind, JobStage, Room, Session, Task } from '@runtime/types';
import { Avatar, OwnerAvatar } from '@/components/app/avatar';
import { EmptyState, EvidenceTag, jobLabel, SectionTitle, StageBar, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

const time = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const shortTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

const NEXT: Partial<Record<JobStage, { to: JobStage; label: string; hint: string }>> = {
  brief: { to: 'plan', label: 'Start planning', hint: 'A plan and criteria turn the brief into work.' },
  plan: { to: 'build', label: 'Start build', hint: 'Needs a plan summary and at least one task.' },
  build: { to: 'verify', label: 'Send to verify', hint: 'Needs every task done and evidenced.' },
  verify: { to: 'approve', label: 'Request approval', hint: 'Needs every criterion observed or verified.' },
  approve: { to: 'done', label: 'Mark done', hint: 'Needs every pending approval resolved.' },
};

const JOB_KINDS: Array<{ id: JobKind; label: string }> = [
  { id: 'code', label: 'Code' },
  { id: 'research', label: 'Research' },
  { id: 'ops', label: 'Ops' },
  { id: 'design', label: 'Design' },
  { id: 'decision', label: 'Decision' },
];

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
  const { client } = useRuntime();
  const settings = useRuntimeData((c) => c.settings());
  const adapters = useRuntimeData((c) => c.adapters());
  const budget = useRuntimeData((c) => (client ? c.jobBudget(job.id) : Promise.resolve(null)), [job.id]);
  const ownerId = (settings.status === 'ready' && String(settings.data.ownerId ?? '')) || 'winston';
  const who = (id: string) => identities.find((i) => i.id === id);

  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [forceTarget, setForceTarget] = React.useState<JobStage | null>(null);
  const [planSummary, setPlanSummary] = React.useState(job.plan?.summary ?? '');
  const [criterionText, setCriterionText] = React.useState('');
  const [taskTitle, setTaskTitle] = React.useState('');
  const [taskCheck, setTaskCheck] = React.useState('');
  const builders = identities.filter((i) => !i.isOwner && i.id !== ownerId);
  const [agentId, setAgentId] = React.useState(job.tasks.find((t) => t.assigneeId)?.assigneeId ?? builders[0]?.id ?? '');
  const [taskId, setTaskId] = React.useState(job.tasks[0]?.id ?? '');
  const readyAdapters = (adapters.status === 'ready' ? adapters.data : []).filter(
    (a) => a.installed && (a.auth.state === 'ready' || a.auth.state === 'configured')
  );
  const [adapterId, setAdapterId] = React.useState(readyAdapters[0]?.id ?? 'claude');
  const verifiers = identities.filter((i) => !i.isOwner && i.id !== ownerId);
  const [verifierId, setVerifierId] = React.useState(
    job.tasks.find((t) => t.assigneeId)?.assigneeId === 'kael'
      ? (verifiers[0]?.id ?? 'kael')
      : (verifiers.find((i) => i.id === 'kael')?.id ?? verifiers[0]?.id ?? 'kael')
  );
  const [approvalTitle, setApprovalTitle] = React.useState(`Merge ${jobLabel(job.number)} into main`);
  const [approvalConsequence, setApprovalConsequence] = React.useState(
    'The verified change is merged into main. Nothing is deployed; a revert undoes it.'
  );
  const [shipStrategy, setShipStrategy] = React.useState<'merge' | 'cherry-pick' | 'branch'>('merge');
  const [scheduleInterval, setScheduleInterval] = React.useState('15m');

  React.useEffect(() => {
    setTaskId((current) => (job.tasks.some((t) => t.id === current) ? current : (job.tasks[0]?.id ?? '')));
  }, [job.tasks]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    setForceTarget(null);
    try {
      await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      if (/Gates not met/i.test(message)) {
        const target = NEXT[job.stage]?.to;
        if (target) setForceTarget(target);
      }
    } finally {
      setBusy(null);
    }
  };

  const move = (to: JobStage) => act(`move:${to}`, () => client!.transitionJob(job.id, { to, actorId: ownerId }));
  const forceMove = (to: JobStage) =>
    act(`force:${to}`, () => client!.transitionJob(job.id, { to, actorId: ownerId, force: true, note: 'Owner override from the Job screen' }));
  const next = NEXT[job.stage];
  const pending = job.approvals.filter((a) => a.status === 'pending');
  const liveSessions = (job.sessions ?? []).filter((s) => s.state === 'starting' || s.state === 'running' || s.state === 'idle');

  const addCriterion = () =>
    act('criterion', async () => {
      if (!criterionText.trim()) return;
      await client!.addCriterion(job.id, { text: criterionText.trim() });
      setCriterionText('');
    });
  const addTask = () =>
    act('task', async () => {
      if (!taskTitle.trim()) return;
      await client!.createTask(job.id, {
        title: taskTitle.trim(),
        checkCommand: taskCheck.trim() || null,
        assigneeId: agentId || null,
        position: job.tasks.length,
      });
      setTaskTitle('');
      setTaskCheck('');
    });
  const startBuilder = () =>
    act('session', async () => {
      if (!taskId) throw new Error('Add a task first; a builder session belongs to a task.');
      const session = await client!.startSession(job.id, { agentId, adapterId, taskId, mode: 'build' });
      setNotice(`Builder session ${session.id} started (acp: ${session.acpSessionId ?? 'capturing'}). Follow it in Dev.`);
    });

  const dispatchLeaderForJob = () =>
    act('leader-dispatch', async () => {
      const res = await client!.dispatchTeamLeader({
        fromActorId: ownerId,
        roomId: job.roomId,
        jobId: job.id,
        goal: `Drive ${jobLabel(job.number)} (${job.title}) through implementation and independent verification. Wake assigned builders and Kael as tasks complete.`,
      });
      setNotice(
        res.session?.id
          ? `Team Leader woken (session ${res.session.id}) — coordinating ${jobLabel(job.number)}.`
          : `Team Leader scheduled on reset (${shortTime(res.deferredUntil)}).`
      );
    });

  const scheduleJobCheckin = () =>
    act('schedule-checkin', async () => {
      const durMatch = scheduleInterval.trim().match(/^(\d+)\s*(s|m|h)$/i);
      const secs = durMatch
        ? Number(durMatch[1]) * (durMatch[2]!.toLowerCase() === 'h' ? 3600 : durMatch[2]!.toLowerCase() === 'm' ? 60 : 1)
        : 900;
      const target = agentId || 'atlas';
      await client!.createSchedule({
        targetAgentId: target,
        createdBy: ownerId,
        jobId: job.id,
        roomId: job.roomId,
        intervalSeconds: secs,
        prompt: `Scheduled progress check on ${jobLabel(job.number)} (${job.title}): inspect task checks, wake blocked coworkers, or hand off to Kael for verification.`,
      });
      setNotice(`Scheduled recurring ${scheduleInterval} wakeup check-in for ${who(target)?.name ?? target}.`);
    });

  const handleShip = () =>
    act('ship', async () => {
      const res = await client!.shipJob(job.id, {
        strategy: shipStrategy,
        actorId: ownerId,
      });
      setNotice(
        `Shipped via ${res.strategy}${res.commitSha ? ` (${res.commitSha.slice(0, 10)})` : ''}${res.branch ? ` on ${res.branch}` : ''}.`
      );
    });

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
        <div className="flex flex-wrap items-center gap-2">
          {client && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Kind
              <select
                value={job.kind ?? 'code'}
                onChange={(e) => void act('kind', () => client.updateJob(job.id, { kind: e.target.value as JobKind }))}
                aria-label="Job kind"
                className="glass-panel h-8 rounded-md px-2 text-xs text-foreground"
              >
                {JOB_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {job.shipStatus === 'shipped' && <Tag tone="verified">Shipped</Tag>}
          <Tag tone={job.risk === 'high' || job.risk === 'critical' ? 'risk' : 'quiet'}>Risk {job.risk ?? 'low'}</Tag>
          <span className="text-xs text-muted-foreground">Owner: {ownerName}</span>
          <Tag tone="quiet">{job.costCents ?? 0}¢ spent</Tag>
          <a href={href({ name: 'council', jobId: job.id })} className={buttonVariants({ variant: 'default' })}>
            Convene Council
          </a>
          <a href={href({ name: 'dev', jobId: job.id })} className={buttonVariants({ variant: 'glass' })}>
            <Terminal /> Dev
          </a>
        </div>
      </header>

      <StageBar stage={job.stage} waitingOnYou={pending.length > 0} />

      {client && (
        <div className="bg-card flex flex-wrap items-center justify-between gap-2.5 rounded-xl px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">
            <strong>Autonomous Job Coordination:</strong> Have the Team Leader wake builders &amp; verifier, or schedule self-wake check-ins.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={dispatchLeaderForJob}
              disabled={busy !== null}
              className={buttonVariants({ variant: 'glass', size: 'sm' })}
            >
              {busy === 'leader-dispatch' ? 'Waking Leader…' : 'Ask Team Leader to Drive Job'}
            </button>
            <div className="flex items-center gap-1">
              <input
                value={scheduleInterval}
                onChange={(e) => setScheduleInterval(e.target.value)}
                aria-label="Check-in interval"
                className="glass-panel h-8 w-16 rounded-md px-2 font-mono text-xs outline-none"
              />
              <button
                type="button"
                onClick={scheduleJobCheckin}
                disabled={busy !== null}
                className={buttonVariants({ variant: 'glass', size: 'sm' })}
              >
                Schedule Check-in
              </button>
            </div>
          </div>
        </div>
      )}

      {(error || notice) && (
        <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm', error ? 'border-risk/40 bg-risk/10 text-risk' : 'border-verified/40 bg-verified/10 text-verified')} role="status">
          <span>{error ?? notice}</span>
          {forceTarget && (
            <button type="button" onClick={() => forceMove(forceTarget)} disabled={busy !== null} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
              Owner override → {forceTarget}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => { setError(null); setNotice(null); setForceTarget(null); }}>
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <section aria-label="The brief" className="bg-card flex flex-col gap-3 rounded-xl px-5 py-4.5">
            <SectionTitle aside={job.kind && job.kind !== 'code' ? `${job.kind} job (non-code verification enabled)` : 'what must be true when this is done'}>
              The brief
            </SectionTitle>
            <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-foreground/90">{job.brief || 'No brief written.'}</p>
          </section>

          <section aria-label="The plan" className="bg-card flex flex-col gap-3 rounded-xl px-5 py-4.5">
            <SectionTitle aside={job.plan?.approvedAt ? `accepted ${time(job.plan.approvedAt)}` : 'not accepted yet'}>The plan</SectionTitle>
            <textarea
              value={planSummary}
              onChange={(e) => setPlanSummary(e.target.value)}
              placeholder="What is the plan? Tasks and checks live below."
              aria-label="Plan summary"
              className="min-h-20 w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
            {job.plan?.options?.length ? (
              <div className="flex flex-wrap gap-2">
                {job.plan.options.map((o) => (
                  <Tag key={o.id} tone={job.plan?.chosen === o.id ? 'verified' : 'quiet'}>
                    {o.id}: {o.label}{o.score != null ? ` · ${o.score}` : ''}
                  </Tag>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => act('plan', () => client!.setPlan(job.id, { ...job.plan, summary: planSummary, approvedAt: job.plan?.approvedAt }, ownerId))} disabled={busy !== null || !planSummary.trim()} className={buttonVariants({ variant: 'glass' })}>
                {busy === 'plan' ? 'Saving…' : 'Save plan'}
              </button>
              <a href={href({ name: 'council', jobId: job.id })} className={buttonVariants({ variant: 'glass' })}>
                Open Council Room
              </a>
              {!job.plan?.approvedAt && (
                <button type="button" onClick={() => act('accept', () => client!.acceptPlan(job.id, ownerId))} disabled={busy !== null || !job.plan?.summary} className={buttonVariants({ variant: 'default' })}>
                  <Check /> Accept plan
                </button>
              )}
            </div>
          </section>

          <section aria-label="Done means" className="bg-card flex flex-col gap-3 rounded-xl px-5 py-4.5">
            <SectionTitle aside="each criterion shows its evidence class">Done means</SectionTitle>
            {job.criteria.length === 0 ? (
              <EmptyState title="No acceptance criteria yet">Add at least one before building.</EmptyState>
            ) : (
              job.criteria.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 border-b border-border/40 py-1.5 last:border-b-0">
                  <span className="text-[13px]">{c.text}</span>
                  <span className="flex items-center gap-2">
                    <EvidenceTag value={c.evidenceClass} />
                    <button type="button" aria-label={`Delete criterion ${c.text}`} onClick={() => act(`del-crit:${c.id}`, () => client!.deleteCriterion(c.id))} disabled={busy !== null}>
                      <X className="size-3.5 text-muted-foreground" />
                    </button>
                  </span>
                </div>
              ))
            )}
            <div className="flex gap-2">
              <input
                value={criterionText}
                onChange={(e) => setCriterionText(e.target.value)}
                placeholder="Add a criterion"
                aria-label="New criterion"
                className="glass-panel h-9 flex-1 rounded-md px-2.5 text-sm outline-none"
              />
              <button type="button" onClick={addCriterion} disabled={busy !== null || !criterionText.trim()} className={buttonVariants({ variant: 'glass' })}>
                <Plus /> Add
              </button>
            </div>
          </section>

          <section aria-label="Tasks" className="bg-card flex flex-col gap-3 rounded-xl px-5 py-4.5">
            <SectionTitle aside={`${job.tasks.filter((t) => t.status === 'done').length}/${job.tasks.length} done`}>Tasks</SectionTitle>
            {job.tasks.length === 0 ? (
              <EmptyState title="No tasks yet">Break the plan into tasks with a check command and gate.</EmptyState>
            ) : (
              <div className="flex flex-col gap-2">
                {job.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    assignee={task.assigneeId ? who(task.assigneeId) : undefined}
                    busy={busy}
                    onRunCheck={() => act(`check:${task.id}`, async () => {
                      const outcome = await client!.runCheck(job.id, task.id);
                      setNotice(`Check ${outcome.result.exitCode === 0 ? 'passed' : `failed (exit ${outcome.result.exitCode})`}. ${outcome.evidence.summary}`);
                    })}
                    onDone={() => act(`done:${task.id}`, () => client!.updateTask(task.id, { status: 'done' }))}
                    onStart={() => act(`run:${task.id}`, () => client!.updateTask(task.id, { status: 'running' }))}
                  />
                ))}
              </div>
            )}
            {(job.tasks.length > 0 || (job.kind && job.kind !== 'code')) && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Independent verifier
                  <select value={verifierId} onChange={(e) => setVerifierId(e.target.value)} className="glass-panel h-9 rounded-md px-2 text-xs">
                    {verifiers.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy !== null || !verifierId}
                  onClick={() =>
                    act('verify', async () => {
                      const result = await client!.verifyJob(job.id, verifierId);
                      setNotice(
                        result.ok
                          ? `Verified independently${result.base ? ` at ${result.base.slice(0, 10)}` : ''}. Every check passed.`
                          : `Verification failed: ${result.results.filter((r) => !r.ok).map((r) => r.error ?? r.taskId).join('; ')}`
                      );
                    })
                  }
                  className={buttonVariants({ variant: 'glass' })}
                >
                  <ShieldCheck /> Verify independently
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" aria-label="New task title" className="glass-panel h-9 flex-1 rounded-md px-2.5 text-sm outline-none" />
              <input value={taskCheck} onChange={(e) => setTaskCheck(e.target.value)} placeholder="Check command (optional for non-code jobs)" aria-label="New task check command" className="glass-panel h-9 flex-1 rounded-md px-2.5 font-mono text-xs outline-none" />
              <button type="button" onClick={addTask} disabled={busy !== null || !taskTitle.trim()} className={buttonVariants({ variant: 'glass' })}>
                <Plus /> Task
              </button>
            </div>
          </section>

          <section aria-label="Builder sessions" className="bg-card flex flex-col gap-3 rounded-xl px-5 py-4.5">
            <SectionTitle aside={liveSessions.length ? `${liveSessions.length} live` : 'none running'}>Builder sessions</SectionTitle>
            {job.tasks.length > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Task
                  <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="glass-panel h-9 rounded-md px-2 text-xs">
                    {job.tasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Agent
                  <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="glass-panel h-9 rounded-md px-2 text-xs">
                    {builders.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                        {i.statusState === 'rate_limited' && i.rateLimitResetAt ? ` (resets ${shortTime(i.rateLimitResetAt)})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Adapter
                  <select value={adapterId} onChange={(e) => setAdapterId(e.target.value)} className="glass-panel h-9 rounded-md px-2 text-xs">
                    {readyAdapters.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.rateLimitResetAt ? ` (limit resets ${shortTime(a.rateLimitResetAt)})` : a.auth.state === 'configured' ? ' (unverified)' : ''}
                      </option>
                    ))}
                    {readyAdapters.length === 0 && <option value="">No ready adapter</option>}
                  </select>
                </label>
                <button type="button" onClick={startBuilder} disabled={busy !== null || !taskId || readyAdapters.length === 0} className={buttonVariants({ variant: 'default' })}>
                  <Play /> {busy === 'session' ? 'Starting…' : 'Run builder'}
                </button>
              </div>
            )}
            {(job.sessions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No session has run for this job yet.</p>
            ) : (
              (job.sessions ?? []).map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  jobId={job.id}
                  agent={who(s.agentId)}
                  onCancel={() => act(`cancel:${s.id}`, () => client!.cancelSession(s.id, ownerId))}
                  busy={busy === `cancel:${s.id}`}
                />
              ))
            )}
          </section>

          <section aria-label="What happened" className="bg-card flex flex-col gap-1 rounded-xl px-5 py-4.5">
            <SectionTitle aside="from the evidence record">Evidence</SectionTitle>
            {job.evidence.length === 0 ? (
              <EmptyState title="Nothing recorded yet" className="mt-2">Commands, commits and checks appear here as the runtime records them.</EmptyState>
            ) : (
              [...job.evidence].reverse().map((e) => <EvidenceRow key={e.id} evidence={e} actor={e.recordedBy ? who(e.recordedBy) : undefined} />)
            )}
          </section>
        </main>

        <aside className="flex w-full flex-col gap-4 lg:w-100">
          {pending.map((a) => (
            <section key={a.id} aria-label="Approval" className="bg-card flex flex-col gap-3 rounded-xl border-needs-you/30 p-5">
              <span className="text-[13px] font-medium text-needs-you">Needs your approval</span>
              <h2 className="text-lg font-semibold">{a.title}</h2>
              <p className="text-[13px] leading-relaxed text-foreground/80">{a.consequence}</p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Tag tone={a.risk === 'high' || a.risk === 'critical' ? 'risk' : 'quiet'}>Risk {a.risk ?? 'low'}</Tag>
                {a.reversible != null && <Tag tone="quiet">{a.reversible ? 'Reversible' : 'Not reversible'}</Tag>}
                <span>Assigned to {a.assignedTo ?? '—'}</span>
                {a.expiresAt && <span>Expires {time(a.expiresAt)}</span>}
              </div>
              <div className="flex flex-col gap-2">
                <button type="button" disabled={busy !== null} onClick={() => act(`approve:${a.id}`, () => client!.decideApproval(a.id, { decision: 'approve', decidedBy: ownerId, note: 'Approved in the app' }))} className={buttonVariants({ variant: 'default' })}>
                  <Check /> {busy === `approve:${a.id}` ? 'Recording…' : 'Approve'}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => act(`decline:${a.id}`, () => client!.decideApproval(a.id, { decision: 'decline', decidedBy: ownerId, note: 'Declined in the app' }))} className={buttonVariants({ variant: 'glass' })}>
                  <X /> {busy === `decline:${a.id}` ? 'Recording…' : 'Send back'}
                </button>
              </div>
            </section>
          ))}

          {(job.kind ?? 'code') === 'code' && (
            <section aria-label="Ship worktree" className="bg-card flex flex-col gap-3 rounded-xl p-5">
              <SectionTitle aside={job.shipStatus === 'shipped' ? 'shipped' : 'merge, cherry-pick, or branch'}>
                Ship worktree
              </SectionTitle>
              {job.shipStatus === 'shipped' && job.shipPayload ? (
                <div className="rounded-lg border border-verified/40 bg-verified/10 p-3 text-xs text-verified">
                  Shipped via <strong>{String(job.shipPayload.strategy ?? 'merge')}</strong>
                  {job.shipPayload.commitSha ? ` · ${String(job.shipPayload.commitSha).slice(0, 10)}` : ''}
                  {job.shipPayload.branch ? ` · ${String(job.shipPayload.branch)}` : ''}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Apply verified worktree commits to the repository using an audited git strategy.
                </p>
              )}
              {client && (
                <div className="flex items-center gap-2">
                  <select
                    value={shipStrategy}
                    onChange={(e) => setShipStrategy(e.target.value as 'merge' | 'cherry-pick' | 'branch')}
                    aria-label="Ship strategy"
                    className="glass-panel h-9 flex-1 rounded-md px-2 text-xs"
                  >
                    <option value="merge">Merge worktree commit</option>
                    <option value="cherry-pick">Cherry-pick commit</option>
                    <option value="branch">Push dedicated branch</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleShip}
                    disabled={busy !== null}
                    className={buttonVariants({ variant: 'default', size: 'sm' })}
                  >
                    <GitMerge /> {busy === 'ship' ? 'Shipping…' : 'Ship'}
                  </button>
                </div>
              )}
            </section>
          )}

          <section aria-label="Budget" className="bg-card flex flex-col gap-2 rounded-xl p-5">
            <SectionTitle aside={budget.status === 'ready' && budget.data?.configured ? (budget.data.source ?? '') : 'not set'}>Budget</SectionTitle>
            {budget.status === 'ready' && budget.data?.configured ? (
              <p className="text-[13px]">
                {budget.data.remainingCents}¢ remaining of {budget.data.limitCents}¢ · {budget.data.spentCents}¢ spent
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground">No ceiling configured. Unknown, not zero.</p>
            )}
          </section>

          <section aria-label="Next step" className="bg-card flex flex-col gap-3 rounded-xl p-5">
            <SectionTitle aside={next?.hint}>Next</SectionTitle>
            {next ? (
              <button type="button" onClick={() => move(next.to)} disabled={busy !== null} className={buttonVariants({ variant: 'default' })}>
                {busy === `move:${next.to}` ? 'Moving…' : next.label}
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">{job.stage === 'done' ? 'This job is done.' : 'This job is cancelled. Reopen is not built yet.'}</p>
            )}
            {job.stage === 'verify' && <button type="button" onClick={() => move('build')} disabled={busy !== null} className={buttonVariants({ variant: 'glass' })}>Send back to build</button>}
            {job.stage === 'approve' && (
              <>
                <input value={approvalTitle} onChange={(e) => setApprovalTitle(e.target.value)} aria-label="Approval title" className="glass-panel h-9 rounded-md px-2.5 text-sm outline-none" />
                <textarea value={approvalConsequence} onChange={(e) => setApprovalConsequence(e.target.value)} aria-label="Approval consequence" className="min-h-20 rounded-md border border-border bg-transparent px-2.5 py-2 text-xs outline-none" />
                <button
                  type="button"
                  disabled={busy !== null || pending.length > 0}
                  onClick={() => act('ask-approval', () => client!.createApproval({ jobId: job.id, title: approvalTitle, consequence: approvalConsequence, actionType: 'merge', risk: 'high', requestedBy: job.tasks.at(-1)?.assigneeId ?? 'atlas', reversible: true }))}
                  className={buttonVariants({ variant: 'glass' })}
                >
                  <ShieldCheck /> Request merge approval
                </button>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function TaskRow({ task, assignee, busy, onRunCheck, onDone, onStart }: { task: Task; assignee?: Identity; busy: string | null; onRunCheck: () => void; onDone: () => void; onStart: () => void }) {
  return (
    <div className="glass-panel flex flex-wrap items-center gap-2 rounded-lg px-3 py-2">
      <span className="flex min-w-0 flex-1 basis-52 items-center gap-2 text-sm">
        {assignee ? <Avatar who={assignee} size={22} /> : null}
        <span className="truncate">{task.title}</span>
      </span>
      {task.checkCommand && <code className="basis-56 truncate font-mono text-xs text-muted-foreground">{task.checkCommand}</code>}
      <Tag tone={task.status === 'done' ? 'verified' : task.status === 'failed' ? 'risk' : task.status === 'running' ? 'observed' : 'quiet'}>{task.status}</Tag>
      {task.status !== 'done' && (
        <>
          <button type="button" onClick={onRunCheck} disabled={busy !== null || !task.checkCommand} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
            <RefreshCw /> Check
          </button>
          <button type="button" onClick={onStart} disabled={busy !== null || task.status === 'running'} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
            <Play /> Run
          </button>
          <button type="button" onClick={onDone} disabled={busy !== null} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
            <Check /> Done
          </button>
        </>
      )}
    </div>
  );
}

function SessionRow({ session, jobId, agent, onCancel, busy }: { session: Session; jobId: string; agent?: Identity; onCancel: () => void; busy: boolean }) {
  const live = session.state === 'starting' || session.state === 'running' || session.state === 'idle';
  return (
    <div className="glass-panel flex flex-wrap items-center gap-2.5 rounded-lg px-3 py-2">
      {agent ? <Avatar who={agent} size={24} /> : null}
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-medium">{agent?.name ?? session.agentId}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {session.id}
          {session.acpSessionId ? ` · acp: ${session.acpSessionId}` : ''}
        </span>
      </div>
      <code className="basis-36 truncate font-mono text-xs text-muted-foreground">{session.runtimeCommand}</code>
      <Tag tone={session.state === 'failed' ? 'risk' : live ? 'observed' : 'quiet'}>{session.state}</Tag>
      <span className="text-xs text-muted-foreground">{session.turnCount ?? 0} turns</span>
      <a href={href({ name: 'dev', jobId })} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
        Terminal
      </a>
      {live && (
        <button type="button" onClick={onCancel} disabled={busy} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
          {busy ? 'Cancelling…' : 'Cancel'}
        </button>
      )}
      {session.error && <span className="basis-full text-xs text-risk">{session.error}</span>}
    </div>
  );
}

function EvidenceRow({ evidence, actor }: { evidence: Evidence; actor?: Identity }) {
  return (
    <div className="grid grid-cols-[72px_28px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-border/40 py-1.5 last:border-b-0">
      <span className="pt-0.5 font-mono text-[11px] text-muted-foreground">{new Date(evidence.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      {actor ? <Avatar who={actor} size={22} /> : <OwnerAvatar name={evidence.recordedBy} size={22} />}
      <span className="text-sm text-foreground/90">
        {evidence.summary}
        {evidence.command && <code className="ml-2 font-mono text-[11px] text-muted-foreground">{evidence.command}</code>}
        {evidence.commitSha && <code className="ml-2 font-mono text-[11px] text-muted-foreground">{evidence.commitSha.slice(0, 10)}</code>}
      </span>
      <EvidenceTag value={evidence.class} />
    </div>
  );
}

export function JobStageHint({ stage }: { stage: JobStage }) {
  return <span className="text-xs text-muted-foreground">{NEXT[stage]?.hint}</span>;
}

export type { AdapterInfo };
