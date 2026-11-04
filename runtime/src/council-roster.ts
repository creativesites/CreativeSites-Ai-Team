import type { Ruin } from './api/types.js';

export interface CouncilRosterSeat {
  key: string;
  name: string;
  short: string;
  initials: string;
  slug: string;
  pillar: string;
  question: string;
  dimension: string;
  color: string;
  boardGroup: 'myaos' | 'operators';
  identityId?: string;
  /** Portrait key under /portraits/<portraitKey>-<shape>.webp; if absent or missing, drawnBust SVG renders automatically. */
  portraitKey?: string;
  frameworks: { id: string; name: string; quote: string }[];
}

export interface ParsedCouncilCard {
  stance: string;
  call: string;
  optionScores: Record<string, number>;
  pillar: number | null;
  finalScore: number | null;
  confidence: number | null;
  ruin: Ruin | '';
  door: 'one-way' | 'two-way' | '';
  disagreeWith: string | null;
  disagreeLine: string;
  concede: string;
  moved: string;
  vote: 'endorse' | 'amend' | 'dissent' | '';
  amendment: string;
  oneLine: string;
  question: string;
  risk: string;
  thisWeek: string;
}

export interface CouncilQuoteCheck {
  quote: string;
  source: string;
  verified: boolean;
}

export const COUNCIL_DISCLAIMER =
  'MyaOS Planning Council: Advisors evaluate decisions through their pillar frameworks to surface trade-offs before build work begins.';

