'use strict';
/**
 * Document Repository: authoritative storage + lifecycle of organisational documents.
 * Received -> Stored -> Extracted -> Indexed -> Available   (+ failed / reprocessing / superseded / archived)
 *
 * Invariants:
 *  - Original bytes are never modified (content-addressed store + immutability trigger on versions).
 *  - A new version only becomes *current* when it reaches `available`; until then the previous
 *    version stays current, and a failed new version can never replace it.
 *  - Superseded versions are excluded from retrieval by default.
 */
const path = require('path');
const fs = require('fs');
const { newId, sha256, toJson, parseJson } = require('../core/util');
const { assertCan, assertWriteScope, checkRead, canRead, rank, CLASSIFICATIONS } = require('../core/access');
const { invalid, notFound, forbidden, illegalState } = require('../core/errors');
const { extract, classify, ExtractionError } = require('./extractors');
const { chunkText } = require('./chunker');
const { wrapEvidence } = require('../core/security');

const CATEGORIES = ['general', 'project_plan', 'technical_spec', 'architecture', 'adr', 'meeting_summary', 'research', 'proposal', 'requirements',
  'qa_report', 'delivery_report', 'procedure', 'policy', 'instruction', 'thread', 'transcript', 'source_code', 'data', 'contract'];

const safeName = (n) => path.basename(String(n || '').replace(/\\/g, '/')).replace(/[\u0000-\u001f<>:"|?*]/g, '_').slice(0, 200) || 'untitled';

class DocumentRepository {
  constructor({ db, store, audit, events, clock, queue, index, settings, nowIso }) {
    Object.assign(this, { db, store, audit, events, clock, queue, index, settings });
  }

  /* ------------------------------------------------------------------ ingest */
  async ingest(principal, input) {
    assertCan(principal, 'document.create');
    const projectId = input.projectId || null;
    assertWriteScope(principal, { project_id: projectId });
    const cfg = this.settings.all();
    const buffer = input.buffer ? Buffer.from(input.buffer) : input.path ? fs.readFileSync(input.path) : null;
    if (!buffer || !buffer.length) throw invalid('Document content is empty');
    if (buffer.length > cfg.maxUploadBytes) throw invalid(`File exceeds the ${cfg.maxUploadBytes} byte limit`);
    const filename = safeName(input.filename || (input.path && path.basename(input.path)));
    const classification = input.classification || 'internal';
    if (!CLASSIFICATIONS.includes(classification)) throw invalid(`Unknown classification: ${classification}`);
    if (rank(classification) > rank(principal.clearance)) throw forbidden('Cannot classify above your own clearance');
    const category = input.category || 'general';
    if (!CATEGORIES.includes(category)) throw invalid(`Unknown category: ${category}`);
    const sourceKind = input.sourceKind || (principal.type === 'agent' ? 'generated' : 'upload');

    let kindInfo;
    try { kindInfo = classify(filename, input.mime, buffer); } catch (e) {
      if (e instanceof ExtractionError) {
        this.audit.record({ principal, action: 'document.rejected', outcome: 'denied', orgId: principal.orgId, projectId, detail: { filename, code: e.code } });
        throw invalid(e.message, { code: e.code });
      }
      throw e;
    }
    if (!cfg.allowedKinds.includes(kindInfo.kind) && kindInfo.kind !== 'unsupported') throw invalid(`Document type '${kindInfo.kind}' is disabled in settings`);

    const hash = sha256(buffer);
    // ----- resolve target document (new, new-version, or duplicate)
    let doc = null;
    if (input.documentId) {
      doc = this._doc(input.documentId);
      if (!doc) throw notFound('document', input.documentId);
      if (!canRead(principal, doc)) throw forbidden('No access to that document');
    } else {
      const lineage = input.lineageKey || `${category}:${filename.toLowerCase()}`;
      doc = this.db.get(`SELECT * FROM ki_documents WHERE org_id=? AND IFNULL(project_id,'')=? AND lineage_key=? AND status<>'deleted'`, [principal.orgId, projectId || '', lineage]);
      if (doc && !canRead(principal, doc)) doc = null;
      input = { ...input, lineageKey: lineage };
    }
    if (doc && doc.status === 'archived') throw illegalState('Document is archived; restore it before adding versions');

    const dupVersion = doc && this.db.get('SELECT * FROM ki_document_versions WHERE document_id=? AND content_hash=?', [doc.id, hash]);
    if (dupVersion) {
      this.audit.record({ principal, action: 'document.duplicate_ignored', entityType: 'document', entityId: doc.id, orgId: doc.org_id, projectId: doc.project_id, detail: { hash, versionId: dupVersion.id } });
      return { duplicate: true, scope: 'same_document', documentId: doc.id, versionId: dupVersion.id, versionNo: dupVersion.version_no, status: dupVersion.status };
    }
    if (!doc && !input.allowDuplicate) {
      const cands = this.db.all(`SELECT d.* FROM ki_document_versions v JOIN ki_documents d ON d.id=v.document_id
        WHERE v.content_hash=? AND d.org_id=? AND IFNULL(d.project_id,'')=? AND d.status<>'deleted'`, [hash, principal.orgId, projectId || '']);
      const visible = cands.find((d) => canRead(principal, d));
      if (visible) {
        this.audit.record({ principal, action: 'document.duplicate_ignored', entityType: 'document', entityId: visible.id, orgId: visible.org_id, projectId, detail: { hash, scope: 'cross_document' } });
        return { duplicate: true, scope: 'other_document', documentId: visible.id, versionId: visible.current_version_id, versionNo: null, status: 'existing' };
      }
    }

    const stored = this.store.put(buffer); // idempotent; originals are never rewritten
    const now = this.clock.iso();
    const result = this.db.tx(() => {
      let documentId;
      let versionNo = 1;
      let previous = null;
      if (doc) {
        documentId = doc.id;
        versionNo = this.db.get('SELECT MAX(version_no) m FROM ki_document_versions WHERE document_id=?', [doc.id]).m + 1;
        previous = doc.current_version_id;
        this.db.run('UPDATE ki_documents SET updated_at=? WHERE id=?', [now, doc.id]);
      } else {
        documentId = newId('doc');
        const retention = input.retentionUntil || (cfg.defaultRetentionDays ? new Date(this.clock.now().getTime() + cfg.defaultRetentionDays * 86400000).toISOString() : null);
        this.db.run(`INSERT INTO ki_documents(id,org_id,project_id,display_name,category,description,classification,acl_json,source_id,source_kind,author_id,author_type,origin_json,lineage_key,status,retention_until,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active',?,?,?)`,
        [documentId, principal.orgId, projectId, input.displayName || filename, category, input.description || null, classification, toJson(input.acl),
          input.sourceId || null, sourceKind, input.authorId || principal.id, input.authorType || principal.type, toJson(input.origin), input.lineageKey || `${category}:${filename.toLowerCase()}`, retention, now, now]);
      }
      const versionId = newId('ver');
      this.db.run(`INSERT INTO ki_document_versions(id,document_id,version_no,original_filename,mime_type,size_bytes,content_hash,storage_key,status,is_current,supersedes_version_id,received_at,stored_at,created_by,change_note)
        VALUES (?,?,?,?,?,?,?,?, 'stored',0,?,?,?,?,?)`,
      [versionId, documentId, versionNo, filename, kindInfo.mime, stored.size, stored.hash, stored.key, previous, now, now, principal.id, input.changeNote || null]);
      for (const l of [{ type: 'project', id: projectId }, { type: 'task', id: input.origin && input.origin.taskId }, { type: 'job', id: input.origin && input.origin.jobId },
        { type: 'workflow', id: input.origin && input.origin.workflowId }, { type: 'conversation', id: input.origin && input.origin.conversationId }]) {
        if (l.id) this.db.run(`INSERT OR IGNORE INTO ki_document_links(document_id,link_type,target_id,relation,linked_by,linked_at) VALUES (?,?,?,?,?,?)`, [documentId, l.type, l.id, l.type === 'project' ? 'scope' : 'produced_for', principal.id, now]);
      }
      this.audit.record({ principal, action: previous ? 'document.version_created' : 'document.created', entityType: 'document', entityId: documentId, orgId: principal.orgId, projectId,
        detail: { versionId, versionNo, hash: stored.hash, filename, classification: doc ? doc.classification : classification, sourceKind } });
      this.events.emit({ type: previous ? 'document.version_created' : 'document.created', entityType: 'document', entityId: documentId, orgId: principal.orgId, projectId,
        summary: `${previous ? 'New version v' + versionNo + ' of' : 'New document'} "${input.displayName || filename}" received`, payload: { versionId, versionNo, category } });
      this.queue.enqueue('process_version', 'document_version', versionId);
      return { documentId, versionId, versionNo };
    });

    if (input.process === 'inline') await this.processVersion(result.versionId);
    return { duplicate: false, ...result, status: input.process === 'inline' ? this._version(result.versionId).status : 'stored' };
  }

  /* ---------------------------------------------------------------- pipeline */
  /** Idempotent. Safe to retry at any point: each step commits independently and resumes from source rows. */
  async processVersion(versionId, { force = false } = {}) {
    let v = this._version(versionId);
    if (!v) throw notFound('document_version', versionId);
    const doc = this._doc(v.document_id);
    if (v.status === 'available' && !force) return { versionId, status: 'available', noop: true };
    if (doc.status === 'deleted') return { versionId, status: v.status, noop: true };
    const actor = { id: 'ki-pipeline', type: 'system', role: 'system', orgId: doc.org_id };
    try {
      // 1. extract
      this._setStatus(versionId, 'extracting');
      let bytes;
      try { bytes = this.store.get(v.storage_key); } catch (_) { throw Object.assign(new ExtractionError('storage_missing', 'Original file missing from storage', false)); }
      if (sha256(bytes) !== v.content_hash) throw new ExtractionError('storage_corrupt', 'Stored bytes do not match content hash', false);
      const ex = await extract(v.original_filename, v.mime_type, bytes);
      const now = this.clock.iso();
      this.db.tx(() => {
        this.db.run('INSERT INTO ki_doc_text(version_id,text) VALUES (?,?) ON CONFLICT(version_id) DO UPDATE SET text=excluded.text', [versionId, ex.text]);
        this.db.run(`UPDATE ki_document_versions SET status='extracted', extractor=?, extractor_version=?, extraction_quality=?, extraction_error=NULL, text_hash=?, text_length=?, extracted_at=? WHERE id=?`,
          [ex.extractor, ex.version, ex.quality, sha256(ex.text), ex.text.length, now, versionId]);
      });
      if (!ex.text.trim()) throw new ExtractionError('empty_text', 'No text could be extracted', false);

      // 2. chunk + full-text index
      this._setStatus(versionId, 'indexing');
      const kind = ex.kind === 'code' ? 'code' : 'prose';
      const chunks = chunkText(ex.text, { target: this.settings.get('chunkTargetChars'), kind, filename: v.original_filename });
      const chunkRows = this.db.tx(() => {
        for (const old of this.db.all('SELECT id FROM ki_chunks WHERE version_id=?', [versionId])) this.index.removeText('chunk', old.id);
        this.db.run('DELETE FROM ki_chunks WHERE version_id=?', [versionId]);
        const rows = chunks.map((c) => {
          const id = newId('chk');
          this.db.run(`INSERT INTO ki_chunks(id,document_id,version_id,ordinal,section_path,heading,char_start,char_end,text,text_hash,token_estimate,injection_score,injection_flags,has_secret)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, doc.id, versionId, c.ordinal, c.section_path, c.heading, c.char_start, c.char_end, c.text, c.text_hash, c.token_estimate, c.injection_score, c.injection_flags, c.has_secret]);
          this.index.upsertText('chunk', id, [doc.display_name, c.section_path].filter(Boolean).join(' / '), c.text);
          return { id, text: c.text, hasSecret: c.has_secret, inj: c.injection_score };
        });
        this.db.run('UPDATE ki_document_versions SET chunk_count=? WHERE id=?', [rows.length, versionId]);
        if (rows.some((r) => r.hasSecret) && rank(doc.classification) < rank('restricted')) {
          this.db.run(`UPDATE ki_documents SET classification='restricted' WHERE id=?`, [doc.id]);
          this.audit.record({ principal: actor, action: 'document.auto_restricted', entityType: 'document', entityId: doc.id, orgId: doc.org_id, projectId: doc.project_id, detail: { reason: 'secrets_detected' } });
          this.events.emit({ type: 'document.secrets_detected', entityType: 'document', entityId: doc.id, orgId: doc.org_id, projectId: doc.project_id, importance: 'high', summary: `Secrets detected in "${doc.display_name}"; document restricted and chunks redacted in the index` });
        }
        if (rows.some((r) => r.inj >= 0.5)) {
          this.events.emit({ type: 'document.injection_suspected', entityType: 'document', entityId: doc.id, orgId: doc.org_id, projectId: doc.project_id, importance: 'high', summary: `Instruction-like content aimed at agents found in "${doc.display_name}"; affected sections are quarantined from agent context` });
        }
        return rows;
      });

      // 3. embeddings (separate step so a provider outage leaves a retryable, non-current version)
      const emb = await this.index.embedEntities(chunkRows.map((r) => ({ entityType: 'chunk', entityId: r.id, text: r.text })));
      this.db.run(`UPDATE ki_document_versions SET status='indexed', indexed_at=?, index_model=?, index_error=NULL WHERE id=?`, [this.clock.iso(), `${this.index.provider.id}@${this.index.provider.version}`, versionId]);

      // 4. atomically promote to current
      this._promote(versionId, actor);
      if (this.settings.get('autoExtractKnowledge')) this.queue.enqueue('extract_knowledge', 'document_version', versionId);
      return { versionId, status: 'available', chunks: chunkRows.length, embedded: emb.embedded };
    } catch (e) {
      const retryable = e instanceof ExtractionError ? e.retryable : true;
      const code = e instanceof ExtractionError ? e.code : 'pipeline_error';
      const phase = this._version(versionId).status;
      this.db.run(`UPDATE ki_document_versions SET status='failed', ${phase === 'indexing' || phase === 'indexed' ? 'index_error' : 'extraction_error'}=? WHERE id=?`,
        [JSON.stringify({ code, message: e.message, retryable, at: this.clock.iso() }), versionId]);
      this.events.emit({ type: 'document.failed', entityType: 'document', entityId: doc.id, orgId: doc.org_id, projectId: doc.project_id, importance: 'high',
        summary: `Processing "${doc.display_name}" v${v.version_no} failed: ${e.message}`, payload: { versionId, code, retryable } });
      this.audit.record({ principal: actor, action: 'document.processing_failed', entityType: 'document', entityId: doc.id, orgId: doc.org_id, projectId: doc.project_id, outcome: 'error', detail: { versionId, code, retryable } });
      if (e instanceof ExtractionError) return { versionId, status: 'failed', error: code, retryable }; // handled: visible state, no job retry storm unless retryable
      throw e; // unexpected: let the job queue retry with backoff
    }
  }

  _promote(versionId, actor) {
    this.db.tx(() => {
      const v = this._version(versionId);
      const doc = this._doc(v.document_id);
      const now = this.clock.iso();
      const prev = doc.current_version_id && doc.current_version_id !== versionId ? doc.current_version_id : null;
      if (prev) {
        this.db.run(`UPDATE ki_document_versions SET is_current=0, status='superseded', superseded_by_version_id=? WHERE id=?`, [versionId, prev]);
        for (const c of this.db.all('SELECT id FROM ki_chunks WHERE version_id=?', [prev])) void c; // chunks stay (history) but are filtered by is_current
      }
      this.db.run(`UPDATE ki_document_versions SET status='available', is_current=1, available_at=? WHERE id=?`, [now, versionId]);
      this.db.run('UPDATE ki_documents SET current_version_id=?, updated_at=? WHERE id=?', [versionId, now, doc.id]);
      this.audit.record({ principal: actor, action: 'document.available', entityType: 'document', entityId: doc.id, orgId: doc.org_id, projectId: doc.project_id, detail: { versionId, versionNo: v.version_no, supersedes: prev } });
      this.events.emit({ type: prev ? 'document.superseded' : 'document.available', entityType: 'document', entityId: doc.id, orgId: doc.org_id, projectId: doc.project_id,
        importance: prev ? 'high' : 'normal', summary: prev ? `"${doc.display_name}" updated to v${v.version_no}; earlier version superseded` : `"${doc.display_name}" is available`, payload: { versionId, supersedes: prev } });
    });
  }

  async reprocess(principal, versionId, { force = true } = {}) {
    assertCan(principal, 'document.create');
    const v = this._version(versionId);
    if (!v) throw notFound('document_version', versionId);
    const doc = this._doc(v.document_id);
    if (!canRead(principal, doc)) throw forbidden('No access to that document');
    this.db.run(`UPDATE ki_document_versions SET status=CASE WHEN is_current=1 THEN status ELSE 'reprocessing' END WHERE id=?`, [versionId]);
    this.audit.record({ principal, action: 'document.reprocess', entityType: 'document', entityId: doc.id, orgId: doc.org_id, projectId: doc.project_id, detail: { versionId } });
    this.queue.enqueue('process_version', 'document_version', versionId, { payload: { force } });
    return { queued: true };
  }

  /** Re-queue every failed (retryable) version. */
  retryFailed(principal) {
    assertCan(principal, 'document.create');
    const rows = this.db.all(`SELECT v.id, v.extraction_error, v.index_error FROM ki_document_versions v JOIN ki_documents d ON d.id=v.document_id WHERE v.status='failed' AND d.org_id=?`, [principal.orgId]);
    let queued = 0;
    for (const r of rows) {
      const err = parseJson(r.extraction_error || r.index_error, {});
      if (err.retryable !== false) { this.queue.enqueue('process_version', 'document_version', r.id, { payload: { force: true } }); queued++; }
    }
    return { failed: rows.length, queued };
  }

  /* ------------------------------------------------------------------ reads */
  _doc(id) { return this.db.get('SELECT * FROM ki_documents WHERE id=?', [id]); }
  _version(id) { return this.db.get('SELECT * FROM ki_document_versions WHERE id=?', [id]); }
  _setStatus(versionId, status) { this.db.run('UPDATE ki_document_versions SET status=? WHERE id=?', [status, versionId]); }

  _readable(principal, id) {
    const d = this._doc(id);
    if (!d || d.status === 'deleted') throw notFound('document', id);
    const chk = checkRead(principal, d);
    if (!chk.allowed) {
      this.audit.record({ principal, action: 'document.read_denied', entityType: 'document', entityId: id, orgId: principal.orgId, projectId: d.project_id, outcome: 'denied', detail: { reason: chk.reason } });
      // Indistinguishable from "not found" for callers without access: no existence leak.
      throw notFound('document', id);
    }
    return d;
  }

  getDocument(principal, id) {
    assertCan(principal, 'document.read');
    const d = this._readable(principal, id);
    const versions = this.getVersions(principal, id);
    const links = this.db.all('SELECT link_type, target_id, relation FROM ki_document_links WHERE document_id=?', [id]);
    return { ...this._shape(d), versions, links, origin: parseJson(d.origin_json, null) };
  }
  _shape(d) {
    const cur = d.current_version_id ? this._version(d.current_version_id) : null;
    return { id: d.id, orgId: d.org_id, projectId: d.project_id, displayName: d.display_name, category: d.category, description: d.description, classification: d.classification,
      status: d.status, sourceKind: d.source_kind, authorId: d.author_id, authorType: d.author_type, lineageKey: d.lineage_key, createdAt: d.created_at, updatedAt: d.updated_at,
      retentionUntil: d.retention_until, legalHold: !!d.legal_hold, currentVersionId: d.current_version_id,
      current: cur && { versionId: cur.id, versionNo: cur.version_no, filename: cur.original_filename, mime: cur.mime_type, size: cur.size_bytes, hash: cur.content_hash, status: cur.status, availableAt: cur.available_at },
      latestStatus: (this.db.get('SELECT status FROM ki_document_versions WHERE document_id=? ORDER BY version_no DESC LIMIT 1', [d.id]) || {}).status };
  }
  getVersions(principal, id) {
    assertCan(principal, 'document.read');
    this._readable(principal, id);
    return this.db.all('SELECT * FROM ki_document_versions WHERE document_id=? ORDER BY version_no DESC', [id]).map((v) => ({
      id: v.id, versionNo: v.version_no, filename: v.original_filename, mime: v.mime_type, size: v.size_bytes, hash: v.content_hash, status: v.status, isCurrent: !!v.is_current,
      supersedes: v.supersedes_version_id, supersededBy: v.superseded_by_version_id, extractor: v.extractor, extractionQuality: v.extraction_quality, chunkCount: v.chunk_count,
      extractionError: parseJson(v.extraction_error, v.extraction_error), indexError: parseJson(v.index_error, v.index_error), indexModel: v.index_model,
      receivedAt: v.received_at, storedAt: v.stored_at, extractedAt: v.extracted_at, indexedAt: v.indexed_at, availableAt: v.available_at, createdBy: v.created_by, changeNote: v.change_note }));
  }

  listDocuments(principal, f = {}) {
    assertCan(principal, 'document.read');
    const w = ['d.org_id = ?', "d.status <> 'deleted'"]; const p = [principal.orgId];
    if (f.projectId) { w.push('d.project_id = ?'); p.push(f.projectId); }
    if (f.category) { w.push('d.category = ?'); p.push(f.category); }
    if (f.authorId) { w.push('d.author_id = ?'); p.push(f.authorId); }
    if (f.sourceKind) { w.push('d.source_kind = ?'); p.push(f.sourceKind); }
    if (f.status) { w.push('d.status = ?'); p.push(f.status); } else if (!f.includeArchived) w.push("d.status = 'active'");
    if (f.from) { w.push('d.created_at >= ?'); p.push(f.from); }
    if (f.to) { w.push('d.created_at <= ?'); p.push(f.to); }
    if (f.text) { w.push('(d.display_name LIKE ? OR d.description LIKE ?)'); p.push(`%${f.text}%`, `%${f.text}%`); }
    const rows = this.db.all(`SELECT d.* FROM ki_documents d WHERE ${w.join(' AND ')} ORDER BY d.updated_at DESC LIMIT ?`, [...p, f.limit || 200]);
    return rows.filter((d) => canRead(principal, d)).map((d) => this._shape(d));
  }

  /** Read extracted text (whole, a section, or a char range). Returned as an evidence envelope, never as instructions. */
  readContent(principal, { documentId, versionId, chunkId, section, offset = 0, length = 8000 }) {
    assertCan(principal, 'document.read');
    const d = this._readable(principal, documentId);
    const vid = versionId || d.current_version_id;
    if (!vid) throw illegalState('Document has no available version yet');
    const v = this._version(vid);
    if (!v || v.document_id !== d.id) throw notFound('document_version', vid);
    let text; let meta = { documentId: d.id, versionId: vid, versionNo: v.version_no };
    if (chunkId) {
      const c = this.db.get('SELECT * FROM ki_chunks WHERE id=? AND version_id=?', [chunkId, vid]);
      if (!c) throw notFound('chunk', chunkId);
      text = c.text; meta = { ...meta, chunkId, sectionPath: c.section_path, charStart: c.char_start, charEnd: c.char_end, injectionScore: c.injection_score };
    } else if (section) {
      const cs = this.db.all(`SELECT * FROM ki_chunks WHERE version_id=? AND (section_path LIKE ? ) ORDER BY ordinal`, [vid, `%${section}%`]);
      if (!cs.length) throw notFound('section', section);
      text = cs.map((c) => c.text).join('\n\n'); meta = { ...meta, sectionPath: cs[0].section_path };
    } else {
      const full = this.db.get('SELECT text FROM ki_doc_text WHERE version_id=?', [vid]);
      if (!full) throw illegalState('Text not extracted yet', { status: v.status });
      text = full.text.slice(offset, offset + length); meta = { ...meta, charStart: offset, charEnd: offset + text.length, totalLength: full.text.length, truncated: offset + text.length < full.text.length };
    }
    const secretSafe = text; // chunk text is already redacted at index time; full text is redacted below for non-owners
    const out = (!chunkId && principal.role !== 'owner') ? require('../core/security').redactSecrets(secretSafe) : secretSafe;
    if (rank(d.classification) >= rank('confidential')) this.audit.record({ principal, action: 'document.read_protected', entityType: 'document', entityId: d.id, orgId: d.org_id, projectId: d.project_id, detail: { versionId: vid, classification: d.classification } });
    return { ...meta, trust: 'untrusted_evidence', content: out, envelope: wrapEvidence(out, { document: d.display_name, version: v.version_no, section: meta.sectionPath }) };
  }

  /** Original bytes (owner-level explicit action; always audited). */
  downloadOriginal(principal, documentId, versionId) {
    assertCan(principal, 'document.read');
    const d = this._readable(principal, documentId);
    const v = this._version(versionId || d.current_version_id);
    if (!v || v.document_id !== d.id) throw notFound('document_version', versionId);
    this.audit.record({ principal, action: 'document.download_original', entityType: 'document', entityId: d.id, orgId: d.org_id, projectId: d.project_id, detail: { versionId: v.id } });
    return { filename: v.original_filename, mime: v.mime_type, buffer: this.store.get(v.storage_key), hash: v.content_hash };
  }

  link(principal, documentId, { type, targetId, relation = 'attached' }) {
    assertCan(principal, 'document.create');
    const d = this._readable(principal, documentId);
    if (!['project', 'task', 'job', 'workflow', 'conversation', 'agent'].includes(type) || !targetId) throw invalid('link needs type and targetId');
    this.db.run(`INSERT OR IGNORE INTO ki_document_links(document_id,link_type,target_id,relation,linked_by,linked_at) VALUES (?,?,?,?,?,?)`, [d.id, type, targetId, relation, principal.id, this.clock.iso()]);
    this.audit.record({ principal, action: 'document.link', entityType: 'document', entityId: d.id, orgId: d.org_id, projectId: d.project_id, detail: { type, targetId } });
    return { linked: true };
  }
  linksFor(type, targetId) {
    return this.db.all(`SELECT d.* FROM ki_document_links l JOIN ki_documents d ON d.id=l.document_id WHERE l.link_type=? AND l.target_id=? AND d.status='active'`, [type, targetId]);
  }

  /* ----------------------------------------------- classification / lifecycle */
  setAccess(principal, documentId, { classification, acl }) {
    const d = this._readable(principal, documentId);
    if (!(principal.role === 'owner' || principal.role === 'approver')) throw forbidden('Only owners/approvers can change document access');
    if (classification && !CLASSIFICATIONS.includes(classification)) throw invalid('Unknown classification');
    if (classification && rank(classification) > rank(principal.clearance)) throw forbidden('Cannot classify above your clearance');
    const before = { classification: d.classification, acl: parseJson(d.acl_json, null) };
    this.db.tx(() => {
      this.db.run('UPDATE ki_documents SET classification=?, acl_json=?, updated_at=? WHERE id=?', [classification || d.classification, acl === undefined ? d.acl_json : toJson(acl), this.clock.iso(), d.id]);
      this.audit.record({ principal, action: 'document.permission_change', entityType: 'document', entityId: d.id, orgId: d.org_id, projectId: d.project_id, detail: { before, after: { classification: classification || d.classification, acl } } });
    });
    return this._shape(this._doc(d.id));
  }

  archive(principal, documentId, reason = '') {
    assertCan(principal, 'document.create');
    const d = this._readable(principal, documentId);
    this.db.tx(() => {
      this.db.run(`UPDATE ki_documents SET status='archived', archived_at=?, updated_at=? WHERE id=?`, [this.clock.iso(), this.clock.iso(), d.id]);
      this.audit.record({ principal, action: 'document.archive', entityType: 'document', entityId: d.id, orgId: d.org_id, projectId: d.project_id, detail: { reason } });
      this.events.emit({ type: 'document.archived', entityType: 'document', entityId: d.id, orgId: d.org_id, projectId: d.project_id, summary: `"${d.display_name}" archived${reason ? ': ' + reason : ''}` });
    });
    return { archived: true };
  }
  restore(principal, documentId) {
    assertCan(principal, 'document.create');
    const d = this._doc(documentId);
    if (!d || d.status !== 'archived' || !canRead(principal, d)) throw notFound('document', documentId);
    this.db.run(`UPDATE ki_documents SET status='active', archived_at=NULL, updated_at=? WHERE id=?`, [this.clock.iso(), d.id]);
    this.audit.record({ principal, action: 'document.restore', entityType: 'document', entityId: d.id, orgId: d.org_id, projectId: d.project_id });
    return { restored: true };
  }

  /** Controlled deletion: archived-first, owner only, never under legal hold or active retention. Leaves a tombstone + audit. */
  delete(principal, documentId, reason) {
    if (principal.role !== 'owner') throw forbidden('Only an owner can permanently delete documents');
    if (!reason) throw invalid('A deletion reason is required');
    const d = this._doc(documentId);
    if (!d || d.org_id !== principal.orgId || d.status === 'deleted') throw notFound('document', documentId);
    if (d.status !== 'archived') throw illegalState('Archive the document before deleting it');
    if (d.legal_hold) throw illegalState('Document is under legal hold');
    if (d.retention_until && d.retention_until > this.clock.iso()) throw illegalState(`Retention period runs until ${d.retention_until}`);
    const versions = this.db.all('SELECT * FROM ki_document_versions WHERE document_id=?', [d.id]);
    this.db.tx(() => {
      for (const v of versions) {
        for (const c of this.db.all('SELECT id FROM ki_chunks WHERE version_id=?', [v.id])) this.index.removeText('chunk', c.id);
        this.db.run('DELETE FROM ki_chunks WHERE version_id=?', [v.id]);
        this.db.run('DELETE FROM ki_doc_text WHERE version_id=?', [v.id]);
        this.db.run(`UPDATE ki_document_versions SET status='archived', is_current=0 WHERE id=?`, [v.id]);
      }
      this.db.run(`UPDATE ki_documents SET status='deleted', deleted_at=?, delete_reason=?, current_version_id=NULL, updated_at=? WHERE id=?`, [this.clock.iso(), reason, this.clock.iso(), d.id]);
      this.audit.record({ principal, action: 'document.delete', entityType: 'document', entityId: d.id, orgId: d.org_id, projectId: d.project_id, detail: { reason, versions: versions.length, hashes: versions.map((v) => v.content_hash) } });
    });
    for (const v of versions) { // remove bytes only when no other version row (any document) still references them
      const refs = this.db.get(`SELECT COUNT(*) n FROM ki_document_versions v JOIN ki_documents d ON d.id=v.document_id WHERE v.storage_key=? AND d.status<>'deleted'`, [v.storage_key]).n;
      if (!refs) this.store.delete(v.storage_key);
    }
    return { deleted: true };
  }

  /** Retention sweep: archives (never deletes) expired, un-held documents. */
  applyRetention(principal) {
    assertCan(principal, 'settings.write');
    const rows = this.db.all(`SELECT * FROM ki_documents WHERE org_id=? AND status='active' AND legal_hold=0 AND retention_until IS NOT NULL AND retention_until<=?`, [principal.orgId, this.clock.iso()]);
    rows.forEach((d) => this.archive(principal, d.id, 'retention period elapsed'));
    return { archived: rows.length };
  }

  /* -------------------------------------------------------------- operations */
  pipelineStatus(principal) {
    const rows = this.db.all(`SELECT v.status, COUNT(*) n FROM ki_document_versions v JOIN ki_documents d ON d.id=v.document_id WHERE d.org_id=? AND d.status<>'deleted' GROUP BY v.status`, [principal.orgId]);
    const failed = this.db.all(`SELECT v.id versionId, d.id documentId, d.display_name name, v.version_no versionNo, COALESCE(v.extraction_error, v.index_error) error FROM ki_document_versions v JOIN ki_documents d ON d.id=v.document_id
      WHERE v.status='failed' AND d.org_id=?`, [principal.orgId]).filter((r) => canRead(principal, this._doc(r.documentId))).map((r) => ({ ...r, error: parseJson(r.error, r.error) }));
    return { counts: Object.fromEntries(rows.map((r) => [r.status, r.n])), failed };
  }
  /** Storage integrity: every version must still have its original bytes with a matching hash. */
  verifyStorage() {
    const bad = [];
    for (const v of this.db.all(`SELECT v.id, v.storage_key FROM ki_document_versions v JOIN ki_documents d ON d.id=v.document_id WHERE d.status<>'deleted'`)) {
      const r = this.store.verify(v.storage_key);
      if (!r.ok) bad.push({ versionId: v.id, reason: r.reason });
    }
    return { ok: bad.length === 0, bad };
  }
}

module.exports = { DocumentRepository, CATEGORIES, safeName };
