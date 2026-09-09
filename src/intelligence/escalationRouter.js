/**
 * Phase D: real escalation execution, walking escalation_chains step by
 * step (Section 10/11 - "cheap first, escalate on evidence, not because a
 * stronger model exists").
 *
 * Honesty constraint carried over from Phase C: Gemini steps get a real
 * attempt with real failure classification. Claude steps have no API to
 * fail against - reaching one in the chain means "hand off to the current
 * session," which correctly ENDS automated escalation rather than
 * pretending to keep trying. This is not a limitation worked around here;
 * it's the accurate shape of what's actually executable today.
 */

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const geminiAdapter = require('./geminiAdapter');

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
 * Walk the escalation chain for taskType, attempting each step in order.
 * Stops at the first success, the first step with no real execution path
 * (hands back), or the end of the chain.
 *
 * @param {object} task - { taskId, taskType, prompt }
 * @returns {object} full trace: every attempt, the final outcome, and
 *   whether escalation actually happened (more than one step attempted).
 */
async function executeWithEscalation(task) {
  const chain = queryDb(
    `SELECT ec.step, ec.model_id, ec.reason, mr.provider, mr.availability
     FROM escalation_chains ec
     JOIN model_registry mr ON mr.id = ec.model_id
     WHERE ec.task_type = ${escape(task.taskType)}
     ORDER BY ec.step ASC`
  );

  if (chain.length === 0) {
    return { ok: false, reason: 'NO_ESCALATION_CHAIN_DEFINED', taskType: task.taskType, attempts: [] };
  }

  const attempts = [];
  // attempt_number must be unique per task_id across the task's WHOLE
  // history (schema: UNIQUE(task_id, attempt_number)), not per invocation
  // of this function - continue from whatever's already logged, don't
  // assume this is the task's first ever attempt.
  const priorMax = queryDb(`SELECT COALESCE(MAX(attempt_number), 0) as m FROM attempt_log WHERE task_id = ${escape(task.taskId)}`);
  let attemptNumber = priorMax[0]?.m || 0;
  let previousModelId = null;

  for (const step of chain) {
    attemptNumber += 1;
    const startedAt = new Date().toISOString();

    if (step.availability !== 'available') {
      attempts.push({ step: step.step, modelId: step.model_id, outcome: 'SKIPPED_UNAVAILABLE' });
      continue;
    }

    if (step.provider === 'Gemini') {
      // Look up the actual concrete model string this registry row points
      // at - a routing decision that ignores this and always calls the
      // adapter's own default would make the registry configuration inert.
      const [{ model_id: concreteModel }] = queryDb(`SELECT model_id FROM model_registry WHERE id = ${escape(step.model_id)}`);
      const started = Date.now();
      const result = await geminiAdapter.generateContent(task.prompt, { model: concreteModel });
      const durationMs = Date.now() - started;

      runDb(`INSERT INTO attempt_log
        (id, task_id, attempt_number, model_id, started_at, completed_at, duration_ms, tokens_input, tokens_output, success, error_message, escalation_triggered)
        VALUES (${escape('att-' + crypto.randomBytes(6).toString('hex'))}, ${escape(task.taskId)}, ${attemptNumber},
          ${escape(step.model_id)}, ${escape(startedAt)}, ${escape(new Date().toISOString())}, ${durationMs},
          ${result.ok ? escape(result.usage?.inputTokens) : 'NULL'}, ${result.ok ? escape(result.usage?.outputTokens) : 'NULL'},
          ${result.ok ? 1 : 0}, ${escape(result.ok ? null : result.message)}, ${previousModelId ? 1 : 0})`);

      attempts.push({ step: step.step, modelId: step.model_id, outcome: result.ok ? 'SUCCESS' : 'FAILED', errorClass: result.ok ? null : result.errorClass, result: result.ok ? result : null });

      if (result.ok) {
        return { ok: true, finalModel: step.model_id, escalated: attemptNumber > 1, attempts, result };
      }

      // Real failure - record why we're escalating, then continue the loop to the next step.
      const nextStep = chain[chain.indexOf(step) + 1];
      if (nextStep) {
        runDb(`INSERT INTO escalation_decisions
          (id, task_id, from_model_id, to_model_id, attempt_count, failure_reason, escalation_reason, triggered_by)
          VALUES (${escape('esc-' + crypto.randomBytes(6).toString('hex'))}, ${escape(task.taskId)}, ${escape(step.model_id)},
            ${escape(nextStep.model_id)}, ${attemptNumber}, ${escape(result.errorClass)}, ${escape('automatic: ' + result.errorClass + ' on ' + step.model_id)}, ${escape('escalationRouter')})`);
      }
      previousModelId = step.model_id;
      continue;
    }

    if (step.provider === 'Claude') {
      // No API path. This correctly ends automated escalation.
      attempts.push({ step: step.step, modelId: step.model_id, outcome: 'HAND_TO_CURRENT_SESSION' });
      return {
        ok: false,
        finalModel: step.model_id,
        escalated: attemptNumber > 1,
        attempts,
        note: `Escalation chain reached ${step.model_id} (Claude, no API path) after ${attemptNumber - 1} failed attempt(s). This task should now be handled by the current Claude Code session directly.`,
      };
    }

    attempts.push({ step: step.step, modelId: step.model_id, outcome: 'UNSUPPORTED_PROVIDER' });
  }

  return { ok: false, finalModel: null, escalated: attempts.length > 1, attempts, note: 'Exhausted the entire escalation chain with no success and no executable Claude step to hand off to.' };
}

module.exports = { executeWithEscalation };
