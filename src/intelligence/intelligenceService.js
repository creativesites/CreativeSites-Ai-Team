/**
 * IntelligenceService — the single entry point the rest of the org should
 * call instead of talking to providers or the model registry directly
 * (Section 4/14/36 of the Intelligence Layer spec).
 *
 * Honesty constraint that shapes this whole file: only ONE provider is
 * actually API-callable in this environment right now (Gemini - see
 * geminiAdapter.js). Claude has no API key; "executing" a Claude-tier task
 * means the CURRENT Claude Code session does the work directly, not that
 * this service can dispatch to it. A provider-agnostic service that pretends
 * otherwise would be exactly the fabrication this whole effort exists to
 * stop. So: for a Gemini candidate, this really calls the API. For a Claude
 * candidate, it returns a routing decision and tells the caller to proceed
 * in-session - it does not simulate a call that cannot happen.
 */

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { getCandidates } = require('./modelRegistry');
const geminiAdapter = require('./geminiAdapter');

const DB_PATH = path.resolve(__dirname, '../../data/myaos.db');

function escape(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function runDb(sql) {
  execFileSync('sqlite3', [DB_PATH, sql], { encoding: 'utf8' });
}

/**
 * Route a task to the cheapest sufficient available model and record the
 * decision - explainable per Section 31, whether or not execution follows.
 *
 * @param {object} task
 * @param {string} task.taskId - must reference a real row in `tasks`, since
 *   model_selection_history has a FK constraint on it - this is deliberate,
 *   not a limitation to work around. Pass a real task ID.
 * @param {string[]} task.requiredCapabilities
 * @param {string} [task.taskType='general']
 * @param {string} [task.effortLevel='MEDIUM']
 */
function route(task) {
  const candidates = getCandidates(task.requiredCapabilities || []);
  const selected = candidates[0] || null;
  const selectionId = `sel-${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();

  const reason = selected
    ? `Cheapest available candidate matching [${(task.requiredCapabilities || []).join(', ')}] - tier: ${selected.capability_tier}`
    : `No available model in model_registry matches all required capabilities [${(task.requiredCapabilities || []).join(', ')}]`;

  runDb(`INSERT INTO model_selection_history
    (id, task_id, task_type, required_capabilities, effort_level, candidates, selected_model, selected_reason, created_at)
    VALUES (
      ${escape(selectionId)}, ${escape(task.taskId)}, ${escape(task.taskType || 'general')},
      ${escape(JSON.stringify(task.requiredCapabilities || []))}, ${escape(task.effortLevel || 'MEDIUM')},
      ${escape(JSON.stringify(candidates.map((c) => ({ model_id: c.id, tier: c.capability_tier }))))},
      ${escape(selected ? selected.id : null)}, ${escape(reason)}, ${escape(now)}
    )`);

  return { selectionId, candidates, selected, reason };
}

/**
 * Route AND execute, where execution is actually possible.
 * Returns a result that is explicit about which of the two things happened -
 * a real provider call, or a hand-back to the current session.
 */
async function execute(task) {
  const routing = route(task);

  if (!routing.selected) {
    return { ...routing, executed: false, executionPath: 'NONE', result: null };
  }

  if (routing.selected.provider === 'Gemini' && routing.selected.id === 'model-gemini-api') {
    const genResult = await geminiAdapter.generateContent(task.prompt, {});
    runDb(`UPDATE model_selection_history SET
        success = ${genResult.ok ? 1 : 0},
        tokens_used = ${genResult.ok ? escape(genResult.usage?.totalTokens) : 'NULL'},
        completed_at = ${escape(new Date().toISOString())}
      WHERE id = ${escape(routing.selectionId)}`);
    return { ...routing, executed: true, executionPath: 'GEMINI_API_CALL', result: genResult };
  }

  if (routing.selected.provider === 'Claude') {
    // No API path exists. Being explicit about this rather than faking a call.
    return {
      ...routing,
      executed: false,
      executionPath: 'HAND_TO_CURRENT_SESSION',
      result: null,
      note: `Selected ${routing.selected.id}, but Claude has no API integration in this environment - this task should be done by the current Claude Code session directly (switch tier with /model if needed), not dispatched by this service.`,
    };
  }

  return {
    ...routing,
    executed: false,
    executionPath: 'UNSUPPORTED',
    result: null,
    note: `Selected ${routing.selected.id} (provider: ${routing.selected.provider}), but no execution path is implemented for this provider yet.`,
  };
}

module.exports = { route, execute };
