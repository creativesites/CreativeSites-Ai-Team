import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Health, RuntimeEvent } from './types.ts';
import type * as T from './types.ts';
import { runShell } from '../exec.ts';
import { probeAdapters } from '../adapters.ts';
import {
  ConflictError,
  ForbiddenError,
  InputError,
  NotFoundError,
  type Repo,
} from '../store/repo.ts';
import * as workspaces from '../workspaces.ts';
import type { Checker } from '../checks.ts';
import { formatSessionTerminalOutput, type SessionManager } from '../acp/session-manager.ts';
import { compileBatonCapsule, shouldRotateSession } from '../acp/baton.ts';
import {
  approveFrameAndHandoff,
  extractProjectDesignTokens,
  extractRepoScreensToFrames,
  syncBoardFramesFromDisk,
  synthesizeDesignFramesForPrompt,
  writeFrameFileToDisk,
} from '../design-studio.ts';
import type { Bridge } from '../bridge.ts';
import type { Orchestrator } from '../orchestrator.ts';
import type { TerminalManager } from '../terminal-manager.ts';
import { getRosterPayload } from '../council-roster.ts';
import { findFolderSession, listFolderSessions } from '../council-watch.ts';
import {
  buildSessionPayloadFromCouncil,
  startLiveCouncil,
  subscribeCouncilStream,
} from '../council-runner.ts';

export interface ServerOptions {
  repo: Repo;
  token: string;
  health: () => Health;
  /** Extra browser origins allowed to call the API (the desktop's dev server). */
  allowedOrigins?: string[];
  workspaceRoots: string[];
  cloneParentDir: string;
  newProjectParentDir: string;
  checker: Checker;
  sessions: SessionManager;
  bridge: Bridge;
  orchestrator: Orchestrator;
  terminals: TerminalManager;
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

async function listSessionWorktreeFiles(worktreePath: string): Promise<T.WorktreeFile[]> {
  if (!worktreePath || !fs.existsSync(worktreePath)) return [];
  const statusRes = await runShell('git status --porcelain=v1 -uall', worktreePath, 15_000);
  if (statusRes.exitCode !== 0) return [];
  const lines = statusRes.stdout.split('\n').filter((l) => l.trim().length > 0);
  const files: T.WorktreeFile[] = [];

  for (const line of lines) {
    if (line.length < 4) continue;
    const code = line.slice(0, 2);
    let filePath = line.slice(3).trim();
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = filePath.slice(1, -1);
    }
    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ')[1]!.trim();
    }

    let status: T.WorktreeFile['status'] = 'modified';
    const staged = code[0] !== ' ' && code[0] !== '?';

    if (code === '??') {
      status = 'untracked';
    } else if (code.includes('A')) {
      status = 'added';
    } else if (code.includes('D')) {
      status = 'deleted';
    } else if (code.includes('R')) {
      status = 'renamed';
    } else {
      status = 'modified';
    }

