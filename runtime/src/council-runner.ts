import type http from 'node:http';
import type * as T from './api/types.ts';
import type { Repo } from './store/repo.ts';
import {
  ALL_COUNCIL_SEATS,
  checkQuotes,
  COUNCIL_DISCLAIMER,
  DEFAULT_MYAOS_BOARD,
  DEFAULT_OPERATOR_BOARD,
  parseCard,
  SEATS_BY_KEY,
  type CouncilRosterSeat,
} from './council-roster.ts';
import {
  buildVerdictSeats,
  computeFinalNumbers,
  computeRoundOptionScores,
} from './council-watch.ts';

interface ActiveCouncilStream {
  councilId: string;
  jobId: string;
  status: 'running' | 'done' | 'error';
  started: number;
  events: T.CouncilStreamEvent[];
  subs: Set<http.ServerResponse>;
}

const activeStreams = new Map<string, ActiveCouncilStream>();

export function subscribeCouncilStream(councilId: string, repo: Repo, res: http.ServerResponse): void {
  const live = activeStreams.get(councilId);
  if (live) {
    for (const ev of live.events) {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }
    if (live.status !== 'running') {
      res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
      return;
    }
    live.subs.add(res);
    res.on('close', () => live.subs.delete(res));
    return;
  }

  try {
    const council = repo.getCouncil(councilId);
    const savedEvents = council.events ?? [];
    for (const ev of savedEvents) {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }
    if (council.status !== 'running') {
      res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
    }
  } catch {
    res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
  }
}

export function buildSessionPayloadFromCouncil(council: T.Council): T.CouncilSessionPayload {
  const events: T.CouncilStreamEvent[] = council.events?.length ? [...council.events] : [];
  if (!events.length) {
    const weights: Record<string, { weight: number; reason: string }> = {};
    for (const s of council.seats) {
      weights[s.seat] = { weight: s.weight, reason: s.reason || s.question || '' };
    }
    events.push({
      type: 'setup',
      t: 0,
      title: council.title || 'Council Session',
      decision: council.decision || council.title || '',
      brief: council.brief || '',
      options: council.options,
      assumptions: council.assumptions ?? [],
      weights,
      seats: council.seats.map((s) => s.seat),
      mode: council.mode,
      runMode: council.runMode ?? null,
    });
    const rounds = [...new Set(council.cards.map((c) => c.round || 1))].sort((a, b) => a - b);
    for (const r of rounds) {
      events.push({ type: 'round_start', t: r * 100, round: r });
      for (const s of council.seats) {
        events.push({ type: 'seat_start', t: r * 100 + 10, round: r, seat: s.seat });
      }
      for (const c of council.cards.filter((x) => (x.round || 1) === r)) {
        const text =
          c.result.text ||
          c.result.argument ||
          `SEAT: ${c.seat}\nSTANCE: Yes\nOPTION SCORES: ${Object.entries(c.result.scores)
            .map(([k, v]) => `${k} ${v}/10`)
            .join(' · ')}\nPILLAR SCORE: ${c.result.pillar}/10\nCONFIDENCE: ${c.result.confidence ?? 8}/5\nTHE CALL: ${c.result.argument || 'Proceed with discipline.'}`;
        const parsed = c.result.parsed ?? parseCard(text, council.options.map((o) => o.id));
        events.push({
          type: 'seat_done',
          t: r * 100 + 50,
          round: r,
          seat: c.seat,
          text,
          parsed,
          quotes: c.result.quotes ?? [],
          name: SEATS_BY_KEY[c.seat]?.name || c.seat,
        });
      }
      events.push({ type: 'round_done', t: r * 100 + 90, round: r, scores: {} });
    }
    if (council.cruxes?.length) {
      events.push({ type: 'cruxes', t: 250, cruxes: council.cruxes, unanimous: false, note: '', pressure: {} });
    }
    if (council.draft) {
      events.push({ type: 'draft', t: 350, draft: council.draft });
    }
    if (council.verdict) {
      const vp = council.verdict.payload;
      // A live verdict shows only what the seats wrote: no placeholder text fills the gaps.
      const live = council.runMode === 'live';
      const scoreMap = Object.fromEntries(vp.scores.map((s) => [s.id, { score: s.score, math: s.formula }]));
      events.push({
        type: 'verdict',
        t: 500,
        verdict: {
          ...vp,
          recommended: vp.recommended || vp.topId,
          scores: scoreMap,
          why: vp.why ?? [],
          fights: vp.fights ?? [],
          minority: vp.minority ?? (live ? null : {
            seat: vp.objection?.by || '',
            quote: vp.objection?.text || '',
            would_have_to_be_true: 'The primary assumption fails under load.',
          }),
          amendments: vp.amendments ?? [],
          conditions: vp.conditions ?? [],
          next_steps: vp.next_steps ?? [],
          cheapest_test: vp.cheapest_test ?? (live ? '' : 'Run the verification check command on a clean worktree.'),
          kill_criteria: vp.kill_criteria ?? (live ? '' : 'Revert immediately if any regression check fails.'),
          revisit: vp.revisit ?? (live ? '' : 'After the first verified build completes.'),
          disclaimer: vp.disclaimer ?? (live ? 'Live council: every card was written by a seat agent session.' : COUNCIL_DISCLAIMER),
        },
        seats:
          vp.seats ??
          council.seats.map((s) => ({
            key: s.seat,
            weight: s.weight,
            stance: 'endorse',
            optionScores: council.cards.find((c) => c.seat === s.seat)?.result.scores ?? {},
            pillar: council.cards.find((c) => c.seat === s.seat)?.result.pillar ?? 8,
            oneLine: council.cards.find((c) => c.seat === s.seat)?.result.argument ?? s.question,
          })),
      });
    }
  }
  return {
    id: council.id,
    title: council.title || 'Council Session',
    prompt: council.decision || council.brief || '',
    mode: council.mode,
    status: council.status === 'running' ? 'running' : 'done',
    jobId: council.jobId,
    runMode: council.runMode ?? null,
    events,
  };
}

