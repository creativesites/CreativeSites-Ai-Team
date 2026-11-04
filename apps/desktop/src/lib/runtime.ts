import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  CreateSkillPayload,
  Engagement,
  KnowledgeDocument,
  KnowledgeList,
  LatestStandup,
  ModelRegistryRow,
  ScheduleRunRow,
  SkillDetail,
  SkillList,
  TimeInterval,
  TimelineItem,
  TimeSummary,
  Timesheet,
  UploadKnowledgePayload,
} from '@/lib/wp11-types';
import type {
  AccountWeeklyUsage,
  AiAccount,
  AiAccountWithSnapshot,
  AiLimitSnapshot,
  AiSnapshotInput,
  CreateAiAccountInput,
  UsageAlertRecord,
  UsageEstimateRow,
} from '@runtime/usage-types';
import type {
  AdapterInfo,
  AgentSchedule,
  AgentWake,
  Approval,
  Blocker,
  NeedsYouItem,
  ApprovalPolicy,
  ApproveDesignFrameInput,
  ApproveDesignFrameResult,
  BridgeStatus,
  BridgeSyncResult,
  Budget,
  Council,
  CouncilCard,
  CouncilSessionPayload,
  CouncilSessionSummary,
  CouncilStreamEvent,
  CouncilVerdict,
  CreateApprovalInput,
  AiGenerateResponse,
  Announcement,
  ChatMessage,
  CreateAnnouncementInput,
  CreateBudgetInput,
  CreateCouncilInput,
  CreateCouncilCardInput,
  CreateCriterionInput,
  CreateDesignBoardInput,
  CreateDesignFrameInput,
  CreateDesignRequestInput,
  CreateEvidenceInput,
  CreateIdentityInput,
  CreateIntakeInput,
  CreateJobInput,
  CreatePolicyInput,
  CreateProjectFolderInput,
  CreateProjectInput,
  CreateRepoInput,
  CreateRoomInput,
  CreateScheduleInput,
  CreateSocialPostInput,
  CreateStandupInput,
  IntakeResult,
  CreateTaskInput,
  CreateTeamInput,
  CreateThreadInput,
  DecideApprovalInput,
  DesignBoard,
  DesignFrame,
  DesignFrameStatus,
  DesignRequestResult,
  DirectoryListing,
  Evidence,
  DesignRun,
  StartDesignRunInput,
  GitBranchItem,
  GitCommitItem,
  GitDiffSummary,
  GitWorktreeItem,
  Health,
  Identity,
  IdentityStatusState,
  JobDetail,
  JobKind,
  JobPlan,
  JobStage,
  JobStageHistory,
  JobSummary,
  Message,
  OkrKeyResult,
  OkrObjective,
  PickFolderResult,
  PostMessageInput,
  PostThreadReplyInput,
  Milestone,
  Project,
  ProjectFileContent,
  ProjectFileItem,
  ProjectTask,
  CreateProjectTaskInput,
  UpdateProjectTaskInput,
  RateLimitReportInput,
  RealityAuditSummary,
  Repo,
  Room,
  RoomMember,
  RunCouncilInput,
  RuntimeEvent,
  SaveOkrKeyResultInput,
  SaveOkrObjectiveInput,
  UpdateOkrProgressInput,
  SearchHit,
  SendInboxMessageInput,
  Session,
  SessionRotationResult,
  Settings,
  ShipJobInput,
  ShipJobResult,
  SocialPost,
  SpawnAgentInput,
  Standup,
  Summary,
  Task,
  Team,
  TeamMember,
  Thread,
  TranscriptEntry,
  UpdateDesignBoardInput,
  UpdateDesignFrameInput,
  UpdateIdentityInput,
  UpdatePolicyInput,
  UpdateProjectInput,
  UpdateScheduleInput,
  UpdateTaskInput,
  TransitionTaskInput,
  VerifyEvidenceInput,
  WakeAgentInput,
  WakeAgentResult,
  WorkspaceState,
  WorktreeFile,
} from '@runtime/types';

// The desktop's only way to the data: the runtime's local API. The desktop
// never opens the database and never calls an AI model itself.

export interface RuntimeConnection {
  url: string;
  token: string;
}

export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'connected'; connection: RuntimeConnection; health: Health; ownerKey?: OwnerKeyStatus }
  | { status: 'unavailable'; reason: string };

export type {
  Milestone,
  ProjectTask,
  CreateProjectTaskInput,
  UpdateProjectTaskInput,
  OkrObjective,
  OkrKeyResult,
  RealityAuditSummary,
  SaveOkrKeyResultInput,
  SaveOkrObjectiveInput,
  UpdateOkrProgressInput,
};

/**
 * Finds the running runtime. In the desktop app the Rust side reads
 * ~/.myaos/runtime.json (starting the runtime first if needed). In a plain
 * browser during development, a dev-only Vite route serves the same file.
 */
export async function discoverRuntime(): Promise<RuntimeConnection> {
  if (isTauri()) return invoke<RuntimeConnection>('runtime_connection');
  if (import.meta.env.DEV) {
    const res = await fetch('/__myaos/runtime');
    if (res.ok) return (await res.json()) as RuntimeConnection;
    throw new Error(await res.text());
  }
  throw new Error('The runtime can only be reached from the MyaOS desktop app.');
}

