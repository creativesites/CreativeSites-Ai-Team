import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type * as T from '../api/types.ts';
import { loadConfig } from '../config.ts';
import { computeCouncil } from '../council.ts';
import {
  assertAcyclic,
  planTransition,
  resolveLifecycleSettings,
  selectReady,
  type LifecycleSettings,
  type TransitionOptions,
} from '../lifecycle/tasks.ts';

type Row = Record<string, unknown>;

import { ConflictError, ForbiddenError, InputError, NotFoundError } from '../errors.ts';
export { ConflictError, ForbiddenError, InputError, NotFoundError };

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

const str = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => Number(v ?? 0);
const bool = (v: unknown): boolean => Number(v ?? 0) === 1;
const jsonText = (v: unknown) => JSON.stringify(v ?? null);
const snippet = (text: string, max = 140) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

function parseJson<T>(v: unknown, fallback: T): T {
  try {
    return v == null ? fallback : (JSON.parse(String(v)) as T);
  } catch {
    return fallback;
  }
}

function integer(value: unknown, field: string, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new InputError(`${field} must be an integer`);
  return n;
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim())) {
    throw new InputError(`${field} must be an array of non-empty strings`);
  }
  return value.map((v) => (v as string).trim());
}

function required(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new InputError(`${field} is required`);
  return value.trim();
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InputError(`${field} must be a string`);
  return value.trim() || null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback?: T): T {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    throw new InputError(`${field} is required`);
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new InputError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function positiveInt(value: unknown, field: string, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new InputError(`${field} must be a non-negative integer`);
  return n;
}

const CLASS_RANK: Record<T.EvidenceClass, number> = {
  UNKNOWN: 0,
  DECLARED: 1,
  ATTESTED: 2,
  OBSERVED: 3,
  VERIFIED: 4,
};
const EVIDENCE_CLASSES = Object.keys(CLASS_RANK) as T.EvidenceClass[];
const EVIDENCE_KINDS: T.Evidence['kind'][] = [
  'command', 'diff', 'file', 'test', 'message', 'review', 'browser', 'deploy', 'db_read', 'db_write', 'api', 'approval', 'artifact',
];
const STAGES: T.JobStage[] = ['brief', 'plan', 'build', 'verify', 'approve', 'done', 'cancelled'];
const STAGE_TRANSITIONS: Record<T.JobStage, T.JobStage[]> = {
  brief: ['plan', 'cancelled'],
  plan: ['build', 'cancelled'],
  build: ['verify', 'cancelled'],
  verify: ['approve', 'build', 'cancelled'],
  approve: ['done', 'build', 'cancelled'],
  done: [],
  cancelled: ['brief'],
};
const RISKS: T.Risk[] = ['low', 'medium', 'high', 'critical'];
const RISK_RANK: Record<T.Risk, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const TASK_MODES: NonNullable<T.Task['mode']>[] = ['build', 'verify', 'review', 'ops', 'design'];
const JOB_KINDS: T.JobKind[] = ['code', 'research', 'ops', 'design', 'decision'];
const SHIP_STATUSES: T.ShipStatus[] = ['none', 'ready', 'merged', 'pr_opened', 'cherry_picked', 'branch_pushed'];
const IDENTITY_STATUS_STATES: T.IdentityStatusState[] = ['idle', 'working', 'rate_limited', 'waiting_reset', 'offline'];

interface EventInput {
  type: string;
  subjectId: string | null;
  payload?: unknown;
  actorId?: string | null;
  actorKind?: T.ActorKind | null;
  subjectType?: string | null;
  jobId?: string | null;
  taskId?: string | null;
  sessionId?: string | null;
  /** A second event with the same key is a no-op (K2). */
  idempotencyKey?: string | null;
}

/** All reads and writes of the v2 store. Writes and their events share one transaction. */
export class Repo {
  private readonly db: DatabaseSync;
  private readonly onEvent: (e: T.RuntimeEvent) => void;

  constructor(db: DatabaseSync, onEvent: (e: T.RuntimeEvent) => void = () => {}, legacyDbPath?: string) {
    this.db = db;
    this.onEvent = onEvent;
    this.seedCommunicationHub(legacyDbPath);
    this.seedOkrs(legacyDbPath);
  }

  // ---------------------------------------------------------------- plumbing

  private all(sql: string, ...params: SQLInputValue[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }

  private one(sql: string, ...params: SQLInputValue[]): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined;
  }

  private scalar(sql: string, ...params: SQLInputValue[]): unknown {
    const row = this.one(sql, ...params);
    return row ? Object.values(row)[0] : null;
  }

  /**
   * Runs a mutation and its events in one SQLite transaction, then broadcasts.
   * A crash can never leave a committed record without its event.
   */
  private write<T>(fn: (events: T.RuntimeEvent[]) => T): T {
    const events: T.RuntimeEvent[] = [];
    this.db.exec('BEGIN');
    try {
      const out = fn(events);
      this.db.exec('COMMIT');
      for (const event of events) this.onEvent(event);
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  private recordEvent(events: T.RuntimeEvent[], input: EventInput): T.RuntimeEvent {
    if (input.idempotencyKey) {
      const existing = this.one('SELECT * FROM events WHERE idempotency_key = ?', input.idempotencyKey);
      if (existing) return toEvent(existing);
    }
    const createdAt = now();
    const prev = this.one('SELECT hash FROM events ORDER BY seq DESC LIMIT 1');
    const prevHash = prev ? str(prev.hash) : null;
    const actorId = input.actorId ?? null;
    const actorKind = input.actorKind ?? null;
    const subjectType = input.subjectType ?? null;
    const payload = input.payload ?? {};
    const hash = sha256(
      JSON.stringify({ prevHash, type: input.type, subjectId: input.subjectId, subjectType, actorId, actorKind, payload, createdAt })
    );
    const res = this.db
      .prepare(
        `INSERT INTO events (type, subject_id, payload, created_at, actor_id, actor_kind, subject_type, hash, prev_hash,
           idempotency_key, job_id, task_id, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.type, input.subjectId, jsonText(payload), createdAt, actorId, actorKind, subjectType, hash, prevHash,
        input.idempotencyKey ?? null, input.jobId ?? null, input.taskId ?? null, input.sessionId ?? null
      );
    const event: T.RuntimeEvent = {
      seq: Number(res.lastInsertRowid),
      type: input.type,
      subjectId: input.subjectId,
      payload,
      createdAt,
      actorId,
      actorKind,
      subjectType,
      jobId: input.jobId ?? null,
      taskId: input.taskId ?? null,
      sessionId: input.sessionId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      hash,
      prevHash,
    };
    events.push(event);
    return event;
  }

  // ---------------------------------------------------------------- settings

  getSettings(): T.Settings {
    const out: Record<string, unknown> = {};
    for (const row of this.all('SELECT key, value FROM settings ORDER BY key')) {
      out[String(row.key)] = parseJson(row.value, null);
    }
    return out as T.Settings;
  }

  getSetting(key: string): unknown {
    const row = this.one('SELECT value FROM settings WHERE key = ?', key);
    return row ? parseJson(row.value, null) : undefined;
  }

  updateSettings(patch: T.Settings): T.Settings {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (!entries.length) return this.getSettings();
    this.write((events) => {
      for (const [key, value] of entries) {
        this.db
          .prepare(
            `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
          )
          .run(key, jsonText(value), now());
      }
      this.recordEvent(events, { type: 'settings.updated', subjectId: null, payload: { keys: entries.map(([k]) => k) } });
    });
    return this.getSettings();
  }

  ownerId(): string {
    const settings = this.getSettings();
    if (typeof settings.ownerId === 'string' && settings.ownerId) return settings.ownerId;
    const row = this.one('SELECT id FROM identities WHERE is_owner = 1 ORDER BY created_at LIMIT 1');
    return row ? String(row.id) : 'winston';
  }

  private isOwnerActor(actorId: string): boolean {
    if (actorId === this.ownerId()) return true;
    const row = this.one('SELECT is_owner FROM identities WHERE id = ?', actorId);
    return row ? bool(row.is_owner) : false;
  }

  private refreshJobUpdated(jobId: string) {
    this.db.prepare('UPDATE jobs SET updated_at = ? WHERE id = ?').run(now(), jobId);
  }

  // ---------------------------------------------------------------- summary / events

  summary(): T.Summary {
    const count = (sql: string) => Number(this.scalar(sql) ?? 0);
    return {
      identities: count('SELECT COUNT(*) FROM identities WHERE archived = 0'),
      rooms: count('SELECT COUNT(*) FROM rooms WHERE archived = 0'),
      openJobs: count("SELECT COUNT(*) FROM jobs WHERE stage NOT IN ('done','cancelled')"),
      pendingApprovals: count("SELECT COUNT(*) FROM approvals WHERE status = 'pending'"),
      liveSessions: count("SELECT COUNT(*) FROM sessions WHERE state IN ('starting','running','idle')"),
    };
  }

  listEvents(opts: { since?: number; limit?: number; subjectId?: string; type?: string; subjectType?: string } = {}): T.RuntimeEvent[] {
    const where: string[] = ['seq > ?'];
    const params: SQLInputValue[] = [positiveInt(opts.since, 'since', 0)];
    if (opts.subjectId) {
      where.push('subject_id = ?');
      params.push(opts.subjectId);
    }
    if (opts.type) {
      where.push('type = ?');
      params.push(opts.type);
    }
    if (opts.subjectType) {
      where.push('subject_type = ?');
      params.push(opts.subjectType);
    }
    params.push(Math.min(positiveInt(opts.limit, 'limit', 1000) || 1000, 5000));
    return this.all(`SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY seq LIMIT ?`, ...params).map(toEvent);
  }

  eventsSince(seq: number, limit = 1000): T.RuntimeEvent[] {
    return this.listEvents({ since: seq, limit });
  }

  oldestEventSeq(): number {
    return Number(this.scalar('SELECT MIN(seq) FROM events') ?? 0);
  }

  latestEventSeq(): number {
    return Number(this.scalar('SELECT MAX(seq) FROM events') ?? 0);
  }

  // ---------------------------------------------------------------- search

  /**
   * Finds records whose text contains `q`, ignoring case. Each kind is capped at
   * `perKind` hits, newest first, so one busy kind cannot hide the others.
   */
  search(input: { q?: string; perKind?: number } = {}): T.SearchHit[] {
    const q = (input.q ?? '').trim();
    if (!q) return [];
    if (q.length > 200) throw new InputError('q must be 200 characters or fewer');
    const perKind = Math.min(positiveInt(input.perKind, 'limit', 8) || 8, 25);
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const number = /^#?(\d+)$/.exec(q);
    const hits: T.SearchHit[] = [];

    for (const r of this.all(
      `SELECT id, number, title, stage, room_id, updated_at FROM jobs
       WHERE title LIKE ? ESCAPE '\\' OR brief LIKE ? ESCAPE '\\' OR plan LIKE ? ESCAPE '\\' OR number = ?
       ORDER BY updated_at DESC LIMIT ?`,
      pattern,
      pattern,
      pattern,
      number ? Number(number[1]) : -1,
      perKind
    )) {
      hits.push({
        kind: 'job',
        id: String(r.id),
        title: String(r.title),
        detail: `#${num(r.number)} · ${String(r.stage)}`,
        roomId: str(r.room_id),
        jobId: String(r.id),
        at: str(r.updated_at),
      });
    }

    for (const r of this.all(
      `SELECT id, name, created_at FROM rooms WHERE archived = 0 AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT ?`,
      pattern,
      perKind
    )) {
      hits.push({ kind: 'room', id: String(r.id), title: String(r.name), detail: null, roomId: String(r.id), jobId: null, at: str(r.created_at) });
    }

    for (const r of this.all(
      `SELECT m.id, m.room_id, m.job_id, m.body, m.created_at, r.name AS room_name
       FROM messages m JOIN rooms r ON r.id = m.room_id
       WHERE m.body LIKE ? ESCAPE '\\' ORDER BY m.created_at DESC LIMIT ?`,
      pattern,
      perKind
    )) {
      hits.push({
        kind: 'message',
        id: String(r.id),
        title: snippet(String(r.body)),
        detail: String(r.room_name),
        roomId: String(r.room_id),
        jobId: str(r.job_id),
        at: String(r.created_at),
      });
    }

    for (const r of this.all(
      `SELECT id, name, role, runtime, created_at FROM identities
       WHERE archived = 0 AND (name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR role LIKE ? ESCAPE '\\' OR runtime LIKE ? ESCAPE '\\')
       ORDER BY name LIMIT ?`,
      pattern,
      pattern,
      pattern,
      pattern,
      perKind
    )) {
      hits.push({
        kind: 'identity',
        id: String(r.id),
        title: String(r.name),
        detail: str(r.role) ?? str(r.runtime),
        roomId: null,
        jobId: null,
        at: str(r.created_at),
      });
    }

    for (const r of this.all(
      `SELECT s.id, s.agent_id, s.state, s.job_id, s.room_id, s.runtime_command, s.started_at, s.acp_session_id
       FROM sessions s
       WHERE s.id LIKE ? ESCAPE '\\'
          OR s.agent_id LIKE ? ESCAPE '\\'
          OR s.acp_session_id LIKE ? ESCAPE '\\'
          OR s.runtime_command LIKE ? ESCAPE '\\'
          OR s.id IN (
            SELECT session_id FROM transcript_entries
            WHERE payload LIKE ? ESCAPE '\\'
          )
       ORDER BY s.started_at DESC LIMIT ?`,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      perKind
    )) {
      hits.push({
        kind: 'session',
        id: String(r.id),
        title: `${String(r.agent_id)} session`,
        detail: `${String(r.state)} · ${String(r.runtime_command)}`,
        roomId: str(r.room_id),
        jobId: str(r.job_id),
        at: String(r.started_at),
      });
    }

    for (const r of this.all(
      `SELECT id, job_id, kind, summary, command, commit_sha, created_at FROM evidence
       WHERE summary LIKE ? ESCAPE '\\' OR command LIKE ? ESCAPE '\\' OR commit_sha LIKE ? ESCAPE '\\'
       ORDER BY created_at DESC LIMIT ?`,
      pattern,
      pattern,
      pattern,
      perKind
    )) {
      hits.push({
        kind: 'evidence',
        id: String(r.id),
        title: snippet(String(r.summary)),
        detail: String(r.kind),
        roomId: null,
        jobId: str(r.job_id),
        at: String(r.created_at),
      });
    }

    for (const r of this.all(
      `SELECT id, title, description, quarter, progress_percent, status, created_at FROM okr_objectives
       WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\'
       ORDER BY created_at DESC LIMIT ?`,
      pattern,
      pattern,
      pattern,
      perKind
    )) {
      hits.push({
        kind: 'okr',
        id: String(r.id),
        title: String(r.title),
        detail: `${String(r.quarter)} · ${Number(r.progress_percent)}% · ${String(r.status)}`,
        roomId: null,
        jobId: null,
        at: str(r.created_at),
      });
    }

    return hits;
  }

  // ---------------------------------------------------------------- identities

  listIdentities(includeArchived = false): T.Identity[] {
    const sql = includeArchived
      ? 'SELECT * FROM identities ORDER BY name'
      : 'SELECT * FROM identities WHERE archived = 0 ORDER BY name';
    return this.all(sql).map(toIdentity);
  }

  getIdentity(idInput: string): T.Identity {
    const id = required(idInput, 'id').toLowerCase();
    const row = this.one('SELECT * FROM identities WHERE id = ?', id);
    if (!row) throw new NotFoundError(`identity ${id} not found`);
    return toIdentity(row);
  }

  createIdentity(input: T.CreateIdentityInput): T.Identity {
    const id = required(input.id, 'id').toLowerCase();
    const name = required(input.name, 'name');
    if (this.one('SELECT id FROM identities WHERE id = ?', id)) throw new InputError(`identity ${id} already exists`);
    this.write((events) => {
      this.insertIdentity({ ...input, id, name });
      this.recordEvent(events, { type: 'identity.created', subjectId: id, subjectType: 'identity' });
    });
    return this.getIdentity(id);
  }

  updateIdentity(idInput: string, input: T.UpdateIdentityInput): T.Identity {
    const id = required(idInput, 'id').toLowerCase();
    if (!this.one('SELECT id FROM identities WHERE id = ?', id)) throw new NotFoundError(`identity ${id} not found`);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [];
      if (input.name !== undefined) fields.push(['name', required(input.name, 'name')]);
      if (input.role !== undefined) fields.push(['role', optionalString(input.role, 'role')]);
      if (input.runtime !== undefined) fields.push(['runtime', optionalString(input.runtime, 'runtime')]);
      if (input.avatarMark !== undefined) fields.push(['avatar_mark', optionalString(input.avatarMark, 'avatarMark')]);
      if (input.avatarColor !== undefined) fields.push(['avatar_color', optionalString(input.avatarColor, 'avatarColor')]);
      if (input.seats !== undefined) fields.push(['seats', jsonText(requireStringArray(input.seats, 'seats'))]);
      if (input.teamId !== undefined) fields.push(['team_id', optionalString(input.teamId, 'teamId')]);
      if (input.lane !== undefined) fields.push(['lane', optionalString(input.lane, 'lane')]);
      if (input.symbol !== undefined) fields.push(['symbol', optionalString(input.symbol, 'symbol')]);
      if (input.capabilities !== undefined) fields.push(['capabilities', jsonText(requireStringArray(input.capabilities, 'capabilities'))]);
      if (input.provenance !== undefined) fields.push(['provenance', required(input.provenance, 'provenance')]);
      if (input.approvalLevel !== undefined) fields.push(['approval_level', oneOf(input.approvalLevel, ['owner', 'lead', 'member', 'none'] as const, 'approvalLevel')]);
      if (input.adapterId !== undefined) fields.push(['adapter_id', optionalString(input.adapterId, 'adapterId')]);
      if (input.archived !== undefined) fields.push(['archived', input.archived ? 1 : 0]);
      if (input.activeSessionId !== undefined) fields.push(['active_session_id', optionalString(input.activeSessionId, 'activeSessionId')]);
      if (input.acpSessionId !== undefined) fields.push(['acp_session_id', optionalString(input.acpSessionId, 'acpSessionId')]);
      if (input.statusState !== undefined) fields.push(['status_state', oneOf(input.statusState, IDENTITY_STATUS_STATES, 'statusState')]);
      if (input.rateLimitResetAt !== undefined) fields.push(['rate_limit_reset_at', optionalString(input.rateLimitResetAt, 'rateLimitResetAt')]);
      if (input.rateLimitReason !== undefined) fields.push(['rate_limit_reason', optionalString(input.rateLimitReason, 'rateLimitReason')]);
      if (input.lastWokenAt !== undefined) fields.push(['last_woken_at', optionalString(input.lastWokenAt, 'lastWokenAt')]);
      if (fields.length) {
        this.db.prepare(`UPDATE identities SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);
      }
      this.recordEvent(events, { type: 'identity.updated', subjectId: id, subjectType: 'identity' });
    });
    return this.getIdentity(id);
  }

  batchSetIdentityRuntime(runtime: string, unassignedOnly = true, ids?: string[]): { updated: number } {
    let updated = 0;
    this.write((events) => {
      let query = 'SELECT id, runtime FROM identities WHERE is_owner = 0';
      if (unassignedOnly) {
        query += " AND (runtime IS NULL OR trim(runtime) = '' OR runtime = 'claude-agent-acp')";
      }
      const targets = this.all(query);
      for (const t of targets) {
        const id = String(t.id);
        if (ids && !ids.includes(id)) continue;
        this.db.prepare('UPDATE identities SET runtime = ? WHERE id = ?').run(runtime, id);
        this.recordEvent(events, { type: 'identity.updated', subjectId: id, subjectType: 'identity', payload: { runtime } });
        updated++;
      }
    });
    return { updated };
  }

  private insertIdentity(input: T.CreateIdentityInput & { id: string; name: string }) {
    this.db
      .prepare(
        `INSERT INTO identities
          (id, name, role, runtime, avatar_mark, avatar_color, seats, created_at,
           team_id, lane, symbol, capabilities, provenance, is_owner, approval_level, adapter_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, role = excluded.role, runtime = excluded.runtime,
           avatar_mark = excluded.avatar_mark, avatar_color = excluded.avatar_color,
           seats = excluded.seats, team_id = excluded.team_id, lane = excluded.lane,
           symbol = excluded.symbol, capabilities = excluded.capabilities,
           provenance = excluded.provenance, is_owner = excluded.is_owner,
           approval_level = excluded.approval_level, adapter_id = excluded.adapter_id,
           archived = 0`
      )
      .run(
        input.id,
        input.name,
        input.role ?? null,
        input.runtime ?? null,
        input.avatarMark ?? null,
        input.avatarColor ?? null,
        jsonText(input.seats ?? []),
        now(),
        input.teamId ?? null,
        input.lane ?? null,
        input.symbol ?? null,
        jsonText(input.capabilities ?? []),
        input.provenance ?? 'DECLARED',
        input.isOwner ? 1 : 0,
        input.approvalLevel ?? (input.isOwner ? 'owner' : 'member'),
        input.adapterId ?? null
      );
    if (input.teamId) this.addTeamMemberRow(input.teamId, input.id, 'member');
  }

  importIdentities(input: T.ImportIdentitiesInput): { teams: number; identities: number; ownerId: string } {
    if (!Array.isArray(input.identities) && !input.owner) throw new InputError('nothing to import');
    let teams = 0;
    let identities = 0;
    this.write((events) => {
      for (const team of input.teams ?? []) {
        if (!team?.id || !team.name) continue;
        this.db
          .prepare(
            `INSERT INTO teams (id, name, description, created_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = COALESCE(excluded.description, teams.description)`
          )
          .run(required(team.id, 'team.id'), required(team.name, 'team.name'), team.description ?? null, now());
        for (const identityId of team.members ?? []) {
          if (this.one('SELECT id FROM identities WHERE id = ?', identityId)) this.addTeamMemberRow(String(team.id), identityId, 'member');
        }
        if (team.leadIdentityId && this.one('SELECT id FROM identities WHERE id = ?', team.leadIdentityId)) {
          this.db.prepare("UPDATE identities SET approval_level = 'lead' WHERE id = ?").run(team.leadIdentityId);
        }
        teams += 1;
      }
      if (input.owner) {
        const p = input.owner;
        const owner: T.CreateIdentityInput & { id: string; name: string } = {
          id: p.id.toLowerCase(),
          name: p.name,
          role: p.role ?? undefined,
          runtime: p.runtime ?? undefined,
          avatarMark: p.avatarMark ?? undefined,
          avatarColor: p.avatarColor ?? undefined,
          seats: p.seats ?? undefined,
          teamId: p.teamId ?? undefined,
          lane: p.lane ?? undefined,
          symbol: p.symbol ?? undefined,
          capabilities: p.capabilities ?? undefined,
          provenance: p.provenance ?? 'DECLARED',
          isOwner: true,
          approvalLevel: 'owner',
          adapterId: p.adapterId ?? undefined,
        };
        this.insertIdentity(owner);
        for (const teamId of p.teams ?? []) {
          if (this.one('SELECT id FROM teams WHERE id = ?', teamId)) this.addTeamMemberRow(teamId, owner.id, 'owner');
        }
        this.db
          .prepare(
            `INSERT INTO settings (key, value, updated_at) VALUES ('ownerId', ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
          )
          .run(jsonText(owner.id), now());
        identities += 1;
      }
      for (const identity of input.identities ?? []) {
        if (!identity?.id || !identity.name) continue;
        const id = identity.id.toLowerCase();
        const teamId = identity.teamId ?? identity.team ?? null;
        this.insertIdentity({ ...identity, id, teamId: teamId ?? undefined });
        for (const team of identity.teams ?? []) {
          if (this.one('SELECT id FROM teams WHERE id = ?', team)) this.addTeamMemberRow(team, id, 'member');
        }
        identities += 1;
      }
      this.recordEvent(events, {
        type: 'identity.imported',
        subjectId: input.owner?.id ?? null,
        payload: { teams, identities },
      });
    });
    return { teams, identities, ownerId: this.ownerId() };
  }

  // ---------------------------------------------------------------- teams

  listTeams(): T.Team[] {
    return this.all(
      `SELECT t.*, (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS member_count
       FROM teams t ORDER BY t.name`
    ).map(toTeam);
  }

  getTeam(id: string): T.Team {
    const row = this.one(
      `SELECT t.*, (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS member_count
       FROM teams t WHERE t.id = ?`,
      id
    );
    if (!row) throw new NotFoundError(`team ${id} not found`);
    return toTeam(row);
  }

  createTeam(input: T.CreateTeamInput): T.Team {
    const name = required(input.name, 'name');
    const id = (input.id?.trim() || slugify(name)).toLowerCase();
    if (this.one('SELECT id FROM teams WHERE id = ? OR name = ?', id, name)) throw new InputError(`team ${name} already exists`);
    this.write((events) => {
      this.db.prepare('INSERT INTO teams (id, name, description, created_at) VALUES (?, ?, ?, ?)').run(
        id, name, input.description ?? null, now()
      );
      this.recordEvent(events, { type: 'team.created', subjectId: id, subjectType: 'team' });
    });
    return this.getTeam(id);
  }

  updateTeam(id: string, input: { name?: string; description?: string | null }): T.Team {
    if (!this.one('SELECT id FROM teams WHERE id = ?', id)) throw new NotFoundError(`team ${id} not found`);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [];
      if (input.name !== undefined) fields.push(['name', required(input.name, 'name')]);
      if (input.description !== undefined) fields.push(['description', input.description]);
      if (fields.length) {
        this.db.prepare(`UPDATE teams SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);
      }
      this.recordEvent(events, { type: 'team.updated', subjectId: id, subjectType: 'team' });
    });
    return this.getTeam(id);
  }

  listTeamMembers(teamId: string): T.TeamMember[] {
    return this.all('SELECT * FROM team_members WHERE team_id = ? ORDER BY joined_at', teamId).map(toTeamMember);
  }

  addTeamMember(teamId: string, identityId: string, role = 'member'): T.TeamMember {
    if (!this.one('SELECT id FROM teams WHERE id = ?', teamId)) throw new NotFoundError(`team ${teamId} not found`);
    if (!this.one('SELECT id FROM identities WHERE id = ?', identityId)) throw new NotFoundError(`identity ${identityId} not found`);
    this.write((events) => {
      this.addTeamMemberRow(teamId, identityId, role);
      this.recordEvent(events, { type: 'team.member_added', subjectId: teamId, payload: { identityId, role } });
    });
    return this.listTeamMembers(teamId).find((m) => m.identityId === identityId)!;
  }

  removeTeamMember(teamId: string, identityId: string): void {
    this.write((events) => {
      this.db.prepare('DELETE FROM team_members WHERE team_id = ? AND identity_id = ?').run(teamId, identityId);
      this.recordEvent(events, { type: 'team.member_removed', subjectId: teamId, payload: { identityId } });
    });
  }

  private addTeamMemberRow(teamId: string, identityId: string, role: string) {
    this.db
      .prepare(
        `INSERT INTO team_members (team_id, identity_id, role, joined_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(team_id, identity_id) DO UPDATE SET role = excluded.role`
      )
      .run(teamId, identityId, role, now());
  }

  // ---------------------------------------------------------------- projects / repos

  listProjects(includeArchived = false): T.Project[] {
    const rows = this.all(
      `SELECT p.*,
        (SELECT COUNT(*) FROM rooms r WHERE r.project_id = p.id AND r.archived = 0) AS room_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.project_id = p.id AND j.stage NOT IN ('done','cancelled')) AS open_job_count,
        (SELECT COUNT(*) FROM project_tasks pt WHERE pt.project_id = p.id) AS task_count,
        (SELECT COUNT(*) FROM project_tasks pt WHERE pt.project_id = p.id AND pt.status = 'done') AS done_task_count
       FROM projects p ${includeArchived ? '' : 'WHERE p.archived = 0'} ORDER BY p.name`
    );
    return rows.map((row) => toProject(row, this.listRepos(String(row.id))));
  }

  getProject(id: string): T.Project {
    const row = this.one(
      `SELECT p.*,
        (SELECT COUNT(*) FROM rooms r WHERE r.project_id = p.id AND r.archived = 0) AS room_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.project_id = p.id AND j.stage NOT IN ('done','cancelled')) AS open_job_count,
        (SELECT COUNT(*) FROM project_tasks pt WHERE pt.project_id = p.id) AS task_count,
        (SELECT COUNT(*) FROM project_tasks pt WHERE pt.project_id = p.id AND pt.status = 'done') AS done_task_count
       FROM projects p WHERE p.id = ?`,
      id
    );
    if (!row) throw new NotFoundError(`project ${id} not found`);
    return toProject(row, this.listRepos(id));
  }

  createProject(input: T.CreateProjectInput): T.Project {
    const name = required(input.name, 'name');
    if (this.one('SELECT id FROM projects WHERE name = ?', name)) throw new InputError(`project ${name} already exists`);
    const id = newId('proj');
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO projects (id, name, slug, description, root_path, default_branch, team_id, settings, archived, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 0, ?)`
        )
        .run(
          id, name,
          input.slug ?? slugify(name),
          input.description ?? null,
          input.rootPath ?? null,
          input.defaultBranch ?? null,
          input.teamId ?? null,
          now()
        );
      for (const repo of input.repos ?? []) this.insertRepoRow(id, repo);
      this.recordEvent(events, { type: 'project.created', subjectId: id, payload: { name }, subjectType: 'project' });
    });
    return this.getProject(id);
  }

  updateProject(id: string, input: T.UpdateProjectInput): T.Project {
    if (!this.one('SELECT id FROM projects WHERE id = ?', id)) throw new NotFoundError(`project ${id} not found`);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [];
      if (input.name !== undefined) fields.push(['name', required(input.name, 'name')]);
      if (input.slug !== undefined) fields.push(['slug', optionalString(input.slug, 'slug')]);
      if (input.description !== undefined) fields.push(['description', input.description]);
      if (input.rootPath !== undefined) fields.push(['root_path', optionalString(input.rootPath, 'rootPath')]);
      if (input.defaultBranch !== undefined) fields.push(['default_branch', optionalString(input.defaultBranch, 'defaultBranch')]);
      if (input.teamId !== undefined) fields.push(['team_id', optionalString(input.teamId, 'teamId')]);
      if (input.archived !== undefined) fields.push(['archived', input.archived ? 1 : 0]);
      if (fields.length) {
        this.db.prepare(`UPDATE projects SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);
      }
      this.recordEvent(events, { type: 'project.updated', subjectId: id, subjectType: 'project' });
    });
    return this.getProject(id);
  }

  listRepos(projectId: string): T.Repo[] {
    return this.all('SELECT * FROM repos WHERE project_id = ? ORDER BY name', projectId).map(toRepo);
  }

  addRepo(projectId: string, input: T.CreateRepoInput): T.Repo {
    if (!this.one('SELECT id FROM projects WHERE id = ?', projectId)) throw new NotFoundError(`project ${projectId} not found`);
    const name = required(input.name, 'name');
    const id = newId('repo');
    this.write((events) => {
      try {
        this.db
          .prepare(
            `INSERT INTO repos (id, project_id, name, path, remote_url, default_branch, vcs, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'git', ?)`
          )
          .run(id, projectId, name, input.path ?? null, input.remoteUrl ?? null, input.defaultBranch ?? null, now());
      } catch (e) {
        throw new InputError(`Could not add repo: ${(e as Error).message}`);
      }
      this.recordEvent(events, { type: 'repo.added', subjectId: projectId, payload: { repoId: id, name }, subjectType: 'project' });
    });
    return this.listRepos(projectId).find((r) => r.id === id)!;
  }

  removeRepo(repoId: string): void {
    const row = this.one('SELECT project_id FROM repos WHERE id = ?', repoId);
    if (!row) throw new NotFoundError(`repo ${repoId} not found`);
    this.write((events) => {
      this.db.prepare('DELETE FROM repos WHERE id = ?').run(repoId);
      this.recordEvent(events, { type: 'repo.removed', subjectId: String(row.project_id), payload: { repoId } });
    });
  }

  private insertRepoRow(projectId: string, input: T.CreateRepoInput) {
    this.db
      .prepare(
        `INSERT INTO repos (id, project_id, name, path, remote_url, default_branch, vcs, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'git', ?)`
      )
      .run(newId('repo'), projectId, required(input.name, 'repo.name'), input.path ?? null, input.remoteUrl ?? null, input.defaultBranch ?? null, now());
  }

  // ---------------------------------------------------------------- rooms / members / messages

  listRooms(): T.Room[] {
    return this.all(
      `SELECT r.*,
        (SELECT COUNT(*) FROM members m WHERE m.room_id = r.id) AS member_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.room_id = r.id AND j.stage NOT IN ('done','cancelled')) AS open_job_count
       FROM rooms r WHERE r.archived = 0 ORDER BY r.name`
    ).map(toRoom);
  }

  getRoom(id: string): T.Room {
    const row = this.one(
      `SELECT r.*,
        (SELECT COUNT(*) FROM members m WHERE m.room_id = r.id) AS member_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.room_id = r.id AND j.stage NOT IN ('done','cancelled')) AS open_job_count
       FROM rooms r WHERE r.id = ?`,
      id
    );
    if (!row) throw new NotFoundError(`room ${id} not found`);
    return toRoom(row);
  }

  createRoom(input: T.CreateRoomInput): T.Room {
    const name = required(input.name, 'name');
    if (this.one('SELECT id FROM rooms WHERE name = ?', name)) throw new InputError(`room ${name} already exists`);
    if (input.projectId && !this.one('SELECT id FROM projects WHERE id = ?', input.projectId)) {
      throw new NotFoundError(`project ${input.projectId} not found`);
    }
    const id = newId('room');
    const project = input.projectId ? this.getProject(input.projectId) : null;
    const repoPath = input.repoPath ?? project?.rootPath ?? project?.repos.find((r) => r.path)?.path ?? null;
    this.write((events) => {
      this.db
        .prepare('INSERT INTO rooms (id, name, repo_path, created_at, project_id, team_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(
          id,
          name,
          repoPath,
          now(),
          input.projectId ?? null,
          input.teamId ?? null,
          input.kind ?? (input.projectId ? 'project' : 'adhoc')
        );
      this.recordEvent(events, { type: 'room.created', subjectId: id, payload: { name }, subjectType: 'room' });
    });
    return this.getRoom(id);
  }

  updateRoom(id: string, input: { name?: string; projectId?: string | null; teamId?: string | null; archived?: boolean; intakeEnabled?: boolean }): T.Room {
    if (!this.one('SELECT id FROM rooms WHERE id = ?', id)) throw new NotFoundError(`room ${id} not found`);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [];
      if (input.name !== undefined) fields.push(['name', required(input.name, 'name')]);
      if (input.projectId !== undefined) fields.push(['project_id', input.projectId]);
      if (input.teamId !== undefined) fields.push(['team_id', input.teamId]);
      if (input.archived !== undefined) fields.push(['archived', input.archived ? 1 : 0]);
      if (input.intakeEnabled !== undefined) fields.push(['intake_enabled', input.intakeEnabled ? 1 : 0]);
      if (fields.length) {
        this.db.prepare(`UPDATE rooms SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);
      }
      this.recordEvent(events, { type: 'room.updated', subjectId: id, subjectType: 'room' });
    });
    return this.getRoom(id);
  }

  listRoomMembers(roomId: string): T.RoomMember[] {
    this.getRoom(roomId);
    return this.all('SELECT * FROM members WHERE room_id = ? ORDER BY joined_at', roomId).map((row) => {
      const member = toRoomMember(row);
      const identity = this.one('SELECT * FROM identities WHERE id = ?', member.memberId);
      return { ...member, identity: identity ? toIdentity(identity) : null };
    });
  }

  addRoomMember(roomId: string, input: T.AddRoomMemberInput): T.RoomMember {
    this.getRoom(roomId);
    const memberId = required(input.memberId, 'memberId');
    const identity = this.one('SELECT * FROM identities WHERE id = ?', memberId);
    const kind = input.kind ?? (identity ? 'agent' : 'human');
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO members (room_id, member_id, kind, role, joined_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(room_id, member_id) DO UPDATE SET role = excluded.role`
        )
        .run(roomId, memberId, kind, input.role ?? 'member', now());
      this.recordEvent(events, { type: 'room.member_added', subjectId: roomId, payload: { memberId, kind }, subjectType: 'room' });
    });
    return this.listRoomMembers(roomId).find((m) => m.memberId === memberId)!;
  }

  removeRoomMember(roomId: string, memberId: string): void {
    this.write((events) => {
      this.db.prepare('DELETE FROM members WHERE room_id = ? AND member_id = ?').run(roomId, memberId);
      this.recordEvent(events, { type: 'room.member_removed', subjectId: roomId, payload: { memberId } });
    });
  }

  listMessages(roomId: string, limit = 200): T.Message[] {
    this.getRoom(roomId);
    return this.all(
      'SELECT * FROM (SELECT * FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at',
      roomId,
      positiveInt(limit, 'limit', 200)
    ).map(toMessage);
  }

  postMessage(roomId: string, input: T.PostMessageInput): T.Message {
    this.getRoom(roomId);
    const body = required(input.body, 'body');
    const authorId = required(input.authorId, 'authorId');
    oneOf(input.authorKind, ['human', 'agent', 'system'] as const, 'authorKind');
    if (input.jobId && !this.one('SELECT id FROM jobs WHERE id = ?', input.jobId)) {
      throw new NotFoundError(`job ${input.jobId} not found`);
    }
    const id = newId('msg');
    this.write((events) => {
      this.db
        .prepare('INSERT INTO messages (id, room_id, author_id, author_kind, body, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, roomId, authorId, input.authorKind, body, input.jobId ?? null, now());
      this.recordEvent(events, {
        type: 'message.posted',
        subjectId: roomId,
        payload: { messageId: id, jobId: input.jobId ?? null, authorId, authorKind: input.authorKind },
        actorId: authorId,
        actorKind: input.authorKind,
        subjectType: 'room',
      });
    });
    return toMessage(this.one('SELECT * FROM messages WHERE id = ?', id)!);
  }

  // ---------------------------------------------------------------- jobs

  listJobs(filter: { roomId?: string; projectId?: string; stage?: T.JobStage; limit?: number } = {}): T.JobSummary[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.roomId) {
      where.push('j.room_id = ?');
      params.push(filter.roomId);
    }
    if (filter.projectId) {
      where.push('j.project_id = ?');
      params.push(filter.projectId);
    }
    if (filter.stage) {
      where.push('j.stage = ?');
      params.push(oneOf(filter.stage, STAGES, 'stage'));
    }
    params.push(Math.min(positiveInt(filter.limit, 'limit', 500) || 500, 1000));
    return this.all(
      `SELECT j.*, (SELECT COUNT(*) FROM approvals a WHERE a.job_id = j.id AND a.status = 'pending') AS pending_approvals
       FROM jobs j ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY j.updated_at DESC LIMIT ?`,
      ...params
    ).map(toJobSummary);
  }

  getJob(jobId: string): T.JobDetail {
    const row = this.one(
      `SELECT j.*, (SELECT COUNT(*) FROM approvals a WHERE a.job_id = j.id AND a.status = 'pending') AS pending_approvals
       FROM jobs j WHERE j.id = ?`,
      jobId
    );
    if (!row) throw new NotFoundError(`job ${jobId} not found`);

    const evidence = this.all('SELECT * FROM evidence WHERE job_id = ? ORDER BY created_at DESC, rowid DESC', jobId).map(toEvidence);
    const taskCriteria = new Map<string, string[]>();
    for (const link of this.all(
      'SELECT tc.task_id, tc.criterion_id FROM task_criteria tc JOIN tasks t ON t.id = tc.task_id WHERE t.job_id = ?',
      jobId
    )) {
      const key = String(link.criterion_id);
      const list = taskCriteria.get(key) ?? [];
      list.push(String(link.task_id));
      taskCriteria.set(key, list);
    }
    const bestClass = (criterionId: string): T.EvidenceClass => {
      const linkedTasks = new Set(taskCriteria.get(criterionId) ?? []);
      let best: T.EvidenceClass = 'UNKNOWN';
      for (const e of evidence) {
        const matches = e.criterionId === criterionId || (e.taskId !== null && linkedTasks.has(e.taskId));
        if (matches && CLASS_RANK[e.class] > CLASS_RANK[best]) best = e.class;
      }
      return best;
    };

    const criteria = this.all('SELECT * FROM criteria WHERE job_id = ? ORDER BY position, rowid', jobId).map((c) => ({
      id: String(c.id),
      text: String(c.text),
      position: num(c.position),
      evidenceClass: bestClass(String(c.id)),
      taskIds: taskCriteria.get(String(c.id)) ?? [],
    }));

    const plan = parseJson<T.JobPlan>(row.plan, { summary: '' });
    if (typeof plan.summary !== 'string') plan.summary = '';
    return {
      ...toJobSummary(row),
      brief: String(row.brief ?? ''),
      plan,
      criteria,
      tasks: this.listTasks(jobId),
      evidence,
      approvals: this.all('SELECT * FROM approvals WHERE job_id = ? ORDER BY created_at DESC', jobId).map(toApproval),
      sessions: this.all(
        'SELECT * FROM sessions WHERE job_id = ? OR task_id IN (SELECT id FROM tasks WHERE job_id = ?) ORDER BY started_at DESC',
        jobId,
        jobId
      ).map(toSession),
      usage: this.all('SELECT * FROM usage WHERE job_id = ? ORDER BY created_at DESC', jobId).map(toUsage),
      history: this.all('SELECT * FROM job_stage_history WHERE job_id = ? ORDER BY id', jobId).map(toHistory),
      stageNote: str(row.stage_note),
      baseSha: str(row.base_sha),
      shipSha: str(row.ship_sha),
      ownerId: str(row.owner_id),
    };
  }

  createJob(input: T.CreateJobInput): T.JobDetail {
    const id = newId('job');
    this.write((events) => this.insertJob(events, id, input));
    return this.getJob(id);
  }

  /** Validates and inserts a job plus its stage history and `job.created` event inside the caller's transaction. */
  private insertJob(events: T.RuntimeEvent[], id: string, input: T.CreateJobInput): void {
    const roomId = required(input.roomId, 'roomId');
    const title = required(input.title, 'title');
    const createdBy = required(input.createdBy, 'createdBy');
    const room = this.one('SELECT * FROM rooms WHERE id = ?', roomId);
    if (!room) throw new NotFoundError(`room ${roomId} not found`);
    if (input.criteria && !Array.isArray(input.criteria)) throw new InputError('criteria must be a list of strings');
    {
      const projectId = input.projectId ?? str(room.project_id);
      const ownerId = this.ownerId();
      const t = now();
      const next = Number(this.scalar('SELECT COALESCE(MAX(number), 0) + 1 FROM jobs') ?? 1);
      this.db
        .prepare(
          `INSERT INTO jobs
            (id, number, room_id, title, brief, stage, created_by, created_at, updated_at,
             project_id, risk, priority, budget_cents, owner_id, kind)
           VALUES (?, ?, ?, ?, ?, 'brief', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, next, roomId, title, input.brief ?? '', createdBy, t, t,
          projectId, oneOf(input.risk, RISKS, 'risk', 'low'), optionalString(input.priority, 'priority') ?? 'normal',
          input.budgetCents == null ? null : positiveInt(input.budgetCents, 'budgetCents'), ownerId,
          oneOf(input.kind, JOB_KINDS, 'kind', 'code')
        );
      for (const [index, text] of (input.criteria ?? []).entries()) {
        if (typeof text !== 'string') throw new InputError(`criteria[${index}] must be a string`);
        this.db.prepare('INSERT INTO criteria (id, job_id, text, position) VALUES (?, ?, ?, ?)').run(newId('crit'), id, required(text, `criteria[${index}]`), index);
      }
      this.db
        .prepare('INSERT INTO job_stage_history (job_id, from_stage, to_stage, actor_id, actor_kind, note, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?)')
        .run(id, 'brief', createdBy, 'human', 'Job created', t);
      this.recordEvent(events, {
        type: 'job.created',
        subjectId: id,
        payload: { roomId, number: next, projectId },
        actorId: createdBy,
        actorKind: 'human',
        subjectType: 'job',
      });
    }
  }

  updateJob(jobId: string, input: T.UpdateJobInput): T.JobDetail {
    this.getJob(jobId);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [];
      if (input.title !== undefined) fields.push(['title', required(input.title, 'title')]);
      if (input.brief !== undefined) fields.push(['brief', String(input.brief)]);
      if (input.risk !== undefined) fields.push(['risk', oneOf(input.risk, RISKS, 'risk')]);
      if (input.priority !== undefined) fields.push(['priority', required(input.priority, 'priority')]);
      if (input.budgetCents !== undefined) fields.push(['budget_cents', input.budgetCents == null ? null : positiveInt(input.budgetCents, 'budgetCents')]);
      if (input.blockedReason !== undefined) fields.push(['blocked_reason', optionalString(input.blockedReason, 'blockedReason')]);
      if (input.kind !== undefined) fields.push(['kind', oneOf(input.kind, JOB_KINDS, 'kind')]);
      if (input.shipStatus !== undefined) fields.push(['ship_status', oneOf(input.shipStatus, SHIP_STATUSES, 'shipStatus')]);
      if (input.shipPayload !== undefined) fields.push(['ship_payload', jsonText(input.shipPayload)]);
      fields.push(['updated_at', now()]);
      this.db.prepare(`UPDATE jobs SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), jobId);
      this.recordEvent(events, { type: 'job.updated', subjectId: jobId, payload: { fields: fields.map(([c]) => c) }, subjectType: 'job' });
    });
    return this.getJob(jobId);
  }

  // ---------------------------------------------------------------- intake (WP2)

  getIntake(id: string): T.IntakeRequest {
    const row = this.one('SELECT * FROM intake_requests WHERE id = ?', id);
    if (!row) throw new NotFoundError(`intake ${id} not found`);
    return toIntake(row);
  }

  listIntakes(filter: { jobId?: string; limit?: number } = {}): T.IntakeRequest[] {
    const limit = Math.min(positiveInt(filter.limit, 'limit', 200) || 200, 1000);
    return filter.jobId
      ? this.all(
          'SELECT * FROM intake_requests WHERE job_id = ? OR duplicate_of_job_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
          filter.jobId,
          filter.jobId,
          limit
        ).map(toIntake)
      : this.all('SELECT * FROM intake_requests ORDER BY created_at DESC, rowid DESC LIMIT ?', limit).map(toIntake);
  }

  /** The project an intake resolves to: explicit project, else the room's project, else none. */
  resolveIntakeProject(projectId: string | null | undefined, roomId: string | null | undefined): string | null {
    if (projectId) {
      if (!this.one('SELECT id FROM projects WHERE id = ?', projectId)) throw new NotFoundError(`project ${projectId} not found`);
      return projectId;
    }
    if (roomId) {
      const room = this.one('SELECT project_id FROM rooms WHERE id = ?', roomId);
      if (!room) throw new NotFoundError(`room ${roomId} not found`);
      return str(room.project_id);
    }
    return null;
  }

  /** Open (not done/cancelled) jobs a new request could duplicate: same project; with no project, same room. */
  listOpenJobsForDedupe(projectId: string | null, roomId: string | null): { id: string; number: number; title: string; brief: string }[] {
    const rows = projectId
      ? this.all("SELECT id, number, title, brief FROM jobs WHERE project_id = ? AND stage NOT IN ('done','cancelled') ORDER BY number", projectId)
      : this.all(
          "SELECT id, number, title, brief FROM jobs WHERE project_id IS NULL AND room_id = ? AND stage NOT IN ('done','cancelled') ORDER BY number",
          roomId ?? ''
        );
    return rows.map((r) => ({ id: String(r.id), number: num(r.number), title: String(r.title), brief: String(r.brief ?? '') }));
  }

  /**
   * Persists one intake. With `duplicateOf` no job is created and the intake links to the existing job.
   * Otherwise the job, intake row, `job.created`, `intake.received` and `job.triaged` commit in one transaction.
   */
  recordIntake(input: {
    text: string;
    source: T.IntakeSource;
    sourceRef: string | null;
    projectId: string | null;
    roomId: string | null;
    requestedBy: string;
    title: string;
    classification: Record<string, unknown> & {
      workflow: string;
      urgency: string;
      impact: string;
      risk: string;
      reason: string;
      by: string;
      override: boolean;
    };
    duplicateOf: { jobId: string; reason: string } | null;
  }): T.IntakeResult {
    const intakeId = newId('intake');
    const requestedBy = required(input.requestedBy, 'requestedBy');
    let jobId = '';
    this.write((events) => {
      const t = now();
      const c = input.classification;
      const insertIntake = `INSERT INTO intake_requests
        (id, raw_text, source, source_ref, project_id, requested_by, created_at, job_id, duplicate_of_job_id, dedupe_reason, classification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      if (input.duplicateOf) {
        jobId = input.duplicateOf.jobId;
        this.db
          .prepare(insertIntake)
          .run(intakeId, input.text, input.source, input.sourceRef, input.projectId, requestedBy, t, null, jobId, input.duplicateOf.reason, jsonText(c));
      } else {
        // Room: explicit, else a room of the project, else the shared "intake" room.
        let roomId = input.roomId;
        if (!roomId && input.projectId) {
          roomId = str(this.one('SELECT id FROM rooms WHERE project_id = ? AND archived = 0 ORDER BY created_at, rowid LIMIT 1', input.projectId)?.id);
        }
        if (!roomId) {
          roomId = str(this.one("SELECT id FROM rooms WHERE name = 'intake'")?.id);
          if (!roomId) {
            roomId = newId('room');
            this.db.prepare("INSERT INTO rooms (id, name, repo_path, created_at, kind) VALUES (?, 'intake', NULL, ?, 'adhoc')").run(roomId, t);
            this.recordEvent(events, { type: 'room.created', subjectId: roomId, payload: { name: 'intake' }, subjectType: 'room' });
          }
        }
        jobId = newId('job');
        this.insertJob(events, jobId, {
          roomId,
          title: input.title,
          brief: input.text,
          createdBy: requestedBy,
          projectId: input.projectId ?? undefined,
          risk: c.risk as T.Risk,
          priority: c.urgency === 'critical' ? 'urgent' : c.urgency === 'high' ? 'high' : c.urgency === 'low' ? 'low' : 'normal',
        });
        this.db
          .prepare(insertIntake)
          .run(intakeId, input.text, input.source, input.sourceRef, input.projectId, requestedBy, t, jobId, null, null, jsonText(c));
        this.db
          .prepare('UPDATE jobs SET workflow = ?, triage_reason = ?, urgency = ?, impact = ?, intake_id = ? WHERE id = ?')
          .run(c.workflow, c.reason, c.urgency, c.impact, intakeId, jobId);
      }
      this.recordEvent(events, {
        type: 'intake.received',
        subjectId: intakeId,
        subjectType: 'intake',
        actorId: requestedBy,
        payload: {
          intakeId,
          source: input.source,
          sourceRef: input.sourceRef,
          projectId: input.projectId,
          jobId,
          duplicate: !!input.duplicateOf,
          dedupeReason: input.duplicateOf?.reason ?? null,
        },
      });
      if (!input.duplicateOf) {
        this.recordEvent(events, {
          type: 'job.triaged',
          subjectId: jobId,
          subjectType: 'job',
          actorId: c.override ? c.by : null,
          actorKind: c.override ? 'agent' : 'system',
          payload: { intakeId, workflow: c.workflow, urgency: c.urgency, impact: c.impact, risk: c.risk, reason: c.reason, by: c.by, override: c.override },
        });
      }
    });
    return { intake: this.getIntake(intakeId), job: this.getJob(jobId), duplicate: !!input.duplicateOf };
  }

  /** Records an Orchestrator override of a job's triage (workflow and reason), with a `job.triaged` event. */
  overrideTriage(jobId: string, input: { workflow: string; reason: string; by: string }): T.JobDetail {
    const job = this.getJob(jobId);
    const workflow = oneOf(input.workflow, ['quick', 'feature', 'strategic', 'incident'] as const, 'workflow');
    const reason = required(input.reason, 'reason');
    const by = required(input.by, 'by');
    const full = `override by ${by}: ${reason} (was ${job.workflow ?? 'untriaged'}${job.triageReason ? `: ${job.triageReason}` : ''})`;
    this.write((events) => {
      this.db.prepare('UPDATE jobs SET workflow = ?, triage_reason = ?, updated_at = ? WHERE id = ?').run(workflow, full, now(), jobId);
      this.recordEvent(events, {
        type: 'job.triaged',
        subjectId: jobId,
        subjectType: 'job',
        actorId: by,
        actorKind: 'agent',
        payload: { intakeId: job.intakeId ?? null, workflow, reason: full, by, override: true, previousWorkflow: job.workflow ?? null },
      });
    });
    return this.getJob(jobId);
  }

  // ---------------------------------------------------------------- departments (K5)

  listDepartments(): T.Department[] {
    return this.all(
      `SELECT d.*, (SELECT COUNT(*) FROM identities i WHERE i.department_id = d.id) AS member_count FROM departments d ORDER BY d.name`
    ).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      leadIdentityId: str(r.lead_identity_id),
      createdAt: String(r.created_at),
      memberCount: num(r.member_count),
    }));
  }

  /** Sets department and seniority for identities that exist; idempotent. Also records the first lead per department. */
  applyDepartmentMapping(mapping: Record<string, T.DepartmentMappingEntry>): T.DepartmentMappingResult {
    const result: T.DepartmentMappingResult = { changed: [], unchanged: [], missing: [], leads: [] };
    const departments = new Set(this.all('SELECT id FROM departments').map((r) => String(r.id)));
    for (const entry of Object.values(mapping)) {
      if (!departments.has(entry.department)) throw new InputError(`unknown department ${entry.department}`);
      if (entry.seniority) oneOf(entry.seniority, ['exec', 'lead', 'senior', 'member'] as const, 'seniority');
    }
    this.write((events) => {
      for (const [rawId, entry] of Object.entries(mapping)) {
        const id = rawId.toLowerCase();
        const row = this.one('SELECT id, department_id, seniority FROM identities WHERE id = ?', id);
        if (!row) {
          result.missing.push(id);
          continue;
        }
        const seniority = entry.seniority ?? 'member';
        const was = { department: str(row.department_id), seniority: String(row.seniority ?? 'member') };
        if (was.department === entry.department && was.seniority === seniority) {
          result.unchanged.push(id);
        } else {
          this.db.prepare('UPDATE identities SET department_id = ?, seniority = ? WHERE id = ?').run(entry.department, seniority, id);
          this.recordEvent(events, {
            type: 'identity.updated',
            subjectId: id,
            subjectType: 'identity',
            payload: { departmentId: entry.department, seniority },
          });
          result.changed.push({ id, department: entry.department, seniority, was });
        }
        if (seniority === 'lead') {
          const res = this.db
            .prepare('UPDATE departments SET lead_identity_id = ? WHERE id = ? AND lead_identity_id IS NULL')
            .run(id, entry.department);
          if (Number(res.changes) > 0) result.leads.push({ department: entry.department, lead: id });
        }
      }
    });
    return result;
  }

  transitionJob(jobId: string, input: T.TransitionJobInput): T.JobDetail {
    const job = this.getJob(jobId);
    const to = oneOf(input.to, STAGES, 'to');
    const actorId = required(input.actorId, 'actorId');
    const actorKind = oneOf(input.actorKind, ['human', 'agent', 'system'] as const, 'actorKind', 'human');
    const allowed = STAGE_TRANSITIONS[job.stage];
    if (!allowed.includes(to)) {
      throw new ConflictError(`A job cannot move from ${job.stage} to ${to}. Allowed: ${allowed.join(', ') || 'none'}.`);
    }
    const gates = this.gates(job, to);
    if (gates.length && !input.force) throw new ConflictError(`Gates not met: ${gates.join('; ')}`);
    if (input.force && !this.isOwnerActor(actorId)) throw new ForbiddenError('Only the owner may force a stage transition');
    this.write((events) => {
      const t = now();
      const fields: [string, SQLInputValue][] = [['stage', to], ['updated_at', t], ['stage_note', input.note ?? null]];
      if (job.stage === 'brief') fields.push(['started_at', t]);
      if (to === 'done' || to === 'cancelled') fields.push(['ended_at', t]);
      this.db.prepare(`UPDATE jobs SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), jobId);
      this.db
        .prepare('INSERT INTO job_stage_history (job_id, from_stage, to_stage, actor_id, actor_kind, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(jobId, job.stage, to, actorId, actorKind, input.note ?? null, t);
      this.recordEvent(events, {
        type: 'job.stage_changed',
        subjectId: jobId,
        payload: { from: job.stage, to, forced: Boolean(input.force), gates: gates.length ? gates : undefined },
        actorId,
        actorKind,
        subjectType: 'job',
      });
    });
    return this.getJob(jobId);
  }

  setPlan(jobId: string, input: T.SetPlanInput): T.JobDetail {
    this.getJob(jobId);
    if (!input.plan || typeof input.plan !== 'object') throw new InputError('plan must be an object');
    const summary = required(input.plan.summary, 'plan.summary');
    const actorId = required(input.actorId, 'actorId');
    this.write((events) => {
      this.db.prepare('UPDATE jobs SET plan = ?, updated_at = ? WHERE id = ?').run(jsonText({ ...input.plan, summary }), now(), jobId);
      this.recordEvent(events, { type: 'job.plan_set', subjectId: jobId, payload: { summary }, actorId, actorKind: 'human', subjectType: 'job' });
    });
    return this.getJob(jobId);
  }

  acceptPlan(jobId: string, actorIdInput: string): T.JobDetail {
    const job = this.getJob(jobId);
    const actorId = required(actorIdInput, 'actorId');
    if (!job.plan?.summary) throw new ConflictError('There is no plan to accept');
    const plan: T.JobPlan = { ...job.plan, summary: job.plan.summary, approvedAt: now(), approvedBy: actorId };
    this.write((events) => {
      this.db.prepare('UPDATE jobs SET plan = ?, updated_at = ? WHERE id = ?').run(jsonText(plan), now(), jobId);
      this.recordEvent(events, { type: 'job.plan_accepted', subjectId: jobId, payload: { approvedBy: actorId }, actorId, actorKind: 'human', subjectType: 'job' });
    });
    return this.getJob(jobId);
  }

  /**
   * Materialises a validated plan packet in ONE transaction (S1-C): stores the packet as
   * the job plan, replaces tasks left over from a previous submission (only if untouched),
   * adds new criteria, creates tasks with real ids mapped from keys, links criteria and
   * records plan.submitted. Validation lives in planning/plan.ts.
   */
  materialisePlan(jobId: string, packet: T.PlanPacket, actor: { id: string; kind: T.ActorKind }): { taskKeys: Record<string, string>; replaced: string[] } {
    const job = this.getJob(jobId);
    if (job.stage !== 'plan') throw new ConflictError(`A plan can be submitted only while the job is in the plan stage (it is in ${job.stage})`);
    const previous = Object.values(job.plan?.taskKeys ?? {});
    const replace: string[] = [];
    for (const id of previous) {
      const t = job.tasks.find((x) => x.id === id);
      if (!t) continue;
      const touched = this.one('SELECT 1 AS x FROM sessions WHERE task_id = ? LIMIT 1', id);
      if (t.status !== 'pending' || touched) {
        throw new ConflictError(`Task "${t.title}" from the previous plan has already started (${t.status}); the plan can no longer be replaced`);
      }
      replace.push(id);
    }
    const taskKeys: Record<string, string> = {};
    for (const t of packet.tasks) taskKeys[t.key] = newId('task');
    const at = now();
    this.write((events) => {
      for (const id of replace) {
        this.db.prepare('DELETE FROM task_criteria WHERE task_id = ?').run(id);
        this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      }
      // A pending plan approval from the earlier submission is now stale.
      this.db
        .prepare(
          `UPDATE approvals SET status = 'declined', decided_by = 'runtime', decided_by_kind = 'system', decided_at = ?, note = 'superseded by a resubmitted plan'
           WHERE job_id = ? AND action_type = 'plan.accept' AND status = 'pending'`
        )
        .run(at, jobId);
      const criterionIds: string[] = [];
      const existing = new Map(job.criteria.map((c) => [c.text.trim().toLowerCase(), c.id]));
      let pos = Number(this.scalar('SELECT COALESCE(MAX(position), -1) + 1 FROM criteria WHERE job_id = ?', jobId) ?? 0);
      for (const text of packet.criteria ?? []) {
        let cid = existing.get(text.trim().toLowerCase());
        if (!cid) {
          cid = newId('crit');
          this.db.prepare('INSERT INTO criteria (id, job_id, text, position) VALUES (?, ?, ?, ?)').run(cid, jobId, text.trim(), pos++);
          existing.set(text.trim().toLowerCase(), cid);
        }
        criterionIds.push(cid);
      }
      let tpos = Number(this.scalar('SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE job_id = ?', jobId) ?? 0);
      const maxAttempts = this.lifecycleSettings().maxAttempts;
      for (const t of packet.tasks) {
        const id = taskKeys[t.key]!;
        this.db
          .prepare(
            `INSERT INTO tasks (id, job_id, title, assignee_id, check_command, status, created_at, position, plan_task_id, mode,
               evidence_required, updated_at, depends_on, priority, max_attempts, required_skills, verification_required, last_event_at)
             VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, 'build', 1, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id, jobId, t.title.trim(), t.assigneeId ?? null, t.checkCommand ?? null, at, tpos++, t.key, at,
            jsonText((t.dependsOn ?? []).map((k) => taskKeys[k]!)), integer(t.priority, 'priority', 0),
            maxAttempts, jsonText(t.requiredSkills ?? []), t.verificationRequired ? 1 : 0, at
          );
        for (const ref of t.criteriaRefs ?? []) {
          this.db.prepare('INSERT OR IGNORE INTO task_criteria (task_id, criterion_id) VALUES (?, ?)').run(id, criterionIds[ref]!);
        }
      }
      const { criteria: _c, tasks: _t, ...rest } = packet;
      const plan: T.JobPlan = { ...rest, taskKeys, submittedBy: actor.id, submittedAt: at, approvedAt: null, approvedBy: null };
      this.db.prepare('UPDATE jobs SET plan = ?, updated_at = ? WHERE id = ?').run(jsonText(plan), at, jobId);
      this.recordEvent(events, {
        type: 'plan.submitted',
        subjectId: jobId,
        subjectType: 'job',
        jobId,
        actorId: actor.id,
        actorKind: actor.kind,
        payload: { summary: packet.summary, risk: packet.risk, tasks: packet.tasks.length, replaced: replace.length, humanDecisions: packet.humanDecisions?.length ?? 0 },
      });
    });
    return { taskKeys, replaced: replace };
  }

  /** Records a plan lifecycle event (plan.auto_accepted and similar) with the given actor. */
  recordPlanEvent(jobId: string, type: string, payload: Record<string, unknown>, actor: { id: string; kind: T.ActorKind }): void {
    this.getJob(jobId);
    this.write((events) => {
      this.recordEvent(events, { type, subjectId: jobId, subjectType: 'job', jobId, actorId: actor.id, actorKind: actor.kind, payload });
    });
  }

  /** Accepts the plan and moves the job plan -> build. Used by auto-accept and by approving a plan.accept approval. */
  acceptPlanAndBuild(jobId: string, actor: { id: string; kind: T.ActorKind }, note: string): T.JobDetail {
    const job = this.getJob(jobId);
    if (job.stage !== 'plan') throw new ConflictError(`The job is in ${job.stage}, not plan`);
    this.acceptPlan(jobId, actor.id);
    return this.transitionJob(jobId, { to: 'build', actorId: actor.id, actorKind: actor.kind, note });
  }

  // ---------------------------------------------------------------- blockers / needs-you

  listBlockers(filter: { status?: 'open' | 'resolved'; jobId?: string } = {}): T.Blocker[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.status) {
      where.push('status = ?');
      params.push(oneOf(filter.status, ['open', 'resolved'] as const, 'status'));
    }
    if (filter.jobId) {
      where.push('job_id = ?');
      params.push(filter.jobId);
    }
    return this.all(`SELECT * FROM blockers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`, ...params).map((r) => ({
      id: String(r.id),
      jobId: str(r.job_id),
      taskId: str(r.task_id),
      raisedBy: String(r.raised_by),
      summary: String(r.summary),
      needs: str(r.needs),
      severity: String(r.severity) as T.Blocker['severity'],
      status: String(r.status) as T.Blocker['status'],
      resolvedBy: str(r.resolved_by),
      resolvedAt: str(r.resolved_at),
      createdAt: String(r.created_at),
    }));
  }

  resolveBlocker(blockerId: string, resolvedByInput: string): T.Blocker {
    const resolvedBy = required(resolvedByInput, 'resolvedBy');
    const row = this.one('SELECT * FROM blockers WHERE id = ?', blockerId);
    if (!row) throw new NotFoundError(`blocker ${blockerId} not found`);
    if (row.status === 'resolved') throw new ConflictError('This blocker is already resolved');
    this.write((events) => {
      this.db.prepare("UPDATE blockers SET status = 'resolved', resolved_by = ?, resolved_at = ? WHERE id = ?").run(resolvedBy, now(), blockerId);
      this.recordEvent(events, {
        type: 'blocker.resolved',
        subjectId: str(row.job_id),
        subjectType: 'job',
        jobId: str(row.job_id),
        taskId: str(row.task_id),
        actorId: resolvedBy,
        actorKind: 'human',
        payload: { blockerId },
      });
    });
    return this.listBlockers().find((b) => b.id === blockerId)!;
  }

  /** The one list of everything that waits for the owner (S1-C). Each source appears exactly once. */
  needsYou(): T.NeedsYouItem[] {
    const items: T.NeedsYouItem[] = [];
    const riskSeverity = (r?: string): T.NeedsYouItem['severity'] => (r === 'critical' || r === 'high' ? 'high' : r === 'medium' ? 'normal' : 'low');
    for (const a of this.listApprovals({ status: 'pending', limit: 1000 })) {
      items.push({ kind: 'approval', id: a.id, jobId: a.jobId, title: a.title, detail: a.consequence, createdAt: a.createdAt, severity: riskSeverity(a.risk) });
    }
    for (const b of this.listBlockers({ status: 'open' })) {
      items.push({
        kind: 'blocker', id: b.id, jobId: b.jobId, title: b.summary, detail: b.needs ?? b.summary, createdAt: b.createdAt,
        severity: b.severity === 'high' ? 'high' : b.severity === 'low' ? 'low' : 'normal',
      });
    }
    for (const r of this.all("SELECT * FROM tasks WHERE status IN ('needs_human', 'reassignment_required') ORDER BY updated_at DESC")) {
      const human = r.status === 'needs_human';
      items.push({
        kind: human ? 'task_needs_human' : 'task_reassignment_required',
        id: String(r.id),
        jobId: String(r.job_id),
        title: String(r.title),
        detail: human ? 'This task needs a human decision or action.' : 'This task failed and needs a new assignee.',
        createdAt: String(r.updated_at ?? r.created_at),
        severity: human ? 'high' : 'normal',
      });
    }
    for (const j of this.all("SELECT id, title, updated_at, created_at FROM jobs WHERE stage NOT IN ('done', 'cancelled')")) {
      const jobId = String(j.id);
      const b = this.budget(jobId);
      if (b.configured && b.limitCents != null && b.spentCents >= b.limitCents) {
        items.push({
          kind: 'budget_exception', id: jobId, jobId, title: `Budget exceeded: ${String(j.title)}`,
          detail: `${b.spentCents}c spent of ${b.limitCents}c (${b.source}).`, createdAt: String(j.updated_at ?? j.created_at), severity: 'high',
        });
      }
    }
    for (const j of this.all("SELECT id, title, updated_at, created_at FROM jobs WHERE stage = 'approve'")) {
      items.push({
        kind: 'delivery_approval', id: String(j.id), jobId: String(j.id), title: `Approve delivery: ${String(j.title)}`,
        detail: 'Verification is complete; the job waits for your delivery approval.', createdAt: String(j.updated_at ?? j.created_at), severity: 'normal',
      });
    }
    return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  private gates(job: T.JobDetail, to: T.JobStage): string[] {
    const gates: string[] = [];
    if (to === 'build') {
      if (!job.plan?.summary) gates.push('a plan is written');
      if (job.tasks.length === 0) gates.push('the plan has at least one task');
    }
    if (to === 'verify') {
      const unfinished = job.tasks.filter((t) => t.status !== 'done' && t.status !== 'verified');
      if (unfinished.length) gates.push(`${unfinished.length} task(s) are not done`);
      for (const task of job.tasks) {
        if (task.evidenceRequired === false) continue;
        const has = job.evidence.some((e) => e.taskId === task.id && e.class !== 'UNKNOWN');
        if (!has) gates.push(`task "${task.title}" has no evidence`);
      }
    }
    if (to === 'approve') {
      for (const criterion of job.criteria) {
        if (CLASS_RANK[criterion.evidenceClass] < CLASS_RANK.OBSERVED) {
          gates.push(`criterion "${criterion.text}" is not observed yet`);
        }
      }
    }
    if (to === 'done') {
      const pending = job.approvals.filter((a) => a.status === 'pending').length;
      if (pending) gates.push(`${pending} approval(s) are still pending`);
    }
    return gates;
  }

  addCriterion(jobId: string, input: T.CreateCriterionInput): T.Criterion {
    this.getJob(jobId);
    const text = required(input.text, 'text');
    const position = input.position == null ? Number(this.scalar('SELECT COALESCE(MAX(position), -1) + 1 FROM criteria WHERE job_id = ?', jobId) ?? 0) : positiveInt(input.position, 'position');
    const id = newId('crit');
    this.write((events) => {
      this.db.prepare('INSERT INTO criteria (id, job_id, text, position) VALUES (?, ?, ?, ?)').run(id, jobId, text, position);
      this.recordEvent(events, { type: 'criterion.added', subjectId: jobId, payload: { criterionId: id, text } });
    });
    return { id, text, position, evidenceClass: 'UNKNOWN', taskIds: [] };
  }

  updateCriterion(criterionId: string, input: { text?: string; position?: number }): void {
    const row = this.one('SELECT * FROM criteria WHERE id = ?', criterionId);
    if (!row) throw new NotFoundError(`criterion ${criterionId} not found`);
    const fields: [string, SQLInputValue][] = [];
    if (input.text !== undefined) fields.push(['text', required(input.text, 'text')]);
    if (input.position !== undefined) fields.push(['position', positiveInt(input.position, 'position')]);
    if (!fields.length) return;
    this.write((events) => {
      this.db.prepare(`UPDATE criteria SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), criterionId);
      this.recordEvent(events, { type: 'criterion.updated', subjectId: String(row.job_id), payload: { criterionId } });
    });
  }

  deleteCriterion(criterionId: string): void {
    const row = this.one('SELECT * FROM criteria WHERE id = ?', criterionId);
    if (!row) throw new NotFoundError(`criterion ${criterionId} not found`);
    if (this.one('SELECT id FROM evidence WHERE criterion_id = ? LIMIT 1', criterionId)) {
      throw new ConflictError('This criterion already has evidence; it cannot be deleted');
    }
    this.write((events) => {
      this.db.prepare('DELETE FROM criteria WHERE id = ?').run(criterionId);
      this.recordEvent(events, { type: 'criterion.deleted', subjectId: String(row.job_id), payload: { criterionId } });
    });
  }

  listHistory(jobId: string): T.JobStageHistory[] {
    return this.all('SELECT * FROM job_stage_history WHERE job_id = ? ORDER BY id', jobId).map(toHistory);
  }

  // ---------------------------------------------------------------- tasks

  listTasks(jobId: string): T.Task[] {
    return this.all('SELECT * FROM tasks WHERE job_id = ? ORDER BY position, created_at', jobId).map(toTask);
  }

  createTask(jobId: string, input: T.CreateTaskInput): T.Task {
    this.getJob(jobId);
    const title = required(input.title, 'title');
    const position = input.position == null ? Number(this.scalar('SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE job_id = ?', jobId) ?? 0) : positiveInt(input.position, 'position');
    const id = newId('task');
    const dependsOn = this.checkedDependsOn(id, input.dependsOn);
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO tasks (id, job_id, title, assignee_id, check_command, gate, status, created_at,
             position, plan_task_id, mode, evidence_required, updated_at, depends_on, priority, max_attempts,
             parent_task_id, required_skills, budget_tokens, verification_required, last_event_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, jobId, title, optionalString(input.assigneeId, 'assigneeId'), optionalString(input.checkCommand, 'checkCommand'),
          optionalString(input.gate, 'gate'), now(), position, optionalString(input.planTaskId, 'planTaskId'),
          oneOf(input.mode, TASK_MODES, 'mode', 'build'), input.evidenceRequired === false ? 0 : 1, now(),
          jsonText(dependsOn), integer(input.priority, 'priority', 0),
          input.maxAttempts == null ? this.lifecycleSettings().maxAttempts : positiveInt(input.maxAttempts, 'maxAttempts'),
          optionalString(input.parentTaskId, 'parentTaskId'), jsonText(stringList(input.requiredSkills, 'requiredSkills')),
          input.budgetTokens == null ? null : positiveInt(input.budgetTokens, 'budgetTokens'),
          input.verificationRequired ? 1 : 0, now()
        );
      for (const criterionId of input.criterionIds ?? []) {
        if (!this.one('SELECT id FROM criteria WHERE id = ? AND job_id = ?', criterionId, jobId)) {
          throw new NotFoundError(`criterion ${criterionId} not found on this job`);
        }
        this.db.prepare('INSERT OR IGNORE INTO task_criteria (task_id, criterion_id) VALUES (?, ?)').run(id, criterionId);
      }
      this.refreshJobUpdated(jobId);
      this.recordEvent(events, { type: 'task.created', subjectId: jobId, payload: { taskId: id, title }, subjectType: 'job' });
    });
    return this.listTasks(jobId).find((t) => t.id === id)!;
  }

  updateTask(taskId: string, input: T.UpdateTaskInput): T.Task {
    const row = this.one('SELECT * FROM tasks WHERE id = ?', taskId);
    if (!row) throw new NotFoundError(`task ${taskId} not found`);
    const jobId = String(row.job_id);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [['updated_at', now()]];
      if (input.title !== undefined) fields.push(['title', required(input.title, 'title')]);
      if (input.assigneeId !== undefined) fields.push(['assignee_id', optionalString(input.assigneeId, 'assigneeId')]);
      if (input.checkCommand !== undefined) fields.push(['check_command', optionalString(input.checkCommand, 'checkCommand')]);
      if (input.gate !== undefined) fields.push(['gate', optionalString(input.gate, 'gate')]);
      if (input.position !== undefined) fields.push(['position', positiveInt(input.position, 'position')]);
      if (input.mode !== undefined) fields.push(['mode', oneOf(input.mode, TASK_MODES, 'mode')]);
      if (input.evidenceRequired !== undefined) fields.push(['evidence_required', input.evidenceRequired ? 1 : 0]);
      if (input.dependsOn !== undefined) fields.push(['depends_on', jsonText(this.checkedDependsOn(taskId, input.dependsOn))]);
      if (input.priority !== undefined) fields.push(['priority', integer(input.priority, 'priority', 0)]);
      if (input.maxAttempts !== undefined) fields.push(['max_attempts', positiveInt(input.maxAttempts, 'maxAttempts')]);
      if (input.requiredSkills !== undefined) fields.push(['required_skills', jsonText(stringList(input.requiredSkills, 'requiredSkills'))]);
      if (input.budgetTokens !== undefined) fields.push(['budget_tokens', input.budgetTokens == null ? null : positiveInt(input.budgetTokens, 'budgetTokens')]);
      if (input.verificationRequired !== undefined) fields.push(['verification_required', input.verificationRequired ? 1 : 0]);
      this.db.prepare(`UPDATE tasks SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), taskId);
      this.refreshJobUpdated(jobId);
      this.recordEvent(events, {
        type: 'task.updated',
        subjectId: jobId,
        payload: { taskId, fields: fields.map(([c]) => c).filter((c) => c !== 'updated_at') },
        subjectType: 'job',
        jobId,
        taskId,
      });
    });
    return this.listTasks(jobId).find((t) => t.id === taskId)!;
  }

  // ------------------------------------------------- task lifecycle (K3, WP1)

  /** Lifecycle knobs (ackTimeoutSec, maxAttempts, backoffSec, staleSweepSec) from settings, else K3 defaults. */
  lifecycleSettings(): LifecycleSettings {
    return resolveLifecycleSettings((key) => this.getSetting(key));
  }

  /**
   * The only way a task's status changes. Validates against the K3 table, applies the
   * change and emits exactly one event in the same transaction. A repeated
   * idempotencyKey returns the task unchanged.
   */
  transitionTask(taskId: string, to: T.TaskStatus, opts: TransitionOptions): T.Task {
    const row = this.one('SELECT * FROM tasks WHERE id = ?', taskId);
    if (!row) throw new NotFoundError(`task ${taskId} not found`);
    if (opts.idempotencyKey && this.one('SELECT seq FROM events WHERE idempotency_key = ?', opts.idempotencyKey)) {
      return toTask(row);
    }
    const task = toTask(row);
    const plan = planTransition(
      {
        id: task.id,
        jobId: task.jobId,
        status: task.status,
        assigneeId: task.assigneeId,
        attempt: task.attempt ?? 0,
        maxAttempts: task.maxAttempts ?? 3,
        verificationRequired: Boolean(task.verificationRequired),
        startedAt: task.startedAt ?? null,
      },
      to,
      opts,
      this.lifecycleSettings()
    );
    const actorKind = opts.actorKind ?? 'agent';
    this.write((events) => {
      this.db
        .prepare(`UPDATE tasks SET ${plan.columns.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...plan.columns.map(([, v]) => v), taskId);
      this.refreshJobUpdated(task.jobId);
      this.recordEvent(events, {
        type: plan.eventType,
        subjectId: taskId,
        subjectType: 'task',
        payload: plan.payload,
        actorId: opts.actorId.trim(),
        actorKind,
        jobId: task.jobId,
        taskId,
        idempotencyKey: opts.idempotencyKey ?? null,
      });
    });
    return this.getTask(taskId);
  }

  /** Records liveness for the stale sweep: any session activity on a task counts as an event. */
  touchTask(taskId: string, at = now()): void {
    this.db.prepare('UPDATE tasks SET last_event_at = ? WHERE id = ?').run(at, taskId);
  }

  /** Pending tasks whose dependencies are all done or verified: priority high first, then position. */
  readyTasks(jobId?: string): T.Task[] {
    const pending = (jobId
      ? this.all("SELECT * FROM tasks WHERE status = 'pending' AND job_id = ?", jobId)
      : this.all("SELECT * FROM tasks WHERE status = 'pending'")
    ).map(toTask);
    const wanted = new Set(pending.flatMap((t) => t.dependsOn ?? []));
    const statusById = new Map<string, T.TaskStatus>();
    for (const id of wanted) {
      const r = this.one('SELECT status FROM tasks WHERE id = ?', id);
      if (r) statusById.set(id, r.status as T.TaskStatus);
    }
    return selectReady(
      pending.map((t) => ({ ...t, dependsOn: t.dependsOn ?? [], priority: t.priority ?? 0, position: t.position ?? 0 })),
      (id) => statusById.get(id)
    );
  }

  /** True when every dependency of the task is done or verified. */
  dependenciesMet(taskId: string): boolean {
    const task = this.getTask(taskId);
    return (task.dependsOn ?? []).every((id) => {
      const r = this.one('SELECT status FROM tasks WHERE id = ?', id);
      return r ? r.status === 'done' || r.status === 'verified' : false;
    });
  }

  /** Dependencies must exist and the resulting graph must stay acyclic. */
  private checkedDependsOn(taskId: string, input: unknown): string[] {
    const deps = [...new Set(stringList(input, 'dependsOn'))];
    for (const dep of deps) {
      if (dep === taskId) throw new ConflictError('A task cannot depend on itself');
      if (!this.one('SELECT id FROM tasks WHERE id = ?', dep)) throw new NotFoundError(`dependency ${dep} not found`);
    }
    if (deps.length) {
      const graph: Record<string, string[]> = {};
      for (const r of this.all("SELECT id, depends_on FROM tasks WHERE depends_on != '[]'")) {
        graph[String(r.id)] = parseJson<string[]>(r.depends_on, []);
      }
      graph[taskId] = deps;
      assertAcyclic(graph);
    }
    return deps;
  }

  /** Tasks selected by a SQL condition; used by the lifecycle sweeper. */
  listTasksWhere(where: string, ...params: SQLInputValue[]): T.Task[] {
    return this.all(`SELECT * FROM tasks WHERE ${where}`, ...params).map(toTask);
  }

  /**
   * A failed verification sends the work back (WP1 1.6): each failing task returns to its
   * assignee as `assigned` with the failing criterion in the reason, and a job in the
   * verify stage goes back to build.
   */
  returnFailedVerification(
    jobId: string,
    failures: { taskId: string; reason: string }[],
    actorId: string
  ): { returned: string[]; jobMovedToBuild: boolean } {
    const returned: string[] = [];
    for (const f of failures) {
      const task = this.getTask(f.taskId);
      if (!task.assigneeId || !['needs_review', 'verified', 'done'].includes(task.status)) continue;
      this.transitionTask(task.id, 'assigned', { actorId, actorKind: 'agent', reason: f.reason });
      returned.push(task.id);
    }
    let jobMovedToBuild = false;
    if (this.getJob(jobId).stage === 'verify') {
      this.transitionJob(jobId, {
        to: 'build',
        actorId,
        actorKind: 'agent',
        note: `Verification failed: ${failures.map((f) => f.reason).join('; ').slice(0, 500)}`,
      });
      jobMovedToBuild = true;
    }
    return { returned, jobMovedToBuild };
  }

  /** Text of the criteria a task is meant to satisfy. */
  taskCriterionTexts(taskId: string): string[] {
    return this.all(
      'SELECT c.text FROM task_criteria tc JOIN criteria c ON c.id = tc.criterion_id WHERE tc.task_id = ? ORDER BY c.position',
      taskId
    ).map((r) => String(r.text));
  }

  // ---------------------------------------------------------------- evidence

  listEvidence(filter: { jobId?: string; taskId?: string; sessionId?: string; criterionId?: string; limit?: number }): T.Evidence[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    for (const key of ['jobId', 'taskId', 'sessionId', 'criterionId'] as const) {
      if (filter[key]) {
        where.push(`${key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)} = ?`);
        params.push(filter[key]);
      }
    }
    params.push(Math.min(positiveInt(filter.limit, 'limit', 500) || 500, 2000));
    return this.all(
      `SELECT * FROM (SELECT *, rowid AS evidence_rowid FROM evidence ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, rowid DESC LIMIT ?) ORDER BY created_at, evidence_rowid`,
      ...params
    ).map(toEvidence);
  }

  appendEvidence(input: T.CreateEvidenceInput): T.Evidence {
    const kind = oneOf(input.kind, EVIDENCE_KINDS, 'kind');
    const evidenceClass = oneOf(input.class, EVIDENCE_CLASSES, 'class');
    if (evidenceClass === 'VERIFIED') throw new InputError('Verified evidence is written only by the verifier endpoint');
    const summary = required(input.summary, 'summary');
    const recordedBy = required(input.recordedBy, 'recordedBy');
    const recordedByKind = oneOf(input.recordedByKind, ['human', 'agent', 'system'] as const, 'recordedByKind', 'system');
    if (evidenceClass === 'OBSERVED' && recordedByKind === 'agent') {
      throw new InputError('An agent cannot report Observed evidence; use DECLARED/ATTESTED or let the runtime record it');
    }
    if (input.jobId && !this.one('SELECT id FROM jobs WHERE id = ?', input.jobId)) throw new NotFoundError(`job ${input.jobId} not found`);
    if (input.taskId && !this.one('SELECT id FROM tasks WHERE id = ?', input.taskId)) throw new NotFoundError(`task ${input.taskId} not found`);
    if (input.criterionId && !this.one('SELECT id FROM criteria WHERE id = ?', input.criterionId)) throw new NotFoundError(`criterion ${input.criterionId} not found`);
    const id = newId('ev');
    this.write((events) => {
      this.insertEvidenceRow({
        id,
        jobId: input.jobId ?? null,
        taskId: input.taskId ?? null,
        sessionId: input.sessionId ?? null,
        criterionId: input.criterionId ?? null,
        kind,
        class: evidenceClass,
        summary,
        payload: input.payload ?? {},
        artifactRefs: input.artifactRefs ?? [],
        command: input.command ?? null,
        exitCode: input.exitCode ?? null,
        commitSha: input.commitSha ?? null,
        worktree: input.worktree ?? null,
        recordedBy,
        recordedByKind,
        verifiedBy: null,
        verifiedAt: null,
        supersedes: null,
      });
      if (input.jobId) this.refreshJobUpdated(input.jobId);
      this.recordEvent(events, {
        type: 'evidence.recorded',
        subjectId: input.jobId ?? input.taskId ?? id,
        payload: { evidenceId: id, kind, class: evidenceClass, taskId: input.taskId ?? null, criterionId: input.criterionId ?? null },
        actorId: recordedBy,
        actorKind: recordedByKind,
        subjectType: input.jobId ? 'job' : 'evidence',
      });
    });
    return this.listEvidence({ jobId: input.jobId ?? undefined, limit: 500 }).find((e) => e.id === id)!;
  }

  private insertEvidenceRow(input: {
    id: string;
    jobId: string | null;
    taskId: string | null;
    sessionId: string | null;
    criterionId: string | null;
    kind: T.Evidence['kind'];
    class: T.EvidenceClass;
    summary: string;
    payload: unknown;
    artifactRefs: string[];
    command: string | null;
    exitCode: number | null;
    commitSha: string | null;
    worktree: string | null;
    recordedBy: string;
    recordedByKind: T.ActorKind;
    verifiedBy: string | null;
    verifiedAt: string | null;
    supersedes: string | null;
  }) {
    const createdAt = now();
    const prev = input.jobId
      ? this.one('SELECT content_hash FROM evidence WHERE job_id = ? ORDER BY rowid DESC LIMIT 1', input.jobId)
      : undefined;
    const prevHash = prev ? str(prev.content_hash) : null;
    const contentHash = sha256(
      JSON.stringify({
        prevHash,
        jobId: input.jobId,
        taskId: input.taskId,
        criterionId: input.criterionId,
        kind: input.kind,
        class: input.class,
        summary: input.summary,
        payload: input.payload,
        command: input.command,
        exitCode: input.exitCode,
        commitSha: input.commitSha,
        recordedBy: input.recordedBy,
        verifiedBy: input.verifiedBy,
        createdAt,
      })
    );
    this.db
      .prepare(
        `INSERT INTO evidence
          (id, job_id, task_id, session_id, criterion_id, kind, class, summary, payload, hash, prev_hash,
           content_hash, artifact_refs, command, exit_code, commit_sha, worktree, verified_by, verified_at,
           supersedes, recorded_by, recorded_by_kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id, input.jobId, input.taskId, input.sessionId, input.criterionId, input.kind, input.class,
        input.summary, jsonText(input.payload), contentHash, prevHash, contentHash, jsonText(input.artifactRefs),
        input.command, input.exitCode, input.commitSha, input.worktree, input.verifiedBy, input.verifiedAt,
        input.supersedes, input.recordedBy, input.recordedByKind, createdAt
      );
  }

  verifyEvidence(evidenceId: string, input: T.VerifyEvidenceInput): T.Evidence {
    const row = this.one('SELECT * FROM evidence WHERE id = ?', evidenceId);
    if (!row) throw new NotFoundError(`evidence ${evidenceId} not found`);
    const original = toEvidence(row);
    const verifiedBy = required(input.verifiedBy, 'verifiedBy');
    if (verifiedBy === original.recordedBy) throw new ConflictError('The verifier must be a different actor from the one that recorded the evidence');
    const id = newId('ev');
    this.write((events) => {
      this.insertEvidenceRow({
        id,
        jobId: original.jobId,
        taskId: original.taskId,
        sessionId: original.sessionId,
        criterionId: original.criterionId,
        kind: original.kind,
        class: 'VERIFIED',
        summary: input.note?.trim() ? `Verified: ${original.summary} — ${input.note.trim()}` : `Verified: ${original.summary}`,
        payload: { verifiedEvidenceId: evidenceId, note: input.note ?? null },
        artifactRefs: original.artifactRefs ?? [],
        command: input.command ?? original.command ?? null,
        exitCode: input.exitCode ?? original.exitCode ?? null,
        commitSha: input.commitSha ?? original.commitSha ?? null,
        worktree: input.worktree ?? original.worktree ?? null,
        recordedBy: verifiedBy,
        recordedByKind: 'agent',
        verifiedBy,
        verifiedAt: now(),
        supersedes: evidenceId,
      });
      if (original.jobId) this.refreshJobUpdated(original.jobId);
      this.recordEvent(events, {
        type: 'evidence.verified',
        subjectId: original.jobId ?? evidenceId,
        payload: { evidenceId: id, supersedes: evidenceId, verifiedBy },
        actorId: verifiedBy,
        actorKind: 'agent',
        subjectType: 'job',
      });
    });
    return this.listEvidence({ jobId: original.jobId ?? undefined, taskId: original.taskId ?? undefined, limit: 500 }).find((e) => e.id === id)!;
  }

  // ---------------------------------------------------------------- approvals / policies

  listApprovals(filter: { status?: T.ApprovalStatus; jobId?: string; assignedTo?: string; limit?: number } = {}): T.Approval[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.status) {
      where.push('status = ?');
      params.push(oneOf(filter.status, ['pending', 'approved', 'declined', 'expired', 'escalated'] as const, 'status'));
    }
    if (filter.jobId) {
      where.push('job_id = ?');
      params.push(filter.jobId);
    }
    if (filter.assignedTo) {
      where.push('(assigned_to = ? OR escalate_to = ?)');
      params.push(filter.assignedTo, filter.assignedTo);
    }
    params.push(Math.min(positiveInt(filter.limit, 'limit', 500) || 500, 1000));
    return this.all(
      `SELECT * FROM approvals ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`,
      ...params
    ).map(toApproval);
  }

  getApproval(id: string): T.Approval {
    const row = this.one('SELECT * FROM approvals WHERE id = ?', id);
    if (!row) throw new NotFoundError(`approval ${id} not found`);
    return toApproval(row);
  }

  createApproval(input: T.CreateApprovalInput): T.Approval {
    const job = this.getJob(required(input.jobId, 'jobId'));
    const title = required(input.title, 'title');
    const consequence = required(input.consequence, 'consequence');
    const requestedBy = required(input.requestedBy, 'requestedBy');
    const risk = oneOf(input.risk, RISKS, 'risk', 'low');
    const actionType = optionalString(input.actionType, 'actionType') ?? 'action';
    if (input.requestId) {
      const existing = this.one('SELECT * FROM approvals WHERE request_id = ?', input.requestId);
      if (existing) return toApproval(existing);
    }
    const policy = this.matchPolicy(job, actionType);
    const owner = this.ownerId();
    const lead = input.assignedTo ?? (policy?.leadId ?? null);
    const leadMax = policy?.maxRiskForLead ?? 'medium';
    const assignLead = Boolean(lead) && RISK_RANK[risk] <= RISK_RANK[leadMax] && lead !== owner;
    const assignedTo = assignLead ? lead : owner;
    const assignedKind: T.ActorKind = assignedTo === owner ? 'human' : 'agent';
    const escalateTo = policy?.escalateTo ?? (assignedTo === owner ? null : owner);
    const timeout = policy?.timeoutMinutes ?? 120;
    const expiresAt = new Date(Date.now() + timeout * 60_000).toISOString();
    const id = newId('apr');
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO approvals
            (id, job_id, title, consequence, action_type, action, risk, status, requested_by, requested_kind,
             assigned_to, assigned_kind, escalate_to, expires_at, policy_id, session_id, task_id, request_id,
             reversible, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, job.id, title, consequence, actionType, jsonText(input.action ?? {}), risk, requestedBy,
          oneOf(input.requestedKind, ['human', 'agent', 'system'] as const, 'requestedKind', 'agent'),
          assignedTo, assignedKind, escalateTo, expiresAt, policy?.id ?? null, input.sessionId ?? null,
          input.taskId ?? null, input.requestId ?? null, input.reversible == null ? null : input.reversible ? 1 : 0, now()
        );
      this.refreshJobUpdated(job.id);
      this.recordEvent(events, {
        type: 'approval.requested',
        subjectId: job.id,
        payload: { approvalId: id, actionType, risk, assignedTo, escalateTo },
        actorId: requestedBy,
        actorKind: 'agent',
        subjectType: 'job',
      });
    });
    return this.getApproval(id);
  }

  private matchPolicy(job: T.JobDetail, actionType: string): T.ApprovalPolicy | null {
    const rows = this.all(
      `SELECT * FROM approval_policies WHERE enabled = 1
         AND (action_type = ? OR action_type = '*')
         AND (scope = 'global' OR (scope = 'project' AND project_id = ?) OR (scope = 'room' AND room_id = ?))
       ORDER BY CASE scope WHEN 'room' THEN 3 WHEN 'project' THEN 2 ELSE 1 END DESC, created_at DESC`,
      actionType,
      job.projectId ?? '',
      job.roomId
    );
    return rows.length ? toPolicy(rows[0]!) : null;
  }

  decideApproval(approvalId: string, input: T.DecideApprovalInput): T.Approval {
    const approval = this.getApproval(approvalId);
    if (approval.status !== 'pending') throw new ConflictError(`This approval is already ${approval.status}`);
    const decidedBy = required(input.decidedBy, 'decidedBy');
    const decidedByKind = oneOf(input.decidedByKind, ['human', 'agent', 'system'] as const, 'decidedByKind', 'human');
    const decision = oneOf(input.decision, ['approve', 'decline'] as const, 'decision');
    const owner = this.ownerId();
    const isOwner = decidedBy === owner || this.isOwnerActor(decidedBy);
    if (!isOwner && decidedBy !== approval.assignedTo && decidedBy !== approval.escalateTo) {
      throw new ForbiddenError(`Only ${approval.assignedTo ?? 'the assigned approver'} or the owner may decide this approval`);
    }
    if (approval.expiresAt && Date.now() > Date.parse(approval.expiresAt) && !isOwner) {
      this.write((events) => {
        this.db
          .prepare(
            `UPDATE approvals SET escalated_at = ?, assigned_to = escalate_to,
               assigned_kind = 'human', expires_at = ? WHERE id = ?`
          )
          .run(now(), new Date(Date.now() + 24 * 60 * 60_000).toISOString(), approvalId);
        this.recordEvent(events, { type: 'approval.escalated', subjectId: approval.jobId, payload: { approvalId, to: approval.escalateTo } });
      });
      throw new ConflictError('This approval expired at the team-lead level and has been escalated to the owner');
    }
    this.write((events) => {
      this.db
        .prepare(
          `UPDATE approvals SET status = ?, decided_by = ?, decided_by_kind = ?, decided_at = ?, note = ?,
             execution = ?, executed_at = ? WHERE id = ?`
        )
        .run(
          decision === 'approve' ? 'approved' : 'declined',
          decidedBy, decidedByKind, now(), input.note ?? null,
          input.execution ? jsonText(input.execution) : null,
          input.execution ? now() : null,
          approvalId
        );
      this.refreshJobUpdated(approval.jobId);
      this.recordEvent(events, {
        type: 'approval.decided',
        subjectId: approval.jobId,
        payload: { approvalId, decision, decidedBy, decidedByKind },
        actorId: decidedBy,
        actorKind: decidedByKind,
        subjectType: 'job',
      });
    });
    if (decision === 'approve' && approval.actionType === 'plan.accept') {
      // Approving a plan acceptance moves the job into build (S1-C). Skipped if the job has moved on.
      if (this.getJob(approval.jobId).stage === 'plan') {
        this.acceptPlanAndBuild(approval.jobId, { id: decidedBy, kind: decidedByKind }, 'plan approved');
      }
    }
    return this.getApproval(approvalId);
  }

  sweepApprovals(): number {
    const pending = this.all("SELECT * FROM approvals WHERE status = 'pending' AND expires_at IS NOT NULL");
    let changed = 0;
    const owner = this.ownerId();
    for (const row of pending) {
      const approval = toApproval(row);
      if (!approval.expiresAt || Date.now() <= Date.parse(approval.expiresAt)) continue;
      const escalateTo = approval.escalateTo ?? (approval.assignedTo === owner ? null : owner);
      if (escalateTo && escalateTo !== approval.assignedTo) {
        this.write((events) => {
          this.db
            .prepare("UPDATE approvals SET escalated_at = ?, assigned_to = ?, assigned_kind = 'human', expires_at = ? WHERE id = ?")
            .run(now(), escalateTo, new Date(Date.now() + 24 * 60 * 60_000).toISOString(), approval.id);
          this.recordEvent(events, { type: 'approval.escalated', subjectId: approval.jobId, payload: { approvalId: approval.id, to: escalateTo } });
        });
      } else {
        this.write((events) => {
          this.db.prepare("UPDATE approvals SET status = 'expired' WHERE id = ?").run(approval.id);
          this.recordEvent(events, { type: 'approval.expired', subjectId: approval.jobId, payload: { approvalId: approval.id } });
        });
      }
      changed += 1;
    }
    return changed;
  }

  listPolicies(): T.ApprovalPolicy[] {
    return this.all('SELECT * FROM approval_policies ORDER BY created_at DESC').map(toPolicy);
  }

  createPolicy(input: T.CreatePolicyInput): T.ApprovalPolicy {
    const scope = oneOf(input.scope, ['global', 'project', 'room'] as const, 'scope');
    const id = newId('pol');
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO approval_policies
            (id, scope, project_id, room_id, action_type, max_risk_for_lead, lead_id, escalate_to, timeout_minutes, enabled, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, scope, input.projectId ?? null, input.roomId ?? null, required(input.actionType, 'actionType'),
          oneOf(input.maxRiskForLead, RISKS, 'maxRiskForLead', 'medium'), input.leadId ?? null,
          input.escalateTo ?? this.ownerId(), positiveInt(input.timeoutMinutes, 'timeoutMinutes', 120),
          input.enabled === false ? 0 : 1, now()
        );
      this.recordEvent(events, { type: 'policy.created', subjectId: id, payload: { scope, actionType: input.actionType } });
    });
    return toPolicy(this.one('SELECT * FROM approval_policies WHERE id = ?', id)!);
  }

  updatePolicy(id: string, input: T.UpdatePolicyInput): T.ApprovalPolicy {
    if (!this.one('SELECT id FROM approval_policies WHERE id = ?', id)) throw new NotFoundError(`policy ${id} not found`);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [];
      if (input.maxRiskForLead !== undefined) fields.push(['max_risk_for_lead', oneOf(input.maxRiskForLead, RISKS, 'maxRiskForLead')]);
      if (input.leadId !== undefined) fields.push(['lead_id', input.leadId]);
      if (input.escalateTo !== undefined) fields.push(['escalate_to', input.escalateTo]);
      if (input.timeoutMinutes !== undefined) fields.push(['timeout_minutes', positiveInt(input.timeoutMinutes, 'timeoutMinutes')]);
      if (input.enabled !== undefined) fields.push(['enabled', input.enabled ? 1 : 0]);
      if (fields.length) {
        this.db.prepare(`UPDATE approval_policies SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);
      }
      this.recordEvent(events, { type: 'policy.updated', subjectId: id });
    });
    return toPolicy(this.one('SELECT * FROM approval_policies WHERE id = ?', id)!);
  }

  deletePolicy(id: string): void {
    this.write((events) => {
      this.db.prepare('DELETE FROM approval_policies WHERE id = ?').run(id);
      this.recordEvent(events, { type: 'policy.deleted', subjectId: id });
    });
  }

  // ---------------------------------------------------------------- sessions / transcript

  listSessions(): T.Session[] {
    return this.all(`
      SELECT s.*,
        u.input_tokens AS usage_input_tokens,
        u.output_tokens AS usage_output_tokens,
        u.cost_cents AS usage_cost_cents,
        u.has_usage
      FROM sessions s
      LEFT JOIN (
        SELECT session_id,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(cost_cents) AS cost_cents,
          1 AS has_usage
        FROM usage
        WHERE session_id IS NOT NULL
        GROUP BY session_id
      ) u ON u.session_id = s.id
      ORDER BY s.started_at DESC
    `).map(toSession);
  }

  getSession(id: string): T.Session {
    const row = this.one(`
      SELECT s.*,
        u.input_tokens AS usage_input_tokens,
        u.output_tokens AS usage_output_tokens,
        u.cost_cents AS usage_cost_cents,
        u.has_usage
      FROM sessions s
      LEFT JOIN (
        SELECT session_id,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(cost_cents) AS cost_cents,
          1 AS has_usage
        FROM usage
        WHERE session_id IS NOT NULL
        GROUP BY session_id
      ) u ON u.session_id = s.id
      WHERE s.id = ?
    `, id);
    if (!row) throw new NotFoundError(`session ${id} not found`);
    return toSession(row);
  }

  registerSession(input: T.RegisterSessionInput): T.Session {
    const agentId = required(input.agentId, 'agentId');
    const runtimeCommand = required(input.runtimeCommand, 'runtimeCommand');
    if (!this.one('SELECT id FROM identities WHERE id = ?', agentId)) throw new NotFoundError(`identity ${agentId} not found`);
    let resolvedJobId = input.jobId ?? null;
    if (input.taskId) {
      const taskRow = this.one('SELECT job_id FROM tasks WHERE id = ?', input.taskId);
      if (!taskRow) throw new NotFoundError(`task ${input.taskId} not found`);
      if (!resolvedJobId) resolvedJobId = str(taskRow.job_id);
    }
    let generation = input.generation ?? 1;
    if (input.parentSessionId && input.generation == null) {
      const parentRow = this.one('SELECT generation FROM sessions WHERE id = ?', input.parentSessionId);
      if (parentRow) generation = Math.max(1, num(parentRow.generation) + 1);
    }
    const initialTokens = input.batonCapsule ? Math.ceil(input.batonCapsule.length / 3.8) : 0;
    const id = newId('sess');
    const t = now();
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO sessions
            (id, agent_id, task_id, job_id, room_id, runtime_command, pid, worktree, state, last_seen_at, started_at, ended_at,
             acp_session_id, adapter_id, mode, base_sha, base_branch, model, parent_session_id, generation, context_tokens, baton_capsule)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'starting', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, agentId, input.taskId ?? null, resolvedJobId, input.roomId ?? null,
          runtimeCommand, input.pid ?? null, input.worktree ?? null,
          t, t, input.acpSessionId ?? null, input.adapterId ?? null,
          oneOf(input.mode, TASK_MODES, 'mode', 'build'), input.baseSha ?? null, input.baseBranch ?? null, input.model ?? null,
          input.parentSessionId ?? null, generation, initialTokens, input.batonCapsule ?? null
        );
      if (input.parentSessionId) {
        this.db.prepare('UPDATE sessions SET superseded_by_session_id = ? WHERE id = ?').run(id, input.parentSessionId);
      }
      // Automatically capture the active session ID and ACP session ID on the agent identity record
      this.db
        .prepare(
          `UPDATE identities
             SET active_session_id = ?,
                 acp_session_id = COALESCE(?, acp_session_id),
                 status_state = CASE WHEN status_state IN ('rate_limited','waiting_reset') THEN status_state ELSE 'working' END,
                 last_woken_at = ?
           WHERE id = ?`
        )
        .run(id, input.acpSessionId ?? null, t, agentId);
      this.recordEvent(events, {
        type: 'session.started',
        subjectId: id,
        payload: {
          agentId,
          taskId: input.taskId ?? null,
          jobId: resolvedJobId,
          roomId: input.roomId ?? null,
          adapterId: input.adapterId ?? null,
          parentSessionId: input.parentSessionId ?? null,
          generation,
        },
        actorId: agentId,
        actorKind: 'agent',
        subjectType: 'session',
      });
    });
    return this.getSession(id);
  }

  updateSession(id: string, input: { state?: T.SessionState; pid?: number | null; lastSeenAt?: string; exitCode?: number | null; error?: string | null; turnCount?: number; acpSessionId?: string | null; model?: string | null; supersededBySessionId?: string | null; contextTokens?: number; batonCapsule?: string | null }): T.Session {
    const session = this.getSession(id);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [];
      if (input.state !== undefined) fields.push(['state', oneOf(input.state, ['starting', 'running', 'idle', 'stopped', 'failed'] as const, 'state')]);
      if (input.pid !== undefined) fields.push(['pid', input.pid]);
      fields.push(['last_seen_at', input.lastSeenAt ?? now()]);
      if (input.exitCode !== undefined) fields.push(['exit_code', input.exitCode]);
      if (input.error !== undefined) fields.push(['error', input.error]);
      if (input.turnCount !== undefined) fields.push(['turn_count', input.turnCount]);
      if (input.acpSessionId !== undefined) fields.push(['acp_session_id', input.acpSessionId]);
      if (input.model !== undefined) fields.push(['model', input.model]);
      if (input.supersededBySessionId !== undefined) fields.push(['superseded_by_session_id', input.supersededBySessionId]);
      if (input.contextTokens !== undefined) fields.push(['context_tokens', input.contextTokens]);
      if (input.batonCapsule !== undefined) fields.push(['baton_capsule', input.batonCapsule]);
      if (input.state === 'stopped' || input.state === 'failed') fields.push(['ended_at', now()]);
      this.db.prepare(`UPDATE sessions SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);

      // Keep the agent's identity record in sync with its session state & captured acpSessionId
      const idFields: [string, SQLInputValue][] = [['active_session_id', id]];
      if (input.acpSessionId) idFields.push(['acp_session_id', input.acpSessionId]);
      // A rate limit is cleared only explicitly (clearRateLimit) or when it resets, never by another
      // session of the same agent changing state; otherwise a limited agent could be woken early.
      const curId = this.one('SELECT status_state FROM identities WHERE id = ?', session.agentId);
      const limited = curId && ['rate_limited', 'waiting_reset'].includes(String(str(curId.status_state)));
      if (!limited) {
        if (input.state === 'starting' || input.state === 'running') idFields.push(['status_state', 'working']);
        else if (input.state === 'idle' || input.state === 'stopped' || input.state === 'failed') idFields.push(['status_state', 'idle']);
      }
      this.db
        .prepare(`UPDATE identities SET ${idFields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...idFields.map(([, v]) => v), session.agentId);

      this.recordEvent(events, {
        type: 'session.updated',
        subjectId: id,
        payload: { state: input.state ?? session.state, exitCode: input.exitCode ?? null, acpSessionId: input.acpSessionId ?? session.acpSessionId ?? null },
        subjectType: 'session',
      });
    });
    return this.getSession(id);
  }

  requestCancel(id: string, actorId: string): T.Session {
    const session = this.getSession(id);
    if (session.state === 'stopped' || session.state === 'failed') throw new ConflictError('This session has already ended');
    this.write((events) => {
      this.db.prepare('UPDATE sessions SET cancel_requested_at = ? WHERE id = ?').run(now(), id);
      this.recordEvent(events, {
        type: 'session.cancel_requested',
        subjectId: id,
        payload: { agentId: session.agentId },
        actorId,
        actorKind: 'human',
        subjectType: 'session',
      });
    });
    return this.getSession(id);
  }

  appendTranscript(sessionId: string, input: T.AppendTranscriptInput): T.TranscriptEntry {
    this.getSession(sessionId);
    const seq = input.seq == null ? this.nextTranscriptSeq(sessionId) : positiveInt(input.seq, 'seq');
    const serialized = jsonText(input.payload ?? {});
    const estimatedDelta =
      input.kind === 'prompt' ||
      input.kind === 'message' ||
      input.kind === 'agent_message_chunk' ||
      input.kind === 'thought' ||
      input.kind === 'tool'
        ? Math.max(1, Math.ceil(serialized.length / 3.8))
        : 0;
    const id = this.write((events) => {
      const res = this.db
        .prepare('INSERT INTO transcript_entries (session_id, kind, payload, created_at, seq, turn_id, item_id, role, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(sessionId, required(input.kind, 'kind'), serialized, now(), seq, input.turnId ?? null, input.itemId ?? null, input.role ?? null, input.title ?? null);
      this.db
        .prepare('UPDATE sessions SET last_event_at = ?, turn_count = COALESCE(turn_count, 0) + 1, context_tokens = COALESCE(context_tokens, 0) + ? WHERE id = ?')
        .run(now(), estimatedDelta, sessionId);
      this.db
        .prepare('UPDATE tasks SET last_event_at = ? WHERE id = (SELECT task_id FROM sessions WHERE id = ?)')
        .run(now(), sessionId);
      this.recordEvent(events, {
        type: 'session.transcript',
        subjectId: sessionId,
        payload: { seq, kind: input.kind },
        subjectType: 'session',
      });
      return Number(res.lastInsertRowid);
    });
    return toTranscript(this.one('SELECT * FROM transcript_entries WHERE id = ?', id)!);
  }

  private nextTranscriptSeq(sessionId: string): number {
    return Number(this.scalar('SELECT COALESCE(MAX(seq), 0) + 1 FROM transcript_entries WHERE session_id = ?', sessionId) ?? 1);
  }

  listTranscript(sessionId: string, since = 0, limit = 2000): T.TranscriptEntry[] {
    this.getSession(sessionId);
    return this.all(
      'SELECT * FROM transcript_entries WHERE session_id = ? AND COALESCE(seq, 0) > ? ORDER BY COALESCE(seq, 0), id LIMIT ?',
      sessionId,
      positiveInt(since, 'since', 0),
      Math.min(positiveInt(limit, 'limit', 2000) || 2000, 10000)
    ).map(toTranscript);
  }

  /** After a restart, sessions whose processes are gone must show as offline, not live. */
  reconcileSessions(): number {
    let changed = 0;
    for (const row of this.all("SELECT * FROM sessions WHERE state IN ('starting','running','idle')")) {
      const session = toSession(row);
      const alive = session.pid ? isAlive(session.pid) : false;
      if (alive) {
        this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now(), session.id);
        continue;
      }
      this.write((events) => {
        this.db
          .prepare("UPDATE sessions SET state = 'failed', ended_at = ?, error = ?, last_seen_at = ? WHERE id = ?")
          .run(now(), session.error ?? 'The runtime restarted and this session process is not running.', now(), session.id);
        this.recordEvent(events, {
          type: 'session.offline',
          subjectId: session.id,
          payload: { pid: session.pid, reason: 'process not found' },
          subjectType: 'session',
        });
      });
      changed += 1;
    }
    return changed;
  }

  // ---------------------------------------------------------------- usage / budgets

  listUsage(filter: { jobId?: string; sessionId?: string; limit?: number } = {}): T.Usage[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.jobId) {
      where.push('job_id = ?');
      params.push(filter.jobId);
    }
    if (filter.sessionId) {
      where.push('session_id = ?');
      params.push(filter.sessionId);
    }
    params.push(Math.min(positiveInt(filter.limit, 'limit', 1000) || 1000, 5000));
    return this.all(
      `SELECT * FROM usage ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`,
      ...params
    ).map(toUsage);
  }

  recordUsage(input: T.RecordUsageInput): T.Usage {
    const id = newId('use');
    const cost = positiveInt(input.costCents, 'costCents', 0);
    const inTok = positiveInt(input.inputTokens, 'inputTokens', 0);
    const outTok = positiveInt(input.outputTokens, 'outputTokens', 0);
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO usage (id, job_id, session_id, model, input_tokens, output_tokens, cost_cents, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, input.jobId ?? null, input.sessionId ?? null, input.model ?? null,
          inTok,
          outTok,
          cost, input.source ?? null, now()
        );
      if (input.sessionId && inTok > 0) {
        this.db
          .prepare('UPDATE sessions SET context_tokens = MAX(COALESCE(context_tokens, 0), ?) WHERE id = ?')
          .run(inTok, input.sessionId);
      }
      if (input.jobId) {
        this.db.prepare('UPDATE jobs SET cost_cents = cost_cents + ?, updated_at = ? WHERE id = ?').run(cost, now(), input.jobId);
      }
      this.recordEvent(events, {
        type: 'usage.recorded',
        subjectId: input.jobId ?? input.sessionId ?? id,
        payload: { usageId: id, costCents: cost, model: input.model ?? null },
        subjectType: 'usage',
      });
    });
    return toUsage(this.one('SELECT * FROM usage WHERE id = ?', id)!);
  }

  /**
   * Returns the remaining budget for a job. Unknown means unknown: when no
   * ceiling is configured the answer is `configured: false`, not a guess.
   */
  budget(jobId: string): { configured: boolean; source: string | null; limitCents: number | null; spentCents: number; remainingCents: number | null } {
    const job = this.getJob(jobId);
    if (job.budgetCents != null) {
      return {
        configured: true,
        source: 'job',
        limitCents: job.budgetCents,
        spentCents: job.costCents ?? 0,
        remainingCents: Math.max(0, job.budgetCents - (job.costCents ?? 0)),
      };
    }
    const projectBudget = job.projectId
      ? this.one("SELECT * FROM budgets WHERE scope = 'project' AND project_id = ? AND period = 'month' ORDER BY updated_at DESC LIMIT 1", job.projectId)
      : undefined;
    const globalBudget = this.one("SELECT * FROM budgets WHERE scope = 'global' AND period = 'month' ORDER BY updated_at DESC LIMIT 1");
    const budgetRow = projectBudget ?? globalBudget;
    if (budgetRow) {
      const limit = num(budgetRow.amount_cents);
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const scopeSql = projectBudget ? 'job_id IN (SELECT id FROM jobs WHERE project_id = ?)' : '1 = 1';
      const params: SQLInputValue[] = projectBudget ? [job.projectId!, monthStart.toISOString()] : [monthStart.toISOString()];
      const spent = Number(this.scalar(`SELECT COALESCE(SUM(cost_cents), 0) FROM usage WHERE ${scopeSql} AND created_at >= ?`, ...params) ?? 0);
      return {
        configured: true,
        source: projectBudget ? 'project' : 'global',
        limitCents: limit,
        spentCents: spent,
        remainingCents: Math.max(0, limit - spent),
      };
    }
    const settings = this.getSettings();
    if (typeof settings.defaultMonthlyBudgetCents === 'number') {
      const limit = settings.defaultMonthlyBudgetCents;
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const spent = Number(this.scalar('SELECT COALESCE(SUM(cost_cents), 0) FROM usage WHERE created_at >= ?', monthStart.toISOString()) ?? 0);
      return { configured: true, source: 'settings', limitCents: limit, spentCents: spent, remainingCents: Math.max(0, limit - spent) };
    }
    return { configured: false, source: null, limitCents: null, spentCents: job.costCents ?? 0, remainingCents: null };
  }

  assertBudget(jobId: string, estimateCents: number): void {
    const budget = this.budget(jobId);
    if (!budget.configured || budget.remainingCents == null) return;
    if (positiveInt(estimateCents, 'estimateCents', 0) > budget.remainingCents) {
      throw new ConflictError(
        `This would exceed the job budget: ${budget.remainingCents}¢ remaining of ${budget.limitCents}¢ (${budget.source}).`
      );
    }
  }

  // ---------------------------------------------------------------- budgets CRUD

  listBudgets(): T.Budget[] {
    return this.all('SELECT * FROM budgets ORDER BY scope, created_at').map(toBudget);
  }

  createBudget(input: T.CreateBudgetInput): T.Budget {
    const scope = oneOf(input.scope, ['global', 'project'] as const, 'scope');
    if (scope === 'project' && !input.projectId) throw new InputError('projectId is required for a project budget');
    const period = oneOf(input.period, ['job', 'day', 'month'] as const, 'period', 'month');
    const id = newId('bud');
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO budgets (id, scope, project_id, period, amount_cents, currency, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT DO UPDATE SET amount_cents = excluded.amount_cents, updated_at = excluded.updated_at`
        )
        .run(
          id, scope, input.projectId ?? null, period,
          positiveInt(input.amountCents, 'amountCents'), input.currency ?? 'USD', now(), now()
        );
      this.recordEvent(events, { type: 'budget.created', subjectId: input.projectId ?? null, payload: { scope, amountCents: input.amountCents } });
    });
    return toBudget(this.one('SELECT * FROM budgets WHERE id = ? OR (scope = ? AND COALESCE(project_id, \'\') = ? AND period = ?)', id, scope, input.projectId ?? '', period)!);
  }

  // ---------------------------------------------------------------- tasks (single), artifacts, worktrees

  findJobByNumber(number: number): T.JobDetail | null {
    const row = this.one('SELECT id FROM jobs WHERE number = ?', number);
    return row ? this.getJob(String(row.id)) : null;
  }

  bridgeIngested(sourcePath: string, contentHash: string): boolean {
    const row = this.one('SELECT content_hash FROM bridge_ingest WHERE source_path = ?', sourcePath);
    return Boolean(row && String(row.content_hash) === contentHash);
  }

  recordBridgeIngest(input: { sourcePath: string; contentHash: string; jobId: string; messageId?: string | null; evidenceId?: string | null }): void {
    this.db
      .prepare(
        `INSERT INTO bridge_ingest (source_path, content_hash, job_id, message_id, evidence_id, imported_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_path) DO UPDATE SET content_hash = excluded.content_hash,
           job_id = excluded.job_id, message_id = excluded.message_id, evidence_id = excluded.evidence_id,
           imported_at = excluded.imported_at`
      )
      .run(input.sourcePath, input.contentHash, input.jobId, input.messageId ?? null, input.evidenceId ?? null, now());
  }

  bridgeIngestCount(): number {
    return Number(this.scalar('SELECT COUNT(*) FROM bridge_ingest') ?? 0);
  }

  getEvidence(id: string): T.Evidence {
    const row = this.one('SELECT * FROM evidence WHERE id = ?', id);
    if (!row) throw new NotFoundError(`evidence ${id} not found`);
    return toEvidence(row);
  }

  getTask(taskId: string): T.Task {
    const row = this.one('SELECT * FROM tasks WHERE id = ?', taskId);
    if (!row) throw new NotFoundError(`task ${taskId} not found`);
    return toTask(row);
  }

  addArtifact(input: { sha256: string; path: string; mime?: string | null; bytes?: number }): T.Artifact {
    const sha256 = required(input.sha256, 'sha256');
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new InputError('sha256 must be a hex digest');
    this.db
      .prepare(
        `INSERT INTO artifacts (id, sha256, path, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(sha256) DO NOTHING`
      )
      .run(newId('art'), sha256, required(input.path, 'path'), input.mime ?? null, input.bytes ?? 0, now());
    return this.getArtifact(sha256);
  }

  getArtifact(sha256: string): T.Artifact {
    const row = this.one('SELECT * FROM artifacts WHERE sha256 = ?', sha256);
    if (!row) throw new NotFoundError(`artifact ${sha256} not found`);
    return {
      sha256: String(row.sha256),
      path: String(row.path),
      mime: str(row.mime),
      bytes: num(row.bytes),
      createdAt: String(row.created_at),
    };
  }

  recordWorktree(input: { jobId: string; taskId?: string | null; sessionId?: string | null; path: string; branch?: string | null; baseSha?: string | null }): void {
    if (!this.one('SELECT id FROM jobs WHERE id = ?', input.jobId)) throw new NotFoundError(`job ${input.jobId} not found`);
    const existing = this.one('SELECT id FROM worktrees WHERE job_id = ? AND path = ?', input.jobId, input.path);
    if (existing) return;
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO worktrees (id, job_id, task_id, session_id, path, branch, base_sha, state, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`
        )
        .run(newId('wt'), input.jobId, input.taskId ?? null, input.sessionId ?? null, input.path, input.branch ?? null, input.baseSha ?? null, now());
      this.recordEvent(events, { type: 'worktree.created', subjectId: input.jobId, payload: { path: input.path, branch: input.branch ?? null }, subjectType: 'job' });
    });
  }

  findWorktree(jobId: string): { path: string; branch: string | null; baseSha: string | null } | null {
    const row = this.one('SELECT * FROM worktrees WHERE job_id = ? AND state = ? ORDER BY created_at DESC LIMIT 1', jobId, 'active');
    return row ? { path: String(row.path), branch: str(row.branch), baseSha: str(row.base_sha) } : null;
  }

  setJobBaseSha(jobId: string, sha: string): void {
    this.db.prepare('UPDATE jobs SET base_sha = COALESCE(base_sha, ?) WHERE id = ?').run(sha, jobId);
  }

  // ---------------------------------------------------------------- councils / verdicts

  createCouncil(jobId: string, input: T.CreateCouncilInput): T.Council {
    const job = this.getJob(jobId);
    const mode = oneOf(input.mode, ['quick', 'full'] as const, 'mode', 'quick');
    const options = Array.isArray(input.options) ? input.options : [];
    const seats = Array.isArray(input.seats) ? input.seats : [];
    if (!options.length) throw new InputError('options must not be empty');
    if (!seats.length) throw new InputError('seats must not be empty');
    const seen = new Set<string>();
    for (const option of options) {
      const id = required(option.id, 'option.id');
      if (seen.has(id)) throw new InputError(`duplicate option id ${id}`);
      seen.add(id);
      required(option.label, 'option.label');
    }
    for (const seat of seats) {
      required(seat.seat, 'seat.seat');
      if (!Number.isFinite(seat.weight) || seat.weight <= 0) throw new InputError('seat.weight must be positive');
      if (seat.identityId && !this.one('SELECT id FROM identities WHERE id = ?', seat.identityId)) {
        throw new NotFoundError(`identity ${seat.identityId} not found`);
      }
    }
    const id = newId('council');
    const title = input.title?.trim() || job.title;
    const decision = input.decision?.trim() || job.title;
    const brief = input.brief?.trim() || job.brief;
    const assumptions = Array.isArray(input.assumptions) ? input.assumptions : [];
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO councils (id, job_id, mode, status, created_at, seat_config, started_at, title, decision, brief, assumptions)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, jobId, mode, 'running', now(), jsonText({ options, seats }), now(), title, decision, brief, jsonText(assumptions));
      this.refreshJobUpdated(jobId);
      this.recordEvent(events, { type: 'council.created', subjectId: jobId, payload: { councilId: id, mode, title }, subjectType: 'job' });
    });
    return this.getCouncil(id);
  }

  getCouncil(councilId: string): T.Council {
    const row = this.one('SELECT * FROM councils WHERE id = ?', councilId);
    if (!row) throw new NotFoundError(`council ${councilId} not found`);
    const config = parseJson<{ options: T.CouncilOption[]; seats: T.CouncilSeat[] }>(row.seat_config, { options: [], seats: [] });
    const cards = this.all('SELECT * FROM council_cards WHERE council_id = ? ORDER BY round, rowid', councilId).map(toCouncilCard);
    const verdictRow = this.one('SELECT * FROM verdicts WHERE council_id = ?', councilId);
    const draftObj = parseJson<Record<string, unknown>>(row.draft, {});
    return {
      id: String(row.id),
      jobId: String(row.job_id),
      mode: String(row.mode) as T.Council['mode'],
      status: String(row.status) as T.Council['status'],
      title: str(row.title),
      decision: str(row.decision),
      brief: str(row.brief),
      assumptions: parseJson<string[]>(row.assumptions, []),
      cruxes: parseJson<T.CouncilCrux[]>(row.cruxes, []),
      draft: Object.keys(draftObj).length ? (draftObj as unknown as T.CouncilDraft) : null,
      events: parseJson<T.CouncilStreamEvent[]>(row.events, []),
      sessionDir: str(row.session_dir),
      options: config.options,
      seats: config.seats,
      cards,
      verdict: verdictRow ? toVerdict(verdictRow) : null,
      createdAt: String(row.created_at),
    };
  }

  listCouncils(jobId: string): T.Council[] {
    this.getJob(jobId);
    return this.all('SELECT id FROM councils WHERE job_id = ? ORDER BY created_at DESC', jobId).map((r) => this.getCouncil(String(r.id)));
  }

  listAllCouncils(limit = 50): T.Council[] {
    return this.all('SELECT id FROM councils ORDER BY created_at DESC LIMIT ?', Math.min(positiveInt(limit, 'limit', 50) || 50, 200)).map((r) =>
      this.getCouncil(String(r.id))
    );
  }

  updateCouncilState(
    councilId: string,
    patch: {
      title?: string;
      decision?: string;
      brief?: string;
      assumptions?: string[];
      cruxes?: T.CouncilCrux[];
      draft?: T.CouncilDraft | null;
      events?: T.CouncilStreamEvent[];
      sessionDir?: string | null;
      options?: T.CouncilOption[];
      seats?: T.CouncilSeat[];
    }
  ): T.Council {
    const council = this.getCouncil(councilId);
    const sets: [string, SQLInputValue][] = [];
    if (patch.title !== undefined) sets.push(['title', patch.title]);
    if (patch.decision !== undefined) sets.push(['decision', patch.decision]);
    if (patch.brief !== undefined) sets.push(['brief', patch.brief]);
    if (patch.assumptions !== undefined) sets.push(['assumptions', jsonText(patch.assumptions)]);
    if (patch.cruxes !== undefined) sets.push(['cruxes', jsonText(patch.cruxes)]);
    if (patch.draft !== undefined) sets.push(['draft', jsonText(patch.draft ?? {})]);
    if (patch.events !== undefined) sets.push(['events', jsonText(patch.events)]);
    if (patch.sessionDir !== undefined) sets.push(['session_dir', patch.sessionDir]);
    if (patch.options !== undefined || patch.seats !== undefined) {
      sets.push([
        'seat_config',
        jsonText({
          options: patch.options ?? council.options,
          seats: patch.seats ?? council.seats,
        }),
      ]);
    }
    if (sets.length) {
      this.db
        .prepare(`UPDATE councils SET ${sets.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...sets.map(([, v]) => v), councilId);
    }
    return this.getCouncil(councilId);
  }

  appendCouncilEvent(councilId: string, ev: T.CouncilStreamEvent): void {
    const council = this.getCouncil(councilId);
    const nextEvents = [...(council.events ?? []), ev];
    this.write((events) => {
      this.db.prepare('UPDATE councils SET events = ? WHERE id = ?').run(jsonText(nextEvents), councilId);
      this.recordEvent(events, {
        type: 'council.event',
        subjectId: council.jobId,
        payload: { councilId, event: ev },
        subjectType: 'job',
      });
    });
  }

  addCouncilCard(councilId: string, input: T.CreateCouncilCardInput): T.CouncilCard {
    const council = this.getCouncil(councilId);
    if (council.status !== 'running') throw new ConflictError(`This council is ${council.status}; cards can only be added while running`);
    const seat = council.seats.find((s) => s.seat === input.seat);
    if (!seat) throw new InputError(`Unknown seat ${input.seat}`);
    const round = positiveInt(input.round, 'round', 1) || 1;
    const pillar = Number(input.pillar);
    if (!Number.isFinite(pillar) || pillar < 0 || pillar > 10) throw new InputError('pillar must be between 0 and 10');
    const scores: Record<string, number> = {};
    for (const option of council.options) {
      const value = Number(input.scores?.[option.id]);
      if (!Number.isFinite(value) || value < 0 || value > 10) throw new InputError(`scores.${option.id} must be between 0 and 10`);
      scores[option.id] = value;
    }
    const ruin: Record<string, T.Ruin> = {};
    for (const option of council.options) {
      ruin[option.id] = oneOf(input.ruin?.[option.id], ['none', 'possible', 'likely'] as const, `ruin.${option.id}`, 'none');
    }
    const confidence = input.confidence == null ? null : Number(input.confidence);
    if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 10)) {
      throw new InputError('confidence must be between 0 and 10');
    }
    if (input.identityId && !this.one('SELECT id FROM identities WHERE id = ?', input.identityId)) {
      throw new NotFoundError(`identity ${input.identityId} not found`);
    }
    const result: T.CouncilCardResult = {
      seat: seat.seat,
      identityId: input.identityId ?? seat.identityId ?? null,
      scores,
      pillar,
      confidence,
      ruin,
      reversible: input.reversible == null ? null : Boolean(input.reversible),
      argument: input.argument ?? null,
      text: input.text ?? input.argument ?? null,
      parsed: input.parsed ?? null,
      quotes: input.quotes ?? [],
    };
    const id = newId('card');
    this.write((events) => {
      this.db
        .prepare('INSERT INTO council_cards (id, council_id, round, seat, identity_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, councilId, round, seat.seat, result.identityId, jsonText(result), now());
      this.recordEvent(events, { type: 'council.card_added', subjectId: council.jobId, payload: { councilId, seat: seat.seat, round }, subjectType: 'job' });
    });
    return toCouncilCard(this.one('SELECT * FROM council_cards WHERE id = ?', id)!);
  }

  createVerdict(councilId: string, richOverride?: Partial<T.CouncilResult>): T.CouncilVerdict {
    const council = this.getCouncil(councilId);
    if (council.status !== 'running') throw new ConflictError(`This council is ${council.status}; it cannot produce another verdict`);
    if (!council.cards.length) throw new ConflictError('No cards have been submitted');
    // Score using the latest round's cards (or all cards if only 1 round)
    const maxRound = Math.max(...council.cards.map((c) => c.round || 1));
    const roundCards = council.cards.filter((c) => (c.round || 1) === maxRound).map((c) => c.result);
    let computed: T.CouncilResult;
    try {
      computed = computeCouncil(council.options, council.seats, roundCards.length ? roundCards : council.cards.map((c) => c.result));
    } catch (e) {
      throw new ConflictError((e as Error).message);
    }
    const result: T.CouncilResult = {
      ...computed,
      ...richOverride,
      scores: richOverride?.scores ?? computed.scores,
      topId: richOverride?.topId ?? computed.topId,
      recommended: richOverride?.recommended ?? computed.topId,
      rules: richOverride?.rules ?? computed.rules,
      conditions: richOverride?.conditions?.length ? richOverride.conditions : computed.conditions,
    };
    const id = newId('verdict');
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO verdicts (id, council_id, label, score, spread, confidence, support, payload, plan, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`
        )
        .run(id, councilId, result.label, result.support, result.spread, result.confidence, result.support, jsonText(result), now());
      this.db.prepare("UPDATE councils SET status = 'verdict', ended_at = ? WHERE id = ?").run(now(), councilId);
      this.refreshJobUpdated(council.jobId);
      this.recordEvent(events, {
        type: 'council.verdict',
        subjectId: council.jobId,
        payload: { councilId, verdictId: id, label: result.label, score: result.support },
        subjectType: 'job',
      });
    });
    return toVerdict(this.one('SELECT * FROM verdicts WHERE id = ?', id)!);
  }

  getVerdict(councilId: string): T.CouncilVerdict {
    const row = this.one('SELECT * FROM verdicts WHERE council_id = ?', councilId);
    if (!row) throw new NotFoundError(`council ${councilId} has no verdict`);
    return toVerdict(row);
  }

  acceptVerdict(councilId: string, input: T.AcceptVerdictInput): T.Council {
    const council = this.getCouncil(councilId);
    if (!council.verdict) throw new ConflictError('This council has no verdict to accept');
    const actorId = required(input.actorId, 'actorId');
    const councilResult = council.verdict.payload;
    const taskInputs = Array.isArray(input.tasks) ? input.tasks : [];
    this.write((events) => {
      const job = this.getJob(council.jobId);
      const plan: T.JobPlan = {
        summary: councilResult.call,
        options: councilResult.scores.map((s) => ({ id: s.id, label: s.label, score: s.score })),
        chosen: councilResult.topId,
        approvedAt: now(),
        approvedBy: actorId,
        councilId,
      };
      this.db.prepare('UPDATE jobs SET plan = ?, updated_at = ? WHERE id = ?').run(jsonText(plan), now(), job.id);
      let position = Number(this.scalar('SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE job_id = ?', job.id) ?? 0);
      for (const task of taskInputs) {
        const taskId = newId('task');
        this.db
          .prepare(
            `INSERT INTO tasks (id, job_id, title, assignee_id, check_command, gate, status, created_at,
               position, plan_task_id, mode, evidence_required, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
          )
          .run(
            taskId, job.id, required(task.title, 'task.title'), optionalString(task.assigneeId, 'assigneeId'),
            optionalString(task.checkCommand, 'checkCommand'), optionalString(task.gate, 'gate'), now(), position,
            optionalString(task.planTaskId, 'planTaskId'), oneOf(task.mode, TASK_MODES, 'mode', 'build'),
            task.evidenceRequired === false ? 0 : 1, now()
          );
        for (const criterionId of task.criterionIds ?? []) {
          if (!this.one('SELECT id FROM criteria WHERE id = ? AND job_id = ?', criterionId, job.id)) {
            throw new NotFoundError(`criterion ${criterionId} not found on this job`);
          }
          this.db.prepare('INSERT OR IGNORE INTO task_criteria (task_id, criterion_id) VALUES (?, ?)').run(taskId, criterionId);
        }
        position += 1;
      }
      const verdictPlan = { ...councilResult, tasks: taskInputs };
      this.db.prepare('UPDATE verdicts SET plan = ? WHERE council_id = ?').run(jsonText(verdictPlan), councilId);
      this.db.prepare("UPDATE councils SET status = 'accepted', ended_at = ? WHERE id = ?").run(now(), councilId);
      this.recordEvent(events, {
        type: 'council.accepted',
        subjectId: job.id,
        payload: { councilId, plan: plan.summary, tasks: taskInputs.length },
        actorId,
        actorKind: 'human',
        subjectType: 'job',
      });
    });
    return this.getCouncil(councilId);
  }

  // ---------------------------------------------------------------- idempotency

  findIdempotent(key: string): { status: number; body: unknown } | null {
    const row = this.one('SELECT * FROM idempotency_keys WHERE key = ?', key);
    if (!row) return null;
    return { status: num(row.status), body: parseJson<unknown>(row.body, null) };
  }

  saveIdempotent(key: string, method: string, path: string, status: number, body: unknown): void {
    this.db
      .prepare(
        `INSERT INTO idempotency_keys (key, method, path, status, body, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET status = excluded.status, body = excluded.body`
      )
      .run(key, method, path, status, jsonText(body), now());
  }

  // ---------------------------------------------------------------- adapters overrides

  listAdapterOverrides(): Row[] {
    return this.all('SELECT * FROM adapters ORDER BY id');
  }

  upsertAdapterOverride(id: string, input: { command?: string | null; args?: string[]; enabled?: boolean; abilities?: Record<string, boolean>; rateLimitResetAt?: string | null; rateLimitReason?: string | null }): void {
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO adapters (id, command, args, enabled, abilities, rate_limit_reset_at, rate_limit_reason, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             command = COALESCE(excluded.command, adapters.command),
             args = CASE WHEN excluded.args = '[]' AND adapters.args IS NOT NULL THEN adapters.args ELSE excluded.args END,
             enabled = excluded.enabled,
             abilities = CASE WHEN excluded.abilities = '{}' AND adapters.abilities IS NOT NULL THEN adapters.abilities ELSE excluded.abilities END,
             rate_limit_reset_at = excluded.rate_limit_reset_at,
             rate_limit_reason = excluded.rate_limit_reason,
             updated_at = excluded.updated_at`
        )
        .run(
          required(id, 'id'),
          input.command ?? null,
          jsonText(input.args ?? []),
          input.enabled === false ? 0 : 1,
          jsonText(input.abilities ?? {}),
          input.rateLimitResetAt ?? null,
          input.rateLimitReason ?? null,
          now()
        );
      this.recordEvent(events, { type: 'adapter.updated', subjectId: id, payload: { rateLimitResetAt: input.rateLimitResetAt ?? null, rateLimitReason: input.rateLimitReason ?? null } });
    });
  }

  setIdentityRateLimit(idInput: string, reason: string, resetAt: string): T.Identity {
    const id = required(idInput, 'id').toLowerCase();
    const identity = this.getIdentity(id);
    this.write((events) => {
      this.db
        .prepare(
          `UPDATE identities
             SET status_state = 'rate_limited',
                 rate_limit_reason = ?,
                 rate_limit_reset_at = ?
           WHERE id = ?`
        )
        .run(reason, resetAt, id);
      this.recordEvent(events, {
        type: 'agent.rate_limited',
        subjectId: id,
        payload: { agentId: id, adapterId: identity.adapterId ?? null, reason, resetAt },
        actorId: id,
        actorKind: 'agent',
        subjectType: 'identity',
      });
    });
    return this.getIdentity(id);
  }

  clearIdentityRateLimit(idInput: string): T.Identity {
    const id = required(idInput, 'id').toLowerCase();
    this.getIdentity(id);
    this.write((events) => {
      this.db
        .prepare(
          `UPDATE identities
             SET status_state = CASE WHEN status_state IN ('rate_limited','waiting_reset') THEN 'idle' ELSE status_state END,
                 rate_limit_reason = NULL,
                 rate_limit_reset_at = NULL
           WHERE id = ?`
        )
        .run(id);
      this.recordEvent(events, {
        type: 'agent.rate_limit_cleared',
        subjectId: id,
        payload: { agentId: id },
        actorId: id,
        actorKind: 'agent',
        subjectType: 'identity',
      });
    });
    return this.getIdentity(id);
  }

  setAdapterRateLimit(adapterId: string, reason: string, resetAt: string): void {
    const id = required(adapterId, 'adapterId').toLowerCase();
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO adapters (id, command, args, enabled, abilities, rate_limit_reset_at, rate_limit_reason, updated_at)
           VALUES (?, NULL, '[]', 1, '{}', ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             rate_limit_reset_at = excluded.rate_limit_reset_at,
             rate_limit_reason = excluded.rate_limit_reason,
             updated_at = excluded.updated_at`
        )
        .run(id, resetAt, reason, now());
      this.recordEvent(events, {
        type: 'adapter.rate_limited',
        subjectId: id,
        payload: { adapterId: id, reason, resetAt },
        subjectType: 'adapter',
      });
    });
  }

  clearAdapterRateLimit(adapterId: string): void {
    const id = required(adapterId, 'adapterId').toLowerCase();
    this.write((events) => {
      this.db
        .prepare(
          `UPDATE adapters SET rate_limit_reset_at = NULL, rate_limit_reason = NULL, updated_at = ? WHERE id = ?`
        )
        .run(now(), id);
      this.recordEvent(events, {
        type: 'adapter.rate_limit_cleared',
        subjectId: id,
        payload: { adapterId: id },
        subjectType: 'adapter',
      });
    });
  }

  /** Sweeps expired rate limits and returns the agent IDs that just reset. */
  sweepExpiredRateLimits(): string[] {
    const t = now();
    const expiredIdentities = this.all(
      'SELECT id FROM identities WHERE rate_limit_reset_at IS NOT NULL AND rate_limit_reset_at <= ?',
      t
    );
    const expiredAdapters = this.all(
      'SELECT id FROM adapters WHERE rate_limit_reset_at IS NOT NULL AND rate_limit_reset_at <= ?',
      t
    );
    const clearedAgents: string[] = [];
    for (const row of expiredIdentities) {
      const id = String(row.id);
      this.clearIdentityRateLimit(id);
      clearedAgents.push(id);
    }
    for (const row of expiredAdapters) {
      this.clearAdapterRateLimit(String(row.id));
    }
    return clearedAgents;
  }

  // ---------------------------------------------------------------- agent wakes

  createWake(input: {
    targetAgentId: string;
    fromActorId: string;
    fromActorKind?: T.ActorKind;
    jobId?: string | null;
    roomId?: string | null;
    taskId?: string | null;
    sessionId?: string | null;
    adapterId?: string | null;
    reason?: string;
    prompt: string;
    status?: T.WakeStatus;
    scheduledFor?: string | null;
  }): T.AgentWake {
    const targetAgentId = required(input.targetAgentId, 'targetAgentId').toLowerCase();
    const fromActorId = required(input.fromActorId, 'fromActorId');
    const fromActorKind = oneOf(input.fromActorKind, ['human', 'agent', 'system'] as const, 'fromActorKind', 'agent');
    const prompt = required(input.prompt, 'prompt');
    const reason = input.reason?.trim() || 'Direct wake request';
    const status = oneOf(input.status, ['pending', 'dispatched', 'deferred_rate_limit', 'completed', 'failed'] as const, 'status', 'pending');
    const id = newId('wake');
    const t = now();
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO agent_wakes
            (id, target_agent_id, from_actor_id, from_actor_kind, job_id, room_id, task_id, session_id,
             adapter_id, reason, prompt, status, scheduled_for, created_at, dispatched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          targetAgentId,
          fromActorId,
          fromActorKind,
          input.jobId ?? null,
          input.roomId ?? null,
          input.taskId ?? null,
          input.sessionId ?? null,
          input.adapterId ?? null,
          reason,
          prompt,
          status,
          input.scheduledFor ?? null,
          t,
          status === 'dispatched' ? t : null
        );
      this.recordEvent(events, {
        type: 'agent.wake_requested',
        subjectId: targetAgentId,
        payload: { wakeId: id, targetAgentId, fromActorId, status, reason, scheduledFor: input.scheduledFor ?? null, jobId: input.jobId ?? null, roomId: input.roomId ?? null },
        actorId: fromActorId,
        actorKind: fromActorKind,
        subjectType: 'identity',
      });
    });
    return this.getWake(id);
  }

  updateWake(
    id: string,
    patch: {
      status?: T.WakeStatus;
      sessionId?: string | null;
      adapterId?: string | null;
      scheduledFor?: string | null;
      dispatchedAt?: string | null;
      completedAt?: string | null;
      error?: string | null;
    }
  ): T.AgentWake {
    const wake = this.getWake(id);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [];
      if (patch.status !== undefined) {
        fields.push(['status', patch.status]);
        if (patch.status === 'dispatched' && !wake.dispatchedAt) fields.push(['dispatched_at', now()]);
        if (patch.status === 'completed' || patch.status === 'failed') fields.push(['completed_at', now()]);
      }
      if (patch.sessionId !== undefined) fields.push(['session_id', patch.sessionId]);
      if (patch.adapterId !== undefined) fields.push(['adapter_id', patch.adapterId]);
      if (patch.scheduledFor !== undefined) fields.push(['scheduled_for', patch.scheduledFor]);
      if (patch.dispatchedAt !== undefined) fields.push(['dispatched_at', patch.dispatchedAt]);
      if (patch.completedAt !== undefined) fields.push(['completed_at', patch.completedAt]);
      if (patch.error !== undefined) fields.push(['error', patch.error]);
      if (fields.length) {
        this.db.prepare(`UPDATE agent_wakes SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);
      }
      this.recordEvent(events, {
        type: 'agent.wake_updated',
        subjectId: wake.targetAgentId,
        payload: { wakeId: id, status: patch.status ?? wake.status, sessionId: patch.sessionId ?? wake.sessionId },
        subjectType: 'identity',
      });
    });
    return this.getWake(id);
  }

  getWake(id: string): T.AgentWake {
    const row = this.one('SELECT * FROM agent_wakes WHERE id = ?', id);
    if (!row) throw new NotFoundError(`wake ${id} not found`);
    return toAgentWake(row);
  }

  listWakes(filter: { targetAgentId?: string; jobId?: string; roomId?: string; status?: T.WakeStatus; limit?: number } = {}): T.AgentWake[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.targetAgentId) {
      where.push('target_agent_id = ?');
      params.push(filter.targetAgentId.toLowerCase());
    }
    if (filter.jobId) {
      where.push('job_id = ?');
      params.push(filter.jobId);
    }
    if (filter.roomId) {
      where.push('room_id = ?');
      params.push(filter.roomId);
    }
    if (filter.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    params.push(Math.min(positiveInt(filter.limit, 'limit', 200) || 200, 1000));
    return this.all(
      `SELECT * FROM agent_wakes ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`,
      ...params
    ).map(toAgentWake);
  }

  // ---------------------------------------------------------------- agent schedules (cron / timer)

  createSchedule(input: {
    agentId: string;
    createdBy: string;
    createdByKind?: T.ActorKind;
    jobId?: string | null;
    roomId?: string | null;
    taskId?: string | null;
    kind: 'timer' | 'cron' | 'interval';
    cronExpr?: string | null;
    intervalSeconds?: number | null;
    nextRunAt: string;
    prompt: string;
    reason?: string | null;
    maxRuns?: number | null;
  }): T.AgentSchedule {
    const agentId = required(input.agentId, 'agentId').toLowerCase();
    if (!this.one('SELECT id FROM identities WHERE id = ?', agentId)) throw new NotFoundError(`identity ${agentId} not found`);
    const createdBy = required(input.createdBy, 'createdBy');
    const createdByKind = oneOf(input.createdByKind, ['human', 'agent', 'system'] as const, 'createdByKind', 'agent');
    const kind = oneOf(input.kind, ['timer', 'cron', 'interval'] as const, 'kind');
    const prompt = required(input.prompt, 'prompt');
    const nextRunAt = required(input.nextRunAt, 'nextRunAt');
    const id = newId('sched');
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO agent_schedules
            (id, agent_id, created_by, created_by_kind, job_id, room_id, task_id, kind, cron_expr,
             interval_seconds, next_run_at, prompt, reason, enabled, max_runs, run_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?)`
        )
        .run(
          id,
          agentId,
          createdBy,
          createdByKind,
          input.jobId ?? null,
          input.roomId ?? null,
          input.taskId ?? null,
          kind,
          input.cronExpr ?? null,
          input.intervalSeconds ?? null,
          nextRunAt,
          prompt,
          input.reason ?? null,
          input.maxRuns ?? (kind === 'timer' ? 1 : null),
          now()
        );
      this.recordEvent(events, {
        type: 'schedule.created',
        subjectId: agentId,
        payload: { scheduleId: id, agentId, kind, cronExpr: input.cronExpr ?? null, intervalSeconds: input.intervalSeconds ?? null, nextRunAt },
        actorId: createdBy,
        actorKind: createdByKind,
        subjectType: 'schedule',
      });
    });
    return this.getSchedule(id);
  }

  getSchedule(id: string): T.AgentSchedule {
    const row = this.one('SELECT * FROM agent_schedules WHERE id = ?', id);
    if (!row) throw new NotFoundError(`schedule ${id} not found`);
    return toAgentSchedule(row);
  }

  listSchedules(filter: { agentId?: string; jobId?: string; roomId?: string; enabledOnly?: boolean } = {}): T.AgentSchedule[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.agentId) {
      where.push('agent_id = ?');
      params.push(filter.agentId.toLowerCase());
    }
    if (filter.jobId) {
      where.push('job_id = ?');
      params.push(filter.jobId);
    }
    if (filter.roomId) {
      where.push('room_id = ?');
      params.push(filter.roomId);
    }
    if (filter.enabledOnly) {
      where.push('enabled = 1');
    }
    return this.all(
      `SELECT * FROM agent_schedules ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY next_run_at ASC`,
      ...params
    ).map(toAgentSchedule);
  }

  listDueSchedules(asOfIso = now()): T.AgentSchedule[] {
    return this.all(
      'SELECT * FROM agent_schedules WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC',
      asOfIso
    ).map(toAgentSchedule);
  }

  updateSchedule(id: string, input: T.UpdateScheduleInput & { lastRunAt?: string; runCount?: number }): T.AgentSchedule {
    this.getSchedule(id);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [];
      if (input.enabled !== undefined) fields.push(['enabled', input.enabled ? 1 : 0]);
      if (input.prompt !== undefined) fields.push(['prompt', required(input.prompt, 'prompt')]);
      if (input.cronExpr !== undefined) fields.push(['cron_expr', input.cronExpr]);
      if (input.intervalSeconds !== undefined) fields.push(['interval_seconds', input.intervalSeconds]);
      if (input.nextRunAt !== undefined) fields.push(['next_run_at', input.nextRunAt]);
      if (input.lastRunAt !== undefined) fields.push(['last_run_at', input.lastRunAt]);
      if (input.runCount !== undefined) fields.push(['run_count', input.runCount]);
      if (fields.length) {
        this.db.prepare(`UPDATE agent_schedules SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);
      }
      this.recordEvent(events, { type: 'schedule.updated', subjectId: id, subjectType: 'schedule' });
    });
    return this.getSchedule(id);
  }

  deleteSchedule(id: string): void {
    this.getSchedule(id);
    this.write((events) => {
      this.db.prepare('DELETE FROM agent_schedules WHERE id = ?').run(id);
      this.recordEvent(events, { type: 'schedule.deleted', subjectId: id, subjectType: 'schedule' });
    });
  }

  setJobShipped(jobId: string, input: { shipSha: string; shipStatus: T.ShipStatus; shipPayload: Record<string, unknown> }): T.JobDetail {
    this.getJob(jobId);
    this.write((events) => {
      this.db
        .prepare('UPDATE jobs SET ship_sha = ?, ship_status = ?, ship_payload = ?, updated_at = ? WHERE id = ?')
        .run(input.shipSha, input.shipStatus, jsonText(input.shipPayload), now(), jobId);
      this.recordEvent(events, {
        type: 'job.shipped',
        subjectId: jobId,
        payload: input,
        subjectType: 'job',
      });
    });
    return this.getJob(jobId);
  }

  // ---------------------------------------------------------------- design studio (infinite canvas)

  listDesignBoards(filter: { projectId?: string; jobId?: string; roomId?: string } = {}): T.DesignBoard[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.projectId) {
      where.push('b.project_id = ?');
      params.push(filter.projectId);
    }
    if (filter.jobId) {
      where.push('b.job_id = ?');
      params.push(filter.jobId);
    }
    if (filter.roomId) {
      where.push('b.room_id = ?');
      params.push(filter.roomId);
    }
    return this.all(
      `SELECT b.*,
        (SELECT COUNT(*) FROM design_frames f WHERE f.board_id = b.id AND f.status != 'archived') AS frame_count,
        (SELECT COUNT(*) FROM design_frames f WHERE f.board_id = b.id AND f.status = 'approved') AS approved_count
       FROM design_boards b
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY b.updated_at DESC`,
      ...params
    ).map((r) => toDesignBoard(r));
  }

  getDesignBoard(id: string): T.DesignBoard {
    const row = this.one(
      `SELECT b.*,
        (SELECT COUNT(*) FROM design_frames f WHERE f.board_id = b.id AND f.status != 'archived') AS frame_count,
        (SELECT COUNT(*) FROM design_frames f WHERE f.board_id = b.id AND f.status = 'approved') AS approved_count
       FROM design_boards b WHERE b.id = ?`,
      id
    );
    if (!row) throw new NotFoundError(`design board ${id} not found`);
    const frames = this.all('SELECT * FROM design_frames WHERE board_id = ? ORDER BY created_at ASC', id).map((f) => {
      const versions = this.all('SELECT * FROM design_frame_versions WHERE frame_id = ? ORDER BY version DESC', String(f.id)).map(toDesignFrameVersion);
      return toDesignFrame(f, versions);
    });
    return toDesignBoard(row, frames);
  }

  createDesignBoard(input: T.CreateDesignBoardInput & { designTokens?: T.DesignTokens }): T.DesignBoard {
    const title = required(input.title, 'title');
    const mode = oneOf(input.mode, ['greenfield', 'extracted', 'hybrid'] as const, 'mode', 'greenfield');
    const id = newId('dboard');
    const t = now();
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO design_boards
            (id, project_id, job_id, room_id, title, description, mode, viewport_x, viewport_y, viewport_zoom, design_tokens_json, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0.85, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.projectId ?? null,
          input.jobId ?? null,
          input.roomId ?? null,
          title,
          optionalString(input.description, 'description'),
          mode,
          jsonText(input.designTokens ?? {}),
          input.createdBy?.trim() || 'winston',
          t,
          t
        );
      this.recordEvent(events, {
        type: 'design.board_created',
        subjectId: id,
        payload: { title, mode, projectId: input.projectId ?? null, jobId: input.jobId ?? null },
        subjectType: 'design_board',
      });
    });
    return this.getDesignBoard(id);
  }

  updateDesignBoard(id: string, input: T.UpdateDesignBoardInput & { designTokens?: T.DesignTokens }): T.DesignBoard {
    this.getDesignBoard(id);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [['updated_at', now()]];
      if (input.title !== undefined) fields.push(['title', required(input.title, 'title')]);
      if (input.description !== undefined) fields.push(['description', optionalString(input.description, 'description')]);
      if (input.viewportX !== undefined) fields.push(['viewport_x', Number(input.viewportX)]);
      if (input.viewportY !== undefined) fields.push(['viewport_y', Number(input.viewportY)]);
      if (input.viewportZoom !== undefined) fields.push(['viewport_zoom', Math.max(0.2, Math.min(2.5, Number(input.viewportZoom)))]);
      if (input.designTokens !== undefined) fields.push(['design_tokens_json', jsonText(input.designTokens)]);
      this.db.prepare(`UPDATE design_boards SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);
      this.recordEvent(events, { type: 'design.board_updated', subjectId: id, subjectType: 'design_board' });
    });
    return this.getDesignBoard(id);
  }

  deleteDesignBoard(id: string): void {
    this.getDesignBoard(id);
    this.write((events) => {
      this.db.prepare('DELETE FROM design_boards WHERE id = ?').run(id);
      this.recordEvent(events, { type: 'design.board_deleted', subjectId: id, subjectType: 'design_board' });
    });
  }

  getDesignFrame(id: string): T.DesignFrame {
    const row = this.one('SELECT * FROM design_frames WHERE id = ?', id);
    if (!row) throw new NotFoundError(`design frame ${id} not found`);
    const versions = this.all('SELECT * FROM design_frame_versions WHERE frame_id = ? ORDER BY version DESC', id).map(toDesignFrameVersion);
    return toDesignFrame(row, versions);
  }

  createDesignFrame(input: T.CreateDesignFrameInput & { htmlPath?: string | null }): T.DesignFrame {
    const board = this.getDesignBoard(input.boardId);
    const title = required(input.title, 'title');
    const device = oneOf(input.device, ['phone', 'tablet', 'desktop', 'custom'] as const, 'device', 'phone');
    const defaultDims = device === 'desktop' ? { w: 1200, h: 780 } : device === 'tablet' ? { w: 834, h: 1080 } : { w: 393, h: 852 };
    const width = input.width ? Math.max(240, Number(input.width)) : defaultDims.w;
    const height = input.height ? Math.max(240, Number(input.height)) : defaultDims.h;

    // Auto-layout horizontally on the canvas if coordinates not specified
    let x = input.x;
    let y = input.y;
    if (x == null || y == null) {
      const existing = board.frames ?? [];
      if (input.parentFrameId) {
        const parent = existing.find((f) => f.id === input.parentFrameId);
        if (parent) {
          const siblings = existing.filter((f) => f.parentFrameId === parent.id);
          x = parent.x + parent.width + 64;
          y = parent.y + siblings.length * (Math.min(height, 460) + 48);
        }
      }
      if (x == null || y == null) {
        const maxRight = existing.reduce((acc, f) => Math.max(acc, f.x + f.width), 20);
        x = existing.length === 0 ? 64 : maxRight + 64;
        y = 64;
      }
    }

    const id = newId('dframe');
    const verId = newId('dfver');
    const t = now();
    const authorId = input.authorId?.trim() || 'atlas';
    const htmlContent = input.htmlContent ?? '';

    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO design_frames
            (id, board_id, parent_frame_id, title, version, device, width, height, x, y, status, source_files_json, html_path, html_content, notes, author_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          board.id,
          input.parentFrameId ?? null,
          title,
          device,
          width,
          height,
          x,
          y,
          jsonText(input.sourceFiles ?? []),
          input.htmlPath ?? null,
          htmlContent,
          optionalString(input.notes, 'notes'),
          authorId,
          t,
          t
        );
      this.db
        .prepare(
          `INSERT INTO design_frame_versions
            (id, frame_id, version, title, html_content, notes, author_id, created_at)
           VALUES (?, ?, 1, ?, ?, ?, ?, ?)`
        )
        .run(verId, id, title, htmlContent, optionalString(input.notes, 'notes'), authorId, t);
      this.db.prepare('UPDATE design_boards SET updated_at = ? WHERE id = ?').run(t, board.id);
      this.recordEvent(events, {
        type: 'design.frame_created',
        subjectId: id,
        payload: { boardId: board.id, title, device, parentFrameId: input.parentFrameId ?? null },
        actorId: authorId,
        actorKind: 'agent',
        subjectType: 'design_frame',
      });
    });
    return this.getDesignFrame(id);
  }

  updateDesignFrame(
    id: string,
    input: T.UpdateDesignFrameInput & {
      htmlPath?: string | null;
      bumpVersion?: boolean;
      approvedBy?: string | null;
      approvedAt?: string | null;
      evidenceId?: string | null;
    }
  ): T.DesignFrame {
    const existing = this.getDesignFrame(id);
    const t = now();
    const contentChanged = input.htmlContent !== undefined && input.htmlContent !== existing.htmlContent;
    const nextVersion = contentChanged && input.bumpVersion !== false ? existing.version + 1 : existing.version;

    this.write((events) => {
      const fields: [string, SQLInputValue][] = [['updated_at', t]];
      if (input.title !== undefined) fields.push(['title', required(input.title, 'title')]);
      if (input.device !== undefined) fields.push(['device', oneOf(input.device, ['phone', 'tablet', 'desktop', 'custom'] as const, 'device')]);
      if (input.width !== undefined) fields.push(['width', Math.max(240, Number(input.width))]);
      if (input.height !== undefined) fields.push(['height', Math.max(240, Number(input.height))]);
      if (input.x !== undefined) fields.push(['x', Number(input.x)]);
      if (input.y !== undefined) fields.push(['y', Number(input.y)]);
      if (input.status !== undefined) fields.push(['status', oneOf(input.status, ['draft', 'iterating', 'approved', 'archived'] as const, 'status')]);
      if (input.sourceFiles !== undefined) fields.push(['source_files_json', jsonText(input.sourceFiles)]);
      if (input.htmlPath !== undefined) fields.push(['html_path', input.htmlPath]);
      if (input.htmlContent !== undefined) {
        fields.push(['html_content', input.htmlContent]);
        fields.push(['version', nextVersion]);
      }
      if (input.notes !== undefined) fields.push(['notes', optionalString(input.notes, 'notes')]);
      if (input.authorId !== undefined) fields.push(['author_id', input.authorId]);
      if (input.approvedBy !== undefined) fields.push(['approved_by', input.approvedBy]);
      if (input.approvedAt !== undefined) fields.push(['approved_at', input.approvedAt]);
      if (input.evidenceId !== undefined) fields.push(['evidence_id', input.evidenceId]);

      this.db.prepare(`UPDATE design_frames SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);

      if (contentChanged && input.bumpVersion !== false) {
        this.db
          .prepare(
            `INSERT INTO design_frame_versions
              (id, frame_id, version, title, html_content, notes, author_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            newId('dfver'),
            id,
            nextVersion,
            input.title ?? existing.title,
            input.htmlContent!,
            input.notes !== undefined ? optionalString(input.notes, 'notes') : existing.notes,
            input.authorId ?? existing.authorId,
            t
          );
      }
      this.db.prepare('UPDATE design_boards SET updated_at = ? WHERE id = ?').run(t, existing.boardId);
      this.recordEvent(events, {
        type: 'design.frame_updated',
        subjectId: id,
        payload: { boardId: existing.boardId, version: nextVersion, status: input.status ?? existing.status },
        subjectType: 'design_frame',
      });
    });
    return this.getDesignFrame(id);
  }

  deleteDesignFrame(id: string): void {
    const existing = this.getDesignFrame(id);
    this.write((events) => {
      this.db.prepare('DELETE FROM design_frames WHERE id = ?').run(id);
      this.db.prepare('UPDATE design_boards SET updated_at = ? WHERE id = ?').run(now(), existing.boardId);
      this.recordEvent(events, { type: 'design.frame_deleted', subjectId: id, payload: { boardId: existing.boardId }, subjectType: 'design_frame' });
    });
  }

  // ---------------------------------------------------------------- communication hub

  seedCommunicationHub(legacyDbPath?: string): void {
    try {
      const row = this.one('SELECT COUNT(*) AS c FROM threads');
      if (row && Number(row.c) > 0) return; // already seeded

      const candidates: string[] = [];
      if (legacyDbPath) candidates.push(legacyDbPath);
      if (process.env.MYAOS_LEGACY_DB) candidates.push(process.env.MYAOS_LEGACY_DB);
      candidates.push(path.resolve('data/myaos.db'), path.resolve('../data/myaos.db'), path.resolve('../../data/myaos.db'));
      const teamRepo = loadConfig().teamRepo;
      if (teamRepo) candidates.push(path.join(teamRepo, 'data/myaos.db'));

      let foundDb: DatabaseSync | null = null;
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          try {
            foundDb = new DatabaseSync(cand, { readOnly: true });
            break;
          } catch {
            /* ignore */
          }
        }
      }

      if (!foundDb) return;

      try {
        const legacyThreads = foundDb.prepare('SELECT * FROM threads').all() as Row[];
        const legacyMessages = foundDb.prepare('SELECT * FROM messages').all() as Row[];
        const legacyAnnouncements = foundDb.prepare('SELECT * FROM announcements').all() as Row[];
        const legacySocial = foundDb.prepare('SELECT * FROM social_posts').all() as Row[];
        const legacyStandups = foundDb.prepare('SELECT * FROM standups').all() as Row[];

        this.write(() => {
          const insertThread = this.db.prepare(
            `INSERT OR IGNORE INTO threads (id, title, author_identities, target_identities, status, related_task_id, related_project_id, created_at, updated_at, original_file_path)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const t of legacyThreads) {
            insertThread.run(
              String(t.id),
              String(t.title),
              str(t.author_identities) ?? '[]',
              str(t.target_identities) ?? '[]',
              str(t.status) ?? 'open',
              str(t.related_task_id),
              str(t.related_project_id),
              String(t.created_at || now()),
              String(t.updated_at || now()),
              str(t.original_file_path)
            );
          }

          const insertThreadMsg = this.db.prepare(
            `INSERT INTO thread_messages (thread_id, from_identity, to_identity, msg_type, priority, subject, body, read, ts)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          const insertInboxMsg = this.db.prepare(
            `INSERT INTO inbox_messages (thread_id, from_identity, to_identity, msg_type, priority, subject, body, read, ts)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );

          for (const m of legacyMessages) {
            const threadId = str(m.thread_id);
            if (threadId) {
              insertThreadMsg.run(
                threadId,
                str(m.from_identity),
                str(m.to_identity),
                str(m.type) ?? 'COORDINATION',
                str(m.priority) ?? 'normal',
                str(m.subject),
                String(m.body ?? ''),
                num(m.read),
                String(m.ts || now())
              );
            } else {
              insertInboxMsg.run(
                null,
                str(m.from_identity),
                str(m.to_identity) || 'Winston',
                str(m.type) ?? 'COORDINATION',
                str(m.priority) ?? 'normal',
                str(m.subject),
                String(m.body ?? ''),
                num(m.read),
                String(m.ts || now())
              );
            }
          }

          const insertAnn = this.db.prepare(
            `INSERT INTO announcements (title, author_identity, content, audience, ts, original_file_path)
             VALUES (?, ?, ?, ?, ?, ?)`
          );
          for (const a of legacyAnnouncements) {
            insertAnn.run(
              String(a.title),
              str(a.author_identity),
              String(a.content ?? ''),
              str(a.audience) ?? 'all',
              String(a.ts || now()),
              str(a.original_file_path)
            );
          }

          const insertSoc = this.db.prepare(
            `INSERT INTO social_posts (channel, author_identity, content, ts, original_file_path)
             VALUES (?, ?, ?, ?, ?)`
          );
          for (const s of legacySocial) {
            insertSoc.run(
              String(s.channel),
              str(s.author_identity),
              String(s.content ?? ''),
              String(s.ts || now()),
              str(s.original_file_path)
            );
          }

          const insertStd = this.db.prepare(
            `INSERT INTO standups (standup_date, facilitator, present_identities, absent_identities, content, parsed_updates, ts, original_file_path)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const st of legacyStandups) {
            insertStd.run(
              String(st.standup_date),
              str(st.facilitator),
              str(st.present_identities) ?? '[]',
              str(st.absent_identities) ?? '[]',
              String(st.content ?? ''),
              str(st.parsed_updates) ?? '{}',
              String(st.ts || now()),
              str(st.original_file_path)
            );
          }
        });
      } finally {
        try {
          foundDb.close();
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.warn('[runtime] seedCommunicationHub notice:', (err as Error).message);
    }
  }

  listInboxMessages(identity: string, limit = 50): T.ChatMessage[] {
    const rows = this.all(
      `SELECT * FROM inbox_messages
       WHERE LOWER(to_identity) = LOWER(?) OR LOWER(to_identity) = 'all' OR LOWER(to_identity) = 'team'
       ORDER BY id DESC LIMIT ?`,
      identity,
      Math.max(1, limit)
    );
    return rows.map(toChatMessage);
  }

  sendInboxMessage(input: T.SendInboxMessageInput): T.ChatMessage {
    const from = input.from.trim();
    const to = input.to.trim();
    const body = input.body.trim();
    const subject = input.subject?.trim() || null;
    const priority = input.priority?.trim() || 'normal';
    const t = now();

    let id = 0;
    this.write((events) => {
      const res = this.db
        .prepare(
          `INSERT INTO inbox_messages (from_identity, to_identity, msg_type, priority, subject, body, read, ts)
           VALUES (?, ?, 'COORDINATION', ?, ?, ?, 0, ?)`
        )
        .run(from, to, priority, subject, body, t);
      id = Number(res.lastInsertRowid);

      this.recordEvent(events, {
        type: 'communication.inbox_message_sent',
        subjectId: String(id),
        payload: { from, to, subject, priority },
        actorId: from,
        subjectType: 'inbox_message',
      });
    });

    const row = this.one('SELECT * FROM inbox_messages WHERE id = ?', id);
    return toChatMessage(row!);
  }

  listThreads(): T.Thread[] {
    const rows = this.all(
      `SELECT t.*,
        (SELECT COUNT(*) FROM thread_messages tm WHERE tm.thread_id = t.id) AS message_count
       FROM threads t
       ORDER BY t.updated_at DESC`
    );
    return rows.map(toThread);
  }

  getThread(id: string): T.Thread {
    const row = this.one(
      `SELECT t.*,
        (SELECT COUNT(*) FROM thread_messages tm WHERE tm.thread_id = t.id) AS message_count
       FROM threads t
       WHERE t.id = ?`,
      id
    );
    if (!row) throw new NotFoundError(`thread ${id} not found`);
    return toThread(row);
  }

  getThreadMessages(threadId: string): T.ChatMessage[] {
    const rows = this.all(
      `SELECT * FROM thread_messages
       WHERE thread_id = ?
       ORDER BY id ASC`,
      threadId
    );
    return rows.map(toChatMessage);
  }

  createThread(input: T.CreateThreadInput): T.Thread {
    const title = input.title.trim();
    const author = input.author.trim();
    const initialMsg = input.initialMessage.trim();
    const targetIdentities = input.targetIdentities ?? [];
    const t = now();
    const threadId = `th_${slugify(title)}_${Date.now().toString(36)}`;

    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO threads (id, title, author_identities, target_identities, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'open', ?, ?)`
        )
        .run(threadId, title, JSON.stringify([author]), JSON.stringify(targetIdentities), t, t);

      this.db
        .prepare(
          `INSERT INTO thread_messages (thread_id, from_identity, to_identity, msg_type, priority, subject, body, read, ts)
           VALUES (?, ?, ?, 'COORDINATION', 'normal', ?, ?, 0, ?)`
        )
        .run(threadId, author, targetIdentities[0] ?? null, title, initialMsg, t);

      this.recordEvent(events, {
        type: 'communication.thread_created',
        subjectId: threadId,
        payload: { title, author, targetIdentities },
        actorId: author,
        subjectType: 'thread',
      });
    });

    return this.getThread(threadId);
  }

  postThreadReply(threadId: string, input: T.PostThreadReplyInput): T.ChatMessage {
    this.getThread(threadId); // asserts exists
    const from = input.from.trim();
    const body = input.body.trim();
    const t = now();

    let id = 0;
    this.write((events) => {
      const res = this.db
        .prepare(
          `INSERT INTO thread_messages (thread_id, from_identity, msg_type, priority, body, read, ts)
           VALUES (?, ?, 'COORDINATION', 'normal', ?, 0, ?)`
        )
        .run(threadId, from, body, t);
      id = Number(res.lastInsertRowid);

      this.db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(t, threadId);

      this.recordEvent(events, {
        type: 'communication.thread_reply_posted',
        subjectId: String(id),
        payload: { threadId, from },
        actorId: from,
        subjectType: 'thread_message',
      });
    });

    const row = this.one('SELECT * FROM thread_messages WHERE id = ?', id);
    return toChatMessage(row!);
  }

  listAnnouncements(limit = 20): T.Announcement[] {
    const rows = this.all('SELECT * FROM announcements ORDER BY ts DESC LIMIT ?', Math.max(1, limit));
    return rows.map(toAnnouncement);
  }

  createAnnouncement(input: T.CreateAnnouncementInput): T.Announcement {
    const title = input.title.trim();
    const author = input.author.trim();
    const content = input.content.trim();
    const audience = input.audience?.trim() || 'all';
    const t = now();

    let id = 0;
    this.write((events) => {
      const res = this.db
        .prepare(
          `INSERT INTO announcements (title, author_identity, content, audience, ts)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(title, author, content, audience, t);
      id = Number(res.lastInsertRowid);

      this.recordEvent(events, {
        type: 'communication.announcement_created',
        subjectId: String(id),
        payload: { title, author, audience },
        actorId: author,
        subjectType: 'announcement',
      });
    });

    const row = this.one('SELECT * FROM announcements WHERE id = ?', id);
    return toAnnouncement(row!);
  }

  listSocialPosts(channel?: string, limit = 50): T.SocialPost[] {
    const rows = channel && channel !== 'all'
      ? this.all('SELECT * FROM social_posts WHERE channel = ? ORDER BY ts DESC LIMIT ?', channel, Math.max(1, limit))
      : this.all('SELECT * FROM social_posts ORDER BY ts DESC LIMIT ?', Math.max(1, limit));
    return rows.map(toSocialPost);
  }

  createSocialPost(input: T.CreateSocialPostInput): T.SocialPost {
    const channel = input.channel.trim();
    const author = input.author.trim();
    const content = input.content.trim();
    const t = now();

    let id = 0;
    this.write((events) => {
      const res = this.db
        .prepare(
          `INSERT INTO social_posts (channel, author_identity, content, ts)
           VALUES (?, ?, ?, ?)`
        )
        .run(channel, author, content, t);
      id = Number(res.lastInsertRowid);

      this.recordEvent(events, {
        type: 'communication.social_posted',
        subjectId: String(id),
        payload: { channel, author },
        actorId: author,
        subjectType: 'social_post',
      });
    });

    const row = this.one('SELECT * FROM social_posts WHERE id = ?', id);
    return toSocialPost(row!);
  }

  listStandups(limit = 10): T.Standup[] {
    const rows = this.all('SELECT * FROM standups ORDER BY standup_date DESC LIMIT ?', Math.max(1, limit));
    return rows.map(toStandup);
  }

  createStandup(input: T.CreateStandupInput): T.Standup {
    const standupDate = input.standup_date.trim();
    const facilitator = input.facilitator?.trim() || null;
    const content = input.content.trim();
    const present = JSON.stringify(input.present_identities ?? []);
    const absent = JSON.stringify(input.absent_identities ?? []);
    const parsedUpdates = input.parsed_updates || '{}';
    const t = now();

    let id = 0;
    this.write((events) => {
      const res = this.db
        .prepare(
          `INSERT INTO standups (standup_date, facilitator, present_identities, absent_identities, content, parsed_updates, ts)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(standupDate, facilitator, present, absent, content, parsedUpdates, t);
      id = Number(res.lastInsertRowid);

      this.recordEvent(events, {
        type: 'communication.standup_created',
        subjectId: String(id),
        payload: { standupDate, facilitator },
        actorId: facilitator ?? 'system',
        subjectType: 'standup',
      });
    });

    const row = this.one('SELECT * FROM standups WHERE id = ?', id);
    return toStandup(row!);
  }

  // ---------------------------------------------------------------- Strategic OKRs

  seedOkrs(legacyDbPath?: string): void {
    try {
      const row = this.one('SELECT COUNT(*) AS c FROM okr_objectives');
      if (row && Number(row.c) > 0) return; // already seeded

      const candidates: string[] = [];
      if (legacyDbPath) candidates.push(legacyDbPath);
      if (process.env.MYAOS_LEGACY_DB) candidates.push(process.env.MYAOS_LEGACY_DB);
      candidates.push(
        path.resolve('data/myaos.db'),
        path.resolve('../data/myaos.db'),
        path.resolve('../../data/myaos.db'),
        path.join(os.homedir(), 'WebstormProjects/CreativeSites-Ai-Team/data/myaos.db')
      );

      let foundDb: DatabaseSync | null = null;
      for (const cand of candidates) {
        if (cand && fs.existsSync(cand)) {
          try {
            foundDb = new DatabaseSync(cand, { open: true, readOnly: true });
            break;
          } catch {
            // try next candidate
          }
        }
      }

      if (foundDb) {
        try {
          const objs = foundDb.prepare('SELECT * FROM okr_objectives').all() as any[];
          const krs = foundDb.prepare('SELECT * FROM okr_key_results').all() as any[];
          if (objs && objs.length > 0) {
            this.write(() => {
              for (const o of objs) {
                this.db.prepare(
                  `INSERT OR IGNORE INTO okr_objectives (id, title, description, owner_id, quarter, progress_percent, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).run(
                  String(o.id),
                  String(o.title),
                  o.description ? String(o.description) : null,
                  o.owner_id ? String(o.owner_id) : 'astra',
                  o.quarter ? String(o.quarter) : 'Q4-2026',
                  Number(o.progress_percent) || 0,
                  o.status ? String(o.status) : 'on_track',
                  o.created_at ? String(o.created_at) : now(),
                  o.updated_at ? String(o.updated_at) : now()
                );
              }
              for (const k of krs) {
                this.db.prepare(
                  `INSERT OR IGNORE INTO okr_key_results (id, objective_id, title, metric_type, current_value, target_value, unit, progress_percent, telemetry_query, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).run(
                  String(k.id),
                  String(k.objective_id),
                  String(k.title),
                  k.metric_type ? String(k.metric_type) : 'percentage',
                  Number(k.current_value) || 0,
                  Number(k.target_value) || 100,
                  k.unit ? String(k.unit) : '%',
                  Number(k.progress_percent) || 0,
                  k.telemetry_query ? String(k.telemetry_query) : null,
                  k.created_at ? String(k.created_at) : now(),
                  k.updated_at ? String(k.updated_at) : now()
                );
              }
            });
            foundDb.close();
            return;
          }
        } catch {
          // ignore error reading legacy db
        } finally {
          try { foundDb.close(); } catch {}
        }
      }

      // No legacy source: leave OKRs empty. Never seed made-up objectives or
      // progress numbers (vision §2.5; gap audit §11).
    } catch {
      // best-effort
    }
  }

  listOkrs(): { objectives: T.OkrObjective[]; keyResults: T.OkrKeyResult[] } {
    const objectives = this.all('SELECT * FROM okr_objectives ORDER BY created_at DESC').map(toOkrObjective);
    const keyResults = this.all('SELECT * FROM okr_key_results ORDER BY created_at ASC').map(toOkrKeyResult);
    return { objectives, keyResults };
  }

  saveOkrObjective(input: T.SaveOkrObjectiveInput): T.OkrObjective {
    const id = input.id?.trim() || `OBJ_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const ts = now();
    const existing = this.one('SELECT * FROM okr_objectives WHERE id = ?', id);

    this.write((events) => {
      this.db.prepare(
        `INSERT INTO okr_objectives (id, title, description, owner_id, quarter, progress_percent, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           owner_id = excluded.owner_id,
           quarter = excluded.quarter,
           status = excluded.status,
           updated_at = excluded.updated_at`
      ).run(
        id,
        input.title.trim(),
        input.description?.trim() || null,
        input.owner_id?.trim() || 'astra',
        input.quarter?.trim() || 'Q4-2026',
        existing ? Number(existing.progress_percent) : 0,
        input.status || (existing ? String(existing.status) : 'on_track'),
        existing ? String(existing.created_at) : ts,
        ts
      );
      this.recordEvent(events, {
        type: existing ? 'okr.objective_updated' : 'okr.objective_created',
        subjectId: id,
        payload: { title: input.title, quarter: input.quarter },
        subjectType: 'okr_objective',
      });
    });

    const row = this.one('SELECT * FROM okr_objectives WHERE id = ?', id);
    return toOkrObjective(row!);
  }

  deleteOkrObjective(id: string): void {
    this.write((events) => {
      this.db.prepare('DELETE FROM okr_key_results WHERE objective_id = ?').run(id);
      this.db.prepare('DELETE FROM okr_objectives WHERE id = ?').run(id);
      this.recordEvent(events, {
        type: 'okr.objective_deleted',
        subjectId: id,
        payload: { id },
        subjectType: 'okr_objective',
      });
    });
  }

  saveOkrKeyResult(input: T.SaveOkrKeyResultInput): T.OkrKeyResult {
    const id = input.id?.trim() || `KR_${input.objective_id.replace(/^OBJ_/, '')}_${Date.now().toString(36).slice(-3).toUpperCase()}`;
    const ts = now();
    const existing = this.one('SELECT * FROM okr_key_results WHERE id = ?', id);
    const curr = Number(input.current_value ?? (existing ? existing.current_value : 0));
    const target = Number(input.target_value ?? (existing ? existing.target_value : 100));
    const progress = target > 0 ? Math.round(Math.min(100, Math.max(0, (curr / target) * 100))) : 0;

    this.write((events) => {
      this.db.prepare(
        `INSERT INTO okr_key_results (id, objective_id, title, metric_type, current_value, target_value, unit, progress_percent, telemetry_query, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           objective_id = excluded.objective_id,
           title = excluded.title,
           metric_type = excluded.metric_type,
           current_value = excluded.current_value,
           target_value = excluded.target_value,
           unit = excluded.unit,
           progress_percent = excluded.progress_percent,
           telemetry_query = excluded.telemetry_query,
           updated_at = excluded.updated_at`
      ).run(
        id,
        input.objective_id,
        input.title.trim(),
        input.metric_type || (existing ? String(existing.metric_type) : 'percentage'),
        curr,
        target,
        input.unit?.trim() || (existing ? String(existing.unit || '%') : '%'),
        progress,
        input.telemetry_query?.trim() || null,
        existing ? String(existing.created_at) : ts,
        ts
      );

      this.recomputeObjectiveProgress(input.objective_id);

      this.recordEvent(events, {
        type: existing ? 'okr.key_result_updated' : 'okr.key_result_created',
        subjectId: id,
        payload: { title: input.title, objectiveId: input.objective_id, progress },
        subjectType: 'okr_key_result',
      });
    });

    const row = this.one('SELECT * FROM okr_key_results WHERE id = ?', id);
    return toOkrKeyResult(row!);
  }

  deleteOkrKeyResult(id: string): void {
    const kr = this.one('SELECT * FROM okr_key_results WHERE id = ?', id);
    if (!kr) return;
    const objId = String(kr.objective_id);

    this.write((events) => {
      this.db.prepare('DELETE FROM okr_key_results WHERE id = ?').run(id);
      this.recomputeObjectiveProgress(objId);
      this.recordEvent(events, {
        type: 'okr.key_result_deleted',
        subjectId: id,
        payload: { id, objectiveId: objId },
        subjectType: 'okr_key_result',
      });
    });
  }

  updateOkrProgress(krId: string, currentValue: number): { keyResult: T.OkrKeyResult; objective: T.OkrObjective } {
    const kr = this.one('SELECT * FROM okr_key_results WHERE id = ?', krId);
    if (!kr) throw new Error(`Key result not found: ${krId}`);

    const target = Number(kr.target_value) || 100;
    const progress = target > 0 ? Math.round(Math.min(100, Math.max(0, (currentValue / target) * 100))) : 0;
    const ts = now();
    const objId = String(kr.objective_id);

    this.write((events) => {
      this.db.prepare(
        'UPDATE okr_key_results SET current_value = ?, progress_percent = ?, updated_at = ? WHERE id = ?'
      ).run(currentValue, progress, ts, krId);

      this.recomputeObjectiveProgress(objId);

      this.recordEvent(events, {
        type: 'okr.progress_updated',
        subjectId: krId,
        payload: { currentValue, progress, objectiveId: objId },
        subjectType: 'okr_key_result',
      });
    });

    const updatedKr = this.one('SELECT * FROM okr_key_results WHERE id = ?', krId);
    const updatedObj = this.one('SELECT * FROM okr_objectives WHERE id = ?', objId);
    return { keyResult: toOkrKeyResult(updatedKr!), objective: toOkrObjective(updatedObj!) };
  }

  recomputeObjectiveProgress(objectiveId: string): T.OkrObjective | null {
    const row = this.one('SELECT AVG(progress_percent) AS avg_prog FROM okr_key_results WHERE objective_id = ?', objectiveId);
    const avg = row?.avg_prog !== null && row?.avg_prog !== undefined ? Math.round(Number(row.avg_prog)) : 0;
    const status = avg >= 80 ? 'on_track' : avg >= 40 ? 'at_risk' : 'behind';
    const ts = now();

    this.db.prepare(
      'UPDATE okr_objectives SET progress_percent = ?, status = ?, updated_at = ? WHERE id = ?'
    ).run(avg, status, ts, objectiveId);

    const obj = this.one('SELECT * FROM okr_objectives WHERE id = ?', objectiveId);
    return obj ? toOkrObjective(obj) : null;
  }

  getRealityHealthScore(): T.RealityAuditSummary {
    const objCount = Number(this.one('SELECT COUNT(*) AS c FROM okr_objectives')?.c || 0);
    const krCount = Number(this.one('SELECT COUNT(*) AS c FROM okr_key_results')?.c || 0);
    const avgProgRow = this.one('SELECT AVG(progress_percent) AS a FROM okr_objectives');
    const avgOkrProgress = avgProgRow?.a ? Math.round(Number(avgProgRow.a)) : 0;

    const totalEvidence = Number(this.one('SELECT COUNT(*) AS c FROM evidence')?.c || 0);
    const verifiedEvidence = Number(this.one('SELECT COUNT(*) AS c FROM evidence WHERE exit_code = 0')?.c || 0);
    const activeJobs = Number(this.one("SELECT COUNT(*) AS c FROM jobs WHERE stage NOT IN ('done', 'cancelled')")?.c || 0);

    const evidenceRatio = totalEvidence > 0 ? (verifiedEvidence / totalEvidence) : 1;
    const healthScore = Math.round(Math.min(100, Math.max(0, (evidenceRatio * 60) + (avgOkrProgress * 0.4))));

    return {
      healthScore,
      totalObjectives: objCount,
      totalKeyResults: krCount,
      avgOkrProgress,
      verifiedEvidenceCount: verifiedEvidence,
      totalEvidenceCount: totalEvidence,
      activeJobsCount: activeJobs,
      lastAuditTs: now(),
    };
  }

  // ---------------------------------------------------------------- Project Tasks & Sprint Management

  seedProjectManagement(legacyDbPath?: string): void {
    try {
      const row = this.one('SELECT COUNT(*) AS c FROM project_tasks');
      if (row && Number(row.c) > 0) return; // already seeded

      const candidates: string[] = [];
      if (legacyDbPath) candidates.push(legacyDbPath);
      if (process.env.MYAOS_LEGACY_DB) candidates.push(process.env.MYAOS_LEGACY_DB);
      candidates.push(
        path.resolve('data/myaos.db'),
        path.resolve('../data/myaos.db'),
        path.resolve('../../data/myaos.db'),
        path.join(os.homedir(), 'WebstormProjects/CreativeSites-Ai-Team/data/myaos.db')
      );

      let foundDb: DatabaseSync | null = null;
      for (const cand of candidates) {
        if (cand && fs.existsSync(cand)) {
          try {
            foundDb = new DatabaseSync(cand, { open: true, readOnly: true });
            break;
          } catch {
            // try next candidate
          }
        }
      }

      if (!foundDb) return;

      try {
        const legacyProjects = foundDb.prepare('SELECT * FROM projects').all() as Row[];
        const legacyTasks = foundDb.prepare('SELECT * FROM tasks').all() as Row[];
        let legacyMilestones: Row[] = [];
        try {
          legacyMilestones = foundDb.prepare('SELECT * FROM milestones').all() as Row[];
        } catch {}

        this.write(() => {
          // 1. Projects
          const projectIdMap = new Map<string, string>();
          for (const p of legacyProjects) {
            try {
              const pId = String(p.id);
              const pTitle = String(p.title || p.name || pId);
              const pDesc = p.description ? String(p.description) : null;
              const pRepo = p.repo ? String(p.repo) : null;
              const pTargetDate = p.target_date ? String(p.target_date) : null;
              const pStatus = p.status ? String(p.status) : 'active';
              const pCreated = p.created_at ? String(p.created_at) : now();
              const pUpdated = p.updated_at ? String(p.updated_at) : now();

              const existing = this.one('SELECT id FROM projects WHERE id = ? OR name = ?', pId, pTitle);
              if (existing) {
                projectIdMap.set(pId, existing.id as string);
                this.db.prepare(
                  `UPDATE projects SET
                     target_date = COALESCE(?, target_date),
                     status = COALESCE(status, ?),
                     repo = COALESCE(repo, root_path, ?),
                     updated_at = ?
                   WHERE id = ?`
                ).run(pTargetDate, pStatus, pRepo, pUpdated, existing.id as string);
              } else {
                projectIdMap.set(pId, pId);
                this.db.prepare(
                  `INSERT OR IGNORE INTO projects (id, name, slug, description, root_path, repo, status, target_date, team_id, settings, archived, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'creativesites', '{}', 0, ?, ?)`
                ).run(
                  pId,
                  pTitle,
                  slugify(pTitle),
                  pDesc,
                  pRepo,
                  pRepo,
                  pStatus,
                  pTargetDate,
                  pCreated,
                  pUpdated
                );
              }
            } catch {
              // continue with remaining projects
            }
          }

          // 2. Milestones
          for (const m of legacyMilestones) {
            try {
              const mProjId = m.project_id ? (projectIdMap.get(String(m.project_id)) ?? String(m.project_id)) : null;
              this.db.prepare(
                `INSERT OR IGNORE INTO milestones (id, project_id, title, description, status, due_at, completed_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              ).run(
                String(m.id),
                mProjId,
                String(m.title),
                m.description ? String(m.description) : null,
                m.status ? String(m.status) : 'pending',
                m.due_at ? String(m.due_at) : null,
                m.completed_at ? String(m.completed_at) : null,
                m.created_at ? String(m.created_at) : now()
              );
            } catch {}
          }

          // 3. Tasks -> project_tasks
          for (const t of legacyTasks) {
            let mappedProjId = t.project_id ? (projectIdMap.get(String(t.project_id)) ?? String(t.project_id)) : null;
            if (!mappedProjId) {
              const tid = String(t.id);
              const trepo = String(t.repo || '');
              if (tid.startsWith('TASK_MSDK_') || trepo.includes('RN')) {
                const p = this.one("SELECT id FROM projects WHERE name LIKE '%Mobile SDK%'");
                if (p) mappedProjId = p.id as string;
              } else if (tid.startsWith('TASK_HJ_') || tid.startsWith('TASK-P0-AUTH') || trepo.toLowerCase().includes('hair-journey')) {
                const p = this.one("SELECT id FROM projects WHERE name LIKE '%Hair Journey%'");
                if (p) mappedProjId = p.id as string;
              } else if (tid.startsWith('TASK_DF_') || trepo.includes('DogFrce')) {
                const p = this.one("SELECT id FROM projects WHERE name LIKE '%DogForce%'");
                if (p) mappedProjId = p.id as string;
              } else if (tid.startsWith('TASK_MM_') || trepo.includes('MeetingMind') || String(t.project_id) === 'meetingmind') {
                const p = this.one("SELECT id FROM projects WHERE name LIKE '%MeetingMind%'");
                if (p) mappedProjId = p.id as string;
              } else if (tid.startsWith('TASK_MYAOS_') || tid.startsWith('TASK_INTEL_') || trepo.includes('CreativeSites')) {
                const p = this.one("SELECT id FROM projects WHERE name LIKE '%MyaOS%'");
                if (p) mappedProjId = p.id as string;
              } else if (tid.startsWith('TASK_CHAT_')) {
                const p = this.one("SELECT id FROM projects WHERE name LIKE '%Chatbot & Streaming%'");
                if (p) mappedProjId = p.id as string;
              } else if (tid.startsWith('task_design_fleet_') || tid.startsWith('TASK_DFLEET_')) {
                const p = this.one("SELECT id FROM projects WHERE name LIKE '%DeployFleet%'");
                if (p) mappedProjId = p.id as string;
              }
            }

            this.db.prepare(
              `INSERT OR IGNORE INTO project_tasks (
                 id, project_id, milestone_id, okr_kr_id, title, description, creator,
                 assignee_id, required_capabilities, priority, status, dependencies,
                 acceptance_criteria, repo, branch, artifacts, original_source,
                 original_file_path, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              String(t.id),
              mappedProjId,
              t.milestone_id ? String(t.milestone_id) : null,
              t.okr_kr_id ? String(t.okr_kr_id) : null,
              String(t.title),
              t.description ? String(t.description) : null,
              t.creator ? String(t.creator) : null,
              t.assignee_id ? String(t.assignee_id) : null,
              t.required_capabilities ? String(t.required_capabilities) : '[]',
              t.priority ? String(t.priority) : 'medium',
              t.status ? String(t.status) : 'open',
              t.dependencies ? String(t.dependencies) : '[]',
              t.acceptance_criteria ? String(t.acceptance_criteria) : '[]',
              t.repo ? String(t.repo) : null,
              t.branch ? String(t.branch) : null,
              t.artifacts ? String(t.artifacts) : '[]',
              t.original_source ? String(t.original_source) : null,
              t.original_file_path ? String(t.original_file_path) : null,
              t.created_at ? String(t.created_at) : now(),
              t.updated_at ? String(t.updated_at) : now()
            );
          }
        });
      } finally {
        try { foundDb.close(); } catch {}
      }
    } catch (err) {
      console.warn('[runtime] seedProjectManagement notice:', (err as Error).message);
    }
  }

  listProjectTasks(filter?: { projectId?: string; status?: string; priority?: string; assigneeId?: string; limit?: number }): T.ProjectTask[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter?.projectId && filter.projectId !== 'all') {
      conditions.push('project_id = ?');
      params.push(filter.projectId);
    }
    if (filter?.status && filter.status !== 'all') {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.priority && filter.priority !== 'all') {
      conditions.push('priority = ?');
      params.push(filter.priority);
    }
    if (filter?.assigneeId && filter.assigneeId !== 'all') {
      conditions.push('LOWER(assignee_id) = LOWER(?)');
      params.push(filter.assigneeId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, filter?.limit ?? 150);
    params.push(limit);

    const rows = this.all(
      `SELECT * FROM project_tasks ${where} ORDER BY created_at DESC LIMIT ?`,
      ...params
    );
    return rows.map(toProjectTask);
  }

  getProjectTask(id: string): T.ProjectTask {
    const row = this.one('SELECT * FROM project_tasks WHERE id = ?', id);
    if (!row) throw new NotFoundError(`project task ${id} not found`);
    return toProjectTask(row);
  }

  createProjectTask(input: T.CreateProjectTaskInput): T.ProjectTask {
    const title = required(input.title, 'title');
    const id = input.id?.trim() || `TASK_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const t = now();

    this.write((events) => {
      this.db.prepare(
        `INSERT INTO project_tasks (
           id, project_id, milestone_id, okr_kr_id, title, description, creator,
           assignee_id, required_capabilities, priority, status, repo, branch,
           dependencies, acceptance_criteria, artifacts, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, '[]', '[]', '[]', ?, ?)`
      ).run(
        id,
        input.projectId?.trim() || null,
        input.milestoneId?.trim() || null,
        input.okrKrId?.trim() || null,
        title,
        input.description?.trim() || null,
        input.creator?.trim() || 'winston',
        input.assigneeId?.trim() || null,
        input.priority || 'medium',
        input.status || 'open',
        input.repo?.trim() || null,
        input.branch?.trim() || null,
        t,
        t
      );

      this.recordEvent(events, {
        type: 'project_task.created',
        subjectId: id,
        payload: { title, priority: input.priority || 'medium', status: input.status || 'open' },
        subjectType: 'project_task',
      });
    });

    return this.getProjectTask(id);
  }

  updateProjectTask(id: string, input: T.UpdateProjectTaskInput): T.ProjectTask {
    const existing = this.one('SELECT * FROM project_tasks WHERE id = ?', id);
    if (!existing) throw new NotFoundError(`project task ${id} not found`);
    const t = now();

    const title = input.title !== undefined ? input.title.trim() : String(existing.title);
    const description = input.description !== undefined ? input.description?.trim() || null : (existing.description ? String(existing.description) : null);
    const projectId = input.projectId !== undefined ? input.projectId?.trim() || null : (existing.project_id ? String(existing.project_id) : null);
    const assigneeId = input.assigneeId !== undefined ? input.assigneeId?.trim() || null : (existing.assignee_id ? String(existing.assignee_id) : null);
    const priority = input.priority !== undefined ? input.priority : String(existing.priority);
    const status = input.status !== undefined ? input.status : String(existing.status);
    const repo = input.repo !== undefined ? input.repo?.trim() || null : (existing.repo ? String(existing.repo) : null);
    const branch = input.branch !== undefined ? input.branch?.trim() || null : (existing.branch ? String(existing.branch) : null);

    this.write((events) => {
      this.db.prepare(
        `UPDATE project_tasks SET
           title = ?, description = ?, project_id = ?, assignee_id = ?,
           priority = ?, status = ?, repo = ?, branch = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        title, description, projectId, assigneeId,
        priority, status, repo, branch, t,
        id
      );

      this.recordEvent(events, {
        type: 'project_task.updated',
        subjectId: id,
        payload: { title, priority, status, assigneeId },
        subjectType: 'project_task',
      });
    });

    return this.getProjectTask(id);
  }

  deleteProjectTask(id: string): void {
    const existing = this.one('SELECT id FROM project_tasks WHERE id = ?', id);
    if (!existing) throw new NotFoundError(`project task ${id} not found`);

    this.write((events) => {
      this.db.prepare('DELETE FROM project_tasks WHERE id = ?').run(id);
      this.recordEvent(events, {
        type: 'project_task.deleted',
        subjectId: id,
        subjectType: 'project_task',
      });
    });
  }

  listMilestones(projectId?: string): T.Milestone[] {
    const rows = projectId
      ? this.all('SELECT * FROM milestones WHERE project_id = ? ORDER BY due_at ASC, created_at ASC', projectId)
      : this.all('SELECT * FROM milestones ORDER BY due_at ASC, created_at ASC');
    return rows.map(toMilestone);
  }
}

// ------------------------------------------------------------------ row mapping

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) throw new InputError(`${field} must be a list of strings`);
  return value;
}

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const toIdentity = (r: Row): T.Identity => ({
  id: String(r.id),
  name: String(r.name),
  role: str(r.role),
  runtime: str(r.runtime),
  avatarMark: str(r.avatar_mark),
  avatarColor: str(r.avatar_color),
  seats: parseJson<string[]>(r.seats, []),
  createdAt: String(r.created_at),
  teamId: str(r.team_id),
  lane: str(r.lane),
  symbol: str(r.symbol),
  capabilities: parseJson<string[]>(r.capabilities, []),
  provenance: str(r.provenance) ?? 'DECLARED',
  isOwner: bool(r.is_owner),
  approvalLevel: (str(r.approval_level) ?? 'member') as T.Identity['approvalLevel'],
  adapterId: str(r.adapter_id),
  archived: bool(r.archived),
  activeSessionId: str(r.active_session_id),
  acpSessionId: str(r.acp_session_id),
  statusState: (str(r.status_state) ?? 'idle') as T.IdentityStatusState,
  rateLimitResetAt: str(r.rate_limit_reset_at),
  rateLimitReason: str(r.rate_limit_reason),
  lastWokenAt: str(r.last_woken_at),
  departmentId: str(r.department_id),
  seniority: (str(r.seniority) ?? 'member') as NonNullable<T.Identity['seniority']>,
  skills: parseJson<string[]>(r.skills, []),
  providers: parseJson<string[]>(r.providers, []),
  permissions: parseJson<string[]>(r.permissions, []),
});

