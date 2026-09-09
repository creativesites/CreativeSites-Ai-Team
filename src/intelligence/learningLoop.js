/**
 * Phase J: real learning-loop aggregation (Section 23/26).
 *
 * Deliberate scope boundary, stated here rather than silently: this module
 * computes and exposes real historical performance from attempt_log. It
 * does NOT feed back into escalationRouter's selection order yet. Reordering
 * a deterministic escalation chain based on a handful of manual test calls
 * would be manufacturing statistical confidence this system doesn't have -
 * "learning" from n=2 isn't learning, it's noise dressed up as a trend.
 * The aggregation is real and tested; acting on it is intentionally deferred
 * until there's enough real execution volume for a rate to mean anything.
 * `getHistoricalSuccessRate` returns a sample size alongside every rate for
 * exactly this reason - so a caller can refuse to act on a rate with n=1.
 */

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

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
 * Recompute model_performance from real attempt_log + model_selection_history
 * data (joined on task_id to recover task_type, which attempt_log itself
 * doesn't store). Idempotent - safe to call repeatedly; upserts, doesn't append.
 */
function recomputeModelPerformance() {
  const rows = queryDb(`
    SELECT al.model_id, msh.task_type,
           COUNT(*) as attempts,
           SUM(CASE WHEN al.success = 1 THEN 1 ELSE 0 END) as successes,
           SUM(CASE WHEN al.success = 0 THEN 1 ELSE 0 END) as failures,
           AVG(al.tokens_input + al.tokens_output) as avg_tokens,
           AVG(al.duration_ms) as avg_latency,
           MAX(al.completed_at) as last_used
    FROM attempt_log al
    JOIN model_selection_history msh ON msh.task_id = al.task_id
    WHERE msh.task_type IS NOT NULL
    GROUP BY al.model_id, msh.task_type
  `);

  for (const r of rows) {
    const id = `perf-${r.model_id}-${r.task_type}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    runDb(`INSERT INTO model_performance (id, model_id, task_type, attempts, successes, failures, avg_tokens_per_task, avg_latency_ms, last_used, updated_at)
      VALUES (${escape(id)}, ${escape(r.model_id)}, ${escape(r.task_type)}, ${r.attempts}, ${r.successes}, ${r.failures},
        ${r.avg_tokens ? Math.round(r.avg_tokens) : 'NULL'}, ${r.avg_latency ? Math.round(r.avg_latency) : 'NULL'},
        ${escape(r.last_used)}, ${escape(new Date().toISOString())})
      ON CONFLICT(model_id, task_type) DO UPDATE SET
        attempts = excluded.attempts, successes = excluded.successes, failures = excluded.failures,
        avg_tokens_per_task = excluded.avg_tokens_per_task, avg_latency_ms = excluded.avg_latency_ms,
        last_used = excluded.last_used, updated_at = excluded.updated_at`);
  }

  return { rowsUpdated: rows.length };
}

/**
 * Real historical rate, WITH sample size, so a caller can judge whether the
 * rate is meaningful. A rate without n is not information.
 */
function getHistoricalSuccessRate(modelId, taskType) {
  const rows = queryDb(`SELECT attempts, successes FROM model_performance WHERE model_id = ${escape(modelId)} AND task_type = ${escape(taskType)}`);
  const row = rows[0];
  if (!row || row.attempts === 0) return { modelId, taskType, sampleSize: 0, successRate: null, confidence: 'NO_DATA' };

  const rate = row.successes / row.attempts;
  // Explicit, stated threshold rather than a hidden magic number - 5 is
  // still small, but at least it's a real, named line rather than treating
  // n=1 and n=50 as equally trustworthy.
  const confidence = row.attempts < 5 ? 'LOW_SAMPLE_SIZE' : 'SUFFICIENT_SAMPLE';
  return { modelId, taskType, sampleSize: row.attempts, successRate: rate, confidence };
}

module.exports = { recomputeModelPerformance, getHistoricalSuccessRate };
