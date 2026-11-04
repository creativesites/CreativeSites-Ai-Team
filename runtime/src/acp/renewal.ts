// Model-aware session renewal (programme plan K7, WP10 10.3 and 10.5).
//
// One decision path: baton.shouldRotateSession() calls evaluateRenewal() below. This module also owns the
// side effects that must happen once per band (events, the continuation package) and the consumption
// anomaly check. Nothing here calls an LLM, and nothing forces a session to renew except the existing
// rotate() at the next turn boundary.
//
// Known context window  -> utilisation % against the resolved policy (monitor 60 / prepare 75 / renew 85 / block 95).
// Unknown window        -> the existing absolute token thresholds, and every decision is labelled 'estimated'.

import type * as T from '../api/types.ts';
import type { Repo } from '../store/repo.ts';
import { providerOfAdapter } from '../usage/mapAcpUsage.ts';
import { compileBatonCapsule, shouldRotateSession, type BatonPolicy } from './baton.ts';

export type RenewalBand = 'healthy' | 'monitor' | 'prepare' | 'renew' | 'block';
export const BAND_ORDER: RenewalBand[] = ['healthy', 'monitor', 'prepare', 'renew', 'block'];

export interface RenewalThresholds {
  monitor: number;
  prepare: number;
  renew: number;
  block: number;
}

export const DEFAULT_RENEWAL_THRESHOLDS: RenewalThresholds = { monitor: 60, prepare: 75, renew: 85, block: 95 };

/** Settings keys: renewal.contextPct, renewal.byProvider.<id>, renewal.byModel.<id>; identity column renewal_policy. */
export const RENEWAL_SETTING_GLOBAL = 'renewal.contextPct';

type Layer = Partial<RenewalThresholds>;