export const MYAOS_COUNCIL_SEATS: CouncilRosterSeat[] = [
  {
    key: 'themis',
    name: 'Themis (Governance Lead)',
    short: 'Themis',
    initials: 'TH',
    slug: 'themis-governance',
    pillar: 'Outcome-led strategy & reversibility',
    question: 'Does this work backwards from the user outcome, and is it a one-way or two-way door?',
    dimension: 'Outcome alignment and reversibility',
    color: '#d9a441',
    boardGroup: 'myaos',
    identityId: 'themis',
    portraitKey: 'bezos',
    frameworks: [
      { id: 'S001', name: 'Type 1 vs Type 2 Doors', quote: 'One-way doors require slow, deliberate proof; two-way doors should be walked through this week.' },
      { id: 'S002', name: 'Outcome-Led Hierarchy', quote: 'Work backwards from user experience to product capability to system capability, never from existing API limitations.' },
    ],
  },
  {
    key: 'daedalus',
    name: 'Daedalus (Runtime Architect)',
    short: 'Daedalus',
    initials: 'DA',
    slug: 'daedalus-architecture',
    pillar: 'First-principles systems & speed',
    question: 'What is the real substrate constraint, and what complexity can we delete right now?',
    dimension: 'Architectural simplicity and execution speed',
    color: '#e07a5f',
    boardGroup: 'myaos',
    identityId: 'daedalus',
    portraitKey: 'musk',
    frameworks: [
      { id: 'S011', name: 'The 5-Step Algorithm', quote: 'Make requirements less dumb, delete the part or process step, simplify only after deleting.' },
      { id: 'S012', name: 'Single Substrate Truth', quote: 'Never split state across two stores when SQLite can own the whole lifecycle atomically.' },
    ],
  },
  {
    key: 'kael',
    name: 'Kael (Lead Verifier)',
    short: 'Kael',
    initials: 'KA',
    slug: 'kael-verifier',
    pillar: 'Independent verification & ruin risk',
    question: 'How do we prove this with un-mocked evidence, and what could cause silent ruin?',
    dimension: 'Epistemic integrity and downside protection',
    color: '#4a9eff',
    boardGroup: 'myaos',
    identityId: 'kael',
    portraitKey: 'buffett',
    frameworks: [
      { id: 'S021', name: 'Independent Verifier Rule', quote: 'An agent that grades its own homework will eventually hallucinate green checkmarks.' },
      { id: 'S022', name: 'Rule No. 1: Zero Silent Data Loss', quote: 'If telemetry is missing, surface UNKNOWN honestly rather than inventing a comforting number.' },
    ],
  },
  {
    key: 'atlas',
    name: 'Atlas (Product & UX Lead)',
    short: 'Atlas',
    initials: 'AT',
    slug: 'atlas-product',
    pillar: 'User experience & real demand',
    question: 'Will the user feel an immediate difference in under 60 seconds?',
    dimension: 'User delight and tangible utility',
    color: '#3dd68c',
    boardGroup: 'myaos',
    identityId: 'atlas',
    portraitKey: 'graham',
    frameworks: [
      { id: 'S031', name: 'Do Things That Feel Immediate', quote: 'Users do not care how many tables or endpoints exist; they care that the screen responds with clarity.' },
      { id: 'S032', name: 'Second-Order Product Unlock', quote: 'Never build an isolated widget when the same capability can power the entire workflow.' },
    ],
  },
  {
    key: 'astra',
    name: 'Astra (Operations & Delivery)',
    short: 'Astra',
    initials: 'AS',
    slug: 'astra-operations',
    pillar: 'Operations, cadence & accountability',
    question: 'Who owns each checkable task, and can the loop finish without heroic intervention?',
    dimension: 'Operational readiness and clear ownership',
    color: '#1fa67a',
    boardGroup: 'myaos',
    identityId: 'astra',
    portraitKey: 'wickman',
    frameworks: [
      { id: 'S041', name: 'Scorecard & Rocks', quote: 'Every task needs one named owner, one runnable check command, and one measurable gate.' },
      { id: 'S042', name: 'GWC (Get It, Want It, Capacity)', quote: 'Assigning five parallel tasks to one bottlenecked runtime is wishful thinking, not a plan.' },
    ],
  },
  {
    key: 'vela',
    name: 'Vela (Growth & Economics)',
    short: 'Vela',
    initials: 'VE',
    slug: 'vela-economics',
    pillar: 'Value equation, ROI & token budget',
    question: 'Does the outcome justify the token burn, engineering hours, and opportunity cost?',
    dimension: 'Value equation and resource ROI',
    color: '#d94a6a',
    boardGroup: 'myaos',
    identityId: 'vela',
    portraitKey: 'hormozi',
    frameworks: [
      { id: 'S051', name: 'The Value Equation', quote: 'Maximize dream outcome and perceived likelihood of achievement while slashing time delay and effort.' },
      { id: 'S052', name: 'Cheapest Falsifiable Test', quote: 'Before spending a week building infrastructure, run the 30-minute test that could prove the premise wrong.' },
    ],
  },
  {
    key: 'muse',
    name: 'Muse (Brand & Craft)',
    short: 'Muse',
    initials: 'MU',
    slug: 'muse-brand',
    pillar: 'Visual craft, storytelling & attention',
    question: 'Does this look and feel unmistakable, or like another generic dashboard?',
    dimension: 'Visual craft and emotional resonance',
    color: '#9b5de5',
    boardGroup: 'myaos',
    identityId: 'muse',
    portraitKey: 'garyvee',
    frameworks: [
      { id: 'S061', name: 'Show, Never Tell', quote: 'A live animated room where advisors clash beats a wall of markdown bullet points every time.' },
      { id: 'S062', name: 'Tactile Polish', quote: 'Typography, motion, and voice turn software from a utility into an experience people remember.' },
    ],
  },
  {
    key: 'wren',
    name: 'Wren (Team Capacity & Leverage)',
    short: 'Wren',
    initials: 'WR',
    slug: 'wren-leverage',
    pillar: 'Founder time & code leverage',
    question: 'Does this buy back the founder’s calendar and compound as reusable leverage?',
    dimension: 'Founder time and compounding leverage',
    color: '#3d8bfd',
    boardGroup: 'myaos',
    identityId: 'wren',
    portraitKey: 'martell',
    frameworks: [
      { id: 'S071', name: 'Buy Back Principle', quote: 'Never build a workflow that requires the human owner to manually babysit every step.' },
      { id: 'S072', name: 'Code & Media Leverage', quote: 'Build once into the runtime so every future job inherits the capability at zero marginal cost.' },
    ],
  },
  {
    key: 'sol',
    name: 'Sol (Security & Edge Resilience)',
    short: 'Sol',
    initials: 'SO',
    slug: 'sol-security',
    pillar: 'Failure modes, security & graceful degradation',
    question: 'What happens when the network drops, an adapter is rate-limited, or inputs are malformed?',
    dimension: 'Resilience and graceful fallback',
    color: '#22b8a0',
    boardGroup: 'myaos',
    identityId: 'sol',
    portraitKey: 'naval',
    frameworks: [
      { id: 'S081', name: 'Antifragile Fallbacks', quote: 'Every live dependency must degrade gracefully so the user is never stranded on a dead screen.' },
      { id: 'S082', name: 'Zero-Trust Boundaries', quote: 'Keep secrets out of git, validate every boundary, and make every state transition auditable.' },
    ],
  },
];

