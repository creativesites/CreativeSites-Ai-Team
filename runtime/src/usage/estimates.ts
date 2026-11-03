// Per-task-type usage estimates (programme plan K6): the median attributed weekly
// percentage per (task type, model, agent), with the sample size. Always an estimate.

import type { DatabaseSync } from 'node:sqlite';

export interface UsageEstimate {
  taskType: string | null;
  modelId: string | null;
  agentId: string | null;
  medianWeeklyPct: number;
  n: number;
  measurement: 'estimated';
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function computeEstimates(db: DatabaseSync, opts: { accountId?: string } = {}): UsageEstimate[] {
  const rows = db
    .prepare(
      `SELECT task_type, model_id, agent_id, attributed_weekly_pct AS pct
         FROM task_usage
        WHERE attributed_weekly_pct IS NOT NULL ${opts.accountId ? 'AND account_id = ?' : ''}`
    )
    .all(...(opts.accountId ? [opts.accountId] : [])) as Array<{
    task_type: string | null;
    model_id: string | null;
    agent_id: string | null;
    pct: number;
  }>;
  const groups = new Map<string, { key: { taskType: string | null; modelId: string | null; agentId: string | null }; vals: number[] }>();
  for (const r of rows) {
    const k = JSON.stringify([r.task_type, r.model_id, r.agent_id]);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { key: { taskType: r.task_type, modelId: r.model_id, agentId: r.agent_id }, vals: [] }));
    g.vals.push(Number(r.pct));
  }
  return [...groups.values()]
    .map((g) => ({ ...g.key, medianWeeklyPct: median(g.vals)!, n: g.vals.length, measurement: 'estimated' as const }))
    .sort((a, b) => b.medianWeeklyPct - a.medianWeeklyPct || b.n - a.n);
}
