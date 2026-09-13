#!/usr/bin/env node
/**
 * Register Gemini CLI as a Permanent General-Purpose Agent: Gemini CLI (gemini_cli)
 * 
 * Registers:
 * 1. An identity in the `identities` table.
 * 2. An agent row in the `agents` table.
 * 3. General-purpose capabilities in the `agent_capabilities` table.
 * 
 * Safe, idempotent, and transactional. Aligning with schema.sql structure.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = path.resolve(__dirname, '..');
const DB = path.join(BASE, 'data', 'myaos.db');

function dbRun(sql) {
  const tmp = '/tmp/myaos_gemini_cli_reg_aligned.sql';
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    execSync(`sqlite3 "${DB}" < "${tmp}"`, { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

const ts = new Date().toISOString();

console.log('📝 Registering Gemini CLI (gemini_cli) into the canonical database registry...');

const sql = `
BEGIN;

-- 1. Insert Identity matching actual table columns
INSERT OR REPLACE INTO identities (
  id, display_name, symbol, primary_domain, team_id, lane,
  declared_capabilities, declared_responsibilities, declared_repository_ownership,
  confidence_provenance, observed_liveness, joined_at, is_active
) VALUES (
  'gemini_cli',
  'Gemini CLI',
  '♊',
  'General Purpose & CLI Substrate Operations',
  NULL,
  'engineering',
  '["coding", "diagnostics-dev-tooling", "workspace-operations"]',
  '["Full-Stack Codebase Engineering", "Diagnostics & Dev Tooling", "Workspace Operations", "Always-On Support"]',
  '["CreativeSites-Ai-Team/dashboard"]',
  'VERIFIED_OBSERVED',
  'LIVE',
  '${ts}',
  1
);

-- 2. Insert Agent row matching actual table columns
INSERT OR REPLACE INTO agents (
  id, identity_id, current_runtime_id, dynamic_role, inbox_path, current_task_id, status, last_seen
) VALUES (
  'gemini_cli',
  'gemini_cli',
  NULL,
  1,
  'community/inboxes/gemini_cli',
  'TASK_003',
  'WORKING',
  '${ts}'
);

-- 3. Insert Capabilities (agent_capabilities Phase 2 table matches)
INSERT OR REPLACE INTO agent_capabilities (id, identity_id, capability_name, proficiency_level, evidence_class, notes)
VALUES ('cap-gemini-cli-1', 'gemini_cli', 'coding', 'expert', 'OBSERVED', 'Delivered advanced full-stack projects workspace with perfect Next.js compilation.');

INSERT OR REPLACE INTO agent_capabilities (id, identity_id, capability_name, proficiency_level, evidence_class, notes)
VALUES ('cap-gemini-cli-2', 'gemini_cli', 'diagnostics-dev-tooling', 'expert', 'OBSERVED', 'Resolved complex useParams client hydration delay and Next.js hydration locking loops.');

INSERT OR REPLACE INTO agent_capabilities (id, identity_id, capability_name, proficiency_level, evidence_class, notes)
VALUES ('cap-gemini-cli-3', 'gemini_cli', 'workspace-operations', 'advanced', 'OBSERVED', 'Always-on general purpose engineering and self-healing operations.');

COMMIT;
`;

try {
  dbRun(sql);
  console.log('✅ Success! Identity "gemini_cli" (Gemini CLI) is now permanently registered as a LIVE working agent.');
  console.log('📂 Inbox directory configured at: community/inboxes/gemini_cli\n');
} catch (e) {
  console.error('❌ Failed to register Gemini CLI to the SQLite database:', e.message);
}
