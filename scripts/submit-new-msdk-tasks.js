#!/usr/bin/env node
/**
 * Submit Mobile SDK Polish Tasks (TASK_MSDK_011, TASK_MSDK_012, TASK_MSDK_007)
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
  const tmp = '/tmp/myaos_new_msdk_tasks_submit.sql';
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    execSync(`sqlite3 "${DB}" < "${tmp}"`, { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

console.log('📝 Submitting newly completed Mobile SDK tasks to verification ledger...');

const sql = `
BEGIN;

-- 1. Transition tasks to 'in_review'
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_MSDK_011';
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_MSDK_012';
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_MSDK_007';

-- 2. Log status changed events to the event bus
INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_011","status":"in_review","notes":"Successfully wired the multimodal base64 image pixels download and parts compiling onto the NDJSON wire payload in AiCore. Ready for independent review."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_012","status":"in_review","notes":"Successfully wired MyaVoiceClient into the onVoice prop of MyaComposer and added transcription simulated fallback logic. Ready for independent review."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_007","status":"in_review","notes":"Implemented dynamic adherence-to-recommendation checks on assemblePrompt. Mya proactively recommends reducing wash-day spacing if user 30d adherence is below 50%. Ready for independent review."}',
  datetime('now')
);

COMMIT;
`;

try {
  dbRun(sql);
  console.log('✅ Success! Tasks TASK_MSDK_011, TASK_MSDK_012, and TASK_MSDK_007 are now marked as "in_review", awaiting independent verification.');
} catch (e) {
  console.error('❌ Failed to transition mobile SDK tasks:', e.message);
}
