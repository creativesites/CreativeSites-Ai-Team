// Pure attribution of subscription-plan usage to tasks (programme plan K6).
//
// Providers expose only a percentage of a limit, never per-task usage. A task's
// share is therefore an ESTIMATE: the change in the percentage between two
// snapshots, split across the tasks that were active on the account, in
// proportion to active time. Every result carries measurement = 'estimated'.

export interface PctSnapshot {
  capturedAt: string;
  sessionPct: number | null;
  sessionResetsAt: string | null;
  weeklyPct: number | null;
  weeklyResetsAt: string | null;
}

export interface TaskInterval {
  id: string;
  startedAt: string;
  /** null means still running: it is treated as running until the end of the window. */
  endedAt: string | null;
}

export type UnknownReason = 'window_reset' | 'no_change_data' | 'no_active_time' | 'decreased';

export interface TaskAttribution {
  id: string;
  /** Milliseconds this task was active inside the snapshot window. */
  activeMs: number;
  weeklyPct: number | null;
  sessionPct: number | null;
  /** Most tasks active at once on the account during this task's time. */
  concurrentMax: number;
  /** True when the delta was shared with another task, so the split is a guess. */
  sharedWithOthers: boolean;
  measurement: 'estimated';
}

export interface AttributionResult {
  tasks: TaskAttribution[];
  weeklyDelta: number | null;
  sessionDelta: number | null;
  weeklyUnknown: UnknownReason | null;
  sessionUnknown: UnknownReason | null;
  measurement: 'estimated';
}

/** Reset times are typed by hand from a relative display, so allow some jitter before calling it a new window. */
const RESET_TOLERANCE_MS = 60 * 60 * 1000;

const ms = (iso: string): number => Date.parse(iso);

/**
 * The change in a percentage between two snapshots, or null with a reason when it
 * cannot be known. A reset between snapshots is never turned into a negative number.
 */
export function pctDelta(
  before: number | null,
  after: number | null,
  beforeResetsAt: string | null,
  afterResetsAt: string | null,
  afterCapturedAt: string
): { delta: number | null; unknown: UnknownReason | null } {
  if (before == null || after == null) return { delta: null, unknown: 'no_change_data' };
  if (beforeResetsAt && afterResetsAt && Math.abs(ms(afterResetsAt) - ms(beforeResetsAt)) > RESET_TOLERANCE_MS) {
    return { delta: null, unknown: 'window_reset' };
  }
  if (beforeResetsAt && ms(afterCapturedAt) > ms(beforeResetsAt) + RESET_TOLERANCE_MS) {
    return { delta: null, unknown: 'window_reset' };
  }
  if (after < before) return { delta: null, unknown: 'decreased' };
  return { delta: after - before, unknown: null };
}

interface Clipped {
  id: string;
  start: number;
  end: number;
}

export function attributeUsage(before: PctSnapshot, after: PctSnapshot, intervals: TaskInterval[]): AttributionResult {
  const winStart = ms(before.capturedAt);
  const winEnd = ms(after.capturedAt);
  const weekly = pctDelta(before.weeklyPct, after.weeklyPct, before.weeklyResetsAt, after.weeklyResetsAt, after.capturedAt);
  const session = pctDelta(before.sessionPct, after.sessionPct, before.sessionResetsAt, after.sessionResetsAt, after.capturedAt);

  const clipped: Clipped[] = [];
  for (const iv of intervals) {
    const start = Math.max(winStart, ms(iv.startedAt));
    const end = Math.min(winEnd, iv.endedAt ? ms(iv.endedAt) : winEnd);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) clipped.push({ id: iv.id, start, end });
  }

  // Sweep the window: in each segment the tasks active share that segment equally.
  const points = [...new Set(clipped.flatMap((c) => [c.start, c.end]))].sort((a, b) => a - b);
  const weight = new Map<string, number>(); // equal-share weight, in ms
  const activeMs = new Map<string, number>();
  const concurrent = new Map<string, number>();
  const shared = new Set<string>();
  let totalActive = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const active = clipped.filter((c) => c.start <= a && c.end >= b);
    if (!active.length) continue;
    const len = b - a;
    totalActive += len;
    for (const c of active) {
      weight.set(c.id, (weight.get(c.id) ?? 0) + len / active.length);
      activeMs.set(c.id, (activeMs.get(c.id) ?? 0) + len);
      concurrent.set(c.id, Math.max(concurrent.get(c.id) ?? 0, active.length));
      if (active.length > 1) shared.add(c.id);
    }
  }
  const totalWeight = [...weight.values()].reduce((s, v) => s + v, 0);

  const share = (delta: number | null, id: string): number | null => {
    if (delta == null || totalActive === 0 || totalWeight === 0) return null;
    return Math.max(0, (delta * (weight.get(id) ?? 0)) / totalWeight);
  };

  const ids = [...new Set(intervals.map((i) => i.id))];
  const tasks: TaskAttribution[] = ids.map((id) => ({
    id,
    activeMs: activeMs.get(id) ?? 0,
    weeklyPct: share(weekly.delta, id),
    sessionPct: share(session.delta, id),
    concurrentMax: concurrent.get(id) ?? 0,
    sharedWithOthers: shared.has(id),
    measurement: 'estimated',
  }));

  return {
    tasks,
    weeklyDelta: weekly.delta,
    sessionDelta: session.delta,
    weeklyUnknown: weekly.unknown ?? (weekly.delta != null && totalActive === 0 ? 'no_active_time' : null),
    sessionUnknown: session.unknown ?? (session.delta != null && totalActive === 0 ? 'no_active_time' : null),
    measurement: 'estimated',
  };
}