const toTeam = (r: Row): T.Team => ({
  id: String(r.id),
  name: String(r.name),
  description: str(r.description),
  createdAt: String(r.created_at),
  memberCount: num(r.member_count),
});

const toTeamMember = (r: Row): T.TeamMember => ({
  teamId: String(r.team_id),
  identityId: String(r.identity_id),
  role: String(r.role),
  joinedAt: String(r.joined_at),
});

const toRepo = (r: Row): T.Repo => ({
  id: String(r.id),
  projectId: String(r.project_id),
  name: String(r.name),
  path: str(r.path),
  remoteUrl: str(r.remote_url),
  defaultBranch: str(r.default_branch),
  createdAt: String(r.created_at),
});

const toProject = (r: Row, repos: T.Repo[]): T.Project => ({
  id: String(r.id),
  name: String(r.name),
  slug: str(r.slug),
  description: str(r.description),
  rootPath: str(r.root_path),
  defaultBranch: str(r.default_branch),
  teamId: str(r.team_id),
  archived: bool(r.archived),
  createdAt: String(r.created_at),
  repos,
  roomCount: num(r.room_count),
  openJobCount: num(r.open_job_count),
  status: str(r.status) || 'active',
  repo: str(r.repo) || str(r.root_path),
  targetDate: str(r.target_date),
  updatedAt: str(r.updated_at),
  taskCount: num(r.task_count),
  doneTaskCount: num(r.done_task_count),
});

