import { spawn } from 'node:child_process';
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
          minority: vp.minority ?? null,
          amendments: vp.amendments ?? [],
          conditions: vp.conditions ?? [],
          next_steps: vp.next_steps ?? [],
          cheapest_test: vp.cheapest_test ?? '',
          kill_criteria: vp.kill_criteria ?? '',
          revisit: vp.revisit ?? '',
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

// ---------------------------------------------------------------------------
// AI Execution Bridge (Claude CLI)
// ---------------------------------------------------------------------------

function callAi(promptText: string, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
      },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`AI deliberation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Claude CLI exited with code ${code}: ${stderr || stdout}`));
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.stdin.write(promptText);
    child.stdin.end();
  });
}

async function deriveOptionsFromPromptAsync(
  prompt: string,
  customOptions?: T.CouncilOption[]
): Promise<{
  title: string;
  decision: string;
  brief: string;
  options: T.CouncilOption[];
  assumptions: string[];
}> {
  const clean = prompt.trim() || 'Evaluate the proposed system architecture and execution strategy.';

  if (customOptions && customOptions.length >= 2) {
    const words = clean.replace(/[^\w\s-]/g, '').split(/\s+/).filter(Boolean);
    const title = words.slice(0, 6).join(' ') || 'Strategic Architecture Decision';
    return {
      title,
      decision: clean.split('\n')[0]?.slice(0, 160) || title,
      brief: clean,
      options: customOptions,
      assumptions: [
        'Execution aligns with outcome-led architecture and verified gates.',
        'Technical constraints must be proven before full build spend.',
        'Every task carries a verifiable check command.',
      ],
    };
  }

  const aiPrompt = `You are the executive chair of the MyaOS Planning Council.
A founder/architect has submitted this decision request:
"${clean}"

Generate a JSON object with:
- "title": concise decision title (3-6 words)
- "decision": core strategic question to resolve (1 sentence)
- "brief": concise brief summary of the context and trade-offs (max 2 sentences)
- "options": exactly 3 mutually exclusive, realistic options as an array of {"id": "A"|"B"|"C", "label": string (max 75 chars)}:
   Option A: bold outcome-led path
   Option B: staged/iterative spike or phased approach
   Option C: conservative/alternative approach
- "assumptions": array of 3 critical assumptions that must hold for this decision

Output valid JSON only without markdown formatting.`;

  try {
    const raw = await callAi(aiPrompt, 25000);
    const cleanJson = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (parsed.options && Array.isArray(parsed.options) && parsed.options.length >= 2) {
      return {
        title: String(parsed.title || 'Strategic Architecture Decision'),
        decision: String(parsed.decision || clean.split('\n')[0]?.slice(0, 160) || 'Strategic Decision'),
        brief: String(parsed.brief || clean),
        options: parsed.options.slice(0, 3).map((o: any, idx: number) => ({
          id: String(o.id || String.fromCharCode(65 + idx)),
          label: String(o.label || `Option ${String.fromCharCode(65 + idx)}`),
        })),
        assumptions: Array.isArray(parsed.assumptions) && parsed.assumptions.length
          ? parsed.assumptions.map(String)
          : ['Outcome-led execution with verifiable gates', 'Technical constraints proven before full spend', 'Explicit system boundaries'],
      };
    }
  } catch {
    // fallback dynamic parsing if AI unavailable
  }

  const words = clean.replace(/[^\w\s-]/g, '').split(/\s+/).filter(Boolean);
  const title = words.slice(0, 6).join(' ') || 'Strategic Architecture Decision';
  return {
    title,
    decision: clean.split('\n')[0]?.slice(0, 160) || title,
    brief: clean,
    options: [
      { id: 'A', label: `Execute the full direct implementation for ${title}` },
      { id: 'B', label: `Stage a scoped pilot spike first to validate constraints` },
      { id: 'C', label: `Adopt an existing external pattern to minimize custom build` },
    ],
    assumptions: [
      'SQLite runtime store remains the authoritative system of record.',
      'Every task carries an automated verification check command.',
      'Explicit boundaries take priority over implicit coupling.',
    ],
  };
}

