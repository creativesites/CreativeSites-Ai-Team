import crypto from 'node:crypto';
import http from 'node:http';
import type { Health, RuntimeEvent } from './types.ts';
import { InputError, NotFoundError, type Repo } from '../store/repo.ts';

export interface ServerOptions {
  repo: Repo;
  token: string;
  health: () => Health;
  /** Extra browser origins allowed to call the API (the desktop's dev server). */
  allowedOrigins?: string[];
}

export interface RuntimeServer {
  server: http.Server;
  /** Pushes an event to every connected stream. */
  broadcast: (e: RuntimeEvent) => void;
}

const MAX_BODY = 1024 * 1024;

// The Tauri webview's own origins. Dev servers are added through allowedOrigins.
const BASE_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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

export function createServer(opts: ServerOptions): RuntimeServer {
  const { repo, token } = opts;
  const origins = new Set([...BASE_ORIGINS, ...(opts.allowedOrigins ?? [])]);
  const streams = new Set<http.ServerResponse>();

  const send = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const writeEvent = (res: http.ServerResponse, e: RuntimeEvent) => {
    res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  };

  const broadcast = (e: RuntimeEvent) => {
    for (const res of streams) writeEvent(res, e);
  };

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Last-Event-ID');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(origin && origins.has(origin) ? 204 : 403);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);
    const route = `${req.method} /${parts.map((p, i) => (i >= 2 && i % 2 === 0 ? ':id' : p)).join('/')}`;

    try {
      // Health tells a caller the runtime is up; it reveals nothing else, so it needs no token.
      if (route === 'GET /health') return send(res, 200, opts.health());
      if (!tokenMatches(req.headers.authorization, token)) throw new HttpError(401, 'missing or wrong token');

      switch (route) {
        case 'GET /v1/summary':
          return send(res, 200, repo.summary());
        case 'GET /v1/identities':
          return send(res, 200, repo.listIdentities());
        case 'POST /v1/identities':
          return send(res, 201, repo.createIdentity((await readJson(req)) as never));
        case 'POST /v1/identities/:id':
          return send(res, 200, repo.updateIdentity(parts[2], (await readJson(req)) as never));
        case 'GET /v1/rooms':
          return send(res, 200, repo.listRooms());
        case 'POST /v1/rooms':
          return send(res, 201, repo.createRoom((await readJson(req)) as never));
        case 'GET /v1/rooms/:id/messages':
          return send(res, 200, repo.listMessages(parts[2]));
        case 'POST /v1/rooms/:id/messages':
          return send(res, 201, repo.postMessage(parts[2], (await readJson(req)) as never));
        case 'GET /v1/jobs':
          return send(res, 200, repo.listJobs());
        case 'POST /v1/jobs':
          return send(res, 201, repo.createJob((await readJson(req)) as never));
        case 'GET /v1/jobs/:id':
          return send(res, 200, repo.getJob(parts[2]));
        case 'GET /v1/sessions':
          return send(res, 200, repo.listSessions());
        case 'GET /v1/events': {
          // Server-sent events. Replays anything after Last-Event-ID (or ?since=), then streams live.
          const since = Number(req.headers['last-event-id'] ?? url.searchParams.get('since') ?? 0) || 0;
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
          });
          res.write(': connected\n\n');
          for (const e of repo.eventsSince(since)) writeEvent(res, e);
          streams.add(res);
          const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);
          req.on('close', () => {
            clearInterval(keepAlive);
            streams.delete(res);
          });
          return;
        }
        default:
          throw new HttpError(404, `no route for ${req.method} ${url.pathname}`);
      }
    } catch (e) {
      const status =
        e instanceof HttpError ? e.status : e instanceof InputError ? 400 : e instanceof NotFoundError ? 404 : 500;
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
