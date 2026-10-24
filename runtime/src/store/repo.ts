import crypto from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type {
  Approval,
  CreateIdentityInput,
  CreateJobInput,
  CreateRoomInput,
  Criterion,
  Evidence,
  EvidenceClass,
  Identity,
  JobDetail,
  JobSummary,
  Message,
  PostMessageInput,
  Room,
  RuntimeEvent,
  Session,
  Summary,
  Task,
  UpdateIdentityInput,
} from '../api/types.ts';

type Row = Record<string, unknown>;

export class InputError extends Error {}
export class NotFoundError extends Error {}

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const str = (v: unknown) => (v == null ? null : String(v));
const parseJson = (v: unknown, fallback: unknown) => {
  try {
    return v == null ? fallback : JSON.parse(String(v));
  } catch {
    return fallback;
  }
};

// Strongest first: a criterion shows the best evidence recorded against it.
const CLASS_RANK: Record<EvidenceClass, number> = { VERIFIED: 4, OBSERVED: 3, ATTESTED: 2, DECLARED: 1, UNKNOWN: 0 };

function required(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new InputError(`${field} is required`);
  return value.trim();
}

/** All reads and writes of the v2 store. Every write also appends an event. */
export class Repo {
  private readonly db: DatabaseSync;
  private readonly onEvent: (e: RuntimeEvent) => void;

  constructor(db: DatabaseSync, onEvent: (e: RuntimeEvent) => void = () => {}) {
    this.db = db;
    this.onEvent = onEvent;
  }