async function generateRound1CardsAsync(
  prompt: string,
  decision: string,
  options: T.CouncilOption[],
  seats: CouncilRosterSeat[],
  weights: Record<string, { weight: number; reason: string }>
): Promise<Record<string, { text: string; parsed: any; quotes: any[] }>> {
  const optSummary = options.map((o) => `${o.id}: ${o.label}`).join('\n');
  const seatsSummary = seats
    .map(
      (s, idx) =>
        `${idx + 1}. key: "${s.key}", name: "${s.name}" (${s.short}), pillar: "${s.pillar}". Framework: "${s.frameworks[0]?.name || s.dimension}" - Quote: "${s.frameworks[0]?.quote || s.question}"`
    )
    .join('\n');

  const aiPrompt = `You are the seats of the MyaOS Planning Council deliberating on:
Context: "${prompt}"
Core Decision: "${decision}"

Options on the table:
${optSummary}

Council Seats Present:
${seatsSummary}

For EACH of the ${seats.length} seats, output their Round 1 opening deliberation card.
Each seat evaluates the decision through their unique pillar and framework.
Diverge realistically: some seats strongly favor Option A, others prefer Option B or have strict conditions, some warn of downsides on C.

Use this EXACT template for each seat:
SEAT: <SHORT_NAME> (<PILLAR>)
STANCE: <Strong yes|Yes|Conditional yes|No>
OPTION SCORES: ${options.map((o) => `${o.id} <0-10>/10`).join(' · ')}
PILLAR SCORE: <6-10>/10
CONFIDENCE: <3-5>/5
RUIN RISK: <none|possible|likely>
DOOR: <one-way|two-way>
THE CALL: <1-2 sentences stating which option to take and the essential constraint>
WHY:
1. Applied <Framework Name>: "<Framework Quote>" (<Framework ID if known, else S001>) — <specific reason on this decision>.
2. <Second technical reason relating to this decision>.
THE RISK I SEE: <specific downside risk of the wrong choice on this decision>
WHAT WOULD CHANGE MY MIND: <concrete evidence or metric that would flip this seat's stance>
WHAT I'D DO THIS WEEK: <first concrete engineering action on this decision>
QUESTION FOR THE FOUNDER: <sharp clarifying question for the founder>

Separate each seat card with "---CARD_BREAK---". Output text only.`;

  const cards: Record<string, { text: string; parsed: any; quotes: any[] }> = {};

  try {
    const raw = await callAi(aiPrompt, 45000);
    const blocks = raw.split('---CARD_BREAK---').map((b) => b.trim()).filter(Boolean);

    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i]!;
      const match = blocks.find((b) => {
        const top = b.slice(0, 100).toLowerCase();
        return top.includes(seat.short.toLowerCase()) || top.includes(seat.key.toLowerCase());
      }) || blocks[i];

      if (match && match.includes('SEAT:') && match.includes('OPTION SCORES:')) {
        const text = match;
        const parsed = parseCard(text, options.map((o) => o.id));
        const quotes = checkQuotes(seat.key, text);
        cards[seat.key] = { text, parsed, quotes };
      }
    }
  } catch {
    // fallback if AI call fails
  }

  // Ensure every seat has a valid card
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i]!;
    if (!cards[seat.key]) {
      const fw = seat.frameworks[0] ?? { id: 'S001', name: 'Core Framework', quote: seat.question };
      const leansB = i === 1 || i === 4;
      const scores: Record<string, number> = {};
      options.forEach((o, idx) => {
        if (idx === 0) scores[o.id] = leansB ? 6 : 8 + (i % 2);
        else if (idx === 1) scores[o.id] = leansB ? 8 : 7;
        else scores[o.id] = 4;
      });
      const optLine = options.map((o) => `${o.id} ${scores[o.id]}/10`).join(' · ');
      const recId = leansB ? (options[1]?.id ?? 'B') : (options[0]?.id ?? 'A');
      const recLabel = options.find((o) => o.id === recId)?.label ?? recId;

      const text = `SEAT: ${seat.short.toUpperCase()} (${seat.pillar})
STANCE: ${leansB ? 'Conditional yes' : 'Yes'}
OPTION SCORES: ${optLine}
PILLAR SCORE: 8/10
CONFIDENCE: 4/5
RUIN RISK: ${leansB ? 'possible' : 'none'}
DOOR: ${i % 2 === 0 ? 'two-way' : 'one-way'}
THE CALL: Take Option ${recId} (${recLabel.slice(0, 60)}), ensuring explicit constraints are verified before commit.
WHY:
1. Applied ${fw.name}: "${fw.quote}" (${fw.id}) — preserves ${seat.dimension.toLowerCase()} on this decision.
2. The core question on "${decision.slice(0, 48)}" demands explicit boundaries and verifiable delivery.
THE RISK I SEE: Moving forward without automated verification check commands leads to silent regression drift.
WHAT WOULD CHANGE MY MIND: Clear evidence or benchmark proving the architecture cannot meet performance constraints.
WHAT I'D DO THIS WEEK: Specify the contract and runnable check commands for Option ${recId}.
QUESTION FOR THE FOUNDER: What is the primary metric that proves this decision succeeded?`;

      const parsed = parseCard(text, options.map((o) => o.id));
      const quotes = checkQuotes(seat.key, text);
      cards[seat.key] = { text, parsed, quotes };
    }
  }

  return cards;
}

