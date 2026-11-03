import { createIntake } from './intake/intake.ts';
import type * as T from './api/types.ts';
import { ADAPTER_PRESETS, findExecutable } from './adapters.ts';
import type { SessionManager } from './acp/session-manager.ts';
import type { Checker } from './checks.ts';
import { sweepTasks } from './lifecycle/sweeper.ts';
import { InputError, NotFoundError, type Repo } from './store/repo.ts';

/**
 * Parses a human-friendly duration string like "30s", "5m", "2h", "1h30m" into seconds.
 */
export function parseDurationSeconds(spec: string): number | null {
  const s = spec.trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : null;
}

/**
 * Computes the next execution Date for a standard 5-field cron expression
 * (`min hour dom month dow`) after `fromDate`.
 */
export function nextCronDate(cronExpr: string, fromDate = new Date()): Date {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new InputError(`Invalid cron expression "${cronExpr}" (expected 5 fields: min hour dom month dow)`);
  }
  const [minSpec, hourSpec, domSpec, monSpec, dowSpec] = parts as [string, string, string, string, string];

  const matchesField = (spec: string, value: number): boolean => {
    if (spec === '*') return true;
    for (const token of spec.split(',')) {
      if (token.startsWith('*/')) {
        const step = Number(token.slice(2));
        if (step > 0 && value % step === 0) return true;
        continue;
      }
      if (token.includes('-')) {
        const [a, b] = token.split('-').map(Number);
        if (a !== undefined && b !== undefined && value >= a && value <= b) return true;
        continue;
      }
      if (Number(token) === value) return true;
    }
    return false;
  };

  const candidate = new Date(fromDate.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  // Search up to 366 days ahead in 1-minute increments (bounded to 527040 checks max, usually < 60)
  for (let i = 0; i < 60 * 24 * 366; i++) {
    const min = candidate.getUTCMinutes();
    const hour = candidate.getUTCHours();
    const dom = candidate.getUTCDate();
    const mon = candidate.getUTCMonth() + 1;
    const dow = candidate.getUTCDay();
    if (
      matchesField(minSpec, min) &&
      matchesField(hourSpec, hour) &&
      matchesField(domSpec, dom) &&
      matchesField(monSpec, mon) &&
      matchesField(dowSpec, dow)
    ) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return new Date(fromDate.getTime() + 3600_000);
}

export class Orchestrator {
  private readonly repo: Repo;
  private readonly sessions: SessionManager;
  private readonly checker: Checker;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: { repo: Repo; sessions: SessionManager; checker: Checker }) {
    this.repo = opts.repo;
    this.sessions = opts.sessions;
    this.checker = opts.checker;

    this.sessions.setHooks({
      onTurnComplete: (info) => this.handleTurnComplete(info),
      onRateLimit: (info) => this.handleRateLimit(info),
    });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((e) => {
        console.error('[orchestrator] tick failed:', e);
      });
    }, 2000);
    this.timer.unref();
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 1. Waking up an agent (agent-to-agent, human-to-agent, or scheduled).
   * Captures/reuses the agent's `activeSessionId`, respects rate-limit state,
   * and supports automatic fallback adapters or deferred wakeups at `resetAt`.
   */
  async wakeAgent(targetAgentIdInput: string, input: T.WakeAgentInput): Promise<T.WakeAgentResult> {
    const targetAgentId = targetAgentIdInput.trim().toLowerCase();
    const agent = this.repo.getIdentity(targetAgentId);
    const fromActorId = input.fromActorId?.trim() || 'system';
    const fromActorKind: T.ActorKind = input.fromActorKind ?? (fromActorId === this.repo.ownerId() ? 'human' : 'agent');
    const prompt = input.prompt?.trim();
    if (!prompt) throw new InputError('prompt is required to wake an agent');
    const reason = input.reason?.trim() || `Wake requested by ${fromActorId}`;

    // First sweep any expired rate limits so stale windows don't block
    this.repo.sweepExpiredRateLimits();
    const refreshedAgent = this.repo.getIdentity(targetAgentId);

    // Check if the target agent or its primary adapter is currently rate-limited
    const requestedAdapter = input.adapterId ?? refreshedAgent.adapterId ?? this.inferAdapterFromRuntime(refreshedAgent.runtime);
    const adapterRateLimit = this.getActiveAdapterRateLimit(requestedAdapter);
    const agentResetAt =
      refreshedAgent.rateLimitResetAt && Date.parse(refreshedAgent.rateLimitResetAt) > Date.now()
        ? refreshedAgent.rateLimitResetAt
        : adapterRateLimit?.resetAt ?? null;
    const limitReason = refreshedAgent.rateLimitReason ?? adapterRateLimit?.reason ?? null;

    let chosenAdapter = requestedAdapter;
    let usedFallbackAdapter: string | null = null;

    if (agentResetAt) {
      if (input.allowFallbackAdapter) {
        const fallback = this.findAvailableFallbackAdapter(requestedAdapter);
        if (fallback) {
          chosenAdapter = fallback;
          usedFallbackAdapter = fallback;
        }
      }
      if (!usedFallbackAdapter) {
        // Defer the wakeup until resetAt and create an automatic wakeup timer
        const wake = this.repo.createWake({
          targetAgentId,
          fromActorId,
          fromActorKind,
          jobId: input.jobId ?? null,
          roomId: input.roomId ?? null,
          taskId: input.taskId ?? null,
          adapterId: requestedAdapter,
          reason,
          prompt,
          status: 'deferred_rate_limit',
          scheduledFor: agentResetAt,
        });
        this.repo.createSchedule({
          agentId: targetAgentId,
          createdBy: fromActorId,
          createdByKind: fromActorKind,
          jobId: input.jobId ?? null,
          roomId: input.roomId ?? null,
          taskId: input.taskId ?? null,
          kind: 'timer',
          nextRunAt: agentResetAt,
          prompt,
          reason: `Auto-wake on session limit reset (${limitReason ?? 'rate limit'})`,
          maxRuns: 1,
        });
        if (input.roomId) {
          try {
            this.repo.postMessage(input.roomId, {
              authorId: targetAgentId,
              authorKind: 'system',
              body: `⏳ ${refreshedAgent.name} is currently waiting for a session limit reset (${limitReason ?? 'quota reached'}). Resumes at ${new Date(agentResetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${agentResetAt}). Wakeup has been queued automatically.`,
              jobId: input.jobId ?? undefined,
            });
          } catch {
            /* ignore room post failure */
          }
        }
        return {
          wake,
          session: null,
          deferred: true,
          resetAt: agentResetAt,
          deferredUntil: agentResetAt,
          rateLimitReason: limitReason,
          usedFallbackAdapter: null,
        };
      }
    }

    const wake = this.repo.createWake({
      targetAgentId,
      fromActorId,
      fromActorKind,
      jobId: input.jobId ?? null,
      roomId: input.roomId ?? null,
      taskId: input.taskId ?? null,
      adapterId: chosenAdapter,
      reason,
      prompt,
      status: 'dispatched',
    });

    this.repo.updateIdentity(targetAgentId, { lastWokenAt: new Date().toISOString() });

    try {
      const targetSessionId = input.sessionId ?? null;
      let session: T.Session | null = null;

      if (targetSessionId && !usedFallbackAdapter) {
        try {
          const existing = this.repo.getSession(targetSessionId);
          // Reuse existing session if it matches the same job/room context
          const sameContext =
            (!input.jobId || existing.jobId === input.jobId) &&
            (!input.taskId || existing.taskId === input.taskId);
          if (sameContext && existing.state !== 'failed') {
            session = await this.sessions.prompt(existing.id, prompt, { taskId: input.taskId });
          }
        } catch {
          session = null;
        }
      }

      if (!session) {
        session = await this.sessions.start({
          agentId: targetAgentId,
          adapterId: chosenAdapter,
          jobId: input.jobId ?? null,
          roomId: input.roomId ?? null,
          taskId: input.taskId ?? null,
          prompt,
        });
      }

      const updatedWake = this.repo.updateWake(wake.id, {
        status: 'dispatched',
        sessionId: session.id,
        adapterId: session.adapterId ?? chosenAdapter,
      });

      return {
        wake: updatedWake,
        session,
        deferred: false,
        resetAt: null,
        deferredUntil: null,
        rateLimitReason: null,
        usedFallbackAdapter,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const failedWake = this.repo.updateWake(wake.id, {
        status: 'failed',
        error: errMsg,
      });
      throw Object.assign(new Error(`Could not wake ${agent.name}: ${errMsg}`), { wake: failedWake });
    }
  }

  /**
   * 2. Agent Self-Scheduling / Cron / Timers.
   */
  createSchedule(input: T.CreateScheduleInput): T.AgentSchedule {
    const agentId = (input.agentId ?? input.targetAgentId ?? '').trim().toLowerCase();
    if (!agentId) throw new InputError('agentId is required');
    const createdBy = input.createdBy?.trim() || agentId;
    const createdByKind: T.ActorKind = input.createdByKind ?? 'agent';
    const prompt = input.prompt?.trim();
    if (!prompt) throw new InputError('prompt is required');

    let kind: 'timer' | 'cron' | 'interval' = input.kind ?? 'timer';
    let nextRunAt = input.runAt ?? null;
    let intervalSeconds = input.intervalSeconds ?? null;
    const cronExpr = input.cronExpr?.trim() || null;

    if (cronExpr) {
      kind = 'cron';
      nextRunAt = nextCronDate(cronExpr).toISOString();
    } else if (intervalSeconds && intervalSeconds > 0) {
      kind = input.kind === 'timer' ? 'timer' : 'interval';
      nextRunAt = nextRunAt ?? new Date(Date.now() + intervalSeconds * 1000).toISOString();
    } else if (input.delaySeconds && input.delaySeconds > 0) {
      kind = 'timer';
      intervalSeconds = input.delaySeconds;
      nextRunAt = new Date(Date.now() + input.delaySeconds * 1000).toISOString();
    } else if (!nextRunAt) {
      throw new InputError('Provide delaySeconds, intervalSeconds, runAt, or cronExpr');
    }

    return this.repo.createSchedule({
      agentId,
      createdBy,
      createdByKind,
      jobId: input.jobId ?? null,
      roomId: input.roomId ?? null,
      taskId: input.taskId ?? null,
      kind,
      cronExpr,
      intervalSeconds,
      nextRunAt,
      prompt,
      reason: input.reason ?? null,
      maxRuns: input.maxRuns ?? (kind === 'timer' ? 1 : null),
    });
  }

  /**
   * Evaluates due schedules and expired rate limits as of `asOfIso`.
   */
  async tick(asOfIso = new Date().toISOString()): Promise<{ firedSchedules: string[]; triggered: string[]; clearedRateLimits: string[] }> {
    const clearedRateLimits = this.repo.sweepExpiredRateLimits();
    try {
      sweepTasks(this.repo, () => asOfIso);
    } catch (e) {
      console.error('[orchestrator] task sweep failed:', e);
    }
    const due = this.repo.listDueSchedules(asOfIso);
    const firedSchedules: string[] = [];

    for (const sched of due) {
      const nextCount = sched.runCount + 1;
      const reachedMax = sched.maxRuns != null && nextCount >= sched.maxRuns;
      let nextRunAt = sched.nextRunAt;
      let enabled = !reachedMax;

      if (!reachedMax) {
        if (sched.kind === 'cron' && sched.cronExpr) {
          nextRunAt = nextCronDate(sched.cronExpr, new Date(asOfIso)).toISOString();
        } else if (sched.intervalSeconds && sched.intervalSeconds > 0) {
          nextRunAt = new Date(Date.parse(asOfIso) + sched.intervalSeconds * 1000).toISOString();
        } else {
          enabled = false;
        }
      }

      this.repo.updateSchedule(sched.id, {
        lastRunAt: asOfIso,
        runCount: nextCount,
        nextRunAt,
        enabled,
      });

      try {
        await this.wakeAgent(sched.agentId, {
          fromActorId: sched.createdBy,
          fromActorKind: sched.createdByKind,
          jobId: sched.jobId,
          roomId: sched.roomId,
          taskId: sched.taskId,
          prompt: sched.prompt,
          reason: sched.reason ?? `Scheduled ${sched.kind} (${sched.id})`,
        });
        firedSchedules.push(sched.id);
      } catch {
        // Wake error is recorded on the wake row; continue ticking remaining schedules
        firedSchedules.push(sched.id);
      }
    }

    return { firedSchedules, triggered: firedSchedules, clearedRateLimits };
  }

  /**
   * 3. Easy Agent Spawning (by Human or Team Leader).
   */
  async spawnAgent(input: T.SpawnAgentInput): Promise<{ identity: T.Identity; wakeResult: T.WakeAgentResult | null; wake: T.WakeAgentResult | null }> {
    const name = input.name?.trim();
    if (!name) throw new InputError('name is required');
    const id = (input.id?.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).toLowerCase();
    const adapterId = input.adapterId ?? this.inferAdapterFromRuntime(input.runtime) ?? 'claude';
    const runtimeLabel =
      input.runtime ??
      (adapterId === 'antigravity'
        ? 'Antigravity'
        : adapterId === 'gemini'
        ? 'Gemini CLI'
        : adapterId === 'codex'
        ? 'Codex'
        : 'Claude Code');

    let identity: T.Identity;
    try {
      const existing = this.repo.getIdentity(id);
      identity = this.repo.updateIdentity(existing.id, {
        name,
        role: input.role ?? existing.role,
        runtime: runtimeLabel,
        adapterId,
        teamId: input.teamId ?? existing.teamId,
        lane: input.lane ?? existing.lane,
        seats: input.seats ?? existing.seats,
        avatarMark: input.avatarMark ?? existing.avatarMark ?? 'diamond',
        avatarColor: input.avatarColor ?? existing.avatarColor ?? 'indigo',
        archived: false,
      });
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e;
      identity = this.repo.createIdentity({
        id,
        name,
        role: input.role ?? 'Specialist Agent',
        runtime: runtimeLabel,
        adapterId,
        teamId: input.teamId ?? 'creativesites',
        lane: input.lane ?? 'engineering',
        seats: input.seats ?? [],
        avatarMark: input.avatarMark ?? 'diamond',
        avatarColor: input.avatarColor ?? 'indigo',
        approvalLevel: 'member',
      });
    }

    if (input.roomId) {
      try {
        this.repo.addRoomMember(input.roomId, { memberId: identity.id, kind: 'agent', role: 'member' });
      } catch {
        /* ignore if room missing */
      }
    }

    let wakeResult: T.WakeAgentResult | null = null;
    const initialPrompt = (input.wakePrompt ?? input.prompt)?.trim();
    if (initialPrompt) {
      wakeResult = await this.wakeAgent(identity.id, {
        fromActorId: input.spawnedBy || 'atlas',
        fromActorKind: input.spawnedByKind ?? 'agent',
        jobId: input.jobId ?? null,
        roomId: input.roomId ?? null,
        taskId: input.taskId ?? null,
        adapterId,
        prompt: initialPrompt,
        reason: `Initial wakeup on spawn by ${input.spawnedBy || 'team leader'}`,
        allowFallbackAdapter: true,
      });
      identity = this.repo.getIdentity(identity.id);
    }

    return { identity, wakeResult, wake: wakeResult };
  }

  /**
   * 4. Team Leader Delegation: wakes the Team Leader (`atlas` or `themis` or specified lead)
   * with full roster + session-limit awareness so the Team Leader can wake relevant coworkers
   * or spawn new specialists.
   */
  async delegateToTeamLeader(input: {
    leaderId?: string;
    fromActorId: string;
    jobId?: string | null;
    roomId?: string | null;
    directive: string;
  }): Promise<T.WakeAgentResult> {
    const identities = this.repo.listIdentities();
    const preferredLeader =
      input.leaderId?.trim().toLowerCase() ||
      identities.find((i) => i.approvalLevel === 'lead' && i.statusState !== 'rate_limited')?.id ||
      identities.find((i) => i.id === 'atlas' || i.id === 'themis')?.id ||
      identities.find((i) => !i.isOwner)?.id ||
      'atlas';

    const rosterSummary = identities
      .filter((i) => !i.isOwner)
      .slice(0, 20)
      .map((i) => {
        const limitNote =
          i.statusState === 'rate_limited' && i.rateLimitResetAt
            ? ` [RATE-LIMITED until ${i.rateLimitResetAt}: ${i.rateLimitReason ?? 'session limit'}]`
            : ` [${i.statusState ?? 'idle'}, session: ${i.activeSessionId ?? 'none'}]`;
        return `- ${i.name} (${i.id}): ${i.role ?? 'Coworker'} · runtime: ${i.runtime ?? i.adapterId ?? 'claude'}${limitNote}`;
      })
      .join('\n');

    const prompt = [
      `[TEAM LEADER DISPATCH from ${input.fromActorId}]`,
      `Goal / Request: ${input.directive.trim()}`,
      '',
      'Current Team Roster & Live Session / Rate-Limit State:',
      rosterSummary,
      '',
      'As Team Leader, coordinate the work:',
      '1. Wake the best coworker(s) for each part using: [WAKE: <agentId>] <clear instructions>',
      '   (If a Claude Code agent is waiting for a session reset, assign urgent work to an available Gemini/Antigravity or Codex agent, or schedule a wake for resetAt.)',
      '2. If a new specialist is needed, spawn them using: [SPAWN: <id> name="<Name>" role="<Role>" adapter="<claude|codex|gemini>"] <initial prompt>',
      '3. Set up a follow-up check-in timer for yourself using: [SCHEDULE: 5m] Check progress on delegated tasks',
    ].join('\n');

    return this.wakeAgent(preferredLeader, {
      fromActorId: input.fromActorId,
      fromActorKind: input.fromActorId === this.repo.ownerId() ? 'human' : 'agent',
      jobId: input.jobId ?? null,
      roomId: input.roomId ?? null,
      prompt,
      reason: `Team Leader delegation from ${input.fromActorId}`,
      allowFallbackAdapter: true,
    });
  }

  /**
   * Inspects a room message for `@agent` mentions or `[WAKE:...]` / `[SPAWN:...]` / `[SCHEDULE:...]`
   * directives and triggers the corresponding autonomous action.
   */
  async handleRoomMessage(room: T.Room, message: T.Message): Promise<void> {
    if (message.authorKind === 'system') return;

    await this.parseAndExecuteDirectives({
      text: message.body,
      actorId: message.authorId,
      actorKind: message.authorKind,
      roomId: room.id,
      jobId: message.jobId ?? null,
    });

    // WP2: in an intake-enabled room, a human message with no @mention and no directive becomes an intake.
    if (
      message.authorKind === 'human' &&
      room.intakeEnabled &&
      !message.jobId &&
      !/@[a-z0-9_-]+/i.test(message.body) &&
      !/^\s*\[(WAKE|SPAWN|SCHEDULE):/im.test(message.body)
    ) {
      try {
        createIntake(this.repo, {
          text: message.body,
          source: 'room',
          sourceRef: message.id,
          roomId: room.id,
          requestedBy: message.authorId,
        });
      } catch (e) {
        console.error('[intake] room message intake failed:', e);
      }
    }

    // If a human mentions @<agentId> or @team-lead in a room message, wake the mentioned agent(s)
    if (message.authorKind === 'human') {
      const mentions = [...message.body.matchAll(/@([a-z0-9_-]+)/gi)].map((m) => m[1]!.toLowerCase());
      const uniqueMentions = [...new Set(mentions)];
      for (const mention of uniqueMentions) {
        if (mention === 'lead' || mention === 'team-leader' || mention === 'leader') {
          await this.delegateToTeamLeader({
            fromActorId: message.authorId,
            roomId: room.id,
            jobId: message.jobId ?? null,
            directive: message.body,
          }).catch(() => {});
          continue;
        }
        try {
          const target = this.repo.getIdentity(mention);
          if (!target.isOwner) {
            await this.wakeAgent(target.id, {
              fromActorId: message.authorId,
              fromActorKind: 'human',
              roomId: room.id,
              jobId: message.jobId ?? null,
              prompt: `Message in #${room.name} from ${message.authorId}:\n${message.body}`,
              reason: `@${target.id} mention in #${room.name}`,
              allowFallbackAdapter: true,
            });
          }
        } catch {
          /* unknown handle */
        }
      }
    }
  }

  /**
   * Parses `[WAKE: ...]`, `[SCHEDULE: ...]`, and `[SPAWN: ...]` directives from agent output or messages.
   */
  async parseAndExecuteDirectives(ctx: {
    text: string;
    actorId: string;
    actorKind: T.ActorKind;
    jobId?: string | null;
    roomId?: string | null;
    taskId?: string | null;
  }): Promise<{ wakes: string[]; schedules: string[]; spawns: string[] }> {
    const wakes: string[] = [];
    const schedules: string[] = [];
    const spawns: string[] = [];

    for (const rawLine of ctx.text.split('\n')) {
      const line = rawLine.trim();

      // 1. [WAKE: <agentId>] <prompt>
      const wakeMatch = line.match(/^\[WAKE:\s*([a-z0-9_-]+)\]\s*(.+)$/i);
      if (wakeMatch) {
        const targetId = wakeMatch[1]!.toLowerCase();
        const wakePrompt = wakeMatch[2]!.trim();
        try {
          await this.wakeAgent(targetId, {
            fromActorId: ctx.actorId,
            fromActorKind: ctx.actorKind,
            jobId: ctx.jobId ?? null,
            roomId: ctx.roomId ?? null,
            taskId: ctx.taskId ?? null,
            prompt: wakePrompt,
            reason: `Autonomous [WAKE] from ${ctx.actorId}`,
            allowFallbackAdapter: true,
          });
          wakes.push(targetId);
        } catch {
          /* ignore failed wake in directive */
        }
        continue;
      }

      // 2. [SCHEDULE: <delayOrCron>] <prompt> or [SCHEDULE: <agentId> <delayOrCron>] <prompt>
      const schedMatch = line.match(/^\[SCHEDULE:\s*([^\]]+)\]\s*(.+)$/i);
      if (schedMatch) {
        const specRaw = schedMatch[1]!.trim();
        const schedPrompt = schedMatch[2]!.trim();
        let targetAgent = ctx.actorId;
        let timingSpec = specRaw;

        const firstParts = specRaw.split(/\s+/);
        if (firstParts.length >= 2 && !/^\d|\*/.test(firstParts[0]!)) {
          targetAgent = firstParts[0]!.toLowerCase();
          timingSpec = firstParts.slice(1).join(' ');
        }

        try {
          const delaySec = parseDurationSeconds(timingSpec);
          if (delaySec) {
            const created = this.createSchedule({
              agentId: targetAgent,
              createdBy: ctx.actorId,
              createdByKind: ctx.actorKind,
              jobId: ctx.jobId ?? null,
              roomId: ctx.roomId ?? null,
              taskId: ctx.taskId ?? null,
              kind: 'timer',
              delaySeconds: delaySec,
              prompt: schedPrompt,
              reason: `Autonomous [SCHEDULE: ${timingSpec}] from ${ctx.actorId}`,
            });
            schedules.push(created.id);
          } else if (timingSpec.split(/\s+/).length === 5) {
            const created = this.createSchedule({
              agentId: targetAgent,
              createdBy: ctx.actorId,
              createdByKind: ctx.actorKind,
              jobId: ctx.jobId ?? null,
              roomId: ctx.roomId ?? null,
              taskId: ctx.taskId ?? null,
              kind: 'cron',
              cronExpr: timingSpec,
              prompt: schedPrompt,
              reason: `Autonomous cron [SCHEDULE: ${timingSpec}] from ${ctx.actorId}`,
            });
            schedules.push(created.id);
          }
        } catch {
          /* ignore invalid schedule directive */
        }
        continue;
      }

      // 3. [SPAWN: <id> name="<Name>" role="<Role>" adapter="<Adapter>"] <prompt>
      const spawnMatch = line.match(/^\[SPAWN:\s*([a-z0-9_-]+)([^\]]*)\]\s*(.*)$/i);
      if (spawnMatch) {
        const newId = spawnMatch[1]!.toLowerCase();
        const attrs = spawnMatch[2] ?? '';
        const wakePrompt = spawnMatch[3]?.trim() || '';
        const nameAttr = attrs.match(/name="([^"]+)"/i)?.[1] ?? newId.charAt(0).toUpperCase() + newId.slice(1);
        const roleAttr = attrs.match(/role="([^"]+)"/i)?.[1] ?? 'Specialist Agent';
        const adapterAttr = attrs.match(/adapter="([^"]+)"/i)?.[1];
        try {
          const spawned = await this.spawnAgent({
            id: newId,
            name: nameAttr,
            role: roleAttr,
            adapterId: adapterAttr,
            spawnedBy: ctx.actorId,
            spawnedByKind: ctx.actorKind,
            roomId: ctx.roomId ?? null,
            jobId: ctx.jobId ?? null,
            taskId: ctx.taskId ?? null,
            wakePrompt: wakePrompt || undefined,
          });
          spawns.push(spawned.identity.id);
        } catch {
          /* ignore failed spawn */
        }
      }
    }

    return { wakes, schedules, spawns };
  }

  /**
   * Returns a consolidated snapshot of all agent & adapter session limits so any agent or UI screen
   * can inspect who is waiting for session reset and when they resume.
   */
  rateLimitStatus(): {
    agents: {
      id: string;
      name: string;
      runtime: string | null;
      adapterId: string | null;
      statusState: T.IdentityStatusState;
      rateLimitResetAt: string | null;
      rateLimitReason: string | null;
      activeSessionId: string | null;
      acpSessionId: string | null;
    }[];
    identities: {
      id: string;
      name: string;
      runtime: string | null;
      adapterId: string | null;
      statusState: T.IdentityStatusState;
      rateLimitResetAt: string | null;
      rateLimitReason: string | null;
      activeSessionId: string | null;
      acpSessionId: string | null;
    }[];
    adapters: {
      id: string;
      rateLimitResetAt: string | null;
      rateLimitReason: string | null;
    }[];
  } {
    this.repo.sweepExpiredRateLimits();
    const agents = this.repo.listIdentities().map((i) => ({
      id: i.id,
      name: i.name,
      runtime: i.runtime,
      adapterId: i.adapterId ?? null,
      statusState: i.statusState ?? 'idle',
      rateLimitResetAt: i.rateLimitResetAt ?? null,
      rateLimitReason: i.rateLimitReason ?? null,
      activeSessionId: i.activeSessionId ?? null,
      acpSessionId: i.acpSessionId ?? null,
    }));
    const adapters = this.repo
      .listAdapterOverrides()
      .filter((a) => a.rate_limit_reset_at)
      .map((a) => ({
        id: String(a.id),
        rateLimitResetAt: a.rate_limit_reset_at ? String(a.rate_limit_reset_at) : null,
        rateLimitReason: a.rate_limit_reason ? String(a.rate_limit_reason) : null,
      }));
    return { agents, identities: agents, adapters };
  }

  private async handleTurnComplete(info: {
    sessionId: string;
    agentId: string;
    adapterId: string;
    jobId: string | null;
    roomId: string | null;
    taskId: string | null;
    assistantText: string;
    checkPassed: boolean;
  }): Promise<void> {
    // 1. Mark any pending/dispatched wakes for this session as completed
    for (const w of this.repo.listWakes({ targetAgentId: info.agentId, status: 'dispatched', limit: 20 })) {
      if (w.sessionId === info.sessionId) {
        this.repo.updateWake(w.id, { status: 'completed', completedAt: new Date().toISOString() });
      }
    }

    // 2. If woken in a room and produced assistant text, post the agent's reply into the room
    const targetRoomId = info.roomId ?? (info.jobId ? this.repo.getJob(info.jobId).roomId : null);
    if (info.roomId && info.assistantText.trim()) {
      try {
        this.repo.postMessage(info.roomId, {
          authorId: info.agentId,
          authorKind: 'agent',
          body: info.assistantText.trim().slice(0, 4000),
          jobId: info.jobId ?? undefined,
        });
      } catch {
        /* ignore */
      }
    }

    // 3. Parse and execute any autonomous [WAKE], [SCHEDULE], [SPAWN] directives emitted by the agent
    if (info.assistantText.trim()) {
      await this.parseAndExecuteDirectives({
        text: info.assistantText,
        actorId: info.agentId,
        actorKind: 'agent',
        jobId: info.jobId,
        roomId: targetRoomId,
        taskId: info.taskId,
      });
    }

    // 4. Phase 2 Autonomous Independent Verification Handoff:
    // When all tasks on a job in 'build' stage are done, automatically run independent verification via Kael (or another non-assignee verifier)
    if (info.jobId && info.checkPassed) {
      try {
        const job = this.repo.getJob(info.jobId);
        if (job.stage === 'build' && job.tasks.length > 0 && job.tasks.every((t) => t.status === 'done' || t.status === 'verified' || t.status === 'needs_review')) {
          const identities = this.repo.listIdentities().filter((i) => !i.isOwner && i.id !== info.agentId);
          const verifier =
            identities.find((i) => i.id === 'kael' && !job.tasks.some((t) => t.assigneeId === 'kael')) ??
            identities.find((i) => !job.tasks.some((t) => t.assigneeId === i.id)) ??
            null;
          if (verifier) {
            const verResult = await this.checker.verify(job.id, verifier.id);
            if (verResult.ok) {
              try {
                this.repo.transitionJob(job.id, {
                  to: 'verify',
                  actorId: verifier.id,
                  actorKind: 'agent',
                  note: `Autonomous independent verification passed (${verifier.name})`,
                });
              } catch {
                /* stage gate might need criteria link */
              }
            }
          }
        }
      } catch {
        /* verification is best-effort on turn complete */
      }
    }
  }

  private handleRateLimit(info: {
    sessionId: string;
    agentId: string;
    adapterId: string;
    jobId: string | null;
    roomId: string | null;
    taskId: string | null;
    reason: string;
    resetAt: string;
    prompt: string;
  }): void {
    // Schedule an automatic one-shot self-wakeup for resetAt so the agent resumes automatically
    try {
      this.repo.createSchedule({
        agentId: info.agentId,
        createdBy: info.agentId,
        createdByKind: 'system',
        jobId: info.jobId,
        roomId: info.roomId,
        taskId: info.taskId,
        kind: 'timer',
        nextRunAt: info.resetAt,
        prompt: `Auto-resume after rate limit reset (${info.reason}): ${info.prompt}`,
        reason: `Auto-resume after rate limit reset: ${info.reason}`,
        maxRuns: 1,
      });
    } catch {
      /* ignore */
    }

    const roomId = info.roomId ?? (info.jobId ? this.repo.getJob(info.jobId).roomId : null);
    if (roomId) {
      try {
        const agent = this.repo.getIdentity(info.agentId);
        this.repo.postMessage(roomId, {
          authorId: info.agentId,
          authorKind: 'system',
          body: `⚠️ ${agent.name} (${info.adapterId}) hit a session limit: "${info.reason}". Resets at ${info.resetAt}. Automatic wakeup scheduled for resetAt; Antigravity/Gemini or Codex coworkers can pick up urgent tasks in the meantime.`,
          jobId: info.jobId ?? undefined,
        });
      } catch {
        /* ignore */
      }
    }
  }

  private inferAdapterFromRuntime(runtime?: string | null): string {
    if (!runtime) {
      const def = this.repo.getSetting('defaultRuntime') || 'antigravity';
      return typeof def === 'string' && def ? def.toLowerCase() : 'antigravity';
    }
    const r = runtime.toLowerCase();
    if (r.includes('antigravity') || r.includes('agy')) return 'antigravity';
    if (r.includes('gemini')) return 'gemini';
    if (r.includes('codex') || r.includes('openai')) return 'codex';
    if (r.includes('claude')) return 'claude';
    return r;
  }

  private getActiveAdapterRateLimit(adapterId: string): { resetAt: string; reason: string | null } | null {
    const row = this.repo.listAdapterOverrides().find((a) => String(a.id) === adapterId);
    if (!row || !row.rate_limit_reset_at) return null;
    const resetAt = String(row.rate_limit_reset_at);
    if (Date.parse(resetAt) <= Date.now()) return null;
    return { resetAt, reason: row.rate_limit_reason ? String(row.rate_limit_reason) : null };
  }

  private findAvailableFallbackAdapter(excludedAdapterId: string): string | null {
    const overrides = new Map(this.repo.listAdapterOverrides().map((r) => [String(r.id), r]));
    // First check custom/test overrides that are enabled and not rate-limited
    for (const [id, row] of overrides) {
      if (id === excludedAdapterId) continue;
      if (Number(row.enabled ?? 1) !== 1 || !row.command) continue;
      const resetAt = row.rate_limit_reset_at ? String(row.rate_limit_reset_at) : null;
      if (resetAt && Date.parse(resetAt) > Date.now()) continue;
      return id;
    }
    // Next check installed system adapters (claude, codex, gemini) without blocking on slow auth subshells
    for (const preset of ADAPTER_PRESETS) {
      if (preset.id === excludedAdapterId || preset.id === 'dsh') continue;
      if (!findExecutable(preset.command, preset.aliases)) continue;
      const rl = this.getActiveAdapterRateLimit(preset.id);
      if (rl) continue;
      return preset.id;
    }
    return null;
  }
}