export const OPERATOR_COUNCIL_SEATS: CouncilRosterSeat[] = [
  {
    key: 'bezos',
    name: 'Jeff Bezos',
    short: 'Bezos',
    initials: 'JB',
    slug: 'jeff-bezos',
    pillar: 'Strategy and decisions',
    question: 'Is this the right bet, and how reversible is it?',
    dimension: 'Strategic fit and reversibility',
    color: '#e8a33d',
    boardGroup: 'operators',
    portraitKey: 'bezos',
    frameworks: [
      { id: 'S001', name: 'Type 1 and Type 2 decisions', quote: 'Most decisions are two-way doors; walk through them fast and reserve heavy process for irreversible Type 1 doors.' },
      { id: 'S004', name: 'Regret Minimization & Working Backwards', quote: 'Start from the customer press release and work backwards to the minimum technical truth.' },
    ],
  },
  {
    key: 'graham',
    name: 'Paul Graham',
    short: 'Graham',
    initials: 'PG',
    slug: 'paul-graham',
    pillar: 'Product and startups',
    question: 'Is this something people actually want, and is it growing?',
    dimension: 'Real demand and growth',
    color: '#f06b3f',
    boardGroup: 'operators',
    portraitKey: 'graham',
    frameworks: [
      { id: 'S010', name: 'Make Something People Want', quote: 'Talk to users this week and watch what they actually use, not what they say they might use.' },
      { id: 'S012', name: 'Schlep Blindness & Do Things That Don’t Scale', quote: 'Launch the narrow slice that solves a real pain acutely before generalizing.' },
    ],
  },
  {
    key: 'hormozi',
    name: 'Alex Hormozi',
    short: 'Hormozi',
    initials: 'AH',
    slug: 'alex-hormozi',
    pillar: 'Offers, pricing, and sales',
    question: 'Will people pay, how much, and how do we close?',
    dimension: 'Offer strength and unit economics',
    color: '#d94a6a',
    boardGroup: 'operators',
    portraitKey: 'hormozi',
    frameworks: [
      { id: 'S014', name: 'Value Equation', quote: 'Dream outcome times likelihood divided by time delay and effort determines whether the offer converts.' },
      { id: 'S018', name: 'Rule of 100', quote: 'Volume negates luck; measure concrete output and cash gates rather than intentions.' },
    ],
  },
  {
    key: 'garyvee',
    name: 'Gary Vaynerchuk',
    short: 'Gary V',
    initials: 'GV',
    slug: 'gary-vaynerchuk',
    pillar: 'Marketing and attention',
    question: 'Where does the attention come from, and is it underpriced?',
    dimension: 'Attention and distribution',
    color: '#9b5de5',
    boardGroup: 'operators',
    portraitKey: 'garyvee',
    frameworks: [
      { id: 'S020', name: 'Day Trading Attention', quote: 'Go where the eyes actually live right now and document the real process instead of over-polishing.' },
      { id: 'S023', name: 'Jab, Jab, Jab, Right Hook', quote: 'Give unmistakable utility upfront before asking the user for effort.' },
    ],
  },
  {
    key: 'martell',
    name: 'Dan Martell',
    short: 'Martell',
    initials: 'DM',
    slug: 'dan-martell',
    pillar: 'People, hiring, and founder time',
    question: "Who does this, and what does it cost the founder's calendar?",
    dimension: 'Team capacity and founder time',
    color: '#3d8bfd',
    boardGroup: 'operators',
    portraitKey: 'martell',
    frameworks: [
      { id: 'S030', name: 'Buy Back Principle', quote: 'Do not hire or build to grow; build to buy back your time from the lowest-value bottlenecks.' },
      { id: 'S033', name: '10-80-10 Delegation', quote: 'Set the first 10% direction, let the team execute the middle 80%, and review the final 10% with clear criteria.' },
    ],
  },
  {
    key: 'wickman',
    name: 'Gino Wickman',
    short: 'Wickman',
    initials: 'GW',
    slug: 'gino-wickman',
    pillar: 'Operations and scaling',
    question: 'Can the business run this without the founder holding it together?',
    dimension: 'Operational readiness',
    color: '#1fa67a',
    boardGroup: 'operators',
    portraitKey: 'wickman',
    frameworks: [
      { id: 'S040', name: 'EOS Accountability Chart & Rocks', quote: 'When two people own a seat, nobody owns it; name the single owner and the weekly Scorecard number.' },
      { id: 'S043', name: 'IDS (Identify, Discuss, Solve)', quote: 'Dig past symptoms to the real root issue and leave the room with 7-day to-dos.' },
    ],
  },
  {
    key: 'buffett',
    name: 'Warren Buffett',
    short: 'Buffett',
    initials: 'WB',
    slug: 'warren-buffett',
    pillar: 'Money and capital',
    question: 'What does it do to cash, risk, and long-term value?',
    dimension: 'Downside and capital efficiency',
    color: '#4c6a92',
    boardGroup: 'operators',
    portraitKey: 'buffett',
    frameworks: [
      { id: 'S050', name: 'Margin of Safety & Circle of Competence', quote: 'Never risk what you have and need for what you do not have and do not need.' },
      { id: 'S053', name: 'Birds in the Bush', quote: 'Count cash and verified output in hand, never unverified projections.' },
    ],
  },
  {
    key: 'naval',
    name: 'Naval Ravikant',
    short: 'Naval',
    initials: 'NR',
    slug: 'naval-ravikant',
    pillar: 'Leverage and wealth',
    question: 'Does this build leverage and equity you own, or does it just rent out your time?',
    dimension: 'Leverage and ownership',
    color: '#22b8a0',
    boardGroup: 'operators',
    portraitKey: 'naval',
    frameworks: [
      { id: 'S060', name: 'Permissionless Leverage', quote: 'Code and media work while you sleep; prefer architectural leverage over manual labor.' },
      { id: 'S063', name: 'Specific Knowledge', quote: 'Double down on the part of the product only your team can build authentically.' },
    ],
  },
  {
    key: 'sanchez',
    name: 'Codie Sanchez',
    short: 'Codie',
    initials: 'CS',
    slug: 'codie-sanchez',
    pillar: 'Buying and owning small businesses',
    question: 'Should you build this, or buy/adapt something that already works?',
    dimension: 'Buy versus build and deal terms',
    color: '#e05d9b',
    boardGroup: 'operators',
    portraitKey: 'sanchez',
    frameworks: [
      { id: 'S070', name: 'Acquire & Adapt Over Reinventing', quote: 'Why spend six months inventing from scratch when a proven pattern can be adapted in days?' },
      { id: 'S073', name: 'Cash-Flow First', quote: 'Protect the boring, reliable core that pays for everything else.' },
    ],
  },
  {
    key: 'blakely',
    name: 'Sara Blakely',
    short: 'Sara',
    initials: 'SB',
    slug: 'sara-blakely',
    pillar: 'Consumer product and brand from zero',
    question: 'Will customers love it enough to sell it for you, without outside money?',
    dimension: 'Product love and self-funded growth',
    color: '#c9a227',
    boardGroup: 'operators',
    portraitKey: 'blakely',
    frameworks: [
      { id: 'S080', name: 'Prototype With What You Have', quote: 'Cut the feet off the pantyhose today and test the actual sensation with a real user.' },
      { id: 'S083', name: 'Unmistakable Before/After', quote: 'If the user can see and feel the before-and-after immediately, they tell everyone.' },
    ],
  },
  {
    key: 'leila',
    name: 'Leila Hormozi',
    short: 'Leila',
    initials: 'LH',
    slug: 'leila-hormozi',
    pillar: 'Leadership and scaling teams',
    question: 'Can your team and your leadership carry this, and who has to change?',
    dimension: 'Leadership and team capacity',
    color: '#8fbf3a',
    boardGroup: 'operators',
    portraitKey: 'leila',
    frameworks: [
      { id: 'S090', name: 'Observable Standards Over Vibes', quote: 'You do not have a people problem until you have written down the exact observable standard and check.' },
      { id: 'S093', name: 'Constraint-Led Scaling', quote: 'Fix the single choking handoff in the pipeline before adding more people or agents.' },
    ],
  },
  {
    key: 'musk',
    name: 'Elon Musk',
    short: 'Elon',
    initials: 'EM',
    slug: 'elon-musk',
    pillar: 'First principles and execution speed',
    question: 'What is the real constraint here, and can we cut steps and build it faster?',
    dimension: 'Real constraints and execution speed',
    color: '#c0392b',
    boardGroup: 'operators',
    portraitKey: 'musk',
    frameworks: [
      { id: 'S100', name: 'The Algorithm', quote: 'Question every requirement, delete the step, simplify only after deleting, then accelerate cycle time.' },
      { id: 'S103', name: 'Idiot Index', quote: 'Compare the cost of the finished workflow to the raw underlying operations and cut the ceremony.' },
    ],
  },
];