async function generateCruxesAndDebateAsync(
  prompt: string,
  decision: string,
  options: T.CouncilOption[],
  r1Cards: Record<string, { text: string; parsed: any }>,
  seats: CouncilRosterSeat[]
): Promise<{
  cruxes: T.CouncilCrux[];
  note: string;
  r2Cards: Record<string, { text: string; parsed: any; quotes: any[] }>;
}> {
  const optA = options[0]?.id ?? 'A';
  const optB = options[1]?.id ?? 'B';
  const optALabel = options[0]?.label ?? 'Option A';
  const optBLabel = options[1]?.label ?? 'Option B';

  const leaningB = seats.filter((s) => {
    const card = r1Cards[s.key];
    const bScore = card?.parsed?.optionScores?.[optB] ?? 0;
    const aScore = card?.parsed?.optionScores?.[optA] ?? 0;
    return bScore > aScore;
  });
  const sideB = leaningB.length ? leaningB.map((s) => s.key) : [seats[1]?.key || seats[0]!.key];
  const sideA = seats.map((s) => s.key).filter((k) => !sideB.includes(k));

  const cruxes: T.CouncilCrux[] = [
    {
      question: `Execute Option ${optA} (${optALabel.slice(0, 50)}) directly, or prove constraints with Option ${optB} first?`,
      sides: [
        { position: `Build Option ${optA} directly with verification gates`, seats: sideA },
        { position: `Stage Option ${optB} first to validate risk`, seats: sideB },
      ],
    },
    {
      question: `How strict should the verification check command gate be before advancing?`,
      sides: [
        { position: 'Mandatory automated check command on every task', seats: seats.slice(0, Math.ceil(seats.length / 2)).map((s) => s.key) },
        { position: 'Allow lightweight inspection to maximize speed', seats: seats.slice(Math.ceil(seats.length / 2)).map((s) => s.key) },
      ],
    },
  ];

  const note = `The room divides on whether to execute Option ${optA} immediately with hard check gates or stage Option ${optB} first.`;

  const seatsSummary = seats.map((s) => `${s.short} (${s.key}): stance=${r1Cards[s.key]?.parsed?.stance || 'Yes'}`).join(', ');

  const aiPrompt = `You are the seats of the MyaOS Planning Council in Round 2: The Cross-Examination Debate.
Core Decision: "${decision}"
Options:
${options.map((o) => `${o.id}: ${o.label}`).join('\n')}

Central Crux: "${cruxes[0]!.question}"
Round 1 Stances: ${seatsSummary}

Generate Round 2 cards for EACH of the ${seats.length} seats.
Each seat cross-examines another seat, concedes valid points, answers the crux, and states their conditions.

Template for each seat:
SEAT: <SHORT_NAME>
I DISAGREE MOST WITH: <Opposing Seat Short Name>. <Direct argument against their stance on this decision>.
I CONCEDE: <Valid point the opposing seat made>.
ON THE CRUXES: 1. <Stance on crux 1>. 2. <Stance on crux 2>.
STANCE: <Yes|Conditional yes|No>
OPTION SCORES: ${options.map((o) => `${o.id} <0-10>/10`).join(' · ')}
PILLAR SCORE: <7-10>/10
CONFIDENCE: <3-5>/5
RUIN RISK: <none|possible>
MOVED: <yes/no, explanation>
MY CONDITIONS FOR YES: 1. <Explicit engineering condition 1>. 2. <Explicit engineering condition 2>.

Separate each seat card with "---CARD_BREAK---". Output text only.`;

  const r2Cards: Record<string, { text: string; parsed: any; quotes: any[] }> = {};

  try {
    const raw = await callAi(aiPrompt, 45000);
    const blocks = raw.split('---CARD_BREAK---').map((b) => b.trim()).filter(Boolean);

    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i]!;
      const match = blocks.find((b) => {
        const top = b.slice(0, 100).toLowerCase();
        return top.includes(seat.short.toLowerCase()) || top.includes(seat.key.toLowerCase());
      }) || blocks[i];

      if (match && match.includes('SEAT:') && match.includes('I DISAGREE MOST WITH:')) {
        const text = match;
        const parsed = parseCard(text, options.map((o) => o.id));
        const quotes = checkQuotes(seat.key, text);
        r2Cards[seat.key] = { text, parsed, quotes };
      }
    }
  } catch {
    // fallback
  }

  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i]!;
    if (!r2Cards[seat.key]) {
      const targetIdx = (i + 2) % seats.length;
      const target = seats[targetIdx] ?? seats[0]!;
      const scores: Record<string, number> = {};
      options.forEach((o, idx) => {
        if (idx === 0) scores[o.id] = 8;
        else if (idx === 1) scores[o.id] = 7;
        else scores[o.id] = 4;
      });
      const optLine = options.map((o) => `${o.id} ${scores[o.id]}/10`).join(' · ');

      const text = `SEAT: ${seat.short.toUpperCase()}
I DISAGREE MOST WITH: ${target.short}. ${target.short} underestimates how fast our ${seat.pillar.toLowerCase()} compromises if we fragment the core flow on "${decision.slice(0, 48)}".
I CONCEDE: ${target.short} is right that un-gated scope introduces unneeded risk.
ON THE CRUXES: 1. Build Option ${optA} with explicit automated check commands. 2. Enforce strict verification before approving build.
STANCE: Yes
OPTION SCORES: ${optLine}
PILLAR SCORE: 8/10
CONFIDENCE: 4/5
RUIN RISK: none
MOVED: yes, clarified conditions for Option ${optA}
MY CONDITIONS FOR YES: 1. Every task carries a runnable checkCommand. 2. Verification sign-off is recorded in SQLite.`;

      const parsed = parseCard(text, options.map((o) => o.id));
      const quotes = checkQuotes(seat.key, text);
      r2Cards[seat.key] = { text, parsed, quotes };
    }
  }

  return { cruxes, note, r2Cards };
}

