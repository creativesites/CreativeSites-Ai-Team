import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AdapterInfo } from './api/types.ts';

// Adapter presets. These are configuration, not claims: `installed` and
// `version` come from probing this machine, and abilities stay empty until the
// ACP spike/manager records what the adapter actually routes through the client.

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

function extraPathDirs(): string[] {
  const home = process.env.HOME ?? '';
  return [
    path.join(home, '.local/bin'),
    path.join(home, '.cargo/bin'),
    '/opt/homebrew/bin',
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

let cache: { at: number; list: AdapterInfo[] } | null = null;

/** Probes the four supported adapters; results are cached briefly. */
export function probeAdapters(force = false): AdapterInfo[] {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.list;
  const list = ADAPTER_PRESETS.map((preset): AdapterInfo => {
    const binary = findExecutable(preset.command, preset.aliases);
    return {
      id: preset.id,
      name: preset.name,
      kind: preset.kind,
      command: preset.command,
      args: preset.args,
      enabled: true,
      source: 'preset',
      installed: Boolean(binary),
      path: binary,
      version: binary ? versionOf(binary, preset.versionArgs) : null,
      error: binary ? null : `Not installed (looked for ${preset.command})`,
      abilities: {},
      lastProbeAt: new Date().toISOString(),
    };
  });
  cache = { at: Date.now(), list };
  return list;
}

export function adapterInfo(id: string, force = false): AdapterInfo | null {
  return probeAdapters(force).find((a) => a.id === id) ?? null;
}
