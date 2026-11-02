// Wire types for the runtime's local API. The desktop imports this file for its
// typed client, so it must stay type-only (no runtime code).

export type EvidenceClass = 'OBSERVED' | 'DECLARED' | 'ATTESTED' | 'VERIFIED' | 'UNKNOWN';
export type JobStage = 'brief' | 'plan' | 'build' | 'verify' | 'approve' | 'done' | 'cancelled';
export type SessionState = 'starting' | 'running' | 'idle' | 'stopped' | 'failed';
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked';
export type ApprovalStatus = 'pending' | 'approved' | 'declined' | 'expired' | 'escalated';
export type Risk = 'low' | 'medium' | 'high' | 'critical';
export type ActorKind = 'human' | 'agent' | 'system';

/** What the store can honestly say about a directory (git is only one kind of workspace). */
export interface WorkspaceState {
  exists: boolean;
  isGit: boolean;
  branch: string | null;
  headSha: string | null;
  dirty: boolean;
  /** True when the state could not be read; render as Unknown, not as clean. */
  unknown: boolean;
  error: string | null;
}

export interface Health {
  ok: boolean;
  version: string;
  schemaVersion: number;
  startedAt: string;
  pid: number;
  /** Real checks, not a static claim. */
  checks?: {
    store: boolean;
    git: boolean;
    node: string;
    adapters: Record<string, { installed: boolean; version: string | null; auth?: string }>;
    workspaceRoots: number;
  };
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
  teamId?: string | null;
  lane?: string | null;
  symbol?: string | null;
  capabilities?: string[];
  /** The team's provenance ladder, carried over from v1: DECLARED/ATTESTED/OBSERVED/VERIFIED. */
  provenance?: string;
  isOwner?: boolean;
  approvalLevel?: 'owner' | 'lead' | 'member' | 'none';
  adapterId?: string | null;
  archived?: boolean;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  memberCount: number;
}

export interface TeamMember {
  teamId: string;
  identityId: string;
  role: string;
  joinedAt: string;
}

export interface Repo {
  id: string;
  projectId: string;
  name: string;
  path: string | null;
  remoteUrl: string | null;
  defaultBranch: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  rootPath: string | null;
  defaultBranch: string | null;
  teamId: string | null;
  archived: boolean;
  createdAt: string;
  repos: Repo[];
  roomCount: number;
  openJobCount: number;
}

export interface Workspace {
  project: Project;
  state: WorkspaceState;
}

export interface Room {
  id: string;
  name: string;
  repoPath: string | null;
  createdAt: string;
  memberCount: number;
  openJobCount: number;
  projectId?: string | null;
  teamId?: string | null;
  kind?: 'project' | 'squad' | 'adhoc';
  archived?: boolean;
}

export interface RoomMember {
  roomId: string;
  memberId: string;
  kind: 'human' | 'agent';
  role: string;
  joinedAt: string | null;
  identity?: Identity | null;
}

export interface Message {
  id: string;
  roomId: string;
  authorId: string;
  authorKind: ActorKind;
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
  projectId?: string | null;
  priority?: string;
  risk?: Risk;
  budgetCents?: number | null;
  costCents?: number;
  startedAt?: string | null;
  endedAt?: string | null;
  blockedReason?: string | null;
}

export interface Criterion {
  id: string;
  text: string;
  position: number;
  /** Strongest evidence recorded against this criterion, or UNKNOWN when there is none. */
  evidenceClass: EvidenceClass;
  taskIds?: string[];
}

export interface Task {
  id: string;
  jobId: string;
  title: string;
  assigneeId: string | null;
  checkCommand: string | null;
  gate: string | null;
  status: TaskStatus;
  createdAt: string;
  position?: number;
  planTaskId?: string | null;
  mode?: 'build' | 'verify' | 'review' | 'ops' | 'design';
  startedAt?: string | null;
  endedAt?: string | null;
  updatedAt?: string | null;
  evidenceRequired?: boolean;
}