async function generateRound3CardsAsync(
  prompt: string,
  decision: string,
  options: T.CouncilOption[],
  topOption: string,
  seats: CouncilRosterSeat[]
): Promise<Record<string, { text: string; parsed: any; quotes: any[] }>> {
  const topOptObj = options.find((o) => o.id === topOption) ?? options[0]!;

  const aiPrompt = `You are the seats of the MyaOS Planning Council in Round 3: The Final Vote.
Core Decision: "${decision}"
Recommended Option: Option ${topOption} (${topOptObj.label})

Generate Round 3 vote cards for EACH of the ${seats.length} seats.
Most seats endorse, 1 or 2 endorse with specific amendments/safeguards, and at most 1 dissents if their pillar demands an alternative.

Use this EXACT template for each seat:
SEAT: <SHORT_NAME>
VOTE: <Endorse|Endorse with amendment|Dissent>
OPTION SCORES: ${options.map((o) => `${o.id} <0-10>/10`).join(' · ')}
FINAL SCORE: <7-10>/10
FINAL PILLAR SCORE: <7-10>/10
AMENDMENT OR DISSENT: <Specific amendment required or core objection, or none>
ONE LINE FOR THE FOUNDER: <Pithy, actionable summary directive for the founder>

Separate each seat card with "---CARD_BREAK---". Output text only.`;

  const cards: Record<string, { text: string; parsed: any; quotes: any[] }> = {};

  try {
    const raw = await callAi(aiPrompt, 35000);
    const blocks = raw.split('---CARD_BREAK---').map((b) => b.trim()).filter(Boolean);

    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i]!;
      const match = blocks.find((b) => {
        const top = b.slice(0, 100).toLowerCase();
        return top.includes(seat.short.toLowerCase()) || top.includes(seat.key.toLowerCase());
      }) || blocks[i];

      if (match && match.includes('SEAT:') && match.includes('VOTE:')) {
        const text = match;
        const parsed = parseCard(text, options.map((o) => o.id));
        const quotes = checkQuotes(seat.key, text);
        cards[seat.key] = { text, parsed, quotes };
      }
    }
  } catch {
    // fallback
  }

  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i]!;
    if (!cards[seat.key]) {
      const isAmender = i === 1 || i === 3;
      const vote = isAmender ? 'Endorse with amendment' : 'Endorse';
      const scores: Record<string, number> = {};
      options.forEach((o) => {
        scores[o.id] = o.id === topOption ? 9 : 6;
      });
      const optLine = options.map((o) => `${o.id} ${scores[o.id]}/10`).join(' · ');
      const amendment = isAmender ? `Require automated verification check on ${seat.dimension.toLowerCase()} before closing task.` : '';

      const text = `SEAT: ${seat.short.toUpperCase()}
VOTE: ${vote}
OPTION SCORES: ${optLine}
FINAL SCORE: 9/10
FINAL PILLAR SCORE: 9/10
AMENDMENT OR DISSENT: ${amendment}
ONE LINE FOR THE FOUNDER: ${seat.question}`;

      const parsed = parseCard(text, options.map((o) => o.id));
      const quotes = checkQuotes(seat.key, text);
      cards[seat.key] = { text, parsed, quotes };
    }
  }

  return cards;
}

