import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Same precedence as src/paths.js and the desktop's config.rs:
// environment variable, then ~/.myaos/config.json, then a default under ~/.myaos.

export interface MyaosConfig {
  teamRepo?: string;
  /** Pre-v2 field kept for the old app; the runtime never opens this store. */
  dbPath?: string;
  runtimeDbPath?: string;
  /** Directories the app may attach as projects. Defaults to the home directory. */
  workspaceRoots?: string[];
  cloneParentDir?: string;
  newProjectParentDir?: string;
  worktreeRoot?: string;
  artifactsDir?: string;
  adapterEnvPath?: string;
  ownerId?: string;
  defaultBudgetCents?: number;
  defaultMonthlyBudgetCents?: number;
}

export function expandHome(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function envPath(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? expandHome(v) : null;
}

function stringField(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    console.warn(`[runtime] Ignoring config field ${name}: expected a string`);
    return undefined;
  }
  return expandHome(value.trim());
}

function numberField(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    console.warn(`[runtime] Ignoring config field ${name}: expected a non-negative number`);
    return undefined;
  }
  return Math.round(n);
}

export function myaosHome(): string {
  return envPath('MYAOS_HOME') ?? path.join(os.homedir(), '.myaos');
}

export function configPath(): string {
  return envPath('MYAOS_CONFIG') ?? path.join(myaosHome(), 'config.json');
}

export function loadConfig(): MyaosConfig {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as Record<string, unknown>;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[runtime] Ignoring unreadable config ${configPath()}: ${(e as Error).message}`);
    }
    return {};
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    console.warn(`[runtime] Ignoring config ${configPath()}: expected a JSON object`);
    return {};
  }
  const roots = Array.isArray(raw.workspaceRoots)
    ? raw.workspaceRoots.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).map(expandHome)
    : undefined;
  return {
    teamRepo: stringField(raw.teamRepo, 'teamRepo'),
    dbPath: stringField(raw.dbPath, 'dbPath'),
    runtimeDbPath: stringField(raw.runtimeDbPath, 'runtimeDbPath'),
    workspaceRoots: roots,
    cloneParentDir: stringField(raw.cloneParentDir, 'cloneParentDir'),
    newProjectParentDir: stringField(raw.newProjectParentDir, 'newProjectParentDir'),
    worktreeRoot: stringField(raw.worktreeRoot, 'worktreeRoot'),
    artifactsDir: stringField(raw.artifactsDir, 'artifactsDir'),
    adapterEnvPath: stringField(raw.adapterEnvPath, 'adapterEnvPath'),
    ownerId: stringField(raw.ownerId, 'ownerId'),
    defaultBudgetCents: numberField(raw.defaultBudgetCents, 'defaultBudgetCents'),
    defaultMonthlyBudgetCents: numberField(raw.defaultMonthlyBudgetCents, 'defaultMonthlyBudgetCents'),
  };
}

/** The v2 store. Separate from the team's data/myaos.db, which keeps serving the current app. */
export function runtimeDbPath(cfg: MyaosConfig = loadConfig()): string {
  return envPath('MYAOS_RUNTIME_DB') ?? (cfg.runtimeDbPath ? expandHome(cfg.runtimeDbPath) : path.join(myaosHome(), 'runtime.db'));
}

/** Where a running runtime publishes its port and token for the desktop and CLI. */
export function runtimeInfoPath(): string {
  return envPath('MYAOS_RUNTIME_FILE') ?? path.join(myaosHome(), 'runtime.json');
}

export function lockPath(): string {
  return envPath('MYAOS_LOCK_FILE') ?? path.join(myaosHome(), 'runtime.lock');
}

/** Directories a project may be attached from. Home by default, so first-run works on a fresh install. */
export function workspaceRoots(cfg: MyaosConfig = loadConfig()): string[] {
  const roots = cfg.workspaceRoots?.length ? cfg.workspaceRoots : [os.homedir()];
  return [...new Set(roots.map((r) => path.resolve(expandHome(r))))];
}

export function artifactsDir(cfg: MyaosConfig = loadConfig()): string {
  return cfg.artifactsDir ? expandHome(cfg.artifactsDir) : path.join(myaosHome(), 'artifacts');
}

/** Environment for adapter processes (API keys), kept outside the repo and the store. */
export function adaptersEnvPath(cfg: MyaosConfig = loadConfig()): string {
  return envPath('MYAOS_ADAPTER_ENV') ?? (cfg.adapterEnvPath ? expandHome(cfg.adapterEnvPath) : path.join(myaosHome(), 'adapters.env'));
}

export function worktreeRoot(cfg: MyaosConfig = loadConfig()): string {
  return cfg.worktreeRoot ? expandHome(cfg.worktreeRoot) : path.join(myaosHome(), 'worktrees');
}

export function cloneParentDir(cfg: MyaosConfig = loadConfig()): string {
  return cfg.cloneParentDir ? expandHome(cfg.cloneParentDir) : path.join(os.homedir(), 'WebstormProjects');
}

export function newProjectParentDir(cfg: MyaosConfig = loadConfig()): string {
  return cfg.newProjectParentDir ? expandHome(cfg.newProjectParentDir) : path.join(os.homedir(), 'WebstormProjects');
}
