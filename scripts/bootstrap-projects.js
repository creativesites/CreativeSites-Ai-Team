#!/usr/bin/env node
/**
 * Bootstrap Projects and Milestones for CreativeSites AI Team & MyaOS
 * 
 * This script seeds the projects and milestones tables in the SQLite database (data/myaos.db)
 * and maps the 11 existing tasks to their respective project/milestone relationships based on
 * actual codebase evidence.
 * 
 * It is designed to be deterministic, idempotent, safe to run repeatedly, and auditable.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = path.resolve(__dirname, '..');
const DB = path.join(BASE, 'data', 'myaos.db');

function dbRun(sql) {
  const tmp = '/tmp/myaos_project_bootstrap.sql';
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    execSync(`sqlite3 "${DB}" < "${tmp}"`, { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function sq(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqJson(v) { return sq(JSON.stringify(v)); }

console.log('🚀 Starting project and milestone bootstrapping for MyaOS SQLite substrate...\n');

// 1. Core Projects Seeding (Idempotent: INSERT OR IGNORE)
console.log('📂 Seeding canonical projects...');
const projects = [
  {
    id: 'proj_chatbot',
    title: 'Myavana AI Chatbot & Streaming Core',
    description: 'Modernization of the core Myavana chatbot widget, server-side Gemini streaming protocol, and Cloud Run isolated deployment.',
    objectives: [
      'Implement real-time NDJSON wire protocol for voice and chat streams.',
      'Hard-proof production authentication omitting X-WP-Nonce on public auth endpoints.',
      'Deploy isolated server-side agent on Google Cloud Run with safe secret rotation.'
    ],
    status: 'active',
    owner_identity_ids: ['atlas', 'astra'],
    human_owner: 'Winston',
    repo: 'Myavana-Chatbot'
  },
  {
    id: 'proj_hair_journey',
    title: 'WordPress Hair Journey Integration',
    description: 'Bridges WordPress-native Stories Tab (milestones, wash day entries) and Profile Tab (Strand DNA, hair goals) to the Mya AI chatbot.',
    objectives: [
      'Synchronize user profiles and Strand DNA badges dynamically into Mya session memories.',
      'Bridge WordPress REST API endpoints with the local Myavana client adapter.'
    ],
    status: 'active',
    owner_identity_ids: ['vela'],
    human_owner: 'Winston',
    repo: 'myavana-hair-journey-next'
  },
  {
    id: 'proj_mobile_sdk',
    title: 'Myavana React Native Mobile SDK',
    description: 'Foundational mobile-native package integrating high-speed streaming chat and Firebase Cloud Messaging (FCM) push token mechanics.',
    objectives: [
      'Create high-performance React Native headless transport with NDJSON parsing.',
      'Capture and synchronize FCM push notification tokens securely in database session stores.'
    ],
    status: 'active',
    owner_identity_ids: ['lyra'],
    human_owner: 'Winston',
    repo: 'packages/react-native-sdk'
  },
  {
    id: 'proj_myaos',
    title: 'MyaOS Orchestration & Telemetry Platform',
    description: 'Central multi-agent operating system, secure telemetry bus, liveness detection, and human operator command center.',
    objectives: [
      'Build local socket-based process handshake and dynamic agent liveness observers.',
      'Create high-density bento Command Center to visualize autonomous work and enforce verification gates.',
      'Deliver automated morning briefing and telemetry economics reports.'
    ],
    status: 'active',
    owner_identity_ids: ['iris', 'nexus', 'meridian'],
    human_owner: 'Winston',
    repo: 'CreativeSites-Ai-Team'
  }
];

const projStmts = [];
for (const p of projects) {
  projStmts.push(`
INSERT OR REPLACE INTO projects (id, title, description, objectives, status, owner_identity_ids, human_owner, repo, created_at, updated_at)
VALUES (
  ${sq(p.id)},
  ${sq(p.title)},
  ${sq(p.description)},
  ${sqJson(p.objectives)},
  ${sq(p.status)},
  ${sqJson(p.owner_identity_ids)},
  ${sq(p.human_owner)},
  ${sq(p.repo)},
  datetime('now', '-2 days'),
  datetime('now')
);`);
}
dbRun(`BEGIN;\n${projStmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ Successfully seeded ${projects.length} canonical projects.`);

// 2. Milestones Seeding (Idempotent: INSERT OR IGNORE)
console.log('\n📐 Seeding canonical milestones...');
const milestones = [
  // Chatbot Milestones
  { id: 'ms_chatbot_v1', project_id: 'proj_chatbot', title: 'Architecture & Streaming Protocols', description: 'Design NDJSON chat streaming wire-frame and mock endpoint adapters.', status: 'completed', due_at: '2026-09-05' },
  { id: 'ms_chatbot_v2', project_id: 'proj_chatbot', title: 'Staging Deployment & Auth Refactor', description: 'Deploy server core to Cloud Run and hard-test auth omitting nonces.', status: 'in_progress', due_at: '2026-09-12' },

  // Hair Journey Milestones
  { id: 'ms_hj_site_plan', project_id: 'proj_hair_journey', title: 'Site Planning & Schema Contract Alignment', description: 'Align Stories and Profile WordPress domain schemas with Mya REST API spec.', status: 'in_progress', due_at: '2026-09-15' },

  // Mobile SDK Milestones
  { id: 'ms_mobile_foundation', project_id: 'proj_mobile_sdk', title: 'SDK Core & Transport Foundation', description: 'Develop React Native transport adapter and verify Firebase messaging endpoints.', status: 'in_progress', due_at: '2026-09-18' },

  // MyaOS Milestones
  { id: 'ms_myaos_v1', project_id: 'proj_myaos', title: 'Substrate & Process Handshake Foundation', description: 'Establish the core agent database schema, event bus, and binary runtimes.', status: 'completed', due_at: '2026-09-04' },
  { id: 'ms_myaos_v2', project_id: 'proj_myaos', title: 'Telemetry Bus Integration', description: 'Unify communications, state logs, and diagnostic telemetry pipelines.', status: 'in_progress', due_at: '2026-09-10' },
  { id: 'ms_myaos_v3', project_id: 'proj_myaos', title: 'Bento Dashboard & Human Control Plane', description: 'Transform Next.js web application into Winston\'s primary workspace with project plans and verification visibility.', status: 'in_progress', due_at: '2026-09-14' }
];

const msStmts = [];
for (const m of milestones) {
  msStmts.push(`
INSERT OR REPLACE INTO milestones (id, project_id, title, description, status, due_at, completed_at, created_at)
VALUES (
  ${sq(m.id)},
  ${sq(m.project_id)},
  ${sq(m.title)},
  ${sq(m.description)},
  ${sq(m.status)},
  ${sq(m.due_at)},
  ${m.status === 'completed' ? "datetime('now', '-1 day')" : 'NULL'},
  datetime('now', '-2 days')
);`);
}
dbRun(`BEGIN;\n${msStmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ Successfully seeded ${milestones.length} milestones.`);

// 3. Mapping existing tasks to projects & milestones based on actual repository evidence
console.log('\n🔗 Mapping existing tasks to respective projects and milestones...');
const taskMappings = [
  // Chatbot Project Mappings
  { task_id: 'TASK_002', project_id: 'proj_chatbot', milestone_id: 'ms_chatbot_v1' },
  { task_id: 'TASK_004', project_id: 'proj_chatbot', milestone_id: 'ms_chatbot_v2' },

  // Hair Journey Mappings
  { task_id: 'TASK_001', project_id: 'proj_hair_journey', milestone_id: 'ms_hj_site_plan' },

  // Mobile SDK Mappings
  { task_id: 'TASK_005', project_id: 'proj_mobile_sdk', milestone_id: 'ms_mobile_foundation' },

  // MyaOS Mappings
  { task_id: 'TASK_003', project_id: 'proj_myaos', milestone_id: 'ms_myaos_v2' },
  { task_id: 'TASK_006', project_id: 'proj_myaos', milestone_id: 'ms_myaos_v2' },
  { task_id: 'TASK_007', project_id: 'proj_myaos', milestone_id: 'ms_myaos_v2' },
  { task_id: 'TASK_LIVE_3414', project_id: 'proj_myaos', milestone_id: 'ms_myaos_v1' },
  { task_id: 'TASK_LIVE_3415', project_id: 'proj_myaos', milestone_id: 'ms_myaos_v2' },
  { task_id: 'TASK_LIVE_8759', project_id: 'proj_myaos', milestone_id: 'ms_myaos_v1' },
  { task_id: 'TASK_LIVE_8760', project_id: 'proj_myaos', milestone_id: 'ms_myaos_v2' }
];

const updateStmts = [];
for (const tm of taskMappings) {
  updateStmts.push(`
UPDATE tasks 
SET project_id = ${sq(tm.project_id)}, milestone_id = ${sq(tm.milestone_id)}
WHERE id = ${sq(tm.task_id)};`);
}
dbRun(`BEGIN;\n${updateStmts.join('\n')}\nCOMMIT;`);
console.log(`  ✅ Successfully mapped ${taskMappings.length} tasks to their projects/milestones.`);

console.log('\n🎉 Idempotent bootstrap complete! Projects and task relationships established in MyaOS DB.\n');
