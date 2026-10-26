import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AdapterAuth, AdapterInfo } from './api/types.ts';
import { readAdapterEnv } from './adapter-env.ts';

// Adapter presets. These are configuration, not claims: `installed`, `version`
// and `auth` come from probing this machine. Abilities stay empty until the
// runtime actually observes what an adapter routes through the ACP client.

export interface AdapterPreset {
  id: string;
  name: string;
  kind: string;
  command: string;
  args: string[];
  versionArgs: string[];
  aliases?: string[];
}

export const ADAPTER_PRESETS: AdapterPreset[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    kind: 'claude',
    command: 'claude-agent-acp',
    args: [],
    versionArgs: ['--version'],
  },
  {
    id: 'codex',
    name: 'Codex',
    kind: 'codex',
    command: 'codex-acp',
    args: [],
    versionArgs: ['--version'],
    aliases: ['codex'],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    kind: 'gemini',
    command: 'gemini',
    args: ['--acp'],
    versionArgs: ['--version'],
  },
  {
    id: 'dsh',
    name: 'DeepSeek Harness',
    kind: 'dsh',
    command: 'dsh',
    args: ['acp'],
    versionArgs: ['--version'],
    aliases: ['deepseek-harness'],
  },
];

function nvmBinDirs(): string[] {
  const base = path.join(process.env.HOME ?? '', '.nvm', 'versions', 'node');
  try {
    return fs
      .readdirSync(base)
      .filter((v) => /^v\d+/.test(v))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((v) => path.join(base, v, 'bin'));
  } catch {
    return [];
  }
}

function extraPathDirs(): string[] {
  const home = process.env.HOME ?? '';
  return [
    path.join(home, '.local/bin'),
    path.join(home, '.cargo/bin'),
    ...nvmBinDirs(),
    path.join(home, '.volta/bin'),
    path.join(home, '.bun/bin'),
    '/opt/homebrew/bin',
    '/opt/homebrew/opt/node@24/bin',
    '/usr/local/bin',
    '/usr/bin',
  ];
}

/** Finder-launched apps get a minimal PATH, so also look in the usual install dirs. */
export function findExecutable(command: string, aliases: string[] = []): string | null {
  const names = [command, ...aliases];
  const dirs = [...(process.env.PATH ?? '').split(path.delimiter), ...extraPathDirs()].filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

function versionOf(binary: string, args: string[]): string | null {
  try {
    const out = execFileSync(binary, args, { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().split('\n')[0]?.slice(0, 120) || null;
  } catch {
    return null;
  }
}

function runCapture(binary: string, args: string[], timeout = 4000): { status: number | null; text: string } {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout });
  return {
    status: result.status,
    text: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim(),
  };
}

function claudeAuth(adapterInstalled: boolean): AdapterAuth {
  if (!adapterInstalled) return { state: 'missing_binary', detail: 'claude-agent-acp is not installed' };
  const cli = findExecutable('claude');
  if (!cli) return { state: 'needs_login', detail: 'Claude Code CLI not found; install it and run `claude` to sign in' };
  try {
    const out = runCapture(cli, ['auth', 'status']).text;
    const start = out.indexOf('{');
    const status = JSON.parse(out.slice(start)) as { loggedIn?: boolean; authMethod?: string; subscriptionType?: string };
    if (status.loggedIn) {
      const via = [status.authMethod, status.subscriptionType].filter(Boolean).join(' · ');
      return { state: 'ready', detail: via ? `Signed in (${via})` : 'Signed in' };
    }
    return { state: 'needs_login', detail: 'Claude Code is not signed in; run `claude` and log in' };
  } catch {
    return { state: 'unknown', detail: 'Could not read Claude auth status' };
  }
}

function codexAuth(adapterInstalled: boolean): AdapterAuth {
  if (!adapterInstalled) return { state: 'missing_binary', detail: 'codex-acp is not installed (install codex + codex-acp)' };
  const cli = findExecutable('codex');
  if (!cli) return { state: 'needs_login', detail: 'codex CLI not found; install it and run `codex login`' };
  try {
    const out = runCapture(cli, ['login', 'status']).text;
    return /logged in/i.test(out)
      ? { state: 'ready', detail: out.split('\n')[0]?.slice(0, 120) || 'Signed in' }
      : { state: 'needs_login', detail: 'Codex is not signed in; run `codex login`' };
  } catch {
    return { state: 'unknown', detail: 'Could not read Codex auth status' };
  }
}

function geminiAuth(adapterInstalled: boolean): AdapterAuth {
  if (!adapterInstalled) return { state: 'missing_binary', detail: 'gemini CLI is not installed' };
  const env = readAdapterEnv();
  if (process.env.GEMINI_API_KEY || env.GEMINI_API_KEY) {
    return { state: 'configured', detail: 'GEMINI_API_KEY is set; not verified until a prompt turn succeeds' };
  }
  try {
    const file = path.join(process.env.HOME ?? '', '.gemini', 'oauth_creds.json');
    const creds = JSON.parse(fs.readFileSync(file, 'utf8')) as { expiry_date?: number; refresh_token?: string };
    if (creds.expiry_date && creds.expiry_date > Date.now()) {
      return { state: 'ready', detail: `OAuth token valid until ${new Date(creds.expiry_date).toISOString()}` };
    }
    return {
      state: 'needs_login',
      detail: creds.refresh_token
        ? 'OAuth token expired; refresh it by signing in with `gemini`, or set GEMINI_API_KEY in ~/.myaos/adapters.env'
        : 'No valid Gemini credentials; run `gemini` to sign in or set GEMINI_API_KEY',
    };
  } catch {
    return { state: 'needs_login', detail: 'No Gemini credentials; run `gemini` to sign in or set GEMINI_API_KEY' };
  }
}

function dshAuth(): AdapterAuth {
  return {
    state: 'unsupported',
    detail: 'DeepSeek Harness does not expose a spawnable ACP agent (its ACP use is client-side)',
  };
}

function authFor(preset: AdapterPreset, installed: boolean): AdapterAuth {
  switch (preset.kind) {
    case 'claude':
      return claudeAuth(installed);
    case 'codex':
      return codexAuth(installed);
    case 'gemini':
      return geminiAuth(installed);
    case 'dsh':
      return dshAuth();
    default:
      return { state: installed ? 'unknown' : 'missing_binary', detail: installed ? 'Not probed' : 'Not installed' };
  }
}

let cache: { at: number; list: AdapterInfo[] } | null = null;

/** Probes the four supported adapters; results are cached briefly. */
export function probeAdapters(force = false): AdapterInfo[] {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.list;
  const list = ADAPTER_PRESETS.map((preset): AdapterInfo => {
    const binary = findExecutable(preset.command, preset.aliases);
    const installed = Boolean(binary);
    return {
      id: preset.id,
      name: preset.name,
      kind: preset.kind,
      command: preset.command,
      args: preset.args,
      enabled: true,
      source: 'preset',
      installed,
      path: binary,
      version: binary
        ? versionOf(binary, preset.versionArgs) ??
          (preset.id === 'codex' ? versionOf(findExecutable('codex') ?? '', ['--version']) : null)
        : null,
      error: binary ? null : `Not installed (looked for ${preset.command})`,
      abilities: {},
      lastProbeAt: new Date().toISOString(),
      auth: authFor(preset, installed),
    };
  });
  cache = { at: Date.now(), list };
  return list;
}

export function adapterInfo(id: string, force = false): AdapterInfo | null {
  return probeAdapters(force).find((a) => a.id === id) ?? null;
}
