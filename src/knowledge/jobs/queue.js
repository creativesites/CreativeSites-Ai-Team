'use strict';
/**
 * Durable job queue on the KI database: idempotent enqueue (one active job per
 * type+entity), leased claims (crash recovery), bounded retries with backoff.
 * Expensive work (extraction, OCR, embedding) never runs on the request path.
 */
const { newId, toJson, parseJson } = require('../core/util');

class JobQueue {
  constructor(db, clock) { this.db = db; this.clock = clock; }

  enqueue(type, entityType, entityId, { payload = null, maxAttempts = 3, delayMs = 0 } = {}) {
    const now = this.clock.now();
    const existing = this.db.get(`SELECT id FROM ki_jobs WHERE type=? AND entity_type=? AND entity_id=? AND status IN ('queued','running')`, [type, entityType, entityId]);
    if (existing) return { id: existing.id, created: false };
    const id = newId('job');
    this.db.run(`INSERT INTO ki_jobs(id,type,entity_type,entity_id,status,attempts,max_attempts,run_after,payload_json,created_at,updated_at)
      VALUES (?,?,?,?, 'queued',0,?,?,?,?,?)`, [id, type, entityType, entityId, maxAttempts, new Date(now.getTime() + delayMs).toISOString(), toJson(payload), now.toISOString(), now.toISOString()]);
    return { id, created: true };
  }

  /** Atomically claim one runnable job (queued & due, or running with an expired lease). */
  claim(workerId, { leaseMs = 120000, types } = {}) {
    return this.db.tx(() => {
      const now = this.clock.iso();
      const typeSql = types && types.length ? ` AND type IN (${types.map(() => '?').join(',')})` : '';
      const row = this.db.get(`SELECT * FROM ki_jobs WHERE ((status='queued' AND run_after<=?) OR (status='running' AND lease_until<?))${typeSql}
        ORDER BY run_after, created_at LIMIT 1`, [now, now, ...(types || [])]);
      if (!row) return null;
      if (row.status === 'running' && row.attempts >= row.max_attempts) {
        this.db.run(`UPDATE ki_jobs SET status='dead', last_error=COALESCE(last_error,'lease expired after max attempts'), updated_at=? WHERE id=?`, [now, row.id]);
        return null;
      }
      const lease = new Date(this.clock.now().getTime() + leaseMs).toISOString();
      this.db.run(`UPDATE ki_jobs SET status='running', attempts=attempts+1, locked_by=?, lease_until=?, updated_at=? WHERE id=?`, [workerId, lease, now, row.id]);
      return { ...row, attempts: row.attempts + 1, payload: parseJson(row.payload_json, null) };
    });
  }
  complete(id) { this.db.run(`UPDATE ki_jobs SET status='done', lease_until=NULL, updated_at=? WHERE id=?`, [this.clock.iso(), id]); }
  fail(job, err, { retryable = true } = {}) {
    const msg = String(err && err.message ? err.message : err).slice(0, 500);
    const dead = !retryable || job.attempts >= job.max_attempts;
    const backoff = Math.min(300000, 1000 * 2 ** (job.attempts - 1));
    this.db.run(`UPDATE ki_jobs SET status=?, last_error=?, lease_until=NULL, run_after=?, updated_at=? WHERE id=?`,
      [dead ? 'failed' : 'queued', msg, new Date(this.clock.now().getTime() + backoff).toISOString(), this.clock.iso(), job.id]);
    return { dead };
  }
  stats() {
    const rows = this.db.all('SELECT status, COUNT(*) n FROM ki_jobs GROUP BY status');
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }
  list({ status, limit = 100 } = {}) {
    return this.db.all(`SELECT * FROM ki_jobs ${status ? 'WHERE status = ?' : ''} ORDER BY created_at DESC LIMIT ?`, status ? [status, limit] : [limit]);
  }
  /** Requeue failed/dead jobs for an entity (operator "retry"). */
  retry(jobId) {
    const r = this.db.run(`UPDATE ki_jobs SET status='queued', attempts=0, run_after=?, last_error=NULL, updated_at=? WHERE id=? AND status IN ('failed','dead')`,
      [this.clock.iso(), this.clock.iso(), jobId]);
    return r.changes > 0;
  }
}

class Worker {
  constructor(queue, handlers, { workerId = `w_${process.pid}_${Math.random().toString(36).slice(2, 6)}`, leaseMs = 120000 } = {}) {
    this.queue = queue; this.handlers = handlers; this.workerId = workerId; this.leaseMs = leaseMs; this._timer = null; this._running = false;
  }
  async runOnce() {
    const job = this.queue.claim(this.workerId, { leaseMs: this.leaseMs, types: Object.keys(this.handlers) });
    if (!job) return null;
    try {
      await this.handlers[job.type](job);
      this.queue.complete(job.id);
      return { id: job.id, type: job.type, ok: true };
    } catch (e) {
      const r = this.queue.fail(job, e, { retryable: e.retryable !== false });
      return { id: job.id, type: job.type, ok: false, error: e.message, dead: r.dead };
    }
  }
  async drain(max = 1000) {
    const results = [];
    for (let i = 0; i < max; i++) { const r = await this.runOnce(); if (!r) break; results.push(r); }
    return results;
  }
  /** Background loop on the event loop; never blocks callers. */
  start(intervalMs = 750) {
    if (this._timer) return;
    const tick = async () => {
      if (this._running) return;
      this._running = true;
      try { await this.drain(25); } finally { this._running = false; }
    };
    this._timer = setInterval(tick, intervalMs);
    this._timer.unref();
  }
  stop() { if (this._timer) clearInterval(this._timer); this._timer = null; }
}

module.exports = { JobQueue, Worker };