    let diff = '';
    const safePath = `'${filePath.replace(/'/g, "'\\''")}'`;
    try {
      if (status === 'untracked') {
        const fullPath = path.join(worktreePath, filePath);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const res = await runShell(`git diff --no-index --no-color -- /dev/null ${safePath}`, worktreePath, 10_000);
          diff = res.stdout;
        }
      } else {
        const headDiff = await runShell(`git diff HEAD --no-color --no-ext-diff -- ${safePath}`, worktreePath, 10_000);
        if (headDiff.stdout.trim()) {
          diff = headDiff.stdout;
        } else {
          const cachedDiff = await runShell(`git diff --cached --no-color --no-ext-diff -- ${safePath}`, worktreePath, 10_000);
          diff = cachedDiff.stdout || (await runShell(`git diff --no-color --no-ext-diff -- ${safePath}`, worktreePath, 10_000)).stdout;
        }
      }
    } catch {
      diff = '';
    }

    files.push({
      path: filePath,
      status,
      staged,
      diff,
    });
  }

  return files;
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

    route('GET', '/v1/search', (ctx) => ({
      status: 200,
      body: repo.search({ q: ctx.query.get('q') ?? '', perKind: Number(ctx.query.get('limit') ?? 8) }),
    })),

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
    route('GET', '/v1/bridge/status', () => ({ status: 200, body: opts.bridge.status() })),
    route('POST', '/v1/bridge/mirror/:jobId', (ctx) => ({ status: 200, body: opts.bridge.mirrorJob(ctx.params.jobId!) })),
    route('POST', '/v1/bridge/ingest', () => ({ status: 200, body: opts.bridge.ingestNow() })),
    route('POST', '/v1/bridge/sync', () => ({ status: 200, body: opts.bridge.syncAll() })),
    route('POST', '/v1/bridge/export/councils/:councilId', (ctx) => ({ status: 200, body: opts.bridge.exportCouncilVerdict(ctx.params.councilId!) })),
    route('POST', '/v1/bridge/export/councils', () => ({ status: 200, body: opts.bridge.exportAllVerdicts() })),
    route('POST', '/v1/bridge/export/shipped/:jobId', (ctx) => ({ status: 200, body: opts.bridge.exportShippedJob(ctx.params.jobId!) })),
    route('POST', '/v1/bridge/export/shipped', () => ({ status: 200, body: opts.bridge.exportShippedJobs() })),
    route('POST', '/v1/adapters/:id', (ctx) => {
      repo.upsertAdapterOverride(ctx.params.id!, ctx.body as never);
      return { status: 200, body: adapterList(false) };
    }, false),
    route('POST', '/v1/adapters/:id/rate-limit', (ctx) => {
      const reason = asString(ctx.body.reason, 'reason');
      const resetIn = Number(ctx.body.resetInSeconds ?? 1800);
      const resetAt = asOptionalString(ctx.body.resetAt) ?? new Date(Date.now() + resetIn * 1000).toISOString();
      repo.setAdapterRateLimit(ctx.params.id!, reason, resetAt);
      return { status: 200, body: adapterList(false) };
    }),
    route('POST', '/v1/adapters/:id/clear-rate-limit', (ctx) => {
      repo.clearAdapterRateLimit(ctx.params.id!);
      return { status: 200, body: adapterList(false) };
    }),

    // identities & rate-limits
    route('GET', '/v1/identities', (ctx) => ({ status: 200, body: repo.listIdentities(ctx.query.get('archived') === '1') })),
    route('POST', '/v1/identities', (ctx) => ({ status: 201, body: repo.createIdentity(ctx.body as unknown as T.CreateIdentityInput) })),
    route('GET', '/v1/identities/:id', (ctx) => ({ status: 200, body: repo.getIdentity(ctx.params.id!) })),
    route('POST', '/v1/identities/:id', (ctx) => ({ status: 200, body: repo.updateIdentity(ctx.params.id!, ctx.body as T.UpdateIdentityInput) })),
    route('POST', '/v1/identities/:id/rate-limit', (ctx) => {
      const reason = asString(ctx.body.reason, 'reason');
      const resetIn = Number(ctx.body.resetInSeconds ?? 1800);
      const resetAt = asOptionalString(ctx.body.resetAt) ?? new Date(Date.now() + resetIn * 1000).toISOString();
      const updated = repo.setIdentityRateLimit(ctx.params.id!, reason, resetAt);
      if (typeof ctx.body.resumePrompt === 'string' && ctx.body.resumePrompt.trim()) {
        opts.orchestrator.createSchedule({
          agentId: updated.id,
          createdBy: asOptionalString(ctx.body.actorId) ?? updated.id,
          kind: 'timer',
          runAt: resetAt,
          prompt: ctx.body.resumePrompt.trim(),
          reason: `Auto-resume after session limit reset: ${reason}`,
          maxRuns: 1,
        });
      }
      return { status: 200, body: updated };
    }),
    route('POST', '/v1/identities/:id/clear-rate-limit', (ctx) => ({
      status: 200,
      body: repo.clearIdentityRateLimit(ctx.params.id!),
    })),
    route('GET', '/v1/rate-limits', () => ({ status: 200, body: opts.orchestrator.rateLimitStatus() })),
    route('POST', '/v1/import/identities', (ctx) => ({ status: 200, body: repo.importIdentities(ctx.body as unknown as T.ImportIdentitiesInput) })),

    // autonomous wake, spawn, team-leader & cron/timer schedules
    route('POST', '/v1/agents/:id/wake', async (ctx) => ({
      status: 202,
      body: await opts.orchestrator.wakeAgent(ctx.params.id!, ctx.body as unknown as T.WakeAgentInput),
    })),
    route('POST', '/v1/wakes', async (ctx) => ({
      status: 202,
      body: await opts.orchestrator.wakeAgent(asString(ctx.body.targetAgentId, 'targetAgentId'), ctx.body as unknown as T.WakeAgentInput),
    })),
    route('GET', '/v1/wakes', (ctx) => ({
      status: 200,
      body: repo.listWakes({
        targetAgentId: ctx.query.get('targetAgentId') ?? undefined,
        jobId: ctx.query.get('jobId') ?? undefined,
        roomId: ctx.query.get('roomId') ?? undefined,
        status: (ctx.query.get('status') as T.WakeStatus | null) ?? undefined,
        limit: Number(ctx.query.get('limit') ?? 200),
      }),
    })),
    route('POST', '/v1/agents/spawn', async (ctx) => ({
      status: 201,
      body: await opts.orchestrator.spawnAgent(ctx.body as unknown as T.SpawnAgentInput),
    })),
    route('POST', '/v1/team-leader/dispatch', async (ctx) => ({
      status: 202,
      body: await opts.orchestrator.delegateToTeamLeader({
        leaderId: asOptionalString(ctx.body.leaderId),
        fromActorId: asString(ctx.body.fromActorId, 'fromActorId'),
        jobId: asOptionalString(ctx.body.jobId) ?? null,
        roomId: asOptionalString(ctx.body.roomId) ?? null,
        directive: asOptionalString(ctx.body.directive) ?? asString(ctx.body.goal, 'directive'),
      }),
    })),
    route('GET', '/v1/schedules', (ctx) => ({
      status: 200,
      body: repo.listSchedules({
        agentId: ctx.query.get('agentId') ?? undefined,
        jobId: ctx.query.get('jobId') ?? undefined,
        roomId: ctx.query.get('roomId') ?? undefined,
        enabledOnly: ctx.query.get('enabledOnly') === '1',
      }),
    })),
    route('POST', '/v1/schedules', (ctx) => ({
      status: 201,
      body: opts.orchestrator.createSchedule(ctx.body as unknown as T.CreateScheduleInput),
    })),
    route('PATCH', '/v1/schedules/:id', (ctx) => ({
      status: 200,
      body: repo.updateSchedule(ctx.params.id!, ctx.body as T.UpdateScheduleInput),
    })),
    route('DELETE', '/v1/schedules/:id', (ctx) => {
      repo.deleteSchedule(ctx.params.id!);
      return { status: 204 };
    }),
    route('POST', '/v1/schedules/tick', async (ctx) => ({
      status: 200,
      body: await opts.orchestrator.tick(asOptionalString(ctx.body.asOf)),
    })),

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
    route('GET', '/v1/projects/:id/commits', (ctx) => {
      const project = repo.getProject(ctx.params.id!);
      const root = project.rootPath || project.repos[0]?.path;
      return { status: 200, body: root ? workspaces.gitCommits(root, Number(ctx.query.get('limit') ?? 15)) : [] };
    }),
    route('GET', '/v1/projects/:id/diff', (ctx) => {
      const project = repo.getProject(ctx.params.id!);
      const root = project.rootPath || project.repos[0]?.path;
      return { status: 200, body: root ? workspaces.gitDiff(root) : { diff: '', files: [] } };
    }),
    route('GET', '/v1/projects/:id/files', (ctx) => {
      const project = repo.getProject(ctx.params.id!);
      const root = project.rootPath || project.repos[0]?.path;
      return {
        status: 200,
        body: root ? workspaces.listProjectFiles(root, ctx.query.get('path') ?? '', Number(ctx.query.get('limit') ?? 100)) : [],
      };
    }),
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
    route('POST', '/v1/rooms/:id/messages', (ctx) => {
      const room = repo.getRoom(ctx.params.id!);
      const msg = repo.postMessage(room.id, ctx.body as unknown as T.PostMessageInput);
      void opts.orchestrator.handleRoomMessage(room, msg).catch((e) => {
        console.error('[orchestrator] room message hook failed:', e);
      });
      return { status: 201, body: msg };
    }),

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
    route('POST', '/v1/jobs/:id/checks', async (ctx) => ({
      status: 201,
      body: await opts.checker.runTaskCheck(ctx.params.id!, asString(ctx.body.taskId, 'taskId')),
    })),
    route('POST', '/v1/jobs/:id/commit', async (ctx) => ({
      status: 201,
      body: await opts.checker.commitWorktree(ctx.params.id!, asOptionalString(ctx.body.message) ?? 'manual commit'),
    })),
    route('POST', '/v1/jobs/:id/snapshot', async (ctx) => ({
      status: 201,
      body: await opts.checker.snapshot(ctx.params.id!, asOptionalString(ctx.body.actorId)),
    })),
    route('POST', '/v1/jobs/:id/verify', async (ctx) => ({
      status: 200,
      body: await opts.checker.verify(
        ctx.params.id!,
        asOptionalString(ctx.body.actorId) ?? asString(ctx.body.verifierId, 'actorId'),
        Array.isArray(ctx.body.taskIds) ? (ctx.body.taskIds as string[]) : undefined
      ),
    })),
    route('POST', '/v1/jobs/:id/ship', async (ctx) => ({
      status: 200,
      body: await opts.checker.ship(ctx.params.id!, ctx.body as unknown as T.ShipJobInput),
    })),
    route('GET', '/v1/artifacts/:sha', (ctx) => {
      const artifact = opts.checker.readArtifact(ctx.params.sha!);
      if (!artifact) throw new NotFoundError('artifact not found');
      ctx.res.writeHead(200, {
        'Content-Type': artifact.mime,
        'Cache-Control': 'no-store',
        'Content-Length': artifact.bytes.length,
      });
      ctx.res.end(artifact.bytes);
      return 'stream';
    }),
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
    route('GET', '/v1/evidence/:id', (ctx) => ({ status: 200, body: repo.getEvidence(ctx.params.id!) })),
    route('POST', '/v1/evidence/:id/verify', (ctx) => ({ status: 201, body: repo.verifyEvidence(ctx.params.id!, ctx.body as unknown as T.VerifyEvidenceInput) })),
    route('GET', '/v1/jobs/:id/approvals', (ctx) => ({ status: 200, body: repo.listApprovals({ jobId: ctx.params.id, limit: 200 }) })),
    route('POST', '/v1/jobs/:id/approvals', (ctx) => ({
      status: 201,
      body: repo.createApproval({ ...(ctx.body as unknown as T.CreateApprovalInput), jobId: ctx.params.id }),
    })),
    route('GET', '/v1/jobs/:id/usage', (ctx) => ({ status: 200, body: repo.listUsage({ jobId: ctx.params.id }) })),
    route('GET', '/v1/councils/roster', () => ({ status: 200, body: getRosterPayload() })),
    route('GET', '/v1/councils/sessions', () => {
      const dbCouncils: T.CouncilSessionSummary[] = repo.listAllCouncils(50).map((c) => ({
        id: c.id,
        title: c.title || 'Council Session',
        prompt: c.decision || c.brief || '',
        mode: c.mode,
        status: c.status === 'running' ? 'running' : 'done',
        source: 'runtime',
        jobId: c.jobId,
      }));
      const folders = listFolderSessions();
      return { status: 200, body: { liveId: dbCouncils.find((c) => c.status === 'running')?.id ?? null, sessions: [...dbCouncils, ...folders] } };
    }),
    route('GET', '/v1/councils/sessions/:id', (ctx) => {
      const id = ctx.params.id!;
      const folderHit = findFolderSession(id);
      if (folderHit) return { status: 200, body: folderHit };
      const council = repo.getCouncil(id);
      return { status: 200, body: buildSessionPayloadFromCouncil(council) };
    }),
    route('GET', '/v1/jobs/:id/councils', (ctx) => ({ status: 200, body: repo.listCouncils(ctx.params.id!) })),
    route('POST', '/v1/jobs/:id/councils', (ctx) => ({
      status: 201,
      body: repo.createCouncil(ctx.params.id!, ctx.body as unknown as T.CreateCouncilInput),
    })),
    route('POST', '/v1/jobs/:id/councils/run', (ctx) => ({
      status: 201,
      body: startLiveCouncil(repo, ctx.params.id!, ctx.body as unknown as T.RunCouncilInput),
    })),
    route('GET', '/v1/councils/:id', (ctx) => ({ status: 200, body: repo.getCouncil(ctx.params.id!) })),
    route('GET', '/v1/councils/:id/stream', (ctx) => {
      const id = ctx.params.id!;
      const origin = ctx.req.headers.origin;
      ctx.res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        ...(origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      });
      const folderHit = findFolderSession(id);
      if (folderHit) {
        for (const ev of folderHit.events) {
          ctx.res.write(`data: ${JSON.stringify(ev)}\n\n`);
        }
        ctx.res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
        return 'stream';
      }
      subscribeCouncilStream(id, repo, ctx.res);
      return 'stream';
    }),
    route('POST', '/v1/councils/:id/cards', (ctx) => ({
      status: 201,
      body: repo.addCouncilCard(ctx.params.id!, ctx.body as unknown as T.CreateCouncilCardInput),
    })),
    route('POST', '/v1/councils/:id/verdict', (ctx) => {
      const verdict = repo.createVerdict(ctx.params.id!);
      return { status: 201, body: { ...verdict, ...verdict.payload } };
    }),
    route('GET', '/v1/councils/:id/verdict', (ctx) => {
      const verdict = repo.getVerdict(ctx.params.id!);
      return { status: 200, body: { ...verdict, ...verdict.payload } };
    }),
    route('POST', '/v1/councils/:id/accept', (ctx) => ({
      status: 200,
      body: repo.acceptVerdict(ctx.params.id!, ctx.body as unknown as T.AcceptVerdictInput),
    })),
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
    route('POST', '/v1/jobs/:id/sessions', async (ctx) => ({
      status: 202,
      body: await opts.sessions.start({
        jobId: ctx.params.id!,
        taskId: asOptionalString(ctx.body.taskId) ?? null,
        agentId: asString(ctx.body.agentId, 'agentId'),
        adapterId: asOptionalString(ctx.body.adapterId) ?? null,
        prompt: asOptionalString(ctx.body.prompt),
        mode: ctx.body.mode as T.Session['mode'] | undefined,
      }),
    })),
    route('GET', '/v1/sessions/:id', (ctx) => ({ status: 200, body: repo.getSession(ctx.params.id!) })),
    route('PATCH', '/v1/sessions/:id', (ctx) => ({ status: 200, body: repo.updateSession(ctx.params.id!, ctx.body as never) })),
    route('POST', '/v1/sessions/:id/cancel', (ctx) => ({
      status: 200,
      body: opts.sessions.cancel(ctx.params.id!, asString(ctx.body.actorId, 'actorId')),
    })),
    route('POST', '/v1/sessions/:id/prompt', async (ctx) => {
      const session = await opts.sessions.prompt(ctx.params.id!, asString(ctx.body.text, 'text'), {
        taskId: asOptionalString(ctx.body.taskId),
        skipAutoRotate: ctx.body.skipAutoRotate === true,
      });
      return { status: 202, body: { ok: true, session } };
    }),
    route('POST', '/v1/sessions/:id/rotate', async (ctx) => ({
      status: 201,
      body: await opts.sessions.rotate(ctx.params.id!, {
        prompt: asOptionalString(ctx.body.prompt) ?? undefined,
        taskId: asOptionalString(ctx.body.taskId),
        reason: asOptionalString(ctx.body.reason) ?? 'manual',
      }),
    })),
    route('GET', '/v1/sessions/:id/baton', (ctx) => {
      const session = repo.getSession(ctx.params.id!);
      const check = shouldRotateSession(repo, session);
      const compiled = compileBatonCapsule(repo, session.id);
      return {
        status: 200,
        body: {
          sessionId: session.id,
          generation: session.generation ?? 1,
          parentSessionId: session.parentSessionId ?? null,
          supersededBySessionId: session.supersededBySessionId ?? null,
          check,
          ...compiled,
        },
      };
    }),
    route('GET', '/v1/sessions/:id/files', async (ctx) => {
      const session = repo.getSession(ctx.params.id!);
      const files = session.worktree ? await listSessionWorktreeFiles(session.worktree) : [];
      return { status: 200, body: files };
    }),
    route('GET', '/v1/sessions/:id/transcript', (ctx) => ({
      status: 200,
      body: repo.listTranscript(ctx.params.id!, Number(ctx.query.get('since') ?? 0), Number(ctx.query.get('limit') ?? 2000)),
    })),
    route('POST', '/v1/sessions/:id/transcript', (ctx) => ({
      status: 201,
      body: repo.appendTranscript(ctx.params.id!, ctx.body as unknown as T.AppendTranscriptInput),
    })),
    route('GET', '/v1/sessions/:id/terminal', (ctx) => {
      const session = repo.getSession(ctx.params.id!);
      const entries = repo.listTranscript(session.id, Number(ctx.query.get('since') ?? 0), 5000);
      let agentName = session.agentId;
      try {
        agentName = repo.getIdentity(session.agentId).name;
      } catch {
        /* fallback */
      }
      return {
        status: 200,
        body: {
          sessionId: session.id,
          agentId: session.agentId,
          agentName,
          acpSessionId: session.acpSessionId ?? null,
          state: session.state,
          worktree: session.worktree,
          pid: session.pid,
          output: formatSessionTerminalOutput(session, entries, agentName),
        },
      };
    }),

    // runtime interactive shell terminals (works in both Tauri and Browser)
    route('GET', '/v1/terminals', () => ({ status: 200, body: opts.terminals.list() })),
    route('POST', '/v1/terminals', (ctx) => ({
      status: 201,
      body: opts.terminals.create(
        asOptionalString(ctx.body.cwd) ?? null,
        Number(ctx.body.cols ?? 100),
        Number(ctx.body.rows ?? 30)
      ),
    })),
    route('GET', '/v1/terminals/:id/stream', (ctx) => {
      const origin = ctx.req.headers.origin;
      ctx.res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        ...(origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      });
      opts.terminals.subscribe(ctx.params.id!, ctx.res);
      return 'stream';
    }),
    route('POST', '/v1/terminals/:id/input', (ctx) => {
      opts.terminals.write(ctx.params.id!, typeof ctx.body.data === 'string' ? ctx.body.data : '');
      return { status: 200, body: { ok: true } };
    }),
    route('DELETE', '/v1/terminals/:id', (ctx) => {
      opts.terminals.kill(ctx.params.id!);
      return { status: 204 };
    }),

    // design studio (infinite multi-frame canvas)
    route('GET', '/v1/design-boards', (ctx) => ({
      status: 200,
      body: repo.listDesignBoards({
        projectId: ctx.query.get('projectId') ?? undefined,
        jobId: ctx.query.get('jobId') ?? undefined,
        roomId: ctx.query.get('roomId') ?? undefined,
      }),
    })),
    route('POST', '/v1/design-boards', (ctx) => {
      const input = ctx.body as unknown as T.CreateDesignBoardInput;
      let projectRoot: string | null = null;
      let resolvedProjectId = input.projectId ?? null;
      if (!resolvedProjectId && input.jobId) {
        try {
          resolvedProjectId = repo.getJob(input.jobId).projectId ?? null;
        } catch {
          /* ignore */
        }
      }
      if (resolvedProjectId) {
        try {
          projectRoot = repo.getProject(resolvedProjectId).rootPath;
        } catch {
          /* ignore */
        }
      }
      const designTokens = extractProjectDesignTokens(projectRoot);
      const board = repo.createDesignBoard({
        ...input,
        projectId: resolvedProjectId,
        designTokens,
      });
      const baseDir = projectRoot ?? opts.workspaceRoots[0] ?? process.cwd();
      if (input.mode === 'extracted' && projectRoot) {
        extractRepoScreensToFrames(repo, board, projectRoot);
      } else if (input.seedStarterFrames) {
        synthesizeDesignFramesForPrompt(
          repo,
          board,
          {
            prompt: input.description?.trim() || input.title,
            device: 'phone',
            variantCount: 2,
          },
          baseDir
        );
      }
      return { status: 201, body: repo.getDesignBoard(board.id) };
    }),
    route('GET', '/v1/design-boards/:id', (ctx) => ({
      status: 200,
      body: syncBoardFramesFromDisk(repo, ctx.params.id!),
    })),
    route('PATCH', '/v1/design-boards/:id', (ctx) => ({
      status: 200,
      body: repo.updateDesignBoard(ctx.params.id!, ctx.body as unknown as T.UpdateDesignBoardInput),
    })),
    route('DELETE', '/v1/design-boards/:id', (ctx) => {
      repo.deleteDesignBoard(ctx.params.id!);
      return { status: 204 };
    }),
    route('POST', '/v1/design-boards/:id/generate', (ctx) => {
      const board = repo.getDesignBoard(ctx.params.id!);
      let baseDir = opts.workspaceRoots[0] ?? process.cwd();
      if (board.projectId) {
        try {
          baseDir = repo.getProject(board.projectId).rootPath ?? baseDir;
        } catch {
          /* ignore */
        }
      }
      const frames = synthesizeDesignFramesForPrompt(
        repo,
        board,
        ctx.body as unknown as T.GenerateDesignInput,
        baseDir
      );
      return { status: 201, body: { board: repo.getDesignBoard(board.id), frames } };
    }),
    route('POST', '/v1/design-boards/:id/extract', (ctx) => {
      const board = repo.getDesignBoard(ctx.params.id!);
      const input = ctx.body as unknown as T.ExtractDesignInput;
      const projectId = input.projectId ?? board.projectId;
      let projectRoot = opts.workspaceRoots[0] ?? process.cwd();
      if (projectId) {
        try {
          projectRoot = repo.getProject(projectId).rootPath ?? projectRoot;
        } catch {
          /* ignore */
        }
      }
      const frames = extractRepoScreensToFrames(
        repo,
        board,
        projectRoot,
        input.targetPaths,
        input.device,
        input.prompt
      );
      return { status: 201, body: { board: repo.getDesignBoard(board.id), frames } };
    }),
    route('POST', '/v1/design-boards/:id/frames', (ctx) => {
      const board = repo.getDesignBoard(ctx.params.id!);
      let baseDir = opts.workspaceRoots[0] ?? process.cwd();
      if (board.projectId) {
        try {
          baseDir = repo.getProject(board.projectId).rootPath ?? baseDir;
        } catch {
          /* ignore */
        }
      }
      const created = repo.createDesignFrame({
        ...(ctx.body as unknown as T.CreateDesignFrameInput),
        boardId: board.id,
      });
      const htmlPath = writeFrameFileToDisk(baseDir, board.id, created.id, created.htmlContent);
      return { status: 201, body: repo.updateDesignFrame(created.id, { htmlPath, bumpVersion: false }) };
    }),
    route('PATCH', '/v1/design-frames/:id', (ctx) => {
      const existing = repo.getDesignFrame(ctx.params.id!);
      const input = ctx.body as unknown as T.UpdateDesignFrameInput;
      let htmlPath = existing.htmlPath;
      if (input.htmlContent !== undefined && existing.htmlPath) {
        try {
          fs.writeFileSync(existing.htmlPath, input.htmlContent, 'utf8');
        } catch {
          /* ignore */
        }
      }
      return { status: 200, body: repo.updateDesignFrame(existing.id, { ...input, htmlPath }) };
    }),
    route('DELETE', '/v1/design-frames/:id', (ctx) => {
      repo.deleteDesignFrame(ctx.params.id!);
      return { status: 204 };
    }),
    route('POST', '/v1/design-frames/:id/approve', async (ctx) => ({
      status: 200,
      body: await approveFrameAndHandoff(
        repo,
        opts.orchestrator,
        ctx.params.id!,
        ctx.body as unknown as T.ApproveDesignFrameInput
      ),
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
        rateLimitResetAt: override.rate_limit_reset_at ? String(override.rate_limit_reset_at) : null,
        rateLimitReason: override.rate_limit_reason ? String(override.rate_limit_reason) : null,
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
          auth: { state: 'unknown', detail: 'Custom adapter; not probed' },
          rateLimitResetAt: override.rate_limit_reset_at ? String(override.rate_limit_reset_at) : null,
          rateLimitReason: override.rate_limit_reason ? String(override.rate_limit_reason) : null,
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

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.on('close', () => {
    for (const res of streams) res.end();
    streams.clear();
  });

  return { server, broadcast };
}
