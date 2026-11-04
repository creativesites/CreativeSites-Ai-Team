'use strict';
const { sha256, canonicalJson, toJson, newId } = require('./util');

/** Hash-chained audit log + intelligence change feed. */
class Audit {
  constructor(db, clock) { this.db = db; this.clock = clock; }

  /** Records an audit row. Safe to call inside or outside a transaction. */
  record({ principal, action, entityType = null, entityId = null, orgId = null, projectId = null, outcome = 'ok', detail = null }) {
    const actor = principal || { id: 'system', type: 'system', role: 'system' };
    return this.db.tx(() => {
      const prev = this.db.get('SELECT hash FROM ki_audit ORDER BY seq DESC LIMIT 1');
      const prevHash = prev ? prev.hash : 'GENESIS';
      const ts = this.clock.iso();
      const detailJson = detail === null ? null : canonicalJson(detail);
      const body = canonicalJson({ ts, a: actor.id, at: actor.type, ar: actor.role || null, action, entityType, entityId,
        orgId: orgId || actor.orgId || null, projectId, outcome, detail: detailJson });
      const hash = sha256(prevHash + body);
      const r = this.db.run(
        `INSERT INTO ki_audit(ts,actor_id,actor_type,actor_role,action,entity_type,entity_id,org_id,project_id,outcome,detail_json,prev_hash,hash)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [ts, actor.id, actor.type, actor.role || null, action, entityType, entityId, orgId || actor.orgId || null, projectId, outcome, detailJson, prevHash, hash]);
      return r.lastInsertRowid;
    });
  }

  verifyChain() {
    let prev = 'GENESIS';
    for (const r of this.db.all('SELECT * FROM ki_audit ORDER BY seq')) {
      const body = canonicalJson({ ts: r.ts, a: r.actor_id, at: r.actor_type, ar: r.actor_role || null, action: r.action,
        entityType: r.entity_type, entityId: r.entity_id, orgId: r.org_id, projectId: r.project_id, outcome: r.outcome, detail: r.detail_json });
      if (r.prev_hash !== prev || sha256(prev + body) !== r.hash) return { ok: false, brokenAt: r.seq };
      prev = r.hash;
    }
    return { ok: true, brokenAt: null };
  }

  list({ entityType, entityId, action, limit = 100 } = {}) {
    const w = []; const p = [];
    if (entityType) { w.push('entity_type = ?'); p.push(entityType); }
    if (entityId) { w.push('entity_id = ?'); p.push(entityId); }
    if (action) { w.push('action = ?'); p.push(action); }
    return this.db.all(`SELECT * FROM ki_audit ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY seq DESC LIMIT ?`, [...p, limit]);
  }
}

class Events {
  constructor(db, clock, notifier) { this.db = db; this.clock = clock; this.notifier = notifier; }
  emit({ type, entityType = null, entityId = null, orgId, projectId = null, importance = 'normal', summary, payload = null }) {
    const id = newId('evt');
    this.db.run(`INSERT INTO ki_events(id,ts,type,entity_type,entity_id,org_id,project_id,importance,summary,payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, this.clock.iso(), type, entityType, entityId, orgId, projectId, importance, summary, toJson(payload)]);
    return id;
  }
  since(orgId, sinceIso, { projectId, types, minImportance } = {}) {
    const w = ['org_id = ?', 'ts > ?']; const p = [orgId, sinceIso];
    if (projectId) { w.push('project_id = ?'); p.push(projectId); }
    if (types && types.length) { w.push(`type IN (${types.map(() => '?').join(',')})`); p.push(...types); }
    if (minImportance === 'high') w.push("importance IN ('high','critical')");
    return this.db.all(`SELECT * FROM ki_events WHERE ${w.join(' AND ')} ORDER BY ts, id`, p);
  }
}

module.exports = { Audit, Events };
