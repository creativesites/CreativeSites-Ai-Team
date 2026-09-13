#!/usr/bin/env node
/**
 * Submit Mobile SDK Polish Tasks (TASK_MSDK_005, TASK_MSDK_006, TASK_MSDK_009)
 * 
 * Transitions task statuses to 'in_review' (Verification Gate).
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
  const tmp = '/tmp/myaos_msdk_tasks_submit.sql';
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    execSync(`sqlite3 "${DB}" < "${tmp}"`, { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

console.log('📝 Submitting Mobile SDK tasks and signaling the Independent Verifiers...');

const sql = `
BEGIN;

-- 1. Transition tasks to 'in_review'
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_MSDK_005';
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_MSDK_006';
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_MSDK_009';

-- 2. Log status changed events to the event bus
INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_005","status":"in_review","notes":"Successfully implemented real Open-Meteo getWeatherForecast tool and updated Mya prompts. Ready for independent review."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_006","status":"in_review","notes":"Completed context pipeline field audit. Forwarding streak, actions, state, and entities correctly. Ready for independent review."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_009","status":"in_review","notes":"Integrated Response Format Intelligence prompt instructions to choose between PROSE and STRUCTURED modes dynamically. Ready for independent review."}',
  datetime('now')
);

COMMIT;
`;

try {
  dbRun(sql);
  console.log('✅ Success! Tasks TASK_MSDK_005, TASK_MSDK_006, and TASK_MSDK_009 are now marked as "in_review", awaiting independent verification.');
} catch (e) {
  console.error('❌ Failed to transition mobile SDK tasks:', e.message);
}