export class RuntimeError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface OwnerKeyStatus {
  /** 'ok': enrolled with this app's key; 'mismatch': a different key is enrolled; 'unavailable': not in the desktop app or Keychain failed. */
  state: 'ok' | 'mismatch' | 'unavailable';
  fingerprint: string | null;
  detail?: string;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class RuntimeClient {
  connection: RuntimeConnection;
  /** Owner key from the macOS Keychain (security review S1); sent only to the runtime on loopback. */
  private ownerKey: string | null = null;

  constructor(connection: RuntimeConnection) {
    this.connection = connection;
  }

  private async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', path: string, body?: unknown): Promise<T> {
    const doFetch = async (conn: RuntimeConnection) =>
      fetch(`${conn.url}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${conn.token}`,
          ...(this.ownerKey ? { 'X-MyaOS-Owner-Key': this.ownerKey } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    let res: Response;
    try {
      res = await doFetch(this.connection);
      if (res.status === 401) {
        const fresh = await discoverRuntime().catch(() => null);
        if (fresh && (fresh.url !== this.connection.url || fresh.token !== this.connection.token)) {
          this.connection = fresh;
          res = await doFetch(this.connection);
        }
      }
    } catch (err) {
      const fresh = await discoverRuntime().catch(() => null);
      if (fresh) {
        this.connection = fresh;
        res = await doFetch(this.connection);
      } else {
        throw err;
      }
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new RuntimeError(res.status, data.error ?? `HTTP ${res.status}`);
    return data as T;
  }

  /**
   * Loads the owner key from the Keychain and enrols its hash with the runtime once. If the runtime
   * already has a different key enrolled, report a mismatch: something else enrolled first.
   */
  async ensureOwnerKey(): Promise<OwnerKeyStatus> {
    if (!isTauri()) return { state: 'unavailable', fingerprint: null, detail: 'Owner key needs the desktop app' };
    let key: string;
    try {
      key = await invoke<string>('owner_key');
    } catch (e) {
      return { state: 'unavailable', fingerprint: null, detail: e instanceof Error ? e.message : String(e) };
    }
    const keyHash = await sha256Hex(key);
    const mine = keyHash.slice(0, 16).replace(/(.{4})(?=.)/g, '$1-');
    const status = await this.request<{ enrolled: boolean; fingerprint: string | null }>('GET', '/v1/owner-key');
    if (!status.enrolled) {
      await this.request('POST', '/v1/owner-key', { keyHash });
      this.ownerKey = key;
      return { state: 'ok', fingerprint: mine };
    }
    if (status.fingerprint === mine) {
      this.ownerKey = key;
      return { state: 'ok', fingerprint: mine };
    }
    return {
      state: 'mismatch',
      fingerprint: status.fingerprint,
      detail: `The runtime has a different owner key enrolled (${status.fingerprint}); this app's key is ${mine}. Owner-only actions will be refused. If you did not enrol that key, reset it with the runtime stopped: node runtime/scripts/owner-key.ts reset`,
    };
  }

  health = () => this.request<Health>('GET', '/health');
  summary = () => this.request<Summary>('GET', '/v1/summary');
  identities = () => this.request<Identity[]>('GET', '/v1/identities');
  createIdentity = (input: CreateIdentityInput) => this.request<Identity>('POST', '/v1/identities', input);
  updateIdentity = (id: string, input: UpdateIdentityInput) =>
    this.request<Identity>('POST', `/v1/identities/${encodeURIComponent(id)}`, input);
  rooms = () => this.request<Room[]>('GET', '/v1/rooms');
  createRoom = (input: CreateRoomInput) => this.request<Room>('POST', '/v1/rooms', input);
  messages = (roomId: string) => this.request<Message[]>('GET', `/v1/rooms/${encodeURIComponent(roomId)}/messages`);
  postMessage = (roomId: string, input: PostMessageInput) =>
    this.request<Message>('POST', `/v1/rooms/${encodeURIComponent(roomId)}/messages`, input);
  jobs = () => this.request<JobSummary[]>('GET', '/v1/jobs');
  job = (jobId: string) => this.request<JobDetail>('GET', `/v1/jobs/${encodeURIComponent(jobId)}`);
  /** Unified intake (WP2): keeps the raw request, triages it, and creates one job or links a duplicate. */
  intake = (input: CreateIntakeInput) => this.request<IntakeResult>('POST', '/v1/intake', input);
  createJob = (input: CreateJobInput) => this.request<JobDetail>('POST', '/v1/jobs', input);
  sessions = () => this.request<Session[]>('GET', '/v1/sessions');
  search = (q: string, limit = 8) => this.request<SearchHit[]>('GET', `/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  adapters = (probe = false) => this.request<AdapterInfo[]>('GET', `/v1/adapters${probe ? '?probe=1' : ''}`);
  adaptersEnv = () =>
    this.request<{ hasAntigravityKey: boolean; hasGeminiKey: boolean; hasOpenaiKey: boolean; hasAnthropicKey: boolean; keys: string[] }>(
      'GET',
      '/v1/adapters/env'
    );
  setAdapterEnv = (key: string, value: string) =>
    this.request<AdapterInfo[]>('POST', '/v1/adapters/env', { key, value });
  batchSetIdentityRuntime = (runtime: string, unassignedOnly = true, identityIds?: string[]) =>
    this.request<{ updated: number }>('POST', '/v1/identities/batch-runtime', { runtime, unassignedOnly, identityIds });

  // ---- settings / teams / projects / workspaces
  settings = () => this.request<Settings>('GET', '/v1/settings');
  updateSettings = (patch: Settings) => this.request<Settings>('POST', '/v1/settings', patch);
  teams = () => this.request<Team[]>('GET', '/v1/teams');
  createTeam = (input: CreateTeamInput) => this.request<Team>('POST', '/v1/teams', input);
  team = (id: string) => this.request<Team>('GET', `/v1/teams/${encodeURIComponent(id)}`);
  teamMembers = (id: string) => this.request<TeamMember[]>('GET', `/v1/teams/${encodeURIComponent(id)}/members`);
  addTeamMember = (id: string, memberId: string, role?: string) =>
    this.request<TeamMember>('POST', `/v1/teams/${encodeURIComponent(id)}/members`, { memberId, role });
  removeTeamMember = (id: string, memberId: string) =>
    this.request<unknown>('DELETE', `/v1/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`);

  pickFolder = (defaultPath?: string) =>
    this.request<PickFolderResult>('POST', '/v1/system/pick-folder', { defaultPath });
  systemDirectories = (dirPath?: string) =>
    this.request<DirectoryListing>(
      'GET',
      `/v1/system/directories${dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''}`
    );
  projects = () => this.request<Project[]>('GET', '/v1/projects');
  project = (id: string) => this.request<Project>('GET', `/v1/projects/${encodeURIComponent(id)}`);
  projectStatus = (id: string) =>
    this.request<{ project: Project; repos: { repo: Repo; state: WorkspaceState }[] }>(
      'GET',
      `/v1/projects/${encodeURIComponent(id)}/status`
    );
  projectBranches = (projectId: string, root?: string) =>
    this.request<GitBranchItem[]>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/branches${root ? `?root=${encodeURIComponent(root)}` : ''}`
    );
  projectCommits = (projectId: string, limit = 15, branch?: string, root?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (branch) params.set('branch', branch);
    if (root) params.set('root', root);
    const qs = params.toString();
    return this.request<GitCommitItem[]>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/commits${qs ? `?${qs}` : ''}`
    );
  };
  projectDiff = (
    projectId: string,
    branch?: string,
    base?: string,
    mode?: 'working' | 'compare',
    root?: string
  ) => {
    const params = new URLSearchParams();
    if (branch) params.set('branch', branch);
    if (base) params.set('base', base);
    if (mode) params.set('mode', mode);
    if (root) params.set('root', root);
    const qs = params.toString();
    return this.request<GitDiffSummary>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/diff${qs ? `?${qs}` : ''}`
    );
  };
  projectFiles = (projectId: string, subPath = '', limit = 150, root?: string) =>
    this.request<ProjectFileItem[]>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/files?path=${encodeURIComponent(subPath)}&limit=${limit}${root ? `&root=${encodeURIComponent(root)}` : ''}`
    );
  projectFileContent = (projectId: string, filePath: string, root?: string) =>
    this.request<ProjectFileContent>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(filePath)}${root ? `&root=${encodeURIComponent(root)}` : ''}`
    );
  projectWorktrees = (projectId: string, root?: string) =>
    this.request<GitWorktreeItem[]>(
      'GET',
      `/v1/projects/${encodeURIComponent(projectId)}/worktrees${root ? `?root=${encodeURIComponent(root)}` : ''}`
    );
  createProject = (input: CreateProjectInput) => this.request<Project>('POST', '/v1/projects', input);
  updateProject = (id: string, input: UpdateProjectInput) =>
    this.request<Project>('POST', `/v1/projects/${encodeURIComponent(id)}`, input);
  attachProject = (input: { path: string; name?: string; defaultBranch?: string; teamId?: string }) =>
    this.request<{ project: Project; state: WorkspaceState }>('POST', '/v1/projects/attach', input);
  cloneProject = (input: { url: string; parentDir?: string; name?: string; teamId?: string }) =>
    this.request<{ project: Project; state: WorkspaceState }>('POST', '/v1/projects/clone', input);
  createProjectFolder = (input: CreateProjectFolderInput) =>
    this.request<{ project: Project; state: WorkspaceState }>('POST', '/v1/projects/create-folder', input);
  addRepo = (projectId: string, input: CreateRepoInput) =>
    this.request<Repo>('POST', `/v1/projects/${encodeURIComponent(projectId)}/repos`, input);
  removeRepo = (repoId: string) => this.request<unknown>('DELETE', `/v1/repos/${encodeURIComponent(repoId)}`);

  // ---- project tasks & sprint management
  projectTasks = (filter: { projectId?: string; status?: string; priority?: string; assigneeId?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== '') q.set(k, String(v));
    const suffix = q.toString() ? `?${q}` : '';
    return this.request<ProjectTask[]>('GET', `/v1/project-tasks${suffix}`);
  };
  projectTask = (id: string) => this.request<ProjectTask>('GET', `/v1/project-tasks/${encodeURIComponent(id)}`);
  createProjectTask = (input: CreateProjectTaskInput) => this.request<ProjectTask>('POST', '/v1/project-tasks', input);
  updateProjectTask = (id: string, input: UpdateProjectTaskInput) =>
    this.request<ProjectTask>('PATCH', `/v1/project-tasks/${encodeURIComponent(id)}`, input);
  deleteProjectTask = (id: string) => this.request<unknown>('DELETE', `/v1/project-tasks/${encodeURIComponent(id)}`);
  milestones = (projectId?: string) =>
    this.request<Milestone[]>('GET', `/v1/milestones${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);

  // ---- strategic okrs
  okrs = () => this.request<{ objectives: OkrObjective[]; keyResults: OkrKeyResult[] }>('GET', '/v1/okrs');
  saveOkrObjective = (input: SaveOkrObjectiveInput) => this.request<OkrObjective>('POST', '/v1/okrs/objectives', input);
  deleteOkrObjective = (id: string) => this.request<unknown>('DELETE', `/v1/okrs/objectives/${encodeURIComponent(id)}`);
  saveOkrKeyResult = (input: SaveOkrKeyResultInput) => this.request<OkrKeyResult>('POST', '/v1/okrs/key-results', input);
  deleteOkrKeyResult = (id: string) => this.request<unknown>('DELETE', `/v1/okrs/key-results/${encodeURIComponent(id)}`);
  updateOkrProgress = (krId: string, currentValue: number) =>
    this.request<{ keyResult: OkrKeyResult; objective: OkrObjective }>('POST', `/v1/okrs/key-results/${encodeURIComponent(krId)}/progress`, { current_value: currentValue });
  // WP9 time ledger. Owner-only writes: the client already sends the owner key.
  timeIntervals = (q: { from?: string; to?: string; identityId?: string; jobId?: string; actorKind?: string } = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    return this.request<TimeInterval[]>('GET', `/v1/time/intervals${p.toString() ? `?${p}` : ''}`);
  };
  startTimer = (input: { category: string; jobId?: string; engagementId?: string }) => this.request<TimeInterval>('POST', '/v1/time/timer/start', input);
  stopTimer = () => this.request<TimeInterval>('POST', '/v1/time/timer/stop', {});
  addTimeEntry = (input: { startedAt: string; endedAt: string; category: string; engagementId?: string; note?: string }) =>
    this.request<TimeInterval>('POST', '/v1/time/entries', input);
  adjustInterval = (id: string, input: { deltaMs: number; note: string }) =>
    this.request<TimeInterval>('POST', `/v1/time/intervals/${encodeURIComponent(id)}/adjust`, input);
  timeSummary = (from: string, to: string, engagementId?: string) =>
    this.request<TimeSummary>('GET', `/v1/time/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${engagementId ? `&engagementId=${encodeURIComponent(engagementId)}` : ''}`);
  engagements = () => this.request<Engagement[]>('GET', '/v1/engagements');
  timesheets = (engagementId?: string) => this.request<Timesheet[]>('GET', `/v1/timesheets${engagementId ? `?engagementId=${encodeURIComponent(engagementId)}` : ''}`);
  draftTimesheet = (engagementId: string, periodStart: string) => this.request<Timesheet>('POST', '/v1/timesheets', { engagementId, periodStart });
  submitTimesheet = (id: string) => this.request<Timesheet>('POST', `/v1/timesheets/${encodeURIComponent(id)}/submit`, {});
  approveTimesheet = (id: string) => this.request<Timesheet>('POST', `/v1/timesheets/${encodeURIComponent(id)}/approve`, {});
  exportTimesheet = (id: string) => this.request<{ csv: string; hash: string; reconciles: boolean }>('GET', `/v1/timesheets/${encodeURIComponent(id)}/export`);

  // WP8 skills, WP6 stand-ups, WP11 timeline and model registry.
  skills = () => this.request<SkillList>('GET', '/v1/skills');
  skill = (id: string) => this.request<SkillDetail>('GET', `/v1/skills/${encodeURIComponent(id)}`);
  createSkill = (input: CreateSkillPayload) => this.request<SkillDetail>('POST', '/v1/skills', input);
  updateSkill = (id: string, input: Partial<CreateSkillPayload>) => this.request<SkillDetail>('PATCH', `/v1/skills/${encodeURIComponent(id)}`, input);
  deleteSkill = (id: string) => this.request<{ success: boolean; deleted: boolean; id: string }>('DELETE', `/v1/skills/${encodeURIComponent(id)}`);
  uploadSkill = (filename: string, content: string, base64?: string) => this.request<SkillDetail>('POST', '/v1/skills/upload', { filename, content, base64 });
  reloadSkills = () => this.request<{ root: string | null; found: number; added: number; unchanged: number; skipped: { path: string; reason: string }[] }>('POST', '/v1/skills/reload', {});

  // Knowledge & Documents Library
  knowledgeDocuments = (params?: { category?: string; projectId?: string; q?: string }) => {
    const q = new URLSearchParams();
    if (params?.category) q.set('category', params.category);
    if (params?.projectId) q.set('projectId', params.projectId);
    if (params?.q) q.set('q', params.q);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<KnowledgeList>('GET', `/v1/knowledge${qs}`);
  };
  knowledgeDocument = (id: string) => this.request<KnowledgeDocument>('GET', `/v1/knowledge/${encodeURIComponent(id)}`);
  uploadKnowledgeFile = (input: UploadKnowledgePayload) => this.request<KnowledgeDocument>('POST', '/v1/knowledge/upload', input);
  deleteKnowledgeDocument = (id: string) => this.request<{ success: boolean; id: string }>('DELETE', `/v1/knowledge/${encodeURIComponent(id)}`);
  latestStandup = () => this.request<LatestStandup | null>('GET', '/v1/standups/latest');
  runStandupNow = () => this.request<{ existing: boolean; run: unknown }>('POST', '/v1/standups/run-now', {});
  scheduleRuns = (scheduleId?: string, limit = 50) =>
    this.request<ScheduleRunRow[]>('GET', `/v1/schedules/runs?limit=${limit}${scheduleId ? `&scheduleId=${encodeURIComponent(scheduleId)}` : ''}`);
  jobTimeline = (jobId: string) => this.request<TimelineItem[]>('GET', `/v1/jobs/${encodeURIComponent(jobId)}/timeline`);
  modelRegistry = () => this.request<ModelRegistryRow[]>('GET', '/v1/model-registry');
  realityAudit = () => this.request<RealityAuditSummary>('GET', '/v1/okrs/reality-audit');

  // ---- subscription AI usage (K6/K9)
  aiAccounts = () => this.request<AiAccountWithSnapshot[]>('GET', '/v1/ai-accounts');
  createAiAccount = (input: CreateAiAccountInput) => this.request<AiAccount>('POST', '/v1/ai-accounts', input);
  addAiSnapshot = (accountId: string, input: AiSnapshotInput) =>
    this.request<{ snapshot: AiLimitSnapshot; alert: UsageAlertRecord | null }>(
      'POST',
      `/v1/ai-accounts/${encodeURIComponent(accountId)}/snapshots`,
      input
    );
  aiSnapshots = (accountId: string) =>
    this.request<AiLimitSnapshot[]>('GET', `/v1/ai-accounts/${encodeURIComponent(accountId)}/snapshots`);
  weeklyUsage = () => this.request<AccountWeeklyUsage[]>('GET', '/v1/usage/weekly');
  usageEstimates = () => this.request<UsageEstimateRow[]>('GET', '/v1/usage/estimates');
  ackUsageAlert = (id: string) => this.request<UsageAlertRecord>('POST', `/v1/usage/alerts/${encodeURIComponent(id)}/ack`, {});

  room = (id: string) => this.request<Room>('GET', `/v1/rooms/${encodeURIComponent(id)}`);
  updateRoom = (id: string, input: { name?: string; projectId?: string | null; teamId?: string | null; archived?: boolean }) =>
    this.request<Room>('POST', `/v1/rooms/${encodeURIComponent(id)}`, input);
  roomMembers = (id: string) => this.request<RoomMember[]>('GET', `/v1/rooms/${encodeURIComponent(id)}/members`);
  addRoomMember = (id: string, memberId: string, kind: 'human' | 'agent' = 'agent', role = 'member') =>
    this.request<RoomMember>('POST', `/v1/rooms/${encodeURIComponent(id)}/members`, { memberId, kind, role });
  removeRoomMember = (id: string, memberId: string) =>
    this.request<unknown>('DELETE', `/v1/rooms/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`);

  // ---- job lifecycle
  jobsFiltered = (filter: { roomId?: string; projectId?: string; stage?: JobStage; limit?: number } = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== '') q.set(k, String(v));
    const suffix = q.toString() ? `?${q}` : '';
    return this.request<JobSummary[]>('GET', `/v1/jobs${suffix}`);
  };
  updateJob = (id: string, input: { title?: string; brief?: string; risk?: string; priority?: string; budgetCents?: number | null; blockedReason?: string | null; kind?: JobKind }) =>
    this.request<JobDetail>('PATCH', `/v1/jobs/${encodeURIComponent(id)}`, input);
  archiveJob = (id: string, archive: boolean, actorId = 'owner') =>
    this.request<JobDetail>('POST', `/v1/jobs/${encodeURIComponent(id)}/${archive ? 'archive' : 'unarchive'}`, { actorId });
  deleteJob = (id: string, actorId = 'owner') =>
    this.request<unknown>('DELETE', `/v1/jobs/${encodeURIComponent(id)}?confirm=${encodeURIComponent(id)}&actorId=${encodeURIComponent(actorId)}`);
  linkJobToKr = (id: string, krId: string | null, actorId = 'owner') =>
    this.request<{ jobId: string; krId: string | null }>('POST', `/v1/jobs/${encodeURIComponent(id)}/kr-link`, { krId, actorId });
  transitionJob = (id: string, input: { to: JobStage; actorId: string; actorKind?: 'human' | 'agent' | 'system'; note?: string; force?: boolean }) =>
    this.request<JobDetail>('POST', `/v1/jobs/${encodeURIComponent(id)}/stage`, input);
  setPlan = (id: string, plan: JobPlan, actorId: string) =>
    this.request<JobDetail>('POST', `/v1/jobs/${encodeURIComponent(id)}/plan`, { plan, actorId });
  acceptPlan = (id: string, actorId: string) =>
    this.request<JobDetail>('POST', `/v1/jobs/${encodeURIComponent(id)}/plan/accept`, { actorId });
  jobHistory = (id: string) => this.request<JobStageHistory[]>('GET', `/v1/jobs/${encodeURIComponent(id)}/history`);
  jobBudget = (id: string) =>
    this.request<{ configured: boolean; source: string | null; limitCents: number | null; spentCents: number; remainingCents: number | null }>(
      'GET',
      `/v1/jobs/${encodeURIComponent(id)}/budget`
    );
  addCriterion = (id: string, input: CreateCriterionInput) =>
    this.request<unknown>('POST', `/v1/jobs/${encodeURIComponent(id)}/criteria`, input);
  updateCriterion = (criterionId: string, input: { text?: string; position?: number }) =>
    this.request<unknown>('PATCH', `/v1/criteria/${encodeURIComponent(criterionId)}`, input);
  deleteCriterion = (criterionId: string) => this.request<unknown>('DELETE', `/v1/criteria/${encodeURIComponent(criterionId)}`);
  tasks = (jobId: string) => this.request<Task[]>('GET', `/v1/jobs/${encodeURIComponent(jobId)}/tasks`);
  createTask = (jobId: string, input: CreateTaskInput) =>
    this.request<Task>('POST', `/v1/jobs/${encodeURIComponent(jobId)}/tasks`, input);
  updateTask = (taskId: string, input: UpdateTaskInput) =>
    this.request<Task>('PATCH', `/v1/tasks/${encodeURIComponent(taskId)}`, input);
  /** Status changes go through the K3 state machine (PATCH no longer accepts `status`). */
  transitionTask = (taskId: string, input: TransitionTaskInput) =>
    this.request<Task>('POST', `/v1/tasks/${encodeURIComponent(taskId)}/transition`, input);
  evidence = (jobId: string) => this.request<Evidence[]>('GET', `/v1/jobs/${encodeURIComponent(jobId)}/evidence`);
  runCheck = (jobId: string, taskId: string) =>
    this.request<{ result: { exitCode: number | null; stdout: string; stderr: string }; evidence: Evidence }>(
      'POST',
      `/v1/jobs/${encodeURIComponent(jobId)}/checks`,
      { taskId }
    );
  commitJob = (jobId: string, message?: string) =>
    this.request<{ committed: boolean; commitSha: string; evidence: Evidence | null }>(
      'POST',
      `/v1/jobs/${encodeURIComponent(jobId)}/commit`,
      { message }
    );
  verifyJob = (jobId: string, actorId: string, taskIds?: string[]) =>
    this.request<{
      ok: boolean;
      base: string;
      results: { taskId: string; ok: boolean; exitCode: number | null; evidenceId: string | null; error: string | null }[];
    }>('POST', `/v1/jobs/${encodeURIComponent(jobId)}/verify`, { actorId, taskIds });
  appendEvidence = (jobId: string, input: CreateEvidenceInput) =>
    this.request<Evidence>('POST', `/v1/jobs/${encodeURIComponent(jobId)}/evidence`, input);
  verifyEvidence = (evidenceId: string, input: VerifyEvidenceInput) =>
    this.request<Evidence>('POST', `/v1/evidence/${encodeURIComponent(evidenceId)}/verify`, input);
  createApproval = (input: CreateApprovalInput) => this.request<Approval>('POST', `/v1/jobs/${encodeURIComponent(input.jobId)}/approvals`, input);
  approvals = (filter: { status?: string; jobId?: string; assignedTo?: string } = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v) q.set(k, String(v));
    return this.request<Approval[]>('GET', `/v1/approvals${q.toString() ? `?${q}` : ''}`);
  };
  approval = (id: string) => this.request<Approval>('GET', `/v1/approvals/${encodeURIComponent(id)}`);
  decideApproval = (id: string, input: DecideApprovalInput) =>
    this.request<Approval>('POST', `/v1/approvals/${encodeURIComponent(id)}/decision`, input);
  needsYou = () => this.request<NeedsYouItem[]>('GET', '/v1/needs-you');
  blockers = (status?: 'open' | 'resolved') => this.request<Blocker[]>('GET', `/v1/blockers${status ? `?status=${status}` : ''}`);
  resolveBlocker = (id: string, resolvedBy: string) =>
    this.request<Blocker>('POST', `/v1/blockers/${encodeURIComponent(id)}/resolve`, { resolvedBy });
  policies = () => this.request<ApprovalPolicy[]>('GET', '/v1/policies');
  createPolicy = (input: CreatePolicyInput) => this.request<ApprovalPolicy>('POST', '/v1/policies', input);
  updatePolicy = (id: string, input: UpdatePolicyInput) =>
    this.request<ApprovalPolicy>('PATCH', `/v1/policies/${encodeURIComponent(id)}`, input);
  deletePolicy = (id: string) => this.request<unknown>('DELETE', `/v1/policies/${encodeURIComponent(id)}`);
  budgets = () => this.request<Budget[]>('GET', '/v1/budgets');
  createBudget = (input: CreateBudgetInput) => this.request<Budget>('POST', '/v1/budgets', input);

  // ---- sessions / transcript / terminal output
  startSession = (jobId: string, input: { agentId: string; adapterId?: string; taskId?: string; prompt?: string; mode?: string }) =>
    this.request<Session>('POST', `/v1/jobs/${encodeURIComponent(jobId)}/sessions`, input);
  session = (id: string) => this.request<Session>('GET', `/v1/sessions/${encodeURIComponent(id)}`);
  cancelSession = (id: string, actorId: string) =>
    this.request<Session>('POST', `/v1/sessions/${encodeURIComponent(id)}/cancel`, { actorId });
  promptSession = (id: string, text: string) =>
    this.request<{ ok: boolean; session?: Session }>('POST', `/v1/sessions/${encodeURIComponent(id)}/prompt`, { text });
  rotateSession = (id: string, input: { prompt?: string; taskId?: string; reason?: string } = {}) =>
    this.request<SessionRotationResult>('POST', `/v1/sessions/${encodeURIComponent(id)}/rotate`, input);
  sessionBaton = (id: string) =>
    this.request<{
      sessionId: string;
      generation: number;
      parentSessionId: string | null;
      supersededBySessionId: string | null;
      check: {
        rotate: boolean;
        reason: string;
        contextTokens: number;
        logicalTurns: number;
        policy: { softContextTokens: number; hardContextTokens: number; softLogicalTurns: number };
      };
      capsule: string;
      previousContextTokens: number;
      capsuleTokens: number;
    }>('GET', `/v1/sessions/${encodeURIComponent(id)}/baton`);
  transcript = (id: string, since = 0) =>
    this.request<TranscriptEntry[]>('GET', `/v1/sessions/${encodeURIComponent(id)}/transcript?since=${since}`);
  sessionFiles = (id: string) =>
    this.request<WorktreeFile[]>('GET', `/v1/sessions/${encodeURIComponent(id)}/files`);
  sessionTerminal = (id: string, since = 0) =>
    this.request<{
      sessionId: string;
      agentId: string;
      agentName: string;
      acpSessionId: string | null;
      state: string;
      worktree: string | null;
      pid: number | null;
      output: string;
    }>('GET', `/v1/sessions/${encodeURIComponent(id)}/terminal?since=${since}`);

  // ---- autonomous wakes, schedules, rate-limits, spawn & ship
  wakeAgent = (agentId: string, input: WakeAgentInput) =>
    this.request<WakeAgentResult>('POST', `/v1/agents/${encodeURIComponent(agentId)}/wake`, input);
  wakes = (filter: { targetAgentId?: string; jobId?: string; roomId?: string; status?: string } = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v) q.set(k, String(v));
    return this.request<AgentWake[]>('GET', `/v1/wakes${q.toString() ? `?${q}` : ''}`);
  };
  spawnAgent = (input: SpawnAgentInput) =>
    this.request<{ identity: Identity; wakeResult: WakeAgentResult | null }>('POST', '/v1/agents/spawn', input);
  dispatchTeamLeader = (input: { leaderId?: string; fromActorId: string; jobId?: string | null; roomId?: string | null; directive?: string; goal?: string }) =>
    this.request<WakeAgentResult>('POST', '/v1/team-leader/dispatch', {
      ...input,
      directive: input.directive ?? input.goal ?? '',
    });
  schedules = (filter: { agentId?: string; jobId?: string; roomId?: string; enabledOnly?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (filter.agentId) q.set('agentId', filter.agentId);
    if (filter.jobId) q.set('jobId', filter.jobId);
    if (filter.roomId) q.set('roomId', filter.roomId);
    if (filter.enabledOnly) q.set('enabledOnly', '1');
    return this.request<AgentSchedule[]>('GET', `/v1/schedules${q.toString() ? `?${q}` : ''}`);
  };
  createSchedule = (input: CreateScheduleInput) =>
    this.request<AgentSchedule>('POST', '/v1/schedules', input);
  updateSchedule = (id: string, input: UpdateScheduleInput) =>
    this.request<AgentSchedule>('PATCH', `/v1/schedules/${encodeURIComponent(id)}`, input);
  deleteSchedule = (id: string) =>
    this.request<unknown>('DELETE', `/v1/schedules/${encodeURIComponent(id)}`);
  tickSchedules = (asOf?: string) =>
    this.request<{ firedSchedules: string[]; clearedRateLimits: string[] }>('POST', '/v1/schedules/tick', asOf ? { asOf } : {});
  rateLimits = () =>
    this.request<{
      agents: {
        id: string;
        name: string;
        runtime: string | null;
        adapterId: string | null;
        statusState: IdentityStatusState;
        rateLimitResetAt: string | null;
        rateLimitReason: string | null;
        activeSessionId: string | null;
        acpSessionId: string | null;
      }[];
      adapters: {
        id: string;
        rateLimitResetAt: string | null;
        rateLimitReason: string | null;
      }[];
    }>('GET', '/v1/rate-limits');
  setAgentRateLimit = (agentId: string, input: RateLimitReportInput & { resumePrompt?: string }) =>
    this.request<Identity>('POST', `/v1/identities/${encodeURIComponent(agentId)}/rate-limit`, input);
  clearAgentRateLimit = (agentId: string) =>
    this.request<Identity>('POST', `/v1/identities/${encodeURIComponent(agentId)}/clear-rate-limit`, {});
  setAdapterRateLimit = (adapterId: string, input: RateLimitReportInput) =>
    this.request<AdapterInfo[]>('POST', `/v1/adapters/${encodeURIComponent(adapterId)}/rate-limit`, input);
  clearAdapterRateLimit = (adapterId: string) =>
    this.request<AdapterInfo[]>('POST', `/v1/adapters/${encodeURIComponent(adapterId)}/clear-rate-limit`, {});
  shipJob = (jobId: string, input: ShipJobInput) =>
    this.request<ShipJobResult>('POST', `/v1/jobs/${encodeURIComponent(jobId)}/ship`, input);

  // ---- runtime interactive shell terminals
  createTerminal = (cwd?: string | null, cols = 100, rows = 30) =>
    this.request<{ id: string; cwd: string; shell: string; pid: number | null; alive: boolean; createdAt: string }>(
      'POST',
      '/v1/terminals',
      { cwd, cols, rows }
    );
  writeTerminalInput = (id: string, data: string) =>
    this.request<{ ok: boolean }>('POST', `/v1/terminals/${encodeURIComponent(id)}/input`, { data });
  killTerminal = (id: string) =>
    this.request<unknown>('DELETE', `/v1/terminals/${encodeURIComponent(id)}`);
  async streamTerminal(
    id: string,
    onEvent: (ev: { type: 'data' | 'exit' | 'error'; data?: string; exitCode?: number; message?: string }) => void,
    signal: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${this.connection.url}/v1/terminals/${encodeURIComponent(id)}/stream`, {
      headers: { Authorization: `Bearer ${this.connection.token}` },
      signal,
    });
    if (!res.ok || !res.body) throw new RuntimeError(res.status, 'terminal stream refused');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('\n');
        if (!data) continue;
        const ev = JSON.parse(data);
        onEvent(ev);
      }
    }
  }

  // ---- councils
  councilRoster = () =>
    this.request<{
      board: 'default' | 'ask' | 'auto';
      default: string[];
      defaultOperators: string[];
      seats: {
        key: string;
        name: string;
        short: string;
        initials: string;
        slug: string;
        pillar: string;
        question: string;
        dimension: string;
        color: string;
        boardGroup: 'myaos' | 'operators';
        identityId?: string;
        portraitKey?: string;
      }[];
    }>('GET', '/v1/councils/roster');
  councilSessions = () =>
    this.request<{ liveId: string | null; sessions: CouncilSessionSummary[] }>('GET', '/v1/councils/sessions');
  councilSession = (id: string) =>
    this.request<CouncilSessionPayload>('GET', `/v1/councils/sessions/${encodeURIComponent(id)}`);
  councils = (jobId: string) => this.request<Council[]>('GET', `/v1/jobs/${encodeURIComponent(jobId)}/councils`);
  createCouncil = (jobId: string, input: CreateCouncilInput) =>
    this.request<Council>('POST', `/v1/jobs/${encodeURIComponent(jobId)}/councils`, input);
  runCouncil = (jobId: string, input: RunCouncilInput) =>
    this.request<{ council: Council; sessionId: string }>('POST', `/v1/jobs/${encodeURIComponent(jobId)}/councils/run`, input);
  council = (id: string) => this.request<Council>('GET', `/v1/councils/${encodeURIComponent(id)}`);
  addCouncilCard = (id: string, input: CreateCouncilCardInput) =>
    this.request<CouncilCard>('POST', `/v1/councils/${encodeURIComponent(id)}/cards`, input);
  councilVerdict = (id: string) => this.request<CouncilVerdict>('GET', `/v1/councils/${encodeURIComponent(id)}/verdict`);
  createCouncilVerdict = (id: string) => this.request<CouncilVerdict>('POST', `/v1/councils/${encodeURIComponent(id)}/verdict`);
  acceptCouncilVerdict = (id: string, input: { actorId: string; tasks?: CreateTaskInput[] }) =>
    this.request<Council>('POST', `/v1/councils/${encodeURIComponent(id)}/accept`, input);
  async streamCouncil(
    id: string,
    onEvent: (ev: CouncilStreamEvent) => void,
    signal: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${this.connection.url}/v1/councils/${encodeURIComponent(id)}/stream`, {
      headers: { Authorization: `Bearer ${this.connection.token}` },
      signal,
    });
    if (!res.ok || !res.body) throw new RuntimeError(res.status, 'council stream refused');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('\n');
        if (!data) continue;
        const ev = JSON.parse(data) as CouncilStreamEvent;
        if (ev.type === 'end') return;
        onEvent(ev);
      }
    }
  }

  // ---- bridge
  bridgeStatus = () => this.request<BridgeStatus>('GET', '/v1/bridge/status');
  mirrorJob = (jobId: string) => this.request<{ path: string }>('POST', `/v1/bridge/mirror/${encodeURIComponent(jobId)}`);
  bridgeIngest = () => this.request<{ imported: number; notes: number; replies: number; errors: string[] }>('POST', '/v1/bridge/ingest');
  bridgeSync = () => this.request<BridgeSyncResult>('POST', '/v1/bridge/sync');
  bridgeExportCouncil = (councilId: string) => this.request<{ path: string }>('POST', `/v1/bridge/export/councils/${encodeURIComponent(councilId)}`);
  bridgeExportAllCouncils = () => this.request<{ exported: number; paths: string[] }>('POST', '/v1/bridge/export/councils');
  bridgeExportShippedJob = (jobId: string) => this.request<{ threadPath: string; proposalPath: string }>('POST', `/v1/bridge/export/shipped/${encodeURIComponent(jobId)}`);
  bridgeExportShipped = () => this.request<{ exported: number; paths: string[] }>('POST', '/v1/bridge/export/shipped');

  // ---- design studio (infinite multi-frame canvas)
  designBoards = (filter: { projectId?: string; jobId?: string; roomId?: string } = {}) => {
    const q = new URLSearchParams();
    if (filter.projectId) q.set('projectId', filter.projectId);
    if (filter.jobId) q.set('jobId', filter.jobId);
    if (filter.roomId) q.set('roomId', filter.roomId);
    return this.request<DesignBoard[]>('GET', `/v1/design-boards${q.toString() ? `?${q}` : ''}`);
  };
  designBoard = (id: string) => this.request<DesignBoard>('GET', `/v1/design-boards/${encodeURIComponent(id)}`);
  createDesignBoard = (input: CreateDesignBoardInput) =>
    this.request<DesignBoard>('POST', '/v1/design-boards', input);
  updateDesignBoard = (id: string, input: UpdateDesignBoardInput) =>
    this.request<DesignBoard>('PATCH', `/v1/design-boards/${encodeURIComponent(id)}`, input);
  deleteDesignBoard = (id: string) =>
    this.request<unknown>('DELETE', `/v1/design-boards/${encodeURIComponent(id)}`);
  /** Starts an agent session that builds designs onto the board; frames appear as it writes them. */
  startDesignRun = (boardId: string, input: StartDesignRunInput) =>
    this.request<DesignRun>('POST', `/v1/design-boards/${encodeURIComponent(boardId)}/runs`, input);
  designRuns = (boardId: string) =>
    this.request<DesignRun[]>('GET', `/v1/design-boards/${encodeURIComponent(boardId)}/runs`);
  cancelDesignRun = (boardId: string, sessionId: string, actorId: string) =>
    this.request<DesignRun>(
      'POST',
      `/v1/design-boards/${encodeURIComponent(boardId)}/runs/${encodeURIComponent(sessionId)}/cancel`,
      { actorId }
    );
  dismissDesignRun = (boardId: string, sessionId: string) =>
    this.request<{ ok: boolean }>(
      'DELETE',
      `/v1/design-boards/${encodeURIComponent(boardId)}/runs/${encodeURIComponent(sessionId)}`
    );
  clearDesignRuns = (boardId: string, mode: 'failed' | 'all' = 'failed') =>
    this.request<{ ok: boolean }>(
      'DELETE',
      `/v1/design-boards/${encodeURIComponent(boardId)}/runs?mode=${encodeURIComponent(mode)}`
    );
  createDesignFrame = (boardId: string, input: Omit<CreateDesignFrameInput, 'boardId'>) =>
    this.request<DesignFrame>('POST', `/v1/design-boards/${encodeURIComponent(boardId)}/frames`, input);
  updateDesignFrame = (frameId: string, input: UpdateDesignFrameInput) =>
    this.request<DesignFrame>('PATCH', `/v1/design-frames/${encodeURIComponent(frameId)}`, input);
  deleteDesignFrame = (frameId: string) =>
    this.request<unknown>('DELETE', `/v1/design-frames/${encodeURIComponent(frameId)}`);
  /** Lifecycle move: draft|iterating -> review, review -> iterating (changes requested) or approved. */
  transitionDesignFrame = (frameId: string, to: DesignFrameStatus, actorId: string, reason?: string | null) =>
    this.request<DesignFrame>('POST', `/v1/design-frames/${encodeURIComponent(frameId)}/transition`, { to, actorId, reason: reason ?? null });
  /** A design request: a job, a linked design task and a board. */
  createDesignRequest = (input: CreateDesignRequestInput) => this.request<DesignRequestResult>('POST', '/v1/design/requests', input);
  approveDesignFrame = (frameId: string, input: ApproveDesignFrameInput) =>
    this.request<ApproveDesignFrameResult>('POST', `/v1/design-frames/${encodeURIComponent(frameId)}/approve`, input);

  // ---- communication hub
  inboxMessages = (identity = 'Winston', limit = 50) =>
    this.request<ChatMessage[]>('GET', `/v1/communication/inbox?identity=${encodeURIComponent(identity)}&limit=${limit}`);
  sendInboxMessage = (input: SendInboxMessageInput) =>
    this.request<ChatMessage>('POST', '/v1/communication/inbox', input);
  threads = () => this.request<Thread[]>('GET', '/v1/communication/threads');
  threadMessages = (threadId: string) =>
    this.request<ChatMessage[]>('GET', `/v1/communication/threads/${encodeURIComponent(threadId)}/messages`);
  createThread = (input: CreateThreadInput) =>
    this.request<Thread>('POST', '/v1/communication/threads', input);
  postThreadReply = (threadId: string, input: PostThreadReplyInput) =>
    this.request<ChatMessage>('POST', `/v1/communication/threads/${encodeURIComponent(threadId)}/replies`, input);
  announcements = (limit = 20) =>
    this.request<Announcement[]>('GET', `/v1/communication/announcements?limit=${limit}`);
  createAnnouncement = (input: CreateAnnouncementInput) =>
    this.request<Announcement>('POST', '/v1/communication/announcements', input);
  socialPosts = (channel?: string, limit = 50) =>
    this.request<SocialPost[]>(
      'GET',
      `/v1/communication/social?limit=${limit}${channel ? `&channel=${encodeURIComponent(channel)}` : ''}`
    );
  createSocialPost = (input: CreateSocialPostInput) =>
    this.request<SocialPost>('POST', '/v1/communication/social', input);
  standups = (limit = 10) =>
    this.request<Standup[]>('GET', `/v1/communication/standups?limit=${limit}`);
  createStandup = (input: CreateStandupInput) =>
    this.request<Standup>('POST', '/v1/communication/standups', input);
  generateAi = (prompt: string, contextType?: string, agentId?: string) =>
    this.request<AiGenerateResponse>('POST', '/v1/communication/ai/generate', { prompt, contextType, agentId });
  syncCommunity = () =>
    this.request<{
      threadsTotal: number;
      threadsUpdated: number;
      inboxMessagesTotal: number;
      inboxMessagesNew: number;
      announcementsTotal: number;
      standupsTotal: number;
      communityRoot: string;
      lastSyncAt: string;
    }>('POST', '/v1/communication/sync');
  communitySyncStatus = () =>
    this.request<{
      communityRoot: string;
      ok: boolean;
    }>('GET', '/v1/communication/sync');

  /**
   * Follows the event stream until `signal` aborts, resuming after the last
   * event seen. fetch is used instead of EventSource so the token stays in a
   * header rather than the URL.
   */
  async followEvents(onEvent: (e: RuntimeEvent) => void, signal: AbortSignal, since = 0): Promise<void> {
    let last = since;
    while (!signal.aborted) {
      try {
        const res = await fetch(`${this.connection.url}/v1/events`, {
          headers: { Authorization: `Bearer ${this.connection.token}`, 'Last-Event-ID': String(last) },
          signal,
        });
        if (!res.ok || !res.body) throw new RuntimeError(res.status, 'event stream refused');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let cut: number;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const data = block
              .split('\n')
              .filter((l) => l.startsWith('data: '))
              .map((l) => l.slice(6))
              .join('\n');
            if (!data) continue;
            const event = JSON.parse(data) as RuntimeEvent;
            last = event.seq;
            onEvent(event);
          }
        }
      } catch {
        if (signal.aborted) return;
        const fresh = await discoverRuntime().catch(() => null);
        if (fresh) this.connection = fresh;
      }
      // Stream ended or failed: wait a moment, then resume where it left off.
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