const toRoom = (r: Row): T.Room => ({
  id: String(r.id),
  name: String(r.name),
  repoPath: str(r.repo_path),
  createdAt: String(r.created_at),
  memberCount: num(r.member_count),
  openJobCount: num(r.open_job_count),
  projectId: str(r.project_id),
  teamId: str(r.team_id),
  kind: (str(r.kind) ?? 'adhoc') as T.Room['kind'],
  archived: bool(r.archived),
  intakeEnabled: r.intake_enabled === 1,
});

const toRoomMember = (r: Row): T.RoomMember => ({
  roomId: String(r.room_id),
  memberId: String(r.member_id),
  kind: String(r.kind) as 'human' | 'agent',
  role: String(r.role ?? 'member'),
  joinedAt: str(r.joined_at),
});

const toMessage = (r: Row): T.Message => ({
  id: String(r.id),
  roomId: String(r.room_id),
  authorId: String(r.author_id),
  authorKind: r.author_kind as T.ActorKind,
  body: String(r.body),
  jobId: str(r.job_id),
  createdAt: String(r.created_at),
});

const toJobSummary = (r: Row): T.JobSummary => ({
  id: String(r.id),
  number: num(r.number),
  roomId: String(r.room_id),
  title: String(r.title),
  stage: r.stage as T.JobStage,
  createdBy: String(r.created_by),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  pendingApprovals: num(r.pending_approvals),
  projectId: str(r.project_id),
  priority: str(r.priority) ?? 'normal',
  risk: (str(r.risk) ?? 'low') as T.Risk,
  budgetCents: r.budget_cents == null ? null : num(r.budget_cents),
  costCents: num(r.cost_cents),
  startedAt: str(r.started_at),
  endedAt: str(r.ended_at),
  blockedReason: str(r.blocked_reason),
  kind: (str(r.kind) ?? 'code') as T.JobKind,
  shipStatus: (str(r.ship_status) ?? 'none') as T.ShipStatus,
  shipPayload: parseJson<Record<string, unknown>>(r.ship_payload, {}),
  workflow: (str(r.workflow) as T.JobSummary['workflow']) ?? null,
  triageReason: str(r.triage_reason),
  urgency: str(r.urgency),
  impact: str(r.impact),
  intakeId: str(r.intake_id),
  okrKrId: str(r.okr_kr_id),
  milestoneId: str(r.milestone_id),
});