function deriveOptionsFromPrompt(prompt: string, customOptions?: T.CouncilOption[]): {
  title: string;
  decision: string;
  brief: string;
  options: T.CouncilOption[];
  assumptions: string[];
} {
  const clean = prompt.trim() || 'Should we execute the full architecture upgrade now or stage a minimal slice first?';
  const words = clean.replace(/[^\w\s-]/g, '').split(/\s+/).filter(Boolean);
  const title = words.slice(0, 6).join(' ') || 'Strategic Architecture Decision';
  const options: T.CouncilOption[] =
    customOptions && customOptions.length >= 2
      ? customOptions
      : [
          { id: 'A', label: `Execute the full outcome-led build now with verification gates (${title})` },
          { id: 'B', label: 'Ship a scoped 48-hour spike first to validate the core constraint before full build' },
          { id: 'C', label: 'Hold build spend and keep the current workflow until prerequisites are proven' },
        ];
  const assumptions = [
    'SQLite runtime store remains the single source of record for all state transitions.',
    'Every build task must be verified independently by a non-author verifier with runnable check commands.',
    'Time-to-interactive and reliability take priority over decorative scope.',
  ];
  return {
    title,
    decision: clean.split('\n')[0]?.slice(0, 160) || title,
    brief: clean,
    options,
    assumptions,
  };
}

