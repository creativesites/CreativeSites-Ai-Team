import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Same precedence as src/paths.js and the desktop's config.rs:
// environment variable, then ~/.myaos/config.json, then a default under ~/.myaos.

export interface MyaosConfig {
  teamRepo?: string;
  runtimeDbPath?: string;
}

export function expandHome(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function envPath(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? expandHome(v) : null;
}

export function myaosHome(): string {
  return envPath('MYAOS_HOME') ?? path.join(os.homedir(), '.myaos');
}

export function configPath(): string {
  return envPath('MYAOS_CONFIG') ?? path.join(myaosHome(), 'config.json');
}

export function loadConfig(): MyaosConfig {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8')) as MyaosConfig;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[runtime] Ignoring unreadable config ${configPath()}: ${(e as Error).message}`);
    }
    return {};
  }
}

/** The v2 store. Separate from the team's data/myaos.db, which keeps serving the current app. */
export function runtimeDbPath(cfg: MyaosConfig = loadConfig()): string {
  return envPath('MYAOS_RUNTIME_DB') ?? (cfg.runtimeDbPath ? expandHome(cfg.runtimeDbPath) : path.join(myaosHome(), 'runtime.db'));
}

/** Where a running runtime publishes its port and token for the desktop and CLI. */
export function runtimeInfoPath(): string {
  return envPath('MYAOS_RUNTIME_FILE') ?? path.join(myaosHome(), 'runtime.json');
}
