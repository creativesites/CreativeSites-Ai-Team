import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  AdapterInfo,
  Approval,
  ApprovalPolicy,
  BridgeStatus,
  Budget,
  Council,
  CouncilCard,
  CouncilSessionPayload,
  CouncilSessionSummary,
  CouncilStreamEvent,
  CouncilVerdict,
  CreateApprovalInput,
  CreateBudgetInput,
  CreateCouncilInput,
  CreateCouncilCardInput,
  CreateCriterionInput,
  CreateEvidenceInput,
  CreateIdentityInput,
  CreateJobInput,
  CreatePolicyInput,
  CreateProjectFolderInput,
  CreateProjectInput,
  CreateRepoInput,
  CreateRoomInput,
  CreateTaskInput,
  CreateTeamInput,
  DecideApprovalInput,
  Evidence,
  Health,
  Identity,
  JobDetail,
  JobPlan,
  JobStage,
  JobStageHistory,
  JobSummary,
  Message,
  PostMessageInput,
  Project,
  Repo,
  Room,
  RoomMember,
  RunCouncilInput,
  RuntimeEvent,
  Session,
  Settings,
  Summary,
  Task,
  Team,
  TeamMember,
  TranscriptEntry,
  UpdateIdentityInput,
  UpdatePolicyInput,
  UpdateProjectInput,
  UpdateTaskInput,
  VerifyEvidenceInput,
  WorkspaceState,
} from '@runtime/types';

// The desktop's only way to the data: the runtime's local API. The desktop
// never opens the database and never calls an AI model itself.

export interface RuntimeConnection {
  url: string;
  token: string;
}

export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'connected'; connection: RuntimeConnection; health: Health }
  | { status: 'unavailable'; reason: string };

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

export class RuntimeClient {
  readonly connection: RuntimeConnection;

  constructor(connection: RuntimeConnection) {
    this.connection = connection;
  }

  private async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.connection.url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.connection.token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new RuntimeError(res.status, data.error ?? `HTTP ${res.status}`);
    return data as T;
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
  createJob = (input: CreateJobInput) => this.request<JobDetail>('POST', '/v1/jobs', input);
  sessions = () => this.request<Session[]>('GET', '/v1/sessions');
  adapters = () => this.request<AdapterInfo[]>('GET', '/v1/adapters');

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

  projects = () => this.request<Project[]>('GET', '/v1/projects');
  project = (id: string) => this.request<Project>('GET', `/v1/projects/${encodeURIComponent(id)}`);
  projectStatus = (id: string) =>
    this.request<{ project: Project; repos: { repo: Repo; state: WorkspaceState }[] }>(
      'GET',
      `/v1/projects/${encodeURIComponent(id)}/status`
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
  updateJob = (id: string, input: { title?: string; brief?: string; risk?: string; priority?: string; budgetCents?: number | null; blockedReason?: string | null }) =>
    this.request<JobDetail>('PATCH', `/v1/jobs/${encodeURIComponent(id)}`, input);
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
  policies = () => this.request<ApprovalPolicy[]>('GET', '/v1/policies');
  createPolicy = (input: CreatePolicyInput) => this.request<ApprovalPolicy>('POST', '/v1/policies', input);
  updatePolicy = (id: string, input: UpdatePolicyInput) =>
    this.request<ApprovalPolicy>('PATCH', `/v1/policies/${encodeURIComponent(id)}`, input);
  deletePolicy = (id: string) => this.request<unknown>('DELETE', `/v1/policies/${encodeURIComponent(id)}`);
  budgets = () => this.request<Budget[]>('GET', '/v1/budgets');
  createBudget = (input: CreateBudgetInput) => this.request<Budget>('POST', '/v1/budgets', input);

  // ---- sessions / transcript
  startSession = (jobId: string, input: { agentId: string; adapterId?: string; taskId?: string; prompt?: string; mode?: string }) =>
    this.request<Session>('POST', `/v1/jobs/${encodeURIComponent(jobId)}/sessions`, input);
  session = (id: string) => this.request<Session>('GET', `/v1/sessions/${encodeURIComponent(id)}`);
  cancelSession = (id: string, actorId: string) =>
    this.request<Session>('POST', `/v1/sessions/${encodeURIComponent(id)}/cancel`, { actorId });
  promptSession = (id: string, text: string) =>
    this.request<{ ok: boolean }>('POST', `/v1/sessions/${encodeURIComponent(id)}/prompt`, { text });
  transcript = (id: string, since = 0) =>
    this.request<TranscriptEntry[]>('GET', `/v1/sessions/${encodeURIComponent(id)}/transcript?since=${since}`);

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
      }
      // Stream ended or failed: wait a moment, then resume where it left off.
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
