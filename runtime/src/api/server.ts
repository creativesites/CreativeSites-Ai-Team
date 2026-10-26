import crypto from 'node:crypto';
import http from 'node:http';
import type { Health, RuntimeEvent } from './types.ts';
import type * as T from './types.ts';
import { probeAdapters } from '../adapters.ts';
import {
  ConflictError,
  ForbiddenError,
  InputError,
  NotFoundError,
  type Repo,
} from '../store/repo.ts';
import * as workspaces from '../workspaces.ts';

export interface ServerOptions {
  repo: Repo;
  token: string;
  health: () => Health;
  /** Extra browser origins allowed to call the API (the desktop's dev server). */
  allowedOrigins?: string[];
  workspaceRoots: string[];
  cloneParentDir: string;
  newProjectParentDir: string;
}

export interface RuntimeServer {
  server: http.Server;
  /** Pushes an event to every connected stream. */
  broadcast: (e: RuntimeEvent) => void;
}

const MAX_BODY = 1024 * 1024;
const MAX_STREAM_BUFFER = 2 * 1024 * 1024;

// The Tauri webview's own origins. Dev servers are added through allowedOrigins.
const BASE_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Ctx {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
}

interface HandlerResult {
  status: number;
  body?: unknown;
}

type Handler = (ctx: Ctx) => Promise<HandlerResult | 'stream'> | HandlerResult | 'stream';

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  open: boolean;
  handler: Handler;
}

function route(method: string, pathTemplate: string, handler: Handler, open = false): Route {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' +
      pathTemplate.replace(/:([A-Za-z]+)/g, (_match, key: string) => {
        keys.push(key);
        return '([^/]+)';
      }) +
      '$'
  );
  return { method, pattern, keys, handler, open };
}

