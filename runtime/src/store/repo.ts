import crypto from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type * as T from '../api/types.ts';

type Row = Record<string, unknown>;

export class InputError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ForbiddenError extends Error {}

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

const str = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => Number(v ?? 0);
const bool = (v: unknown): boolean => Number(v ?? 0) === 1;
const jsonText = (v: unknown) => JSON.stringify(v ?? null);

function parseJson<T>(v: unknown, fallback: T): T {
  try {
    return v == null ? fallback : (JSON.parse(String(v)) as T);
  } catch {
    return fallback;
  }
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
const TASK_STATUSES: T.TaskStatus[] = ['pending', 'running', 'done', 'failed', 'blocked'];
const TASK_MODES: NonNullable<T.Task['mode']>[] = ['build', 'verify', 'review', 'ops', 'design'];

interface EventInput {
  type: string;
  subjectId: string | null;
  payload?: unknown;
  actorId?: string | null;
  actorKind?: T.ActorKind | null;
  subjectType?: string | null;
}

/** All reads and writes of the v2 store. Writes and their events share one transaction. */
export class Repo {
  private readonly db: DatabaseSync;
  private readonly onEvent: (e: T.RuntimeEvent) => void;

  constructor(db: DatabaseSync, onEvent: (e: T.RuntimeEvent) => void = () => {}) {
    this.db = db;
    this.onEvent = onEvent;
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
        `INSERT INTO events (type, subject_id, payload, created_at, actor_id, actor_kind, subject_type, hash, prev_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(input.type, input.subjectId, jsonText(payload), createdAt, actorId, actorKind, subjectType, hash, prevHash);
    const event: T.RuntimeEvent = {
      seq: Number(res.lastInsertRowid),
      type: input.type,
      subjectId: input.subjectId,
      payload,
      createdAt,
      actorId,
      actorKind,
      subjectType,
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
      if (fields.length) {
        this.db.prepare(`UPDATE identities SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);
      }
      this.recordEvent(events, { type: 'identity.updated', subjectId: id, subjectType: 'identity' });
    });
    return this.getIdentity(id);
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
        (SELECT COUNT(*) FROM jobs j WHERE j.project_id = p.id AND j.stage NOT IN ('done','cancelled')) AS open_job_count
       FROM projects p ${includeArchived ? '' : 'WHERE p.archived = 0'} ORDER BY p.name`
    );
    return rows.map((row) => toProject(row, this.listRepos(String(row.id))));
  }

  getProject(id: string): T.Project {
    const row = this.one(
      `SELECT p.*,
        (SELECT COUNT(*) FROM rooms r WHERE r.project_id = p.id AND r.archived = 0) AS room_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.project_id = p.id AND j.stage NOT IN ('done','cancelled')) AS open_job_count
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
    this.write((events) => {
      this.db
        .prepare('INSERT INTO rooms (id, name, repo_path, created_at, project_id, team_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(
          id,
          name,
          input.repoPath ?? null,
          now(),
          input.projectId ?? null,
          input.teamId ?? null,
          input.kind ?? (input.projectId ? 'project' : 'adhoc')
        );
      this.recordEvent(events, { type: 'room.created', subjectId: id, payload: { name }, subjectType: 'room' });
    });
    return this.getRoom(id);
  }

  updateRoom(id: string, input: { name?: string; projectId?: string | null; teamId?: string | null; archived?: boolean }): T.Room {
    if (!this.one('SELECT id FROM rooms WHERE id = ?', id)) throw new NotFoundError(`room ${id} not found`);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [];
      if (input.name !== undefined) fields.push(['name', required(input.name, 'name')]);
      if (input.projectId !== undefined) fields.push(['project_id', input.projectId]);
      if (input.teamId !== undefined) fields.push(['team_id', input.teamId]);
      if (input.archived !== undefined) fields.push(['archived', input.archived ? 1 : 0]);
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
      sessions: this.all('SELECT * FROM sessions WHERE task_id IN (SELECT id FROM tasks WHERE job_id = ?) ORDER BY started_at DESC', jobId).map(toSession),
      usage: this.all('SELECT * FROM usage WHERE job_id = ? ORDER BY created_at DESC', jobId).map(toUsage),
      history: this.all('SELECT * FROM job_stage_history WHERE job_id = ? ORDER BY id', jobId).map(toHistory),
      stageNote: str(row.stage_note),
      baseSha: str(row.base_sha),
      shipSha: str(row.ship_sha),
      ownerId: str(row.owner_id),
    };
  }

  createJob(input: T.CreateJobInput): T.JobDetail {
    const roomId = required(input.roomId, 'roomId');
    const title = required(input.title, 'title');
    const createdBy = required(input.createdBy, 'createdBy');
    const room = this.one('SELECT * FROM rooms WHERE id = ?', roomId);
    if (!room) throw new NotFoundError(`room ${roomId} not found`);
    if (input.criteria && !Array.isArray(input.criteria)) throw new InputError('criteria must be a list of strings');
    const id = newId('job');
    this.write((events) => {
      const projectId = input.projectId ?? str(room.project_id);
      const ownerId = this.ownerId();
      const t = now();
      const next = Number(this.scalar('SELECT COALESCE(MAX(number), 0) + 1 FROM jobs') ?? 1);
      this.db
        .prepare(
          `INSERT INTO jobs
            (id, number, room_id, title, brief, stage, created_by, created_at, updated_at,
             project_id, risk, priority, budget_cents, owner_id)
           VALUES (?, ?, ?, ?, ?, 'brief', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, next, roomId, title, input.brief ?? '', createdBy, t, t,
          projectId, oneOf(input.risk, RISKS, 'risk', 'low'), optionalString(input.priority, 'priority') ?? 'normal',
          input.budgetCents == null ? null : positiveInt(input.budgetCents, 'budgetCents'), ownerId
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
    });
    return this.getJob(id);
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
      fields.push(['updated_at', now()]);
      this.db.prepare(`UPDATE jobs SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), jobId);
      this.recordEvent(events, { type: 'job.updated', subjectId: jobId, payload: { fields: fields.map(([c]) => c) }, subjectType: 'job' });
    });
    return this.getJob(jobId);
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

  private gates(job: T.JobDetail, to: T.JobStage): string[] {
    const gates: string[] = [];
    if (to === 'build') {
      if (!job.plan?.summary) gates.push('a plan is written');
      if (job.tasks.length === 0) gates.push('the plan has at least one task');
    }
    if (to === 'verify') {
      const unfinished = job.tasks.filter((t) => t.status !== 'done');
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
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO tasks (id, job_id, title, assignee_id, check_command, gate, status, created_at,
             position, plan_task_id, mode, evidence_required, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, jobId, title, optionalString(input.assigneeId, 'assigneeId'), optionalString(input.checkCommand, 'checkCommand'),
          optionalString(input.gate, 'gate'), now(), position, optionalString(input.planTaskId, 'planTaskId'),
          oneOf(input.mode, TASK_MODES, 'mode', 'build'), input.evidenceRequired === false ? 0 : 1, now()
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
      if (input.status !== undefined) {
        const status = oneOf(input.status, TASK_STATUSES, 'status');
        fields.push(['status', status]);
        if (status === 'running' && !row.started_at) fields.push(['started_at', now()]);
        if (status === 'done' || status === 'failed') fields.push(['ended_at', now()]);
      }
      this.db.prepare(`UPDATE tasks SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), taskId);
      this.refreshJobUpdated(jobId);
      this.recordEvent(events, { type: 'task.updated', subjectId: jobId, payload: { taskId, status: input.status }, subjectType: 'job' });
    });
    return this.listTasks(jobId).find((t) => t.id === taskId)!;
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
    return this.all('SELECT * FROM sessions ORDER BY started_at DESC').map(toSession);
  }

  getSession(id: string): T.Session {
    const row = this.one('SELECT * FROM sessions WHERE id = ?', id);
    if (!row) throw new NotFoundError(`session ${id} not found`);
    return toSession(row);
  }

  registerSession(input: T.RegisterSessionInput): T.Session {
    const agentId = required(input.agentId, 'agentId');
    const runtimeCommand = required(input.runtimeCommand, 'runtimeCommand');
    if (!this.one('SELECT id FROM identities WHERE id = ?', agentId)) throw new NotFoundError(`identity ${agentId} not found`);
    if (input.taskId && !this.one('SELECT id FROM tasks WHERE id = ?', input.taskId)) throw new NotFoundError(`task ${input.taskId} not found`);
    const id = newId('sess');
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO sessions
            (id, agent_id, task_id, runtime_command, pid, worktree, state, last_seen_at, started_at, ended_at,
             acp_session_id, adapter_id, mode, base_sha, base_branch, model)
           VALUES (?, ?, ?, ?, ?, ?, 'starting', ?, ?, NULL, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, agentId, input.taskId ?? null, runtimeCommand, input.pid ?? null, input.worktree ?? null,
          now(), now(), input.acpSessionId ?? null, input.adapterId ?? null,
          oneOf(input.mode, TASK_MODES, 'mode', 'build'), input.baseSha ?? null, input.baseBranch ?? null, input.model ?? null
        );
      this.recordEvent(events, {
        type: 'session.started',
        subjectId: id,
        payload: { agentId, taskId: input.taskId ?? null, adapterId: input.adapterId ?? null },
        actorId: agentId,
        actorKind: 'agent',
        subjectType: 'session',
      });
    });
    return this.getSession(id);
  }

  updateSession(id: string, input: { state?: T.SessionState; pid?: number | null; lastSeenAt?: string; exitCode?: number | null; error?: string | null; turnCount?: number }): T.Session {
    const session = this.getSession(id);
    this.write((events) => {
      const fields: [string, SQLInputValue][] = [];
      if (input.state !== undefined) fields.push(['state', oneOf(input.state, ['starting', 'running', 'idle', 'stopped', 'failed'] as const, 'state')]);
      if (input.pid !== undefined) fields.push(['pid', input.pid]);
      fields.push(['last_seen_at', input.lastSeenAt ?? now()]);
      if (input.exitCode !== undefined) fields.push(['exit_code', input.exitCode]);
      if (input.error !== undefined) fields.push(['error', input.error]);
      if (input.turnCount !== undefined) fields.push(['turn_count', input.turnCount]);
      if (input.state === 'stopped' || input.state === 'failed') fields.push(['ended_at', now()]);
      this.db.prepare(`UPDATE sessions SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, v]) => v), id);
      this.recordEvent(events, {
        type: 'session.updated',
        subjectId: id,
        payload: { state: input.state ?? session.state, exitCode: input.exitCode ?? null },
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
    const id = this.write((events) => {
      const res = this.db
        .prepare('INSERT INTO transcript_entries (session_id, kind, payload, created_at, seq, turn_id, item_id, role, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(sessionId, required(input.kind, 'kind'), jsonText(input.payload ?? {}), now(), seq, input.turnId ?? null, input.itemId ?? null, input.role ?? null, input.title ?? null);
      this.db
        .prepare('UPDATE sessions SET last_event_at = ?, turn_count = COALESCE(turn_count, 0) + 1 WHERE id = ?')
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
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO usage (id, job_id, session_id, model, input_tokens, output_tokens, cost_cents, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, input.jobId ?? null, input.sessionId ?? null, input.model ?? null,
          positiveInt(input.inputTokens, 'inputTokens', 0),
          positiveInt(input.outputTokens, 'outputTokens', 0),
          cost, input.source ?? null, now()
        );
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

  upsertAdapterOverride(id: string, input: { command?: string | null; args?: string[]; enabled?: boolean; abilities?: Record<string, boolean> }): void {
    this.write((events) => {
      this.db
        .prepare(
          `INSERT INTO adapters (id, command, args, enabled, abilities, updated_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET command = excluded.command, args = excluded.args, enabled = excluded.enabled,
             abilities = excluded.abilities, updated_at = excluded.updated_at`
        )
        .run(
          required(id, 'id'), input.command ?? null, jsonText(input.args ?? []),
          input.enabled === false ? 0 : 1, jsonText(input.abilities ?? {}), now()
        );
      this.recordEvent(events, { type: 'adapter.updated', subjectId: id });
    });
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

const toSession = (r: Row): T.Session => ({
  id: String(r.id),
  agentId: String(r.agent_id),
  taskId: str(r.task_id),
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
});

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

const toEvent = (r: Row): T.RuntimeEvent => ({
  seq: num(r.seq),
  type: String(r.type),
  subjectId: str(r.subject_id),
  payload: parseJson<unknown>(r.payload, {}),
  createdAt: String(r.created_at),
  actorId: str(r.actor_id),
  actorKind: str(r.actor_kind) as T.ActorKind | null,
  subjectType: str(r.subject_type),
  hash: str(r.hash),
  prevHash: str(r.prev_hash),
});
