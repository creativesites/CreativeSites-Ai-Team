// WP3 3.2-3.4: the agent-driven Planning Council (gap audit C3).
//
// Each seat is a real agent session. Seats write their cards through the MCP tool
// `council_card_submit`; nothing here generates a card, a score or a vote. Rounds are
// tick-driven state on the council row (no blocking waits): a round closes when every
// seat has submitted, when every missing seat's session has ended, or at the deadline
// (`council.roundTimeoutMinutes`, default 20). Seats that did not submit are recorded
// as absent. Scoring is the existing council.ts maths over the final round's cards.
import type * as T from '../api/types.ts';
import type { StartSessionInput } from '../acp/session-manager.ts';
import type { AgentPrincipal } from '../agent-tools/tokens.ts';
import { computeCouncil } from '../council.ts';
import { MYAOS_COUNCIL_SEATS, parseCard } from '../council-roster.ts';
import { ConflictError, InputError } from '../errors.ts';
import { submitPlan, type SubmitPlanResult } from '../planning/plan.ts';
import type { Repo } from '../store/repo.ts';
import { readinessCheck, selectCouncil, type Unavailable } from './select.ts';

export const COUNCIL_SEAT_MARKER = 'myaos-council-seat';
export const COUNCIL_SYNTH_MARKER = 'myaos-council-synthesise';
export const DEFAULT_ROUND_TIMEOUT_MINUTES = 20;
const ENDED: T.SessionState[] = ['idle', 'stopped', 'failed'];

export interface CouncilSessions {
  start(input: StartSessionInput): Promise<T.Session>;
  adapterBlockedReason(agent: T.Identity): string | null;
}

export interface CardSubmission {
  round: number;
  scores: Record<string, number>;
  vote: 'endorse' | 'amend' | 'dissent';
  rationale: string;
  wouldHaveToBeTrue?: string;
  confidence?: number;
  pillar?: number;
  ruin?: Record<string, T.Ruin>;
  reversible?: boolean;
}

const DEFAULT_OPTIONS: T.CouncilOption[] = [
  { id: 'A', label: 'Proceed with the request as briefed' },
  { id: 'B', label: 'Ship a smaller first slice that tests the riskiest assumption first' },
  { id: 'C', label: 'Do not do this now' },
];

const services = new WeakMap<Repo, CouncilService>();
export function attachCouncilService(repo: Repo, svc: CouncilService): void {
  services.set(repo, svc);
}
export function councilServiceFor(repo: Repo): CouncilService | null {
  return services.get(repo) ?? null;
}

type State = T.CouncilLiveState;

function emptyState(rounds: number, timeoutMinutes: number, seats: string[]): State {
  return {
    rounds,
    round: 0,
    timeoutMinutes,
    roundOpenedAt: null,
    deadlineAt: null,
    closedRounds: [],
    sessions: Object.fromEntries(seats.map((s) => [s, {}])),
    outcome: null,
    synthesiser: null,
    startErrors: {},
  };
}

export class CouncilService {
  private readonly repo: Repo;
  private readonly sessions: CouncilSessions;
  private readonly unavailable: Unavailable;
  private readonly clock: () => Date;
  /** Councils whose next round is being opened (sessions starting): tick leaves them alone. */
  private readonly busy = new Set<string>();

  constructor(opts: { repo: Repo; sessions: CouncilSessions; unavailable?: Unavailable; now?: () => Date }) {
    this.repo = opts.repo;
    this.sessions = opts.sessions;
    this.unavailable = opts.unavailable ?? readinessCheck(opts.repo, (a) => opts.sessions.adapterBlockedReason(a));
    this.clock = opts.now ?? (() => new Date());
  }

  roundTimeoutMinutes(): number {
    const flat = Number(this.repo.getSetting('council.roundTimeoutMinutes'));
    if (Number.isFinite(flat) && flat > 0) return flat;
    const nested = this.repo.getSetting('council') as { roundTimeoutMinutes?: unknown } | undefined;
    const n = Number(nested?.roundTimeoutMinutes);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_ROUND_TIMEOUT_MINUTES;
  }

  // ------------------------------------------------------------------ 3.1 selection + start

