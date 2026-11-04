// Duplicate detection (WP2 task 2.2): normalised token-set Jaccard similarity against open jobs.

export const DUPLICATE_THRESHOLD = 0.8;

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'in', 'on', 'for', 'is', 'it', 'please', 'we', 'i']);

export function tokenSet(text: string): Set<string> {
  const tokens = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
  return new Set(tokens);
}

export function jaccard(a: string, b: string): number {
  const x = tokenSet(a);
  const y = tokenSet(b);
  if (!x.size && !y.size) return 0;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / (x.size + y.size - inter);
}

export interface DedupeCandidate {
  id: string;
  number: number;
  title: string;
  brief: string;
}

export interface DuplicateMatch {
  jobId: string;
  number: number;
  score: number;
  reason: string;
}

/** Best match at or above the threshold, or null. Compares against the stored brief (the raw request) and the title. */
export function findDuplicate(text: string, candidates: DedupeCandidate[], threshold = DUPLICATE_THRESHOLD): DuplicateMatch | null {
  let best: DuplicateMatch | null = null;
  for (const c of candidates) {
    const score = Math.max(jaccard(text, c.brief || c.title), jaccard(text, c.title));
    if (score >= threshold && (!best || score > best.score)) {
      best = {
        jobId: c.id,
        number: c.number,
        score,
        reason: `token similarity ${score.toFixed(2)} >= ${threshold} with open job #${c.number} "${c.title}"`,
      };
    }
  }
  return best;
}
