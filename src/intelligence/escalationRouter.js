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

  // Record the routing decision up front (Section 31: explainable routing).
  // This was missing entirely until caught by learningLoop's join returning
  // zero rows - escalationRouter attempted real executions and logged them
  // to attempt_log/escalation_decisions, but never recorded the "why" to
  // model_selection_history the way intelligenceService.route() does,
  // leaving the two Phase C/D code paths silently inconsistent.
  const selectionId = `sel-esc-${crypto.randomBytes(6).toString('hex')}`;
  runDb(`INSERT INTO model_selection_history
    (id, task_id, task_type, candidates, selected_model, selected_reason, created_at)
    VALUES (${escape(selectionId)}, ${escape(task.taskId)}, ${escape(task.taskType)},
      ${escape(JSON.stringify(chain.map((c) => ({ model_id: c.model_id, step: c.step }))))},
      ${escape(chain[0].model_id)}, ${escape('Escalation chain start: ' + chain[0].reason)}, ${escape(new Date().toISOString())})`);

  // Emit 'model_selected' on event_bus at escalation chain startup (TASK_INTEL_001)
  if (task.taskId) {
    runDb(`INSERT INTO event_bus (id, event_type, task_id, agent_id, model_id, reason, payload, created_at)
      VALUES (${escape('evb-' + crypto.randomBytes(6).toString('hex'))}, 'model_selected',
        ${escape(task.taskId)}, ${escape(task.agentId || 'gemini_cli')}, ${escape(chain[0].model_id)},
        ${escape('Escalation chain start: ' + chain[0].reason)}, ${escape(JSON.stringify({ selectionId }))}, datetime('now'))`);
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
      const [{ model_id: concreteModel }] = queryDb(`SELECT model_id FROM model_registry WHERE id = ${escape(step.model_id)}`);
      
      let attemptCountOnStep = 0;
      let result;
      let durationMs;
      
      while (attemptCountOnStep < 2) {
        attemptCountOnStep++;
        const startedAt = new Date().toISOString();
        
        if (attemptCountOnStep > 1 && task.taskId) {
          // This is a retry (TASK_INTEL_002)! Record retry in the event bus
          runDb(`INSERT INTO event_bus (id, event_type, task_id, agent_id, model_id, reason, payload, created_at)
            VALUES (${escape('evb-' + crypto.randomBytes(6).toString('hex'))}, 'task_retry',
              ${escape(task.taskId)}, ${escape(task.agentId || 'gemini_cli')}, ${escape(step.model_id)},
              ${escape('Rate limit or Provider error retry on ' + step.model_id)}, ${escape(JSON.stringify({ attemptNumber, attemptCountOnStep }))}, datetime('now'))`);
        }

        // Emit 'attempt_started' to event_bus (TASK_INTEL_001)
        const attemptId = `att-${crypto.randomBytes(6).toString('hex')}`;
        if (task.taskId) {
          runDb(`INSERT INTO event_bus (id, event_type, task_id, agent_id, model_id, reason, payload, created_at)
            VALUES (${escape('evb-' + crypto.randomBytes(6).toString('hex'))}, 'attempt_started',
              ${escape(task.taskId)}, ${escape(task.agentId || 'gemini_cli')}, ${escape(step.model_id)},
              ${escape('Step ' + step.step + ' attempt started (count: ' + attemptCountOnStep + ')')}, ${escape(JSON.stringify({ attemptId, attemptNumber, attemptCountOnStep }))}, datetime('now'))`);
        }

        const started = Date.now();
        result = await geminiAdapter.generateContent(task.prompt, { model: concreteModel });
        durationMs = Date.now() - started;

        // Emit 'attempt_completed' to event_bus (TASK_INTEL_001)
        if (task.taskId) {
          runDb(`INSERT INTO event_bus (id, event_type, task_id, agent_id, model_id, reason, payload, created_at)
            VALUES (${escape('evb-' + crypto.randomBytes(6).toString('hex'))}, 'attempt_completed',
              ${escape(task.taskId)}, ${escape(task.agentId || 'gemini_cli')}, ${escape(step.model_id)},
              ${escape('Step ' + step.step + ' attempt completed - success: ' + (result.ok ? 1 : 0))}, 
              ${escape(JSON.stringify({ attemptId, attemptNumber, success: result.ok, errorClass: result.ok ? null : result.errorClass }))}, datetime('now'))`);
        }

        // Record to attempt_log
        runDb(`INSERT INTO attempt_log
          (id, task_id, attempt_number, model_id, started_at, completed_at, duration_ms, tokens_input, tokens_output, success, error_message, escalation_triggered)
          VALUES (${escape('att-' + crypto.randomBytes(6).toString('hex'))}, ${escape(task.taskId)}, ${attemptNumber},
            ${escape(step.model_id)}, ${escape(startedAt)}, ${escape(new Date().toISOString())}, ${durationMs},
            ${result.ok ? escape(result.usage?.inputTokens) : 'NULL'}, ${result.ok ? escape(result.usage?.outputTokens) : 'NULL'},
            ${result.ok ? 1 : 0}, ${escape(result.ok ? null : result.message)}, ${previousModelId ? 1 : 0})`);

        attempts.push({ 
          step: step.step, 
          modelId: step.model_id, 
          outcome: result.ok ? 'SUCCESS' : 'FAILED', 
          errorClass: result.ok ? null : result.errorClass, 
          result: result.ok ? result : null 
        });

        if (result.ok) {
          runDb(`UPDATE model_selection_history SET
              selected_model = ${escape(step.model_id)}, success = 1,
              tokens_used = ${escape(result.usage?.totalTokens)}, completed_at = ${escape(new Date().toISOString())},
              escalated_to = ${previousModelId ? escape(step.model_id) : 'NULL'}
            WHERE id = ${escape(selectionId)}`);
          return { ok: true, finalModel: step.model_id, escalated: attemptNumber > 1, attempts, result };
        }

        const errorClass = result.errorClass;
        
        // TASK_INTEL_002: Differentiate fatal (auth/invalid) from transient (rate/provider) errors
        if (errorClass === 'AUTH_FAILURE' || errorClass === 'INVALID_REQUEST') {
          if (task.taskId) {
            runDb(`INSERT INTO event_bus (id, event_type, task_id, agent_id, model_id, reason, payload, created_at)
              VALUES (${escape('evb-' + crypto.randomBytes(6).toString('hex'))}, 'task_failed',
                ${escape(task.taskId)}, ${escape(task.agentId || 'gemini_cli')}, ${escape(step.model_id)},
                ${escape('Fatal ' + errorClass + ' on model ' + step.model_id + ' - aborting escalation chain')}, 
                ${escape(JSON.stringify({ errorClass, message: result.message }))}, datetime('now'))`);
            
            runDb(`INSERT INTO task_events (id, event_type, task_id, triggered_by, previous_status, new_status, model_used, agent_id, reason, payload, created_at)
              VALUES (${escape('tke-' + crypto.randomBytes(6).toString('hex'))}, 'task_failed',
                ${escape(task.taskId)}, 'escalationRouter', NULL, 'failed',
                ${escape(step.model_id)}, ${escape(task.agentId || 'gemini_cli')},
                ${escape('Fatal error: ' + errorClass)},
                ${escape(JSON.stringify({ errorClass, message: result.message }))}, datetime('now'))`);
          }

          runDb(`UPDATE model_selection_history SET success = 0, completed_at = ${escape(new Date().toISOString())} WHERE id = ${escape(selectionId)}`);
          
          return { ok: false, finalModel: step.model_id, escalated: previousModelId !== null, attempts, errorClass, note: `Fatal ${errorClass} encountered. Escalation aborted.` };
        }

        // Only retry once on transient failures (rate limits or provider error)
        if (errorClass === 'RATE_LIMIT' || errorClass === 'PROVIDER_ERROR') {
          if (attemptCountOnStep < 2) {
            attemptNumber += 1;
            continue; // Continue while loop for step retry
          }
        }

        break; // Break the while loop if not retrying, proceeding to escalate
      }

      // Real failure on step after optional retry - escalate to next model
      const nextStep = chain[chain.indexOf(step) + 1];
      if (nextStep && task.taskId) {
        runDb(`INSERT INTO escalation_decisions
          (id, task_id, from_model_id, to_model_id, attempt_count, failure_reason, escalation_reason, triggered_by)
          VALUES (${escape('esc-' + crypto.randomBytes(6).toString('hex'))}, ${escape(task.taskId)}, ${escape(step.model_id)},
            ${escape(nextStep.model_id)}, ${attemptNumber}, ${escape(result.errorClass)}, ${escape('automatic: ' + result.errorClass + ' on ' + step.model_id)}, ${escape('escalationRouter')})`);

        // Emit 'model_escalated' to event_bus (TASK_INTEL_001)
        runDb(`INSERT INTO event_bus (id, event_type, task_id, agent_id, model_id, previous_state, new_state, reason, payload, created_at)
          VALUES (${escape('evb-' + crypto.randomBytes(6).toString('hex'))}, 'model_escalated',
            ${escape(task.taskId)}, ${escape(task.agentId || 'gemini_cli')}, ${escape(nextStep.model_id)},
            ${escape(step.model_id)}, ${escape(nextStep.model_id)},
            ${escape('automatic escalation from ' + step.model_id + ' to ' + nextStep.model_id)},
            ${escape(JSON.stringify({ attemptNumber, failureReason: result.errorClass }))}, datetime('now'))`);

        // Emit 'task_escalated' to task_events (TASK_INTEL_001)
        runDb(`INSERT INTO task_events (id, event_type, task_id, triggered_by, previous_status, new_status, model_used, agent_id, reason, payload, created_at)
          VALUES (${escape('tke-' + crypto.randomBytes(6).toString('hex'))}, 'task_escalated',
            ${escape(task.taskId)}, 'escalationRouter', NULL, NULL,
            ${escape(nextStep.model_id)}, ${escape(task.agentId || 'gemini_cli')},
            ${escape('Escalated due to: ' + result.errorClass)},
            ${escape(JSON.stringify({ attemptNumber, from_model_id: step.model_id, to_model_id: nextStep.model_id }))}, datetime('now'))`);
      }
      previousModelId = step.model_id;
      continue;
    }

    if (step.provider === 'Claude') {
      // No API path. This correctly ends automated escalation.
      attempts.push({ step: step.step, modelId: step.model_id, outcome: 'HAND_TO_CURRENT_SESSION' });
      runDb(`UPDATE model_selection_history SET
          selected_model = ${escape(step.model_id)}, success = 0, completed_at = ${escape(new Date().toISOString())},
          escalated_to = ${escape(step.model_id)}
        WHERE id = ${escape(selectionId)}`);
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

  runDb(`UPDATE model_selection_history SET success = 0, completed_at = ${escape(new Date().toISOString())} WHERE id = ${escape(selectionId)}`);
  return { ok: false, finalModel: null, escalated: attempts.length > 1, attempts, note: 'Exhausted the entire escalation chain with no success and no executable Claude step to hand off to.' };
}

module.exports = { executeWithEscalation };
