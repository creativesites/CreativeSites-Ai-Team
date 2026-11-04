// Subscription AI accounts and their limit snapshots (programme plan K6/K9).
//
// The team uses subscription plans, not API billing. No provider publishes token
// caps or prices, so none are stored or derived here: only percentages that a
// person read from `/usage` (or Settings > Usage), and Gemini CLI request counts.
// Account labels come from the local database only; this repository carries none.

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { InputError, NotFoundError } from '../store/repo.ts';

export type Provider = 'anthropic' | 'google';
export type LimitModel = 'claude_5h_weekly_pct' | 'gemini_app_5h_weekly_pct' | 'gemini_cli_requests_per_day';
export type SnapshotSource = 'manual' | 'cli_capture' | 'runtime_count';
export type Measurement = 'actual' | 'estimated';

export const PROVIDERS: Provider[] = ['anthropic', 'google'];
export const LIMIT_MODELS: LimitModel[] = ['claude_5h_weekly_pct', 'gemini_app_5h_weekly_pct', 'gemini_cli_requests_per_day'];
export const SNAPSHOT_SOURCES: SnapshotSource[] = ['manual', 'cli_capture', 'runtime_count'];
/** The Gemini CLI daily request quota (owner-stated). A request count, not a token cap. */
export const GEMINI_CLI_DAILY_QUOTA = 1500;

export interface AiAccount {
  id: string;
  provider: Provider;
  plan: string;
  label: string;
  ownerScope: string;
  limitModel: LimitModel;
  dailyRequestQuota: number | null;
  adapterAccountId: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface LimitSnapshot {
  id: string;
  accountId: string;
  capturedAt: string;
  sessionPct: number | null;
  sessionResetsAt: string | null;
  weeklyPct: number | null;
  weeklyResetsAt: string | null;
  requestsToday: number | null;
  source: SnapshotSource;
  measurement: Measurement;
  note: string | null;
}

export interface CreateAccountInput {
  id?: string;
  provider: string;
  plan: string;
  label: string;
  ownerScope?: string;
  limitModel: string;
  dailyRequestQuota?: number | null;
  adapterAccountId?: string | null;
}

export interface SnapshotInput {
  capturedAt?: string;
  sessionPct?: number | null;
  sessionResetsAt?: string | null;
  weeklyPct?: number | null;
  weeklyResetsAt?: string | null;
  requestsToday?: number | null;
  source?: string;
  measurement?: string;
  note?: string | null;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v ?? '');
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

export function toAccount(r: Row): AiAccount {
  return {
    id: str(r.id),
    provider: str(r.provider) as Provider,
    plan: str(r.plan),
    label: str(r.label),
    ownerScope: str(r.owner_scope),
    limitModel: str(r.limit_model) as LimitModel,
    dailyRequestQuota: numOrNull(r.daily_request_quota),
    adapterAccountId: strOrNull(r.adapter_account_id),
    createdAt: str(r.created_at),
    archivedAt: strOrNull(r.archived_at),
  };
}

export function toSnapshot(r: Row): LimitSnapshot {
  return {
    id: str(r.id),
    accountId: str(r.account_id),
    capturedAt: str(r.captured_at),
    sessionPct: numOrNull(r.session_pct),
    sessionResetsAt: strOrNull(r.session_resets_at),
    weeklyPct: numOrNull(r.weekly_pct),
    weeklyResetsAt: strOrNull(r.weekly_resets_at),
    requestsToday: numOrNull(r.requests_today),
    source: str(r.source) as SnapshotSource,
    measurement: str(r.measurement) as Measurement,
    note: strOrNull(r.note),
  };
}

// ---------------------------------------------------------------- validation

export function validatePct(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new InputError(`${field} must be a number from 0 to 100`);
  return n;
}

export function validateIso(value: unknown, field: string): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new InputError(`${field} must be an ISO 8601 date-time`);
  }
  return new Date(value).toISOString();
}

function validateOwnerScope(value: unknown): string {
  if (value == null || value === '') return 'personal';
  if (typeof value !== 'string' || !(value === 'personal' || /^client:\S+$/.test(value))) {
    throw new InputError("ownerScope must be 'personal' or 'client:<id>'");
  }
  return value;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new InputError(`${field} is required`);
  return value.trim();
}

// ---------------------------------------------------------------- accounts