export const ALL_COUNCIL_SEATS: CouncilRosterSeat[] = [
  ...MYAOS_COUNCIL_SEATS,
  ...OPERATOR_COUNCIL_SEATS,
];

export const SEATS_BY_KEY: Record<string, CouncilRosterSeat> = Object.fromEntries(
  ALL_COUNCIL_SEATS.map((s) => [s.key, s])
);

export const DEFAULT_MYAOS_BOARD = ['themis', 'daedalus', 'kael', 'atlas', 'astra', 'vela', 'muse'];
export const DEFAULT_OPERATOR_BOARD = ['bezos', 'graham', 'hormozi', 'garyvee', 'martell', 'wickman', 'buffett'];

export function getRosterPayload() {
  return {
    board: 'ask' as const,
    default: DEFAULT_MYAOS_BOARD,
    defaultOperators: DEFAULT_OPERATOR_BOARD,
    seats: ALL_COUNCIL_SEATS,
  };
}

/**
 * Finds a seat named in a short string (full name, short name, key, or unique surname).
 */
export function seatIn(text: string | null | undefined, pool: CouncilRosterSeat[] = ALL_COUNCIL_SEATS): CouncilRosterSeat | null {
  const t = ` ${String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
  const has = (w: string) => Boolean(w) && t.includes(` ${w.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim()} `);
  return (
    pool.find((s) => has(s.name)) ||
    pool.find((s) => has(s.short) || has(s.key)) ||
    pool.find((s) => {
      const cleanName = s.name.replace(/\(.*$/, '').trim();
      const sur = cleanName.split(' ').pop()?.toLowerCase() || '';
      const same = pool.filter((x) => x.name.replace(/\(.*$/, '').trim().split(' ').pop()?.toLowerCase() === sur);
      return has(sur) && (same.length === 1 || s.short.toLowerCase() === sur);
    }) ||
    null
  );
}

export function seatKey(x: string | null | undefined): string | null {
  const t = String(x || '')
    .toLowerCase()
    .replace(/\(.*$/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  return (
    ALL_COUNCIL_SEATS.find(
      (s) =>
        t === s.key ||
        t === s.short.toLowerCase() ||
        t === s.name.toLowerCase() ||
        t === s.name.replace(/\(.*$/, '').trim().toLowerCase()
    )?.key ||
    seatIn(t)?.key ||
    null
  );
}

const field = (text: string, label: string): string => {
  const m = text.match(new RegExp(`(?:^|[·|])[ \\t]*\\**${label}\\**[ \\t]*:[ \\t]*([^\\n·]+)`, 'im'));
  return m ? m[1].replace(/\*+/g, '').trim() : '';
};

const num = (s: string): number | null => {
  const m = (s || '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

export function parseOptionScores(text: string, optionIds: string[]): Record<string, number> {
  const lm = text.match(/OPTION SCORES\**[ \t]*:[ \t]*([^\n]+)/i);
  const line = (lm ? lm[1] : '').split(/PILLAR SCORE|CONFIDENCE|FINAL SCORE/i)[0];
  const scores: Record<string, number> = {};
  for (const id of optionIds) {
    const m = line.match(new RegExp(`\\b${id}\\b\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)`, 'i'));
    if (m) scores[id] = Math.max(0, Math.min(10, Number(m[1])));
  }
  return scores;
}

export function parseCard(text: string, optionIds: string[]): ParsedCouncilCard {
  const stance = field(text, 'STANCE');
  const ruinRaw = (field(text, 'RUIN RISK').match(/none|possible|likely/i) || [''])[0].toLowerCase();
  const ruin = (ruinRaw === 'none' || ruinRaw === 'possible' || ruinRaw === 'likely' ? ruinRaw : '') as Ruin | '';
  const disagree = field(text, 'I DISAGREE MOST WITH');
  const target = seatIn(disagree.slice(0, 48));
  const voteRaw = field(text, 'VOTE');
  const vote = /dissent/i.test(voteRaw)
    ? 'dissent'
    : /amend/i.test(voteRaw)
      ? 'amend'
      : /endorse/i.test(voteRaw)
        ? 'endorse'
        : '';
  const doorRaw = (field(text, 'DOOR').match(/one-way|two-way/i) || [''])[0].toLowerCase();
  const door = (doorRaw === 'one-way' || doorRaw === 'two-way' ? doorRaw : '') as 'one-way' | 'two-way' | '';
  return {
    stance,
    call: field(text, 'THE CALL'),
    optionScores: parseOptionScores(text, optionIds),
    pillar: num(field(text, 'PILLAR SCORE')) ?? num(field(text, 'FINAL PILLAR SCORE')),
    finalScore: num(field(text, 'FINAL SCORE')),
    confidence: num(field(text, 'CONFIDENCE')),
    ruin,
    door,
    disagreeWith: target ? target.key : null,
    disagreeLine: disagree,
    concede: field(text, 'I CONCEDE'),
    moved: field(text, 'MOVED'),
    vote,
    amendment: field(text, 'AMENDMENT OR DISSENT'),
    oneLine: field(text, 'ONE LINE FOR THE FOUNDER'),
    question: field(text, 'QUESTION FOR THE FOUNDER'),
    risk: field(text, 'THE RISK I SEE'),
    thisWeek: field(text, "WHAT I'D DO THIS WEEK"),
  };
}

const normQuote = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/'\s+(t|s|re|ll|ve|d|m)\b/g, "'$1")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function checkQuotes(key: string, text: string): CouncilQuoteCheck[] {
  const out: CouncilQuoteCheck[] = [];
  const seat = SEATS_BY_KEY[key];
  const hay = seat
    ? normQuote(seat.frameworks.map((f) => `${f.id} ${f.name} ${f.quote}`).join(' '))
    : '';
  const re = /["“]([^"“”\n]{16,400})["”][^\n"]{0,40}?[(\[](S\d{3})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const q = normQuote(m[1]);
    if (q.split(' ').length < 4) continue;
    const verified = hay ? hay.includes(q) || hay.replace(/ /g, '').includes(q.replace(/ /g, '')) : true;
    out.push({ quote: m[1], source: m[2], verified });
  }
  return out;
}

/**
 * Splits a markdown round file (round-1.md, round-2.md, round-3.md) into per-seat cards.
 */
export function splitCards(md: string): { key: string; text: string }[] {
  const heads = [...md.matchAll(/^#{2,3}[ \t]+(.+)$/gm)];
  const seatHeads = heads.filter((h) => !/chair/i.test(h[1]) && seatKey(h[1]));
  if (seatHeads.length) {
    return seatHeads
      .map((h) => {
        const next = heads.find((n) => (n.index ?? 0) > (h.index ?? 0));
        const text = md
          .slice((h.index ?? 0) + h[0].length, next ? next.index : md.length)
          .replace(/(\n\s*(-{3,}|\*{3,}))+\s*$/g, '')
          .trim();
        return { key: seatKey(h[1])!, text };
      })
      .filter((c) => c.key && c.text);
  }
  const body = md.split(/^#{1,4}[^\n]*\bchair\b[^\n]*$/im)[0];
  const marks = [...body.matchAll(/^\**SEAT\**[ \t]*:[ \t]*(.+)$/gim)];
  return marks
    .map((m, i) => {
      const end = i + 1 < marks.length ? (marks[i + 1].index ?? body.length) : body.length;
      const text = body
        .slice(m.index ?? 0, end)
        .replace(/(\n\s*(#{1,4} [^\n]*|-{3,}|\*{3,}))+\s*$/g, '')
        .trim();
      return { key: seatKey(m[1]) || '', text };
    })
    .filter((c) => Boolean(c.key));
}
