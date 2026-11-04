'use strict';
/** Full-text (FTS5) + embedding index maintenance. Derived data only: always rebuildable from source rows. */
const { sha256 } = require('../core/util');
const { toBlob, fromBlob, dot, tokenize, STOP } = require('./embeddings');

class SearchIndex {
  constructor(db, clock, provider) { this.db = db; this.clock = clock; this.provider = provider; }

  upsertText(entityType, entityId, title, body) {
    this.db.run('DELETE FROM ki_fts WHERE entity_type=? AND entity_id=?', [entityType, entityId]);
    this.db.run('INSERT INTO ki_fts(entity_type,entity_id,title,body) VALUES (?,?,?,?)', [entityType, entityId, title || '', body || '']);
  }
  removeText(entityType, entityId) {
    this.db.run('DELETE FROM ki_fts WHERE entity_type=? AND entity_id=?', [entityType, entityId]);
    this.db.run('DELETE FROM ki_embeddings WHERE entity_type=? AND entity_id=?', [entityType, entityId]);
  }

  /** Incremental: skip when an embedding with the same model+version+content hash already exists. */
  async embedEntities(items) {
    const todo = [];
    for (const it of items) {
      const h = sha256(it.text);
      const row = this.db.get('SELECT content_hash, model_version FROM ki_embeddings WHERE entity_type=? AND entity_id=? AND model_id=?', [it.entityType, it.entityId, this.provider.id]);
      if (!row || row.content_hash !== h || row.model_version !== this.provider.version) todo.push({ ...it, hash: h });
    }
    let embedded = 0;
    for (let i = 0; i < todo.length; i += 32) {
      const batch = todo.slice(i, i + 32);
      const vecs = await this.provider.embed(batch.map((b) => b.text));
      this.db.tx(() => batch.forEach((b, k) => {
        this.db.run(`INSERT INTO ki_embeddings(entity_type,entity_id,model_id,model_version,dim,vector,content_hash,created_at) VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(entity_type,entity_id,model_id) DO UPDATE SET model_version=excluded.model_version, dim=excluded.dim, vector=excluded.vector,
          content_hash=excluded.content_hash, created_at=excluded.created_at`,
        [b.entityType, b.entityId, this.provider.id, this.provider.version, this.provider.dim, toBlob(vecs[k]), b.hash, this.clock.iso()]);
      }));
      embedded += batch.length;
    }
    return { embedded, skipped: items.length - embedded };
  }

  ftsQuery(query) {
    const raw = (String(query).toLowerCase().match(/[a-z0-9_-]{2,}/g) || []).filter((w) => !STOP.has(w));
    const terms = Array.from(new Set(tokenize(query).concat(raw)));
    const safe = terms.filter((t) => /^[a-z0-9_-]+$/i.test(t)).slice(0, 24);
    return safe.length ? safe.map((t) => `"${t}"`).join(' OR ') : null;
  }
  searchFts(query, entityTypes, limit = 60) {
    const q = this.ftsQuery(query);
    if (!q) return [];
    const marks = entityTypes.map(() => '?').join(',');
    return this.db.all(`SELECT entity_type, entity_id, bm25(ki_fts, 0, 0, 3.0, 1.0) AS rank FROM ki_fts
      WHERE ki_fts MATCH ? AND entity_type IN (${marks}) ORDER BY rank LIMIT ?`, [q, ...entityTypes, limit])
      .map((r) => ({ entityType: r.entity_type, entityId: r.entity_id, score: -r.rank }));
  }
  async searchSemantic(query, entityTypes, limit = 60, minScore = 0.1) {
    const [qv] = await this.provider.embed([query]);
    const marks = entityTypes.map(() => '?').join(',');
    const rows = this.db.all(`SELECT entity_type, entity_id, vector FROM ki_embeddings WHERE model_id=? AND model_version=? AND entity_type IN (${marks})`,
      [this.provider.id, this.provider.version, ...entityTypes]);
    return rows.map((r) => ({ entityType: r.entity_type, entityId: r.entity_id, score: dot(qv, fromBlob(r.vector)) }))
      .filter((r) => r.score >= minScore).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Index recovery: rebuild FTS from authoritative rows. Embeddings are re-created lazily/by reindexEmbeddings. */
  rebuildFts(sources) {
    this.db.tx(() => {
      this.db.run('DELETE FROM ki_fts');
      for (const s of sources()) this.db.run('INSERT INTO ki_fts(entity_type,entity_id,title,body) VALUES (?,?,?,?)', [s.entityType, s.entityId, s.title || '', s.body || '']);
    });
  }
  health() {
    const fts = this.db.get('SELECT COUNT(*) n FROM ki_fts').n;
    const stale = this.db.get('SELECT COUNT(*) n FROM ki_embeddings WHERE model_id<>? OR model_version<>?', [this.provider.id, this.provider.version]).n;
    const emb = this.db.get('SELECT COUNT(*) n FROM ki_embeddings WHERE model_id=? AND model_version=?', [this.provider.id, this.provider.version]).n;
    return { ftsRows: fts, embeddings: emb, staleEmbeddings: stale, model: `${this.provider.id}@${this.provider.version}`, dim: this.provider.dim };
  }
}
module.exports = { SearchIndex };