const toIntake = (r: Row): T.IntakeRequest => ({
  id: String(r.id),
  rawText: String(r.raw_text),
  source: String(r.source) as T.IntakeSource,
  sourceRef: str(r.source_ref),
  projectId: str(r.project_id),
  requestedBy: String(r.requested_by),
  createdAt: String(r.created_at),
  jobId: str(r.job_id),
  duplicateOfJobId: str(r.duplicate_of_job_id),
  dedupeReason: str(r.dedupe_reason),
  classification: parseJson<Record<string, unknown>>(r.classification, {}),
});

const toTask = (r: Row): T.Task => ({
  id: String(r.id),
  jobId: String(r.job_id),
  title: String(r.title),
  assigneeId: str(r.assignee_id),
  checkCommand: str(r.check_command),
  gate: str(r.gate),
  status: r.status as T.TaskStatus,
  createdAt: String(r.created_at),
  position: num(r.position),
  planTaskId: str(r.plan_task_id),
  mode: (str(r.mode) ?? 'build') as T.Task['mode'],
  startedAt: str(r.started_at),
  endedAt: str(r.ended_at),
  updatedAt: str(r.updated_at),
  evidenceRequired: bool(r.evidence_required),
  dependsOn: parseJson<string[]>(r.depends_on, []),
  priority: num(r.priority),
  attempt: num(r.attempt),
  maxAttempts: r.max_attempts == null ? 3 : num(r.max_attempts),
  acknowledgedAt: str(r.acknowledged_at),
  ackDeadlineAt: str(r.ack_deadline_at),
  nextRetryAt: str(r.next_retry_at),
  parentTaskId: str(r.parent_task_id),
  requiredSkills: parseJson<string[]>(r.required_skills, []),
  budgetTokens: r.budget_tokens == null ? null : num(r.budget_tokens),
  verificationRequired: bool(r.verification_required),
  legacyProjectTaskId: str(r.legacy_project_task_id),
  lastEventAt: str(r.last_event_at),
});

