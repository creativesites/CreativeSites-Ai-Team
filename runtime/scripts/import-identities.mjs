#!/usr/bin/env node
/**
 * import-identities.mjs — MyaOS Desktop v2 identity/team import + v1 data inventory.
 *
 * Plain Node ESM, no dependencies. Reads the v1 sources READ-ONLY (the v1 SQLite
 * store is queried through the `sqlite3` CLI with -readonly) and writes a
 * deterministic v2 import payload plus a dated one-time export.
 *
 * It never writes the v2 runtime store and never touches runtime/src or apps/desktop.
 *
 * Sources (authoritative copies are the ones in the main working tree, because the
 * worktree copy of data/myaos.db and community/agents.json is stale — see --main-root):
 *   data/myaos.db                 identities, teams, projects, tasks, token_ledger,
 *                                 evidence, events, jules_mission_* , provenance_log
 *   community/agents.json         25 entries, mixture of {identity:{...}} and flat
 *   community/AGENTS_REGISTRY.md  23 named identities (used for coverage conflicts only)
 *   community/proposals/DESKTOP_V2_DECISIONS.md  D7 owner identity (Winston)
 *
 * Outputs:
 *   community/desktop-v2/import/import-payload.json   { owner, teams, identities, conflicts, ... }
 *   community/desktop-v2/import/export-2026-10-26/identities.json
 *   community/desktop-v2/import/export-2026-10-26/teams.json
 *   community/desktop-v2/import/export-2026-10-26/projects.json
 *   community/desktop-v2/import/export-2026-10-26/tasks.json
 *   community/desktop-v2/import/export-2026-10-26/token_usage.json
 *   community/desktop-v2/import/export-2026-10-26/quarantine.json
 *   (UNTRUSTED.md and DATA_INVENTORY.md are hand-written companions in the same folder.)
 *
 * Usage:
 *   node runtime/scripts/import-identities.mjs                 # write outputs
 *   node runtime/scripts/import-identities.mjs --check         # verify outputs are current
 *   node runtime/scripts/import-identities.mjs --db <path>     # override v1 DB
 *   node runtime/scripts/import-identities.mjs --main-root <p> # override main tree root
 *
 * Deterministic by design: keys are deep-sorted, every list has a fixed order, and no
 * generation timestamps are written. Source facts (task created_at, last_observed_time)
 * are data, not generation metadata.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants loaded from the v2 UI contract (apps/desktop/src/components/app/avatar.tsx)
// ---------------------------------------------------------------------------

export const AVATAR_MARKS = ['diamond', 'hex', 'shield', 'wave', 'star', 'arcs', 'ring', 'bars', 'triangle', 'moon', 'square', 'knot'];
export const AVATAR_COLORS = ['amber', 'blue', 'green', 'violet', 'teal', 'rose', 'indigo', 'graphite'];

/** Curated symbol -> supported mark. Deliberately conservative; unmapped symbols fall
 *  back to the Avatar component's monogram (first letter) which is a real render path. */
const MARK_BY_SYMBOL = new Map([
  // star glyphs
  ['✦', 'star'], // Astra
  ['✧', 'star'], // Vela
  ['✶', 'star'], // Vega
  ['✺', 'star'], // Mira
  // literal geometry
  ['⬡', 'hex'], // Orchestrator (v1 DB symbol)
  ['◈', 'diamond'], // Meridian
  ['⏣', 'triangle'], // Atlas
  ['👁', 'ring'], // Iris
  ['☀', 'ring'], // Sol (variation selector stripped)
  ['♊', 'bars'], // Gemini CLI (two pillars)
  // emoji whose shape has an obvious supported equivalent
  ['🛡', 'shield'], // Kael, Sentinel (variation selector stripped)
  ['📦', 'square'], // Gantry (package box)
  ['🪽', 'wave'], // Hermes (wing)
  ['🧭', 'arcs'], // Sage (compass arcs)
]);

// Keep the curated tables inside the v2 UI contract, so a future avatar.tsx change
// cannot silently produce an unsupported mark/colour.
for (const mark of MARK_BY_SYMBOL.values()) {
  if (!AVATAR_MARKS.includes(mark)) throw new Error(`Unsupported avatar mark in mapping table: ${mark}`);
}

/** Team -> colour (the palette is semantic in Solid Glass: colour groups the team). */
const COLOR_BY_TEAM = new Map([
  ['creativesites', 'teal'],
  ['deployfleet', 'blue'],
  ['meetingmind', 'violet'],
]);
const OWNER_COLOR = 'amber';
const UNKNOWN_TEAM_COLOR = 'graphite';
for (const color of [OWNER_COLOR, UNKNOWN_TEAM_COLOR, ...COLOR_BY_TEAM.values()]) {
  if (!AVATAR_COLORS.includes(color)) throw new Error(`Unsupported avatar colour in mapping table: ${color}`);
}

/** v1 confidence_provenance -> v2 EvidenceClass (runtime/src/api/types.ts). */
const EVIDENCE_CLASS_BY_PROVENANCE = new Map([
  ['OBSERVED', 'OBSERVED'],
  // v1 "VERIFIED_OBSERVED" means the v1 runtime observed the process, not that a
  // second agent independently re-ran the check (D9 / review 2.3). It is OBSERVED.
  ['VERIFIED_OBSERVED', 'OBSERVED'],
  ['ATTESTED', 'ATTESTED'],
  ['DECLARED', 'DECLARED'],
  ['UNVERIFIED_DECLARATION', 'DECLARED'],
  ['UNKNOWN', 'UNKNOWN'],
]);

const SOURCE_DB = 'data/myaos.db';
const SOURCE_AGENTS = 'community/agents.json';
const SOURCE_REGISTRY = 'community/AGENTS_REGISTRY.md';
const SOURCE_DECISIONS = 'community/proposals/DESKTOP_V2_DECISIONS.md';
const EXPORT_DIR_NAME = 'export-2026-10-26';

const SCHEMA_VERSION = 1;

// Columns actually read (documented again in DATA_INVENTORY.md).
const SQL = {
  identities: `SELECT id, display_name, symbol, primary_domain, team_id, lane,
      declared_capabilities, declared_responsibilities, declared_repository_ownership,
      confidence_provenance, observed_liveness, evidence_source, last_observed_time,
      joined_at, is_active
    FROM identities ORDER BY id;`,
  teams: `SELECT id, name, home_repo, bridge_partner_id FROM teams ORDER BY id;`,
  projects: `SELECT id, title, status, human_owner, repo, owner_identity_ids, target_date
    FROM projects ORDER BY id;`,
  tasks: `SELECT id, title, status, assignee_id, created_at, repo, project_id,
      original_source, original_file_path
    FROM tasks ORDER BY created_at, id;`,
  tokenLedger: `SELECT id, identity_id, model, input_tokens, output_tokens, cached_tokens,
      cost_usd, ts
    FROM token_ledger ORDER BY id;`,
  evidence: `SELECT id, task_id, verifier_identity, evidence_class, passed, details,
      exit_code, command_output, created_at
    FROM evidence ORDER BY id;`,
  missionPlans: `SELECT mission_id, title, assignee, plan_json, created_at, updated_at
    FROM jules_mission_plans ORDER BY mission_id;`,
  missionMessages: `SELECT id, mission_id, sender, text, timestamp
    FROM jules_mission_messages ORDER BY id;`,
  missionEvents: `SELECT id, ts, type, sender, task_id, payload FROM events
    WHERE type LIKE 'mission.%' OR type = 'verifier.completed'
    ORDER BY id;`,
  fakeVerificationEvents: `SELECT id, ts, type, sender, task_id, payload FROM events
    WHERE type = 'verification.passed' AND task_id LIKE 'TASK_LIVE_%'
    ORDER BY id;`,
  provenanceVerified: `SELECT id, actor, operation, reason, evidence_class, evidence FROM provenance_log
    WHERE evidence_class = 'VERIFIED' ORDER BY id;`,
  counts: `SELECT
      (SELECT count(*) FROM identities) AS identities,
      (SELECT count(*) FROM teams) AS teams,
      (SELECT count(*) FROM projects) AS projects,
      (SELECT count(*) FROM tasks) AS tasks,
      (SELECT count(*) FROM token_ledger) AS tokenLedger,
      (SELECT count(*) FROM evidence) AS evidence,
      (SELECT count(*) FROM events) AS events,
      (SELECT count(*) FROM jules_mission_plans) AS missionPlans,
      (SELECT count(*) FROM jules_mission_messages) AS missionMessages,
      (SELECT count(*) FROM provenance_log) AS provenanceLog,
      (SELECT count(*) FROM facts) AS facts,
      (SELECT count(*) FROM agent_capabilities) AS agentCapabilities;`,
};

