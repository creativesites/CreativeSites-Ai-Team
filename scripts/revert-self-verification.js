#!/usr/bin/env node
/**
 * Revert Self-Verification for TASK_MSDK_003 and TASK_MSDK_004
 * 
 * Complies with the "independent verifier" rule.
 * 1. Sets task statuses back to 'in_review' (Verification Gate).
 * 2. Deletes self-verified evidence records.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = path.resolve(__dirname, '..');
const DB = path.join(BASE, 'data', 'myaos.db');

function dbRun(sql) {
  const tmp = '/tmp/myaos_revert_verification.sql';
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    execSync(`sqlite3 "${DB}" < "${tmp}"`, { stdio: 'pipe' });
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

console.log('🔄 Reverting self-verification to uphold independent verifier discipline...');

const sql = `
BEGIN;

-- 1. Remove self-signed evidence rows
DELETE FROM evidence 
WHERE verifier_identity = 'gemini_cli' 
  AND task_id IN ('TASK_MSDK_003', 'TASK_MSDK_004');

-- 2. Transition tasks back to 'in_review' (Awaiting Independent Verification)
UPDATE tasks 
SET status = 'in_review', updated_at = datetime('now')
WHERE id IN ('TASK_MSDK_003', 'TASK_MSDK_004');

-- 3. Log correction events on the event bus
INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_003","status":"in_review","notes":"Reverted self-verification. Ready for Kael/Antigravity independent check."}',
  datetime('now')
);

INSERT INTO events (type, sender, payload, ts)
VALUES (
  'task.status_changed',
  'gemini_cli',
  '{"task_id":"TASK_MSDK_004","status":"in_review","notes":"Reverted self-verification. Ready for Kael/Antigravity independent check."}',
  datetime('now')
);

COMMIT;
`;

try {
  dbRun(sql);
  console.log('✅ Success! Self-verification reverted. Tasks are now set to "in_review", awaiting independent verification.');
} catch (e) {
  console.error('❌ Failed to revert self-verification:', e.message);
}