  private all(sql: string, ...params: SQLInputValue[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }

  private one(sql: string, ...params: SQLInputValue[]): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined;
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  emit(type: string, subjectId: string | null, payload: unknown = {}): RuntimeEvent {
    const createdAt = now();
    const res = this.db
      .prepare('INSERT INTO events (type, subject_id, payload, created_at) VALUES (?, ?, ?, ?)')
      .run(type, subjectId, JSON.stringify(payload), createdAt);
    const event: RuntimeEvent = { seq: Number(res.lastInsertRowid), type, subjectId, payload, createdAt };
    this.onEvent(event);
    return event;
  }

  eventsSince(seq: number, limit = 500): RuntimeEvent[] {
    return this.all('SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT ?', seq, limit).map((r) => ({
      seq: Number(r.seq),
      type: String(r.type),
      subjectId: str(r.subject_id),
      payload: parseJson(r.payload, {}),
      createdAt: String(r.created_at),
    }));
  }

  summary(): Summary {
    const count = (sql: string) => Number((this.one(sql) ?? { n: 0 }).n);
    return {
      identities: count('SELECT COUNT(*) AS n FROM identities'),
      rooms: count('SELECT COUNT(*) AS n FROM rooms'),
      openJobs: count("SELECT COUNT(*) AS n FROM jobs WHERE stage NOT IN ('done','cancelled')"),
      pendingApprovals: count("SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending'"),
      liveSessions: count("SELECT COUNT(*) AS n FROM sessions WHERE state IN ('starting','running','idle')"),
    };
  }

  // --- identities ---

  listIdentities(): Identity[] {
    return this.all('SELECT * FROM identities ORDER BY name').map(toIdentity);
  }

  createIdentity(input: CreateIdentityInput): Identity {
    const id = required(input.id, 'id').toLowerCase();
    const name = required(input.name, 'name');
    if (this.one('SELECT id FROM identities WHERE id = ?', id)) throw new InputError(`identity ${id} already exists`);
    this.db
      .prepare(
        `INSERT INTO identities (id, name, role, runtime, avatar_mark, avatar_color, seats, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, name, input.role ?? null, input.runtime ?? null, input.avatarMark ?? null, input.avatarColor ?? null,
        JSON.stringify(input.seats ?? []), now());
    this.emit('identity.created', id);
    return toIdentity(this.one('SELECT * FROM identities WHERE id = ?', id)!);
  }

  updateIdentity(id: string, input: UpdateIdentityInput): Identity {
    if (!this.one('SELECT id FROM identities WHERE id = ?', id)) throw new NotFoundError(`identity ${id} not found`);
    const fields: [string, SQLInputValue][] = [];
    if (input.name !== undefined) fields.push(['name', required(input.name, 'name')]);
    if (input.role !== undefined) fields.push(['role', input.role]);
    if (input.runtime !== undefined) fields.push(['runtime', input.runtime]);
    if (input.avatarMark !== undefined) fields.push(['avatar_mark', input.avatarMark]);
    if (input.avatarColor !== undefined) fields.push(['avatar_color', input.avatarColor]);
    if (input.seats !== undefined) {
      if (!Array.isArray(input.seats)) throw new InputError('seats must be a list');
      fields.push(['seats', JSON.stringify(input.seats)]);
    }
    if (fields.length) {
      this.db
        .prepare(`UPDATE identities SET ${fields.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...fields.map(([, v]) => v), id);
      this.emit('identity.updated', id);
    }
    return toIdentity(this.one('SELECT * FROM identities WHERE id = ?', id)!);
  }

  // --- rooms and messages ---

  listRooms(): Room[] {
    return this.all(
      `SELECT r.*,
        (SELECT COUNT(*) FROM members m WHERE m.room_id = r.id) AS member_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.room_id = r.id AND j.stage NOT IN ('done','cancelled')) AS open_job_count
       FROM rooms r ORDER BY r.name`
    ).map(toRoom);
  }

  createRoom(input: CreateRoomInput): Room {
    const name = required(input.name, 'name');
    if (this.one('SELECT id FROM rooms WHERE name = ?', name)) throw new InputError(`room ${name} already exists`);
    const id = newId('room');
    this.db.prepare('INSERT INTO rooms (id, name, repo_path, created_at) VALUES (?, ?, ?, ?)').run(
      id, name, input.repoPath ?? null, now()
    );
    this.emit('room.created', id, { name });
    return this.listRooms().find((r) => r.id === id)!;
  }

  private requireRoom(roomId: string) {
    if (!this.one('SELECT id FROM rooms WHERE id = ?', roomId)) throw new NotFoundError(`room ${roomId} not found`);
  }

  listMessages(roomId: string, limit = 200): Message[] {
    this.requireRoom(roomId);
    return this.all(
      'SELECT * FROM (SELECT * FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at',
      roomId, limit
    ).map(toMessage);
  }

  postMessage(roomId: string, input: PostMessageInput): Message {
    this.requireRoom(roomId);
    const body = required(input.body, 'body');
    const authorId = required(input.authorId, 'authorId');
    if (!['human', 'agent', 'system'].includes(input.authorKind)) throw new InputError('authorKind must be human, agent or system');
    const id = newId('msg');
    this.db
      .prepare('INSERT INTO messages (id, room_id, author_id, author_kind, body, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, roomId, authorId, input.authorKind, body, input.jobId ?? null, now());
    const msg = toMessage(this.one('SELECT * FROM messages WHERE id = ?', id)!);
    this.emit('message.posted', roomId, { messageId: id, jobId: msg.jobId });
    return msg;
  }

  // --- jobs ---

  listJobs(): JobSummary[] {
    return this.all(
      `SELECT j.*, (SELECT COUNT(*) FROM approvals a WHERE a.job_id = j.id AND a.status = 'pending') AS pending_approvals
       FROM jobs j ORDER BY j.updated_at DESC`
    ).map(toJobSummary);
  }

  createJob(input: CreateJobInput): JobDetail {
    const roomId = required(input.roomId, 'roomId');
    const title = required(input.title, 'title');
    const createdBy = required(input.createdBy, 'createdBy');
    this.requireRoom(roomId);
    const id = newId('job');
    this.tx(() => {
      const next = Number((this.one('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM jobs') as Row).n);
      const t = now();
      this.db
        .prepare(
          `INSERT INTO jobs (id, number, room_id, title, brief, stage, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'brief', ?, ?, ?)`
        )
        .run(id, next, roomId, title, input.brief ?? '', createdBy, t, t);
      (input.criteria ?? []).forEach((text, i) => {
        this.db.prepare('INSERT INTO criteria (id, job_id, text, position) VALUES (?, ?, ?, ?)').run(
          newId('crit'), id, required(text, `criteria[${i}]`), i
        );
      });
    });
    this.emit('job.created', id, { roomId });
    return this.getJob(id);
  }

  getJob(jobId: string): JobDetail {
    const row = this.one(
      `SELECT j.*, (SELECT COUNT(*) FROM approvals a WHERE a.job_id = j.id AND a.status = 'pending') AS pending_approvals
       FROM jobs j WHERE j.id = ?`,
      jobId
    );
    if (!row) throw new NotFoundError(`job ${jobId} not found`);
    const evidence = this.all('SELECT * FROM evidence WHERE job_id = ? ORDER BY created_at DESC', jobId).map(toEvidence);
    const criteria: Criterion[] = this.all('SELECT * FROM criteria WHERE job_id = ? ORDER BY position', jobId).map((r) => {
      const best = evidence
        .filter((e) => e.criterionId === r.id)
        .reduce<EvidenceClass>((acc, e) => (CLASS_RANK[e.class] > CLASS_RANK[acc] ? e.class : acc), 'UNKNOWN');
      return { id: String(r.id), text: String(r.text), position: Number(r.position), evidenceClass: best };
    });
    return {
      ...toJobSummary(row),
      brief: String(row.brief ?? ''),
      criteria,
      tasks: this.all('SELECT * FROM tasks WHERE job_id = ? ORDER BY created_at', jobId).map(toTask),
      evidence,
      approvals: this.all('SELECT * FROM approvals WHERE job_id = ? ORDER BY created_at', jobId).map(toApproval),
    };
  }

  // --- sessions ---

  listSessions(): Session[] {
    return this.all('SELECT * FROM sessions ORDER BY started_at DESC').map(toSession);
  }
}

const toIdentity = (r: Row): Identity => ({
  id: String(r.id),
  name: String(r.name),
  role: str(r.role),
  runtime: str(r.runtime),
  avatarMark: str(r.avatar_mark),
  avatarColor: str(r.avatar_color),
  seats: parseJson(r.seats, []) as string[],
  createdAt: String(r.created_at),
});

const toRoom = (r: Row): Room => ({
  id: String(r.id),
  name: String(r.name),
  repoPath: str(r.repo_path),
  createdAt: String(r.created_at),
  memberCount: Number(r.member_count ?? 0),
  openJobCount: Number(r.open_job_count ?? 0),
});

const toMessage = (r: Row): Message => ({
  id: String(r.id),
  roomId: String(r.room_id),
  authorId: String(r.author_id),
  authorKind: r.author_kind as Message['authorKind'],
  body: String(r.body),
  jobId: str(r.job_id),
  createdAt: String(r.created_at),
});

const toJobSummary = (r: Row): JobSummary => ({
  id: String(r.id),
  number: Number(r.number),
  roomId: String(r.room_id),
  title: String(r.title),
  stage: r.stage as JobSummary['stage'],
  createdBy: String(r.created_by),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  pendingApprovals: Number(r.pending_approvals ?? 0),
});

const toTask = (r: Row): Task => ({
  id: String(r.id),
  title: String(r.title),
  assigneeId: str(r.assignee_id),
  checkCommand: str(r.check_command),
  gate: str(r.gate),
  status: r.status as Task['status'],
  createdAt: String(r.created_at),
});

const toEvidence = (r: Row): Evidence => ({
  id: String(r.id),
  jobId: str(r.job_id),
  taskId: str(r.task_id),
  sessionId: str(r.session_id),
  criterionId: str(r.criterion_id),
  kind: r.kind as Evidence['kind'],
  class: r.class as EvidenceClass,
  summary: String(r.summary),
  payload: parseJson(r.payload, {}),
  hash: str(r.hash),
  recordedBy: String(r.recorded_by),
  createdAt: String(r.created_at),
});

const toApproval = (r: Row): Approval => ({
  id: String(r.id),
  jobId: String(r.job_id),
  title: String(r.title),
  consequence: String(r.consequence),
  status: r.status as Approval['status'],
  requestedBy: String(r.requested_by),
  decidedBy: str(r.decided_by),
  decidedAt: str(r.decided_at),
  createdAt: String(r.created_at),
});

const toSession = (r: Row): Session => ({
  id: String(r.id),
  agentId: String(r.agent_id),
  taskId: str(r.task_id),
  runtimeCommand: String(r.runtime_command),
  pid: r.pid == null ? null : Number(r.pid),
  worktree: str(r.worktree),
  state: r.state as Session['state'],
  lastSeenAt: str(r.last_seen_at),
  startedAt: String(r.started_at),
  endedAt: str(r.ended_at),
});
