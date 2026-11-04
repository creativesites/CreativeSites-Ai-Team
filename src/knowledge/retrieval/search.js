'use strict';
/**
 * Hybrid, permission-aware retrieval.
 *   FTS5 (exact terms/ids/phrases)  +  semantic (embeddings)  ->  Reciprocal Rank Fusion
 *   -> metadata filters -> authority / status / recency re-ranking -> excerpts + citations.
 * Permission and currency filters run BEFORE anything is returned; superseded
 * document versions and superseded/archived knowledge are excluded unless asked for.
 */
const { assertCan, checkRead, isSearchable, rank } = require('../core/access');
const { parseJson } = require('../core/util');
const { tokenize } = require('./embeddings');

const STATUS_FACTOR = { verified: 1.25, accepted: 1.15, proposed: 0.75, disputed: 0.5, superseded: 0.2, archived: 0.1 };
const RRF_K = 60;

function excerpt(text, query, width = 320) {
  const terms = tokenize(query);
  const lower = text.toLowerCase();
  let best = -1;
  for (const t of terms) { const i = lower.indexOf(t); if (i >= 0 && (best < 0 || i < best)) best = i; }
  const start = Math.max(0, (best < 0 ? 0 : best) - Math.floor(width / 4));
  const end = Math.min(text.length, start + width);
  return { text: (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : ''), offset: start };
}

class SearchService {
  constructor({ db, index, settings, audit, clock }) { Object.assign(this, { db, index, settings, audit, clock }); }

  async search(principal, q) {
    assertCan(principal, 'document.read');
    const cfg = this.settings.all();
    const query = String(q.query || '').trim();
    if (!query) return { query, results: [], warnings: [] };
    const types = q.types && q.types.length ? q.types : ['document', 'knowledge', 'commitment'];
    const entityTypes = types.flatMap((t) => (t === 'document' ? ['chunk'] : t === 'knowledge' ? ['knowledge'] : ['commitment']));
    const mode = q.mode || 'hybrid';
    const limit = Math.min(q.limit || 10, 50);
    const lists = [];
    if (mode !== 'semantic') lists.push({ name: 'fts', weight: cfg.retrieval.ftsWeight, items: this.index.searchFts(query, entityTypes, 80) });
    if (mode !== 'fts') lists.push({ name: 'semantic', weight: cfg.retrieval.semanticWeight, items: await this.index.searchSemantic(query, entityTypes, 80, cfg.retrieval.minSemanticScore) });

    const fused = new Map();
    for (const l of lists) l.items.forEach((it, i) => {
      const key = `${it.entityType}:${it.entityId}`;
      const e = fused.get(key) || { ...it, rrf: 0, via: {} };
      e.rrf += l.weight / (RRF_K + i + 1); e.via[l.name] = { rank: i + 1, score: +it.score.toFixed(4) };
      fused.set(key, e);
    });

    const now = this.clock.now().getTime();
    const out = []; const warnings = []; let quarantined = 0; let hidden = 0;
    for (const c of fused.values()) {
      const r = this._resolve(c, q);
      if (!r) { continue; }
      const access = checkRead(principal, r.res);
      if (!access.allowed || !isSearchable(r.res)) { hidden++; continue; }          // permission filter: never returned, never counted for caller
      if (r.excluded) continue;                                                       // currency / filter exclusion
      if (r.injection >= 0.5 && cfg.quarantineInjection && principal.type !== 'human' && !q.includeFlagged) { quarantined++; continue; }
      const half = cfg.recencyHalfLifeDays * 86400000;
      const age = Math.max(0, now - Date.parse(r.when || this.clock.iso()));
      const recency = 0.7 + 0.3 * Math.pow(0.5, age / half);
      const authority = 1 + cfg.retrieval.authorityBoost * (r.authority || 0);
      const statusF = STATUS_FACTOR[r.status] || 1;
      const final = c.rrf * authority * statusF * recency;
      const ex = excerpt(r.text, query);
      out.push({ kind: r.kind, id: r.id, title: r.title, excerpt: ex.text, score: +(final * 1000).toFixed(3), authority: r.authority, status: r.status,
        trust: r.kind === 'document_chunk' ? 'untrusted_evidence' : 'organisational_record', flags: r.injection >= 0.5 ? ['possible_prompt_injection'] : [],
        citation: r.citation, explain: { via: c.via, rrf: +c.rrf.toFixed(5), authorityFactor: +authority.toFixed(2), statusFactor: statusF, recencyFactor: +recency.toFixed(2) }, classification: r.res.classification, _protected: rank(r.res.classification) >= rank('confidential') });
    }
    out.sort((a, b) => b.score - a.score);
    const results = out.slice(0, limit);
    if (quarantined) warnings.push(`${quarantined} result(s) withheld: contained instruction-like content aimed at agents (quarantined).`);
    const prot = results.filter((r) => r._protected).map((r) => r.id);
    if (prot.length) this.audit.record({ principal, action: 'search.protected_access', entityType: 'search', orgId: principal.orgId, projectId: q.projectId || null, detail: { query, ids: prot } });
    results.forEach((r) => delete r._protected);
    if (q.audit !== false) this.audit.record({ principal, action: 'search', entityType: 'search', orgId: principal.orgId, projectId: q.projectId || null, detail: { query, mode, returned: results.length, hiddenByPermission: hidden > 0, quarantined } });
    return { query, mode, results, warnings };
  }