export interface Evidence {
  id: string;
  jobId: string | null;
  taskId: string | null;
  sessionId: string | null;
  criterionId: string | null;
  kind:
    | 'command'
    | 'diff'
    | 'file'
    | 'test'
    | 'message'
    | 'review'
    | 'browser'
    | 'deploy'
    | 'db_read'
    | 'db_write'
    | 'api'
    | 'approval'
    | 'artifact';
  class: EvidenceClass;
  summary: string;
  payload: unknown;
  hash: string | null;
  recordedBy: string;
  createdAt: string;
  prevHash?: string | null;
  contentHash?: string | null;
  artifactRefs?: string[];
  command?: string | null;
  exitCode?: number | null;
  commitSha?: string | null;
  worktree?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  supersedes?: string | null;
}

export interface Approval {
  id: string;
  jobId: string;
  title: string;
  consequence: string;
  status: ApprovalStatus;
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  actionType?: string;
  action?: Record<string, unknown>;
  risk?: Risk;
  assignedTo?: string | null;
  assignedKind?: ActorKind | null;
  escalateTo?: string | null;
  escalatedAt?: string | null;
  expiresAt?: string | null;
  policyId?: string | null;
  decidedByKind?: ActorKind | null;
  note?: string | null;
  executedAt?: string | null;
  execution?: Record<string, unknown> | null;
  sessionId?: string | null;
  taskId?: string | null;
  requestId?: string | null;
  reversible?: boolean | null;
}

export interface JobPlan {
  summary: string;
  options?: { id: string; label: string; score?: number }[];
  chosen?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  councilId?: string | null;
}

export interface JobStageHistory {
  id: number;
  jobId: string;
  fromStage: JobStage | null;
  toStage: JobStage;
  actorId: string;
  actorKind: ActorKind;
  note: string | null;
  createdAt: string;
}

export interface JobDetail extends JobSummary {
  brief: string;
  criteria: Criterion[];
  tasks: Task[];
  evidence: Evidence[];
  approvals: Approval[];
  plan?: JobPlan;
  sessions?: Session[];
  usage?: Usage[];
  history?: JobStageHistory[];
  stageNote?: string | null;
  baseSha?: string | null;
  shipSha?: string | null;
  ownerId?: string | null;
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
  acpSessionId?: string | null;
  adapterId?: string | null;
  mode?: 'build' | 'verify' | 'review' | 'ops' | 'design';
  baseSha?: string | null;
  baseBranch?: string | null;
  exitCode?: number | null;
  error?: string | null;
  cancelRequestedAt?: string | null;
  lastEventAt?: string | null;
  model?: string | null;
  turnCount?: number;
}

export interface TranscriptEntry {
  id: number;
  sessionId: string;
  seq: number;
  kind: string;
  role: string | null;
  turnId: string | null;
  itemId: string | null;
  title: string | null;
  payload: unknown;
  createdAt: string;
}

export interface Usage {
  id: string;
  jobId: string | null;
  sessionId: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  source: string | null;
  createdAt: string;
}

export interface ApprovalPolicy {
  id: string;
  scope: 'global' | 'project' | 'room';
  projectId: string | null;
  roomId: string | null;
  actionType: string;
  /** The highest risk a team lead may approve without the owner. */
  maxRiskForLead: Risk;
  leadId: string | null;
  escalateTo: string | null;
  timeoutMinutes: number;
  enabled: boolean;
  createdAt: string;
}

