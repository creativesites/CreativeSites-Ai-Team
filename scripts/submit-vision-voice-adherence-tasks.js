#!/usr/bin/env node
/**
 * Submit All Reopened and Newly Completed Mobile/Vision Tasks
 * 
 * Transitions task statuses to 'in_review' (Verification Gate) inside data/myaos.db:
 * - TASK_MSDK_007 (adherence personalization in constructPrompt)
 * - TASK_MSDK_008 (community post in-chat component)
 * - TASK_MSDK_009 (format intelligence in constructPrompt)
 * - TASK_MSDK_011 (multimodal base64 vision pipeline in AiCore and express index.js)
 * - TASK_MSDK_012 (real MyaVoiceClient wiring in ChatScreen)
 * - TASK_HJ_024 (hairstyle detection via vision - unblocked by vision pipeline)
 * 
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
  const tmp = '/tmp/myaos_msdk_all_tasks_submit.sql';
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    execSync(`sqlite3 "${DB}" < "${tmp}"`, { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

console.log('📝 Submitting newly completed Mobile, Vision and Community tasks to verification ledger...');

const sql = `
BEGIN;

-- 1. Transition tasks to 'in_review'
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_MSDK_007';
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_MSDK_008';
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_MSDK_009';
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_MSDK_011';
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_MSDK_012';
UPDATE tasks SET status = 'in_review', updated_at = datetime('now') WHERE id = 'TASK_HJ_024';

-- 2. Log status changed events to the event bus
INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_007","status":"in_review","notes":"Successfully implemented dynamic adherence-to-recommendation checks directly inside constructPrompt.js. Ready for independent review."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_008","status":"in_review","notes":"Implemented real getCommunityPost tool querying SQLite and developed interactive MyaCommunityPostCard client component. Ready for independent review."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_009","status":"in_review","notes":"Successfully integrated Response Format Intelligence instructions directly inside constructPrompt.js. Ready for independent review."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_011","status":"in_review","notes":"Closed the double-gap vision pipeline: on-the-wire attachments forwarding client-side, and automatic base64 inlineData conversion server-side inside index.js and AiCore. Ready for independent review."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_012","status":"in_review","notes":"Fully wired the active MyaVoiceClient into the onVoice slot of MyaComposer inside MyaChatScreen.js. Ready for independent review."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_HJ_024","status":"in_review","notes":"Unblocked by the real vision-pipeline. Hairstyle detection from media via Gemini is fully functional and ready for independent check."}',
  datetime('now')
);

COMMIT;
`;

try {
  dbRun(sql);
  console.log('✅ Success! Tasks TASK_MSDK_007, TASK_MSDK_008, TASK_MSDK_009, TASK_MSDK_011, TASK_MSDK_012, and TASK_HJ_024 are now marked as "in_review", awaiting independent verification.');
} catch (e) {
  console.error('❌ Failed to transition mobile SDK tasks:', e.message);
}