  /** Selection only (no council is created). */
  select(jobId: string, override?: string[]): T.CouncilSelection {
    const job = this.repo.getJob(jobId);
    const requiredSkills = [...new Set(job.tasks.flatMap((t) => t.requiredSkills ?? []))];
    return selectCouncil(
      this.repo,
      { workflow: job.workflow ?? null, kind: job.kind ?? null, title: job.title, brief: job.brief, requiredSkills, override },
      this.unavailable,
      this.clock()
    );
  }

  async start(
    jobId: string,
    input: T.StartJobCouncilInput,
    actorId: string
  ): Promise<{ council: T.Council | null; selection: T.CouncilSelection }> {
    const job = this.repo.getJob(jobId);
    if (this.repo.listRunningLiveCouncils(jobId).length) throw new ConflictError('This job already has a live council running');
    const selection = this.select(jobId, input.seats);
    if (selection.skipped) {
      this.repo.recordPlanEvent(jobId, 'council.skipped', { reason: selection.skipped }, { id: actorId, kind: 'human' });
      return { council: null, selection };
    }
    const options = Array.isArray(input.options) && input.options.length >= 2 ? input.options : DEFAULT_OPTIONS;
    const identities = new Map(selection.seats.map((s) => [s.identityId, this.repo.getIdentity(s.identityId)]));
    const seats: T.CouncilSeat[] = selection.seats.map((s) => ({
      seat: s.identityId,
      identityId: s.identityId,
      weight: s.weight,
      question: lensFor(identities.get(s.identityId)!),
      reason: s.reasons.join('; '),
    }));
    const rounds = input.rounds === 1 ? 1 : 2;
    const council = this.repo.createCouncil(jobId, {
      mode: rounds === 1 ? 'quick' : 'full',
      title: job.title,
      decision: input.prompt?.trim() || job.title,
      brief: job.brief,
      options,
      seats,
      runMode: 'live',
      selection,
    });
    this.repo.updateCouncilLive(council.id, {
      liveState: emptyState(rounds, this.roundTimeoutMinutes(), seats.map((s) => s.seat)),
      event: { type: 'council.selection', payload: { seats: selection.seats, excluded: selection.excluded, override: selection.override } },
    });
    await this.openRound(council.id, 1);
    return { council: this.repo.getCouncil(council.id), selection };
  }

  // ------------------------------------------------------------------ 3.2 rounds

  private state(council: T.Council): State {
    return structuredClone((council.liveState ?? emptyState(2, this.roundTimeoutMinutes(), council.seats.map((s) => s.seat))) as State);
  }

  private async openRound(councilId: string, round: number): Promise<void> {
    this.busy.add(councilId);
    try {
      let council = this.repo.getCouncil(councilId);
      const st = this.state(council);
      const opened = this.clock();
      st.round = round;
      st.roundOpenedAt = opened.toISOString();
      st.deadlineAt = new Date(opened.getTime() + st.timeoutMinutes * 60_000).toISOString();
      for (const seat of council.seats) (st.sessions[seat.seat] ??= {})[String(round)] = null;
      this.repo.updateCouncilLive(councilId, { liveState: st, event: { type: 'council.round_opened', payload: { round, deadlineAt: st.deadlineAt } } });

      const job = this.repo.getJob(council.jobId);
      const priorCards = round > 1 ? council.cards.filter((c) => c.round === round - 1) : [];
      const priorAbsent = (council.absentSeats ?? []).filter((a) => a.round === round - 1);
      for (const seat of council.seats) {
        const identity = this.repo.getIdentity(seat.identityId!);
        const prompt = seatPrompt({ job, council, seat, identity, round, priorCards, priorAbsent, deadlineAt: st.deadlineAt! });
        let sessionId: string | null = null;
        let error: string | null = null;
        try {
          const session = await this.sessions.start({ jobId: job.id, agentId: identity.id, prompt, rawPrompt: true, mode: 'review' });
          sessionId = session.id;
        } catch (e) {
          error = (e as Error).message;
        }
        council = this.repo.getCouncil(councilId);
        const now = this.state(council);
        if (now.round !== round) return; // closed meanwhile
        now.sessions[seat.seat]![String(round)] = sessionId;
        if (error) ((now.startErrors ??= {})[seat.seat] ??= {})[String(round)] = error;
        this.repo.updateCouncilLive(councilId, {
          liveState: now,
          event: { type: 'council.seat_invited', payload: { round, seat: seat.seat, sessionId, error } },
        });
      }
    } finally {
      this.busy.delete(councilId);
    }
    this.scheduleAdvance(councilId);
  }

