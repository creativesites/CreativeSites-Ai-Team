// Adapter definitions for the Phase 0.6 spike.
//
// Nothing here is assumed: an adapter is only run when its spawn command exists,
// and a missing binary is recorded as a blocked result with the exact reason.

import { accessSync, constants, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPIKES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAKE_AGENT = join(SPIKES_DIR, 'test', 'fake-agent.js');
const LOCAL_BIN = join(SPIKES_DIR, 'node_modules', '.bin');
const DSH_APP = '/Applications/DeepSeek Harness.app';
const DSH_CLI_SHIM = `${DSH_APP}/Contents/Resources/runtime/cli/bin/dsh`;
const DSH_PROFILES = join(process.env.HOME ?? '', '.dsh', 'profiles');

export function which(name) {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* not executable or absent */
    }
  }
  return null;
}

export function safeVersion(command, args = ['--version']) {
  if (!command) return null;
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')[0];
  } catch (err) {
    return { error: err.message };
  }
}

function listDir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export function collectEnvironment() {
  const tools = {};
  for (const [name, args] of [
    ['node', ['--version']],
    ['npm', ['--version']],
    ['claude', ['--version']],
    ['gemini', ['--version']],
  ]) {
    const path = which(name);
    tools[name] = { path, version: safeVersion(path, args) };
  }
  for (const name of ['codex', 'dsh', 'claude-agent-acp', 'codex-acp']) {
    tools[name] = { path: which(name) };
  }
  tools['claude-agent-acp (spike install)'] = {
    path: existsSync(join(LOCAL_BIN, 'claude-agent-acp')) ? join(LOCAL_BIN, 'claude-agent-acp') : null,
  };
  return {
    capturedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    tools,
  };
}

function claudeAdapter() {
  return {
    label: 'Claude Code via claude-agent-acp 0.95.0',
    command: () => {
      const installed = join(LOCAL_BIN, 'claude-agent-acp');
      return existsSync(installed) ? installed : which('claude-agent-acp');
    },
    args: [],
    probe: () => ({
      claude: { path: which('claude'), version: safeVersion(which('claude')) },
      adapterPath: join(LOCAL_BIN, 'claude-agent-acp'),
    }),
    blocked() {
      if (this.command()) return null;
      return {
        code: 'blocked-by-missing-adapter',
        detail:
          'claude-agent-acp is not installed in runtime/spikes/node_modules and is not on PATH. Install spike deps: `npm_config_cache=/tmp/myaos-npm-cache npm install` in runtime/spikes.',
      };
    },
  };
}

function geminiAdapter() {
  return {
    label: 'Gemini CLI via `gemini --acp`',
    command: () => which('gemini'),
    args: ['--acp'],
    probe: () => ({ gemini: { path: which('gemini'), version: safeVersion(which('gemini')) } }),
    blocked() {
      if (this.command()) return null;
      return {
        code: 'blocked-by-missing-binary',
        detail: 'gemini is not on PATH, so `gemini --acp` cannot be spawned.',
      };
    },
  };
}

function codexAdapter() {
  return {
    label: 'Codex via codex-acp (third-party Go bridge)',
    command: () => which('codex-acp'),
    args: [],
    probe: () => ({ codex: { path: which('codex') }, codexAcp: { path: which('codex-acp') } }),
    blocked() {
      const codex = which('codex');
      const acp = which('codex-acp');
      if (!codex) {
        return {
          code: 'blocked-by-missing-binary',
          detail:
            'codex is not on PATH and codex-acp is not installed. codex-acp requires the codex binary, so no session can be started (recorded, not guessed).',
        };
      }
      if (!acp) {
        return {
          code: 'blocked-by-missing-adapter',
          detail: 'codex found on PATH but codex-acp is not installed; not installed in this spike.',
        };
      }
      return null;
    },
  };
}

function dshAdapter() {
  return {
    label: 'DeepSeek Harness (ACP entry point discovery)',
    command: () => which('dsh'),
    args: [],
    probe: () => ({
      dshOnPath: which('dsh'),
      bundledCliShim: existsSync(DSH_CLI_SHIM) ? DSH_CLI_SHIM : null,
      appBundle: existsSync(DSH_APP) ? DSH_APP : null,
      userProfiles: listDir(DSH_PROFILES),
    }),
    blocked() {
      if (this.command()) {
        return {
          code: 'needs-manual-entry-point',
          detail:
            'dsh is on PATH but the spike has no known ACP invocation for it; run `dsh --help` and add an explicit command before probing.',
        };
      }
      const shimInfo = existsSync(DSH_CLI_SHIM)
        ? `Bundled CLI shim: ${DSH_CLI_SHIM} (boots profiles; \`--help\` lists web/headless/tui/rescue and no ACP mode).`
        : 'No bundled dsh CLI shim found.';
      return {
        code: 'no-acp-entry-point-found',
        detail: `dsh is not on PATH. ${shimInfo} App bundle: ${
          existsSync(DSH_APP) ? DSH_APP : '(not installed)'
        }. The bundle contains @agentclientprotocol/sdk and a config schema with an MCP-server type "acp" — i.e. DeepSeek Harness uses ACP as a client, not as a spawnable ACP agent server. User profiles: ${JSON.stringify(
          listDir(DSH_PROFILES),
        )}. No command was found that serves ACP over stdio.`,
      };
    },
  };
}

function fakeAdapter() {
  return {
    label: 'Fake ACP agent (harness self-test only)',
    hidden: true,
    command: () => process.execPath,
    args: [FAKE_AGENT],
    probe: () => ({ fakeAgent: FAKE_AGENT }),
    blocked: () => null,
  };
}

export function adapterDefs() {
  return {
    claude: claudeAdapter(),
    gemini: geminiAdapter(),
    codex: codexAdapter(),
    dsh: dshAdapter(),
    fake: fakeAdapter(),
  };
}

export function adapterOrder({ includeHidden = false } = {}) {
  return Object.entries(adapterDefs())
    .filter(([, def]) => includeHidden || !def.hidden)
    .map(([name]) => name);
}