  _resolve(c, q) {
    const inProject = (pid) => !q.projectId || pid === q.projectId || (q.includeOrgWide !== false && !pid);
    if (c.entityType === 'chunk') {
      const row = this.db.get(`SELECT c.*, v.is_current, v.version_no, v.status vstatus, v.original_filename, v.available_at, d.org_id, d.project_id, d.classification, d.acl_json, d.display_name, d.category, d.author_id, d.source_kind, d.status dstatus, d.id did
        FROM ki_chunks c JOIN ki_document_versions v ON v.id=c.version_id JOIN ki_documents d ON d.id=c.document_id WHERE c.id=?`, [c.entityId]);
      if (!row) return null;
      const res = { org_id: row.org_id, project_id: row.project_id, classification: row.classification, acl_json: row.acl_json };
      let excluded = false;
      if (!q.includeSuperseded && (!row.is_current || row.dstatus !== 'active')) excluded = true;
      if (!inProject(row.project_id)) excluded = true;
      if (q.category && row.category !== q.category) excluded = true;
      if (q.authorId && row.author_id !== q.authorId) excluded = true;
      if (q.sourceKind && row.source_kind !== q.sourceKind) excluded = true;
      if (q.from && row.available_at < q.from) excluded = true;
      if (q.to && row.available_at > q.to) excluded = true;
      return { kind: 'document_chunk', id: row.id, title: `${row.display_name}${row.section_path ? ' › ' + row.section_path : ''}`, text: row.text, res, excluded, injection: row.injection_score,
        status: row.is_current ? 'accepted' : 'superseded', authority: 1, when: row.available_at,
        citation: { type: 'document', documentId: row.did, versionId: row.version_id, versionNo: row.version_no, chunkId: row.id, sectionPath: row.section_path, charStart: row.char_start, charEnd: row.char_end, filename: row.original_filename, current: !!row.is_current } };
    }
    if (c.entityType === 'knowledge') {
      const k = this.db.get('SELECT * FROM ki_knowledge WHERE id=?', [c.entityId]);
      if (!k) return null;
      const res = { org_id: k.org_id, project_id: k.project_id, classification: k.classification, acl_json: k.acl_json };
      let excluded = false;
      if (!q.includeSuperseded && ['superseded', 'archived'].includes(k.status)) excluded = true;
      if (!inProject(k.project_id)) excluded = true;
      if (q.knowledgeType && k.type !== q.knowledgeType) excluded = true;
      if (q.status && k.status !== q.status) excluded = true;
      if (q.authorId && k.author_id !== q.authorId) excluded = true;
      if (q.from && k.captured_at < q.from) excluded = true;
      if (q.to && k.captured_at > q.to) excluded = true;
      if (k.expires_at && k.expires_at < this.clock.iso() && !q.includeSuperseded) excluded = true;
      return { kind: 'knowledge', id: k.id, title: `[${k.type}] ${k.title}`, text: k.content, res, excluded, injection: 0, status: k.status, authority: k.authority, when: k.effective_at || k.captured_at,
        citation: { type: 'knowledge', knowledgeId: k.id, knowledgeType: k.type, sourceId: k.source_id, sourceRef: parseJson(k.source_ref_json, null), authority: k.authority, status: k.status } };
    }
    if (c.entityType === 'commitment') {
      const m = this.db.get('SELECT * FROM ki_commitments WHERE id=?', [c.entityId]);
      if (!m) return null;
      const res = { org_id: m.org_id, project_id: m.project_id, classification: m.classification, acl_json: m.acl_json };
      let excluded = !inProject(m.project_id);
      if (q.authorId && m.source_author !== q.authorId) excluded = true;
      return { kind: 'commitment', id: m.id, title: `[${m.kind}/${m.status}] ${m.description.slice(0, 80)}`, text: m.description, res, excluded, injection: 0, status: m.status === 'fulfilled' ? 'verified' : m.status === 'rejected' || m.status === 'cancelled' ? 'archived' : 'accepted',
        authority: m.confirmation === 'confirmed' ? 3 : 1, when: m.captured_at, citation: { type: 'commitment', commitmentId: m.id, sourceId: m.source_id, deadlineAt: m.deadline_at } };
    }
    return null;
  }
}

module.exports = { SearchService, excerpt };