// Repo discovery: logical project -> candidate checkouts on this machine.
const REPOSITORY_SPECS = [
  {
    key: 'myavana-chatbot',
    label: 'Myavana-Chatbot',
    dbProjectId: 'proj_chatbot',
    candidates: [{ path: '~/WebstormProjects/Myavana-Chatbot', role: 'primary' }],
  },
  {
    key: 'myavana-chatbot-dashboard',
    label: 'Myavana-Chatbot-Dashboard',
    dbProjectId: null,
    candidates: [{ path: '~/WebstormProjects/Myavana-Chatbot-Dashboard', role: 'primary' }],
  },
  {
    key: 'myavana-hair-journey-next',
    label: 'myavana-hair-journey-next',
    dbProjectId: 'proj_hair_journey',
    // v1 names this repo `myavana-hair-journey-next`; the checkout that carries that
    // name is the Local Sites plugin. The GitHub checkout is the older WP plugin.
    candidates: [
      {
        path: '~/Local Sites/myavana-hair-journey/app/public/wp-content/plugins/myavana-hair-journey-next',
        role: 'primary',
      },
      { path: '~/Documents/GitHub/Myavana-Hair-Journey', role: 'related-checkout' },
    ],
  },
  {
    key: 'react-native-sdk',
    label: 'React Native SDK',
    dbProjectId: 'proj_mobile_sdk',
    candidates: [
      { path: '~/WebstormProjects/Myavana-Chatbot/packages/react-native-sdk', role: 'primary' },
      { path: '~/WebstormProjects/MyAvana_FrontEnd_RN', role: 'related-checkout' },
    ],
  },
  {
    key: 'dogforce-odoo',
    label: 'DogForce Odoo',
    dbProjectId: null,
    candidates: [{ path: '~/Documents/GitHub/DogFrce Security Services Custom Odoo Modules', role: 'primary' }],
  },
  {
    key: 'meetingmind',
    label: 'MeetingMind',
    dbProjectId: 'proj_meetingmind',
    candidates: [{ path: '~/Documents/GitHub/MeetingMind', role: 'primary' }],
  },
  {
    key: 'deployfleet',
    label: 'DeployFleet',
    dbProjectId: 'proj_deployfleet',
    candidates: [
      { path: '~/Documents/GitHub/DeployFleet', role: 'primary' },
      { path: '~/Documents/GitHub/DeployFleet-Team', role: 'related-checkout' },
      { path: '~/Documents/GitHub/DeployFleet-website', role: 'related-checkout' },
    ],
  },
  {
    key: 'creativesites-ai-team',
    label: 'CreativeSites-Ai-Team',
    dbProjectId: 'proj_myaos',
    candidates: [{ path: '~/WebstormProjects/CreativeSites-Ai-Team', role: 'primary' }],
  },
];

