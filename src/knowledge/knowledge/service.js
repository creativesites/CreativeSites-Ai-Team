'use strict';
/**
 * Organisational Knowledge Base. Knowledge is NOT truth by default: every record has a
 * type, an authority rung, a verification class, provenance, and a lifecycle
 * (proposed -> accepted -> verified | disputed | superseded | archived).
 * Authority is granted only by authorised humans; agents can only propose.
 */
const { newId, sha256, toJson, parseJson } = require('../core/util');
const { assertCan, assertWriteScope, checkRead, canRead, isSearchable, rank, AUTHORITY, AUTHORITY_NAMES, can } = require('../core/access');
const { invalid, notFound, forbidden, illegalState } = require('../core/errors');
const { assess, COMPARABLE } = require('./conflicts');

const TYPES = ['fact', 'decision', 'requirement', 'instruction', 'policy', 'lesson', 'preference', 'assumption', 'hypothesis', 'reference'];
const HIGH_IMPACT = new Set(['decision', 'requirement', 'instruction', 'policy']);
const LIVE = ['proposed', 'accepted', 'verified', 'disputed'];

class KnowledgeService {
  constructor({ db, audit, events, clock, index, settings, search }) { Object.assign(this, { db, audit, events, clock, index, settings, search }); }

  /* -------------------------------------------------------------- create */
  async propose(principal, input) {
    assertCan(principal, 'knowledge.propose');
    if (!TYPES.includes(input.type)) throw invalid(`Unknown knowledge type: ${input.type}`);
    if (!input.title || !input.content) throw invalid('title and content are required');
    assertWriteScope(principal, { project_id: input.projectId });
    const conf = input.confidence === undefined ? 0.5 : Number(input.confidence);
    if (!(conf >= 0 && conf <= 1)) throw invalid('confidence must be between 0 and 1');

    // Derived records can never be more visible than the evidence they came from.
    let classification = input.classification || 'internal';
    let acl = input.acl || null; let projectId = input.projectId || null;
    const ref = input.sourceRef || null;
    const inherit = [];
    if (ref && ref.documentId) { const d = this.db.get('SELECT * FROM ki_documents WHERE id=?', [ref.documentId]); if (d) { if (!canRead(principal, d)) throw forbidden('No access to the cited document'); inherit.push(d); if (!projectId) projectId = d.project_id; } }
    if (input.sourceId) { const s = this.db.get('SELECT * FROM ki_sources WHERE id=?', [input.sourceId]); if (!s || s.org_id !== principal.orgId) throw notFound('source', input.sourceId); if (!canRead(principal, s)) throw forbidden('No access to the cited source'); inherit.push(s); if (!projectId) projectId = s.project_id; }
    for (const i of inherit) { if (rank(i.classification) > rank(classification)) classification = i.classification; if (!acl && i.acl_json) acl = parseJson(i.acl_json, null); }
    if (rank(classification) > rank(principal.clearance) && principal.role !== 'owner') throw forbidden('Cannot classify above your clearance');

    const derivedBy = input.derivedBy || (principal.type === 'agent' ? 'agent' : principal.type === 'system' ? 'extractor' : 'human');
    const authority = derivedBy === 'agent' ? AUTHORITY.inference : AUTHORITY.informal;   // never caller-supplied
    const verificationClass = 'DECLARED';
    const id = newId('know'); const now = this.clock.iso();
    const rec = { id, type: input.type, title: String(input.title).slice(0, 300), content: String(input.content), subject_key: input.subjectKey || null, content_hash: sha256(String(input.content)) };
    this.db.tx(() => {
      this.db.run(`INSERT INTO ki_knowledge(id,type,title,content,subject_key,status,authority,confidence,verification_class,org_id,project_id,entity_ref,classification,acl_json,source_id,source_ref_json,derived_by,author_id,author_type,captured_at,effective_at,review_at,expires_at,content_hash,created_at,updated_at)
        VALUES (?,?,?,?,?, 'proposed',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, rec.type, rec.title, rec.content, rec.subject_key, authority, conf, verificationClass, principal.orgId, projectId, input.entityRef || null, classification, toJson(acl), input.sourceId || null, toJson(ref), derivedBy,
        input.authorId || principal.id, input.authorType || principal.type, now, input.effectiveAt || null, input.reviewAt || null, input.expiresAt || null, rec.content_hash, now, now]);
      this.index.upsertText('knowledge', id, rec.title, rec.content);
      if (ref && ref.documentId) this.db.run(`INSERT OR IGNORE INTO ki_knowledge_relations(id,from_id,to_type,to_id,relation,created_by,created_at) VALUES (?,?,?,?,?,?,?)`, [newId('rel'), id, 'document', ref.documentId, 'derived_from', principal.id, now]);
      this.audit.record({ principal, action: 'knowledge.propose', entityType: 'knowledge', entityId: id, orgId: principal.orgId, projectId, detail: { type: rec.type, derivedBy, authority, sourceId: input.sourceId || null, documentId: ref && ref.documentId } });
      this.events.emit({ type: 'knowledge.proposed', entityType: 'knowledge', entityId: id, orgId: principal.orgId, projectId, importance: HIGH_IMPACT.has(rec.type) ? 'high' : 'normal', summary: `New ${rec.type} proposed: ${rec.title}`, payload: { type: rec.type } });
    });
    await this.index.embedEntities([{ entityType: 'knowledge', entityId: id, text: `${rec.title}\n${rec.content}` }]);
    const conflicts = COMPARABLE.includes(rec.type) ? this.detectConflicts(principal, id) : [];
    if (input.autoAccept && can(principal, 'knowledge.approve')) this.accept(principal, id, { authority: input.authority || 'approved', note: 'accepted at creation by authorised principal' });
    return { id, status: this.db.get('SELECT status FROM ki_knowledge WHERE id=?', [id]).status, conflicts: conflicts.map((c) => c.id) };
  }

  /* ------------------------------------------------------------ lifecycle */
  accept(principal, id, { authority = 'approved', note = '' } = {}) {
    assertCan(principal, 'knowledge.approve');
    const k = this._get(principal, id);
    if (!LIVE.includes(k.status) || k.status === 'verified') throw illegalState(`Cannot accept a ${k.status} record`);
    if (k.author_id === principal.id && principal.role !== 'owner') throw forbidden('You cannot approve your own proposal');
    const level = AUTHORITY[authority];
    if (level === undefined || level < AUTHORITY.documented || level === AUTHORITY.verified) throw invalid("authority must be one of: documented, approved, mandated (use verify() for 'verified')");
    if (level === AUTHORITY.mandated && principal.role !== 'owner') throw forbidden('Only the owner can mandate policy-level authority');
    const open = this.db.get(`SELECT COUNT(*) n FROM ki_conflicts WHERE status='open' AND (a_id=? OR b_id=?)`, [id, id]).n;
    if (open) throw illegalState('Resolve the open conflict(s) involving this record before accepting it', { openConflicts: open });
    const now = this.clock.iso();
    this.db.tx(() => {
      this.db.run(`UPDATE ki_knowledge SET status='accepted', authority=?, approved_by=?, approved_at=?, effective_at=COALESCE(effective_at,?), updated_at=? WHERE id=?`, [level, principal.id, now, now, now, id]);
      this.audit.record({ principal, action: 'knowledge.accept', entityType: 'knowledge', entityId: id, orgId: k.org_id, projectId: k.project_id, detail: { authority, note, from: k.status } });
      this.events.emit({ type: 'knowledge.accepted', entityType: 'knowledge', entityId: id, orgId: k.org_id, projectId: k.project_id, importance: HIGH_IMPACT.has(k.type) ? 'high' : 'normal', summary: `${k.type} accepted (${authority}): ${k.title}` });
    });
    return this.get(principal, id);
  }

  reject(principal, id, reason) {
    assertCan(principal, 'knowledge.approve');
    const k = this._get(principal, id);
    this.db.tx(() => {
      this.db.run(`UPDATE ki_knowledge SET status='archived', updated_at=? WHERE id=?`, [this.clock.iso(), id]);
      this.index.removeText('knowledge', id);
      this.audit.record({ principal, action: 'knowledge.reject', entityType: 'knowledge', entityId: id, orgId: k.org_id, projectId: k.project_id, detail: { reason } });
    });
    return { rejected: true };
  }

  /** Independent verification: elevates to `verified` only with runtime-observed/independent evidence from a non-author. */
  verify(principal, id, { evidenceClass, evidence }) {
    assertCan(principal, 'evidence.verify');
    const k = this._get(principal, id);
    if (!['OBSERVED', 'VERIFIED'].includes(evidenceClass)) throw invalid('Verification requires evidence class OBSERVED or VERIFIED');
    if (!evidence) throw invalid('evidence is required');
    if (k.author_id === principal.id) throw forbidden('A record cannot be verified by its own author');
    if (!['proposed', 'accepted', 'disputed'].includes(k.status)) throw illegalState(`Cannot verify a ${k.status} record`);
    this.db.tx(() => {
      this.db.run(`UPDATE ki_knowledge SET status='verified', authority=MAX(authority,?), verification_class=?, approved_by=COALESCE(approved_by,?), approved_at=COALESCE(approved_at,?), updated_at=? WHERE id=?`,
        [AUTHORITY.verified, evidenceClass, principal.id, this.clock.iso(), this.clock.iso(), id]);
      this.db.run(`INSERT OR IGNORE INTO ki_knowledge_relations(id,from_id,to_type,to_id,relation,created_by,created_at) VALUES (?,?,?,?,?,?,?)`, [newId('rel'), id, 'evidence', sha256(String(evidence)).slice(0, 16), 'evidenced_by', principal.id, this.clock.iso()]);
      this.audit.record({ principal, action: 'knowledge.verify', entityType: 'knowledge', entityId: id, orgId: k.org_id, projectId: k.project_id, detail: { evidenceClass, evidence: String(evidence).slice(0, 500) } });
      this.events.emit({ type: 'knowledge.verified', entityType: 'knowledge', entityId: id, orgId: k.org_id, projectId: k.project_id, summary: `${k.type} verified: ${k.title}` });
    });
    return this.get(principal, id);
  }

  supersede(principal, oldId, newId_, reason = '') {
    assertCan(principal, 'knowledge.approve');
    const o = this._get(principal, oldId); const n = this._get(principal, newId_);
    if (o.org_id !== n.org_id) throw invalid('Records belong to different organisations');
    this.db.tx(() => {
      this._markSuperseded(o.id, n.id);
      this.db.run(`INSERT OR IGNORE INTO ki_knowledge_relations(id,from_id,to_type,to_id,relation,created_by,created_at) VALUES (?,?,?,?,?,?,?)`, [newId('rel'), n.id, 'knowledge', o.id, 'supersedes', principal.id, this.clock.iso()]);
      this.audit.record({ principal, action: 'knowledge.supersede', entityType: 'knowledge', entityId: o.id, orgId: o.org_id, projectId: o.project_id, detail: { by: n.id, reason } });
      this.events.emit({ type: 'knowledge.superseded', entityType: 'knowledge', entityId: o.id, orgId: o.org_id, projectId: o.project_id, importance: 'high', summary: `${o.type} superseded: "${o.title}" replaced by "${n.title}"` });
    });
    return { superseded: o.id, by: n.id };
  }
  _markSuperseded(oldId, byId) {
    this.db.run(`UPDATE ki_knowledge SET status='superseded', superseded_by_id=?, updated_at=? WHERE id=?`, [byId, this.clock.iso(), oldId]);
    this.db.run(`UPDATE ki_knowledge SET supersedes_id=COALESCE(supersedes_id,?) WHERE id=?`, [oldId, byId]);
  }

  archive(principal, id, reason = '') {
    const k = this._get(principal, id);
    if (!(can(principal, 'knowledge.approve') || (k.author_id === principal.id && k.status === 'proposed'))) throw forbidden('Not allowed to archive this record');
    this.db.tx(() => {
      this.db.run(`UPDATE ki_knowledge SET status='archived', updated_at=? WHERE id=?`, [this.clock.iso(), id]);
      this.audit.record({ principal, action: 'knowledge.archive', entityType: 'knowledge', entityId: id, orgId: k.org_id, projectId: k.project_id, detail: { reason } });
    });
    return { archived: true };
  }

  /* ------------------------------------------------------------ decisions */
  async submitDecision(principal, d) {
    assertCan(principal, 'decision.submit');
    if (!d.title || !d.rationale) throw invalid('title and rationale are required for a decision');
    const r = await this.propose(principal, { type: 'decision', title: d.title, content: `${d.title}. Rationale: ${d.rationale}${d.consequences ? ' Consequences: ' + d.consequences : ''}`,
      projectId: d.projectId, sourceId: d.sourceId, sourceRef: d.sourceRef, subjectKey: d.subjectKey, confidence: d.confidence ?? 0.7, classification: d.classification });
    const id = newId('dec');
    const k = this.db.get('SELECT * FROM ki_knowledge WHERE id=?', [r.id]);
    this.db.run(`INSERT INTO ki_decisions(id,knowledge_id,org_id,project_id,title,context,rationale,alternatives_json,consequences,status,proposed_by,proposed_at,supersedes_decision_id)
      VALUES (?,?,?,?,?,?,?,?,?, 'proposed',?,?,?)`, [id, r.id, k.org_id, k.project_id, d.title, d.context || null, d.rationale, toJson(d.alternatives), d.consequences || null, principal.id, this.clock.iso(), d.supersedesDecisionId || null]);
    this.audit.record({ principal, action: 'decision.submit', entityType: 'decision', entityId: id, orgId: k.org_id, projectId: k.project_id, detail: { knowledgeId: r.id } });
    return { decisionId: id, knowledgeId: r.id, status: 'proposed', conflicts: r.conflicts };
  }
  decide(principal, decisionId, { approve, note = '' }) {
    assertCan(principal, 'knowledge.approve');
    const d = this.db.get('SELECT * FROM ki_decisions WHERE id=?', [decisionId]);
    if (!d || d.org_id !== principal.orgId) throw notFound('decision', decisionId);
    if (d.status !== 'proposed') throw illegalState(`Decision already ${d.status}`);
    if (d.proposed_by === principal.id && principal.role !== 'owner') throw forbidden('You cannot approve your own decision');
    this.db.tx(() => {
      if (approve) {
        const open = this.db.get(`SELECT COUNT(*) n FROM ki_conflicts WHERE status='open' AND (a_id=? OR b_id=?)`, [d.knowledge_id, d.knowledge_id]).n;
        if (open) throw illegalState('Resolve the open conflict(s) involving this decision first', { openConflicts: open });
        this.accept(principal, d.knowledge_id, { authority: 'approved', note: `decision approved: ${note}` });
        this.db.run(`UPDATE ki_decisions SET status='approved', decided_by=?, decided_at=?, decision_note=? WHERE id=?`, [principal.id, this.clock.iso(), note, d.id]);
        if (d.supersedes_decision_id) {
          const old = this.db.get('SELECT * FROM ki_decisions WHERE id=?', [d.supersedes_decision_id]);
          if (old) { this.db.run(`UPDATE ki_decisions SET status='superseded' WHERE id=?`, [old.id]); this._markSuperseded(old.knowledge_id, d.knowledge_id); }
        }
      } else {
        this.db.run(`UPDATE ki_decisions SET status='rejected', decided_by=?, decided_at=?, decision_note=? WHERE id=?`, [principal.id, this.clock.iso(), note, d.id]);
        this.reject(principal, d.knowledge_id, note || 'decision rejected');
      }
      this.audit.record({ principal, action: approve ? 'decision.approve' : 'decision.reject', entityType: 'decision', entityId: d.id, orgId: d.org_id, projectId: d.project_id, detail: { note } });
    });
    return this.getDecision(principal, decisionId);
  }
  getDecision(principal, id) {
    assertCan(principal, 'knowledge.read');
    const d = this.db.get('SELECT * FROM ki_decisions WHERE id=?', [id]);
    if (!d) throw notFound('decision', id);
    this._get(principal, d.knowledge_id);
    return { ...d, alternatives: parseJson(d.alternatives_json, []), alternatives_json: undefined };
  }
  listDecisions(principal, { projectId, status } = {}) {
    assertCan(principal, 'knowledge.read');
    const w = ['org_id=?']; const p = [principal.orgId];
    if (projectId) { w.push('project_id=?'); p.push(projectId); }
    if (status) { w.push('status=?'); p.push(status); }
    return this.db.all(`SELECT * FROM ki_decisions WHERE ${w.join(' AND ')} ORDER BY proposed_at DESC`, p)
      .filter((d) => { try { this._get(principal, d.knowledge_id); return true; } catch (_) { return false; } }).map((d) => ({ ...d, alternatives: parseJson(d.alternatives_json, []), alternatives_json: undefined }));
  }

  /* ------------------------------------------------------------ conflicts */
  detectConflicts(principal, id) {
    const k = this.db.get('SELECT * FROM ki_knowledge WHERE id=?', [id]);
    if (!k) return [];
    const cands = this.db.all(`SELECT * FROM ki_knowledge WHERE org_id=? AND id<>? AND type IN (${COMPARABLE.map(() => '?').join(',')}) AND status IN ('proposed','accepted','verified','disputed')
      AND (IFNULL(project_id,'')=IFNULL(?,'') OR project_id IS NULL OR ? IS NULL)`, [k.org_id, id, ...COMPARABLE, k.project_id, k.project_id]);
    const out = [];
    for (const o of cands) {
      const a = assess(k, o);
      if (!a) continue;
      const [first, second] = o.captured_at <= k.captured_at ? [o, k] : [k, o];
      const existing = this.db.get('SELECT id FROM ki_conflicts WHERE (a_id=? AND b_id=?) OR (a_id=? AND b_id=?)', [first.id, second.id, second.id, first.id]);
      if (existing) continue;
      const cid = newId('cfl');
      this.db.tx(() => {
        this.db.run(`INSERT INTO ki_conflicts(id,org_id,project_id,a_id,b_id,kind,reason,score,status,detected_at,detected_by) VALUES (?,?,?,?,?,?,?,?, 'open',?,?)`,
          [cid, k.org_id, k.project_id || o.project_id, first.id, second.id, a.kind, a.reason, a.score, this.clock.iso(), principal ? principal.id : 'system']);
        for (const r of [k, o]) if (r.status === 'proposed') this.db.run(`UPDATE ki_knowledge SET status='disputed', updated_at=? WHERE id=?`, [this.clock.iso(), r.id]);
        this.db.run(`INSERT OR IGNORE INTO ki_knowledge_relations(id,from_id,to_type,to_id,relation,created_by,created_at) VALUES (?,?,?,?,?,?,?)`, [newId('rel'), second.id, 'knowledge', first.id, 'contradicts', 'ki-conflict-detector', this.clock.iso()]);
        this.audit.record({ principal, action: 'knowledge.conflict_detected', entityType: 'conflict', entityId: cid, orgId: k.org_id, projectId: k.project_id, detail: { a: first.id, b: second.id, kind: a.kind, reason: a.reason } });
        this.events.emit({ type: 'knowledge.conflict', entityType: 'conflict', entityId: cid, orgId: k.org_id, projectId: k.project_id, importance: 'high', summary: `Conflicting ${k.type} records need resolution: "${first.title}" vs "${second.title}" (${a.reason})` });
      });
      out.push({ id: cid, ...a, a: first.id, b: second.id });
    }
    return out;
  }

  reportConflict(principal, aId, bId, reason) {
    assertCan(principal, 'knowledge.propose');
    const a = this._get(principal, aId); const b = this._get(principal, bId);
    if (this.db.get('SELECT id FROM ki_conflicts WHERE (a_id=? AND b_id=?) OR (a_id=? AND b_id=?)', [aId, bId, bId, aId])) throw illegalState('A conflict between these records already exists');
    const [first, second] = a.captured_at <= b.captured_at ? [a, b] : [b, a];
    const id = newId('cfl');
    this.db.tx(() => {
      this.db.run(`INSERT INTO ki_conflicts(id,org_id,project_id,a_id,b_id,kind,reason,score,status,detected_at,detected_by) VALUES (?,?,?,?,?, 'reported',?,?, 'open',?,?)`,
        [id, a.org_id, a.project_id, first.id, second.id, reason || 'reported by agent/user', 0.5, this.clock.iso(), principal.id]);
      for (const r of [a, b]) if (r.status === 'proposed') this.db.run(`UPDATE ki_knowledge SET status='disputed', updated_at=? WHERE id=?`, [this.clock.iso(), r.id]);
      this.audit.record({ principal, action: 'knowledge.conflict_reported', entityType: 'conflict', entityId: id, orgId: a.org_id, projectId: a.project_id, detail: { a: aId, b: bId, reason } });
      this.events.emit({ type: 'knowledge.conflict', entityType: 'conflict', entityId: id, orgId: a.org_id, projectId: a.project_id, importance: 'high', summary: `Conflict reported between "${a.title}" and "${b.title}"` });
    });
    return { id };
  }

  listConflicts(principal, { status = 'open', projectId } = {}) {
    assertCan(principal, 'knowledge.read');
    const w = ['c.org_id=?']; const p = [principal.orgId];
    if (status !== 'all') { w.push('c.status=?'); p.push(status); }
    if (projectId) { w.push('c.project_id=?'); p.push(projectId); }
    return this.db.all(`SELECT c.* FROM ki_conflicts c WHERE ${w.join(' AND ')} ORDER BY c.detected_at DESC`, p).flatMap((c) => {
      let a; let b;
      try { a = this._get(principal, c.a_id); b = this._get(principal, c.b_id); } catch (_) { return []; } // only conflicts whose both sides the caller may see
      const view = (r) => ({ id: r.id, type: r.type, title: r.title, content: r.content, status: r.status, authority: r.authority, authorityName: AUTHORITY_NAMES[r.authority], capturedAt: r.captured_at, authorId: r.author_id, sourceId: r.source_id });
      return [{ ...c, a: view(a), b: view(b), recommendation: this._recommend(a, b) }];
    });
  }
  /** Advisory only: authority first, then recency. The authorised resolver decides. */
  _recommend(a, b) {
    if (a.authority !== b.authority) return { prefer: a.authority > b.authority ? a.id : b.id, basis: 'higher authority' };
    return { prefer: a.captured_at >= b.captured_at ? a.id : b.id, basis: 'more recent at equal authority' };
  }

  async resolveConflict(principal, conflictId, opts) {
    const out = this._resolveConflict(principal, conflictId, opts);
    if (this._pendingEmbed) { const e = this._pendingEmbed; this._pendingEmbed = null; await this.index.embedEntities([e]); }
    return out;
  }
  _resolveConflict(principal, conflictId, { resolution, note, mergedContent, mergedTitle }) {
    assertCan(principal, 'knowledge.resolve');
    const c = this.db.get('SELECT * FROM ki_conflicts WHERE id=?', [conflictId]);
    if (!c || c.org_id !== principal.orgId) throw notFound('conflict', conflictId);
    if (c.status !== 'open') throw illegalState(`Conflict already ${c.status}`);
    if (!['prefer_a', 'prefer_b', 'both_valid', 'merge', 'dismiss'].includes(resolution)) throw invalid('resolution must be prefer_a, prefer_b, both_valid, merge or dismiss');
    if (!note) throw invalid('A resolution note (rationale) is required');
    const a = this._get(principal, c.a_id); const b = this._get(principal, c.b_id);
    if ((a.authority === AUTHORITY.mandated || b.authority === AUTHORITY.mandated) && principal.role !== 'owner') throw forbidden('Only the owner can resolve against a mandated record');
    const now = this.clock.iso();
    let winnerId = null;
    this.db.tx(() => {
      const promote = (r) => {
        const level = Math.max(r.authority, AUTHORITY.approved);
        this.db.run(`UPDATE ki_knowledge SET status=CASE WHEN status='verified' THEN 'verified' ELSE 'accepted' END, authority=?, approved_by=?, approved_at=?, effective_at=COALESCE(effective_at,?), updated_at=? WHERE id=?`, [level, principal.id, now, now, now, r.id]);
      };
      const stillOpenElsewhere = (r) => this.db.get(`SELECT COUNT(*) n FROM ki_conflicts WHERE status='open' AND id<>? AND (a_id=? OR b_id=?)`, [c.id, r.id, r.id]).n > 0;
      if (resolution === 'prefer_a' || resolution === 'prefer_b') {
        const [w, l] = resolution === 'prefer_a' ? [a, b] : [b, a];
        winnerId = w.id;
        promote(w);
        this._markSuperseded(l.id, w.id);
        this.db.run(`INSERT OR IGNORE INTO ki_knowledge_relations(id,from_id,to_type,to_id,relation,created_by,created_at) VALUES (?,?,?,?,?,?,?)`, [newId('rel'), w.id, 'knowledge', l.id, 'supersedes', principal.id, now]);
      } else if (resolution === 'both_valid') {
        for (const r of [a, b]) if (['proposed', 'disputed'].includes(r.status) && !stillOpenElsewhere(r)) promote(r);
        this.db.run(`INSERT OR IGNORE INTO ki_knowledge_relations(id,from_id,to_type,to_id,relation,created_by,created_at) VALUES (?,?,?,?,?,?,?)`, [newId('rel'), a.id, 'knowledge', b.id, 'related', principal.id, now]);
      } else if (resolution === 'merge') {
        if (!mergedContent) throw invalid('merge requires mergedContent');
        const mid = newId('know');
        this.db.run(`INSERT INTO ki_knowledge(id,type,title,content,subject_key,status,authority,confidence,verification_class,org_id,project_id,classification,acl_json,derived_by,author_id,author_type,captured_at,effective_at,approved_by,approved_at,supersedes_id,content_hash,created_at,updated_at)
          VALUES (?,?,?,?,?, 'accepted',?,?, 'DECLARED',?,?,?,?, 'human',?,?,?,?,?,?,?,?,?,?)`,
        [mid, a.type, mergedTitle || a.title, mergedContent, a.subject_key, AUTHORITY.approved, 0.9, a.org_id, a.project_id, rank(a.classification) >= rank(b.classification) ? a.classification : b.classification, a.acl_json, principal.id, principal.type, now, now, principal.id, now, a.id, sha256(mergedContent), now, now]);
        this.index.upsertText('knowledge', mid, mergedTitle || a.title, mergedContent);
        this._pendingEmbed = { entityType: 'knowledge', entityId: mid, text: `${mergedTitle || a.title}\n${mergedContent}` };
        this._markSuperseded(a.id, mid); this._markSuperseded(b.id, mid);
        for (const r of [a, b]) this.db.run(`INSERT OR IGNORE INTO ki_knowledge_relations(id,from_id,to_type,to_id,relation,created_by,created_at) VALUES (?,?,?,?,?,?,?)`, [newId('rel'), mid, 'knowledge', r.id, 'supersedes', principal.id, now]);
        winnerId = mid;
      } else { // dismiss: not actually a conflict
        for (const r of [a, b]) if (r.status === 'disputed' && !stillOpenElsewhere(r)) this.db.run(`UPDATE ki_knowledge SET status='proposed', updated_at=? WHERE id=?`, [now, r.id]);
      }
      this.db.run(`UPDATE ki_conflicts SET status=?, resolution=?, winner_id=?, resolved_by=?, resolved_at=?, resolution_note=? WHERE id=?`,
        [resolution === 'dismiss' ? 'dismissed' : 'resolved', resolution === 'dismiss' ? null : resolution, winnerId, principal.id, now, note, c.id]);
      this.audit.record({ principal, action: 'knowledge.conflict_resolved', entityType: 'conflict', entityId: c.id, orgId: c.org_id, projectId: c.project_id, detail: { resolution, winnerId, note, a: c.a_id, b: c.b_id } });
      this.events.emit({ type: 'knowledge.conflict_resolved', entityType: 'conflict', entityId: c.id, orgId: c.org_id, projectId: c.project_id, importance: 'high', summary: `Conflict resolved (${resolution}) by ${principal.id}: ${note}`, payload: { winnerId } });
    });
    return { resolved: true, winnerId };
  }

  /* ---------------------------------------------------------------- reads */
  _get(principal, id) {
    const k = this.db.get('SELECT * FROM ki_knowledge WHERE id=?', [id]);
    if (!k) throw notFound('knowledge', id);
    const chk = checkRead(principal, k);
    if (!chk.allowed) {
      this.audit.record({ principal, action: 'knowledge.read_denied', entityType: 'knowledge', entityId: id, orgId: principal.orgId, projectId: k.project_id, outcome: 'denied', detail: { reason: chk.reason } });
      throw notFound('knowledge', id);
    }
    return k;
  }
  _shape(k) {
    const doc = parseJson(k.source_ref_json, null);
    let staleSource = false;
    if (doc && doc.documentId) { const d = this.db.get('SELECT current_version_id FROM ki_documents WHERE id=?', [doc.documentId]); staleSource = !!(d && d.current_version_id && doc.versionId && d.current_version_id !== doc.versionId); }
    return { id: k.id, type: k.type, title: k.title, content: k.content, subjectKey: k.subject_key, status: k.status, authority: k.authority, authorityName: AUTHORITY_NAMES[k.authority], confidence: k.confidence,
      verificationClass: k.verification_class, orgId: k.org_id, projectId: k.project_id, entityRef: k.entity_ref, classification: k.classification, sourceId: k.source_id, sourceRef: doc, derivedBy: k.derived_by,
      evidenceType: k.derived_by === 'human' ? 'human_stated' : k.derived_by === 'agent' ? 'ai_interpretation' : 'extracted_information', authorId: k.author_id, authorType: k.author_type, capturedAt: k.captured_at, effectiveAt: k.effective_at,
      reviewAt: k.review_at, expiresAt: k.expires_at, supersedes: k.supersedes_id, supersededBy: k.superseded_by_id, approvedBy: k.approved_by, approvedAt: k.approved_at, staleSource,
      reviewDue: !!(k.review_at && k.review_at <= this.clock.iso()), expired: !!(k.expires_at && k.expires_at <= this.clock.iso()) };
  }
  get(principal, id) {
    assertCan(principal, 'knowledge.read');
    const k = this._get(principal, id);
    const openConflicts = this.db.all(`SELECT id, a_id, b_id, reason, kind FROM ki_conflicts WHERE status='open' AND (a_id=? OR b_id=?)`, [id, id]);
    const decision = this.db.get('SELECT id, status, rationale, decided_by, decided_at FROM ki_decisions WHERE knowledge_id=?', [id]);
    this.audit.record({ principal, action: 'knowledge.read', entityType: 'knowledge', entityId: id, orgId: k.org_id, projectId: k.project_id, outcome: 'ok', detail: { protected: rank(k.classification) >= rank('confidential') } });
    return { ...this._shape(k), openConflicts, decision: decision || null };
  }
  list(principal, f = {}) {
    assertCan(principal, 'knowledge.read');
    const w = ['org_id=?']; const p = [principal.orgId];
    if (f.projectId) { w.push('(project_id=? OR project_id IS NULL)'); p.push(f.projectId); }
    if (f.type) { w.push('type=?'); p.push(f.type); }
    if (f.status) { w.push('status=?'); p.push(f.status); } else if (!f.includeInactive) w.push("status NOT IN ('superseded','archived')");
    if (f.authorId) { w.push('author_id=?'); p.push(f.authorId); }
    if (f.minAuthority !== undefined) { w.push('authority>=?'); p.push(f.minAuthority); }
    return this.db.all(`SELECT * FROM ki_knowledge WHERE ${w.join(' AND ')} ORDER BY authority DESC, captured_at DESC LIMIT ?`, [...p, f.limit || 200])
      .filter((k) => canRead(principal, k) && isSearchable(k)).map((k) => this._shape(k));
  }
  /** Current, authoritative guidance for a scope: accepted/verified, not disputed/superseded/expired, highest authority first. */
  current(principal, { projectId, types, limit = 50 } = {}) {
    const t = types || ['requirement', 'instruction', 'policy', 'decision', 'preference', 'fact'];
    return this.list(principal, { projectId, limit: 500 }).filter((k) => ['accepted', 'verified'].includes(k.status) && t.includes(k.type) && !k.expired).slice(0, limit);
  }

  related(principal, id) {
    assertCan(principal, 'knowledge.read');
    const k = this._get(principal, id);
    const rel = this.db.all('SELECT * FROM ki_knowledge_relations WHERE from_id=? OR (to_type=? AND to_id=?)', [id, 'knowledge', id]);
    const out = { knowledge: [], documents: [], commitments: [], decisions: [], source: null };
    for (const r of rel) {
      const otherId = r.from_id === id ? r.to_id : r.from_id; const otherType = r.from_id === id ? r.to_type : 'knowledge';
      if (otherType === 'knowledge') { try { out.knowledge.push({ relation: r.relation, ...this._shape(this._get(principal, otherId)) }); } catch (_) { /* hidden */ } }
      else if (otherType === 'document') { const d = this.db.get('SELECT * FROM ki_documents WHERE id=?', [otherId]); if (d && canRead(principal, d)) out.documents.push({ relation: r.relation, id: d.id, name: d.display_name, status: d.status }); }
    }
    if (k.source_id) {
      out.commitments = this.db.all('SELECT * FROM ki_commitments WHERE source_id=?', [k.source_id]).filter((c) => canRead(principal, c)).map((c) => ({ id: c.id, kind: c.kind, status: c.status, description: c.description }));
      const s = this.db.get('SELECT * FROM ki_sources WHERE id=?', [k.source_id]); if (s && canRead(principal, s)) out.source = { id: s.id, platform: s.platform, channel: s.channel, authorId: s.author_id, originalTs: s.original_ts };
    }
    const dec = this.db.get('SELECT id,status FROM ki_decisions WHERE knowledge_id=?', [id]); if (dec) out.decisions.push(dec);
    return out;
  }

  reviewDue(principal, { projectId } = {}) {
    return this.list(principal, { projectId, limit: 500 }).filter((k) => k.reviewDue || k.expired || k.staleSource);
  }
}

module.exports = { KnowledgeService, TYPES };
