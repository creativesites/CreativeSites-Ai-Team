const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync, execSync } = require('child_process');

/**
 * Canonical, durable liveness observation.
 *
 * Replaces two things that were silently wrong before:
 *  1. In-memory session maps (src/runtime.js, src/runtime/*) that reset to
 *     empty every time a new CLI process starts, so `wake`/`status` could
 *     never see a session that was actually running.
 *  2. A loose substring cwd match ("myavana-chatbot".includes matched
 *     "myavana-chatbot-dashboard") that produced false LIVE results.
 *
 * This writes what it observes into the SQLite DB (identities + runtimes
 * tables) so any process — CLI, dashboard, orchestrator — reads the same
 * durable truth instead of re-deriving it from process-local memory.
 */

const SOCK_DIR = '/tmp/cc-socks';

const IDE_CWD_HINTS = {
  atlas: 'myavana-chatbot',
  iris: 'myavana-chatbot-dashboard',
  vela: 'myavana-hair-journey',
  astra: 'myavana-chatbot',
  nexus: 'creativesites-ai-team',
  meridian: 'creativesites-ai-team',
};

// Kael/Lyra currently only run as ephemeral headless-cli child processes with
// no durable cross-process record. Do not fabricate a status for them here.
const EPHEMERAL_HEADLESS = new Set(['kael', 'lyra']);

function basename(p) {
  return String(p).replace(/\/+$/, '').split('/').pop()?.toLowerCase() || '';
}

function getObservedSockets(sockDir = SOCK_DIR) {
  let files = [];
  try {
    files = fs.readdirSync(sockDir).filter((f) => f.endsWith('.sock'));
  } catch (e) {
    return [];
  }
  return files.map((f) => {
    const pidMatch = f.match(/^(\d+)\.sock$/);
    const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
    let cwd = null;
    let alive = false;
    if (pid) {
      try {
        const out = execFileSync('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'], { encoding: 'utf8' });
        const match = out.match(/n(.*)/);
        if (match) cwd = match[1].trim();
        alive = true;
      } catch (e) {
        alive = false;
      }
    }
    return { socket: f, pid, cwd, alive };
  });
}

/**
 * Observe current liveness for every known identity.
 * Returns { checkedAt, sockets, agents: [{ id, liveness, evidence, pid }] }
 * Does NOT write to the DB — call recordLiveness() for that, or use
 * observeAndRecord() to do both.
 */
function observeLiveness(identityIds, options = {}) {
  const sockDir = options.sockDir || SOCK_DIR;
  const sockets = getObservedSockets(sockDir);
  const checkedAt = new Date().toISOString();

  const firstPass = identityIds.map((id) => {
    if (id === 'orchestrator') {
      return { id, liveness: 'LIVE', evidence: 'MyaOS Orchestrator daemon active in substrate runtime.', pid: process.pid };
    }
    if (EPHEMERAL_HEADLESS.has(id)) {
      return { id, liveness: 'UNKNOWN', evidence: 'No durable session tracking for headless-cli workers — they run as short-lived child processes with no cross-process record.', pid: null };
    }
    const hint = IDE_CWD_HINTS[id];
    if (!hint) {
      return { id, liveness: 'UNKNOWN', evidence: 'No known socket/cwd hint registered for this identity.', pid: null };
    }
    const matched = sockets.find((s) => s.alive && s.cwd && basename(s.cwd) === hint);
    if (matched) {
      return { id, liveness: 'LIVE', evidence: `Live process observed: PID ${matched.pid}, cwd is exactly ".../${hint}".`, pid: matched.pid };
    }
    return { id, liveness: 'OFFLINE', evidence: `No live socket with cwd exactly ".../${hint}" found at time of check.`, pid: null };
  });

  const pidCounts = new Map();
  for (const r of firstPass) if (r.pid) pidCounts.set(r.pid, (pidCounts.get(r.pid) || 0) + 1);

  const agents = firstPass.map((r) => {
    if (r.pid && pidCounts.get(r.pid) > 1) {
      return { ...r, liveness: 'UNKNOWN', evidence: `PID ${r.pid} is live in the expected directory, but ${pidCounts.get(r.pid)} identities share that cwd with no way to tell which one this session is.` };
    }
    return r;
  });

  return { checkedAt, sockets, agents };
}

function sqlEscape(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function runSql(dbPath, statements) {
  const tmp = path.join(os.tmpdir(), `myaos_liveness_${crypto.randomBytes(6).toString('hex')}.sql`);
  fs.writeFileSync(tmp, statements.join('\n'), 'utf8');
  try {
    execSync(`sqlite3 "${dbPath}" < "${tmp}"`, { stdio: 'pipe' });
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
}

/**
 * Persist observed liveness into identities + runtimes so it survives past
 * this process. Idempotent - safe to call on every wake/status/dashboard load.
 */
function recordLiveness(observation, dbPath) {
  const statements = [];
  for (const a of observation.agents) {
    statements.push(
      `UPDATE identities SET observed_liveness = ${sqlEscape(a.liveness)}, last_observed_time = ${sqlEscape(observation.checkedAt)}, evidence_source = ${sqlEscape(a.evidence)} WHERE id = ${sqlEscape(a.id)};`
    );
    if (a.pid) {
      const runtimeId = `rt_observed_${a.id}`;
      statements.push(
        `INSERT INTO runtimes (id, identity_id, engine, runtime_type, pid, observed_liveness, status, last_seen, registered_at)
         VALUES (${sqlEscape(runtimeId)}, ${sqlEscape(a.id)}, 'unknown', 'interactive-ide', ${a.pid}, ${sqlEscape(a.liveness)}, 'AVAILABLE', ${sqlEscape(observation.checkedAt)}, ${sqlEscape(observation.checkedAt)})
         ON CONFLICT(id) DO UPDATE SET pid = excluded.pid, observed_liveness = excluded.observed_liveness, last_seen = excluded.last_seen;`
      );
    }
  }
  if (statements.length) runSql(dbPath, statements);
}

function observeAndRecord(identityIds, dbPath, options = {}) {
  const observation = observeLiveness(identityIds, options);
  recordLiveness(observation, dbPath);
  return observation;
}

module.exports = { observeLiveness, recordLiveness, observeAndRecord, IDE_CWD_HINTS, EPHEMERAL_HEADLESS };