export interface Budget {
  id: string;
  scope: 'global' | 'project';
  projectId: string | null;
  period: 'job' | 'day' | 'month';
  amountCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdapterAuth {
  state: 'ready' | 'configured' | 'needs_login' | 'missing_binary' | 'unsupported' | 'unknown';
  detail: string;
}

export interface AdapterInfo {
  id: string;
  name: string;
  kind: string;
  command: string;
  args: string[];
  enabled: boolean;
  source: 'preset' | 'override';
  installed: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
  /** What the runtime has probed this adapter to support, if anything. */
  abilities: Record<string, boolean>;
  lastProbeAt: string | null;
  auth: AdapterAuth;
}

export type Ruin = 'none' | 'possible' | 'likely';

export interface CouncilOption {
  id: string;
  label: string;
}

export interface CouncilSeat {
  seat: string;
  question: string;
  weight: number;
  reason?: string;
  identityId?: string | null;
}

export interface CouncilCardParsed {
  stance: string;
  call: string;
  optionScores: Record<string, number>;
  pillar: number | null;
  finalScore: number | null;
  confidence: number | null;
  ruin: Ruin | '';
  door: 'one-way' | 'two-way' | '';
  disagreeWith: string | null;
  disagreeLine: string;
  concede: string;
  moved: string;
  vote: 'endorse' | 'amend' | 'dissent' | '';
  amendment: string;
  oneLine: string;
  question: string;
  risk: string;
  thisWeek: string;
}

export interface CouncilQuoteCheck {
  quote: string;
  source: string;
  verified: boolean;
}

export interface CouncilCardResult {
  seat: string;
  identityId: string | null;
  scores: Record<string, number>;
  pillar: number;
  confidence: number | null;
  ruin: Record<string, Ruin>;
  reversible: boolean | null;
  argument: string | null;
  text?: string | null;
  parsed?: CouncilCardParsed | null;
  quotes?: CouncilQuoteCheck[];
}

export interface CouncilCard {
  id: string;
  councilId: string;
  round: number;
  seat: string;
  identityId: string | null;
  result: CouncilCardResult;
  createdAt: string;
}

export interface CouncilScore {
  id: string;
  label: string;
  score: number;
  formula: string;
}

export interface CouncilCruxSide {
  position: string;
  seats: string[];
}

export interface CouncilCrux {
  question: string;
  sides: CouncilCruxSide[];
}

export interface CouncilDraft {
  option: string;
  label: string;
  recommendation: string;
  conditions: string[];
  next_steps: string[];
  cheapest_test: string;
  kill_criteria: string;
}

export interface CouncilVerdictSeatSummary {
  key: string;
  weight: number;
  stance?: string;
  optionScores?: Record<string, number>;
  pillar?: number | null;
  moved?: string;
  oneLine?: string;
}

export interface CouncilResult {
  label: string;
  call: string;
  scores: CouncilScore[];
  topId: string;
  spread: number;
  confidence: number;
  support: number;
  rules: {
    disasterCapApplied: boolean;
    cannotUndo: boolean;
    tooFastAgreement: boolean;
  };
  conditions: string[];
  objection: { text: string; by: string } | null;
  // Roast-Room rich verdict fields
  recommended?: string;
  override_note?: string;
  why?: { point: string; seat: string; framework: string }[];
  fights?: { crux: string; story: string }[];
  minority?: { seat: string; quote: string; would_have_to_be_true: string };
  amendments?: { seat: string; amendment: string; adopted: boolean; reason: string }[];
  next_steps?: { when: string; action: string }[];
  cheapest_test?: string;
  kill_criteria?: string;
  revisit?: string;
  votes?: Record<string, number> | null;
  seats?: CouncilVerdictSeatSummary[];
  disclaimer?: string;
  tasks?: CreateTaskInput[];
}

export interface CouncilStreamEvent {
  type: string;
  t?: number;
  [key: string]: unknown;
}

export interface Council {
  id: string;
  jobId: string;
  mode: 'quick' | 'full';
  status: 'running' | 'verdict' | 'accepted' | 'cancelled';
  title?: string | null;
  decision?: string | null;
  brief?: string | null;
  assumptions?: string[];
  cruxes?: CouncilCrux[];
  draft?: CouncilDraft | null;
  events?: CouncilStreamEvent[];
  sessionDir?: string | null;
  options: CouncilOption[];
  seats: CouncilSeat[];
  cards: CouncilCard[];
  verdict: CouncilVerdict | null;
  createdAt: string;
}

export interface CouncilVerdict {
  id: string;
  councilId: string;
  label: string;
  score: number | null;
  spread: number | null;
  confidence: number | null;
  support: number | null;
  payload: CouncilResult;
  plan: Record<string, unknown>;
  createdAt: string;
}

export interface CreateCouncilInput {
  mode?: 'quick' | 'full';
  title?: string;
  decision?: string;
  brief?: string;
  assumptions?: string[];
  options: CouncilOption[];
  seats: CouncilSeat[];
}

export interface CreateCouncilCardInput {
  round?: number;
  seat: string;
  identityId?: string | null;
  scores: Record<string, number>;
  pillar: number;
  confidence?: number;
  ruin?: Record<string, Ruin>;
  reversible?: boolean;
  argument?: string;
  text?: string;
  parsed?: CouncilCardParsed;
  quotes?: CouncilQuoteCheck[];
}

export interface RunCouncilInput {
  prompt?: string;
  mode?: 'quick' | 'full';
  boardGroup?: 'myaos' | 'operators';
  seats?: string[];
  options?: CouncilOption[];
}

export interface CouncilSessionSummary {
  id: string;
  title: string;
  prompt: string;
  mode: 'quick' | 'full';
  status: string;
  source?: string;
  jobId?: string | null;
}

export interface CouncilSessionPayload {
  id: string;
  title: string;
  prompt: string;
  mode: 'quick' | 'full';
  status: string;
  jobId?: string | null;
  events: CouncilStreamEvent[];
}

export interface AcceptVerdictInput {
  actorId: string;
  tasks?: CreateTaskInput[];
}

export interface BridgeStatus {
  configured: boolean;
  enabled: boolean;
  teamRepo: string | null;
  threadsDir: string | null;
  inboxDir: string | null;
  lastMirrorAt: string | null;
  lastIngestAt: string | null;
  ingested: number;
  lastError: string | null;
}

export interface Artifact {
  sha256: string;
  path: string;
  mime: string | null;
  bytes: number;
  createdAt: string;
}

export interface Settings {
  ownerId?: string;
  defaultBudgetCents?: number;
  defaultMonthlyBudgetCents?: number;
  [key: string]: unknown;
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
  actorId?: string | null;
  actorKind?: ActorKind | null;
  subjectType?: string | null;
  hash?: string | null;
  prevHash?: string | null;
}

/** Sent at the start of an SSE connection when the requested replay has a hole in it. */
export interface StreamGap {
  requestedSince: number;
  oldestAvailable: number;
  latestAvailable: number;
  truncated: boolean;
}

// --- inputs ---

export interface CreateIdentityInput {
  id: string;
  name: string;
  role?: string;
  runtime?: string;
  avatarMark?: string;
  avatarColor?: string;
  seats?: string[];
  teamId?: string;
  lane?: string;
  symbol?: string;
  capabilities?: string[];
  provenance?: string;
  isOwner?: boolean;
  approvalLevel?: 'owner' | 'lead' | 'member' | 'none';
  adapterId?: string;
}

export interface UpdateIdentityInput {
  name?: string;
  role?: string | null;
  runtime?: string | null;
  avatarMark?: string | null;
  avatarColor?: string | null;
  seats?: string[];
  teamId?: string | null;
  lane?: string | null;
  symbol?: string | null;
  capabilities?: string[];
  provenance?: string;
  approvalLevel?: 'owner' | 'lead' | 'member' | 'none';
  adapterId?: string | null;
  archived?: boolean;
}

export interface CreateTeamInput {
  id?: string;
  name: string;
  description?: string;
}

export interface CreateRepoInput {
  name: string;
  path?: string;
  remoteUrl?: string;
  defaultBranch?: string;
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
  description?: string;
  rootPath?: string;
  defaultBranch?: string;
  teamId?: string;
  repos?: CreateRepoInput[];
}

export interface UpdateProjectInput {
  name?: string;
  slug?: string | null;
  description?: string | null;
  rootPath?: string | null;
  defaultBranch?: string | null;
  teamId?: string | null;
  archived?: boolean;
}

export interface CreateRoomInput {
  name: string;
  repoPath?: string;
  projectId?: string;
  teamId?: string;
  kind?: 'project' | 'squad' | 'adhoc';
}

export interface AddRoomMemberInput {
  memberId: string;
  kind?: 'human' | 'agent';
  role?: string;
}

export interface PostMessageInput {
  authorId: string;
  authorKind: ActorKind;
  body: string;
  jobId?: string;
}

export interface CreateJobInput {
  roomId: string;
  title: string;
  brief?: string;
  createdBy: string;
  criteria?: string[];
  projectId?: string;
  risk?: Risk;
  priority?: string;
  budgetCents?: number;
}

export interface UpdateJobInput {
  title?: string;
  brief?: string;
  risk?: Risk;
  priority?: string;
  budgetCents?: number | null;
  blockedReason?: string | null;
}

export interface TransitionJobInput {
  to: JobStage;
  actorId: string;
  actorKind?: ActorKind;
  note?: string;
  /** Owner-only escape hatch; recorded in the stage history. */
  force?: boolean;
}

export interface SetPlanInput {
  plan: JobPlan;
  actorId: string;
}

export interface CreateCriterionInput {
  text: string;
  position?: number;
}

export interface CreateTaskInput {
  title: string;
  assigneeId?: string | null;
  checkCommand?: string | null;
  gate?: string | null;
  position?: number;
  planTaskId?: string | null;
  mode?: Task['mode'];
  evidenceRequired?: boolean;
  criterionIds?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  assigneeId?: string | null;
  checkCommand?: string | null;
  gate?: string | null;
  status?: TaskStatus;
  position?: number;
  mode?: Task['mode'];
  evidenceRequired?: boolean;
}

export interface CreateEvidenceInput {
  jobId?: string | null;
  taskId?: string | null;
  sessionId?: string | null;
  criterionId?: string | null;
  kind: Evidence['kind'];
  class: EvidenceClass;
  summary: string;
  payload?: unknown;
  artifactRefs?: string[];
  command?: string | null;
  exitCode?: number | null;
  commitSha?: string | null;
  worktree?: string | null;
  recordedBy: string;
  recordedByKind?: ActorKind;
}

export interface VerifyEvidenceInput {
  verifiedBy: string;
  note?: string;
  command?: string | null;
  exitCode?: number | null;
  commitSha?: string | null;
  worktree?: string | null;
}

export interface CreateApprovalInput {
  jobId: string;
  title: string;
  consequence: string;
  actionType?: string;
  action?: Record<string, unknown>;
  risk?: Risk;
  requestedBy: string;
  requestedKind?: ActorKind;
  sessionId?: string | null;
  taskId?: string | null;
  requestId?: string | null;
  reversible?: boolean;
  /** Skip policy assignment and route straight to this actor. */
  assignedTo?: string;
}

export interface DecideApprovalInput {
  decision: 'approve' | 'decline';
  decidedBy: string;
  decidedByKind?: ActorKind;
  note?: string;
  execution?: Record<string, unknown>;
}

export interface CreatePolicyInput {
  scope: 'global' | 'project' | 'room';
  projectId?: string | null;
  roomId?: string | null;
  actionType: string;
  maxRiskForLead: Risk;
  leadId?: string | null;
  escalateTo?: string | null;
  timeoutMinutes?: number;
  enabled?: boolean;
}

export interface UpdatePolicyInput {
  maxRiskForLead?: Risk;
  leadId?: string | null;
  escalateTo?: string | null;
  timeoutMinutes?: number;
  enabled?: boolean;
}

export interface CreateBudgetInput {
  scope: 'global' | 'project';
  projectId?: string | null;
  period: 'job' | 'day' | 'month';
  amountCents: number;
  currency?: string;
}

export interface RegisterSessionInput {
  agentId: string;
  taskId?: string | null;
  runtimeCommand: string;
  adapterId?: string | null;
  pid?: number | null;
  worktree?: string | null;
  baseSha?: string | null;
  baseBranch?: string | null;
  mode?: Session['mode'];
  acpSessionId?: string | null;
  model?: string | null;
}

export interface AppendTranscriptInput {
  seq?: number;
  kind: string;
  role?: string | null;
  turnId?: string | null;
  itemId?: string | null;
  title?: string | null;
  payload?: unknown;
}

export interface RecordUsageInput {
  jobId?: string | null;
  sessionId?: string | null;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
  source?: string | null;
}

export interface ImportIdentitiesInput {
  owner?: Partial<Identity> & { id: string; name: string; teams?: string[] };
  teams?: { id: string; name: string; description?: string; members?: string[]; leadIdentityId?: string | null }[];
  identities?: (CreateIdentityInput & { team?: string; teams?: string[] })[];
}

export interface AttachProjectInput {
  path: string;
  name?: string;
  defaultBranch?: string;
  teamId?: string;
}

export interface CloneProjectInput {
  url: string;
  parentDir?: string;
  name?: string;
  teamId?: string;
}

export interface CreateProjectFolderInput {
  path: string;
  name?: string;
  initGit?: boolean;
  teamId?: string;
}