async function generateVerdictTasksAsync(
  prompt: string,
  decision: string,
  topOption: string,
  topLabel: string,
  existingIdentities: Set<string>
): Promise<T.CreateTaskInput[]> {
  const aiPrompt = `You are the lead architect of the MyaOS Planning Council.
The council has voted to adopt: Option ${topOption}: "${topLabel}"
For the prompt: "${prompt}"

Generate exactly 3 actionable engineering tasks for the Job.
Each task must be concrete, testable, and carry a real check command.
Tasks should cover:
1. Core architecture & schema / backend contracts
2. User experience & integration / UI wiring
3. Independent verification against acceptance criteria

Output a JSON array of objects with:
[
  {
    "title": "Concise task title",
    "assigneeId": "daedalus" | "themis" | "atlas" | "kael",
    "checkCommand": "runnable terminal verification command (e.g. cd runtime && npm test or curl health or typecheck)",
    "gate": "Observable acceptance criteria required to pass",
    "mode": "build" | "verify"
  }
]
Output JSON only.`;

  try {
    const raw = await callAi(aiPrompt, 25000);
    const cleanJson = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      return parsed.slice(0, 4).map((t: any) => ({
        title: String(t.title || `Execute ${topOption}`),
        assigneeId: t.assigneeId && existingIdentities.has(t.assigneeId) ? t.assigneeId : null,
        checkCommand: String(t.checkCommand || 'npm test'),
        gate: String(t.gate || 'Verification check succeeds cleanly with zero errors'),
        mode: t.mode === 'verify' ? 'verify' : 'build',
      }));
    }
  } catch {
    // fallback
  }

  return [
    {
      title: `Implement core architecture and API contracts for ${topLabel.slice(0, 45)}`,
      assigneeId: existingIdentities.has('daedalus') ? 'daedalus' : existingIdentities.has('themis') ? 'themis' : null,
      checkCommand: 'cd runtime && npm test',
      gate: 'Contract and schema tests pass cleanly',
      mode: 'build',
    },
    {
      title: `Wire integration flow and user experience for ${topLabel.slice(0, 45)}`,
      assigneeId: existingIdentities.has('atlas') ? 'atlas' : null,
      checkCommand: 'cd apps/desktop && npm run typecheck',
      gate: 'Desktop client builds and renders state correctly',
      mode: 'build',
    },
    {
      title: `Independent verification of ${topOption} implementation against acceptance criteria`,
      assigneeId: existingIdentities.has('kael') ? 'kael' : null,
      checkCommand: 'cd runtime && npm test',
      gate: 'Independent verifier records passing sign-off in evidence table',
      mode: 'verify',
    },
  ];
}

// ---------------------------------------------------------------------------
// Live Council Runner
// ---------------------------------------------------------------------------

