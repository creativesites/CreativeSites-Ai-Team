/**
 * Real model registry queries against data/myaos.db, plus a genuine live
 * health check for the one provider that actually has an API path today
 * (Gemini). Claude has no API key in this environment - see
 * community/INTELLIGENCE_LAYER_STATUS.md - so its "availability" is a
 * structural fact (this session IS the Claude runtime), not something a
 * health check can independently confirm or refute. Not faking a check for
 * it; the function below says so explicitly rather than always returning true.
 */

const path = require('path');
const { execFileSync } = require('child_process');
const { listModels: listGeminiModels } = require('./geminiAdapter');

const DB_PATH = path.resolve(__dirname, '../../data/myaos.db');

function queryDb(sql) {
  const out = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf8' });
  return out.trim() ? JSON.parse(out) : [];
}

function runDb(sql) {
  execFileSync('sqlite3', [DB_PATH, sql], { encoding: 'utf8' });
}

function escape(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Real capability matching against the live table - not a hardcoded list.
 * Returns rows whose `capabilities` JSON array contains ALL of the
 * requested capabilities, ordered cheapest-tier first (an honest proxy for
 * "try cheap before expensive", matching escalation_chains' own ordering
 * philosophy - this does NOT execute an escalation, it only lists candidates).
 */
function getCandidates(requiredCapabilities = [], { availableOnly = true } = {}) {
  const rows = queryDb(`SELECT * FROM model_registry`);
  const tierOrder = { cheap: 0, mid: 1, high: 2, top: 3 };
  return rows
    .filter((r) => {
      if (availableOnly && r.availability !== 'available') return false;
      let caps = [];
      try { caps = JSON.parse(r.capabilities || '[]'); } catch (e) { caps = []; }
      return requiredCapabilities.every((c) => caps.includes(c));
    })
    .sort((a, b) => (tierOrder[a.capability_tier] ?? 9) - (tierOrder[b.capability_tier] ?? 9));
}

/**
 * Live health check. For Gemini: a real API call (listModels). For anything
 * else: explicitly UNKNOWN/NOT_CHECKABLE rather than a guess - there is no
 * check this function can perform for a session-based runtime like Claude
 * Code, and pretending otherwise would be exactly the fabrication this
 * whole effort exists to avoid.
 */
async function checkHealth(modelRegistryId) {
  const rows = queryDb(`SELECT * FROM model_registry WHERE id = ${escape(modelRegistryId)}`);
  const row = rows[0];
  if (!row) return { ok: false, reason: 'NOT_FOUND' };

  if (row.provider === 'Gemini' && row.id === 'model-gemini-api') {
    const result = await listGeminiModels();
    const now = new Date().toISOString();
    const newAvailability = result.ok ? 'available' : 'unavailable';
    runDb(`UPDATE model_registry SET availability = ${escape(newAvailability)}, last_checked = ${escape(now)} WHERE id = ${escape(modelRegistryId)}`);
    return {
      ok: result.ok,
      checkedVia: 'live API call (listModels)',
      modelsVisible: result.ok ? result.models.length : 0,
      availability: newAvailability,
      checkedAt: now,
    };
  }

  return {
    ok: null,
    checkedVia: 'NONE - no automated check exists for this runtime',
    reason: row.provider === 'Gemini' ? 'Antigravity IDE runtime - human must confirm quota status' : 'Claude Code session - this session itself is the evidence, not an external check',
    availability: row.availability,
  };
}

module.exports = { getCandidates, checkHealth };