const toEvidence = (r: Row): T.Evidence => ({
  id: String(r.id),
  jobId: str(r.job_id),
  taskId: str(r.task_id),
  sessionId: str(r.session_id),
  criterionId: str(r.criterion_id),
  kind: r.kind as T.Evidence['kind'],
  class: r.class as T.EvidenceClass,
  summary: String(r.summary),
  payload: parseJson<unknown>(r.payload, {}),
  hash: str(r.hash),
  recordedBy: String(r.recorded_by),
  createdAt: String(r.created_at),
  prevHash: str(r.prev_hash),
  contentHash: str(r.content_hash),
  artifactRefs: parseJson<string[]>(r.artifact_refs, []),
  command: str(r.command),
  exitCode: r.exit_code == null ? null : num(r.exit_code),
  commitSha: str(r.commit_sha),
  worktree: str(r.worktree),
  verifiedBy: str(r.verified_by),
  verifiedAt: str(r.verified_at),
  supersedes: str(r.supersedes),
});

const toApproval = (r: Row): T.Approval => ({
  id: String(r.id),
  jobId: String(r.job_id),
  title: String(r.title),
  consequence: String(r.consequence),
  status: r.status as T.ApprovalStatus,
  requestedBy: String(r.requested_by),
  decidedBy: str(r.decided_by),
  decidedAt: str(r.decided_at),
  createdAt: String(r.created_at),
  actionType: str(r.action_type) ?? 'action',
  action: parseJson<Record<string, unknown>>(r.action, {}),
  risk: (str(r.risk) ?? 'low') as T.Risk,
  assignedTo: str(r.assigned_to),
  assignedKind: str(r.assigned_kind) as T.ActorKind | null,
  escalateTo: str(r.escalate_to),
  escalatedAt: str(r.escalated_at),
  expiresAt: str(r.expires_at),
  policyId: str(r.policy_id),
  decidedByKind: str(r.decided_by_kind) as T.ActorKind | null,
  note: str(r.note),
  executedAt: str(r.executed_at),
  execution: r.execution == null ? null : parseJson<Record<string, unknown>>(r.execution, {}),
  sessionId: str(r.session_id),
  taskId: str(r.task_id),
  requestId: str(r.request_id),
  reversible: r.reversible == null ? null : bool(r.reversible),
});

