/**
 * Phase G: orchestrator integration - a real, callable bridge between the
 * SQLite task store (data/myaos.db `tasks`, what the whole Intelligence
 * Layer is built against) and escalationRouter.
 *
 * Honest scope limitation, stated here because it matters: `src/orchestrator.js`'s
 * event handlers (task.created, etc.) listen to a DIFFERENT, legacy task
 * store - the filesystem `community/tasks.json` via TaskManager/EventBus.
 * The two stores are not reliably synced (checked directly: TASK-QA-001
 * exists in the JSON store but not yet in SQLite as of this writing). This
 * function does NOT hook into that legacy event system - doing so honestly
 * would require reconciling the two stores first, which is a real, separate
 * project, not a few lines to bridge silently. This is SQLite-native
 * automatic execution, callable directly or from whatever eventually reads
 * the SQLite `tasks` table for real task lifecycle events.
 */

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { executeWithEscalation } = require('./escalationRouter');

const DB_PATH = path.resolve(__dirname, '../../data/myaos.db');

function escape(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function queryDb(sql) {
  const out = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf8' });
  return out.trim() ? JSON.parse(out) : [];
}
function runDb(sql) {
  execFileSync('sqlite3', [DB_PATH, sql], { encoding: 'utf8' });
}

/**
 * Map a task's declared required_capabilities to a real escalation_chains
 * task_type. Deliberately narrow: only maps to a chain that has been proven
 * to actually execute something (large_context -> Gemini). Everything else
 * returns null, meaning "no automatic execution path exists for this task" -
 * which is the honest answer for the large majority of real work in this
 * org (coding, WordPress fixes, RN UI work) that genuinely needs a
 * human-spawned Claude Code session, not something this function should
 * pretend to handle.
 */
function mapToTaskType(requiredCapabilities) {
  const caps = requiredCapabilities || [];
  if (caps.includes('large-context') || caps.includes('summarization')) return 'large_context';
  return null;
}

/**
 * Attempt automatic execution of a real SQLite task. Returns a clear
 * outcome in every case - never silently does nothing without saying why.
 */
async function attemptAutomaticExecution(taskId) {
  const rows = queryDb(`SELECT * FROM tasks WHERE id = ${escape(taskId)}`);
  const task = rows[0];
  if (!task) return { attempted: false, reason: 'TASK_NOT_FOUND' };

  let requiredCapabilities = [];
  try { requiredCapabilities = JSON.parse(task.required_capabilities || '[]'); } catch (e) {}

  const taskType = mapToTaskType(requiredCapabilities);
  if (!taskType) {
    return { attempted: false, reason: 'NO_AUTOMATIC_EXECUTION_PATH', requiredCapabilities, note: 'This task needs a human-spawned agent session - no real automatic execution path matches its required capabilities.' };
  }

  const prompt = `${task.title}\n\n${task.description || ''}`.trim();
  const result = await executeWithEscalation({ taskId, taskType, prompt });

  if (result.ok) {
    // Technical execution succeeded. Per this org's own Planner/Verifier
    // distinction (see PLANNER_AGENT_PROMPT.md), that's NOT the same claim
    // as "accepted" - move to in_review, not done, and record real,
    // re-checkable evidence rather than a bare status flip.
    const evidenceId = `ev-auto-${crypto.randomBytes(6).toString('hex')}`;
    runDb(`INSERT INTO evidence (task_id, verifier_identity, evidence_class, passed, details, command_output)
      VALUES (${escape(taskId)}, 'intelligence-layer', 'OBSERVED', 1,
        ${escape(`Automatic execution via ${result.finalModel} succeeded.`)},
        ${escape(JSON.stringify(result.result))})`);
    runDb(`UPDATE tasks SET status = 'in_review', updated_at = ${escape(new Date().toISOString())} WHERE id = ${escape(taskId)}`);
    return { attempted: true, executed: true, finalModel: result.finalModel, escalated: result.escalated, evidenceId };
  }

  return {
    attempted: true,
    executed: false,
    reason: result.finalModel ? 'HAND_TO_CURRENT_SESSION' : 'CHAIN_EXHAUSTED',
    note: result.note,
    attempts: result.attempts,
  };
}

module.exports = { attemptAutomaticExecution, mapToTaskType };
