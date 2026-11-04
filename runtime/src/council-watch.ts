import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as T from './api/types.ts';
import {
  ALL_COUNCIL_SEATS,
  checkQuotes,
  COUNCIL_DISCLAIMER,
  DEFAULT_OPERATOR_BOARD,
  parseCard,
  seatKey,
  SEATS_BY_KEY,
  splitCards,
  type ParsedCouncilCard,
  type CouncilQuoteCheck,
} from './council-roster.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BUNDLED_EXAMPLES_DIR = path.resolve(HERE, '..', 'data', 'example-councils');

const readText = (p: string): string | null => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

const readJson = <R = any>(p: string): R | null => {
  const t = readText(p);
  if (!t) return null;
  try {
    return JSON.parse(t) as R;
  } catch {
    return null;
  }
};

const mtime = (p: string): number => {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return Date.now();
  }
};

interface InternalRoundCard {
  text: string;
  parsed: ParsedCouncilCard;
  quotes: CouncilQuoteCheck[];
}

interface InternalCouncilState {
  title: string;
  decision: string;
  brief: string;
  mode: 'quick' | 'full';
  options: T.CouncilOption[];
  assumptions: string[];
  weights: Record<string, { weight: number; reason: string }>;
  seats: string[];
  rounds: number[];
  cards: Record<number, Record<string, InternalRoundCard>>;
  scores: Record<number, Record<string, { score: number | null; math: string }>>;
  draft?: T.CouncilDraft;
}

export function computeRoundOptionScores(
  st: Pick<InternalCouncilState, 'options' | 'seats' | 'cards' | 'weights'>,
  round: number
): Record<string, { score: number | null; math: string }> {
  const out: Record<string, { score: number | null; math: string }> = {};
  for (const o of st.options) {
    let num = 0;
    let den = 0;
    const parts: string[] = [];
    for (const k of st.seats) {
      const v = st.cards[round]?.[k]?.parsed.optionScores[o.id];
      const w = st.weights[k]?.weight ?? 1;
      if (typeof v === 'number') {
        num += w * v;
        den += w;
        parts.push(`${w}x${v}`);
      }
    }
    out[o.id] = {
      score: den ? Math.round((num / den) * 10) / 10 : null,
      math: den ? `(${parts.join(' + ')}) / ${den}` : '',
    };
  }
  return out;
}

export function computeFinalNumbers(st: InternalCouncilState) {
  const last = st.rounds.at(-1) ?? 1;
  const finalScores = st.scores[last] || computeRoundOptionScores(st, last);
  const recommended =
    Object.entries(finalScores).sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0))[0]?.[0] ??
    st.options[0]?.id ??
    'A';
  const fv = st.seats
    .map((k) => st.cards[last]?.[k]?.parsed.optionScores[recommended])
    .filter((v): v is number => typeof v === 'number');
  const confs = st.seats
    .map((k) => st.cards[2]?.[k]?.parsed.confidence ?? st.cards[1]?.[k]?.parsed.confidence)
    .filter((v): v is number => typeof v === 'number');
  const spreadF = fv.length ? Math.round((Math.max(...fv) - Math.min(...fv)) * 10) / 10 : 0;
  const confidence = confs.length
    ? Math.max(
        1,
        Math.min(
          10,
          Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * (confs.some((c) => c > 5) ? 1 : 2)) -
            (spreadF >= 5 ? 1 : 0)
        )
      )
    : 7;
  const support =
    last === 3
      ? (() => {
          let n = 0;
          let d = 0;
          for (const k of st.seats) {
            const v = st.cards[3]?.[k]?.parsed.finalScore ?? st.cards[3]?.[k]?.parsed.optionScores[recommended];
            const w = st.weights[k]?.weight ?? 1;
            if (typeof v === 'number') {
              n += v * w;
              d += w;
            }
          }
          return d ? Math.round((n / d) * 10) / 10 : (finalScores[recommended]?.score ?? 7);
        })()
      : (finalScores[recommended]?.score ?? 7);
  const votes =
    last === 3
      ? st.seats.reduce<Record<string, number>>((acc, k) => {
          const v = st.cards[3]?.[k]?.parsed.vote || 'endorse';
          acc[v] = (acc[v] || 0) + 1;
          return acc;
        }, {})
      : null;
  return { last, finalScores, recommended, spreadF, confidence, support, votes };
}

export function buildVerdictSeats(st: InternalCouncilState, last: number): T.CouncilVerdictSeatSummary[] {
  return st.seats.map((k) => ({
    key: k,
    weight: st.weights[k]?.weight ?? 1,
    stance: st.cards[last]?.[k]?.parsed.vote || st.cards[2]?.[k]?.parsed.stance || st.cards[1]?.[k]?.parsed.stance,
    optionScores: st.cards[last]?.[k]?.parsed.optionScores ?? st.cards[1]?.[k]?.parsed.optionScores,
    pillar: st.cards[last]?.[k]?.parsed.pillar ?? st.cards[2]?.[k]?.parsed.pillar ?? st.cards[1]?.[k]?.parsed.pillar,
    moved: st.cards[2]?.[k]?.parsed.moved,
    oneLine: st.cards[3]?.[k]?.parsed.oneLine || st.cards[2]?.[k]?.parsed.stance || st.cards[1]?.[k]?.parsed.call,
  }));
}