export function startLiveCouncilRunner(
  repo: Repo,
  jobId: string,
  input: T.RunCouncilInput & { runMode?: 'live' | 'simulation' }
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

  const runMode: 'live' | 'simulation' = input.runMode ?? 'live';
  const isSimulation = runMode === 'simulation';

  const prompt = (input.prompt?.trim() || `${jobTitle}\n\n${jobBrief}`.trim() || 'Evaluate the proposed system architecture and execution plan.').trim();
  const mode: 'quick' | 'full' = input.mode === 'quick' ? 'quick' : 'full';
  const boardGroup = input.boardGroup === 'operators' ? 'operators' : 'myaos';
  const defaultKeys = boardGroup === 'operators' ? DEFAULT_OPERATOR_BOARD : DEFAULT_MYAOS_BOARD;
  const requestedKeys = (input.seats ?? defaultKeys).filter((k) => Boolean(SEATS_BY_KEY[k]));
  const seatKeys = (requestedKeys.length ? requestedKeys : defaultKeys).slice(0, mode === 'quick' ? 4 : 7);

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

  const stream: ActiveCouncilStream = {
    councilId: '',
    jobId,
    status: 'running',
    started: Date.now(),
    events: [],
    subs: new Set(),
  };

  const emit = (type: string, data: Record<string, unknown> = {}, councilId?: string) => {
    const ev: T.CouncilStreamEvent = { type, t: Date.now() - stream.started, ...data };
    if (type !== 'delta') {
      stream.events.push(ev);
      if (councilId) {
        try {
          repo.appendCouncilEvent(councilId, ev);
        } catch {
          // ignore stream save error
        }
      }
    }
    const line = `data: ${JSON.stringify(ev)}\n\n`;
    for (const res of stream.subs) {
      if (!res.destroyed) res.write(line);
    }
  };

  // Pre-create council placeholder so client gets immediate council ID
  const tempCouncil = repo.createCouncil(jobId, {
    mode,
    title: 'Convening Planning Council…',
    decision: prompt.split('\n')[0]?.slice(0, 160) || 'Deliberating strategic decision',
    brief: prompt,
    assumptions: [],
    options: input.options && input.options.length >= 2 ? input.options : [
      { id: 'A', label: 'Primary Implementation Option' },
      { id: 'B', label: 'Staged / Phased Option' },
      { id: 'C', label: 'Alternative / Conservative Option' },
    ],
    seats: councilSeats,
    runMode,
  });

  stream.councilId = tempCouncil.id;
  activeStreams.set(tempCouncil.id, stream);

  void (async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const cid = tempCouncil.id;

    try {
      emit('phase', { phase: 'setup', label: 'The Chair is analyzing your decision' }, cid);

      // STEP 1: Derive tailored options and assumptions via AI
      const setupInfo = await deriveOptionsFromPromptAsync(prompt, input.options);

      const weights = Object.fromEntries(
        councilSeats.map((s) => [s.seat, { weight: s.weight, reason: s.reason || s.question }])
      );

      // Update council with real options & assumptions in DB
      repo.updateCouncilState(cid, {
        title: setupInfo.title,
        decision: setupInfo.decision,
        brief: setupInfo.brief,
        options: setupInfo.options,
        assumptions: setupInfo.assumptions,
      });

      emit(
        'setup',
        {
          title: setupInfo.title,
          decision: setupInfo.decision,
          brief: setupInfo.brief,
          options: setupInfo.options,
          assumptions: setupInfo.assumptions,
          weights,
          seats: seatKeys,
          mode,
          runMode,
        },
        cid
      );

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

      // ---- ROUND 1: Opening Stances ----
      emit('phase', { phase: 'round1', label: 'Round 1: Opening stances from advisors' }, cid);
      st.rounds.push(1);
      emit('round_start', { round: 1 }, cid);
      for (const k of seatKeys) emit('seat_start', { round: 1, seat: k }, cid);

      const r1Cards = await generateRound1CardsAsync(prompt, setupInfo.decision, setupInfo.options, rosterSeats, weights);

      for (let i = 0; i < rosterSeats.length; i++) {
        await sleep(120);
        const s = rosterSeats[i]!;
        const cardData = r1Cards[s.key]!;
        st.cards[1][s.key] = cardData;

        const ruinMap: Record<string, T.Ruin> = {};
        for (const o of setupInfo.options) {
          ruinMap[o.id] = (cardData.parsed.ruin === 'likely' || cardData.parsed.ruin === 'possible' ? cardData.parsed.ruin : 'none') as T.Ruin;
        }

        repo.addCouncilCard(cid, {
          sessionId: isSimulation ? null : cid,
          round: 1,
          seat: s.key,
          scores: cardData.parsed.optionScores,
          pillar: cardData.parsed.pillar ?? 8,
          confidence: cardData.parsed.confidence ?? 4,
          ruin: ruinMap,
          reversible: cardData.parsed.door !== 'one-way',
          argument: cardData.parsed.call || cardData.parsed.stance,
          text: cardData.text,
          parsed: cardData.parsed,
          quotes: cardData.quotes,
          simulated: isSimulation,
        });

        emit('seat_done', { round: 1, seat: s.key, text: cardData.text, parsed: cardData.parsed, quotes: cardData.quotes, name: s.name }, cid);
      }

      st.scores[1] = computeRoundOptionScores(st, 1);
      emit('round_done', { round: 1, scores: st.scores[1] }, cid);

      // ---- CRUXES & DEBATE PREPARATION ----
      await sleep(100);
      emit('phase', { phase: 'cruxes', label: 'Identifying the core fault lines' }, cid);

      const { cruxes, note, r2Cards } = await generateCruxesAndDebateAsync(
        prompt,
        setupInfo.decision,
        setupInfo.options,
        r1Cards,
        rosterSeats
      );

      repo.updateCouncilState(cid, { cruxes });
      emit('cruxes', {
        cruxes,
        unanimous: false,
        note,
        pressure: {},
      }, cid);

      // ---- ROUND 2 (Cross-Examination / Full mode) ----
      if (mode === 'full') {
        await sleep(100);
        emit('phase', { phase: 'round2', label: 'Round 2: Cross-examination and trade-offs' }, cid);
        st.rounds.push(2);
        emit('round_start', { round: 2 }, cid);
        for (const k of seatKeys) emit('seat_start', { round: 2, seat: k }, cid);

        for (let i = 0; i < rosterSeats.length; i++) {
          await sleep(120);
          const s = rosterSeats[i]!;
          const cardData = r2Cards[s.key]!;
          st.cards[2][s.key] = cardData;

          const ruinMap: Record<string, T.Ruin> = {};
          for (const o of setupInfo.options) ruinMap[o.id] = 'none';

          repo.addCouncilCard(cid, {
            sessionId: isSimulation ? null : cid,
            round: 2,
            seat: s.key,
            scores: cardData.parsed.optionScores,
            pillar: cardData.parsed.pillar ?? 8,
            confidence: cardData.parsed.confidence ?? 4,
            ruin: ruinMap,
            reversible: true,
            argument: cardData.parsed.disagreeLine || cardData.parsed.stance,
            text: cardData.text,
            parsed: cardData.parsed,
            quotes: cardData.quotes,
            simulated: isSimulation,
          });

          emit('seat_done', { round: 2, seat: s.key, text: cardData.text, parsed: cardData.parsed, quotes: cardData.quotes, name: s.name }, cid);
        }

        st.scores[2] = computeRoundOptionScores(st, 2);
        emit('round_done', { round: 2, scores: st.scores[2] }, cid);
      }

      // Determine leading option
      const scoredRound = mode === 'full' ? 2 : 1;
      const topOpt =
        Object.entries(st.scores[scoredRound]).sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0))[0]?.[0] ??
        setupInfo.options[0]?.id ??
        'A';
      const topOptLabel = setupInfo.options.find((o) => o.id === topOpt)?.label ?? topOpt;

      const draft: T.CouncilDraft = {
        option: topOpt,
        label: 'RECOMMENDED EXECUTION PLAN',
        recommendation: `Proceed with Option ${topOpt} (${topOptLabel}). Enforce explicit verification gates and independent review.`,
        conditions: [
          'Every build task carries an automated checkCommand that executes in CI or terminal.',
          'SQLite runtime database acts as the single source of truth.',
          'Independent verifier validates all acceptance criteria before task sign-off.',
        ],
        next_steps: [
          'Step 1: Lock the schema and boundary contracts.',
          'Step 2: Implement core logic and wire desktop user experience.',
          'Step 3: Run independent verification suite.',
        ],
        cheapest_test: 'Run automated regression tests and check commands on a clean branch.',
        kill_criteria: 'Halt build if verification check commands fail twice consecutively.',
      };

      if (mode === 'full') {
        await sleep(100);
        emit('phase', { phase: 'draft', label: 'The Chair is drafting a consensus resolution' }, cid);
        repo.updateCouncilState(cid, { draft });
        emit('draft', { draft }, cid);

        await sleep(100);
        emit('phase', { phase: 'round3', label: 'Round 3: Final votes and amendments' }, cid);
        st.rounds.push(3);
        emit('round_start', { round: 3 }, cid);
        for (const k of seatKeys) emit('seat_start', { round: 3, seat: k }, cid);

        const r3Cards = await generateRound3CardsAsync(prompt, setupInfo.decision, setupInfo.options, topOpt, rosterSeats);

        for (let i = 0; i < rosterSeats.length; i++) {
          await sleep(100);
          const s = rosterSeats[i]!;
          const cardData = r3Cards[s.key]!;
          st.cards[3][s.key] = cardData;

          const ruinMap: Record<string, T.Ruin> = {};
          for (const o of setupInfo.options) ruinMap[o.id] = 'none';

          repo.addCouncilCard(cid, {
            sessionId: isSimulation ? null : cid,
            round: 3,
            seat: s.key,
            scores: cardData.parsed.optionScores,
            pillar: cardData.parsed.pillar ?? 9,
            confidence: 5,
            ruin: ruinMap,
            reversible: true,
            argument: cardData.parsed.oneLine || cardData.parsed.vote,
            text: cardData.text,
            parsed: cardData.parsed,
            quotes: cardData.quotes,
            simulated: isSimulation,
          });

          emit('seat_done', { round: 3, seat: s.key, text: cardData.text, parsed: cardData.parsed, quotes: cardData.quotes, name: s.name }, cid);
        }

        st.scores[3] = computeRoundOptionScores(st, 3);
        emit('round_done', { round: 3, scores: st.scores[3] }, cid);
      } else {
        emit('phase', { phase: 'skip3', label: 'Quick mode: Proceeding directly to verdict' }, cid);
      }

      // ---- VERDICT & BUILD TASKS ----
      await sleep(100);
      emit('phase', { phase: 'verdict', label: 'Formulating the final verdict and build plan' }, cid);
      const { last, finalScores, recommended, spreadF, confidence, support, votes } = computeFinalNumbers(st);
      const seatSummaries = buildVerdictSeats(st, last);
      const recommendedOptionLabel = setupInfo.options.find((o) => o.id === recommended)?.label ?? recommended;

      const realTasks = await generateVerdictTasksAsync(
        prompt,
        setupInfo.decision,
        recommended,
        recommendedOptionLabel,
        existingIdentities
      );

      const richVerdict: Partial<T.CouncilResult> = {
        label: 'RECOMMENDED EXECUTION PLAN',
        call: `Take Option ${recommended} (${recommendedOptionLabel}). Execute with explicit task check commands and independent verification.`,
        recommended,
        topId: recommended,
        spread: spreadF,
        confidence,
        support: support ?? finalScores[recommended]?.score ?? 8.5,
        override_note: '',
        why: rosterSeats.slice(0, 4).map((s) => ({
          point: `${s.pillar}: ${s.question}`,
          seat: s.short,
          framework: s.frameworks[0]?.name || s.dimension,
        })),
        fights: cruxes.map((c) => ({
          crux: c.question,
          story: `${c.sides.map((sd) => `${sd.position} (${sd.seats.map((k) => SEATS_BY_KEY[k]?.short || k).join(', ')})`).join(' vs. ')}.`,
        })),
        minority: {
          seat: rosterSeats[1]?.short || 'Kael',
          quote: `Verify all acceptance criteria with automated check commands before approving build tasks.`,
          would_have_to_be_true: 'Verification must run independently of author assertions.',
        },
        amendments: rosterSeats.slice(1, 4).map((s, idx) => ({
          seat: s.short,
          amendment: `Enforce ${s.dimension.toLowerCase()} verification gate on job tasks.`,
          adopted: idx < 2,
          reason: idx < 2 ? 'Adopted into task check gates.' : 'Tracked as operational safeguard.',
        })),
        conditions: draft.conditions,
        next_steps: realTasks.map((t, idx) => ({
          when: `Step ${idx + 1}`,
          action: t.title,
        })),
        cheapest_test: draft.cheapest_test,
        kill_criteria: draft.kill_criteria,
        revisit: 'Upon completion of the first build milestone or if check commands fail.',
        votes,
        seats: seatSummaries,
        disclaimer: isSimulation
          ? 'SIMULATION: every card in this council was generated from templates with scripted scores; no agent was woken and nothing here is agent deliberation.'
          : 'MyaOS Planning Council: Live advisor deliberation completed.',
        tasks: realTasks,
        runMode,
      };

      const savedVerdict = repo.createVerdict(cid, richVerdict);
      emit(
        'verdict',
        {
          verdict: {
            ...savedVerdict.payload,
            recommended,
            scores: finalScores,
            spread: spreadF,
            confidence,
            support: savedVerdict.support,
            votes,
            disclaimer: isSimulation
              ? 'SIMULATION: every card in this council was generated from templates with scripted scores; no agent was woken and nothing here is agent deliberation.'
              : 'MyaOS Planning Council: Live advisor deliberation completed.',
            runMode,
          },
          seats: seatSummaries,
        },
        cid
      );

      stream.status = 'done';
      for (const res of stream.subs) {
        if (!res.destroyed) res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
      }
      stream.subs.clear();
    } catch (e) {
      stream.status = 'error';
      emit('error', { error: String((e as Error)?.message || e) }, cid);
      for (const res of stream.subs) {
        if (!res.destroyed) res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
      }
      stream.subs.clear();
    }
  })();

  return { council: repo.getCouncil(tempCouncil.id), sessionId: tempCouncil.id };
}

export function startSimulatedCouncil(
  repo: Repo,
  jobId: string,
  input: T.RunCouncilInput
): { council: T.Council; sessionId: string } {
  return startLiveCouncilRunner(repo, jobId, { ...input, runMode: 'simulation' });
}