function generateRound1Card(
  seat: CouncilRosterSeat,
  seatIndex: number,
  options: T.CouncilOption[],
  weight: number,
  reason: string,
  decision: string
): string {
  const fw = seat.frameworks[0] ?? { id: 'S001', name: 'Core Principle', quote: seat.question };
  const fw2 = seat.frameworks[1] ?? fw;
  // Create realistic divergence: seats 2 and 5 lean B (spike first); others lean A with conditions
  const leansB = seatIndex === 2 || seatIndex === 5;
  const scores: Record<string, number> = {};
  options.forEach((o, idx) => {
    if (idx === 0) scores[o.id] = leansB ? 6 : 8 + (seatIndex % 2);
    else if (idx === 1) scores[o.id] = leansB ? 8 : 6 + (seatIndex % 2);
    else scores[o.id] = 3 + (seatIndex % 2);
  });
  const optLine = options.map((o) => `${o.id} ${scores[o.id]}/10`).join(' · ');
  const stance = leansB ? 'Conditional yes' : seatIndex === 0 ? 'Strong yes' : 'Yes';
  const door = seatIndex % 3 === 0 ? 'one-way' : 'two-way';
  const ruin = seatIndex === 2 ? 'possible' : 'none';
  const recId = leansB ? (options[1]?.id ?? 'B') : (options[0]?.id ?? 'A');
  const recLabel = options.find((o) => o.id === recId)?.label ?? recId;

  return `SEAT: ${seat.short.toUpperCase()} (${seat.pillar})
STANCE: ${stance}
OPTION SCORES: ${optLine}
PILLAR SCORE: ${leansB ? 7 : 8}/10
CONFIDENCE: ${4 + (seatIndex % 2)}/5
RUIN RISK: ${ruin}
DOOR: ${door}

THE CALL: Take Option ${recId} (${recLabel.slice(0, 72)}), gated by an explicit verification check on "${decision.slice(0, 56)}".
WHY:
1. Applied ${fw.name}: "${fw.quote}" (${fw.id}) — weight ${weight}/3 because ${reason}.
2. Applied ${fw2.name}: "${fw2.quote}" (${fw2.id}) — avoids half-built state and keeps the user outcome front and center.
3. The gap between Option A and Option B comes down to whether we lock the verification contract before writing UI glue.
THE RISK I SEE: Shipping without an automated check command turns a two-way door into silent regression drift.
WHAT WOULD CHANGE MY MIND: A failing benchmark or proof that the current substrate cannot complete the loop in under 2 seconds.
WHAT I'D DO THIS WEEK: Lock the schema contract, wire the primary user path, and run the independent verifier gate.
QUESTION FOR THE FOUNDER: What is the single non-negotiable metric that proves this succeeded by Friday?`;
}

function generateRound2Card(
  seat: CouncilRosterSeat,
  seatIndex: number,
  allSeats: CouncilRosterSeat[],
  options: T.CouncilOption[],
  decision: string
): string {
  const fw = seat.frameworks[0] ?? { id: 'S001', name: 'Core Principle', quote: seat.question };
  // Target the seat across the table
  const targetIdx = (seatIndex + 2) % allSeats.length;
  const target = allSeats[targetIdx] ?? allSeats[0]!;
  const wasLeaningB = seatIndex === 2 || seatIndex === 5;
  const movedToA = seatIndex === 5;
  const leansBNow = seatIndex === 2;

  const scores: Record<string, number> = {};
  options.forEach((o, idx) => {
    if (idx === 0) scores[o.id] = leansBNow ? 7 : 8 + (seatIndex % 2);
    else if (idx === 1) scores[o.id] = leansBNow ? 8 : 6;
    else scores[o.id] = 3;
  });
  const optLine = options.map((o) => `${o.id} ${scores[o.id]}/10`).join(' · ');

  return `SEAT: ${seat.short.toUpperCase()}
I DISAGREE MOST WITH: ${target.short}. ${target.short} underestimates how fast ${seat.pillar.toLowerCase()} breaks if we split the workflow; under ${fw.name} (${fw.id}), we must keep the loop unified.
I CONCEDE: ${target.short} is right that un-gated scope is dangerous, so we must attach a hard check command to every task on "${decision.slice(0, 48)}".
ON THE CRUXES: 1. Full outcome-led build vs narrow spike: build the complete user-facing loop now, but enforce strict task gates. 2. Verification overhead: automated checks cost minutes and save days.
STANCE: ${leansBNow ? 'Conditional yes' : 'Yes'}
OPTION SCORES: ${optLine}
PILLAR SCORE: 8/10
CONFIDENCE: 4/5
RUIN RISK: none
MOVED: ${movedToA ? `yes, from B to A, because adding the mandatory check gate answers my downside concern` : wasLeaningB ? 'no' : 'no'}
MY CONDITIONS FOR YES: 1. Every task has an assignee and runnable checkCommand. 2. Independent verifier signs off before merge.`;
}

function generateRound3Card(
  seat: CouncilRosterSeat,
  seatIndex: number,
  options: T.CouncilOption[],
  draftOption: string
): string {
  const isMinority = seatIndex === 2;
  const isAmender = seatIndex === 1 || seatIndex === 4;
  const vote = isMinority ? 'Endorse with amendment' : isAmender ? 'Endorse with amendment' : 'Endorse';
  const scores: Record<string, number> = {};
  options.forEach((o) => {
    scores[o.id] = o.id === draftOption ? (isMinority ? 7 : 9) : 6;
  });
  const optLine = options.map((o) => `${o.id} ${scores[o.id]}/10`).join(' · ');
  const amendment =
    isMinority || isAmender
      ? `Require ${seat.short}'s gate (${seat.dimension.toLowerCase()}) to pass in CI before marking the job done.`
      : '';

  return `SEAT: ${seat.short.toUpperCase()}
VOTE: ${vote}
OPTION SCORES: ${optLine}
FINAL SCORE: ${isMinority ? 8 : 9}/10
FINAL PILLAR SCORE: ${isMinority ? 8 : 9}/10
AMENDMENT OR DISSENT: ${amendment}
ONE LINE FOR THE FOUNDER: ${seat.question}`;
}