function normalizeFolderSetup(c: any): Omit<InternalCouncilState, 'rounds' | 'cards' | 'scores'> {
  const options: T.CouncilOption[] = (c.options || []).map((o: any, i: number) =>
    typeof o === 'string'
      ? { id: 'ABCD'[i] || `O${i + 1}`, label: o }
      : { id: String(o.id || 'ABCD'[i] || `O${i + 1}`).toUpperCase(), label: String(o.label || o.text || '') }
  );
  const weights: Record<string, { weight: number; reason: string }> = Object.fromEntries(
    ALL_COUNCIL_SEATS.map((s) => [s.key, { weight: 1, reason: '' }])
  );
  const wl = Array.isArray(c.weights)
    ? c.weights
    : Object.entries(c.weights || {}).map(([seat, w]: [string, any]) =>
        typeof w === 'number' ? { seat, weight: w } : { seat, ...w }
      );
  for (const w of wl) {
    const k = seatKey(w.seat);
    if (k) {
      weights[k] = {
        weight: Math.max(1, Math.min(3, Number(w.weight) || 1)),
        reason: String(w.reason || ''),
      };
    }
  }
  const seats: string[] = Array.isArray(c.seats)
    ? (c.seats as unknown[]).map((s) => seatKey(String(s))).filter((k): k is string => Boolean(k))
    : [];
  const mode: 'quick' | 'full' = c.mode === 'quick' ? 'quick' : 'full';
  return {
    title: String(c.title || 'Roast Room'),
    decision: String(c.decision || c.title || ''),
    brief: String(c.brief || ''),
    mode,
    options: options.length ? options : [{ id: 'A', label: 'Proceed' }, { id: 'B', label: 'Wait' }],
    assumptions: Array.isArray(c.assumptions) ? c.assumptions.map(String) : [],
    weights,
    seats: seats.length ? [...new Set(seats)] : DEFAULT_OPERATOR_BOARD.slice(),
  };
}

/**
 * Loads a session folder (either an events.json bundle or a skill folder with council.json + round-1/2/3.md + verdict.json).
 */
