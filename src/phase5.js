const { execFileSync } = require('child_process');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/myaos.db');

function queryDb(sql) {
  try {
    const stdout = execFileSync('sqlite3', ['-json', dbPath, sql]).toString().trim();
    return stdout ? JSON.parse(stdout) : [];
  } catch (e) {
    return [];
  }
}

function runDb(sql) {
  try {
    execFileSync('sqlite3', [dbPath, sql]);
    return true;
  } catch (e) {
    return false;
  }
}

class ObservabilityEngine {
  logMetric(agentId, metricType, value, metadata = {}) {
    const sql = `INSERT INTO automation_metrics (id, agent_id, metric_type, value, metadata, recorded_at) VALUES ('metric_${Date.now()}', '${agentId}', '${metricType}', ${value}, '${JSON.stringify(metadata)}', datetime('now'));`;
    return runDb(sql);
  }

  getMetrics(agentId) {
    return queryDb(`SELECT * FROM automation_metrics WHERE agent_id = '${agentId}' ORDER BY recorded_at DESC`);
  }
}

class LearningEngine {
  recordSnippet(identityId, key, value, evidenceClass = 'VERIFIED') {
    const sql = `INSERT OR REPLACE INTO memory_snippets (identity_id, key, value, evidence_class, updated_at) VALUES ('${identityId}', '${key}', '${value.replace(/'/g, "''")}', '${evidenceClass}', datetime('now'));`;
    return runDb(sql);
  }

  querySnippets(keyPattern) {
    return queryDb(`SELECT * FROM memory_snippets WHERE key LIKE '%${keyPattern}%' ORDER BY updated_at DESC`);
  }
}

module.exports = {
  ObservabilityEngine,
  LearningEngine,
};
