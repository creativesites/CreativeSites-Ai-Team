// WP3 3.1: choose the Planning Council seats for a job from the real identities.
// Vision §4.3: select specialists by request; never seat someone who cannot work now.
import type * as T from '../api/types.ts';
import { ConflictError, InputError, NotFoundError } from '../errors.ts';
import type { Repo } from '../store/repo.ts';

export const PLANNING_DEPARTMENT = 'planning-strategy';
export const MIN_SEATS = 2;
export const MAX_SEATS = 4;

export interface SelectionRequest {
  workflow?: string | null;
  kind?: string | null;
  title?: string | null;
  brief?: string | null;
  requiredSkills?: string[];
  /** Identity ids that replace the automatic choice (owner override). */
  override?: string[];
}

/** Why an identity cannot take a seat now, or null. Same rules as the dispatcher's readiness check. */
export type Unavailable = (agent: T.Identity, nowMs: number) => string | null;

const STOP = new Set(
  'the and for with that this from into onto have has had will would should could must need needs want make made then than them they their there what when where which while about after before over under also just only more most some such very your our out not are was were been being can may per via its it\'s job task work plan build fix add use using new'.split(' ')
);

export function keywordsOf(req: SelectionRequest): string[] {
  const text = [req.title ?? '', req.brief ?? '', req.kind ?? '', ...(req.requiredSkills ?? [])].join(' ').toLowerCase();
  const words = text.split(/[^a-z0-9-]+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set([...words, ...(req.requiredSkills ?? []).map((x) => x.toLowerCase())])].slice(0, 60);
}

/** Readiness used by the dispatcher (dispatch/dispatcher.ts chooseAssignee), without the per-agent session cap. */
export function readinessCheck(repo: Repo, adapterBlockedReason: (agent: T.Identity) => string | null): Unavailable {
  return (agent, nowMs) => {
    if (agent.archived) return `${agent.id} is archived`;
    if (agent.rateLimitResetAt && Date.parse(agent.rateLimitResetAt) > nowMs) return `${agent.id} is rate-limited until ${agent.rateLimitResetAt}`;
    if (agent.statusState === 'rate_limited') return `${agent.id} is rate-limited`;
    const adapterId = (agent.adapterId ?? '').toLowerCase();
    const row = adapterId ? repo.listAdapterOverrides().find((a) => String(a.id) === adapterId) : undefined;
    if (row?.rate_limit_reset_at && Date.parse(String(row.rate_limit_reset_at)) > nowMs) {
      return `adapter ${adapterId} is rate-limited until ${String(row.rate_limit_reset_at)}`;
    }
    const blocked = adapterBlockedReason(agent);
    return blocked ? `${agent.id}: ${blocked}` : null;
  };
}

function termsOf(agent: T.Identity): string[] {
  const raw = [agent.role ?? '', agent.lane ?? '', agent.departmentId ?? '', ...(agent.capabilities ?? []), ...(agent.skills ?? [])].join(' ').toLowerCase();
  return [...new Set(raw.split(/[^a-z0-9-]+/).filter((w) => w.length >= 3))];
}

/**
 * Picks 2-4 seats. Planning & Strategy members first, then identities whose role,
 * capabilities or skills match the request's keywords. Rate-limited identities and
 * identities whose adapter cannot start are excluded, each with a reason. A quick
 * job does not convene a council (returns `skipped`).
 */
export function selectCouncil(repo: Repo, req: SelectionRequest, unavailable: Unavailable, now = new Date()): T.CouncilSelection {
  const selectedAt = now.toISOString();
  const keywords = keywordsOf(req);
  if (req.workflow === 'quick') {
    return {
      skipped: 'Quick workflow: a single owner works directly, so no Planning Council is convened (vision §4.2).',
      keywords,
      seats: [],
      excluded: [],
      override: false,
      selectedAt,
    };
  }
  const nowMs = now.getTime();
  const excluded: T.CouncilSelection['excluded'] = [];

  if (req.override?.length) {
    const ids = [...new Set(req.override.map((x) => String(x).toLowerCase()))];
    if (ids.length > MAX_SEATS) throw new InputError(`A council has at most ${MAX_SEATS} seats`);
    const seats: T.CouncilSeatSelection[] = [];
    for (const id of ids) {
      let agent: T.Identity;
      try {
        agent = repo.getIdentity(id);
      } catch (e) {
        if (e instanceof NotFoundError) throw new InputError(`seat identity ${id} does not exist`);
        throw e;
      }
      const why = unavailable(agent, nowMs);
      if (why) {
        excluded.push({ identityId: id, reason: why });
        continue;
      }
      const planner = agent.departmentId === PLANNING_DEPARTMENT;
      seats.push({ identityId: id, weight: planner ? 3 : 2, score: 0, reasons: ['chosen by the owner (seat override)', ...(planner ? ['Planning & Strategy department'] : [])] });
    }
    if (seats.length < MIN_SEATS) {
      throw new ConflictError(`A council needs at least ${MIN_SEATS} available seats; ${excluded.map((e) => `${e.identityId}: ${e.reason}`).join('; ') || 'too few seats given'}`);
    }
    return { skipped: null, keywords, seats, excluded, override: true, selectedAt };
  }

  const candidates: T.CouncilSeatSelection[] = [];
  for (const agent of repo.listIdentities()) {
    if (agent.isOwner || agent.approvalLevel === 'owner') continue;
    const reasons: string[] = [];
    let score = 0;
    if (agent.departmentId === PLANNING_DEPARTMENT) {
      score += 10;
      reasons.push('Planning & Strategy department');
    }
    const terms = termsOf(agent);
    const matched = keywords.filter((k) => terms.some((t) => t === k || (k.length >= 5 && (t.startsWith(k) || k.startsWith(t)) && t.length >= 5)));
    if (matched.length) {
      score += 2 * matched.length;
      reasons.push(`role/capabilities/skills match the request: ${matched.slice(0, 6).join(', ')}`);
    }
    if (agent.seniority === 'lead' || agent.seniority === 'exec' || agent.approvalLevel === 'lead') {
      score += 1;
      reasons.push('lead seniority');
    }
    const why = unavailable(agent, nowMs);
    if (why) {
      excluded.push({ identityId: agent.id, reason: why });
      continue;
    }
    candidates.push({ identityId: agent.id, weight: agent.departmentId === PLANNING_DEPARTMENT ? 3 : matched.length ? 2 : 1, score, reasons });
  }
  candidates.sort((a, b) => b.score - a.score || a.identityId.localeCompare(b.identityId));
  const strong = candidates.filter((c) => c.score > 0).slice(0, MAX_SEATS);
  const seats = [...strong];
  for (const c of candidates) {
    if (seats.length >= MIN_SEATS) break;
    if (!seats.includes(c)) seats.push({ ...c, reasons: [...c.reasons, 'fills the minimum council size (no stronger match available)'] });
  }
  if (seats.length < MIN_SEATS) {
    throw new ConflictError(
      `A council needs at least ${MIN_SEATS} available seats; found ${seats.length}.${excluded.length ? ` Excluded: ${excluded.map((e) => `${e.identityId} (${e.reason})`).join('; ')}` : ''}`
    );
  }
  for (const c of candidates) if (!seats.some((s) => s.identityId === c.identityId)) excluded.push({ identityId: c.identityId, reason: 'not selected: weaker match than the chosen seats' });
  return { skipped: null, keywords, seats, excluded, override: false, selectedAt };
}