const ROOT_CANDIDATES = ['~/WebstormProjects', '~/Documents/GitHub', '~/Local-Sites', '~/Local Sites'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') opts.check = true;
    else if (arg === '--db') opts.db = path.resolve(argv[(i += 1)]);
    else if (arg === '--agents') opts.agents = path.resolve(argv[(i += 1)]);
    else if (arg === '--registry') opts.registry = path.resolve(argv[(i += 1)]);
    else if (arg === '--main-root') opts.mainRoot = path.resolve(argv[(i += 1)]);
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function gitToplevel(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The script lives in a worktree during v2 development. Sources of record are the
 * main working tree (the worktree copy of data/myaos.db is the stale HEAD blob).
 */
function detectMainRoot(repoRoot) {
  const m = /^(.*)\/\.claude\/worktrees\/[^/]+$/.exec(repoRoot);
  if (m) {
    const candidate = m[1];
    if (existsSync(path.join(candidate, SOURCE_DB))) return candidate;
  }
  return repoRoot;
}

function expandHome(p) {
  return p.startsWith('~/') ? path.join(homedir(), p.slice(2)) : p;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function queryJson(dbPath, sql) {
  let out;
  try {
    out = execFileSync('sqlite3', ['-readonly', '-json', dbPath, sql], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(
      `sqlite3 CLI failed for ${dbPath} (is sqlite3 on PATH? this script has no npm dependencies).\n${error.message}`,
    );
  }
  const trimmed = out.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

function parseJsonArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanList(values) {
  const out = new Set();
  for (const value of values ?? []) {
    if (typeof value === 'string' && value.trim()) out.add(value.trim());
  }
  return [...out].sort();
}

function uniqSorted(values) {
  return cleanList(values);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortValue(value[key]);
    return sorted;
  }
  return value;
}

function toJson(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function normalizeSymbol(symbol) {
  if (!symbol) return null;
  return symbol.replace(/[\uFE0E\uFE0F]/g, '').trim() || null;
}

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

function loadSources(opts, repoRoot) {
  const mainRoot = opts.mainRoot ?? detectMainRoot(repoRoot);
  const dbPath = opts.db ?? path.join(mainRoot, SOURCE_DB);
  const agentsPath = opts.agents ?? path.join(mainRoot, SOURCE_AGENTS);
  const registryPath = opts.registry ?? path.join(mainRoot, SOURCE_REGISTRY);

  for (const [label, file] of [
    ['v1 DB', dbPath],
    ['agents.json', agentsPath],
    ['AGENTS_REGISTRY.md', registryPath],
  ]) {
    if (!existsSync(file)) throw new Error(`Missing required source (${label}): ${file}`);
  }

  const dbBuffer = readFileSync(dbPath);
  const agentsBuffer = readFileSync(agentsPath);
  const registryBuffer = readFileSync(registryPath);

  return {
    mainRoot,
    dbPath,
    agentsPath,
    registryPath,
    dbSha256: sha256(dbBuffer),
    agentsSha256: sha256(agentsBuffer),
    registrySha256: sha256(registryBuffer),
    counts: queryJson(dbPath, SQL.counts)[0],
    identities: queryJson(dbPath, SQL.identities),
    teams: queryJson(dbPath, SQL.teams),
    projects: queryJson(dbPath, SQL.projects),
    tasks: queryJson(dbPath, SQL.tasks),
    tokenLedger: queryJson(dbPath, SQL.tokenLedger),
    evidence: queryJson(dbPath, SQL.evidence),
    missionPlans: queryJson(dbPath, SQL.missionPlans),
    missionMessages: queryJson(dbPath, SQL.missionMessages),
    missionEvents: queryJson(dbPath, SQL.missionEvents),
    fakeVerificationEvents: queryJson(dbPath, SQL.fakeVerificationEvents),
    provenanceVerified: queryJson(dbPath, SQL.provenanceVerified),
    agentsDoc: readJson(agentsPath),
    registryText: registryBuffer.toString('utf8'),
  };
}

// ---------------------------------------------------------------------------
// agents.json normalisation (25 entries; some wrapped in {identity:{...}}, some flat)
// ---------------------------------------------------------------------------

function normalizeAgents(agentsDoc) {
  const byId = new Map();
  const anomalies = [];
  const entries = Array.isArray(agentsDoc?.agents) ? agentsDoc.agents : [];

  for (const entry of entries) {
    const nested = entry.identity ?? null;
    const id = String(nested?.id ?? entry.id ?? '').trim().toLowerCase();
    if (!id) {
      anomalies.push({ type: 'agents.json entry missing id', name: entry.name ?? null });
      continue;
    }

    const record = {
      id,
      name: nested?.name ?? entry.name ?? null,
      symbol: nested?.symbol ?? entry.symbol ?? null,
      primaryDomain: nested?.primary_domain ?? entry.primary_domain ?? null,
      capabilities: cleanList([
        ...(nested?.declared_capabilities ?? []),
        ...(entry.declared_capabilities ?? []),
        ...(entry.capabilities ?? []),
      ]),
      responsibilities: cleanList([
        ...(nested?.declared_responsibilities ?? []),
        ...(entry.declared_responsibilities ?? []),
        ...(entry.org_roles ?? []),
      ]),
      repositories: cleanList([
        ...(nested?.declared_repository_ownership ?? []),
        ...(entry.declared_repository_ownership ?? []),
        ...(entry.repositories ?? []),
        ...(entry.owned_paths ?? []),
      ]),
      confidenceProvenance: entry.confidence_provenance ?? null,
      evidenceSource: entry.evidence_source ?? null,
      liveness: entry.observed_liveness ?? entry.status ?? null,
      lastObservedAt: entry.last_observed_time ?? entry.last_seen ?? null,
      runtimeSessionIdentity: entry.runtime_session_identity ?? null,
      internalConflicts: [],
    };

    // agents.json carries two shapes for some identities (e.g. antigravity has both a
    // nested identity and flat per-field duplicates). Record, do not silently drop.
    if (nested) {
      for (const [field, nestedValue, flatValue] of [
        ['id', nested.id ?? null, entry.id ?? null],
        ['name', nested.name ?? null, entry.name ?? null],
        ['symbol', nested.symbol ?? null, entry.symbol ?? null],
        ['primary_domain', nested.primary_domain ?? null, entry.primary_domain ?? null],
      ]) {
        if (nestedValue != null && flatValue != null && String(nestedValue) !== String(flatValue)) {
          record.internalConflicts.push({ field, nestedValue, flatValue });
        }
      }
    }

    if (byId.has(id)) {
      anomalies.push({ type: 'agents.json duplicate id', id });
      continue;
    }
    byId.set(id, record);
  }

  return { byId, anomalies, entries };
}

// ---------------------------------------------------------------------------
// AGENTS_REGISTRY.md (23 identities; used for coverage conflicts only)
// ---------------------------------------------------------------------------

function normalizeRegistryName(value) {
  return String(value ?? '')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseRegistry(markdown) {
  const entries = [];
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^\|\s*\*\*(.+?)\*\*/.exec(lines[i]);
    if (!match) continue;
    const cells = lines[i].split('|').map((c) => c.trim());
    entries.push({
      name: normalizeRegistryName(match[1]),
      raw: match[1].replace(/[^\x20-\x7E]/g, '').trim(),
      alias: cells[2] ?? null,
      line: i + 1,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Avatar + adapter decisions
// ---------------------------------------------------------------------------

function avatarFor(identity) {
  const normalized = normalizeSymbol(identity.symbol);
  const mark = normalized ? MARK_BY_SYMBOL.get(normalized) ?? null : null;
  const color = identity.team ? COLOR_BY_TEAM.get(identity.team) ?? UNKNOWN_TEAM_COLOR : UNKNOWN_TEAM_COLOR;
  return {
    avatarMark: mark,
    avatarColor: color,
    avatarFallback: mark ? null : 'monogram',
    avatarNote: mark
      ? `symbol ${JSON.stringify(identity.symbol)} mapped to supported mark '${mark}'`
      : `symbol ${JSON.stringify(identity.symbol ?? null)} has no supported Solid Glass mark; Avatar renders the name initial (monogram fallback)`,
  };
}

const ADAPTER_BY_ID = new Map([
  ['gemini_cli', { adapter: 'gemini', confidence: 'declared', evidence: "identity id is gemini_cli; agents.json runtime_session_identity 'gemini-cli-active-session'" }],
  ['wren', { adapter: 'claude', confidence: 'inferred', evidence: "agents.json runtime_session_identity 'claude-code-session-d556d03f'" }],
]);

function adapterFor(identity) {
  if (ADAPTER_BY_ID.has(identity.id)) return ADAPTER_BY_ID.get(identity.id);
  const runtimeId = identity.runtimeHint ?? '';
  if (/(^|\s)\d+\.sock(\s|$)/.test(runtimeId)) {
    return {
      adapter: 'claude',
      confidence: 'inferred',
      evidence: `v1 runtime session identity '${runtimeId}' uses the Claude Code /tmp/cc-socks socket convention; not confirmed against a v2 ACP adapter`,
    };
  }
  return {
    adapter: null,
    confidence: 'unknown',
    evidence: 'no adapter evidence in data/myaos.db#identities or community/agents.json',
  };
}

// ---------------------------------------------------------------------------
// Identity merge: union of DB (26) and agents.json (25) -> 28 identities + owner
// ---------------------------------------------------------------------------

function buildIdentityConflicts({ id, db, ag, registryEntry, dbCaps, agCaps, dbResp, agResp, dbRepos, agRepos }) {
  const conflicts = [];
  const add = (conflict) => conflicts.push({ subjectType: 'identity', subjectId: id, ...conflict });

  if (!db) {
    add({
      field: 'presence',
      severity: 'coverage',
      sources: { myaosDb: null, agentsJson: 'present', agentsRegistry: registryEntry ? 'present' : null },
      resolution: 'included from community/agents.json; team_id, lane, capabilities and DB provenance are unknown (null) for this identity',
    });
  }
  if (!ag) {
    add({
      field: 'presence',
      severity: 'coverage',
      sources: { myaosDb: 'present', agentsJson: null, agentsRegistry: registryEntry ? 'present' : null },
      resolution: 'included from data/myaos.db#identities; agents.json has no entry (no declared repos/responsibilities from that source)',
    });
  }
  if (!registryEntry) {
    add({
      field: 'presence',
      severity: 'coverage',
      sources: { myaosDb: db ? 'present' : null, agentsJson: ag ? 'present' : null, agentsRegistry: null },
      resolution: 'identity exists in the machine sources but is absent from community/AGENTS_REGISTRY.md (markdown roster is stale)',
    });
  }
  if (db && ag) {
    for (const [field, dbValue, agValue] of [
      ['name', db.display_name ?? null, ag.name ?? null],
      ['symbol', db.symbol ?? null, ag.symbol ?? null],
      ['primary_domain', db.primary_domain ?? null, ag.primaryDomain ?? null],
      ['confidence_provenance', db.confidence_provenance ?? null, ag.confidenceProvenance ?? null],
      ['observed_liveness', db.observed_liveness ?? null, ag.liveness ?? null],
    ]) {
      if (dbValue != null && agValue != null && dbValue !== agValue) {
        add({
          field,
          severity: field === 'observed_liveness' ? 'informational' : 'material',
          sources: { myaosDb: dbValue, agentsJson: agValue },
          resolution: 'data/myaos.db#identities preferred (system of record); agents.json value preserved here',
        });
      }
    }
    if (dbCaps.join('|') !== agCaps.join('|')) {
      add({
        field: 'capabilities',
        severity: 'informational',
        sources: { myaosDb: dbCaps, agentsJson: agCaps },
        resolution: 'union of DB declared_capabilities and agents.json declared_capabilities/capabilities (sorted, deduped)',
        note: `agents.json adds: ${agCaps.filter((c) => !dbCaps.includes(c)).join(', ') || '(none)'}; DB-only: ${dbCaps.filter((c) => !agCaps.includes(c)).join(', ') || '(none)'}`,
      });
    }
    if (dbResp.join('|') !== agResp.join('|')) {
      add({
        field: 'responsibilities',
        severity: 'informational',
        sources: { myaosDb: dbResp, agentsJson: agResp },
        resolution: 'union of DB declared_responsibilities and agents.json declared_responsibilities/org_roles',
        note: `agents.json adds: ${agResp.filter((c) => !dbResp.includes(c)).join(', ') || '(none)'}; DB-only: ${dbResp.filter((c) => !agResp.includes(c)).join(', ') || '(none)'}`,
      });
    }
    if (dbRepos.join('|') !== agRepos.join('|')) {
      add({
        field: 'repository_ownership',
        severity: 'informational',
        sources: { myaosDb: dbRepos, agentsJson: agRepos },
        resolution: 'union of DB declared_repository_ownership and agents.json declared_repository_ownership/repositories/owned_paths',
      });
    }
  }
  if (ag && ag.internalConflicts.length > 0) {
    add({
      field: 'agents_json_internal_duplicate',
      severity: 'material',
      sources: { myaosDb: db ? 'present' : null, agentsJson: ag.internalConflicts },
      resolution: 'nested {identity:{...}} values preferred over flat duplicate fields; both recorded here',
      note: 'agents.json carries two shapes for one entry (nested identity + flat id/name/symbol/primary_domain)',
    });
  }
  return conflicts;
}

function mergeIdentities({ source, agents, registryEntries }) {
  const conflicts = [];
  const anomalies = [...agents.anomalies];
  const dbById = new Map(source.identities.map((row) => [row.id, row]));
  const teamIds = new Set(source.teams.map((t) => t.id));
  const registryIndex = new Map();
  for (const entry of registryEntries) registryIndex.set(entry.name, entry);

  const allIds = uniqSorted([...source.identities.map((r) => r.id), ...agents.byId.keys()]);
  const identities = [];
  const internal = [];

  for (const id of allIds) {
    const db = dbById.get(id) ?? null;
    const ag = agents.byId.get(id) ?? null;
    const dbCaps = cleanList(parseJsonArray(db?.declared_capabilities));
    const agCaps = ag?.capabilities ?? [];
    const dbResp = cleanList(parseJsonArray(db?.declared_responsibilities));
    const agResp = ag?.responsibilities ?? [];
    const dbRepos = cleanList(parseJsonArray(db?.declared_repository_ownership));
    const agRepos = ag?.repositories ?? [];

    const name = db?.display_name ?? ag?.name ?? id;
    const registryEntry =
      registryIndex.get(normalizeRegistryName(name)) ??
      registryIndex.get(normalizeRegistryName(ag?.name)) ??
      registryIndex.get(normalizeRegistryName(db?.display_name)) ??
      null;

    const team = db?.team_id && teamIds.has(db.team_id) ? db.team_id : null;
    const lane = db?.lane ?? null;
    const symbol = db?.symbol ?? ag?.symbol ?? null;

    const capabilities = uniqSorted([...dbCaps, ...agCaps]);
    const responsibilities = uniqSorted([...dbResp, ...agResp]);
    const repositories = uniqSorted([...dbRepos, ...agRepos]);
    const primaryDomain = db?.primary_domain ?? ag?.primaryDomain ?? null;
    // `role` is the v2 Identity.role field: use the primary domain (a stable short title).
    // The full declared responsibilities are kept in `responsibilities`.
    const role = primaryDomain;
    const provenance = db?.confidence_provenance ?? ag?.confidenceProvenance ?? null;
    const evidenceClass = EVIDENCE_CLASS_BY_PROVENANCE.get(provenance) ?? 'UNKNOWN';
    const provenanceNote =
      provenance === 'VERIFIED_OBSERVED'
        ? 'v1 VERIFIED_OBSERVED = observed by the v1 runtime, not independently re-verified by a second agent; mapped to OBSERVED per DESKTOP_V2_DECISIONS D9'
        : provenance === 'UNVERIFIED_DECLARATION'
          ? 'v1 UNVERIFIED_DECLARATION = declared, explicitly not verified; mapped to DECLARED (Claimed) - do not upgrade without new evidence'
          : null;
    const liveness = db?.observed_liveness ?? ag?.liveness ?? 'UNKNOWN';
    const livenessSource = db?.evidence_source ?? ag?.evidenceSource ?? null;
    const lastObservedAt = db?.last_observed_time ?? ag?.lastObservedAt ?? null;
    const joinedAt = db?.joined_at ?? null;
    const isActive = db?.is_active == null ? null : Boolean(db.is_active);

    const files = {
      db: dbIdentifier(db),
      agents: ag ? SOURCE_AGENTS : null,
      registry: registryEntry ? `${SOURCE_REGISTRY} line ${registryEntry.line}` : null,
    };
    const sources = [files.db, files.agents, files.registry].filter(Boolean);

    const identity = {
      id,
      name,
      role,
      primaryDomain,
      team,
      lane,
      symbol,
      avatarMark: null,
      avatarColor: null,
      avatarFallback: null,
      avatarNote: null,
      capabilities,
      responsibilities,
      repositories,
      provenance,
      evidenceClass,
      provenanceNote,
      liveness,
      livenessSource,
      lastObservedAt,
      joinedAt,
      isActive,
      runtimeHint: ag?.runtimeSessionIdentity ?? null,
      adapter: null,
      adapterConfidence: 'unknown',
      adapterEvidence: null,
      seats: [],
      flags: [],
      sources,
    };

    const avatar = avatarFor(identity);
    Object.assign(identity, avatar);

    const adapter = adapterFor(identity);
    identity.adapter = adapter.adapter;
    identity.adapterConfidence = adapter.confidence;
    identity.adapterEvidence = adapter.evidence;

    identity.flags = [];
    if (!db) identity.flags.push('missing-from-myaos-db');
    if (!ag) identity.flags.push('missing-from-community-agents-json');
    if (!registryEntry) identity.flags.push('missing-from-agents-registry-md');
    if (id === 'test_spec') identity.flags.push('synthetic-test-fixture');
    if (id === 'meridian') identity.flags.push('identity-name-collision');
    if (id === 'iris') identity.flags.push('planner-role-disputed');
    if (id === 'nexus') identity.flags.push('role-unresolved');
    if (ag && ag.internalConflicts.length > 0) identity.flags.push('agents-json-internal-conflict');
    if (provenance === 'UNVERIFIED_DECLARATION') identity.flags.push('provenance-unverified-declaration');
    if (!team) identity.flags.push('team-unknown');
    if (!adapter.adapter) identity.flags.push('adapter-unknown');
    identity.flags.sort();

    conflicts.push(
      ...buildIdentityConflicts({ id, db, ag, registryEntry, dbCaps, agCaps, dbResp, agResp, dbRepos, agRepos }),
    );
    identities.push(identity);
    internal.push({ id, db, ag });
  }

  // Symbol collisions (same raw glyph used by more than one identity) affect the avatar contract.
  const bySymbol = new Map();
  for (const identity of identities) {
    const s = normalizeSymbol(identity.symbol);
    if (!s) continue;
    if (!bySymbol.has(s)) bySymbol.set(s, []);
    bySymbol.get(s).push(identity.id);
  }
  for (const [symbol, ids] of [...bySymbol.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const identity = identities.find((i) => i.id === id);
      identity.flags.push('symbol-collision');
      identity.flags.sort();
    }
    conflicts.push({
      subjectType: 'identity',
      subjectId: ids.sort().join(','),
      field: 'symbol',
      severity: 'informational',
      sources: { myaosDb: null, agentsJson: null, agentsRegistry: null },
      resolution: `shared glyph ${JSON.stringify(symbol)}; avatarMark/avatarColor differ per team so avatars still resolve distinctly`,
      note: 'Solid Glass avatars are a mark + colour, not a face; duplicate glyphs are allowed but flagged',
    });
  }

  return { identities, conflicts, anomalies, internal };
}

function dbIdentifier(db) {
  return db ? `${SOURCE_DB}#identities` : null;
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

function buildTeams({ source, identities, repoIndex }) {
  const conflicts = [];
  const teams = [];
  for (const row of source.teams) {
    const members = identities
      .filter((identity) => identity.team === row.id)
      .map((identity) => identity.id)
      .sort();
    const homeRepoPath = row.home_repo ? repoIndex.get(row.home_repo) ?? null : null;
    const homeRepoObserved = Boolean(homeRepoPath && existsSync(homeRepoPath));
    const flags = [];
    if (members.length === 0) flags.push('team-has-no-identities');
    if (row.home_repo && !homeRepoObserved) flags.push('home-repo-not-observed-on-this-machine');
    if (row.bridge_partner_id && !source.teams.some((t) => t.id === row.bridge_partner_id)) {
      flags.push('bridge-partner-missing');
    }
    teams.push({
      id: row.id,
      name: row.name,
      homeRepo: row.home_repo ?? null,
      homeRepoPath,
      homeRepoObserved,
      bridgePartnerId: row.bridge_partner_id ?? null,
      leadIdentityId: null,
      memberCount: members.length,
      members,
      source: `${SOURCE_DB}#teams`,
      flags: flags.sort(),
    });
    if (members.length === 0) {
      conflicts.push({
        subjectType: 'team',
        subjectId: row.id,
        field: 'members',
        severity: 'material',
        sources: { myaosDb: 'teams row exists', agentsJson: 'agents.json has no team field', agentsRegistry: null },
        resolution: 'team imported with memberCount 0; no identity in identities.team_id points at it. Lead must assign members or drop the team before Phase 4',
      });
    }
  }

  // Leader of each team is not recorded anywhere (no teams.lead column, no agents.json
  // field); do not invent one. Recorded as an explicit unknown in DATA_INVENTORY.md.
  const byId = new Map(teams.map((t) => [t.id, t]));
  for (const team of teams) {
    const partner = team.bridgePartnerId ? byId.get(team.bridgePartnerId) : null;
    if (partner && partner.bridgePartnerId !== team.id) {
      conflicts.push({
        subjectType: 'team',
        subjectId: team.id,
        field: 'bridge_partner_id',
        severity: 'informational',
        sources: { myaosDb: partner.bridgePartnerId, agentsJson: null, agentsRegistry: null },
        resolution: `bridge is asymmetric: ${team.id} -> ${team.bridgePartnerId}, but ${partner.id} -> ${partner.bridgePartnerId}; kept as stored, flagged for Lead`,
      });
    }
  }
  return { teams, conflicts };
}

// ---------------------------------------------------------------------------
// Owner (Winston) — DESKTOP_V2_DECISIONS.md D7
// ---------------------------------------------------------------------------

function buildOwner(source) {
  return {
    id: 'winston',
    name: 'Winston',
    role: 'Owner / Founder',
    primaryDomain: 'Owner / Founder',
    team: null,
    teams: source.teams.map((t) => t.id).sort(),
    lane: 'owner',
    symbol: null,
    avatarMark: null,
    avatarColor: OWNER_COLOR,
    avatarFallback: 'monogram',
    avatarNote: 'owner identity renders via OwnerAvatar (light disc with the initial); no supported mark assigned',
    capabilities: [],
    responsibilities: [],
    repositories: [],
    provenance: 'DECLARED',
    evidenceClass: 'DECLARED',
    provenanceNote: 'declared by Winston in DESKTOP_V2_DECISIONS.md D7 (owner identity, approval_level owner)',
    liveness: 'UNKNOWN',
    livenessSource: null,
    lastObservedAt: null,
    joinedAt: null,
    isActive: null,
    runtimeHint: null,
    adapter: null,
    adapterConfidence: 'unknown',
    adapterEvidence: 'not configured yet; settings.ownerId = winston (D7)',
    seats: [],
    flags: [],
    sources: [SOURCE_DECISIONS + '#D7'],
    approvalLevel: 'owner',
    isOwner: true,
    settings: { ownerId: 'winston' },
  };
}

// ---------------------------------------------------------------------------
// Semantic conflicts that the raw JSON cannot express (registry + decisions prose)
// ---------------------------------------------------------------------------

function semanticConflicts() {
  return [
    {
      subjectType: 'identity',
      subjectId: 'meridian',
      field: 'identity-name-collision',
      severity: 'material',
      sources: {
        myaosDb: 'single identities row id=meridian, team=creativesites, lane=infrastructure',
        agentsJson: null,
        agentsRegistry: 'row: "Identity currently contested: another live session has also used \\"Meridian\\" this week (unresolved collision, not a settled name)"',
      },
      resolution: 'import exactly one identity id=meridian (flagged identity-name-collision); do not split or rename without Winston; the ownership of the id is unresolved in the sources',
    },
    {
      subjectType: 'identity',
      subjectId: 'iris',
      field: 'role',
      severity: 'material',
      sources: {
        myaosDb: 'declared_responsibilities includes "Planner (confirmed by Winston, 2026-09-09)"',
        agentsJson: 'declared_responsibilities includes "Lead Planner"',
        agentsRegistry: 'Open item #1: the "confirmed as the second Planner by Winston" claim was checked against human_decisions (zero rows) and retracted; Iris self-assessed verification/orchestration, not planning',
      },
      resolution: 'import responsibilities as DECLARED claims; do not present Iris as a confirmed planner; flag planner-role-disputed',
    },
    {
      subjectType: 'identity',
      subjectId: 'nexus',
      field: 'role',
      severity: 'material',
      sources: {
        myaosDb: 'role/domain: Orchestration Platform Engineering, lane=engineering',
        agentsJson: 'declared_responsibilities: Runtime Operator, Bus Architect; confidence_provenance UNVERIFIED_DECLARATION',
        agentsRegistry: 'Status UNKNOWN, primary domain unresolved; needs self-assessment before any role revision',
      },
      resolution: 'import DB values but flag role-unresolved; do not treat Nexus role as observed',
    },
    {
      subjectType: 'identity',
      subjectId: 'test_spec',
      field: 'synthetic-test-fixture',
      severity: 'material',
      sources: {
        myaosDb: 'id=test_spec display_name="Specialist Test", primary_domain="Quality Automation", evidence_source null, declared_responsibilities ["Verify substrate integrity"]',
        agentsJson: null,
        agentsRegistry: null,
      },
      resolution: 'included because it is a real DB row, flagged synthetic-test-fixture; Lead should decide to exclude it from the v2 store (it looks like a test fixture, not a teammate)',
    },
    {
      subjectType: 'identity',
      subjectId: 'orchestrator,synapse',
      field: 'role-overlap',
      severity: 'informational',
      sources: {
        myaosDb: 'orchestrator: Autonomous Organization Routing; synapse: MeetingMind Squad Architecture',
        agentsJson: 'orchestrator: Autonomous Dispatcher; synapse: Permanent MeetingMind Orchestrator',
        agentsRegistry: 'Synapse is MeetingMind orchestrator; orchestrator is not in the registry',
      },
      resolution: 'keep both identities; scopes overlap (orchestrator=global, synapse=meetingmind); no merge performed',
    },
    {
      subjectType: 'team',
      subjectId: 'deployfleet',
      field: 'home_repo',
      severity: 'material',
      sources: {
        myaosDb: 'teams.home_repo="DeployFleet-Team"; projects.proj_deployfleet.repo="/Users/winstonzulu/Documents/GitHub/DeployFleet"',
        agentsJson: 'no repo for DeployFleet team (no team field)',
        agentsRegistry: 'no DeployFleet identities listed',
      },
      resolution: 'keep teams.home_repo="DeployFleet-Team" as stored; projects.json records both checkouts as observed; Lead must decide the canonical DeployFleet repo',
    },
  ];
}

// ---------------------------------------------------------------------------
// Projects / repo discovery
// ---------------------------------------------------------------------------

function gitInfo(dir) {
  try {
    const branch = execFileSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const headSha = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const dirtyRaw = execFileSync('git', ['-C', dir, 'status', '--porcelain'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let remote = null;
    try {
      remote = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      remote = null;
    }
    return {
      isGitRepo: true,
      branch,
      headSha,
      dirtyFileCount: dirtyRaw.split('\n').filter(Boolean).length,
      // strip credentials if a remote embeds a token (never export secrets)
      remote: remote ? remote.replace(/\/\/[^@/]+@/, '//') : null,
    };
  } catch {
    return { isGitRepo: false, branch: null, headSha: null, dirtyFileCount: null, remote: null };
  }
}

function discoverRepositories() {
  const rootsProbed = ROOT_CANDIDATES.map((candidate) => {
    const resolved = expandHome(candidate);
    return { path: resolved, observed: existsSync(resolved) };
  });
  const repositories = REPOSITORY_SPECS.map((spec) => {
    const candidates = spec.candidates.map((candidate) => {
      const resolved = path.resolve(expandHome(candidate.path));
      const observed = existsSync(resolved);
      return {
        path: resolved,
        role: candidate.role,
        observed,
        git: observed ? gitInfo(resolved) : { isGitRepo: false, branch: null, headSha: null, dirtyFileCount: null, remote: null },
      };
    });
    const primary = candidates.find((candidate) => candidate.role === 'primary' && candidate.observed) ?? null;
    const observed = Boolean(primary);
    return {
      key: spec.key,
      label: spec.label,
      dbProjectId: spec.dbProjectId,
      observed,
      observedPath: primary ? primary.path : null,
      candidates,
    };
  });
  return { rootsProbed, repositories };
}

function buildProjects({ source, discovery }) {
  const conflicts = [];
  const dbProjects = source.projects.map((row) => ({
    id: row.id,
    title: row.title,
    name: row.title,
    status: row.status,
    humanOwner: row.human_owner,
    repo: row.repo,
    ownerIdentityIds: cleanList(parseJsonArray(row.owner_identity_ids)),
    targetDate: row.target_date ?? null,
    source: `${SOURCE_DB}#projects`,
  }));

  const repositories = discovery.repositories.map((repo) => {
    const dbProject = repo.dbProjectId ? dbProjects.find((p) => p.id === repo.dbProjectId) ?? null : null;
    if (!repo.dbProjectId) {
      conflicts.push({
        subjectType: 'project',
        subjectId: repo.key,
        field: 'presence',
        severity: 'coverage',
        sources: {
          myaosDb: null,
          agentsJson: null,
          agentsRegistry: null,
        },
        resolution: `observed checkout has no data/myaos.db#projects row; exported as a v2 project candidate with dbProjectId null`,
      });
    }
    if (repo.observed && dbProject?.repo && !dbProject.repo.startsWith('/') && dbProject.repo !== repo.label) {
      conflicts.push({
        subjectType: 'project',
        subjectId: dbProject.id,
        field: 'repo_path',
        severity: 'informational',
        sources: {
          myaosDb: dbProject.repo,
          agentsJson: null,
          agentsRegistry: null,
        },
        resolution: `DB stores repo name "${dbProject.repo}"; discovered checkout is "${repo.observedPath}"; both recorded`,
      });
    }
    if (repo.key === 'myavana-hair-journey-next') {
      conflicts.push({
        subjectType: 'project',
        subjectId: dbProject?.id ?? 'proj_hair_journey',
        field: 'repo_path',
        severity: 'material',
        sources: {
          myaosDb: 'proj_hair_journey.repo="myavana-hair-journey-next"',
          agentsJson: 'agents.json lists "myavana-hair-journey-next" for Vela/Antigravity/Wren',
          agentsRegistry: 'v1 evidence_source references cwd ".../myavana-hair-journey" (ambiguous between three checkouts)',
        },
        resolution: 'primary observed path is the Local Sites plugin named myavana-hair-journey-next (branch site-growth-upsell, remote Myavana-Hair-Journey-Plugin); ~/Documents/GitHub/Myavana-Hair-Journey is a different WP plugin checkout and is recorded as related-checkout',
      });
    }
    if (repo.key === 'deployfleet') {
      conflicts.push({
        subjectType: 'project',
        subjectId: 'proj_deployfleet',
        field: 'repo_path',
        severity: 'material',
        sources: {
          myaosDb: '/Users/winstonzulu/Documents/GitHub/DeployFleet',
          agentsJson: null,
          agentsRegistry: 'teams.home_repo="DeployFleet-Team"',
        },
        resolution: 'three observed checkouts exist (DeployFleet, DeployFleet-Team, DeployFleet-website); primary chosen from the DB projects.repo; Lead must pick the canonical repo for the room',
      });
    }
    return {
      ...repo,
      dbProject,
    };
  });

  return {
    dbProjects,
    rootsProbed: discovery.rootsProbed,
    repositories,
    conflicts,
  };
}

// ---------------------------------------------------------------------------
// Tasks + token usage (real rows only, as stored)
// ---------------------------------------------------------------------------

function buildTasks({ source, identityNameById }) {
  const tasks = source.tasks.map((row) => ({
    id: row.id,
    title: typeof row.title === 'string' ? row.title.replace(/\t+$/, '').trimEnd() : row.title,
    rawTitle: row.title,
    status: row.status,
    assignee: row.assignee_id ?? null,
    assigneeName: row.assignee_id ? identityNameById.get(row.assignee_id) ?? null : null,
    createdAt: row.created_at,
    repo: row.repo ?? null,
    projectId: row.project_id ?? null,
    originalSource: row.original_source ?? null,
    originalFilePath: row.original_file_path ?? null,
  }));
  const byStatus = {};
  for (const task of tasks) byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
  return {
    rowCount: tasks.length,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([a], [b]) => a.localeCompare(b))),
    rows: tasks,
  };
}

function round(value, digits = 8) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function buildTokenUsage({ source }) {
  const rows = source.tokenLedger.map((row) => {
    const inputTokens = Number(row.input_tokens ?? 0);
    const outputTokens = Number(row.output_tokens ?? 0);
    const cachedTokens = Number(row.cached_tokens ?? 0);
    return {
      id: Number(row.id),
      identityId: row.identity_id,
      model: row.model,
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd: row.cost_usd == null ? null : round(Number(row.cost_usd)),
      ts: row.ts,
    };
  });
  const totals = rows.reduce(
    (acc, row) => {
      acc.inputTokens += row.inputTokens;
      acc.outputTokens += row.outputTokens;
      acc.cachedTokens += row.cachedTokens;
      acc.totalTokens += row.totalTokens;
      acc.costUsd += row.costUsd ?? 0;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, costUsd: 0 },
  );
  totals.costUsd = round(totals.costUsd);
  return { rowCount: rows.length, totals, rows };
}

// ---------------------------------------------------------------------------
// Quarantine (machine-readable companion to UNTRUSTED.md)
// ---------------------------------------------------------------------------

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .sort()
    .map((name) => path.join(dir, name));
}

function buildQuarantine({ source, mainRoot }) {
  const taskAssignee = new Map(source.tasks.map((task) => [task.id, task.assignee_id ?? null]));
  const fakeSeedEvidence = source.evidence
    .filter((row) => String(row.task_id ?? '').startsWith('TASK_LIVE_'))
    .map((row) => ({
      id: Number(row.id),
      taskId: row.task_id,
      evidenceClass: row.evidence_class,
      verifier: row.verifier_identity,
      details: row.details,
      reason:
        'seed/self-test evidence: the "verified_files" are fake 206-byte SUCCESS stubs under data/artifacts/, not machine-observed runs',
    }));

  const selfVerifiedEvidence = source.evidence
    .filter(
      (row) =>
        row.evidence_class === 'VERIFIED' &&
        taskAssignee.get(row.task_id) != null &&
        taskAssignee.get(row.task_id) === row.verifier_identity,
    )
    .map((row) => ({
      id: Number(row.id),
      taskId: row.task_id,
      verifier: row.verifier_identity,
      assignee: taskAssignee.get(row.task_id),
      details: row.details,
      reason: 'verifier_identity equals the task assignee: self-verified, so VERIFIED is not independent; import as ATTESTED/Claimed at most',
    }));

  const proofArtifacts = [...listFiles(path.join(mainRoot, 'data', 'artifacts')), ...listFiles(path.join(mainRoot, 'data', 'proof_bundles'))]
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({
      path: path.relative(mainRoot, file),
      sha256: sha256(readFileSync(file)),
      reason:
        'worker SUCCESS artifact / proof bundle generated by the v1 orchestrator self-test: asserts status=SUCCESS / verification_status=VERIFIED without any real check; the bundle\'s "independent verification" command only re-reads the same stub file',
    }));

  const missionPlans = source.missionPlans.map((plan) => {
    let stages = [];
    try {
      stages = JSON.parse(plan.plan_json)?.stages ?? [];
    } catch {
      stages = [];
    }
    const proofStage = stages.find((stage) => /proof|verif/i.test(String(stage.name ?? ''))) ?? null;
    return {
      missionId: plan.mission_id,
      title: plan.title,
      assignee: plan.assignee,
      proofStage: proofStage ? { name: proofStage.name, status: proofStage.status } : null,
      evidenceRowsLinkingMission: 0,
      reason: proofStage?.status === 'completed'
        ? 'mission pipeline stage "Machine Proof" is marked completed, but no evidence row anywhere references this mission; the "Independent Verification Complete" message is auto-generated'
        : 'mission pipeline row; no evidence rows link to it. Not importable as evidence even where the proof stage is still pending',
    };
  });

  const missionMessages = source.missionMessages
    .filter((row) => /Independent Verification Complete|Evidence recorded to SQLite substrate/i.test(row.text ?? ''))
    .map((row) => ({
      id: Number(row.id),
      missionId: row.mission_id,
      sender: row.sender,
      snippet: String(row.text ?? '').replace(/\s+/g, ' ').slice(0, 160),
      reason: 'auto-generated "verification complete" claim; the matching verifier.completed event payload is unrelated chat text, and no evidence row exists',
    }));

  const missionEventIds = source.missionEvents.map((event) => Number(event.id));
  const verifierCompletedEventIds = source.missionEvents
    .filter((event) => event.type === 'verifier.completed')
    .map((event) => Number(event.id));
  const verifierDispatchedEventIds = source.missionEvents
    .filter((event) => event.type === 'mission.verifier_dispatched')
    .map((event) => Number(event.id));
  const fakeVerificationEventIds = source.fakeVerificationEvents.map((event) => Number(event.id));

  const provenanceVerifiedIds = source.provenanceVerified
    .filter((row) => /TASK_LIVE_|MIGRATION_PHASE1_COMPLETE/i.test(`${row.operation ?? ''} ${row.reason ?? ''} ${row.evidence ?? ''}`))
    .map((row) => Number(row.id));

  const syntheticTasks = source.tasks
    .filter((task) => String(task.id).startsWith('TASK_LIVE_'))
    .map((task) => ({ id: task.id, title: task.title, status: task.status, reason: 'orchestrator self-test task; its proof artifact is a stub' }));

  const titleGroups = new Map();
  for (const task of source.tasks) {
    const key = String(task.title ?? '').replace(/\s+/g, ' ').trim();
    if (!titleGroups.has(key)) titleGroups.set(key, []);
    titleGroups.get(key).push(task.id);
  }
  const duplicateTitles = [...titleGroups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([title, ids]) => ({
      title,
      ids: ids.sort(),
      reason: 'same title appears on multiple task rows (re-run / duplicate dispatch artifacts); keep as real rows but do not treat them as distinct work items without review',
    }))
    .sort((a, b) => (a.title < b.title ? -1 : 1));

  const legacyLiveState = [
    'community/events.ndjson',
    'community/tasks.json',
    'data/events.ndjson',
    'data/tasks.json',
    'data/runtime_handshakes.json',
    'data/runtime_sessions.json',
    'data/provenance.log',
  ]
    .map((relative) => ({ path: relative, observed: existsSync(path.join(mainRoot, relative)) }))
    .filter((entry) => entry.observed);

  return {
    fakeSeedEvidence,
    selfVerifiedEvidence,
    proofArtifacts,
    missionPipeline: {
      plans: missionPlans,
      messages: missionMessages,
      eventIds: missionEventIds,
      verifierCompletedEventIds,
      verifierDispatchedEventIds,
      note: 'mission.* and verifier.completed events are orchestration log lines, not evidence; do not import them into the v2 evidence ledger',
    },
    fakeVerificationEventIds,
    provenanceVerifiedIds,
    syntheticTasks,
    duplicateTitles,
    legacyLiveState,
  };
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

export function build({ opts = {}, repoRoot }) {
  const source = loadSources(opts, repoRoot);
  const agents = normalizeAgents(source.agentsDoc);
  const registryEntries = parseRegistry(source.registryText);
  const merge = mergeIdentities({ source, agents, registryEntries });
  const discovery = discoverRepositories();

  const repoIndex = new Map();
  for (const repo of discovery.repositories) {
    if (repo.observedPath) repoIndex.set(repo.label, repo.observedPath);
    // teams.home_repo / projects.repo use repo names, which may not equal our label
    // (e.g. "DeployFleet-Team"). Index every observed candidate by basename too.
    for (const candidate of repo.candidates) {
      if (candidate.observed) repoIndex.set(path.basename(candidate.path), candidate.path);
    }
  }
  for (const team of source.teams) {
    const match = discovery.repositories.find((repo) => repo.label === team.home_repo);
    if (match?.observedPath) repoIndex.set(team.home_repo, match.observedPath);
  }

  const teamsBuild = buildTeams({ source, identities: merge.identities, repoIndex });
  const projectsBuild = buildProjects({ source, discovery });
  const owner = buildOwner(source);

  const conflicts = [...merge.conflicts, ...semanticConflicts(), ...teamsBuild.conflicts, ...projectsBuild.conflicts]
    .sort((a, b) => {
      const keyA = `${a.subjectType}\u0000${a.subjectId}\u0000${a.field}`;
      const keyB = `${b.subjectType}\u0000${b.subjectId}\u0000${b.field}`;
      return keyA.localeCompare(keyB);
    })
    .map((conflict, index) => ({ id: `conflict-${String(index + 1).padStart(3, '0')}`, ...conflict }));

  const byField = {};
  const bySeverity = {};
  for (const conflict of conflicts) {
    byField[conflict.field] = (byField[conflict.field] ?? 0) + 1;
    bySeverity[conflict.severity] = (bySeverity[conflict.severity] ?? 0) + 1;
  }

  const identityNameById = new Map(merge.identities.map((identity) => [identity.id, identity.name]));
  const tasks = buildTasks({ source, identityNameById });
  const tokenUsage = buildTokenUsage({ source });
  const quarantine = buildQuarantine({ source, mainRoot: source.mainRoot });

  const assets = {
    schemaVersion: SCHEMA_VERSION,
    source: {
      v1Db: { path: SOURCE_DB, sha256: source.dbSha256, rowCounts: source.counts },
      communityAgentsJson: { path: SOURCE_AGENTS, sha256: source.agentsSha256, entryCount: agents.entries.length },
      agentsRegistryMarkdown: { path: SOURCE_REGISTRY, sha256: source.registrySha256, identityCount: registryEntries.length },
      decisions: { path: SOURCE_DECISIONS, decisionIds: ['D3', 'D7', 'D10'] },
    },
  };

  const stats = {
    identitiesFromDb: source.counts.identities,
    identitiesFromAgentsJson: agents.entries.length,
    identitiesFromRegistry: registryEntries.length,
    mergedIdentities: merge.identities.length,
    owners: 1,
    teams: teamsBuild.teams.length,
    conflicts: { total: conflicts.length, bySeverity, byField },
  };

  const payload = {
    ...assets,
    stats,
    owner,
    teams: teamsBuild.teams,
    identities: merge.identities,
    conflicts,
  };

  const identitiesFile = {
    ...assets,
    stats,
    owner,
    identities: merge.identities,
    conflicts,
  };

  const teamsFile = {
    ...assets,
    teams: teamsBuild.teams,
  };

  const projectsFile = {
    ...assets,
    projects: {
      dbProjects: projectsBuild.dbProjects,
      rootsProbed: projectsBuild.rootsProbed,
      repositories: projectsBuild.repositories,
    },
  };

  const tasksFile = {
    ...assets,
    tasks,
  };

  const tokenUsageFile = {
    ...assets,
    tokenUsage,
  };

  const quarantineFile = {
    ...assets,
    quarantine,
  };

  return { payload, identitiesFile, teamsFile, projectsFile, tasksFile, tokenUsageFile, quarantineFile, source, discovery, stats, conflicts };
}

function fileMap({ repoRoot, files }) {
  const importDir = path.join(repoRoot, 'community', 'desktop-v2', 'import');
  const exportDir = path.join(importDir, EXPORT_DIR_NAME);
  return new Map([
    [path.join(importDir, 'import-payload.json'), toJson(files.payload)],
    [path.join(exportDir, 'identities.json'), toJson(files.identitiesFile)],
    [path.join(exportDir, 'teams.json'), toJson(files.teamsFile)],
    [path.join(exportDir, 'projects.json'), toJson(files.projectsFile)],
    [path.join(exportDir, 'tasks.json'), toJson(files.tasksFile)],
    [path.join(exportDir, 'token_usage.json'), toJson(files.tokenUsageFile)],
    [path.join(exportDir, 'quarantine.json'), toJson(files.quarantineFile)],
  ]);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      'Usage: node runtime/scripts/import-identities.mjs [--check] [--db <v1-db>] [--agents <agents.json>] [--registry <AGENTS_REGISTRY.md>] [--main-root <dir>]\n',
    );
    return;
  }

  const repoRoot = gitToplevel(SCRIPT_DIR) ?? path.resolve(SCRIPT_DIR, '..', '..');
  const built = build({ opts, repoRoot });
  const files = fileMap({ repoRoot, files: built });
  let changed = 0;
  for (const [file, content] of files) {
    if (opts.check) {
      if (!existsSync(file)) {
        process.stdout.write(`MISSING ${path.relative(repoRoot, file)}\n`);
        changed += 1;
        continue;
      }
      if (readFileSync(file, 'utf8') !== content) {
        process.stdout.write(`DIFF    ${path.relative(repoRoot, file)}\n`);
        changed += 1;
      }
      continue;
    }
    mkdirSync(path.dirname(file), { recursive: true });
    if (existsSync(file) && readFileSync(file, 'utf8') === content) continue;
    writeFileSync(file, content);
    process.stdout.write(`wrote   ${path.relative(repoRoot, file)}\n`);
  }

  if (opts.check) {
    if (changed === 0) {
      process.stdout.write('OK: all generated export files match the source data.\n');
    } else {
      process.stdout.write(`STALE: ${changed} file(s) differ. Re-run without --check.\n`);
      process.exitCode = 1;
    }
    return;
  }

  const { stats, source } = built;
  process.stdout.write(
    [
      `identities: ${stats.mergedIdentities} (db ${stats.identitiesFromDb} + agents.json ${stats.identitiesFromAgentsJson}, union) + owner winston`,
      `teams: ${stats.teams}; tasks: ${built.tasksFile.tasks.rowCount}; token rows: ${built.tokenUsageFile.tokenUsage.rowCount}; conflicts: ${stats.conflicts.total}`,
      `source db: ${source.dbPath} sha256=${source.dbSha256}`,
      '',
    ].join('\n'),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