  private scheduleAdvance(councilId: string): void {
    setImmediate(() => {
      try {
        void this.advance(councilId, this.clock()).catch(() => {});
      } catch {
        /* store closed */
      }
    });
  }

  /** Closes the current round if it is complete, ended or past its deadline. */
  private async advance(councilId: string, now: Date): Promise<void> {
    if (this.busy.has(councilId)) return;
    const council = this.repo.getCouncil(councilId);
    if (council.runMode !== 'live' || council.status !== 'running') return;
    const st = this.state(council);
    if (!st.round || st.closedRounds.includes(st.round)) return;
    const round = st.round;
    const submitted = new Set(council.cards.filter((c) => c.round === round).map((c) => c.seat));
    const missing = council.seats.filter((s) => !submitted.has(s.seat));
    const timedOut = st.deadlineAt != null && now.getTime() >= Date.parse(st.deadlineAt);
    const reasons = new Map<string, string>();
    for (const seat of missing) {
      const startError = st.startErrors?.[seat.seat]?.[String(round)];
      const sessionId = st.sessions[seat.seat]?.[String(round)] ?? null;
      if (startError || !sessionId) {
        reasons.set(seat.seat, `session could not start: ${startError ?? 'no session'}`);
        continue;
      }
      let state: T.SessionState | null = null;
      try {
        state = this.repo.getSession(sessionId).state;
      } catch {
        state = 'failed';
      }
      if (state && ENDED.includes(state)) reasons.set(seat.seat, `session ${sessionId} ended (${state}) without submitting a card`);
      else if (timedOut) reasons.set(seat.seat, `no card before the round deadline (${st.timeoutMinutes} min)`);
    }
    if (missing.some((s) => !reasons.has(s.seat))) return; // still waiting on a live seat

    const absent: T.CouncilAbsentSeat[] = [
      ...(council.absentSeats ?? []),
      ...missing.map((s) => ({ seat: s.seat, identityId: s.identityId ?? null, round, reason: reasons.get(s.seat)! })),
    ];
    st.closedRounds.push(round);
    this.repo.updateCouncilLive(councilId, {
      liveState: st,
      absentSeats: absent,
      event: { type: 'council.round_closed', payload: { round, submitted: [...submitted], absent: missing.map((s) => s.seat), timedOut } },
    });
    if (round < st.rounds) {
      await this.openRound(councilId, round + 1);
      return;
    }
    this.finalise(councilId);
  }

  /** One pass over running live councils and pending synthesiser sessions. Driven by a timer. */
  async tick(now: Date = this.clock()): Promise<void> {
    for (const c of this.repo.listRunningLiveCouncils()) {
      try {
        await this.advance(c.id, now);
      } catch (e) {
        console.warn(`[council] ${c.id}: ${(e as Error).message}`);
      }
    }
    for (const c of this.repo.listLiveCouncilsAwaitingPlan()) {
      const synth = c.liveState?.synthesiser;
      if (!synth || synth.status !== 'running' || !synth.sessionId) continue;
      let state: T.SessionState;
      try {
        state = this.repo.getSession(synth.sessionId).state;
      } catch {
        state = 'failed';
      }
      if (ENDED.includes(state)) {
        const st = this.state(c);
        st.synthesiser = { ...synth, status: 'failed', error: `synthesiser session ended (${state}) without calling plan_submit` };
        this.repo.updateCouncilLive(c.id, { liveState: st, event: { type: 'council.synthesis_failed', payload: { sessionId: synth.sessionId } } });
      }
    }
  }

  // ------------------------------------------------------------------ cards (MCP tool)

