#!/usr/bin/env node
/**
 * Submit Intelligence Layer Upgrades (TASK_INTEL_001, TASK_INTEL_002, TASK_INTEL_003)
 * 
 * Transitions task statuses from 'open' to 'in_review' (Verification Gate).
 * Logs chronological transitions on the system event bus.
 * Idempotent and transactional.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = path.resolve(__dirname, '..');
const DB = path.join(BASE, 'data', 'myaos.db');

function dbRun(sql) {
  const tmp = '/tmp/myaos_intel_tasks_submit.sql';
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    execSync(`sqlite3 "${DB}" < "${tmp}"`, { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

console.log('📝 Submitting Intelligence Layer tasks and signaling the Independent Verifiers...');

const sql = `
BEGIN;

-- 1. Transition tasks to 'in_review'
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_INTEL_001';
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_INTEL_002';
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_INTEL_003';

-- 2. Log status changed events to the event bus
INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_INTEL_001","status":"in_review","notes":"Successfully wired event_bus and task_events emission into routing/escalation paths. Ready for independent review."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_INTEL_002","status":"in_review","notes":"Surgically differentiated rate-limit retries from fatal auth failures in escalation. Ready for independent review."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_INTEL_003","status":"in_review","notes":"Integrated responseSchema generationConfig schema validation inside geminiAdapter. Ready for independent review."}',
  datetime('now')
);

COMMIT;
`;

try {
  dbRun(sql);
  console.log('✅ Success! Tasks TASK_INTEL_001, TASK_INTEL_002, and TASK_INTEL_003 have been set to "in_review", awaiting independent verification.');
} catch (e) {
  console.error('❌ Failed to transition intelligence tasks:', e.message);
}