export function loadFolderSession(dir: string, idOverride?: string): T.CouncilSessionPayload | null {
  const id = idOverride ?? path.basename(dir);
  const eventsFile = path.join(dir, 'events.json');
  if (fs.existsSync(eventsFile)) {
    const j = readJson<any>(eventsFile);
    if (!j) return null;
    return {
      id: String(j.id || id),
      title: String(j.title || j.prompt?.slice(0, 60) || id),
      prompt: String(j.prompt || ''),
      mode: j.mode === 'quick' ? 'quick' : 'full',
      status: String(j.status || 'done'),
      events: Array.isArray(j.events) ? j.events : [],
    };
  }

  const councilFile = path.join(dir, 'council.json');
  if (!fs.existsSync(councilFile)) return null;
  const c = readJson<any>(councilFile);
  if (!c) return null;

  const setup = normalizeFolderSetup(c);
  const st: InternalCouncilState = {
    ...setup,
    rounds: [],
    cards: { 1: {}, 2: {}, 3: {} },
    scores: {},
  };
  const events: T.CouncilStreamEvent[] = [];
  const t0 = mtime(councilFile);
  const emit = (type: string, data: Record<string, unknown> = {}) => {
    events.push({ type, t: events.length * 120, ...data });
  };

  emit('phase', { phase: 'setup', label: 'The Chair is reading your question', at: t0 });
  emit('setup', {
    title: st.title,
    decision: st.decision,
    brief: st.brief,
    options: st.options,
    assumptions: st.assumptions,
    weights: st.weights,
    seats: st.seats,
    mode: st.mode,
  });

  const emitRound = (r: number, label: string) => {
    const md = readText(path.join(dir, `round-${r}.md`));
    if (!md) return false;
    st.rounds.push(r);
    emit('phase', { phase: `round${r}`, label, at: mtime(path.join(dir, `round-${r}.md`)) });
    emit('round_start', { round: r });
    for (const k of st.seats) emit('seat_start', { round: r, seat: k });
    for (const card of splitCards(md)) {
      if (!st.seats.includes(card.key) || st.cards[r][card.key]) continue;
      const parsed = parseCard(card.text, st.options.map((o) => o.id));
      const quotes = checkQuotes(card.key, card.text);
      st.cards[r][card.key] = { text: card.text, parsed, quotes };
      emit('seat_done', {
        round: r,
        seat: card.key,
        text: card.text,
        parsed,
        quotes,
        name: SEATS_BY_KEY[card.key]?.name || card.key,
      });
    }
    st.scores[r] = computeRoundOptionScores(st, r);
    emit('round_done', { round: r, scores: st.scores[r] });
    return true;
  };

  if (emitRound(1, 'Round 1: opening positions')) {
    const cx = readJson<any>(path.join(dir, 'cruxes.json'));
    if (cx) {
      emit('phase', { phase: 'cruxes', label: 'The Chair is finding the fault lines' });
      const cruxes: T.CouncilCrux[] = (cx.cruxes || []).map((q: any) => ({
        question: String(q.question || ''),
        sides: (q.sides || []).map((sd: any) => ({
          position: String(sd.position || ''),
          seats: (sd.seats || []).map((s: string) => seatKey(s)).filter(Boolean),
        })),
      }));
      emit('cruxes', {
        cruxes,
        unanimous: Boolean(cx.unanimous),
        note: String(cx.note || ''),
        pressure: {},
      });
    }
  }

  if (emitRound(2, 'Round 2: the debate')) {
    const d = readJson<any>(path.join(dir, 'draft.json'));
    if (d) {
      emit('phase', { phase: 'draft', label: 'The Chair is weighing the debate' });
      st.draft = {
        option: String(d.option || ''),
        label: String(d.label || ''),
        recommendation: String(d.recommendation || ''),
        conditions: Array.isArray(d.conditions) ? d.conditions.map(String) : [],
        next_steps: Array.isArray(d.next_steps) ? d.next_steps.map(String) : [],
        cheapest_test: String(d.cheapest_test || ''),
        kill_criteria: String(d.kill_criteria || ''),
      };
      emit('draft', { draft: st.draft });
    }
  }

  emitRound(3, 'Round 3: the vote');

  const v = readJson<any>(path.join(dir, 'verdict.json'));
  if (v) {
    emit('phase', { phase: 'verdict', label: 'The Chair is writing the verdict' });
    const { last, finalScores, recommended, spreadF, confidence, support, votes } = computeFinalNumbers(st);
    const verdict = {
      label: String(v.label || 'RESHAPE'),
      call: String(v.call || ''),
      override_note: String(v.override_note || ''),
      why: Array.isArray(v.why) ? v.why : [],
      fights: Array.isArray(v.fights) ? v.fights : [],
      minority: v.minority || { seat: '', quote: '', would_have_to_be_true: '' },
      amendments: Array.isArray(v.amendments) ? v.amendments : [],
      conditions: Array.isArray(v.conditions) ? v.conditions : [],
      next_steps: Array.isArray(v.next_steps)
        ? v.next_steps.map((n: any) => (typeof n === 'string' ? { when: 'This week', action: n } : n))
        : [],
      cheapest_test: String(v.cheapest_test || ''),
      kill_criteria: String(v.kill_criteria || ''),
      revisit: String(v.revisit || ''),
      recommended: String(v.recommended || recommended),
      scores: finalScores,
      spread: spreadF,
      confidence,
      support,
      votes,
      disclaimer: COUNCIL_DISCLAIMER,
    };
    emit('verdict', { verdict, seats: buildVerdictSeats(st, last) });
    return {
      id,
      title: st.title,
      prompt: st.decision || st.brief,
      mode: st.mode,
      status: 'done',
      events,
    };
  }

  return {
    id,
    title: st.title,
    prompt: st.decision || st.brief,
    mode: st.mode,
    status: 'running',
    events,
  };
}

export function listFolderSessions(extraDirs: string[] = []): T.CouncilSessionSummary[] {
  const dirs = [BUNDLED_EXAMPLES_DIR, ...extraDirs].filter((d) => d && fs.existsSync(d));
  const seen = new Set<string>();
  const out: T.CouncilSessionSummary[] = [];

  for (const baseDir of dirs) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(baseDir);
    } catch {
      continue;
    }
    for (const folder of entries) {
      const full = path.join(baseDir, folder);
      let isDir = false;
      try {
        isDir = fs.statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      const loaded = loadFolderSession(full, folder);
      if (!loaded || seen.has(loaded.id)) continue;
      seen.add(loaded.id);
      out.push({
        id: loaded.id,
        title: loaded.title,
        prompt: loaded.prompt,
        mode: loaded.mode,
        status: loaded.status,
        source: baseDir === BUNDLED_EXAMPLES_DIR ? 'example' : 'folder',
      });
    }
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : -1));
}

export function findFolderSession(sessionId: string, extraDirs: string[] = []): T.CouncilSessionPayload | null {
  const dirs = [BUNDLED_EXAMPLES_DIR, ...extraDirs].filter((d) => d && fs.existsSync(d));
  for (const baseDir of dirs) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(baseDir);
    } catch {
      continue;
    }
    for (const folder of entries) {
      const full = path.join(baseDir, folder);
      const loaded = loadFolderSession(full, folder);
      if (loaded && (loaded.id === sessionId || folder === sessionId)) {
        return loaded;
      }
    }
  }
  return null;
}