  /** Called by the `council_card_submit` tool. Synchronous; throws InputError/ConflictError. */
  submitCard(principal: AgentPrincipal, jobId: string, sub: CardSubmission): { councilId: string; cardId: string; round: number; seat: string } {
    const council = this.repo
      .listRunningLiveCouncils(jobId)
      .find((c) => c.seats.some((s) => s.identityId === principal.identityId));
    if (!council) throw new ConflictError('You do not hold a seat on a running live council for this job');
    const seat = council.seats.find((s) => s.identityId === principal.identityId)!;
    const st = this.state(council);
    if (!st.round) throw new ConflictError('The council has not opened a round yet');
    if (sub.round !== st.round || st.closedRounds.includes(sub.round)) {
      throw new ConflictError(`Round ${sub.round} is not open; the council is in round ${st.round}${st.closedRounds.includes(st.round) ? ' (closed)' : ''}`);
    }
    const invited = st.sessions[seat.seat]?.[String(sub.round)] ?? null;
    if (invited && principal.sessionId !== invited) throw new ConflictError(`Only session ${invited} may write ${seat.seat}'s round ${sub.round} card`);
    if (!principal.sessionId) throw new ConflictError('Council cards must come from a session-bound token');
    if (council.cards.some((c) => c.round === sub.round && c.seat === seat.seat)) throw new ConflictError(`${seat.seat} already submitted a card for round ${sub.round}`);

    const optionIds = council.options.map((o) => o.id);
    const unknown = Object.keys(sub.scores).filter((k) => !optionIds.includes(k));
    if (unknown.length) throw new InputError(`Unknown option id(s): ${unknown.join(', ')}. Options are ${optionIds.join(', ')}`);
    for (const id of optionIds) {
      const v = sub.scores[id];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10) throw new InputError(`scores.${id} must be a number from 0 to 10 (score every option)`);
    }
    // Render the card in the roster card format and validate it with the existing parser.
    const text = [
      `SEAT: ${seat.seat}`,
      `VOTE: ${sub.vote === 'amend' ? 'Endorse with amendment' : sub.vote === 'dissent' ? 'Dissent' : 'Endorse'}`,
      `OPTION SCORES: ${optionIds.map((id) => `${id} ${sub.scores[id]}/10`).join(' · ')}`,
      sub.confidence != null ? `CONFIDENCE: ${sub.confidence}/10` : '',
      `THE CALL: ${sub.rationale.replace(/\s+/g, ' ').trim()}`,
      sub.vote !== 'endorse' ? `AMENDMENT OR DISSENT: ${sub.rationale.replace(/\s+/g, ' ').trim()}` : '',
      sub.wouldHaveToBeTrue ? `WHAT WOULD CHANGE MY MIND: ${sub.wouldHaveToBeTrue.replace(/\s+/g, ' ').trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const parsed = parseCard(text, optionIds);
    for (const id of optionIds) {
      if (parsed.optionScores[id] !== sub.scores[id]) throw new InputError(`The card did not parse: score for ${id} reads ${parsed.optionScores[id]}`);
    }
    if (parsed.vote !== sub.vote) throw new InputError(`The card did not parse: vote reads ${parsed.vote || 'nothing'}`);
    const top = Math.max(...optionIds.map((id) => sub.scores[id]!));
    const card = this.repo.addCouncilCard(council.id, {
      round: sub.round,
      seat: seat.seat,
      identityId: principal.identityId,
      scores: sub.scores,
      pillar: sub.pillar ?? top,
      confidence: sub.confidence,
      ruin: sub.ruin,
      reversible: sub.reversible,
      argument: sub.rationale,
      text,
      parsed: parsed as T.CouncilCardParsed,
      sessionId: principal.sessionId,
      vote: sub.vote,
      wouldHaveToBeTrue: sub.wouldHaveToBeTrue ?? null,
    });
    this.scheduleAdvance(council.id);
    return { councilId: council.id, cardId: card.id, round: sub.round, seat: seat.seat };
  }

  // ------------------------------------------------------------------ 3.4 synthesis

  private finalise(councilId: string): void {
    const council = this.repo.getCouncil(councilId);
    const st = this.state(council);
    const absent = council.absentSeats ?? [];
    if (!council.cards.length) {
      st.outcome = 'No seat submitted a card; no verdict was produced and none was generated.';
      this.repo.updateCouncilLive(councilId, { liveState: st, status: 'cancelled', event: { type: 'council.no_verdict', payload: { absent } } });
      return;
    }
    const scoredRound = Math.max(...council.cards.map((c) => c.round));
    const finalCards = council.cards.filter((c) => c.round === scoredRound);
    const present = new Set(finalCards.map((c) => c.seat));
    const seats = council.seats.filter((s) => present.has(s.seat));
    const weightOf = (seat: string) => council.seats.find((s) => s.seat === seat)?.weight ?? 0;
    const computed = computeCouncil(council.options, seats, finalCards.map((c) => c.result));
    const dissents = finalCards
      .filter((c) => c.result.vote === 'dissent')
      .sort((a, b) => weightOf(b.seat) - weightOf(a.seat))
      .map((c) => ({ seat: c.seat, quote: c.result.argument ?? '', would_have_to_be_true: c.result.wouldHaveToBeTrue ?? '', round: c.round }));
    const votes: Record<string, number> = { endorse: 0, amend: 0, dissent: 0 };
    for (const c of finalCards) if (c.result.vote) votes[c.result.vote] = (votes[c.result.vote] ?? 0) + 1;
    const rich: Partial<T.CouncilResult> = {
      runMode: 'live',
      scoredRound,
      dissents,
      ...(dissents.length ? { minority: { seat: dissents[0]!.seat, quote: dissents[0]!.quote, would_have_to_be_true: dissents[0]!.would_have_to_be_true } } : {}),
      rejectedOptions: computed.scores.filter((s) => s.id !== computed.topId),
      absent,
      votes,
      amendments: finalCards
        .filter((c) => c.result.vote === 'amend')
        .map((c) => ({ seat: c.seat, amendment: c.result.argument ?? '', adopted: false, reason: 'Recorded for the plan author; amendments are not adopted automatically.' })),
      why: finalCards
        .filter((c) => c.result.vote !== 'dissent')
        .map((c) => ({ point: c.result.argument ?? '', seat: c.seat, framework: council.seats.find((s) => s.seat === c.seat)?.question ?? '' })),
      seats: council.seats.map((s) => {
        const c = finalCards.find((x) => x.seat === s.seat);
        return { key: s.seat, weight: s.weight, stance: c?.result.vote ?? 'absent', optionScores: c?.result.scores ?? {}, pillar: c?.result.pillar ?? null, oneLine: c?.result.argument ?? '' };
      }),
    };
    this.repo.createVerdict(councilId, rich, { presentOnly: true });
    const after = this.repo.getCouncil(councilId);
    const st2 = this.state(after);
    st2.outcome = `Verdict from round ${scoredRound} (${finalCards.length} card(s), ${absent.filter((a) => a.round === scoredRound).length} absent).`;
    this.repo.updateCouncilLive(councilId, { liveState: st2 });
  }

  // ------------------------------------------------------------------ 3.3 plan from the verdict

  /**
   * The owner accepts a live verdict. With tasks: the owner's tasks become a structured plan
   * packet through submitPlan. Without tasks (or `synthesise`): the synthesiser seat (the
   * Orchestrator if present and available, else the highest-weight available seat) is asked
   * to submit the plan with `plan_submit`. Either way the plan records councilId.
   */
  async accept(councilId: string, input: T.AcceptVerdictInput): Promise<{ council: T.Council; plan: SubmitPlanResult | null }> {
    const council = this.repo.getCouncil(councilId);
    if (council.runMode !== 'live') throw new ConflictError('Not a live council');
    if (council.status !== 'verdict' || !council.verdict) throw new ConflictError(`This council is ${council.status}; only a verdict can be accepted`);
    const actorId = String(input.actorId ?? '').trim();
    if (!actorId) throw new InputError('actorId is required');
    this.ensurePlanStage(council.jobId, actorId);
    const verdict = council.verdict.payload;
    const tasks = Array.isArray(input.tasks) ? input.tasks : [];
    if (tasks.length && !input.synthesise) {
      const packet: T.PlanPacket = {
        summary: verdict.call,
        risk: input.risk ?? 'medium',
        requirements: verdict.conditions?.length ? verdict.conditions : undefined,
        risks: (verdict.dissents ?? []).map((d) => ({ text: `Dissent by ${d.seat}: ${d.quote}${d.would_have_to_be_true ? ` (would have to be true: ${d.would_have_to_be_true})` : ''}`, severity: 'medium' })),
        tasks: tasks.map((t, i) => ({
          key: t.planTaskId || `t${i + 1}`,
          title: t.title,
          assigneeId: t.assigneeId ?? null,
          checkCommand: t.checkCommand ?? null,
          verificationRequired: t.mode === 'verify',
        })),
      };
      const plan = submitPlan(this.repo, council.jobId, packet, { id: actorId, kind: 'human' }, { councilId });
      const accepted = this.repo.markLiveCouncilAccepted(councilId, { source: 'owner', taskKeys: plan.taskKeys, outcome: plan.outcome, approvalId: plan.approvalId }, { id: actorId, kind: 'human' });
      return { council: accepted, plan };
    }
    const synth = this.chooseSynthesiser(council);
    const st = this.state(council);
    const requestedAt = this.clock().toISOString();
    st.synthesiser = { identityId: synth.identityId, reason: synth.reason, sessionId: null, requestedBy: actorId, requestedAt, status: 'requested' };
    this.repo.updateCouncilLive(councilId, { liveState: st, event: { type: 'council.synthesis_requested', payload: { identityId: synth.identityId, reason: synth.reason, by: actorId } } });
    const job = this.repo.getJob(council.jobId);
    try {
      const session = await this.sessions.start({ jobId: job.id, agentId: synth.identityId, prompt: synthPrompt(job, this.repo.getCouncil(councilId)), rawPrompt: true, mode: 'review' });
      const now = this.state(this.repo.getCouncil(councilId));
      if (now.synthesiser?.status === 'requested') now.synthesiser = { ...now.synthesiser, sessionId: session.id, status: 'running' };
      this.repo.updateCouncilLive(councilId, { liveState: now });
    } catch (e) {
      const now = this.state(this.repo.getCouncil(councilId));
      now.synthesiser = { ...now.synthesiser!, status: 'failed', error: (e as Error).message };
      this.repo.updateCouncilLive(councilId, { liveState: now });
      throw new ConflictError(`The synthesiser session could not start: ${(e as Error).message}. Accept with tasks instead.`);
    }
    return { council: this.repo.getCouncil(councilId), plan: null };
  }

  private ensurePlanStage(jobId: string, actorId: string): void {
    const job = this.repo.getJob(jobId);
    if (job.stage === 'brief') this.repo.transitionJob(jobId, { to: 'plan', actorId, note: 'council verdict accepted' });
  }

  private chooseSynthesiser(council: T.Council): { identityId: string; reason: string } {
    const nowMs = this.clock().getTime();
    const orchestrator = this.repo
      .listIdentities()
      .find((i) => !i.isOwner && (i.id === 'orchestrator' || /orchestrat/i.test(i.role ?? '')));
    if (orchestrator && !this.unavailable(orchestrator, nowMs)) return { identityId: orchestrator.id, reason: 'the Orchestrator consolidates the council (vision §4.3)' };
    const seats = [...council.seats].sort((a, b) => b.weight - a.weight || a.seat.localeCompare(b.seat));
    for (const s of seats) {
      if (!s.identityId) continue;
      const why = this.unavailable(this.repo.getIdentity(s.identityId), nowMs);
      if (!why) {
        return {
          identityId: s.identityId,
          reason: `${orchestrator ? `the Orchestrator (${orchestrator.id}) is unavailable; ` : 'no Orchestrator identity; '}highest-weight available seat (weight ${s.weight})`,
        };
      }
    }
    throw new ConflictError('No synthesiser is available (no Orchestrator and no available seat). Accept with tasks instead.');
  }

  /** For `plan_submit`: the live council whose synthesiser session this principal is. */
  councilForSynthesiser(principal: AgentPrincipal): string | null {
    if (!principal.sessionId) return null;
    const c = this.repo.listLiveCouncilsAwaitingPlan().find((x) => x.liveState?.synthesiser?.sessionId === principal.sessionId && x.jobId === principal.jobId);
    return c?.id ?? null;
  }

  planSubmitted(councilId: string, principal: AgentPrincipal, plan: SubmitPlanResult): void {
    const c = this.repo.getCouncil(councilId);
    const st = this.state(c);
    if (st.synthesiser) st.synthesiser = { ...st.synthesiser, status: 'submitted' };
    this.repo.updateCouncilLive(councilId, { liveState: st });
    this.repo.markLiveCouncilAccepted(
      councilId,
      { source: 'synthesiser', synthesiser: principal.identityId, sessionId: principal.sessionId, taskKeys: plan.taskKeys, outcome: plan.outcome, approvalId: plan.approvalId },
      { id: principal.identityId, kind: 'agent' }
    );
  }
}

function lensFor(identity: T.Identity): string {
  const roster = MYAOS_COUNCIL_SEATS.find((s) => s.identityId === identity.id);
  if (roster) return `${roster.pillar}: ${roster.question}`;
  const dept = identity.departmentId ? ` (${identity.departmentId})` : '';
  const caps = [...(identity.capabilities ?? []), ...(identity.skills ?? [])].slice(0, 6);
  return `${identity.role ?? 'Specialist'}${dept}: judge the request through your own expertise${caps.length ? ` (${caps.join(', ')})` : ''}`;
}

function cardLine(c: T.CouncilCard): string {
  const scores = Object.entries(c.result.scores).map(([k, v]) => `${k}=${v}`).join(' ');
  return `- ${c.seat}: ${scores}; vote ${c.result.vote ?? '?'}; "${(c.result.argument ?? '').slice(0, 600)}"${c.result.wouldHaveToBeTrue ? `; would have to be true: ${c.result.wouldHaveToBeTrue.slice(0, 300)}` : ''}`;
}

function seatPrompt(x: {
  job: T.JobDetail;
  council: T.Council;
  seat: T.CouncilSeat;
  identity: T.Identity;
  round: number;
  priorCards: T.CouncilCard[];
  priorAbsent: T.CouncilAbsentSeat[];
  deadlineAt: string;
}): string {
  const { job, council, seat, identity, round } = x;
  const rounds = council.liveState?.rounds ?? 2;
  const lines = [
    `${COUNCIL_SEAT_MARKER}`,
    `You are ${identity.name} (${identity.id}), holding seat "${seat.seat}" on the MyaOS Planning Council for job #${job.number}: ${job.title}.`,
    `Your lens: ${seat.question}`,
    `Why you were seated: ${seat.reason ?? ''}`,
    '',
    `This is round ${round} of ${rounds}.`,
    round === 1
      ? 'Work independently: you cannot see the other seats. Investigate the request yourself (read the brief and the relevant code), name the assumptions it rests on and challenge them.'
      : 'Below are the round-1 cards of every seat. Challenge the assumptions you disagree with and revise your scores or vote if the arguments moved you; say so plainly if they did not.',
    '',
    `Decision: ${council.decision ?? job.title}`,
    job.brief ? `Brief:\n${job.brief}` : '',
    job.criteria.length ? `Done means:\n${job.criteria.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}` : '',
    '',
    'Options (score EVERY option from 0 to 10):',
    ...council.options.map((o) => `- ${o.id}: ${o.label}`),
    ...(x.priorCards.length ? ['', `Round ${round - 1} cards:`, ...x.priorCards.map(cardLine)] : []),
    ...(x.priorAbsent.length ? [`Absent in round ${round - 1}: ${x.priorAbsent.map((a) => `${a.seat} (${a.reason})`).join('; ')}`] : []),
    '',
    'Submit exactly one card by calling the MCP tool `council_card_submit` on the "myaos" server:',
    `{ "round": ${round}, "scores": { ${council.options.map((o) => `"${o.id}": <0-10>`).join(', ')} }, "vote": "endorse" | "amend" | "dissent", "rationale": "<your argument>", "wouldHaveToBeTrue": "<what would change your mind>" }`,
    'Vote "dissent" when you would not back the option you expect to lead; your dissent is recorded in the verdict, not averaged away.',
    `The round closes at ${x.deadlineAt}; a seat without a card is recorded as absent. Do not change files in this session.`,
    '',
    `Seat identity: ${identity.id}`,
    `Council round: ${round}`,
  ];
  return lines.filter((l) => l !== '').join('\n');
}

