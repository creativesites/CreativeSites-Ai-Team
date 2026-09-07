#!/usr/bin/env node
/**
 * Phase 2 Migration: Tasks + Events + Provenance
 * 
 * Meridian ◈ — 2026-09-07
 * Sources:
 *   - community/tasks.json (TASK_LIVE_* runtime tasks)
 *   - community/tasks/*.md (TASK_001–TASK_007 detailed task files)
 *   - community/events.ndjson (44 events)
 *   - data/provenance.log (historical provenance)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = path.resolve(__dirname, '..');
const DB = path.join(BASE, 'data', 'myaos.db');

function dbRun(sql) {
  const tmp = '/tmp/myaos_p2_sql.sql';
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    execSync(`sqlite3 "${DB}" < "${tmp}"`, { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function dbQuery(sql) {
  const tmp = '/tmp/myaos_p2_query.sql';
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    const out = execSync(`sqlite3 -json "${DB}" < "${tmp}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(out || '[]');
  } catch (e) { return []; } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function sq(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqJson(v) { return sq(JSON.stringify(v)); }

// Map status strings between systems
function mapTaskStatus(s) {
  const m = {
    'TODO': 'open', 'IN_PROGRESS': 'in_progress', 'DONE': 'done',
    'BLOCKED': 'blocked', 'VERIFICATION': 'in_review', 'UNRESOLVED': 'unresolved',
    'FAILED': 'failed', 'open': 'open', 'done': 'done'
  };
  return m[s] || 'open';
}

function mapPriority(p) {
  const m = { 'HIGH': 'high', 'NORMAL': 'medium', 'LOW': 'low', 'URGENT': 'urgent' };
  return m[(p || '').toUpperCase()] || 'medium';
}

// -------------------------------------------------------
// Phase 2.1 — Migrate tasks.json (TASK_LIVE_* tasks)
// -------------------------------------------------------
console.log('\n📋 Phase 2.1 — Migrating community/tasks.json (runtime tasks)...');

const tasksJson = JSON.parse(fs.readFileSync(path.join(BASE, 'community', 'tasks.json'), 'utf8'));
const liveTasks = tasksJson.tasks || [];
const taskStmts = [];

for (const t of liveTasks) {
  const assigneeId = t.assignee ? t.assignee.toLowerCase().replace(/[@⏣👁✦✧🛡️📱⚡◈\s]/g, '') : null;

  taskStmts.push(`
INSERT OR REPLACE INTO tasks
  (id, title, description, creator, assignee_id, required_capabilities, priority,
   status, dependencies, acceptance_criteria, artifacts, original_source, created_at, updated_at)
VALUES (
  ${sq(t.id)},
  ${sq(t.title)},
  ${sq(t.description)},
  ${sq(t.creator)},
  ${sq(assigneeId)},
  ${sqJson(t.required_capabilities || [])},
  ${sq(mapPriority(t.priority))},
  ${sq(mapTaskStatus(t.status))},
  ${sqJson(t.dependencies || [])},
  ${sqJson(t.acceptance_criteria || [])},
  ${sqJson(t.artifacts || [])},
  'tasks_json',
  ${sq(t.created_at || new Date().toISOString())},
  ${sq(t.updated_at || new Date().toISOString())}
);`);

  // If verification_evidence exists, insert as evidence record
  if (t.verification_evidence) {
    const ve = t.verification_evidence;
    const verifier = (ve.verified_by || 'Unknown').toLowerCase().replace(/[@\s]/g, '');
    taskStmts.push(`
INSERT INTO evidence
  (task_id, verifier_identity, evidence_class, passed, details, exit_code, created_at)
VALUES (
  ${sq(t.id)},
  ${sq(verifier)},
  ${sq(ve.resolution === 'RESOLVED_PASS' ? 'VERIFIED' : ve.resolution === 'UNRESOLVED' ? 'UNKNOWN' : 'OBSERVED')},
  ${ve.passed ? 1 : 0},
  ${sq(ve.details)},
  ${sq(ve.exit_code !== undefined ? ve.exit_code : null)},
  ${sq(ve.timestamp || new Date().toISOString())}
);`);
  }
}

dbRun(`BEGIN;\n${taskStmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ ${liveTasks.length} runtime tasks migrated`);

// -------------------------------------------------------
// Phase 2.2 — Migrate tasks/*.md (detailed task files)
// -------------------------------------------------------
console.log('\n📄 Phase 2.2 — Migrating community/tasks/*.md (detailed task files)...');

const tasksDir = path.join(BASE, 'community', 'tasks');
const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.md') && !f.startsWith('TEMPLATE'));
const mdTaskStmts = [];
let mdCount = 0;

for (const filename of taskFiles) {
  const filepath = path.join(tasksDir, filename);
  const content = fs.readFileSync(filepath, 'utf8');

  // Extract fields from markdown front matter / headers
  const idMatch = content.match(/\*\*Task ID\*\*[:\s]+([A-Z0-9_-]+)/);
  const titleMatch = content.match(/^#\s+Task:\s+(.+)$/m);
  const statusMatch = content.match(/\*\*Status\*\*[:\s]+([A-Z]+)/);
  const priorityMatch = content.match(/\*\*Priority\*\*[:\s]+([A-Z]+)/);
  const assigneeMatch = content.match(/\*\*Assignee\*\*[:\s]+@?([^\n\[]+)/);
  const creatorMatch = content.match(/\*\*Assigned By\*\*[:\s]+([^\n]+)/);

  const taskId = idMatch ? idMatch[1].replace('-', '_') : filename.replace('.md', '').toUpperCase();
  const title = titleMatch ? titleMatch[1].trim() : filename.replace('.md', '');
  const status = statusMatch ? mapTaskStatus(statusMatch[1]) : 'open';
  const priority = priorityMatch ? mapPriority(priorityMatch[1]) : 'medium';
  const creator = creatorMatch ? creatorMatch[1].trim().replace(/[\*@]/g, '') : 'Team';

  let assigneeId = null;
  if (assigneeMatch) {
    const rawAssignee = assigneeMatch[1].trim();
    const cleanAssignee = rawAssignee.toLowerCase().replace(/[@⏣👁✦✧🛡️📱⚡◈\s\*\[\(].*/g, '').trim();
    if (cleanAssignee && cleanAssignee !== 'provisional') {
      assigneeId = cleanAssignee.split(/[\s,&]/)[0];
    }
  }

  // Check if ID already exists (TASK_LIVE tasks might not conflict since different prefix)
  const normalizedId = taskId.replace(/[-_\s]/g, '_').toUpperCase();

  mdTaskStmts.push(`
INSERT OR IGNORE INTO tasks
  (id, title, creator, assignee_id, priority, status, original_source, original_file_path, created_at, updated_at)
VALUES (
  ${sq(normalizedId)},
  ${sq(title)},
  ${sq(creator)},
  ${sq(assigneeId)},
  ${sq(priority)},
  ${sq(status)},
  'tasks_dir_md',
  ${sq(filepath)},
  ${sq(new Date().toISOString())},
  ${sq(new Date().toISOString())}
);`);

  // Store full markdown content as a task note
  mdTaskStmts.push(`
INSERT INTO task_notes (task_id, author_identity, note_type, content, ts)
SELECT ${sq(normalizedId)}, 'system', 'description', ${sq(content)}, ${sq(new Date().toISOString())}
WHERE EXISTS (SELECT 1 FROM tasks WHERE id = ${sq(normalizedId)});`);

  mdCount++;
}

