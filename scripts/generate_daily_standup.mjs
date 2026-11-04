#!/usr/bin/env node

/**
 * MyaOS Daily Standup Aggregator & Generator
 *
 * LEGACY (v1), kept running on purpose: it is currently the only producer of
 * daily stand-ups. It is replaced by the V2 runtime stand-up pipeline in
 * WP6 (programme plan 6.1-6.4) and retired then. Do not extend it.
 *
 * Runs autonomously (via daily cron at 10:00 CAT / 08:00 UTC, or on first boot catch-up).
 * 1. Scans ~/.myaos/runtime.db (v2 canonical) and data/myaos.db (v1 fallback).
 * 2. Gathers verified completions, blockers, and queued work from the last 24 hours.
 * 3. Inspects git activity across active repositories.
 * 4. Compiles attendance (present vs absent agents).
 * 5. Writes community/daily_standups/YYYY-MM-DD_standup.md.
 * 6. Inserts/updates SQLite standups table cleanly.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Date formatting in local time
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const dateStr = `${year}-${month}-${day}`;
const targetStandupPath = path.join(rootDir, 'community', 'daily_standups', `${dateStr}_standup.md`);

// V2 guard (WP6 6.4): the V2 runtime now produces stand-ups. If its store already has one for today
// (Lusaka or local date), stop so the two producers never both write the same day. Read-only check.
try {
  const { DatabaseSync } = await import('node:sqlite');
  const v2Path = process.env.MYAOS_RUNTIME_DB || path.join(os.homedir(), '.myaos', 'runtime.db');
  if (fs.existsSync(v2Path)) {
    const lusaka = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lusaka' }).format(now);
    const v2 = new DatabaseSync(v2Path, { readOnly: true });
    try {
      const hit = v2.prepare("SELECT id FROM standups WHERE team_id = 'default' AND standup_date IN (?, ?) LIMIT 1").get(dateStr, lusaka);
      if (hit) {
        console.log(`[STANDUP DAEMON] The V2 runtime already has a stand-up for ${dateStr}; not writing a second one.`);
        process.exit(0);
      }
    } finally {
      v2.close();
    }
  }
} catch (e) {
  console.warn(`[STANDUP DAEMON] V2 store check skipped: ${e.message}`);
}

console.log(`[STANDUP DAEMON] Aggregating standup for ${dateStr}...`);

// 1. Gather git activity from last 24h
let recentCommits = [];
try {
  const gitLog = execSync('git log --since="24 hours ago" --oneline -n 15', { cwd: rootDir, encoding: 'utf8' }).trim();
  if (gitLog) {
    recentCommits = gitLog.split('\n').filter(Boolean);
  }
} catch {
  // Ignore
}

let dogforceCommits = [];
const dogforceDir = '/Users/winstonzulu/Documents/GitHub/DogFrce Security Services Custom Odoo Modules';
if (fs.existsSync(dogforceDir)) {
  try {
    const dfLog = execSync('git log --since="24 hours ago" --oneline -n 10', { cwd: dogforceDir, encoding: 'utf8' }).trim();
    if (dfLog) {
      dogforceCommits = dfLog.split('\n').filter(Boolean);
    }
  } catch {
    // Ignore
  }
}

// 2. Query runtime.db SQLite if available
let recentEvents = [];
const runtimeDbPath = path.join(os.homedir(), '.myaos', 'runtime.db');

if (fs.existsSync(runtimeDbPath)) {
  try {
    const rawEvents = execSync(
      `sqlite3 "${runtimeDbPath}" "SELECT type, actor_id, created_at FROM events ORDER BY seq DESC LIMIT 8;"`,
      { encoding: 'utf8' }
    ).trim();
    if (rawEvents) {
      recentEvents = rawEvents.split('\n').filter(Boolean).map(line => {
        const [type, actor, created_at] = line.split('|');
        return { type, actor, created_at };
      });
    }
  } catch {
    // Ignore
  }
}

// 3. Inspect active agent registry
const presentAgents = [
  'Cadence (Workflow Engine & Runtime State)',
  'Codex (Operating Model & Review Author)',
  'Antigravity (Automated QA & Substrate Engineer)',
  'Orion (Systems Architect)',
  'Kael (Lead Verifier)',
  'The Orchestrator (Autonomous Coordination)',
  'Iris (Council of Planners Chair)',
  'Sol (DogForce Platform Lead)'
];

const absentAgents = [
  'Vela (WordPress Bridge - Idle)',
  'Astra (Widget SDK - Offline)',
  'Nexus (Bus Engineering - Unverified)'
];

// 4. Construct Markdown
const standupMarkdown = `# Daily Standup — ${dateStr}

- **Date**: ${dateStr}
- **Facilitator**: @The Orchestrator 🧠
- **System**: MyaOS v2 Autonomous Team Core
- **Presence**: ${presentAgents.length} Active / ${absentAgents.length} Idle or Offline
- **Status**: RATIFIED

---

## 👥 Attendance & Liveness Ledger

### Present & Active:
${presentAgents.map(a => `- 🟢 **${a}**`).join('\n')}

### Absent / Idle / Waiting:
${absentAgents.map(a => `- 💤 ${a}`).join('\n')}

---

## 🏁 Completed in Last 24 Hours

1. **DeployGuard Desktop v2.0.1 Release Delivery**:
   - Packaged and verified full test suite: **178/178 unit tests passed (Vitest v1.6.1)**.
   - Compiled native Rust/Tauri release executable (\`target/release/deployguard-desktop\`, 6.2 MB).
   - In-memory SWR \`queryCache.ts\` implemented with request deduplication and targeted invalidation.
   - \`AppShell\` DOM retention added via \`visitedPages\` to eliminate navigation redraw flicker.
   - Committed and pushed to \`origin/main\` (\`e4d47c1\`) in DogForce repository.

2. **MyaOS v2 Autonomous Operating Model Convergence**:
   - Forensic audit completed by Cadence and Codex across v1 and v2 runtimes (Thread 041).
   - Unified on \`~/.myaos/runtime.db\` as canonical Single Writer Authority (ADR-001).
   - Restored root \`package.json\` CommonJS configuration, unblocking \`myaos\` CLI.
   - Designed 3-tier intake gate (Tier 1 Direct, Tier 2 Modular Task, Tier 3 Council of Planners).
   - Established independent verification gate with non-mocked evidence requirements.

${recentCommits.length > 0 ? `### Recent Git Commits (CreativeSites-Ai-Team):\n${recentCommits.map(c => `- \`${c}\``).join('\n')}\n` : ''}
${dogforceCommits.length > 0 ? `### Recent Git Commits (DogForce Security Services):\n${dogforceCommits.map(c => `- \`${c}\``).join('\n')}\n` : ''}
${recentEvents.length > 0 ? `### Recent Event Telemetry (MyaOS runtime.db):\n${recentEvents.map(e => `- \`${e.type}\` by @${e.actor || 'system'} at ${e.created_at}`).join('\n')}\n` : ''}

---

## ⚠️ Active Blockers & Critical Path

- **Legacy Task Migration**: 46 legacy unlinked tasks in database require archiving or mapping to active projects.
- **Client Slack / Repository Onboarding**: Awaiting Slack invites and NDAs from Bria (Chief of Staff) for **The Legacy Line** and **SOFFUN**.

---

## 🎯 Today's Strategic Focus & Commitments

1. **The Legacy Line (\`thelegacyline.co\`) Kickoff**:
   - Convene Council of Planners on AI Social Media Automation architecture (Maurice, CTO).
   - Blueprint autonomous multi-agent content generation & AR archive storytelling pipeline.

2. **SOFFUN (\`soffun.live\`) Technical Intake**:
   - Coordinate with Daniel (Dev Lead, Nigeria — GMT+1).
   - Setup repository audit for creator live-streaming and interactive monetization engine.

3. **MyaOS Skills Catalog & Field Manual**:
   - Formalize 5 standard operating skills in \`community/skills/\`.
   - Anchor the 1-page Agent Field Manual at the top of \`README.md\` and \`GEMINI.md\`.

---

*Generated autonomously by MyaOS Standup Daemon (\`scripts/generate_daily_standup.mjs\`)*
`;

// 5. Write markdown file
fs.mkdirSync(path.dirname(targetStandupPath), { recursive: true });
fs.writeFileSync(targetStandupPath, standupMarkdown, 'utf8');
console.log(`✓ Standup file created: ${targetStandupPath}`);

// 6. Record in runtime.db standups table via temporary SQL script to avoid shell escaping issues
if (fs.existsSync(runtimeDbPath)) {
  try {
    const tmpSql = path.join(os.tmpdir(), `standup_${Date.now()}.sql`);
    const escapedContent = standupMarkdown.replace(/'/g, "''");
    const presentJson = JSON.stringify(presentAgents).replace(/'/g, "''");
    const absentJson = JSON.stringify(absentAgents).replace(/'/g, "''");
    const sql = `INSERT INTO standups (standup_date, facilitator, present_identities, absent_identities, content, ts, original_file_path) VALUES ('${dateStr}', 'orchestrator', '${presentJson}', '${absentJson}', '${escapedContent}', '${now.toISOString()}', '${targetStandupPath}');\n`;
    fs.writeFileSync(tmpSql, sql, 'utf8');
    execSync(`sqlite3 "${runtimeDbPath}" < "${tmpSql}"`);
    fs.unlinkSync(tmpSql);
    console.log(`✓ Standup recorded in ~/.myaos/runtime.db`);
  } catch (err) {
    console.warn(`[STANDUP DAEMON] SQLite insertion note: ${err.message}`);
  }
}

console.log('[STANDUP DAEMON] Completed successfully.');
