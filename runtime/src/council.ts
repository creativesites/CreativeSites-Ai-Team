import type * as T from './api/types.ts';

// Pure council scoring, adapted from roast-room's scoring.md. The Chair computes
// every number from the seats' cards; no number is taken on trust.

const BANDS = [
  { min: 7.5, label: 'Go' },
  { min: 6, label: 'Go with conditions' },
  { min: 4.5, label: 'Reshape' },
  { min: 0, label: "Don't do it" },
] as const;

export function bandFor(score: number): string {
  return BANDS.find((b) => score >= b.min)?.label ?? "Don't do it";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeCouncil(
  options: T.CouncilOption[],
  seats: T.CouncilSeat[],
  cards: T.CouncilCardResult[]
): T.CouncilResult {
  if (!options.length) throw new Error('No options to score');
  if (!seats.length) throw new Error('No seats to weigh');
  if (!cards.length) throw new Error('No cards have been submitted');
  const totalWeight = seats.reduce((sum, seat) => sum + seat.weight, 0);
  if (totalWeight <= 0) throw new Error('Seat weights must add up to more than zero');

  const weightFor = (seatName: string) => seats.find((s) => s.seat === seatName)?.weight ?? 0;
  const scores: T.CouncilScore[] = options
    .map((option) => {
      const sum = cards.reduce((acc, card) => acc + weightFor(card.seat) * (card.scores[option.id] ?? 0), 0);
      const formula = `(${cards
        .map((card) => `${weightFor(card.seat)}×${card.scores[option.id] ?? 0}`)
        .join(' + ')}) / ${totalWeight}`;
      return { id: option.id, label: option.label, score: round1(sum / totalWeight), formula };
    })
    .sort((a, b) => b.score - a.score);

  const top = scores[0]!;
  const topScores = cards.map((card) => card.scores[top.id] ?? 0);
  const spread = round1(Math.max(...topScores) - Math.min(...topScores));
  const allSameTop = cards.every((card) => {
    const cardTop = Object.entries(card.scores).sort((a, b) => b[1] - a[1])[0]?.[0];
    return cardTop === top.id;
  });
  const tooFastAgreement = allSameTop && spread <= 1;
  const disasterCapApplied = cards.some((card) => card.ruin[top.id] === 'likely');
  const cannotUndo = cards.some((card) => card.reversible === false);

  const confidence = round1(cards.reduce((sum, card) => sum + (card.confidence ?? card.pillar), 0) / cards.length);
  const support = top.score;
  let label = bandFor(top.score);
  const conditions: string[] = [];
  if (disasterCapApplied) {
    if (label === 'Go' || label === 'Go with conditions') label = 'Reshape';
    conditions.push(`A seat called ${top.id} a likely disaster; the verdict is capped at Reshape.`);
  }
  if (cannotUndo && (label === 'Go' || label === 'Go with conditions')) label = 'Go with conditions';
  if (cannotUndo) conditions.push('The change cannot be undone by a simple revert; a rollback plan is required.');
  if (tooFastAgreement) {
    conditions.push('Every seat agrees within a point; someone must argue the strongest alternative before the plan is accepted.');
  }
  const objectionCard = [...cards].sort((a, b) => (a.scores[top.id] ?? 0) - (b.scores[top.id] ?? 0))[0];
  const objection = objectionCard?.argument
    ? { text: objectionCard.argument, by: objectionCard.seat }
    : null;

  const call = [
    `${label}: ${top.label}.`,
    conditions.length ? `Conditions: ${conditions.join(' ')}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    label,
    call,
    scores,
    topId: top.id,
    spread,
    confidence,
    support,
    rules: { disasterCapApplied, cannotUndo, tooFastAgreement },
    conditions,
    objection,
  };
}
