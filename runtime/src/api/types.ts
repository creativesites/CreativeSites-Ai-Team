// Wire types for the runtime's local API. The desktop imports this file for its
// typed client, so it must stay type-only (no runtime code).

export type EvidenceClass = 'OBSERVED' | 'DECLARED' | 'ATTESTED' | 'VERIFIED' | 'UNKNOWN';
export type JobStage = 'brief' | 'plan' | 'build' | 'verify' | 'approve' | 'done' | 'cancelled';
export type SessionState = 'starting' | 'running' | 'idle' | 'stopped' | 'failed';

export interface Health {
  ok: true;
  version: string;
  schemaVersion: number;
  startedAt: string;
  pid: number;
}

export interface Identity {
  id: string;
  name: string;
  role: string | null;
  runtime: string | null;
  avatarMark: string | null;
  avatarColor: string | null;
  seats: string[];
  createdAt: string;
}

export interface Room {
  id: string;
  name: string;
  repoPath: string | null;
  createdAt: string;
  memberCount: number;
  openJobCount: number;
}

export interface Message {
  id: string;
  roomId: string;
  authorId: string;
  authorKind: 'human' | 'agent' | 'system';
  body: string;
  jobId: string | null;
  createdAt: string;
}

export interface JobSummary {
  id: string;
  number: number;
  roomId: string;
  title: string;
  stage: JobStage;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  pendingApprovals: number;
}

export interface Criterion {
  id: string;
  text: string;
  position: number;
  /** Strongest evidence recorded against this criterion, or UNKNOWN when there is none. */
  evidenceClass: EvidenceClass;
}

export interface Task {
  id: string;
  title: string;
  assigneeId: string | null;
  checkCommand: string | null;
  gate: string | null;
  status: 'pending' | 'running' | 'done' | 'failed' | 'blocked';
  createdAt: string;
}

export interface Evidence {
  id: string;
  jobId: string | null;
  taskId: string | null;
  sessionId: string | null;
  criterionId: string | null;
  kind: 'command' | 'diff' | 'file' | 'test' | 'message' | 'review';
  class: EvidenceClass;
  summary: string;
  payload: unknown;
  hash: string | null;
  recordedBy: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  jobId: string;
  title: string;
  consequence: string;
  status: 'pending' | 'approved' | 'declined';
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface JobDetail extends JobSummary {
  brief: string;
  criteria: Criterion[];
  tasks: Task[];
  evidence: Evidence[];
  approvals: Approval[];
}

export interface Session {
  id: string;
  agentId: string;
  taskId: string | null;
  runtimeCommand: string;
  pid: number | null;
  worktree: string | null;
  state: SessionState;
  lastSeenAt: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface Summary {
  identities: number;
  rooms: number;
  openJobs: number;
  pendingApprovals: number;
  liveSessions: number;
}

export interface RuntimeEvent {
  seq: number;
  type: string;
  subjectId: string | null;
  payload: unknown;
  createdAt: string;
}

export interface CreateRoomInput {
  name: string;
  repoPath?: string;
}

export interface PostMessageInput {
  authorId: string;
  authorKind: 'human' | 'agent' | 'system';
  body: string;
  jobId?: string;
}

export interface CreateJobInput {
  roomId: string;
  title: string;
  brief?: string;
  createdBy: string;
  criteria?: string[];
}

export interface UpdateIdentityInput {
  name?: string;
  role?: string | null;
  runtime?: string | null;
  avatarMark?: string | null;
  avatarColor?: string | null;
  seats?: string[];
}

export interface CreateIdentityInput {
  id: string;
  name: string;
  role?: string;
  runtime?: string;
  avatarMark?: string;
  avatarColor?: string;
  seats?: string[];
}