function tokenMatches(header: string | undefined, token: string): boolean {
  const given = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'body too large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'body must be a JSON object');
  }
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${field} is required`);
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function createServer(opts: ServerOptions): RuntimeServer {
  const { repo, token } = opts;
  const origins = new Set([...BASE_ORIGINS, ...(opts.allowedOrigins ?? [])]);
  const streams = new Set<http.ServerResponse>();

  const send = (res: http.ServerResponse, status: number, body: unknown) => {
    const text = status === 204 || body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(text),
    });
    res.end(text);
  };

  const writeEvent = (res: http.ServerResponse, e: RuntimeEvent) => {
    if (res.writableLength > MAX_STREAM_BUFFER) {
      // A slow client is told to reconnect rather than growing memory forever.
      res.end();
      return;
    }
    res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  };

  const broadcast = (e: RuntimeEvent) => {
    for (const res of streams) {
      if (res.destroyed || res.writableEnded) {
        streams.delete(res);
        continue;
      }
      writeEvent(res, e);
    }
  };

  // ------------------------------------------------------------------ handlers

  const routes: Route[] = [
    route('GET', '/health', () => ({ status: 200, body: opts.health() }), true),

    route('GET', '/v1/summary', () => ({ status: 200, body: repo.summary() })),

    route('GET', '/v1/settings', () => ({ status: 200, body: repo.getSettings() })),
    route('POST', '/v1/settings', (ctx) => ({ status: 200, body: repo.updateSettings(ctx.body as T.Settings) })),

    route('GET', '/v1/events', (ctx) => events(ctx)),
    route('GET', '/v1/events/recent', (ctx) => ({
      status: 200,
      body: repo.listEvents({
        since: Number(ctx.query.get('since') ?? 0),
        type: ctx.query.get('type') ?? undefined,
        subjectId: ctx.query.get('subjectId') ?? undefined,
        subjectType: ctx.query.get('subjectType') ?? undefined,
        limit: Number(ctx.query.get('limit') ?? 1000),
      }),
    })),
    route('GET', '/v1/adapters', (ctx) => ({ status: 200, body: adapterList(ctx.query.get('probe') === '1') })),
    route('POST', '/v1/adapters/:id', (ctx) => {
      repo.upsertAdapterOverride(ctx.params.id!, ctx.body as never);
      return { status: 200, body: adapterList(true) };
    }, false),

    // identities
    route('GET', '/v1/identities', (ctx) => ({ status: 200, body: repo.listIdentities(ctx.query.get('archived') === '1') })),
    route('POST', '/v1/identities', (ctx) => ({ status: 201, body: repo.createIdentity(ctx.body as unknown as T.CreateIdentityInput) })),
    route('GET', '/v1/identities/:id', (ctx) => ({ status: 200, body: repo.getIdentity(ctx.params.id!) })),
    route('POST', '/v1/identities/:id', (ctx) => ({ status: 200, body: repo.updateIdentity(ctx.params.id!, ctx.body as T.UpdateIdentityInput) })),
    route('POST', '/v1/import/identities', (ctx) => ({ status: 200, body: repo.importIdentities(ctx.body as unknown as T.ImportIdentitiesInput) })),

    // teams
    route('GET', '/v1/teams', () => ({ status: 200, body: repo.listTeams() })),
    route('POST', '/v1/teams', (ctx) => ({ status: 201, body: repo.createTeam(ctx.body as unknown as T.CreateTeamInput) })),
    route('GET', '/v1/teams/:id', (ctx) => ({ status: 200, body: repo.getTeam(ctx.params.id!) })),
    route('POST', '/v1/teams/:id', (ctx) => ({ status: 200, body: repo.updateTeam(ctx.params.id!, ctx.body as never) })),
    route('GET', '/v1/teams/:id/members', (ctx) => ({ status: 200, body: repo.listTeamMembers(ctx.params.id!) })),
    route('POST', '/v1/teams/:id/members', (ctx) => ({
      status: 201,
      body: repo.addTeamMember(ctx.params.id!, asString(ctx.body.memberId, 'memberId'), asOptionalString(ctx.body.role) ?? 'member'),
    })),
    route('DELETE', '/v1/teams/:id/members/:memberId', (ctx) => {
      repo.removeTeamMember(ctx.params.id!, ctx.params.memberId!);
      return { status: 204 };
    }),

    // projects / repos / workspaces
    route('GET', '/v1/projects', () => ({ status: 200, body: repo.listProjects() })),
    route('POST', '/v1/projects', (ctx) => ({ status: 201, body: repo.createProject(ctx.body as unknown as T.CreateProjectInput) })),
    route('POST', '/v1/projects/attach', (ctx) => attachProject(ctx)),
    route('POST', '/v1/projects/clone', (ctx) => cloneProject(ctx)),
    route('POST', '/v1/projects/create-folder', (ctx) => createProjectFolder(ctx)),
    route('GET', '/v1/projects/:id', (ctx) => ({ status: 200, body: repo.getProject(ctx.params.id!) })),
    route('POST', '/v1/projects/:id', (ctx) => ({ status: 200, body: repo.updateProject(ctx.params.id!, ctx.body as T.UpdateProjectInput) })),
    route('GET', '/v1/projects/:id/status', (ctx) => ({ status: 200, body: projectStatus(ctx.params.id!) })),
    route('POST', '/v1/projects/:id/repos', (ctx) => ({ status: 201, body: repo.addRepo(ctx.params.id!, ctx.body as unknown as T.CreateRepoInput) })),
    route('DELETE', '/v1/repos/:id', (ctx) => {
      repo.removeRepo(ctx.params.id!);
      return { status: 204 };
    }),

    // rooms / members / messages
    route('GET', '/v1/rooms', () => ({ status: 200, body: repo.listRooms() })),
    route('POST', '/v1/rooms', (ctx) => ({ status: 201, body: repo.createRoom(ctx.body as unknown as T.CreateRoomInput) })),
    route('GET', '/v1/rooms/:id', (ctx) => ({ status: 200, body: repo.getRoom(ctx.params.id!) })),
    route('POST', '/v1/rooms/:id', (ctx) => ({ status: 200, body: repo.updateRoom(ctx.params.id!, ctx.body as never) })),
    route('GET', '/v1/rooms/:id/members', (ctx) => ({ status: 200, body: repo.listRoomMembers(ctx.params.id!) })),
    route('POST', '/v1/rooms/:id/members', (ctx) => ({ status: 201, body: repo.addRoomMember(ctx.params.id!, ctx.body as unknown as T.AddRoomMemberInput) })),
    route('DELETE', '/v1/rooms/:id/members/:memberId', (ctx) => {
      repo.removeRoomMember(ctx.params.id!, ctx.params.memberId!);
      return { status: 204 };
    }),
    route('GET', '/v1/rooms/:id/messages', (ctx) => ({
      status: 200,
      body: repo.listMessages(ctx.params.id!, Number(ctx.query.get('limit') ?? 200)),
    })),
    route('POST', '/v1/rooms/:id/messages', (ctx) => ({
      status: 201,
      body: repo.postMessage(ctx.params.id!, ctx.body as unknown as T.PostMessageInput),
    })),

    // jobs
    route('GET', '/v1/jobs', (ctx) => ({
      status: 200,
      body: repo.listJobs({
        roomId: ctx.query.get('roomId') ?? undefined,
        projectId: ctx.query.get('projectId') ?? undefined,
        stage: (ctx.query.get('stage') as T.JobStage | null) ?? undefined,
        limit: Number(ctx.query.get('limit') ?? 500),
      }),
    })),
    route('POST', '/v1/jobs', (ctx) => ({ status: 201, body: repo.createJob(ctx.body as unknown as T.CreateJobInput) })),
    route('GET', '/v1/jobs/:id', (ctx) => ({ status: 200, body: repo.getJob(ctx.params.id!) })),
    route('PATCH', '/v1/jobs/:id', (ctx) => ({ status: 200, body: repo.updateJob(ctx.params.id!, ctx.body as T.UpdateJobInput) })),
    route('POST', '/v1/jobs/:id/stage', (ctx) => ({ status: 200, body: repo.transitionJob(ctx.params.id!, ctx.body as unknown as T.TransitionJobInput) })),
    route('POST', '/v1/jobs/:id/plan', (ctx) => ({ status: 200, body: repo.setPlan(ctx.params.id!, ctx.body as unknown as T.SetPlanInput) })),
    route('POST', '/v1/jobs/:id/plan/accept', (ctx) => ({ status: 200, body: repo.acceptPlan(ctx.params.id!, asString(ctx.body.actorId, 'actorId')) })),
    route('GET', '/v1/jobs/:id/history', (ctx) => ({ status: 200, body: repo.listHistory(ctx.params.id!) })),
    route('GET', '/v1/jobs/:id/budget', (ctx) => ({ status: 200, body: repo.budget(ctx.params.id!) })),
    route('POST', '/v1/jobs/:id/budget/check', (ctx) => {
      repo.assertBudget(ctx.params.id!, Number(ctx.body.estimateCents ?? 0));
      return { status: 200, body: repo.budget(ctx.params.id!) };
    }),
    route('GET', '/v1/jobs/:id/criteria', (ctx) => ({ status: 200, body: repo.getJob(ctx.params.id!).criteria })),
    route('POST', '/v1/jobs/:id/criteria', (ctx) => ({ status: 201, body: repo.addCriterion(ctx.params.id!, ctx.body as unknown as T.CreateCriterionInput) })),
    route('PATCH', '/v1/criteria/:id', (ctx) => {
      repo.updateCriterion(ctx.params.id!, ctx.body as never);
      return { status: 200, body: { ok: true } };
    }),
    route('DELETE', '/v1/criteria/:id', (ctx) => {
      repo.deleteCriterion(ctx.params.id!);
      return { status: 204 };
    }),
    route('GET', '/v1/jobs/:id/tasks', (ctx) => ({ status: 200, body: repo.listTasks(ctx.params.id!) })),
    route('POST', '/v1/jobs/:id/tasks', (ctx) => ({ status: 201, body: repo.createTask(ctx.params.id!, ctx.body as unknown as T.CreateTaskInput) })),
    route('PATCH', '/v1/tasks/:id', (ctx) => ({ status: 200, body: repo.updateTask(ctx.params.id!, ctx.body as T.UpdateTaskInput) })),
    route('GET', '/v1/jobs/:id/evidence', (ctx) => ({ status: 200, body: repo.listEvidence({ jobId: ctx.params.id, limit: 1000 }) })),
    route('POST', '/v1/jobs/:id/evidence', (ctx) => ({
      status: 201,
      body: repo.appendEvidence({ ...(ctx.body as unknown as T.CreateEvidenceInput), jobId: ctx.params.id }),
    })),
    route('POST', '/v1/evidence/:id/verify', (ctx) => ({ status: 201, body: repo.verifyEvidence(ctx.params.id!, ctx.body as unknown as T.VerifyEvidenceInput) })),
    route('GET', '/v1/jobs/:id/approvals', (ctx) => ({ status: 200, body: repo.listApprovals({ jobId: ctx.params.id, limit: 200 }) })),
    route('POST', '/v1/jobs/:id/approvals', (ctx) => ({
      status: 201,
      body: repo.createApproval({ ...(ctx.body as unknown as T.CreateApprovalInput), jobId: ctx.params.id }),
    })),
    route('GET', '/v1/jobs/:id/usage', (ctx) => ({ status: 200, body: repo.listUsage({ jobId: ctx.params.id }) })),
    route('POST', '/v1/jobs/:id/usage', (ctx) => ({
      status: 201,
      body: repo.recordUsage({ ...(ctx.body as T.RecordUsageInput), jobId: ctx.params.id }),
    })),

    // approvals / policies / budgets
    route('GET', '/v1/approvals', (ctx) => {
      repo.sweepApprovals();
      return {
        status: 200,
        body: repo.listApprovals({
          status: (ctx.query.get('status') as T.ApprovalStatus | null) ?? undefined,
          assignedTo: ctx.query.get('assignedTo') ?? undefined,
          limit: Number(ctx.query.get('limit') ?? 500),
        }),
      };
    }),
    route('GET', '/v1/approvals/:id', (ctx) => ({ status: 200, body: repo.getApproval(ctx.params.id!) })),
    route('POST', '/v1/approvals/:id/decision', (ctx) => ({
      status: 200,
      body: repo.decideApproval(ctx.params.id!, ctx.body as unknown as T.DecideApprovalInput),
    })),
    route('GET', '/v1/policies', () => ({ status: 200, body: repo.listPolicies() })),
    route('POST', '/v1/policies', (ctx) => ({ status: 201, body: repo.createPolicy(ctx.body as unknown as T.CreatePolicyInput) })),
    route('PATCH', '/v1/policies/:id', (ctx) => ({ status: 200, body: repo.updatePolicy(ctx.params.id!, ctx.body as T.UpdatePolicyInput) })),
    route('DELETE', '/v1/policies/:id', (ctx) => {
      repo.deletePolicy(ctx.params.id!);
      return { status: 204 };
    }),
    route('GET', '/v1/budgets', () => ({ status: 200, body: repo.listBudgets() })),
    route('POST', '/v1/budgets', (ctx) => ({ status: 201, body: repo.createBudget(ctx.body as unknown as T.CreateBudgetInput) })),

    // sessions / transcript
    route('GET', '/v1/sessions', () => ({ status: 200, body: repo.listSessions() })),
    route('POST', '/v1/sessions', (ctx) => ({ status: 201, body: repo.registerSession(ctx.body as unknown as T.RegisterSessionInput) })),
    route('GET', '/v1/sessions/:id', (ctx) => ({ status: 200, body: repo.getSession(ctx.params.id!) })),
    route('PATCH', '/v1/sessions/:id', (ctx) => ({ status: 200, body: repo.updateSession(ctx.params.id!, ctx.body as never) })),
    route('POST', '/v1/sessions/:id/cancel', (ctx) => ({
      status: 200,
      body: repo.requestCancel(ctx.params.id!, asString(ctx.body.actorId, 'actorId')),
    })),
    route('GET', '/v1/sessions/:id/transcript', (ctx) => ({
      status: 200,
      body: repo.listTranscript(ctx.params.id!, Number(ctx.query.get('since') ?? 0), Number(ctx.query.get('limit') ?? 2000)),
    })),
    route('POST', '/v1/sessions/:id/transcript', (ctx) => ({
      status: 201,
      body: repo.appendTranscript(ctx.params.id!, ctx.body as unknown as T.AppendTranscriptInput),
    })),
  ];

  // ------------------------------------------------------------------ per-route helpers

  function adapterList(force: boolean): T.AdapterInfo[] {
    const probed = probeAdapters(force);
    const overrides = new Map(repo.listAdapterOverrides().map((row) => [String(row.id), row]));
    const merged = probed.map((adapter) => {
      const override = overrides.get(adapter.id);
      if (!override) return adapter;
      const abilities = (() => {
        try {
          return JSON.parse(String(override.abilities ?? '{}')) as Record<string, boolean>;
        } catch {
          return adapter.abilities;
        }
      })();
      return {
        ...adapter,
        command: String(override.command ?? adapter.command),
        args: (() => {
          try {
            return JSON.parse(String(override.args ?? '[]')) as string[];
          } catch {
            return adapter.args;
          }
        })(),
        enabled: Number(override.enabled ?? 1) === 1,
        source: 'override' as const,
        abilities,
        lastProbeAt: override.last_probe_at ? String(override.last_probe_at) : adapter.lastProbeAt,
      };
    });
    for (const [id, override] of overrides) {
      if (!merged.some((a) => a.id === id)) {
        merged.push({
          id,
          name: id,
          kind: 'custom',
          command: String(override.command ?? id),
          args: [],
          enabled: Number(override.enabled ?? 1) === 1,
          source: 'override',
          installed: false,
          path: null,
          version: null,
          error: 'Custom adapter: not probed',
          abilities: {},
          lastProbeAt: null,
        });
      }
    }
    return merged;
  }

  function projectStatus(projectId: string): { project: T.Project; repos: { repo: T.Repo; state: T.WorkspaceState }[] } {
    const project = repo.getProject(projectId);
    return {
      project,
      repos: project.repos.map((r) => ({
        repo: r,
        state: r.path ? workspaces.workspaceState(r.path) : { exists: false, isGit: false, branch: null, headSha: null, dirty: false, unknown: true, error: 'No path set for this repo' },
      })),
    };
  }

  async function attachProject(ctx: Ctx): Promise<HandlerResult> {
    const input = ctx.body as unknown as T.AttachProjectInput;
    const attached = workspaces.attach(asString(input.path, 'path'), opts.workspaceRoots);
    const project = repo.createProject({
      name: input.name?.trim() || attached.name,
      rootPath: attached.path,
      defaultBranch: input.defaultBranch ?? attached.state.branch ?? undefined,
      teamId: input.teamId,
      repos: [{ name: attached.name, path: attached.path, remoteUrl: attached.remoteUrl ?? undefined, defaultBranch: attached.state.branch ?? undefined }],
    });
    return { status: 201, body: { project, state: attached.state } };
  }

  async function cloneProject(ctx: Ctx): Promise<HandlerResult> {
    const input = ctx.body as unknown as T.CloneProjectInput;
    const parent = input.parentDir ?? opts.cloneParentDir;
    const cloned = workspaces.clone(asString(input.url, 'url'), parent, input.name, opts.workspaceRoots);
    const project = repo.createProject({
      name: input.name?.trim() || cloned.name,
      rootPath: cloned.path,
      defaultBranch: cloned.state.branch ?? undefined,
      teamId: input.teamId,
      repos: [{ name: cloned.name, path: cloned.path, remoteUrl: cloned.remoteUrl ?? undefined, defaultBranch: cloned.state.branch ?? undefined }],
    });
    return { status: 201, body: { project, state: cloned.state } };
  }

  async function createProjectFolder(ctx: Ctx): Promise<HandlerResult> {
    const input = ctx.body as unknown as T.CreateProjectFolderInput;
    const folder = workspaces.createFolder(asString(input.path, 'path'), input.initGit !== false, opts.workspaceRoots);
    const project = repo.createProject({
      name: input.name?.trim() || folder.name,
      rootPath: folder.path,
      defaultBranch: folder.state.branch ?? undefined,
      teamId: input.teamId,
      repos: [{ name: folder.name, path: folder.path, defaultBranch: folder.state.branch ?? undefined }],
    });
    return { status: 201, body: { project, state: folder.state } };
  }

  async function events(ctx: Ctx): Promise<'stream'> {
    const { req, res, query } = ctx;
    const since = Number(req.headers['last-event-id'] ?? query.get('since') ?? 0) || 0;
    const origin = req.headers.origin;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      ...(origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    });
    res.write(': connected\n\n');
    const oldest = repo.oldestEventSeq();
    const latest = repo.latestEventSeq();
    if (since > 0 && oldest > 0 && since < oldest - 1) {
      const gap: T.StreamGap = { requestedSince: since, oldestAvailable: oldest, latestAvailable: latest, truncated: true };
      res.write(`event: gap\ndata: ${JSON.stringify(gap)}\n\n`);
    }
    let cursor = since;
    let sent = 0;
    for (;;) {
      const batch = repo.eventsSince(cursor, 500);
      if (!batch.length) break;
      for (const e of batch) writeEvent(res, e);
      cursor = batch[batch.length - 1]!.seq;
      sent += batch.length;
      if (sent >= 10_000) {
        const gap: T.StreamGap = { requestedSince: since, oldestAvailable: oldest, latestAvailable: latest, truncated: true };
        res.write(`event: gap\ndata: ${JSON.stringify(gap)}\n\n`);
        break;
      }
    }
    streams.add(res);
    const keepAlive = setInterval(() => {
      if (!res.destroyed) res.write(': ping\n\n');
    }, 15_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      streams.delete(res);
    });
    return 'stream';
  }

  // ------------------------------------------------------------------ server

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const origin = req.headers.origin;
    const originAllowed = !origin || origins.has(origin);

    if (origin && originAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Last-Event-ID, Idempotency-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(originAllowed ? 204 : 403);
      res.end();
      return;
    }
    if (!originAllowed) {
      return send(res, 403, { error: 'origin not allowed' });
    }

    const match = routes
      .map((r) => ({ r, m: r.pattern.exec(url.pathname) }))
      .find(({ r, m }) => m && r.method === req.method);

    if (!match) return send(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
    const { r, m } = match;
    const params: Record<string, string> = {};
    r.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(m![index + 1]!);
    });

    try {
      if (!r.open && !tokenMatches(req.headers.authorization, token)) throw new HttpError(401, 'missing or wrong token');

      const needsBody = !['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(req.method ?? '');
      const body = needsBody ? await readJson(req) : {};
      const idempotencyKey = req.headers['idempotency-key'];
      if (typeof idempotencyKey === 'string' && idempotencyKey.length > 0) {
        if (idempotencyKey.length > 200) throw new HttpError(400, 'Idempotency-Key is too long');
        const stored = repo.findIdempotent(idempotencyKey);
        if (stored) {
          return send(res, stored.status, stored.body);
        }
      }

      const result = await r.handler({ req, res, params, query: url.searchParams, body });
      if (result === 'stream') return;
      if (typeof idempotencyKey === 'string' && idempotencyKey.length > 0 && result.status < 500 && result.body !== undefined) {
        repo.saveIdempotent(idempotencyKey, req.method ?? 'POST', url.pathname, result.status, result.body);
      }
      send(res, result.status, result.body);
    } catch (e) {
      const status =
        e instanceof HttpError
          ? e.status
          : e instanceof InputError
            ? 400
            : e instanceof NotFoundError
              ? 404
              : e instanceof ConflictError
                ? 409
                : e instanceof ForbiddenError
                  ? 403
                  : e instanceof workspaces.WorkspaceError
                    ? 400
                    : 500;
      if (status === 500) console.error('[runtime] request failed:', e);
      if (!res.headersSent) send(res, status, { error: status === 500 ? 'internal error' : (e as Error).message });
      else res.end();
    }
  });

  server.on('close', () => {
    for (const res of streams) res.end();
    streams.clear();
  });

  return { server, broadcast };
}
