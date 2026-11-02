import * as React from 'react';
import type { AdapterInfo, AgentSchedule, CreateIdentityInput, Identity, Session, UpdateIdentityInput } from '@runtime/types';
import { Avatar, AVATAR_COLORS, AVATAR_MARKS } from '@/components/app/avatar';
import { isLive } from '@/components/app/shell';
import { EmptyState, SectionTitle, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

const RUNTIMES = [
  { name: 'Claude Code', command: 'claude-agent-acp', adapterId: 'claude' },
  { name: 'Codex', command: 'codex-acp', adapterId: 'codex' },
  { name: 'Gemini CLI', command: 'gemini --acp', adapterId: 'gemini' },
  { name: 'Custom agent', command: 'any command that speaks ACP over stdio', adapterId: 'claude' },
];

const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

function authTag(auth: AdapterInfo['auth']): { tone: 'observed' | 'verified' | 'needs-you' | 'claimed' | 'risk' | 'quiet'; label: string } {
  switch (auth?.state) {
    case 'ready':
      return { tone: 'verified', label: 'Ready' };
    case 'configured':
      return { tone: 'observed', label: 'Configured' };
    case 'needs_login':
      return { tone: 'needs-you', label: 'Needs login' };
    case 'missing_binary':
      return { tone: 'claimed', label: 'Not installed' };
    case 'unsupported':
      return { tone: 'risk', label: 'Unsupported' };
    default:
      return { tone: 'quiet', label: 'Unknown' };
  }
}

function identityStatusBadge(i: Identity, isRunning: boolean): { tone: 'observed' | 'verified' | 'needs-you' | 'claimed' | 'risk' | 'quiet'; label: string } {
  if (i.statusState === 'rate_limited' && i.rateLimitResetAt && new Date(i.rateLimitResetAt).getTime() > Date.now()) {
    return { tone: 'needs-you', label: `Limit · resets ${fmtTime(i.rateLimitResetAt)}` };
  }
  if (isRunning || i.statusState === 'working') {
    return { tone: 'observed', label: 'Working' };
  }
  if (i.activeSessionId) {
    return { tone: 'verified', label: 'Session ready' };
  }
  return { tone: 'quiet', label: 'Idle' };
}

export function CoworkersScreen({
  identities,
  sessions,
  adapters,
  onCreate,
  onUpdate,
}: {
  identities: Identity[];
  sessions: Session[];
  adapters?: AdapterInfo[];
  onCreate?: (input: CreateIdentityInput) => Promise<void>;
  onUpdate?: (id: string, input: UpdateIdentityInput) => Promise<void>;
}) {
  const { client } = useRuntime();
  const schedulesData = useRuntimeData((c) => c.schedules());
  const schedules: AgentSchedule[] = schedulesData.status === 'ready' ? schedulesData.data : [];

  const [editing, setEditing] = React.useState<string | null>(identities.find((i) => !i.isOwner)?.id ?? identities[0]?.id ?? null);
  const [adding, setAdding] = React.useState(false);
  const [teamGoal, setTeamGoal] = React.useState('');
  const [leaderId, setLeaderId] = React.useState('atlas');
  const [dispatching, setDispatching] = React.useState(false);
  const [dispatchStatus, setDispatchStatus] = React.useState<string | null>(null);

  const current = identities.find((i) => i.id === editing) ?? null;
  const live = new Set(sessions.filter(isLive).map((s) => s.agentId));
  const rateLimitedIdentities = identities.filter(
    (i) => i.statusState === 'rate_limited' && i.rateLimitResetAt && new Date(i.rateLimitResetAt).getTime() > Date.now()
  );

  const handleLeaderDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !teamGoal.trim() || dispatching) return;
    setDispatching(true);
    setDispatchStatus(null);
    try {
      const res = await client.dispatchTeamLeader({
        leaderId,
        fromActorId: 'winston',
        goal: teamGoal.trim(),
      });
      setTeamGoal('');
      if (res.session?.id) {
        setDispatchStatus(`Team Leader ${leaderId} woken (session ${res.session.id}) — coordinating team.`);
      } else if (res.deferredUntil) {
        setDispatchStatus(`Leader rate-limited until ${fmtTime(res.deferredUntil)}; auto-resume scheduled.`);
      }
    } catch (err) {
      setDispatchStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 py-2">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-muted-foreground">Autonomous coworkers · session IDs, wakeups, cron schedules &amp; rate-limit awareness</span>
          <h1 className="text-lg font-semibold">Coworkers</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!onCreate && !client}
            onClick={() => setAdding(true)}
            className={buttonVariants({ variant: 'default' })}
          >
            Spawn / Add coworker
          </button>
        </div>
      </header>

      {rateLimitedIdentities.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-needs-you/40 bg-needs-you/10 px-4 py-2.5 text-xs text-needs-you">
          <div>
            <strong>Cross-Agent Session Limit Notice:</strong>{' '}
            {rateLimitedIdentities.map((i) => `${i.name} (${i.runtime ?? 'adapter'}) waiting for reset at ${fmtTime(i.rateLimitResetAt)} (${i.rateLimitReason ?? 'session limit'})`).join(' · ')}.
            {' '}Other agents (Antigravity / Gemini / Codex / Claude) are automatically informed of this reset window and auto-resume is scheduled.
          </div>
        </div>
      )}

      {client && (
        <form onSubmit={handleLeaderDispatch} className="bg-card flex flex-wrap items-center gap-2.5 rounded-xl px-4 py-3">
          <span className="text-xs font-semibold">Tell Team Leader:</span>
          <select
            value={leaderId}
            onChange={(e) => setLeaderId(e.target.value)}
            aria-label="Team leader"
            className="glass-panel h-8 rounded-md px-2 text-xs"
          >
            {identities
              .filter((i) => !i.isOwner)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.role ?? i.runtime ?? 'Leader'})
                </option>
              ))}
          </select>
          <input
            value={teamGoal}
            onChange={(e) => setTeamGoal(e.target.value)}
            placeholder="Tell the Team Leader what needs to be done (they can wake coworkers, schedule checks, or spawn specialists)…"
            aria-label="Team leader goal"
            className="glass-panel h-8 min-w-64 flex-1 rounded-md px-3 text-xs outline-none"
          />
          <button
            type="submit"
            disabled={!teamGoal.trim() || dispatching}
            className={buttonVariants({ variant: 'default', size: 'sm' })}
          >
            {dispatching ? 'Dispatching…' : 'Dispatch to Leader'}
          </button>
          {dispatchStatus && <span className="w-full text-xs text-muted-foreground">{dispatchStatus}</span>}
        </form>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {adding && (onCreate || client) && (
            <AddForm
              onCreate={async (i, prompt) => {
                if (client) {
                  await client.spawnAgent({
                    id: i.id,
                    name: i.name,
                    role: i.role ?? undefined,
                    runtime: i.runtime ?? undefined,
                    avatarMark: i.avatarMark ?? 'diamond',
                    avatarColor: i.avatarColor ?? 'graphite',
                    prompt: prompt?.trim() || undefined,
                    spawnedBy: 'winston',
                  });
                } else if (onCreate) {
                  await onCreate(i);
                }
                setAdding(false);
                setEditing(i.id.toLowerCase());
              }}
              onCancel={() => setAdding(false)}
            />
          )}

          {identities.length === 0 && !adding ? (
            <EmptyState title="No coworkers yet">
              Add or spawn the agents you work with.
            </EmptyState>
          ) : (
            <section aria-label="Coworkers" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {identities.map((i) => {
                const badge = identityStatusBadge(i, live.has(i.id));
                return (
                  <button
                    type="button"
                    key={i.id}
                    onClick={() => setEditing(i.id)}
                    className={cn(
                      'bg-card flex flex-col gap-2.5 rounded-xl p-3.5 text-left transition-colors',
                      editing === i.id && 'ring-1 ring-foreground/30'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar who={i} size={44} />
                      <div className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="font-semibold">{i.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{i.role ?? 'No role set'}</span>
                      </div>
                      <Tag tone={badge.tone}>{badge.label}</Tag>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-[11px] text-muted-foreground">Runs on</span>
                        <span className="font-mono text-xs">{i.runtime ?? 'Not configured'}</span>
                      </div>
                      {i.activeSessionId && (
                        <div className="flex flex-col items-end">
                          <span className="text-[11px] text-muted-foreground">Session ID</span>
                          <span className="font-mono text-[11px] text-foreground/85">{i.activeSessionId}</span>
                        </div>
                      )}
                    </div>
                    {i.acpSessionId && (
                      <div className="truncate rounded bg-foreground/[0.04] px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        ACP session: {i.acpSessionId}
                      </div>
                    )}
                    {i.statusState === 'rate_limited' && i.rateLimitResetAt && (
                      <div className="rounded border border-needs-you/30 bg-needs-you/10 px-2 py-1 text-[11px] text-needs-you">
                        Waiting for session reset at {fmtTime(i.rateLimitResetAt)}
                        {i.rateLimitReason ? ` · ${i.rateLimitReason}` : ''}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {i.seats.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No council seats</span>
                      ) : (
                        i.seats.map((s) => <Tag key={s}>{s}</Tag>)
                      )}
                    </div>
                  </button>
                );
              })}
            </section>
          )}

          {schedules.length > 0 && (
            <section aria-label="Active Agent Schedules" className="bg-card flex flex-col gap-2 rounded-xl p-4.5">
              <SectionTitle aside="self-wake timers &amp; cron jobs">Scheduled Wakeups &amp; Cron</SectionTitle>
              <div className="flex flex-col divide-y divide-border/50">
                {schedules.map((sch) => {
                  const target = identities.find((i) => i.id === sch.targetAgentId);
                  return (
                    <div key={sch.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{target?.name ?? sch.targetAgentId}</span>
                          <Tag tone={sch.enabled ? 'observed' : 'quiet'}>
                            {sch.cronExpr ? `cron: ${sch.cronExpr}` : sch.intervalSeconds ? `every ${sch.intervalSeconds}s` : 'one-shot timer'}
                          </Tag>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            next: {sch.nextRunAt ? fmtTime(sch.nextRunAt) : 'done'} · runs: {sch.runCount}
                          </span>
                        </div>
                        <span className="truncate text-muted-foreground">{sch.prompt}</span>
                      </div>
                      {client && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void client.updateSchedule(sch.id, { enabled: !sch.enabled })}
                            className={buttonVariants({ variant: 'glass', size: 'sm' })}
                          >
                            {sch.enabled ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void client.deleteSchedule(sch.id)}
                            className={buttonVariants({ variant: 'glass', size: 'sm' })}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-label="Agent runtimes" className="bg-card flex flex-col gap-1 rounded-xl p-4.5">
            <SectionTitle aside="probed on this Mac · shared rate-limit awareness">Agent runtimes</SectionTitle>
            {(adapters ?? []).length === 0 && <p className="py-2 text-sm text-muted-foreground">The runtime has not reported its adapters yet.</p>}
            {(adapters ?? []).map((a) => {
              const status = authTag(a.auth);
              const isLimited = Boolean(a.rateLimitResetAt && new Date(a.rateLimitResetAt).getTime() > Date.now());
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-3 border-t border-border/50 py-2.5 first:border-t-0">
                  <span className="flex-1 basis-32 font-medium">{a.name}</span>
                  <span className="flex-1 basis-40 font-mono text-xs text-muted-foreground">
                    {a.command}
                    {a.version ? ` · ${a.version}` : ''}
                  </span>
                  <span className="flex-1 basis-56 text-xs text-muted-foreground">
                    {isLimited
                      ? `Session limit active — resets at ${fmtTime(a.rateLimitResetAt)} (${a.rateLimitReason ?? 'usage limit'})`
                      : (a.auth?.detail ?? 'Not probed')}
                  </span>
                  {isLimited ? (
                    <Tag tone="needs-you">Resets {fmtTime(a.rateLimitResetAt)}</Tag>
                  ) : (
                    <Tag tone={status.tone}>{status.label}</Tag>
                  )}
                  {client && (
                    <div className="flex items-center gap-1">
                      {isLimited ? (
                        <button
                          type="button"
                          onClick={() => void client.clearAdapterRateLimit(a.id)}
                          className={buttonVariants({ variant: 'glass', size: 'sm' })}
                        >
                          Mark Resumed
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            void client.setAdapterRateLimit(a.id, {
                              resetAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
                              reason: `${a.name} session limit reached`,
                            })
                          }
                          className={buttonVariants({ variant: 'glass', size: 'sm' })}
                        >
                          Flag Limit (2h)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="pt-1 text-xs text-muted-foreground">
              When any adapter hits a session limit (e.g., Claude Code 5h window or Codex usage limit), MyaOS broadcasts the exact reset timestamp to all other agents so Antigravity/Gemini/Codex coworkers can cover or wait and auto-resume when the session resets.
            </p>
          </section>
        </main>

        {current && (
          <div className="flex w-full flex-col gap-4 lg:w-100">
            <AgentAutonomyPanel key={`auto-${current.id}`} identity={current} />
            <AvatarPicker key={current.id} identity={current} onSave={onUpdate ? (input) => onUpdate(current.id, input) : undefined} />
          </div>
        )}
      </div>
    </div>
  );
}

function AgentAutonomyPanel({ identity }: { identity: Identity }) {
  const { client } = useRuntime();
  const [wakePrompt, setWakePrompt] = React.useState('');
  const [allowFallback, setAllowFallback] = React.useState(true);
  const [schedulePrompt, setSchedulePrompt] = React.useState('');
  const [scheduleSpec, setScheduleSpec] = React.useState('15m');
  const [limitMinutes, setLimitMinutes] = React.useState('60');
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (!client) return null;

  const isLimited = Boolean(
    identity.statusState === 'rate_limited' &&
      identity.rateLimitResetAt &&
      new Date(identity.rateLimitResetAt).getTime() > Date.now()
  );

  const handleWake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wakePrompt.trim() || busy) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await client.wakeAgent(identity.id, {
        fromActorId: 'winston',
        fromActorKind: 'human',
        prompt: wakePrompt.trim(),
        reason: 'Manual wake from Coworkers panel',
        allowFallbackAdapter: allowFallback,
      });
      setWakePrompt('');
      if (res.session?.id) {
        setStatusMsg(`Woke ${identity.name} in session ${res.session.id}`);
      } else if (res.deferredUntil) {
        setStatusMsg(`Session limit active — scheduled wakeup at ${fmtTime(res.deferredUntil)}`);
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulePrompt.trim() || busy) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const spec = scheduleSpec.trim();
      const durMatch = spec.match(/^(\d+)\s*(s|m|h)$/i);
      const delaySeconds = durMatch
        ? Number(durMatch[1]) * (durMatch[2]!.toLowerCase() === 'h' ? 3600 : durMatch[2]!.toLowerCase() === 'm' ? 60 : 1)
        : undefined;
      const cronExpr = !durMatch && spec.includes(' ') ? spec : undefined;
      await client.createSchedule({
        targetAgentId: identity.id,
        createdBy: 'winston',
        prompt: schedulePrompt.trim(),
        delaySeconds: delaySeconds ?? (!cronExpr ? 300 : undefined),
        cronExpr,
      });
      setSchedulePrompt('');
      setStatusMsg(`Scheduled wakeup (${spec}) for ${identity.name}`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReportLimit = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const mins = Math.max(1, Number(limitMinutes) || 60);
      const resetAt = new Date(Date.now() + mins * 60_000).toISOString();
      await client.setAgentRateLimit(identity.id, {
        resetAt,
        reason: `Waiting for ${identity.runtime ?? 'session'} limit reset`,
      });
      setStatusMsg(`Marked ${identity.name} rate-limited until ${fmtTime(resetAt)}`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleClearLimit = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      await client.clearAgentRateLimit(identity.id);
      setStatusMsg(`${identity.name} marked ready & resumed.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside aria-label="Autonomous controls" className="bg-card flex flex-col gap-3.5 rounded-xl p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{identity.name} · Autonomy &amp; Session</h2>
          <p className="text-xs text-muted-foreground">
            {identity.activeSessionId ? `Captured session: ${identity.activeSessionId}` : 'No session spawned yet — wake to capture'}
          </p>
        </div>
        {identity.activeSessionId && (
          <a href={href({ name: 'dev' })} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
            Terminal
          </a>
        )}
      </div>

      {identity.acpSessionId && (
        <div className="rounded-lg border border-border/50 bg-foreground/[0.03] px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
          ACP Session ID: {identity.acpSessionId}
          {identity.lastWokenAt ? ` · Last woken ${fmtTime(identity.lastWokenAt)}` : ''}
        </div>
      )}

      <form onSubmit={handleWake} className="flex flex-col gap-2 border-t border-border/50 pt-3">
        <span className="text-xs font-medium">1. Wake {identity.name}</span>
        <textarea
          value={wakePrompt}
          onChange={(e) => setWakePrompt(e.target.value)}
          placeholder={`Send instruction to wake ${identity.name}…`}
          aria-label={`Wake ${identity.name}`}
          className="min-h-16 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs outline-none"
        />
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={allowFallback}
            onChange={(e) => setAllowFallback(e.target.checked)}
          />
          Use fallback adapter if primary runtime is waiting for session reset
        </label>
        <button type="submit" disabled={!wakePrompt.trim() || busy} className={buttonVariants({ variant: 'default', size: 'sm' })}>
          Wake {identity.name} Now
        </button>
      </form>

      <form onSubmit={handleSchedule} className="flex flex-col gap-2 border-t border-border/50 pt-3">
        <span className="text-xs font-medium">2. Self-Schedule / Cron Wakeup</span>
        <div className="flex gap-2">
          <input
            value={scheduleSpec}
            onChange={(e) => setScheduleSpec(e.target.value)}
            placeholder="15m, 1h, or */15 * * * *"
            aria-label="Schedule delay or cron"
            className="glass-panel h-8 w-36 rounded-md px-2 font-mono text-xs outline-none"
          />
          <input
            value={schedulePrompt}
            onChange={(e) => setSchedulePrompt(e.target.value)}
            placeholder="Check progress on build / tests…"
            aria-label="Schedule prompt"
            className="glass-panel h-8 flex-1 rounded-md px-2 text-xs outline-none"
          />
        </div>
        <button type="submit" disabled={!schedulePrompt.trim() || busy} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
          Schedule Wakeup
        </button>
      </form>

      <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
        <span className="text-xs font-medium">3. Session Limit &amp; Reset Awareness</span>
        {isLimited ? (
          <div className="flex flex-col gap-2 rounded-lg border border-needs-you/40 bg-needs-you/10 p-2.5 text-xs text-needs-you">
            <span>
              Waiting for session reset until <strong>{fmtTime(identity.rateLimitResetAt)}</strong> ({identity.rateLimitReason ?? 'rate limit'})
            </span>
            <button type="button" onClick={handleClearLimit} disabled={busy} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
              Session Resumed · Clear Limit
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={limitMinutes}
              onChange={(e) => setLimitMinutes(e.target.value)}
              aria-label="Reset minutes"
              className="glass-panel h-8 w-20 rounded-md px-2 font-mono text-xs outline-none"
            />
            <span className="text-xs text-muted-foreground">min until reset</span>
            <button type="button" onClick={handleReportLimit} disabled={busy} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
              Flag Session Limit
            </button>
          </div>
        )}
      </div>

      {statusMsg && <p className="text-xs text-verified">{statusMsg}</p>}
    </aside>
  );
}

function AddForm({ onCreate, onCancel }: { onCreate: (i: CreateIdentityInput, initialPrompt?: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState('');
  const [runtime, setRuntime] = React.useState(RUNTIMES[0].name);
  const [initialPrompt, setInitialPrompt] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await onCreate(
        {
          id: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: name.trim(),
          role: role.trim() || undefined,
          runtime,
          avatarMark: 'diamond',
          avatarColor: 'graphite',
        },
        initialPrompt.trim() || undefined
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const field = 'glass-panel h-9 rounded-md px-2.5 text-sm outline-none placeholder:text-muted-foreground';
  return (
    <form onSubmit={submit} className="bg-card flex flex-wrap items-end gap-3 rounded-xl p-4">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Nova" required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Role
        <input value={role} onChange={(e) => setRole(e.target.value)} className={field} placeholder="Platform and backend" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Runs on
        <select value={runtime} onChange={(e) => setRuntime(e.target.value)} className={field}>
          {RUNTIMES.slice(0, 3).map((r) => (
            <option key={r.name}>{r.name}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        Immediate wakeup instruction (optional)
        <input
          value={initialPrompt}
          onChange={(e) => setInitialPrompt(e.target.value)}
          className={field}
          placeholder="Start working on… (spawns session immediately)"
        />
      </label>
      <button type="submit" className={buttonVariants({ variant: 'default' })}>
        Spawn / Add
      </button>
      <button type="button" onClick={onCancel} className={buttonVariants({ variant: 'glass' })}>
        Cancel
      </button>
      {error && <p className="w-full text-xs text-risk">{error}</p>}
    </form>
  );
}

export function AvatarPicker({ identity, onSave }: { identity: Identity; onSave?: (input: UpdateIdentityInput) => Promise<void> }) {
  const [mark, setMark] = React.useState(identity.avatarMark ?? 'diamond');
  const [color, setColor] = React.useState(identity.avatarColor ?? 'graphite');
  const [name, setName] = React.useState(identity.name);
  const [state, setState] = React.useState<'idle' | 'saving' | 'saved' | string>('idle');
  const preview = { name, avatarMark: mark, avatarColor: color };
  const dirty = mark !== identity.avatarMark || color !== identity.avatarColor || name !== identity.name;

  const save = async () => {
    if (!onSave) return;
    setState('saving');
    try {
      await onSave({ avatarMark: mark, avatarColor: color, name });
      setState('saved');
    } catch (e) {
      setState(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <aside aria-label="Avatar picker" className="bg-card flex w-full flex-col gap-4.5 rounded-xl p-5">
      <div>
        <h2 className="text-base font-semibold">{identity.name}’s avatar</h2>
        <p className="text-xs text-muted-foreground">Pick a mark and a colour. Avatars are yours to choose; nothing is a real face.</p>
      </div>
      <div className="flex items-center gap-4">
        <Avatar who={preview} size={88} />
        <div className="flex flex-col gap-2 text-[13px]">
          <span className="flex items-center gap-2"><Avatar who={preview} size={28} /> {name} <span className="text-xs text-muted-foreground">in a thread</span></span>
          <span className="flex items-center gap-2"><Avatar who={preview} size={18} /> <span className="text-xs text-muted-foreground">in lists</span></span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Mark</span>
        <div className="grid grid-cols-6 gap-2">
          {Object.entries(AVATAR_MARKS).map(([id, m]) => (
            <button
              key={id}
              type="button"
              aria-label={m.name}
              aria-pressed={mark === id}
              onClick={() => setMark(id)}
              className={cn('glass-panel inline-flex aspect-square items-center justify-center rounded-xl', mark === id && 'ring-1 ring-foreground')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={m.d} />
              </svg>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Colour</span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(AVATAR_COLORS).map(([id, c]) => (
            <button
              key={id}
              type="button"
              aria-label={c.name}
              aria-pressed={color === id}
              onClick={() => setColor(id)}
              className={cn('inline-flex size-11 items-center justify-center rounded-full border-2', color === id ? 'border-foreground' : 'border-transparent')}
              style={{ background: c.bg }}
            >
              <span className="size-3 rounded-full" style={{ background: c.fg }} />
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        Display name
        <input value={name} onChange={(e) => setName(e.target.value)} className="glass-panel h-10 rounded-md px-3 text-sm text-foreground outline-none" />
      </label>
      <div className="mt-auto flex items-center gap-3">
        <button type="button" disabled={!onSave || !dirty || state === 'saving'} onClick={save} className={cn(buttonVariants({ variant: 'default' }), 'flex-1')}>
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {state === 'saved' && !dirty && <span className="text-xs text-verified">Saved</span>}
        {!['idle', 'saving', 'saved'].includes(state) && <span className="text-xs text-risk">Not saved: {state}</span>}
      </div>
    </aside>
  );
}
