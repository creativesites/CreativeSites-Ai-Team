// Wire types for the runtime's local API. The desktop imports this file for its
// typed client, so it must stay type-only (no runtime code).

export type EvidenceClass = 'OBSERVED' | 'DECLARED' | 'ATTESTED' | 'VERIFIED' | 'UNKNOWN';
export type JobStage = 'brief' | 'plan' | 'build' | 'verify' | 'approve' | 'done' | 'cancelled';
export type JobKind = 'code' | 'research' | 'ops' | 'design' | 'decision';
export type ShipStatus = 'none' | 'ready' | 'shipped' | 'merged' | 'pr_opened' | 'cherry_picked' | 'branch_pushed';
export type SessionState = 'starting' | 'running' | 'idle' | 'stopped' | 'failed';
export type IdentityStatusState = 'idle' | 'working' | 'rate_limited' | 'waiting_reset' | 'offline';
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

export interface GitBranchItem {
  name: string;
  ref: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface GitCommitItem {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

export interface GitDiffSummary {
  diff: string;
  files: { path: string; status: string }[];
  truncated?: boolean;
}

export interface ProjectFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

export interface ProjectFileContent {
  path: string;
  name: string;
  content: string;
  size: number;
  truncated: boolean;
  isBinary: boolean;
}

export interface GitWorktreeItem {
  path: string;
  head: string;
  shortHead: string;
  branch: string;
  isMain: boolean;
  detached: boolean;
  clean?: boolean;
}

export interface DirectoryListing {
  current: string;
  parent: string | null;
  directories: { name: string; path: string; isGit: boolean }[];
  isGit: boolean;
  exists: boolean;
}

export interface PickFolderResult {
  path: string | null;
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
  activeSessionId?: string | null;
  acpSessionId?: string | null;
  statusState?: IdentityStatusState;
  rateLimitResetAt?: string | null;
  rateLimitReason?: string | null;
  lastWokenAt?: string | null;
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
  status?: string;
  repo?: string | null;
  targetDate?: string | null;
  updatedAt?: string | null;
  taskCount?: number;
  doneTaskCount?: number;
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
  kind?: JobKind;
  shipStatus?: ShipStatus;
  shipPayload?: Record<string, unknown>;
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
  jobId?: string | null;
  roomId?: string | null;
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
  parentSessionId?: string | null;
  supersededBySessionId?: string | null;
  generation?: number;
  contextTokens?: number;
  batonCapsule?: string | null;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costCents: number;
  } | null;
}

export interface WorktreeFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
  staged: boolean;
  diff: string;
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
  rateLimitResetAt?: string | null;
  rateLimitReason?: string | null;
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
  proposalsDir: string | null;
  inboxDir: string | null;
  lastMirrorAt: string | null;
  lastIngestAt: string | null;
  lastSyncAt: string | null;
  ingested: number;
  lastError: string | null;
}

export interface BridgeSyncResult {
  ok: boolean;
  syncedAt: string;
  verdictsExported: number;
  jobsExported: number;
  ingested: number;
  paths: string[];
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

export type SearchKind = 'job' | 'room' | 'message' | 'identity' | 'session' | 'evidence' | 'okr';

/** One match from GET /v1/search. `roomId` and `jobId` say where to jump when the hit is opened. */
export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  detail: string | null;
  roomId: string | null;
  jobId: string | null;
  at: string | null;
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
  activeSessionId?: string | null;
  acpSessionId?: string | null;
  statusState?: IdentityStatusState;
  rateLimitResetAt?: string | null;
  rateLimitReason?: string | null;
  lastWokenAt?: string | null;
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
  kind?: JobKind;
}

