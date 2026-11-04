// Display helpers for the truth rule: a missing number is "UNKNOWN", never a guess or a zero.

export const UNKNOWN = 'UNKNOWN';

export function hours(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? UNKNOWN : `${v.toFixed(2)} h`;
}

export function percent(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? UNKNOWN : `${Math.round(v * 10) / 10}%`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return UNKNOWN;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNKNOWN;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return UNKNOWN;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNKNOWN;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function duration(ms: number | null | undefined): string {
  if (ms == null) return 'running';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Monday 00:00 (local) of the week containing `at`, and the following Monday, as ISO strings. */
export function weekRange(at = new Date(), offsetWeeks = 0): { from: string; to: string } {
  const start = new Date(at.getFullYear(), at.getMonth(), at.getDate() - ((at.getDay() + 6) % 7) + offsetWeeks * 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { from: start.toISOString(), to: end.toISOString() };
}
