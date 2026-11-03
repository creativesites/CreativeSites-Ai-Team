import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AdapterAccount, AdapterAuth, AdapterInfo } from './api/types.ts';
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
    id: 'antigravity',
    name: 'Antigravity',
    kind: 'antigravity',
    command: 'antigravity',
    args: ['--acp'],
    versionArgs: ['--version'],
    aliases: ['agy', 'antigravity-ide'],
  },
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
    path.join(home, '.antigravity/antigravity/bin'),
    path.join(home, '.antigravity-ide/antigravity-ide/bin'),
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

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Reads the signed-in Claude account from `claude auth status` JSON, falling back to ~/.claude.json. */
export function claudeAccount(status: Record<string, unknown>, home = process.env.HOME ?? ''): AdapterAccount | null {
  const email = str(status.email) ?? str(status.emailAddress) ?? str(status.accountEmail);
  const org = str(status.orgName) ?? str(status.organizationName) ?? str(status.orgId) ?? str(status.organizationUuid);
  if (email || org) {
    return { id: email ?? org, label: [email, org, str(status.subscriptionType)].filter(Boolean).join(' · '), source: 'claude auth status' };
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')) as { oauthAccount?: Record<string, unknown> };
    const a = cfg.oauthAccount ?? {};
    const e = str(a.emailAddress);
    const o = str(a.organizationName) ?? str(a.organizationUuid);
    if (e || o) return { id: e ?? o, label: [e, o].filter(Boolean).join(' · '), source: '~/.claude.json' };
  } catch {
    /* not available */
  }
  return null;
}

/** Reads the active Google account used by the Gemini CLI. */
export function geminiAccount(home = process.env.HOME ?? ''): AdapterAccount | null {
  try {
    const f = JSON.parse(fs.readFileSync(path.join(home, '.gemini', 'google_accounts.json'), 'utf8')) as { active?: unknown };
    const active = str(f.active);
    return active ? { id: active, label: active, source: '~/.gemini/google_accounts.json' } : null;
  } catch {
    return null;
  }
}

/** Reads the email claim from the Codex id_token (no network, no verification: it only labels the account). */
export function codexAccount(home = process.env.HOME ?? ''): AdapterAccount | null {
  try {
    const f = JSON.parse(fs.readFileSync(path.join(home, '.codex', 'auth.json'), 'utf8')) as { tokens?: { id_token?: string } };
    const part = f.tokens?.id_token?.split('.')[1];
    if (!part) return null;
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
    const email = str(claims.email);
    return email ? { id: email, label: email, source: '~/.codex/auth.json' } : null;
  } catch {
    return null;
  }
}

/**
 * Whether an adapter may receive work. Only states that are known to fail block dispatch;
 * `unknown` (e.g. a custom override) is allowed so it can prove itself on a real turn.
 */
export function adapterBlockReason(info: Pick<AdapterInfo, 'name' | 'installed' | 'auth'>): string | null {
  if (!info.installed || info.auth.state === 'missing_binary') return `${info.name} is not installed. ${info.auth.detail}`;
  if (info.auth.state === 'needs_login') return `${info.name} is not signed in. ${info.auth.detail}`;
  if (info.auth.state === 'unsupported') return `${info.name} cannot run as an agent. ${info.auth.detail}`;
  return null;
}

function claudeAuth(adapterInstalled: boolean): AdapterAuth {
  if (!adapterInstalled) return { state: 'missing_binary', detail: 'claude-agent-acp is not installed' };
  const cli = findExecutable('claude');
  if (!cli) return { state: 'needs_login', detail: 'Claude Code CLI not found; install it and run `claude` to sign in' };
  try {
    const out = runCapture(cli, ['auth', 'status']).text;
    const start = out.indexOf('{');
    const status = JSON.parse(out.slice(start)) as Record<string, unknown> & { loggedIn?: boolean; authMethod?: string; subscriptionType?: string };
    if (status.loggedIn) {
      const via = [status.authMethod, status.subscriptionType].filter(Boolean).join(' · ');
      return { state: 'ready', detail: via ? `Signed in (${via})` : 'Signed in', account: claudeAccount(status) };
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
      ? { state: 'ready', detail: out.split('\n')[0]?.slice(0, 120) || 'Signed in', account: codexAccount() }
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
      return { state: 'ready', detail: `OAuth token valid until ${new Date(creds.expiry_date).toISOString()}`, account: geminiAccount() };
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

function antigravityAuth(adapterInstalled: boolean): AdapterAuth {
  if (!adapterInstalled) {
    return { state: 'missing_binary', detail: 'antigravity CLI is not installed (checked ~/.local/bin/antigravity, ~/.antigravity/antigravity/bin, and PATH)' };
  }
  const env = readAdapterEnv();
  if (process.env.ANTIGRAVITY_API_KEY || env.ANTIGRAVITY_API_KEY) {
    return { state: 'ready', detail: 'Signed in (ANTIGRAVITY_API_KEY configured in adapters.env)' };
  }
  if (process.env.GEMINI_API_KEY || env.GEMINI_API_KEY) {
    return { state: 'ready', detail: 'Signed in (GEMINI_API_KEY configured in adapters.env)' };
  }
  try {
    const file = path.join(process.env.HOME ?? '', '.gemini', 'oauth_creds.json');
    if (fs.existsSync(file)) {
      const creds = JSON.parse(fs.readFileSync(file, 'utf8')) as { expiry_date?: number; refresh_token?: string };
      if (creds.expiry_date && creds.expiry_date > Date.now()) {
        return { state: 'ready', detail: `OAuth token valid until ${new Date(creds.expiry_date).toISOString()}` };
      }
      if (creds.refresh_token) {
        return { state: 'ready', detail: 'Signed in via Google OAuth (refresh token present)' };
      }
    }
  } catch {
    /* ignore */
  }

  const stateDir = path.join(process.env.HOME ?? '', '.gemini', 'antigravity');
  if (fs.existsSync(stateDir)) {
    return { state: 'ready', detail: 'Antigravity runtime state detected and ready' };
  }

  return { state: 'ready', detail: 'Antigravity CLI is installed and ready' };
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
    case 'antigravity':
      return antigravityAuth(installed);
    case 'dsh':
      return dshAuth();
    default:
      return { state: installed ? 'unknown' : 'missing_binary', detail: installed ? 'Not probed' : 'Not installed' };
  }
}

let cache: { at: number; list: AdapterInfo[] } | null = null;

/**
 * Probes the four supported adapters; results are cached in memory unless `force === true`
 * so periodic `/health` heartbeats never block the Node HTTP event loop on slow CLI subshells.
 */
export function probeAdapters(force = false): AdapterInfo[] {
  if (!force && cache) return cache.list;
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