export interface UpdateJobInput {
  title?: string;
  brief?: string;
  risk?: Risk;
  priority?: string;
  budgetCents?: number | null;
  blockedReason?: string | null;
  kind?: JobKind;
  shipStatus?: ShipStatus;
  shipPayload?: Record<string, unknown>;
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
  jobId?: string | null;
  roomId?: string | null;
  runtimeCommand: string;
  adapterId?: string | null;
  pid?: number | null;
  worktree?: string | null;
  baseSha?: string | null;
  baseBranch?: string | null;
  mode?: Session['mode'];
  acpSessionId?: string | null;
  model?: string | null;
  parentSessionId?: string | null;
  generation?: number;
  batonCapsule?: string | null;
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

// --- Autonomous Wake, Cron/Timer Schedules, Rate-Limits, Spawn & Ship ---

export type WakeStatus = 'pending' | 'dispatched' | 'deferred_rate_limit' | 'completed' | 'failed';

export interface AgentWake {
  id: string;
  targetAgentId: string;
  fromActorId: string;
  fromActorKind: ActorKind;
  jobId: string | null;
  roomId: string | null;
  taskId: string | null;
  sessionId: string | null;
  adapterId: string | null;
  reason: string;
  prompt: string;
  status: WakeStatus;
  scheduledFor: string | null;
  createdAt: string;
  dispatchedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export interface WakeAgentInput {
  targetAgentId?: string;
  fromActorId: string;
  fromActorKind?: ActorKind;
  jobId?: string | null;
  roomId?: string | null;
  taskId?: string | null;
  sessionId?: string | null;
  adapterId?: string | null;
  reason?: string;
  prompt: string;
  /** If target's primary adapter is rate-limited, automatically run on an available fallback adapter (e.g. gemini/codex/claude). */
  allowFallbackAdapter?: boolean;
}

export interface WakeAgentResult {
  wake: AgentWake;
  session: Session | null;
  deferred: boolean;
  resetAt: string | null;
  deferredUntil?: string | null;
  rateLimitReason: string | null;
  usedFallbackAdapter: string | null;
}

export interface AgentSchedule {
  id: string;
  agentId: string;
  targetAgentId?: string;
  createdBy: string;
  createdByKind: ActorKind;
  jobId: string | null;
  roomId: string | null;
  taskId: string | null;
  kind: 'timer' | 'cron' | 'interval';
  cronExpr: string | null;
  intervalSeconds: number | null;
  nextRunAt: string;
  lastRunAt: string | null;
  prompt: string;
  reason: string | null;
  enabled: boolean;
  maxRuns: number | null;
  runCount: number;
  createdAt: string;
}

export interface CreateScheduleInput {
  agentId?: string;
  targetAgentId?: string;
  createdBy: string;
  createdByKind?: ActorKind;
  jobId?: string | null;
  roomId?: string | null;
  taskId?: string | null;
  kind?: 'timer' | 'cron' | 'interval';
  cronExpr?: string | null;
  delaySeconds?: number | null;
  intervalSeconds?: number | null;
  runAt?: string | null;
  prompt: string;
  reason?: string | null;
  maxRuns?: number | null;
}

export interface UpdateScheduleInput {
  enabled?: boolean;
  prompt?: string;
  cronExpr?: string | null;
  intervalSeconds?: number | null;
  nextRunAt?: string;
}

export interface SpawnAgentInput {
  id?: string;
  name: string;
  role?: string;
  runtime?: string;
  adapterId?: string;
  teamId?: string;
  lane?: string;
  seats?: string[];
  avatarMark?: string;
  avatarColor?: string;
  spawnedBy: string;
  spawnedByKind?: ActorKind;
  /** Optional immediate wakeup after registration */
  wakePrompt?: string;
  prompt?: string;
  jobId?: string | null;
  roomId?: string | null;
  taskId?: string | null;
}

export interface RateLimitReportInput {
  reason: string;
  resetAt?: string | null;
  resetInSeconds?: number | null;
  actorId?: string;
}

export interface ShipJobInput {
  strategy: 'merge' | 'cherry-pick' | 'branch';
  targetBranch?: string;
  actorId: string;
  message?: string;
}

export interface ShipJobResult {
  ok?: boolean;
  job: JobDetail;
  strategy: 'merge' | 'cherry-pick' | 'branch';
  targetBranch: string;
  branch?: string;
  commitSha: string;
  evidence: Evidence;
}

// --- Session Baton Relay & Token Efficiency ---

export interface SessionRotationResult {
  previousSession: Session;
  newSession: Session;
  batonCapsule: string;
  estimatedSavedTokens: number;
}

// --- Design Studio (Infinite Multi-Frame Canvas) ---

export type DesignBoardMode = 'greenfield' | 'extracted' | 'hybrid';
export type DesignDeviceKind = 'phone' | 'tablet' | 'desktop' | 'custom';
export type DesignFrameStatus = 'draft' | 'iterating' | 'approved' | 'archived';

export interface DesignTokens {
  brandName?: string;
  fontSans?: string;
  fontMono?: string;
  colors?: Record<string, string>;
  cssVariables?: Record<string, string>;
}

export interface DesignFrameVersion {
  id: string;
  frameId: string;
  version: number;
  title: string;
  htmlContent: string;
  notes: string | null;
  authorId: string;
  createdAt: string;
}

export interface DesignFrame {
  id: string;
  boardId: string;
  parentFrameId: string | null;
  title: string;
  version: number;
  device: DesignDeviceKind;
  width: number;
  height: number;
  x: number;
  y: number;
  status: DesignFrameStatus;
  sourceFiles: string[];
  htmlPath: string | null;
  htmlContent: string;
  notes: string | null;
  authorId: string;
  approvedBy: string | null;
  approvedAt: string | null;
  evidenceId: string | null;
  createdAt: string;
  updatedAt: string;
  versions?: DesignFrameVersion[];
}

export interface DesignBoard {
  id: string;
  projectId: string | null;
  jobId: string | null;
  roomId: string | null;
  title: string;
  description: string | null;
  mode: DesignBoardMode;
  viewportX: number;
  viewportY: number;
  viewportZoom: number;
  designTokens: DesignTokens;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  frameCount?: number;
  approvedCount?: number;
  frames?: DesignFrame[];
}

export interface CreateDesignBoardInput {
  projectId?: string | null;
  jobId?: string | null;
  roomId?: string | null;
  title: string;
  description?: string | null;
  mode?: DesignBoardMode;
  createdBy?: string;
}

export interface UpdateDesignBoardInput {
  title?: string;
  description?: string | null;
  viewportX?: number;
  viewportY?: number;
  viewportZoom?: number;
}

export interface CreateDesignFrameInput {
  boardId: string;
  parentFrameId?: string | null;
  title: string;
  device?: DesignDeviceKind;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  sourceFiles?: string[];
  htmlContent: string;
  notes?: string | null;
  authorId?: string;
}

export interface UpdateDesignFrameInput {
  title?: string;
  device?: DesignDeviceKind;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  status?: DesignFrameStatus;
  sourceFiles?: string[];
  htmlContent?: string;
  notes?: string | null;
  authorId?: string;
}

export interface GenerateDesignInput {
  prompt: string;
  agentId?: string;
  device?: DesignDeviceKind;
  variantCount?: number;
  targetFrameIds?: string[];
  action?: 'create' | 'update' | 'fork';
  pinnedElement?: string | null;
  actorId?: string;
}

/**
 * A request for an agent to build designs onto a board.
 * - `new`: design something that does not exist yet (a feature, page or app).
 * - `from-code`: recreate the project's current UI (all of it, or `scope`) so it can be iterated on.
 * - `iterate`: change frames already on the board, in place (`update`) or as new variants (`fork`).
 */
export type DesignRunKind = 'new' | 'from-code' | 'iterate';

export interface StartDesignRunInput {
  kind: DesignRunKind;
  /** What the owner asked for, in their words. */
  prompt: string;
  device?: DesignDeviceKind;
  /** `new`: how many distinct directions to draw (1 to 4). */
  variants?: number;
  /** `from-code`: paths or screen names to recreate; empty means the whole app. */
  scope?: string[];
  /** `iterate`: the frames to change. */
  frameIds?: string[];
  action?: 'update' | 'fork';
  /** `iterate`: an element the owner pinned inside a frame. */
  pinnedElement?: string | null;
  agentId?: string;
  adapterId?: string | null;
  actorId?: string;
}

/** One agent session working on a board, read back from the session store. */
export interface DesignRun {
  sessionId: string;
  boardId: string;
  agentId: string;
  kind: DesignRunKind;
  prompt: string;
  device: DesignDeviceKind | null;
  frameIds: string[];
  state: SessionState;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
  /** Frames the agent created or changed during this run. */
  framesTouched: number;
}

export interface ExtractDesignInput {
  projectId?: string | null;
  targetPaths?: string[];
  device?: DesignDeviceKind;
  prompt?: string | null;
  agentId?: string;
  actorId?: string;
}

export interface ApproveDesignFrameInput {
  actorId: string;
  note?: string | null;
  dispatchBuildTask?: boolean;
  assigneeId?: string | null;
  targetFiles?: string[];
}

export interface ApproveDesignFrameResult {
  frame: DesignFrame;
  evidence: Evidence;
  task: Task | null;
  session: Session | null;
}

// ------------------------------------------------------------------ communication hub

export interface ChatMessage {
  id: number;
  thread_id?: string | null;
  from_identity?: string | null;
  to_identity?: string | null;
  msg_type: string;
  priority?: string | null;
  subject?: string | null;
  body: string;
  read: number;
  ts: string;
}

export interface Thread {
  id: string;
  title: string;
  author_identities?: string | null;
  target_identities?: string | null;
  status: string;
  related_task_id?: string | null;
  related_project_id?: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  original_file_path?: string | null;
}

export interface Announcement {
  id: number;
  title: string;
  author_identity?: string | null;
  content?: string | null;
  audience?: string | null;
  ts: string;
  original_file_path?: string | null;
}

export interface SocialPost {
  id: number;
  channel: string;
  author_identity?: string | null;
  content: string;
  ts: string;
  original_file_path?: string | null;
}

export interface Standup {
  id: number;
  standup_date: string;
  facilitator?: string | null;
  present_identities?: string | null;
  absent_identities?: string | null;
  content?: string | null;
  parsed_updates?: string | null;
  ts: string;
  original_file_path?: string | null;
}

export interface SendInboxMessageInput {
  from: string;
  to: string;
  body: string;
  subject?: string;
  priority?: string;
}

export interface CreateThreadInput {
  title: string;
  author: string;
  targetIdentities?: string[];
  initialMessage: string;
}

export interface PostThreadReplyInput {
  from: string;
  body: string;
}

export interface CreateAnnouncementInput {
  title: string;
  author: string;
  content: string;
  audience?: string;
}

export interface CreateSocialPostInput {
  channel: string;
  author: string;
  content: string;
}

export interface CreateStandupInput {
  standup_date: string;
  facilitator?: string;
  present_identities?: string[];
  absent_identities?: string[];
  content: string;
  parsed_updates?: string;
}

export interface AiExplainInput {
  text: string;
  contextType?: 'instruction' | 'technical' | 'blocker' | 'summary';
  agentId?: string;
}

export interface AiGenerateResponse {
  text: string;
  model: string;
}

// ---------------------------------------------------------------- Strategic OKRs

export interface OkrObjective {
  id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  quarter: string;
  progress_percent: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface OkrKeyResult {
  id: string;
  objective_id: string;
  title: string;
  metric_type: 'percentage' | 'numeric' | 'boolean' | 'binary';
  current_value: number;
  target_value: number;
  unit: string | null;
  progress_percent: number;
  telemetry_query: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveOkrObjectiveInput {
  id?: string;
  title: string;
  description?: string;
  owner_id?: string;
  quarter?: string;
  status?: 'on_track' | 'at_risk' | 'behind' | 'completed';
}

export interface SaveOkrKeyResultInput {
  id?: string;
  objective_id: string;
  title: string;
  metric_type?: 'percentage' | 'numeric' | 'boolean' | 'binary';
  current_value?: number;
  target_value?: number;
  unit?: string;
  telemetry_query?: string;
}

export interface UpdateOkrProgressInput {
  current_value: number;
}

export interface RealityAuditSummary {
  healthScore: number;
  totalObjectives: number;
  totalKeyResults: number;
  avgOkrProgress: number;
  verifiedEvidenceCount: number;
  totalEvidenceCount: number;
  activeJobsCount: number;
  lastAuditTs: string;
}

// ---------------------------------------------------------------- Project Tasks & Sprint Management

export type ProjectTaskStatus = 'open' | 'claimed' | 'in_progress' | 'blocked' | 'in_review' | 'done' | 'failed' | 'unresolved';
export type ProjectTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ProjectTask {
  id: string;
  projectId: string | null;
  milestoneId: string | null;
  okrKrId: string | null;
  title: string;
  description: string | null;
  creator: string | null;
  assigneeId: string | null;
  requiredCapabilities: string[];
  priority: ProjectTaskPriority;
  status: ProjectTaskStatus;
  repo: string | null;
  branch: string | null;
  dependencies: string[];
  acceptanceCriteria: string[];
  artifacts: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectTaskInput {
  id?: string;
  projectId?: string | null;
  milestoneId?: string | null;
  okrKrId?: string | null;
  title: string;
  description?: string | null;
  creator?: string | null;
  assigneeId?: string | null;
  priority?: ProjectTaskPriority;
  status?: ProjectTaskStatus;
  repo?: string | null;
  branch?: string | null;
}

export interface UpdateProjectTaskInput {
  title?: string;
  description?: string | null;
  projectId?: string | null;
  assigneeId?: string | null;
  priority?: ProjectTaskPriority;
  status?: ProjectTaskStatus;
  repo?: string | null;
  branch?: string | null;
}

export interface Milestone {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
}