function synthPrompt(job: T.JobDetail, council: T.Council): string {
  const v = council.verdict!.payload;
  return [
    COUNCIL_SYNTH_MARKER,
    `You consolidate the MyaOS Planning Council for job #${job.number}: ${job.title}. The owner accepted its verdict and asks you for the structured plan.`,
    `Verdict: ${v.call}`,
    `Scores: ${v.scores.map((s) => `${s.id} ${s.score} (${s.label})`).join('; ')}`,
    v.dissents?.length ? `Dissent (keep it visible as a risk): ${v.dissents.map((d) => `${d.seat}: ${d.quote}`).join(' | ')}` : 'No seat dissented.',
    v.absent?.length ? `Absent seats: ${v.absent.map((a) => `${a.seat} r${a.round}`).join(', ')}` : '',
    v.conditions?.length ? `Conditions: ${v.conditions.join(' ')}` : '',
    job.brief ? `Brief:\n${job.brief}` : '',
    'Final-round cards:',
    ...council.cards.filter((c) => c.round === (v.scoredRound ?? 1)).map(cardLine),
    '',
    'Call the MCP tool `plan_submit` on the "myaos" server with summary, risk (low|medium|high), criteria and a task graph (key, title, assigneeId, dependsOn, checkCommand). The runtime records which council the plan comes from.',
    `Council id: ${council.id}`,
  ]
    .filter(Boolean)
    .join('\n');
}