export function createAccount(db: DatabaseSync, input: CreateAccountInput, now = new Date().toISOString()): AiAccount {
  if (!PROVIDERS.includes(input.provider as Provider)) throw new InputError(`provider must be one of ${PROVIDERS.join(', ')}`);
  if (!LIMIT_MODELS.includes(input.limitModel as LimitModel)) throw new InputError(`limitModel must be one of ${LIMIT_MODELS.join(', ')}`);
  const provider = input.provider as Provider;
  const limitModel = input.limitModel as LimitModel;
  if ((provider === 'anthropic') !== (limitModel === 'claude_5h_weekly_pct')) {
    throw new InputError('limitModel does not match the provider');
  }
  let quota = input.dailyRequestQuota ?? null;
  if (quota != null && (!Number.isInteger(quota) || quota <= 0)) throw new InputError('dailyRequestQuota must be a positive integer');
  if (limitModel === 'gemini_cli_requests_per_day' && quota == null) quota = GEMINI_CLI_DAILY_QUOTA;
  if (limitModel !== 'gemini_cli_requests_per_day' && quota != null) {
    throw new InputError('dailyRequestQuota only applies to gemini_cli_requests_per_day');
  }
  const id = input.id ?? newId('acct');
  db.prepare(
    `INSERT INTO ai_accounts (id, provider, plan, label, owner_scope, limit_model, daily_request_quota, adapter_account_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    provider,
    requireText(input.plan, 'plan'),
    requireText(input.label, 'label'),
    validateOwnerScope(input.ownerScope),
    limitModel,
    quota,
    input.adapterAccountId?.trim() || null,
    now
  );
  return getAccount(db, id);
}

export function getAccount(db: DatabaseSync, id: string): AiAccount {
  const row = db.prepare('SELECT * FROM ai_accounts WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw new NotFoundError(`AI account ${id} not found`);
  return toAccount(row);
}

export function listAccounts(db: DatabaseSync, opts: { includeArchived?: boolean } = {}): AiAccount[] {
  const rows = db
    .prepare(`SELECT * FROM ai_accounts ${opts.includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY created_at, id`)
    .all() as Row[];
  return rows.map(toAccount);
}

export function archiveAccount(db: DatabaseSync, id: string, now = new Date().toISOString()): AiAccount {
  getAccount(db, id);
  db.prepare('UPDATE ai_accounts SET archived_at = COALESCE(archived_at, ?) WHERE id = ?').run(now, id);
  return getAccount(db, id);
}

// ---------------------------------------------------------------- snapshots

export function addSnapshot(db: DatabaseSync, accountId: string, input: SnapshotInput, now = new Date().toISOString()): LimitSnapshot {
  const account = getAccount(db, accountId);
  const sessionPct = validatePct(input.sessionPct, 'sessionPct');
  const weeklyPct = validatePct(input.weeklyPct, 'weeklyPct');
  const sessionResetsAt = validateIso(input.sessionResetsAt, 'sessionResetsAt');
  const weeklyResetsAt = validateIso(input.weeklyResetsAt, 'weeklyResetsAt');
  const capturedAt = validateIso(input.capturedAt, 'capturedAt') ?? now;
  let requestsToday: number | null = null;
  if (input.requestsToday != null) {
    if (!Number.isInteger(input.requestsToday) || input.requestsToday < 0) throw new InputError('requestsToday must be a whole number, 0 or more');
    requestsToday = input.requestsToday;
  }
  if (sessionPct == null && weeklyPct == null && requestsToday == null) {
    throw new InputError('Enter at least one of sessionPct, weeklyPct or requestsToday');
  }
  if (sessionPct != null && !sessionResetsAt) throw new InputError('sessionResetsAt is required with sessionPct');
  if (weeklyPct != null && !weeklyResetsAt) throw new InputError('weeklyResetsAt is required with weeklyPct');
  if (requestsToday != null && account.limitModel !== 'gemini_cli_requests_per_day') {
    throw new InputError('requestsToday only applies to a gemini_cli_requests_per_day account');
  }
  if (account.limitModel === 'gemini_cli_requests_per_day' && (sessionPct != null || weeklyPct != null)) {
    throw new InputError('this account tracks requests per day, not session or weekly percentages');
  }
  const source = input.source ?? 'manual';
  if (!SNAPSHOT_SOURCES.includes(source as SnapshotSource)) throw new InputError(`source must be one of ${SNAPSHOT_SOURCES.join(', ')}`);
  const measurement = input.measurement ?? 'actual';
  if (measurement !== 'actual' && measurement !== 'estimated') throw new InputError('measurement must be actual or estimated');
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 500) : null;
  const id = newId('snap');
  db.prepare(
    `INSERT INTO account_limit_snapshots
       (id, account_id, captured_at, session_pct, session_resets_at, weekly_pct, weekly_resets_at, requests_today, source, measurement, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, accountId, capturedAt, sessionPct, sessionResetsAt, weeklyPct, weeklyResetsAt, requestsToday, source, measurement, note);
  return toSnapshot(db.prepare('SELECT * FROM account_limit_snapshots WHERE id = ?').get(id) as Row);
}

export function latestSnapshot(db: DatabaseSync, accountId: string): LimitSnapshot | null {
  const row = db
    .prepare('SELECT * FROM account_limit_snapshots WHERE account_id = ? ORDER BY captured_at DESC, rowid DESC LIMIT 1')
    .get(accountId) as Row | undefined;
  return row ? toSnapshot(row) : null;
}

export function snapshotById(db: DatabaseSync, id: string): LimitSnapshot | null {
  const row = db.prepare('SELECT * FROM account_limit_snapshots WHERE id = ?').get(id) as Row | undefined;
  return row ? toSnapshot(row) : null;
}

export function listSnapshots(db: DatabaseSync, accountId: string, limit = 100): LimitSnapshot[] {
  getAccount(db, accountId);
  const rows = db
    .prepare('SELECT * FROM account_limit_snapshots WHERE account_id = ? ORDER BY captured_at DESC, rowid DESC LIMIT ?')
    .all(accountId, Math.max(1, Math.min(1000, Math.floor(limit)))) as Row[];
  return rows.map(toSnapshot);
}
