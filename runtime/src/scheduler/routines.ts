// Recurring routines (WP6 6.7): seeded once each by name, run by the central scheduler, each behind its own
// setting that defaults to off. With the flag off the slot is recorded as skipped/disabled.

import { createIntake } from '../intake/intake.ts';
import { sweepTasks } from '../lifecycle/sweeper.ts';
import { dateInZone } from './cron.ts';
import { Scheduler } from './scheduler.ts';
import { STANDUP_CRON, STANDUP_FLAG, STANDUP_SCHEDULE, STANDUP_TZ, type StandupService } from '../standup/pipeline.ts';
import type { Repo } from '../store/repo.ts';
import type { AdapterInfo } from '../api/types.ts';

export const ROUTINES = {
  standup: { name: STANDUP_SCHEDULE, cron: STANDUP_CRON, timezone: STANDUP_TZ, flag: STANDUP_FLAG },
  sweep: { name: 'stale-task-sweep', cron: '*/10 * * * *', timezone: 'UTC', flag: 'workflow.staleTaskSweep' },
  health: { name: 'agent-health', cron: '0 * * * *', timezone: 'UTC', flag: 'workflow.agentHealth' },
  retro: { name: 'weekly-retro', cron: '0 16 * * 5', timezone: 'Africa/Lusaka', flag: 'workflow.weeklyRetro' },
  okr: { name: 'weekly-okr-review', cron: '0 9 * * 1', timezone: 'Africa/Lusaka', flag: 'workflow.weeklyOkrReview' },
} as const;

export interface RoutineDeps {
  repo: Repo;
  scheduler: Scheduler;
  standups: StandupService;
  /** Forces an adapter readiness probe refresh. */
  probe: (force: boolean) => AdapterInfo[];
}

const JOB_BRIEFS = {
  'weekly-retro': { title: 'Weekly retrospective', body: 'What shipped this week, what went wrong, what to change next week. Review the stand-ups, blockers and failed or retried tasks from the past seven days and propose concrete changes.' },
  'weekly-okr-review': { title: 'Weekly OKR review', body: 'Review progress on every active objective and key result, flag the ones at risk, and propose what to prioritise this week.' },
} as const;

function weeklyJob(deps: RoutineDeps, name: keyof typeof JOB_BRIEFS, dueAt: string, tz: string): string {
  const brief = JOB_BRIEFS[name];
  const week = dateInZone(Date.parse(dueAt), tz);
  const res = createIntake(deps.repo, {
    text: `${brief.title}\n\n${brief.body}`,
    source: 'schedule',
    sourceRef: `${name}:${week}`,
    requestedBy: deps.repo.ownerId(),
  });
  return `${res.duplicate ? 'linked to open' : 'created'} job ${res.job.id} (${brief.title} ${week})`;
}

/** Registers the handlers and seeds every routine's schedule by name. Idempotent; call on every start. */
export function installRoutines(deps: RoutineDeps, nowIso: string): void {
  const { scheduler } = deps;
  scheduler.register(ROUTINES.standup.name, { flag: ROUTINES.standup.flag, handler: (ctx) => deps.standups.onSlot(ctx) });
  scheduler.register(ROUTINES.sweep.name, {
    flag: ROUTINES.sweep.flag,
    handler: (ctx) => {
      const r = sweepTasks(deps.repo, () => ctx.now);
      return `ackTimeouts=${r.ackTimeouts.length} retries=${r.retriesScheduled.length} stale=${r.stale.length}`;
    },
  });
  scheduler.register(ROUTINES.health.name, {
    flag: ROUTINES.health.flag,
    handler: () => {
      const list = deps.probe(true);
      return `${list.filter((a) => a.installed).length}/${list.length} adapters installed`;
    },
  });
  scheduler.register(ROUTINES.retro.name, { flag: ROUTINES.retro.flag, handler: (ctx) => weeklyJob(deps, 'weekly-retro', ctx.dueAt, ROUTINES.retro.timezone) });
  scheduler.register(ROUTINES.okr.name, { flag: ROUTINES.okr.flag, handler: (ctx) => weeklyJob(deps, 'weekly-okr-review', ctx.dueAt, ROUTINES.okr.timezone) });
  scheduler.addPoller((now) => {
    deps.standups.poll(now);
  });

  for (const r of Object.values(ROUTINES)) {
    scheduler.ensureSchedule(r.name, { cron: r.cron, timezone: r.timezone, prompt: `Recurring routine ${r.name}`, reason: 'Seeded by the runtime (WP6)' }, nowIso);
  }
}