function parseLayer(v: unknown): Layer | null {
  if (typeof v === 'number' && Number.isFinite(v)) return { renew: v };
  if (!v || typeof v !== 'object') return null;
  const out: Layer = {};
  for (const k of ['monitor', 'prepare', 'renew', 'block'] as const) {
    const n = (v as Record<string, unknown>)[k];
    if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

const valid = (t: RenewalThresholds) =>
  t.monitor > 0 && t.monitor < t.prepare && t.prepare < t.renew && t.renew < t.block && t.block <= 100;

export function resolveRenewalThresholds(
  repo: Repo,
  ctx: { agentId: string; provider: string | null; modelId: string | null }
): { thresholds: RenewalThresholds; layers: string[] } {
  let thresholds = { ...DEFAULT_RENEWAL_THRESHOLDS };
  const layers: string[] = ['default'];
  const apply = (name: string, raw: unknown) => {
    const layer = parseLayer(raw);
    if (!layer) return;
    const next = { ...thresholds, ...layer };
    if (!valid(next)) return; // an inconsistent layer is ignored rather than half-applied
    thresholds = next;
    layers.push(name);
  };
  apply('global', repo.getSetting(RENEWAL_SETTING_GLOBAL));
  if (ctx.provider) apply(`provider:${ctx.provider}`, repo.getSetting(`renewal.byProvider.${ctx.provider}`));
  if (ctx.modelId) apply(`model:${ctx.modelId}`, repo.getSetting(`renewal.byModel.${ctx.modelId}`));
  try {
    apply(`identity:${ctx.agentId}`, repo.getIdentity(ctx.agentId).renewalPolicy);
  } catch {
    /* identity gone */
  }
  return { thresholds, layers };
}

export interface RenewalEvaluation {
  band: RenewalBand;
  /** Index into BAND_ORDER. */
  rank: number;
  /** Utilisation %. null unless the context window is known. */
  pct: number | null;
  tokens: number;
  window: number | null;
  windowSource: 'reported' | 'registry' | 'unknown';
  /** 'actual' only when the adapter reported both used and size; otherwise 'estimated'. */
  measurement: 'actual' | 'estimated';
  thresholds: RenewalThresholds;
  thresholdLayers: string[];
  provider: string | null;
  modelId: string | null;
}

/** reported contextSize > model_registry > unknown. */
export function resolveContextWindow(
  repo: Repo,
  session: T.Session,
  provider: string | null
): { window: number | null; source: 'reported' | 'registry' | 'unknown' } {
  if (session.contextWindow && session.contextWindow > 0) return { window: session.contextWindow, source: 'reported' };
  const fromRegistry = repo.registryContextWindow(provider, session.modelId ?? null);
  if (fromRegistry && fromRegistry > 0) return { window: fromRegistry, source: 'registry' };
  return { window: null, source: 'unknown' };
}

function latestReportedContext(repo: Repo, sessionId: string): { used: number; size: number | null } | null {
  const row = repo
    .sqlite()
    .prepare(
      `SELECT context_used, context_size FROM usage
        WHERE session_id = ? AND context_used IS NOT NULL AND measurement <> 'unavailable'
        ORDER BY rowid DESC LIMIT 1`
    )
    .get(sessionId) as { context_used: number; context_size: number | null } | undefined;
  return row ? { used: row.context_used, size: row.context_size } : null;
}

export function evaluateRenewal(
  repo: Repo,
  session: T.Session,
  opts: { fallbackTokens: number; policy: BatonPolicy }
): RenewalEvaluation {
  const provider = providerOfAdapter(session.adapterId);
  const modelId = session.modelId ?? null;
  const { thresholds, layers } = resolveRenewalThresholds(repo, { agentId: session.agentId, provider, modelId });
  const { window, source } = resolveContextWindow(repo, session, provider);
  const reported = latestReportedContext(repo, session.id);
  const tokens = reported ? reported.used : opts.fallbackTokens;

  let band: RenewalBand = 'healthy';
  let pct: number | null = null;
  if (window) {
    pct = Math.round((tokens / window) * 1000) / 10;
    if (pct >= thresholds.block) band = 'block';
    else if (pct >= thresholds.renew) band = 'renew';
    else if (pct >= thresholds.prepare) band = 'prepare';
    else if (pct >= thresholds.monitor) band = 'monitor';
  } else {
    // Unknown window: map the existing absolute thresholds onto the bands. soft = renew, hard = block.
    const renewAt = opts.policy.softContextTokens;
    const blockAt = Math.max(opts.policy.hardContextTokens, renewAt + 1);
    const monitorAt = Math.round((renewAt * thresholds.monitor) / thresholds.renew);
    const prepareAt = Math.round((renewAt * thresholds.prepare) / thresholds.renew);
    if (tokens >= blockAt) band = 'block';
    else if (tokens >= renewAt) band = 'renew';
    else if (tokens >= prepareAt) band = 'prepare';
    else if (tokens >= monitorAt) band = 'monitor';
  }
  return {
    band,
    rank: BAND_ORDER.indexOf(band),
    pct,
    tokens,
    window,
    windowSource: source,
    measurement: window && reported && reported.size ? 'actual' : 'estimated',
    thresholds,
    thresholdLayers: layers,
    provider,
    modelId,
  };
}

// ------------------------------------------------------------------ once-per-band side effects

/**
 * Called when a turn ends. Emits `session.context_threshold` once for each band the session has newly
 * reached, and at `prepare` or beyond compiles and stores the continuation package. Idempotent.
 */
export function recordContextBands(repo: Repo, sessionId: string): { emitted: RenewalBand[]; evaluation: RenewalEvaluation } {
  const session = repo.getSession(sessionId);
  const check = shouldRotateSession(repo, session);
  const ev = evaluateRenewal(repo, session, { fallbackTokens: check.contextTokens, policy: check.policy });
  const seen = session.contextBand ? BAND_ORDER.indexOf(session.contextBand as RenewalBand) : 0;
  const emitted: RenewalBand[] = [];
  if (ev.rank > Math.max(0, seen)) {
    for (let i = Math.max(1, seen + 1); i <= ev.rank; i++) {
      const band = BAND_ORDER[i]!;
      repo.emitEvent({
        type: 'session.context_threshold',
        subjectId: session.id,
        subjectType: 'session',
        sessionId: session.id,
        jobId: session.jobId ?? null,
        taskId: session.taskId ?? null,
        actorId: session.agentId,
        actorKind: 'system',
        idempotencyKey: `ctx-threshold:${session.id}:${band}`,
        payload: {
          band,
          pct: ev.pct,
          tokens: ev.tokens,
          window: ev.window,
          windowSource: ev.windowSource,
          measurement: ev.measurement,
          thresholds: ev.thresholds,
          recommendation: band === 'renew' || band === 'block' ? 'renew' : band === 'prepare' ? 'prepare_continuation' : 'monitor',
        },
      });
      emitted.push(band);
    }
    let pkg: Record<string, unknown> | undefined;
    if (ev.rank >= 2) {
      try {
        pkg = compileBatonCapsule(repo, session.id).continuation as unknown as Record<string, unknown>;
      } catch {
        /* a package that cannot be compiled must not break the turn; rotate() compiles its own */
      }
    }
    repo.updateSession(session.id, { contextBand: ev.band, ...(pkg ? { continuationPackage: pkg } : {}) });
  }
  return { emitted, evaluation: ev };
}

// ------------------------------------------------------------------ 10.5 anomaly

export const ANOMALY_FACTOR = 3;
export const ANOMALY_MIN_TOKENS = 2000;
export const ANOMALY_WINDOW_TURNS = 50;
export const ANOMALY_MIN_HISTORY = 5;

export interface AnomalyResult {
  anomaly: boolean;
  tokens: number;
  medianTokens: number | null;
  ratio: number | null;
  samples: number;
}

function medianOf(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Compares the identity's newest usage record (one record is one turn's report) with the median of the
 * previous 50. More than 3x the median, and more than 2000 tokens, is an anomaly: the event recommends
 * renewal but nothing is forced.
 */
export function detectConsumptionAnomaly(repo: Repo, sessionId: string): AnomalyResult {
  const session = repo.getSession(sessionId);
  const rows = repo
    .sqlite()
    .prepare(
      `SELECT u.id, u.input_tokens + u.output_tokens AS tokens
         FROM usage u LEFT JOIN sessions s ON s.id = u.session_id
        WHERE COALESCE(u.agent_id, s.agent_id) = ?
          AND u.measurement IN ('actual', 'estimated')
          AND u.input_tokens + u.output_tokens > 0
        ORDER BY u.rowid DESC LIMIT ?`
    )
    .all(session.agentId, ANOMALY_WINDOW_TURNS + 1) as { id: string; tokens: number }[];
  const none: AnomalyResult = { anomaly: false, tokens: 0, medianTokens: null, ratio: null, samples: 0 };
  if (!rows.length) return none;
  const [latest, ...history] = rows;
  const med = medianOf(history.map((r) => r.tokens));
  if (history.length < ANOMALY_MIN_HISTORY || med == null || med <= 0) {
    return { ...none, tokens: latest!.tokens, medianTokens: med, samples: history.length };
  }
  const ratio = latest!.tokens / med;
  const anomaly = latest!.tokens > ANOMALY_FACTOR * med && latest!.tokens > ANOMALY_MIN_TOKENS;
  if (anomaly) {
    repo.emitEvent({
      type: 'session.context_threshold',
      subjectId: session.id,
      subjectType: 'session',
      sessionId: session.id,
      jobId: session.jobId ?? null,
      taskId: session.taskId ?? null,
      actorId: session.agentId,
      actorKind: 'system',
      idempotencyKey: `ctx-anomaly:${latest!.id}`,
      payload: {
        band: 'anomaly',
        tokens: latest!.tokens,
        medianTokens: med,
        ratio: Math.round(ratio * 10) / 10,
        samples: history.length,
        measurement: 'actual',
        recommendation: 'renew',
        usageId: latest!.id,
      },
    });
  }
  return { anomaly, tokens: latest!.tokens, medianTokens: med, ratio, samples: history.length };
}

// ------------------------------------------------------------------ session.renewed

export type RenewalTrigger = 'threshold' | 'anomaly' | 'manual';

export function renewalTrigger(reason: string | undefined): RenewalTrigger {
  if (reason === 'anomaly') return 'anomaly';
  if (!reason || reason === 'manual') return 'manual';
  return 'threshold';
}

export function emitSessionRenewed(repo: Repo, input: { from: string; to: string; reason: string; agentId: string; jobId: string | null; taskId: string | null }): void {
  repo.emitEvent({
    type: 'session.renewed',
    subjectId: input.from,
    subjectType: 'session',
    sessionId: input.to,
    jobId: input.jobId,
    taskId: input.taskId,
    actorId: input.agentId,
    actorKind: 'system',
    payload: { from: input.from, to: input.to, reason: input.reason, trigger: renewalTrigger(input.reason), agentId: input.agentId },
  });
}

/** Called at the end of every turn: band events, the prepare-band package and the anomaly check. Never throws. */
export function afterTurn(repo: Repo, sessionId: string): void {
  try {
    recordContextBands(repo, sessionId);
  } catch {
    /* renewal bookkeeping must never fail a turn */
  }
  try {
    detectConsumptionAnomaly(repo, sessionId);
  } catch {
    /* same */
  }
}