dbRun(`BEGIN;\n${mdTaskStmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ ${mdCount} markdown task files migrated`);

// -------------------------------------------------------
// Phase 2.3 — Migrate events.ndjson
// -------------------------------------------------------
console.log('\n⚡ Phase 2.3 — Migrating community/events.ndjson...');

const eventsFile = path.join(BASE, 'community', 'events.ndjson');
const eventLines = fs.readFileSync(eventsFile, 'utf8')
  .split('\n')
  .filter(l => l.trim().length > 0);

const eventStmts = [];
let evtCount = 0;

for (const line of eventLines) {
  try {
    const e = JSON.parse(line);
    const extId = e.id || null;
    const ts = e.timestamp || new Date().toISOString();
    const type = e.type || 'unknown';
    const sender = e.sender || null;

    // Try to link to a task if payload contains taskId
    let taskId = null;
    if (e.payload) {
      const pid = e.payload.taskId || e.payload.task?.id || null;
      if (pid) {
        const exists = dbQuery(`SELECT id FROM tasks WHERE id = ${sq(pid)};`);
        if (exists.length > 0) taskId = pid;
      }
    }

    eventStmts.push(`
INSERT INTO events (external_id, ts, type, sender, task_id, payload)
VALUES (
  ${sq(extId)},
  ${sq(ts)},
  ${sq(type)},
  ${sq(sender)},
  ${sq(taskId)},
  ${sq(e.payload ? JSON.stringify(e.payload) : null)}
);`);
    evtCount++;
  } catch (err) {
    console.warn(`  ⚠️  Skipped malformed event line: ${line.slice(0, 60)}`);
  }
}

