import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createServer } from './api/server.ts';
import type { Health, RuntimeEvent } from './api/types.ts';
import { probeAdapters } from './adapters.ts';
import { artifactsDir, cloneParentDir, expandHome, loadConfig, myaosHome, newProjectParentDir, workspaceRoots, worktreeRoot } from './config.ts';
import { Checker } from './checks.ts';
import { SessionManager } from './acp/session-manager.ts';
import { Bridge } from './bridge.ts';
import { Orchestrator } from './orchestrator.ts';
import { TerminalManager } from './terminal-manager.ts';
import { readAdapterEnv } from './adapter-env.ts';
import { openStore, schemaVersion } from './store/db.ts';
import { Repo } from './store/repo.ts';
import { Ledger } from './ledger/ledger.ts';
import { stopSessionUsage } from './usage/session-hooks.ts';
import { Scheduler } from './scheduler/scheduler.ts';
import { installRoutines } from './scheduler/routines.ts';
import { StandupService } from './standup/pipeline.ts';
import { gitAvailable } from './workspaces.ts';
import { syncCommunity } from './community-sync.ts';
import { attachSkillService } from './skills/service.ts';

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
  /** Overrides the skills root (default: setting skillsRoot, env MYAOS_SKILLS_ROOT, then community/skills). */
  skillsRoot?: string | null;
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
  const teamRepo = opts.teamRepo === null ? null : (opts.teamRepo ?? cfg.teamRepo ?? null);
  const legacyDbPath = teamRepo ? path.join(expandHome(teamRepo), 'data/myaos.db') : undefined;
  // The server is created after the repo, so events go through this late-bound hook.
  let broadcast: (e: RuntimeEvent) => void = () => {};
  let bridge: Bridge | null = null;
  // Workforce time ledger (WP9): one interval per agent turn, recorded when the turn ends.
  const ledger = new Ledger(db);
  const repo = new Repo(
    db,
    (e) => {
      broadcast(e);
      bridge?.onEvent(e);
      if (e.type === 'session.transcript' && (e.payload as { kind?: string } | undefined)?.kind === 'turn_end' && e.subjectId) {
        try {
          ledger.recordTurn(e.subjectId, Number((e.payload as { seq?: number }).seq));
          stopSessionUsage(db, e.subjectId);
        } catch (err) {
          console.warn('[runtime] ledger: could not record turn:', (err as Error).message);
        }
      }
    },
    legacyDbPath
  );
  const skills = attachSkillService(repo, db, { skillsRoot: opts.skillsRoot });
  try {
    skills.sync();
  } catch (err) {
    console.warn('[runtime] initial skill sync:', (err as Error).message);
  }
  const checker = new Checker({ repo, workspaceRoots: wsRoots, worktreeRoot: wtRoot, artifactsDir: artDir });
  const sessions = new SessionManager({ repo, checker, env: readAdapterEnv(cfg) });
  const orchestrator = new Orchestrator({ repo, sessions, checker });
  // Recurring routines and daily stand-ups (WP6): one central scheduler, driven by the orchestrator tick.
  const scheduler = new Scheduler({ repo, db });
  const standups = new StandupService({
    repo,
    db,
    wake: (agentId, prompt) =>
      orchestrator.wakeAgent(agentId, { fromActorId: 'runtime:standup', fromActorKind: 'system', prompt, reason: 'Daily stand-up report', allowFallbackAdapter: true }),
    adapterBlocked: (agent) => {
      if (agent.rateLimitResetAt && Date.parse(agent.rateLimitResetAt) > Date.now()) return `rate limited until ${agent.rateLimitResetAt}`;
      if (agent.adapterId) {
        const info = probeAdapters(false).find((a) => a.id === agent.adapterId);
        if (info && !info.installed) return `adapter ${agent.adapterId} is not installed`;
      }
      return null;
    },
  });
  installRoutines({ repo, scheduler, standups, probe: probeAdapters }, new Date().toISOString());
  orchestrator.setScheduler(scheduler);
  orchestrator.start();
  const terminals = new TerminalManager();
  bridge = new Bridge({ repo, teamRepo });
  bridge.start();

  try {
    syncCommunity(repo);
  } catch (err) {
    console.warn('[runtime] initial community sync:', (err as Error).message);
  }
  const commSyncTimer = setInterval(() => {
    try {
      syncCommunity(repo);
    } catch {
      /* best effort */
    }
  }, 20_000);
  commSyncTimer.unref?.();

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
    db,
    ledger,
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
    scheduler,
    standups,
    terminals,
  });
  broadcast = api.broadcast;

  // Anything the previous runtime claimed to be running is checked against real processes.
  repo.reconcileSessions();
  // Turns cut off by a crash or restart are closed at the session's last event, never double-counted.
  ledger.reconcileOpenTurns();
  // Engagement terms come only from an untracked local file (programme plan K6/K9).
  try {
    ledger.loadEngagements(process.env.MYAOS_ENGAGEMENTS_FILE ?? path.join(myaosHome(), 'engagements.local.json'));
  } catch (e) {
    console.warn('[runtime] could not load engagements.local.json:', (e as Error).message);
  }
  // Pending approvals that timed out at the team-lead level move to the owner.
  const sweep = setInterval(() => {
    try {
      repo.sweepApprovals();
      ledger.reconcileOpenTurns();
    } catch (e) {
      console.error('[runtime] approval sweep failed:', e);
    }
  }, 60_000);
  sweep.unref();

  // Agent action interface (K4): sessions get a session-bound token for POST /mcp once the API is up.
  let apiUrl: string | null = null;
  sessions.enableAgentTools({ db, url: () => apiUrl });

  await new Promise<void>((resolve, reject) => {
    api.server.once('error', reject);
    api.server.listen(opts.port ?? 0, '127.0.0.1', () => resolve());
  });
  const port = (api.server.address() as AddressInfo).port;
  apiUrl = `http://127.0.0.1:${port}`;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    token,
    repo,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(sweep);
        clearInterval(commSyncTimer);
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