export const SIMULATION_NOTICE =
  'SIMULATION: every card in this council was generated from templates with scripted scores; no agent was woken and nothing here is agent deliberation.';

/**
 * SIMULATION ONLY (gap audit C3). The agent-driven council lives in council/live.ts.
 * Starts or runs a full multi-round Roast-Room council (Setup -> Round 1 -> Cruxes -> Round 2 -> Draft -> Round 3 -> Verdict),
 * streaming every event over SSE and persisting cards + verdict into SQLite.
 */
export function startSimulatedCouncil(
  repo: Repo,
  jobId: string,
  input: T.RunCouncilInput
): { council: T.Council; sessionId: string } {
  let jobTitle = '';
  let jobBrief = '';
  try {
    const job = repo.getJob(jobId);
    jobTitle = job.title;
    jobBrief = job.brief;
  } catch {
    // fallback if job lookup fails
  }

  const prompt = (input.prompt?.trim() || `${jobTitle}\n\n${jobBrief}`.trim() || 'Evaluate the proposed architecture and execution plan.').trim();
  const mode: 'quick' | 'full' = input.mode === 'quick' ? 'quick' : 'full';
  const boardGroup = input.boardGroup === 'operators' ? 'operators' : 'myaos';
  const defaultKeys = boardGroup === 'operators' ? DEFAULT_OPERATOR_BOARD : DEFAULT_MYAOS_BOARD;
  const requestedKeys = (input.seats ?? defaultKeys).filter((k) => Boolean(SEATS_BY_KEY[k]));
  const seatKeys = (requestedKeys.length ? requestedKeys : defaultKeys).slice(0, mode === 'quick' ? 4 : 7);

  const setupInfo = deriveOptionsFromPrompt(prompt, input.options);
  const existingIdentities = new Set(repo.listIdentities(true).map((i) => i.id));

  const councilSeats: T.CouncilSeat[] = seatKeys.map((k, idx) => {
    const s = SEATS_BY_KEY[k]!;
    const weight = idx < 2 ? 3 : idx < 5 ? 2 : 1;
    const identityId = s.identityId && existingIdentities.has(s.identityId) ? s.identityId : null;
    return {
      seat: s.key,
      question: s.question,
      weight,
      reason: `${s.pillar}: ${s.dimension}`,
      identityId,
    };
  });

  const council = repo.createCouncil(jobId, {
    mode,
    title: setupInfo.title,
    decision: setupInfo.decision,
    brief: setupInfo.brief,
    assumptions: setupInfo.assumptions,
    options: setupInfo.options,
    seats: councilSeats,
    runMode: 'simulation',
  });

  const stream: ActiveCouncilStream = {
    councilId: council.id,
    jobId,
    status: 'running',
    started: Date.now(),
    events: [],
    subs: new Set(),
  };
  activeStreams.set(council.id, stream);

  const emit = (type: string, data: Record<string, unknown> = {}) => {
    const ev: T.CouncilStreamEvent = { type, t: Date.now() - stream.started, ...data };
    if (type !== 'delta') {
      stream.events.push(ev);
      repo.appendCouncilEvent(council.id, ev);
    }
    const line = `data: ${JSON.stringify(ev)}\n\n`;
    for (const res of stream.subs) {
      if (!res.destroyed) res.write(line);
    }
  };

  void (async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      const weights = Object.fromEntries(
        councilSeats.map((s) => [s.seat, { weight: s.weight, reason: s.reason || s.question }])
      );

      emit('phase', { phase: 'setup', label: 'The Chair is reading your question' });
      await sleep(80);
      emit('setup', {
        title: setupInfo.title,
        decision: setupInfo.decision,
        brief: setupInfo.brief,
        options: setupInfo.options,
        assumptions: setupInfo.assumptions,
        weights,
        seats: seatKeys,
        mode,
        runMode: 'simulation',
        simulationNotice: SIMULATION_NOTICE,
      });

      const st = {
        title: setupInfo.title,
        decision: setupInfo.decision,
        brief: setupInfo.brief,
        mode,
        options: setupInfo.options,
        assumptions: setupInfo.assumptions,
        weights,
        seats: seatKeys,
        rounds: [] as number[],
        cards: { 1: {}, 2: {}, 3: {} } as Record<number, Record<string, { text: string; parsed: any; quotes: any[] }>>,
        scores: {} as Record<number, Record<string, { score: number | null; math: string }>>,
      };

      const rosterSeats = seatKeys.map((k) => SEATS_BY_KEY[k]!);

      // ---- ROUND 1 ----
      emit('phase', { phase: 'round1', label: 'Round 1: opening positions' });
      st.rounds.push(1);
      emit('round_start', { round: 1 });
      for (const k of seatKeys) emit('seat_start', { round: 1, seat: k });

      for (let i = 0; i < rosterSeats.length; i++) {
        await sleep(90);
        const s = rosterSeats[i]!;
        const w = weights[s.key]!;
        const text = generateRound1Card(s, i, setupInfo.options, w.weight, w.reason, setupInfo.decision);
        const parsed = parseCard(text, setupInfo.options.map((o) => o.id));
        const quotes = checkQuotes(s.key, text);
        st.cards[1][s.key] = { text, parsed, quotes };
        const ruinMap: Record<string, T.Ruin> = {};
        for (const o of setupInfo.options) {
          ruinMap[o.id] = (parsed.ruin === 'likely' || parsed.ruin === 'possible' ? parsed.ruin : 'none') as T.Ruin;
        }
        repo.addCouncilCard(council.id, {
          round: 1,
          seat: s.key,
          scores: parsed.optionScores,
          pillar: parsed.pillar ?? 8,
          confidence: parsed.confidence ?? 4,
          ruin: ruinMap,
          reversible: parsed.door !== 'one-way',
          argument: parsed.call || parsed.stance,
          text,
          parsed,
          quotes,
          simulated: true,
        });
        emit('seat_done', { round: 1, seat: s.key, text, parsed, quotes, name: s.name });
      }
      st.scores[1] = computeRoundOptionScores(st, 1);
      emit('round_done', { round: 1, scores: st.scores[1] });

      // ---- CRUXES ----
      await sleep(80);
      emit('phase', { phase: 'cruxes', label: 'The Chair is finding the fault lines' });
      const optA = setupInfo.options[0]?.id ?? 'A';
      const optB = setupInfo.options[1]?.id ?? 'B';
      const sideASeats = seatKeys.filter((_, i) => i !== 2 && i !== 5);
      const sideBSeats = seatKeys.filter((_, i) => i === 2 || i === 5);
      const cruxes: T.CouncilCrux[] = [
        {
          question: `Execute the full Option ${optA} build now, or gate behind Option ${optB}'s validation spike first?`,
          sides: [
            { position: `Build Option ${optA} now with hard check gates`, seats: sideASeats },
            { position: `Prove the constraint with Option ${optB} first`, seats: sideBSeats.length ? sideBSeats : [seatKeys.at(-1)!] },
          ],
        },
        {
          question: 'How strict should the independent verification gate be before advancing to build?',
          sides: [
            { position: 'Mandatory automated checkCommand on every task', seats: seatKeys.slice(0, Math.ceil(seatKeys.length / 2)) },
            { position: 'Keep tasks lightweight so velocity stays high', seats: seatKeys.slice(Math.ceil(seatKeys.length / 2)) },
          ],
        },
      ];
      repo.updateCouncilState(council.id, { cruxes });
      emit('cruxes', {
        cruxes,
        unanimous: false,
        note: `The room splits on whether to execute Option ${optA} immediately with strict verification gates or stage Option ${optB} first.`,
        pressure: {},
      });

      // ---- ROUND 2 ----
      await sleep(80);
      emit('phase', { phase: 'round2', label: 'Round 2: the debate' });
      st.rounds.push(2);
      emit('round_start', { round: 2 });
      for (const k of seatKeys) emit('seat_start', { round: 2, seat: k });

      for (let i = 0; i < rosterSeats.length; i++) {
        await sleep(90);
        const s = rosterSeats[i]!;
        const text = generateRound2Card(s, i, rosterSeats, setupInfo.options, setupInfo.decision);
        const parsed = parseCard(text, setupInfo.options.map((o) => o.id));
        const quotes = checkQuotes(s.key, text);
        st.cards[2][s.key] = { text, parsed, quotes };
        const ruinMap: Record<string, T.Ruin> = {};
        for (const o of setupInfo.options) ruinMap[o.id] = 'none';
        repo.addCouncilCard(council.id, {
          round: 2,
          seat: s.key,
          scores: parsed.optionScores,
          pillar: parsed.pillar ?? 8,
          confidence: parsed.confidence ?? 4,
          ruin: ruinMap,
          reversible: true,
          argument: parsed.disagreeLine || parsed.stance,
          text,
          parsed,
          quotes,
          simulated: true,
        });
        emit('seat_done', { round: 2, seat: s.key, text, parsed, quotes, name: s.name });
      }
      st.scores[2] = computeRoundOptionScores(st, 2);
      emit('round_done', { round: 2, scores: st.scores[2] });

      // ---- DRAFT RESOLUTION & ROUND 3 ----
      const topOpt =
        Object.entries(st.scores[2]).sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0))[0]?.[0] ?? optA;
      const draft: T.CouncilDraft = {
        option: topOpt,
        label: 'GO WITH CONDITIONS',
        recommendation: `Proceed with Option ${topOpt} (${setupInfo.options.find((o) => o.id === topOpt)?.label ?? topOpt}), provided every task carries an explicit verification check command and independent verifier sign-off.`,
        conditions: [
          'Every build task includes a runnable checkCommand and named coworker assignee.',
          'Independent verifier (Kael) validates evidence before transitioning to approve/done.',
          'Keep SQLite runtime.db as the single substrate of truth with zero hardcoded status badges.',
        ],
        next_steps: [
          'This week: Lock the schema & API contract and run the runtime test suite.',
          'Within 48 hours: Complete the primary UI and state flow with typecheck passing.',
          'Before merge: Run independent verification across all acceptance criteria.',
        ],
        cheapest_test: 'Run `npm test && npx tsc --noEmit` in runtime/ and `npm run typecheck` in apps/desktop/.',
        kill_criteria: 'Halt and drop to Option B if typecheck or verification gates fail after two iterations.',
      };

      if (mode === 'full') {
        await sleep(80);
        emit('phase', { phase: 'draft', label: 'The Chair is drafting a resolution' });
        repo.updateCouncilState(council.id, { draft });
        emit('draft', { draft });

        await sleep(80);
        emit('phase', { phase: 'round3', label: 'Round 3: the vote' });
        st.rounds.push(3);
        emit('round_start', { round: 3 });
        for (const k of seatKeys) emit('seat_start', { round: 3, seat: k });

        for (let i = 0; i < rosterSeats.length; i++) {
          await sleep(80);
          const s = rosterSeats[i]!;
          const text = generateRound3Card(s, i, setupInfo.options, topOpt);
          const parsed = parseCard(text, setupInfo.options.map((o) => o.id));
          const quotes = checkQuotes(s.key, text);
          st.cards[3][s.key] = { text, parsed, quotes };
          const ruinMap: Record<string, T.Ruin> = {};
          for (const o of setupInfo.options) ruinMap[o.id] = 'none';
          repo.addCouncilCard(council.id, {
            round: 3,
            seat: s.key,
            scores: parsed.optionScores,
            pillar: parsed.pillar ?? 9,
            confidence: 5,
            ruin: ruinMap,
            reversible: true,
            argument: parsed.oneLine || parsed.vote,
            text,
            parsed,
            quotes,
            simulated: true,
          });
          emit('seat_done', { round: 3, seat: s.key, text, parsed, quotes, name: s.name });
        }
        st.scores[3] = computeRoundOptionScores(st, 3);
        emit('round_done', { round: 3, scores: st.scores[3] });
      } else {
        emit('phase', { phase: 'skip3', label: 'Quick mode: the vote round is skipped' });
      }

      // ---- VERDICT ----
      await sleep(80);
      emit('phase', { phase: 'verdict', label: 'The Chair is writing the verdict' });
      const { last, finalScores, recommended, spreadF, confidence, support, votes } = computeFinalNumbers(st);
      const seatSummaries = buildVerdictSeats(st, last);
      const recommendedOptionLabel = setupInfo.options.find((o) => o.id === recommended)?.label ?? recommended;

      const defaultTasks: T.CreateTaskInput[] = [
        {
          title: `Implement core architecture & runtime contract for ${setupInfo.title}`,
          assigneeId: existingIdentities.has('daedalus') ? 'daedalus' : existingIdentities.has('atlas') ? 'atlas' : null,
          checkCommand: 'cd runtime && npm test && npx tsc --noEmit',
          gate: 'Runtime tests and typecheck pass with zero errors',
          mode: 'build',
        },
        {
          title: `Build and wire Desktop UI experience for ${setupInfo.title}`,
          assigneeId: existingIdentities.has('atlas') ? 'atlas' : null,
          checkCommand: 'cd apps/desktop && npm run typecheck',
          gate: 'Desktop typecheck and build succeed cleanly',
          mode: 'build',
        },
        {
          title: `Independent verification of ${setupInfo.title} against acceptance criteria`,
          assigneeId: existingIdentities.has('kael') ? 'kael' : null,
          checkCommand: 'cd runtime && npm test',
          gate: 'Independent verifier sign-off recorded in evidence table',
          mode: 'verify',
        },
      ];

      const richVerdict: Partial<T.CouncilResult> = {
        label: (finalScores[recommended]?.score ?? 7.5) >= 7.5 ? 'GO WITH CONDITIONS' : 'GO WITH CONDITIONS',
        call: `Take Option ${recommended} (${recommendedOptionLabel}). Execute with explicit task check commands and independent verification before merge.`,
        recommended,
        topId: recommended,
        spread: spreadF,
        confidence,
        support: support ?? finalScores[recommended]?.score ?? 8,
        override_note: '',
        why: rosterSeats.slice(0, 4).map((s) => ({
          point: `${s.pillar}: ${s.question}`,
          seat: s.short,
          framework: s.frameworks[0]?.name || s.dimension,
        })),
        fights: cruxes.map((c) => ({
          crux: c.question,
          story: `${c.sides.map((sd) => `${sd.position} (${sd.seats.map((k) => SEATS_BY_KEY[k]?.short || k).join(', ')})`).join(' vs. ')}. Resolved by attaching mandatory verification gates to Option ${recommended}.`,
        })),
        minority: {
          seat: rosterSeats[2]?.short || rosterSeats.at(-1)?.short || 'Kael',
          quote: `Do not mark Option ${recommended} done until an independent verifier runs the check command on a clean worktree.`,
          would_have_to_be_true: 'Skipping automated verification would let subtle regressions slip into main.',
        },
        amendments: rosterSeats.slice(1, 4).map((s, idx) => ({
          seat: s.short,
          amendment: `Enforce ${s.dimension.toLowerCase()} check gate before closing the job.`,
          adopted: idx < 2,
          reason: idx < 2 ? 'Adopted into the task verification gates.' : 'Tracked as a post-build review item.',
        })),
        conditions: draft.conditions,
        next_steps: [
          { when: 'Immediate (Step 1)', action: defaultTasks[0]!.title },
          { when: 'Next (Step 2)', action: defaultTasks[1]!.title },
          { when: 'Before Merge (Step 3)', action: defaultTasks[2]!.title },
        ],
        cheapest_test: draft.cheapest_test,
        kill_criteria: draft.kill_criteria,
        revisit: 'Upon completion of the verification gate or if any task check fails twice.',
        votes,
        seats: seatSummaries,
        disclaimer: `${SIMULATION_NOTICE} ${COUNCIL_DISCLAIMER}`,
        tasks: defaultTasks,
        runMode: 'simulation',
      };

      const savedVerdict = repo.createVerdict(council.id, richVerdict);
      emit('verdict', {
        verdict: {
          ...savedVerdict.payload,
          recommended,
          scores: finalScores,
          spread: spreadF,
          confidence,
          support: savedVerdict.support,
          votes,
          disclaimer: `${SIMULATION_NOTICE} ${COUNCIL_DISCLAIMER}`,
          runMode: 'simulation',
        },
        seats: seatSummaries,
      });

      stream.status = 'done';
      for (const res of stream.subs) {
        if (!res.destroyed) res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
      }
      stream.subs.clear();
    } catch (e) {
      stream.status = 'error';
      emit('error', { error: String((e as Error)?.message || e) });
      for (const res of stream.subs) {
        if (!res.destroyed) res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
      }
      stream.subs.clear();
    }
  })();

  return { council: repo.getCouncil(council.id), sessionId: council.id };
}
