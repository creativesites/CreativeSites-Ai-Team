#!/usr/bin/env node
/**
 * Phase 3 Migration: Communications
 * 
 * Meridian ◈ — 2026-09-07
 * Sources:
 *   - community/inboxes/<agent>/<file>.md  → messages
 *   - community/threads/*.md              → threads + messages
 *   - community/daily_standups/*.md       → standups
 *   - community/announcements/*.md        → announcements
 *   - community/proposals/*.md            → proposals
 *   - community/incidents/               → incidents
 *   - community/social/*.md              → social_posts
 *   - community/system/*.md/.json        → provenance_log / incidents
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = path.resolve(__dirname, '..');
const DB = path.join(BASE, 'data', 'myaos.db');

function dbRun(sql) {
  const tmp = '/tmp/myaos_p3_sql.sql';
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    execSync(`sqlite3 "${DB}" < "${tmp}"`, { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function dbQuery(sql) {
  const tmp = '/tmp/myaos_p3_query.sql';
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

function walkDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(d => d.isDirectory()
      ? walkDir(path.join(dir, d.name))
      : [path.join(dir, d.name)]);
}

// Timestamp extraction from filename like 2026-09-05T09-03-53-153Z_*
function tsFromFilename(filename) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
  if (m) return m[1].replace(/-(\d{2})-(\d{2})-(\d{2})$/, ':$1:$2') + 'Z';
  const m2 = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m2) return m2[1] + 'T00:00:00Z';
  return new Date().toISOString();
}

// -------------------------------------------------------
// Phase 3.1 — Inboxes → messages
// -------------------------------------------------------
console.log('\n📬 Phase 3.1 — Migrating inboxes → messages...');

const inboxesDir = path.join(BASE, 'community', 'inboxes');
const agents = ['atlas', 'astra', 'iris', 'kael', 'lyra', 'nexus', 'vela'];
const stmts = [];
let inboxCount = 0;

for (const agent of agents) {
  const agentDir = path.join(inboxesDir, agent);
  if (!fs.existsSync(agentDir)) continue;

  const files = fs.readdirSync(agentDir).filter(f => f !== 'archive' && (f.endsWith('.md') || f.endsWith('.json')));

  for (const filename of files) {
    const filepath = path.join(agentDir, filename);
    const stat = fs.statSync(filepath);
    if (!stat.isFile()) continue;

    const content = fs.readFileSync(filepath, 'utf8');
    const ts = tsFromFilename(filename);

    // Try to parse From/Subject from markdown
    const fromMatch = content.match(/\*\*From\*\*[:\s]+@?([^\n\(]+)/);
    const subjectMatch = content.match(/^#\s+(.+)$/m);
    const typeMatch = content.match(/\*\*Type\*\*[:\s]+([A-Z_]+)/);

    let fromIdentity = fromMatch ? fromMatch[1].trim().split(/[\s⏣👁✦✧🛡️📱⚡◈]/)[0].toLowerCase() : 'system';
    if (fromIdentity.includes('orchestrator')) fromIdentity = 'orchestrator';
    if (fromIdentity.includes('lyra')) fromIdentity = 'lyra';

    const msgType = typeMatch ? typeMatch[1] : 'COORDINATION';
    const validTypes = ['COORDINATION','TASK_ASSIGNMENT','VERIFICATION_REQUEST','ESCALATION','APPROVAL_REQUEST','BLOCKER','BRIDGE_REQUEST','SOCIAL','STANDUP','SYSTEM','HUMAN_REPLY'];
    const finalType = validTypes.includes(msgType) ? msgType : 'COORDINATION';

    stmts.push(`
INSERT INTO messages
  (from_identity, to_identity, type, subject, body, ts, original_file_path)
VALUES (
  ${sq(fromIdentity)},
  ${sq(agent)},
  ${sq(finalType)},
  ${sq(subjectMatch ? subjectMatch[1].trim().slice(0, 200) : filename)},
  ${sq(content)},
  ${sq(ts)},
  ${sq(filepath)}
);`);
    inboxCount++;
  }
}

if (stmts.length > 0) dbRun(`BEGIN;\n${stmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ ${inboxCount} inbox messages migrated`);

// -------------------------------------------------------
// Phase 3.2 — Threads → threads + messages
// -------------------------------------------------------
console.log('\n💬 Phase 3.2 — Migrating threads...');

const threadsDir = path.join(BASE, 'community', 'threads');
const threadFiles = fs.readdirSync(threadsDir).filter(f => f.endsWith('.md') && !f.startsWith('TEMPLATE'));
const threadStmts = [];
let threadCount = 0;

for (const filename of threadFiles) {
  const filepath = path.join(threadsDir, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  const numMatch = filename.match(/^(\d+)/);
  const threadId = numMatch ? `thread_${numMatch[1].padStart(3, '0')}` : `thread_${filename.replace('.md', '')}`;
  const titleMatch = content.match(/^#\s+Thread\s+\d+:\s+(.+)$/m) || content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : filename.replace('.md', '');
  const tsMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  const ts = tsMatch ? tsMatch[1] + 'T00:00:00Z' : new Date().toISOString();

  threadStmts.push(`
INSERT OR IGNORE INTO threads
  (id, title, status, created_at, updated_at, original_file_path)
VALUES (
  ${sq(threadId)},
  ${sq(title)},
  'open',
  ${sq(ts)},
  ${sq(ts)},
  ${sq(filepath)}
);`);

  // Store thread content as a message in the thread
  threadStmts.push(`
INSERT INTO messages
  (thread_id, from_identity, to_identity, type, subject, body, ts, original_file_path)
VALUES (
  ${sq(threadId)},
  'system',
  NULL,
  'COORDINATION',
  ${sq(title.slice(0, 200))},
  ${sq(content)},
  ${sq(ts)},
  ${sq(filepath)}
);`);

  threadCount++;
}

if (threadStmts.length > 0) dbRun(`BEGIN;\n${threadStmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ ${threadCount} threads migrated`);

// -------------------------------------------------------
// Phase 3.3 — Daily Standups
// -------------------------------------------------------
console.log('\n📅 Phase 3.3 — Migrating daily standups...');

const standupsDir = path.join(BASE, 'community', 'daily_standups');
const standupFiles = fs.readdirSync(standupsDir).filter(f => f.endsWith('.md'));
const standupStmts = [];

for (const filename of standupFiles) {
  const filepath = path.join(standupsDir, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];
  const facilitatorMatch = content.match(/\*\*Facilitator\*\*[:\s]+@?([^\n\(]+)/);
  const presentMatch = content.match(/\*\*Present\*\*[:\s]+([^\n]+)/);
  const facilitator = facilitatorMatch ? facilitatorMatch[1].trim().split(/[\s⏣]/)[0] : null;
  const presentRaw = presentMatch ? presentMatch[1] : '';
  const present = presentRaw.split(',').map(s => s.replace(/[@\s⏣👁✦✧🛡️📱⚡◈]/g, '').toLowerCase().trim()).filter(Boolean);

  standupStmts.push(`
INSERT INTO standups
  (standup_date, facilitator, present_identities, content, ts, original_file_path)
VALUES (
  ${sq(date)},
  ${sq(facilitator ? facilitator.toLowerCase() : null)},
  ${sq(JSON.stringify(present))},
  ${sq(content)},
  ${sq(date + 'T09:00:00Z')},
  ${sq(filepath)}
);`);
}

if (standupStmts.length > 0) dbRun(`BEGIN;\n${standupStmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ ${standupFiles.length} standups migrated`);

// -------------------------------------------------------
// Phase 3.4 — Announcements
// -------------------------------------------------------
console.log('\n📢 Phase 3.4 — Migrating announcements...');

const announcementsDir = path.join(BASE, 'community', 'announcements');
const annoFiles = fs.readdirSync(announcementsDir).filter(f => f.endsWith('.md'));
const annoStmts = [];

for (const filename of annoFiles) {
  const filepath = path.join(announcementsDir, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : filename.replace('.md', '');
  const ts = tsFromFilename(filename);

  annoStmts.push(`
INSERT INTO announcements (title, content, ts, original_file_path)
VALUES (
  ${sq(title.slice(0, 200))},
  ${sq(content)},
  ${sq(ts)},
  ${sq(filepath)}
);`);
}

if (annoStmts.length > 0) dbRun(`BEGIN;\n${annoStmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ ${annoFiles.length} announcements migrated`);

// -------------------------------------------------------
// Phase 3.5 — Proposals
// -------------------------------------------------------
console.log('\n📝 Phase 3.5 — Migrating proposals...');

const proposalsDir = path.join(BASE, 'community', 'proposals');
const propFiles = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.md'));
const propStmts = [];

for (const filename of propFiles) {
  const filepath = path.join(proposalsDir, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const authorMatch = content.match(/\*\*Author\*\*[:\s]+@?([^\n]+)/);
  const title = titleMatch ? titleMatch[1].trim() : filename.replace('.md', '');
  const author = authorMatch ? authorMatch[1].trim().toLowerCase().split(/[\s@⏣]/)[0] : null;

  propStmts.push(`
INSERT INTO proposals (title, author_identity, status, content, ts, original_file_path)
VALUES (
  ${sq(title.slice(0, 200))},
  ${sq(author)},
  'draft',
  ${sq(content)},
  ${sq(new Date().toISOString())},
  ${sq(filepath)}
);`);
}

if (propStmts.length > 0) dbRun(`BEGIN;\n${propStmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ ${propFiles.length} proposals migrated`);

// -------------------------------------------------------
// Phase 3.6 — Incidents
// -------------------------------------------------------
console.log('\n🚨 Phase 3.6 — Migrating incidents...');

const incidentsDir = path.join(BASE, 'community', 'incidents');
const incidentFiles = walkDir(incidentsDir).filter(f => f.endsWith('.md') || f.endsWith('.json'));
const incidentStmts = [];
let incCount = 0;

for (const filepath of incidentFiles) {
  const content = fs.readFileSync(filepath, 'utf8');
  const filename = path.basename(filepath);
  const incId = `inc_${filename.replace(/[^a-z0-9_]/gi, '_').toLowerCase().replace(/\.md$|\.json$/, '')}`;
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : filename;
  const severityMatch = content.match(/\*\*Severity\*\*[:\s]+(P[0-3])/);
  const severity = severityMatch ? severityMatch[1] : 'P2';

  incidentStmts.push(`
INSERT OR IGNORE INTO incidents (id, title, severity, status, opened_at, original_file_path)
VALUES (
  ${sq(incId)},
  ${sq(title.slice(0, 200))},
  ${sq(severity)},
  'closed',
  ${sq(new Date().toISOString())},
  ${sq(filepath)}
);`);

  // Store content as a task note if long enough
  if (content.length > 100) {
    incidentStmts.push(`
INSERT INTO provenance_log (actor, operation, source, reason, evidence_class, evidence)
VALUES (
  'Meridian', 'INCIDENT_MIGRATED', 'migration-phase3',
  ${sq('Incident migrated: ' + title.slice(0, 100))},
  'ATTESTED',
  ${sq(JSON.stringify({ incident_id: incId, filepath }))}
);`);
  }
  incCount++;
}

if (incidentStmts.length > 0) dbRun(`BEGIN;\n${incidentStmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ ${incCount} incident files migrated`);

// -------------------------------------------------------
// Phase 3.7 — Social posts
// -------------------------------------------------------
console.log('\n🌊 Phase 3.7 — Migrating social posts...');

const socialDir = path.join(BASE, 'community', 'social');
const socialFiles = fs.readdirSync(socialDir).filter(f => f.endsWith('.md') && !f.startsWith('README') && !f.startsWith('SOCIAL_MEMORY'));
const socialStmts = [];

for (const filename of socialFiles) {
  const filepath = path.join(socialDir, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  const ts = tsFromFilename(filename);
  const channel = filename.includes('chat') ? 'watercooler' : 'work-related';

  socialStmts.push(`
INSERT INTO social_posts (channel, author_identity, content, ts, original_file_path)
VALUES (
  ${sq(channel)},
  'collective',
  ${sq(content)},
  ${sq(ts)},
  ${sq(filepath)}
);`);
}

// Also migrate social subdirs
for (const subdir of ['watercooler', 'work-related']) {
  const subdirPath = path.join(socialDir, subdir);
  if (!fs.existsSync(subdirPath)) continue;
  const subFiles = fs.readdirSync(subdirPath).filter(f => f.endsWith('.md'));
  for (const filename of subFiles) {
    const filepath = path.join(subdirPath, filename);
    const content = fs.readFileSync(filepath, 'utf8');
    const ts = tsFromFilename(filename);
    socialStmts.push(`
INSERT INTO social_posts (channel, author_identity, content, ts, original_file_path)
VALUES (
  ${sq(subdir)},
  'collective',
  ${sq(content)},
  ${sq(ts)},
  ${sq(filepath)}
);`);
  }
}

if (socialStmts.length > 0) dbRun(`BEGIN;\n${socialStmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ ${socialStmts.length} social posts migrated`);

// -------------------------------------------------------
// Record Phase 3 in migration_log
// -------------------------------------------------------
dbRun(`
BEGIN;
INSERT INTO migration_log (phase, entity_type, source_path, target_table, rows_migrated, status)
VALUES
  (3, 'messages_inboxes', 'community/inboxes/', 'messages', ${inboxCount}, 'complete'),
  (3, 'threads', 'community/threads/', 'threads+messages', ${threadCount}, 'complete'),
  (3, 'standups', 'community/daily_standups/', 'standups', ${standupFiles.length}, 'complete'),
  (3, 'announcements', 'community/announcements/', 'announcements', ${annoFiles.length}, 'complete'),
  (3, 'proposals', 'community/proposals/', 'proposals', ${propFiles.length}, 'complete'),
  (3, 'incidents', 'community/incidents/', 'incidents', ${incCount}, 'complete'),
  (3, 'social_posts', 'community/social/', 'social_posts', ${socialStmts.length}, 'complete');
COMMIT;
`);

// -------------------------------------------------------
// Full Parity Check
// -------------------------------------------------------
console.log('\n🔍 Phase 3 Parity Check...');

const tables = ['identities','agents','runtimes','tasks','events','messages','threads','standups','announcements','proposals','incidents','social_posts','provenance_log','evidence','migration_log'];
for (const table of tables) {
  const count = dbQuery(`SELECT count(*) as c FROM ${table};`)[0]?.c;
  console.log(`  ${table.padEnd(20)} ${count}`);
}

console.log('\n✅ Phase 3 COMPLETE — Full migration done');
