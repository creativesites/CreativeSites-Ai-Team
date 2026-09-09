/**
 * Phase E: tiered context packaging (Section 18) - assembles only what a
 * task actually needs from real tables (tasks, facts), rather than dumping
 * the whole organization into every prompt.
 *
 * Relevance matching here is deliberately simple (tag/keyword overlap, not
 * embeddings/semantic search - Section 41 explicitly separates "retrieval"
 * as its own capability, not implemented here). A crude but honest match is
 * better than a fabricated "semantic relevance" claim this system can't
 * actually back up - there's no embedding model wired in anywhere.
 */

const path = require('path');
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

function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

/**
 * Find facts whose tags/category overlap with the task's own keywords
 * (required_capabilities + significant words from the title). Real
 * substring/array-overlap matching against the live `facts` table - not
 * semantic search, not fabricated relevance scoring.
 */
function findRelevantFacts(task, limit = 5) {
  const requiredCapabilities = safeJson(task.required_capabilities, []);
  const titleWords = (task.title || '').toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const keywords = [...new Set([...requiredCapabilities.map((c) => c.toLowerCase()), ...titleWords])];

  if (keywords.length === 0) return [];

  const allFacts = queryDb(`SELECT id, claim, category, tags, verified_at, status FROM facts WHERE status = 'active'`);
  return allFacts
    .map((f) => {
      const tags = safeJson(f.tags, []).map((t) => String(t).toLowerCase());
      const claimLower = (f.claim || '').toLowerCase();
      const matchCount = keywords.filter((k) => tags.includes(k) || claimLower.includes(k)).length;
      return { ...f, matchCount };
    })
    .filter((f) => f.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, limit);
}

/**
 * Build a context package at the requested tier (Section 18: 0-minimal
 * through 3-organizational). Each tier strictly extends the previous one -
 * this is additive, not a different shape per tier.
 */
function buildContextPackage(taskId, tier = 1) {
  const rows = queryDb(`SELECT * FROM tasks WHERE id = ${escape(taskId)}`);
  const task = rows[0];
  if (!task) return { ok: false, reason: 'TASK_NOT_FOUND' };

  const pkg = {
    tier,
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      requiredCapabilities: safeJson(task.required_capabilities, []),
      acceptanceCriteria: safeJson(task.acceptance_criteria, []),
    },
  };

  if (tier >= 1) {
    pkg.dependencies = safeJson(task.dependencies, []);
    pkg.artifacts = safeJson(task.artifacts, []);
    pkg.repo = task.repo || null;
    pkg.filePath = task.original_file_path || null;
  }

  if (tier >= 2) {
    pkg.relevantFacts = findRelevantFacts(task).map((f) => ({
      id: f.id, claim: f.claim, category: f.category, verifiedAt: f.verified_at, matchStrength: f.matchCount,
    }));
    if (task.project_id) {
      const project = queryDb(`SELECT id, title, description, status FROM projects WHERE id = ${escape(task.project_id)}`)[0];
      pkg.project = project || null;
    }
  }

  if (tier >= 3) {
    // Honest gap: no `policies`/`lessons` table with real populated content
    // exists yet in this schema (facts has a generic `category` field, not
    // a dedicated lessons-learned store). Reporting that plainly rather than
    // returning an empty array that looks like "checked, found nothing."
    pkg.organizationalContext = { available: false, reason: 'No populated policies/lessons store exists yet - this tier is defined but has no real data source.' };
  }

  const approxSize = JSON.stringify(pkg).length;
  return { ok: true, package: pkg, approxChars: approxSize };
}

module.exports = { buildContextPackage, findRelevantFacts };
