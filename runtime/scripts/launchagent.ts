#!/usr/bin/env node
// Install, remove or inspect the macOS LaunchAgent that keeps the runtime running at login.
//
//   node runtime/scripts/launchagent.ts install     # writes the plist and starts it
//   node runtime/scripts/launchagent.ts uninstall
//   node runtime/scripts/launchagent.ts status
//   node runtime/scripts/launchagent.ts print       # show the plist without installing
//
// macOS only (launchd). Needs Node.js 24+: pass MYAOS_NODE to override the node binary.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { myaosHome } from '../src/config.ts';
import { LAUNCH_AGENT_LABEL, launchAgentPlist, launchctlArgs } from '../src/launchagent.ts';

const action = process.argv[2] ?? 'status';
const runtimeDir = path.resolve(import.meta.dirname, '..');
const node = process.env.MYAOS_NODE ?? process.execPath;
const logDir = path.join(myaosHome(), 'logs');
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);

// Adapters (claude, codex, gemini) must be on PATH for the agent: take the current login PATH.
const env: Record<string, string> = {};
if (process.env.PATH) env.PATH = process.env.PATH;
const plist = launchAgentPlist({ node, runtimeDir, logDir, env });

function launchctl(args: string[]) {
  const r = spawnSync('launchctl', args, { encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

if (action === 'print') {
  console.log(plist);
} else if (process.platform !== 'darwin') {
  console.error('The LaunchAgent is macOS only. Use "print" to see the plist.');
  process.exit(2);
} else if (action === 'install') {
  const major = Number(process.versions.node.split('.')[0]);
  if (!process.env.MYAOS_NODE && major < 24) {
    console.error(`Node ${process.versions.node} is too old: the runtime needs Node 24+. Set MYAOS_NODE to a Node 24 binary.`);
    process.exit(2);
  }
  fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  const uid = process.getuid?.() ?? 501;
  launchctl(launchctlArgs('uninstall', uid, plistPath)); // replace any earlier version
  fs.writeFileSync(plistPath, plist, { mode: 0o644 });
  const r = launchctl(launchctlArgs('install', uid, plistPath));
  console.log(r.code === 0 ? `Installed ${plistPath}. The runtime now starts at login; logs in ${logDir}.` : `launchctl failed (${r.code}): ${r.out}`);
  process.exit(r.code);
} else if (action === 'uninstall') {
  const uid = process.getuid?.() ?? 501;
  const r = launchctl(launchctlArgs('uninstall', uid, plistPath));
  if (fs.existsSync(plistPath)) fs.rmSync(plistPath);
  console.log(r.code === 0 ? 'Uninstalled.' : `Removed the plist. launchctl said: ${r.out || 'not loaded'}`);
} else if (action === 'status') {
  const uid = process.getuid?.() ?? 501;
  const r = launchctl(launchctlArgs('status', uid, plistPath));
  console.log(r.code === 0 ? r.out.split('\n').slice(0, 12).join('\n') : 'Not installed (or not loaded).');
} else {
  console.error('Usage: launchagent.ts install | uninstall | status | print');
  process.exit(1);
}