// Batch in chunks of 50 to avoid huge transactions
const chunkSize = 50;
for (let i = 0; i < eventStmts.length; i += chunkSize) {
  const chunk = eventStmts.slice(i, i + chunkSize);
  dbRun(`BEGIN;\n${chunk.join('\n')}\nCOMMIT;`);
}
console.log(`  ✅ ${evtCount} events migrated`);

// -------------------------------------------------------
// Phase 2.4 — Migrate data/provenance.log
// -------------------------------------------------------
console.log('\n🔍 Phase 2.4 — Migrating data/provenance.log...');

const provFile = path.join(BASE, 'data', 'provenance.log');
const provLines = fs.readFileSync(provFile, 'utf8')
  .split('\n')
  .filter(l => l.trim().length > 0);

const provStmts = [];
let provCount = 0;

for (const line of provLines) {
  try {
    const p = JSON.parse(line);
    const ec = ['DECLARED','ATTESTED','OBSERVED','VERIFIED','UNKNOWN'].includes(p.evidence_class)
      ? p.evidence_class : 'UNKNOWN';

    provStmts.push(`
INSERT INTO provenance_log (ts, actor, agent, operation, runtime_id, source, reason, evidence_class, evidence)
VALUES (
  ${sq(p.timestamp || new Date().toISOString())},
  ${sq(p.actor)},
  ${sq(p.agent || null)},
  ${sq(p.operation)},
  ${sq(p.runtime_id || null)},
  ${sq(p.source || 'myaos')},
  ${sq(p.reason || null)},
  ${sq(ec)},
  ${sq(p.evidence ? JSON.stringify(p.evidence) : null)}
);`);
    provCount++;
  } catch (err) {
    console.warn(`  ⚠️  Skipped malformed provenance line`);
  }
}

for (let i = 0; i < provStmts.length; i += chunkSize) {
  dbRun(`BEGIN;\n${provStmts.slice(i, i + chunkSize).join('\n')}\nCOMMIT;`);
}
console.log(`  ✅ ${provCount} provenance records migrated`);

// -------------------------------------------------------
// Record Phase 2 in migration_log
// -------------------------------------------------------
dbRun(`
BEGIN;
INSERT INTO migration_log (phase, entity_type, source_path, target_table, rows_migrated, status)
VALUES
  (2, 'tasks_runtime', 'community/tasks.json', 'tasks', ${liveTasks.length}, 'complete'),
  (2, 'tasks_markdown', 'community/tasks/', 'tasks+task_notes', ${mdCount}, 'complete'),
  (2, 'events', 'community/events.ndjson', 'events', ${evtCount}, 'complete'),
  (2, 'provenance', 'data/provenance.log', 'provenance_log', ${provCount}, 'complete');
COMMIT;
`);

// -------------------------------------------------------
// Parity Check
// -------------------------------------------------------
console.log('\n🔍 Phase 2 Parity Check...');
const taskCount = dbQuery('SELECT count(*) as c FROM tasks;')[0]?.c;
const eventCount = dbQuery('SELECT count(*) as c FROM events;')[0]?.c;
const evidenceCount = dbQuery('SELECT count(*) as c FROM evidence;')[0]?.c;
const provLogCount = dbQuery('SELECT count(*) as c FROM provenance_log;')[0]?.c;

console.log(`  tasks:          ${taskCount} (${liveTasks.length} runtime + ${mdCount} markdown)`);
console.log(`  events:         ${eventCount} (expected ~${evtCount})`);
console.log(`  evidence:       ${evidenceCount}`);
console.log(`  provenance_log: ${provLogCount}`);

const byStatus = dbQuery(`
  SELECT status, count(*) as c FROM tasks GROUP BY status ORDER BY c DESC;
`);
console.log('\n  Tasks by status:');
for (const row of byStatus) {
  console.log(`    ${row.status.padEnd(15)} ${row.c}`);
}

console.log('\n✅ Phase 2 COMPLETE');
