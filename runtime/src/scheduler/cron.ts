// Timezone-aware 5-field cron (WP6 6.1). No dependencies: wall-clock fields in an IANA zone come
// from Intl.DateTimeFormat. Fields: min hour dom month dow; lists, ranges, steps and `*` are supported.

export interface ZonedParts {
  minute: number;
  hour: number;
  dom: number;
  month: number;
  dow: number;
  /** YYYY-MM-DD in the zone. */
  date: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(at: Date | number, timeZone = 'UTC'): ZonedParts {
  const d = typeof at === 'number' ? new Date(at) : at;
  const p: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(d)) p[part.type] = part.value;
  const month = Number(p.month);
  const dom = Number(p.day);
  return {
    minute: Number(p.minute),
    hour: Number(p.hour) % 24,
    dom,
    month,
    dow: DOW[p.weekday ?? ''] ?? 0,
    date: `${p.year}-${String(month).padStart(2, '0')}-${String(dom).padStart(2, '0')}`,
  };
}

/** Calendar date (YYYY-MM-DD) of an instant in a zone. */
export const dateInZone = (at: Date | number, timeZone = 'UTC'): string => zonedParts(at, timeZone).date;

function matchesField(spec: string, value: number, isDow = false): boolean {
  if (spec === '*') return true;
  for (const token of spec.split(',')) {
    const [range, stepRaw] = token.split('/');
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!(step > 0)) continue;
    let lo: number;
    let hi: number;
    if (range === '*' || range === undefined) {
      lo = 0;
      hi = 1000;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-').map(Number);
      lo = a!;
      hi = b!;
    } else {
      lo = Number(range);
      hi = stepRaw === undefined ? lo : 1000;
    }
    if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
    const hit = (v: number) => v >= lo && v <= hi && (v - lo) % step === 0;
    if (hit(value) || (isDow && value === 0 && hit(7))) return true;
  }
  return false;
}

export interface ParsedCron {
  fields: [string, string, string, string, string];
}

export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression "${expr}" (expected 5 fields: min hour dom month dow)`);
  return { fields: parts as ParsedCron['fields'] };
}

export function cronMatches(cron: ParsedCron, at: Date | number, timeZone = 'UTC'): boolean {
  const p = zonedParts(at, timeZone);
  const [min, hour, dom, mon, dow] = cron.fields;
  return (
    matchesField(min, p.minute) &&
    matchesField(hour, p.hour) &&
    matchesField(dom, p.dom) &&
    matchesField(mon, p.month) &&
    matchesField(dow, p.dow, true)
  );
}

const MINUTE = 60_000;

/** The first matching minute strictly after `from`, or null within `horizonDays` (default 366). */
export function nextCronSlot(expr: string, from: Date | number, timeZone = 'UTC', horizonDays = 366): Date | null {
  const cron = parseCron(expr);
  let t = Math.floor((typeof from === 'number' ? from : from.getTime()) / MINUTE) * MINUTE + MINUTE;
  const end = t + horizonDays * 24 * 60 * MINUTE;
  for (; t <= end; t += MINUTE) {
    if (cronMatches(cron, t, timeZone)) return new Date(t);
  }
  return null;
}
