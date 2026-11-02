import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createServer } from './api/server.ts';
import type { Health, RuntimeEvent } from './api/types.ts';
import { probeAdapters } from './adapters.ts';
import { artifactsDir, cloneParentDir, loadConfig, newProjectParentDir, workspaceRoots, worktreeRoot } from './config.ts';
import { Checker } from './checks.ts';
import { SessionManager } from './acp/session-manager.ts';
import { Bridge } from './bridge.ts';
import { Orchestrator } from './orchestrator.ts';
import { TerminalManager } from './terminal-manager.ts';
import { readAdapterEnv } from './adapter-env.ts';
import { openStore, schemaVersion } from './store/db.ts';
import { Repo } from './store/repo.ts';
import { gitAvailable } from './workspaces.ts';

export const VERSION = '0.2.0';

export interface StartOptions {
  dbPath: string;
  /** 0 picks a free port. */
  port?: number;
  token?: string;
  allowedOrigins?: string[];
  workspaceRoots?: string[];
  cloneParentDir?: string;
  newProjectParentDir?: string;
  worktreeRoot?: string;
  artifactsDir?: string;
  teamRepo?: string | null;
}

export interface RunningRuntime {
  url: string;
  port: number;
  token: string;
  repo: Repo;
  close: () => Promise<void>;
}

/** Opens the store and starts the API on 127.0.0.1 only. */
export async function startRuntime(opts: StartOptions): Promise<RunningRuntime> {
  const db = openStore(opts.dbPath);
  const token = opts.token ?? crypto.randomBytes(32).toString('hex');
  const startedAt = new Date().toISOString();
  const cfg = loadConfig();
  const wsRoots = opts.workspaceRoots ?? workspaceRoots(cfg);
  const cloneDir = opts.cloneParentDir ?? cloneParentDir(cfg);
  const newProjectDir = opts.newProjectParentDir ?? newProjectParentDir(cfg);
  const wtRoot = opts.worktreeRoot ?? worktreeRoot(cfg);
  const artDir = opts.artifactsDir ?? artifactsDir(cfg);
  // The server is created after the repo, so events go through this late-bound hook.
  let broadcast: (e: RuntimeEvent) => void = () => {};
  let bridge: Bridge | null = null;
  const repo = new Repo(db, (e) => {
    broadcast(e);
    bridge?.onEvent(e);
  });
  const checker = new Checker({ repo, workspaceRoots: wsRoots, worktreeRoot: wtRoot, artifactsDir: artDir });
  const sessions = new SessionManager({ repo, checker, env: readAdapterEnv(cfg) });
  const orchestrator = new Orchestrator({ repo, sessions, checker });
  orchestrator.start();
  const terminals = new TerminalManager();
  const teamRepo = opts.teamRepo === null ? null : (opts.teamRepo ?? cfg.teamRepo ?? null);
  bridge = new Bridge({ repo, teamRepo });
  bridge.start();

  const health = (): Health => {
    let store = false;
    try {
      db.prepare('SELECT 1').get();
      store = true;
    } catch {
      store = false;
    }
    const adapters = Object.fromEntries(
      probeAdapters().map((a) => [a.id, { installed: a.installed, version: a.version, auth: a.auth.state }])
    );
    return {
      ok: store,
      version: VERSION,
      schemaVersion: schemaVersion(db),
      startedAt,
      pid: process.pid,
      checks: { store, git: gitAvailable(), node: process.version, adapters, workspaceRoots: wsRoots.length },
    };
  };

  const api = createServer({
    repo,
    token,
    health,
    allowedOrigins: opts.allowedOrigins,
    workspaceRoots: wsRoots,
    cloneParentDir: cloneDir,
    newProjectParentDir: newProjectDir,
    checker,
    sessions,
    bridge,
    orchestrator,
    terminals,
  });
  broadcast = api.broadcast;

  // Anything the previous runtime claimed to be running is checked against real processes.
  repo.reconcileSessions();
  // Pending approvals that timed out at the team-lead level move to the owner.
  const sweep = setInterval(() => {
    try {
      repo.sweepApprovals();
    } catch (e) {
      console.error('[runtime] approval sweep failed:', e);
    }
  }, 60_000);
  sweep.unref();

  await new Promise<void>((resolve, reject) => {
    api.server.once('error', reject);
    api.server.listen(opts.port ?? 0, '127.0.0.1', () => resolve());
  });
  const port = (api.server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    token,
    repo,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(sweep);
        orchestrator.dispose();
        terminals.closeAll();
        bridge?.dispose();
        void sessions.closeAll().finally(() => {
          api.server.closeAllConnections();
          api.server.close(() => {
            db.close();
            resolve();
          });
        });
      }),
  };
}