const toPolicy = (r: Row): T.ApprovalPolicy => ({
  id: String(r.id),
  scope: r.scope as T.ApprovalPolicy['scope'],
  projectId: str(r.project_id),
  roomId: str(r.room_id),
  actionType: String(r.action_type),
  maxRiskForLead: (str(r.max_risk_for_lead) ?? 'medium') as T.Risk,
  leadId: str(r.lead_id),
  escalateTo: str(r.escalate_to),
  timeoutMinutes: num(r.timeout_minutes),
  enabled: bool(r.enabled),
  createdAt: String(r.created_at),
});

const toBudget = (r: Row): T.Budget => ({
  id: String(r.id),
  scope: r.scope as T.Budget['scope'],
  projectId: str(r.project_id),
  period: r.period as T.Budget['period'],
  amountCents: num(r.amount_cents),
  currency: String(r.currency),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

const toSession = (r: Row): T.Session => {
  const hasUsage = r.has_usage != null ? Boolean(r.has_usage) : (r.usage_input_tokens != null || r.usage_output_tokens != null || r.usage_cost_cents != null);
  const inputTokens = r.usage_input_tokens != null ? num(r.usage_input_tokens) : 0;
  const outputTokens = r.usage_output_tokens != null ? num(r.usage_output_tokens) : 0;
  const costCents = r.usage_cost_cents != null ? num(r.usage_cost_cents) : 0;
  const usage = hasUsage && (inputTokens > 0 || outputTokens > 0 || costCents > 0)
    ? {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costCents,
      }
    : null;
  return {
    id: String(r.id),
    agentId: String(r.agent_id),
    taskId: str(r.task_id),
    jobId: str(r.job_id),
    roomId: str(r.room_id),
    runtimeCommand: String(r.runtime_command),
    pid: r.pid == null ? null : num(r.pid),
    worktree: str(r.worktree),
    state: r.state as T.SessionState,
    lastSeenAt: str(r.last_seen_at),
    startedAt: String(r.started_at),
    endedAt: str(r.ended_at),
    acpSessionId: str(r.acp_session_id),
    adapterId: str(r.adapter_id),
    mode: (str(r.mode) ?? 'build') as T.Session['mode'],
    baseSha: str(r.base_sha),
    baseBranch: str(r.base_branch),
    exitCode: r.exit_code == null ? null : num(r.exit_code),
    error: str(r.error),
    cancelRequestedAt: str(r.cancel_requested_at),
    lastEventAt: str(r.last_event_at),
    model: str(r.model),
    turnCount: num(r.turn_count),
    parentSessionId: str(r.parent_session_id),
    supersededBySessionId: str(r.superseded_by_session_id),
    generation: r.generation == null ? 1 : Math.max(1, num(r.generation)),
    contextTokens: Math.max(num(r.context_tokens), inputTokens),
    batonCapsule: str(r.baton_capsule),
    usage,
  };
};

const toTranscript = (r: Row): T.TranscriptEntry => ({
  id: num(r.id),
  sessionId: String(r.session_id),
  seq: num(r.seq),
  kind: String(r.kind),
  role: str(r.role),
  turnId: str(r.turn_id),
  itemId: str(r.item_id),
  title: str(r.title),
  payload: parseJson<unknown>(r.payload, {}),
  createdAt: String(r.created_at),
});

const toUsage = (r: Row): T.Usage => ({
  id: String(r.id),
  jobId: str(r.job_id),
  sessionId: str(r.session_id),
  model: str(r.model),
  inputTokens: num(r.input_tokens),
  outputTokens: num(r.output_tokens),
  costCents: num(r.cost_cents),
  source: str(r.source),
  createdAt: String(r.created_at),
});

const toHistory = (r: Row): T.JobStageHistory => ({
  id: num(r.id),
  jobId: String(r.job_id),
  fromStage: str(r.from_stage) as T.JobStage | null,
  toStage: String(r.to_stage) as T.JobStage,
  actorId: String(r.actor_id),
  actorKind: String(r.actor_kind) as T.ActorKind,
  note: str(r.note),
  createdAt: String(r.created_at),
});

const toCouncilCard = (r: Row): T.CouncilCard => ({
  id: String(r.id),
  councilId: String(r.council_id),
  round: num(r.round),
  seat: String(r.seat),
  identityId: str(r.identity_id),
  result: parseJson<T.CouncilCardResult>(r.payload, {
    seat: String(r.seat), identityId: null, scores: {}, pillar: 0, confidence: null, ruin: {}, reversible: null, argument: null,
  }),
  createdAt: String(r.created_at),
});

const toVerdict = (r: Row): T.CouncilVerdict => ({
  id: String(r.id),
  councilId: String(r.council_id),
  label: String(r.label),
  score: r.score == null ? null : num(r.score),
  spread: r.spread == null ? null : num(r.spread),
  confidence: r.confidence == null ? null : num(r.confidence),
  support: r.support == null ? null : num(r.support),
  payload: parseJson<T.CouncilResult>(r.payload, {
    label: String(r.label), call: '', scores: [], topId: '', spread: 0, confidence: 0, support: 0,
    rules: { disasterCapApplied: false, cannotUndo: false, tooFastAgreement: false }, conditions: [], objection: null,
  }),
  plan: parseJson<Record<string, unknown>>(r.plan, {}),
  createdAt: String(r.created_at),
});

const toEvent = (r: Row): T.RuntimeEvent => ({
  seq: num(r.seq),
  type: String(r.type),
  subjectId: str(r.subject_id),
  payload: parseJson<unknown>(r.payload, {}),
  createdAt: String(r.created_at),
  actorId: str(r.actor_id),
  actorKind: str(r.actor_kind) as T.ActorKind | null,
  subjectType: str(r.subject_type),
  jobId: str(r.job_id),
  taskId: str(r.task_id),
  sessionId: str(r.session_id),
  idempotencyKey: str(r.idempotency_key),
  hash: str(r.hash),
  prevHash: str(r.prev_hash),
});

const toAgentWake = (r: Row): T.AgentWake => ({
  id: String(r.id),
  targetAgentId: String(r.target_agent_id),
  fromActorId: String(r.from_actor_id),
  fromActorKind: (str(r.from_actor_kind) ?? 'agent') as T.ActorKind,
  jobId: str(r.job_id),
  roomId: str(r.room_id),
  taskId: str(r.task_id),
  sessionId: str(r.session_id),
  adapterId: str(r.adapter_id),
  reason: String(r.reason),
  prompt: String(r.prompt),
  status: (str(r.status) ?? 'pending') as T.WakeStatus,
  scheduledFor: str(r.scheduled_for),
  createdAt: String(r.created_at),
  dispatchedAt: str(r.dispatched_at),
  completedAt: str(r.completed_at),
  error: str(r.error),
});

const toAgentSchedule = (r: Row): T.AgentSchedule => ({
  id: String(r.id),
  agentId: String(r.agent_id),
  targetAgentId: String(r.agent_id),
  createdBy: String(r.created_by),
  createdByKind: (str(r.created_by_kind) ?? 'agent') as T.ActorKind,
  jobId: str(r.job_id),
  roomId: str(r.room_id),
  taskId: str(r.task_id),
  kind: (str(r.kind) ?? 'timer') as T.AgentSchedule['kind'],
  cronExpr: str(r.cron_expr),
  intervalSeconds: r.interval_seconds == null ? null : num(r.interval_seconds),
  nextRunAt: String(r.next_run_at),
  lastRunAt: str(r.last_run_at),
  prompt: String(r.prompt),
  reason: str(r.reason),
  enabled: bool(r.enabled),
  maxRuns: r.max_runs == null ? null : num(r.max_runs),
  runCount: num(r.run_count),
  createdAt: String(r.created_at),
});

const toDesignFrameVersion = (r: Row): T.DesignFrameVersion => ({
  id: String(r.id),
  frameId: String(r.frame_id),
  version: num(r.version),
  title: String(r.title),
  htmlContent: String(r.html_content ?? ''),
  notes: str(r.notes),
  authorId: String(r.author_id ?? 'atlas'),
  createdAt: String(r.created_at),
});

const toDesignFrame = (r: Row, versions?: T.DesignFrameVersion[]): T.DesignFrame => ({
  id: String(r.id),
  boardId: String(r.board_id),
  parentFrameId: str(r.parent_frame_id),
  title: String(r.title),
  version: Math.max(1, num(r.version)),
  device: (str(r.device) ?? 'phone') as T.DesignDeviceKind,
  width: num(r.width) || 393,
  height: num(r.height) || 852,
  x: Number(r.x ?? 80),
  y: Number(r.y ?? 80),
  status: (str(r.status) ?? 'draft') as T.DesignFrameStatus,
  sourceFiles: parseJson<string[]>(r.source_files_json, []),
  htmlPath: str(r.html_path),
  htmlContent: String(r.html_content ?? ''),
  notes: str(r.notes),
  authorId: String(r.author_id ?? 'atlas'),
  approvedBy: str(r.approved_by),
  approvedAt: str(r.approved_at),
  evidenceId: str(r.evidence_id),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  versions,
});

const toDesignBoard = (r: Row, frames?: T.DesignFrame[]): T.DesignBoard => ({
  id: String(r.id),
  projectId: str(r.project_id),
  jobId: str(r.job_id),
  roomId: str(r.room_id),
  title: String(r.title),
  description: str(r.description),
  mode: (str(r.mode) ?? 'greenfield') as T.DesignBoardMode,
  viewportX: Number(r.viewport_x ?? 0),
  viewportY: Number(r.viewport_y ?? 0),
  viewportZoom: Number(r.viewport_zoom ?? 0.85),
  designTokens: parseJson<T.DesignTokens>(r.design_tokens_json, {}),
  createdBy: String(r.created_by ?? 'winston'),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  frameCount: r.frame_count != null ? num(r.frame_count) : frames?.length ?? 0,
  approvedCount: r.approved_count != null ? num(r.approved_count) : frames?.filter((f) => f.status === 'approved').length ?? 0,
  frames,
});

const toChatMessage = (r: Row): T.ChatMessage => ({
  id: num(r.id),
  thread_id: str(r.thread_id),
  from_identity: str(r.from_identity),
  to_identity: str(r.to_identity),
  msg_type: str(r.msg_type) ?? 'COORDINATION',
  priority: str(r.priority),
  subject: str(r.subject),
  body: String(r.body ?? ''),
  read: num(r.read),
  ts: String(r.ts),
});

const toThread = (r: Row): T.Thread => ({
  id: String(r.id),
  title: String(r.title),
  author_identities: str(r.author_identities) ?? '[]',
  target_identities: str(r.target_identities) ?? '[]',
  status: str(r.status) ?? 'open',
  related_task_id: str(r.related_task_id),
  related_project_id: str(r.related_project_id),
  created_at: String(r.created_at),
  updated_at: String(r.updated_at),
  message_count: num(r.message_count),
  original_file_path: str(r.original_file_path),
});

const toAnnouncement = (r: Row): T.Announcement => ({
  id: num(r.id),
  title: String(r.title),
  author_identity: str(r.author_identity),
  content: str(r.content),
  audience: str(r.audience) ?? 'all',
  ts: String(r.ts),
  original_file_path: str(r.original_file_path),
});

const toSocialPost = (r: Row): T.SocialPost => ({
  id: num(r.id),
  channel: String(r.channel),
  author_identity: str(r.author_identity),
  content: String(r.content),
  ts: String(r.ts),
  original_file_path: str(r.original_file_path),
});

const toStandup = (r: Row): T.Standup => ({
  id: num(r.id),
  standup_date: String(r.standup_date),
  facilitator: str(r.facilitator),
  present_identities: str(r.present_identities) ?? '[]',
  absent_identities: str(r.absent_identities) ?? '[]',
  content: str(r.content),
  parsed_updates: str(r.parsed_updates) ?? '{}',
  ts: String(r.ts),
  original_file_path: str(r.original_file_path),
});

const toOkrObjective = (r: Row): T.OkrObjective => ({
  id: String(r.id),
  title: String(r.title),
  description: str(r.description),
  owner_id: str(r.owner_id),
  quarter: String(r.quarter),
  progress_percent: num(r.progress_percent),
  status: (str(r.status) ?? 'on_track') as T.OkrObjective['status'],
  created_at: String(r.created_at),
  updated_at: String(r.updated_at),
});

const toOkrKeyResult = (r: Row): T.OkrKeyResult => ({
  id: String(r.id),
  objective_id: String(r.objective_id),
  title: String(r.title),
  metric_type: (str(r.metric_type) ?? 'percentage') as T.OkrKeyResult['metric_type'],
  current_value: Number(r.current_value) || 0,
  target_value: Number(r.target_value) || 0,
  unit: str(r.unit),
  progress_percent: num(r.progress_percent),
  telemetry_query: str(r.telemetry_query),
  created_at: String(r.created_at),
  updated_at: String(r.updated_at),
});

const toProjectTask = (r: Row): T.ProjectTask => ({
  id: String(r.id),
  projectId: str(r.project_id),
  milestoneId: str(r.milestone_id),
  okrKrId: str(r.okr_kr_id),
  title: String(r.title),
  description: str(r.description),
  creator: str(r.creator),
  assigneeId: str(r.assignee_id),
  requiredCapabilities: parseJson<string[]>(r.required_capabilities, []),
  priority: (str(r.priority) ?? 'medium') as T.ProjectTaskPriority,
  status: (str(r.status) ?? 'open') as T.ProjectTaskStatus,
  repo: str(r.repo),
  branch: str(r.branch),
  dependencies: parseJson<string[]>(r.dependencies, []),
  acceptanceCriteria: parseJson<string[]>(r.acceptance_criteria, []),
  artifacts: parseJson<string[]>(r.artifacts, []),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

const toMilestone = (r: Row): T.Milestone => ({
  id: String(r.id),
  projectId: str(r.project_id),
  title: String(r.title),
  description: str(r.description),
  status: (str(r.status) ?? 'pending') as T.Milestone['status'],
  dueAt: str(r.due_at),
  completedAt: str(r.completed_at),
  createdAt: String(r.created_at),
});



