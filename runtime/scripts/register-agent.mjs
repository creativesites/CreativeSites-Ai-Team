#!/usr/bin/env node
// Register a new coworker in the MyaOS v2 store and the team registry files.
//
//   node runtime/scripts/register-agent.mjs --check loom
//   node runtime/scripts/register-agent.mjs \
//     --id loom --name Loom --role "Workspaces UI engineer" \
//     --team creativesites --symbol "🪡" --mark wave --color teal \
//     --capabilities ui,react,typescript --adapter claude
//
// The v2 store is the canonical registration (the app shows it immediately).
// community/agents.json and community/AGENTS_REGISTRY.md are the team-readable
// mirrors. data/myaos.db (v1) is never touched.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, runtimeDbPath, runtimeInfoPath } from '../src/config.ts';
import { openStore } from '../src/store/db.ts';
import { Repo } from '../src/store/repo.ts';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
const checkOnly = has('check');
const MARK = new Set(['diamond', 'hex', 'shield', 'wave', 'star', 'arcs', 'ring', 'bars', 'triangle', 'moon', 'square', 'knot']);
const COLOR = new Set(['amber', 'blue', 'green', 'violet', 'teal', 'rose', 'indigo', 'graphite']);
const ADAPTER = new Set(['claude', 'codex', 'gemini', 'dsh']);
const TEAM = new Set(['creativesites', 'meetingmind', 'deployfleet']);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const id = (flag('id') ?? flag('check') ?? '').trim().toLowerCase();
const name = (flag('name') ?? '').trim();
const role = (flag('role') ?? 'Coworker').trim();
const team = (flag('team') ?? 'creativesites').trim();
const symbol = (flag('symbol') ?? '✦').trim();
const mark = (flag('mark') ?? 'diamond').trim();
const color = (flag('color') ?? 'graphite').trim();
const adapter = (flag('adapter') ?? 'claude').trim();
const capabilities = (flag('capabilities') ?? '')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);

if (!id || !/^[a-z][a-z0-9-]{1,30}$/.test(id)) die('--id must be a lowercase slug (letters, digits, hyphen), e.g. loom');
if (!checkOnly && !name) die('--name is required');
if (!TEAM.has(team)) die(`--team must be one of: ${[...TEAM].join(', ')}`);
if (!MARK.has(mark)) die(`--mark must be one of: ${[...MARK].join(', ')}`);
if (!COLOR.has(color)) die(`--color must be one of: ${[...COLOR].join(', ')}`);
if (!ADAPTER.has(adapter)) die(`--adapter must be one of: ${[...ADAPTER].join(', ')}`);

async function runtimeInfo() {
  try {
    const info = JSON.parse(fs.readFileSync(runtimeInfoPath(), 'utf8'));
    const res = await fetch(`${info.url}/health`, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return null;
    return info;
  } catch {
    return null;
  }
}

function readAgentsJson() {
  const file = path.join(root, 'community', 'agents.json');
  return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

function existingNames() {
  const names = new Set();
  for (const entry of readAgentsJson().data.agents ?? []) {
    const identity = entry.identity ?? {};
    if (identity.id) names.add(String(identity.id).toLowerCase());
    if (identity.name) names.add(String(identity.name).toLowerCase());
  }
  return names;
}

if (checkOnly) {
  const taken = existingNames();
  if (taken.has(id)) die(`${id} is already registered in community/agents.json`);
  console.log(`available: ${id}`);
  process.exit(0);
}

const info = await runtimeInfo();
let identity;
if (info) {
  const res = await fetch(`${info.url}/v1/identities`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${info.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      name,
      role,
      teamId: team,
      symbol,
      avatarMark: mark,
      avatarColor: color,
      capabilities,
      runtime: adapter === 'claude' ? 'Claude Code' : adapter === 'codex' ? 'Codex' : adapter,
      adapterId: adapter,
      provenance: 'DECLARED',
      approvalLevel: 'member',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(`v2 registration failed (${res.status}): ${body.error ?? 'unknown error'}`);
  identity = body;
} else {
  const db = openStore(runtimeDbPath(loadConfig()));
  try {
    const repo = new Repo(db);
    identity = repo.createIdentity({
      id, name, role, teamId: team, symbol,
      avatarMark: mark, avatarColor: color, capabilities,
      runtime: adapter === 'claude' ? 'Claude Code' : adapter === 'codex' ? 'Codex' : adapter,
      adapterId: adapter, provenance: 'DECLARED', approvalLevel: 'member',
    });
  } finally {
    db.close();
  }
}

// Team-readable mirrors. Keep them simple and additive.
const { file: agentsFile, data: agents } = readAgentsJson();
const already = (agents.agents ?? []).some((entry) => String(entry?.identity?.id ?? '').toLowerCase() === id);
if (!already) {
  agents.agents = agents.agents ?? [];
  agents.agents.push({
    identity: { id, name, symbol, primary_domain: role },
    declared_capabilities: capabilities,
    declared_responsibilities: [role],
    declared_repository_ownership: [],
    runtime_session_identity: adapter,
    observed_liveness: 'UNKNOWN',
    confidence_provenance: 'DECLARED',
    status: 'AVAILABLE',
    last_seen: null,
    current_task: null,
  });
  agents.updated_at = new Date().toISOString();
  fs.writeFileSync(agentsFile, `${JSON.stringify(agents, null, 2)}\n`);
}

const registryFile = path.join(root, 'community', 'AGENTS_REGISTRY.md');
let registry = '';
try {
  registry = fs.readFileSync(registryFile, 'utf8');
} catch {
  registry = '# Myavana Agent Collaboration Registry\n';
}
const header = '## Antigravity agents';
const row = `| **${name}** ${symbol} | \`${id}\` | ${role} | **AVAILABLE** | Registered ${new Date().toISOString().slice(0, 10)}; role DECLARED, no task history yet. Adapter: ${adapter}. |`;
if (!registry.includes(header)) {
  registry += `\n\n---\n\n${header}\n\n| Agent Name | Alias / ID | Primary Domain / Specialization | Status | Active Focus / Responsibilities |\n|:---|:---|:---|:---|:---|\n${row}\n`;
} else {
  registry = `${registry.trimEnd()}\n${row}\n`;
}
fs.writeFileSync(registryFile, registry);

console.log(`Registered ${name} (${id}) in the v2 store${info ? ' via the running runtime' : ' directly'} and the team registry.`);
console.log(`  team: ${team} · role: ${role} · adapter: ${adapter} · provenance: DECLARED`);
console.log('Next: create your worktree/branch, read the assignment doc, and start. Do not touch data/myaos.db.');
