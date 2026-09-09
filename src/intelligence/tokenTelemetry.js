/**
 * Phase F: real token usage aggregation from attempt_log (populated for
 * real by escalationRouter since Phase D - not simulated here).
 *
 * Cost fields are intentionally absent from every summary below: no
 * verified per-token pricing exists anywhere in this system (see Phase A -
 * an earlier report invented Gemini pricing that was off by orders of
 * magnitude from anything real). Reporting UNKNOWN for cost is the honest
 * choice until a real published rate is obtained; do not add an estimate.
 */

const path = require('path');
const { execFileSync } = require('child_process');

const DB_PATH = path.resolve(__dirname, '../../data/myaos.db');

function queryDb(sql) {
  const out = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf8' });
  return out.trim() ? JSON.parse(out) : [];
}

/** Real totals, only from attempts that actually completed with token counts. */
function getUsageSummary() {
  const rows = queryDb(`SELECT model_id, COUNT(*) as attempts,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
      SUM(tokens_input) as total_input, SUM(tokens_output) as total_output,
      AVG(duration_ms) as avg_duration_ms
    FROM attempt_log GROUP BY model_id`);

  const totalAttempts = queryDb(`SELECT COUNT(*) as n FROM attempt_log`)[0]?.n || 0;

  return {
    totalAttempts,
    byModel: rows.map((r) => ({
      modelId: r.model_id,
      attempts: r.attempts,
      successes: r.successes,
      totalInputTokens: r.total_input ?? 'UNKNOWN',
      totalOutputTokens: r.total_output ?? 'UNKNOWN',
      avgDurationMs: r.avg_duration_ms ? Math.round(r.avg_duration_ms) : 'UNKNOWN',
      costUsd: 'UNKNOWN - no verified pricing exists',
    })),
    note: totalAttempts === 0
      ? 'No real attempts logged yet - this is not a fabricated zero, attempt_log is genuinely empty.'
      : `${totalAttempts} real logged attempts, from actual escalationRouter executions.`,
  };
}

/**
 * Compare a task's actual real token usage (sum across all its attempts)
 * against a caller-supplied budget (Section 28). This does not enforce
 * anything - it reports status for the caller to act on, since "what to do
 * about it" (compress context, escalate, ask a human) is a decision this
 * function shouldn't make unilaterally.
 */
function checkBudget(taskId, budget = {}) {
  const rows = queryDb(`SELECT SUM(tokens_input + tokens_output) as total FROM attempt_log WHERE task_id = '${taskId.replace(/'/g, "''")}'`);
  const used = rows[0]?.total ?? 0;

  if (!budget.expected) return { used, status: 'NO_BUDGET_DEFINED' };

  let status = 'WITHIN_EXPECTED';
  if (budget.hardLimit && used >= budget.hardLimit) status = 'HARD_LIMIT_EXCEEDED';
  else if (budget.warning && used >= budget.warning) status = 'WARNING_THRESHOLD_EXCEEDED';
  else if (used > budget.expected) status = 'ABOVE_EXPECTED';

  return { used, expected: budget.expected, warning: budget.warning ?? null, hardLimit: budget.hardLimit ?? null, status };
}

module.exports = { getUsageSummary, checkBudget };
