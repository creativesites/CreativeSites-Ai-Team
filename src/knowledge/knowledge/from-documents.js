'use strict';
/** Job handler: propose knowledge candidates from a document version, with exact source references. */
const { parseJson } = require('../core/util');

async function extractKnowledgeFromVersion({ db, knowledge, extractor, audit, clock }, versionId) {
  const v = db.get('SELECT * FROM ki_document_versions WHERE id=?', [versionId]);
  if (!v) return { skipped: 'version_not_found' };
  const doc = db.get('SELECT * FROM ki_documents WHERE id=?', [v.document_id]);
  if (!doc || doc.status !== 'active' || v.status !== 'available') return { skipped: 'not_available' };
  const system = { id: 'ki-extractor', type: 'system', role: 'system', orgId: doc.org_id, projectIds: doc.project_id ? [doc.project_id] : [], clearance: doc.classification, grant: [], deny: [] };
  const chunks = db.all('SELECT * FROM ki_chunks WHERE version_id=? ORDER BY ordinal', [versionId]);
  const candidates = await extractor.extract({ chunks, document: doc, version: v });
  const known = new Set(db.all(`SELECT content_hash h FROM ki_knowledge WHERE org_id=? AND json_extract(source_ref_json,'$.documentId')=? AND json_extract(source_ref_json,'$.versionId')=?`, [doc.org_id, doc.id, versionId]).map((r) => r.h));
  const crypto = require('crypto');
  let created = 0; let skipped = 0;
  for (const c of candidates) {
    const h = crypto.createHash('sha256').update(c.content).digest('hex');
    if (known.has(h)) { skipped++; continue; }
    await knowledge.propose(system, { type: c.type, title: c.title, content: c.content, confidence: c.confidence, sourceRef: c.sourceRef, projectId: doc.project_id, derivedBy: 'extractor', classification: doc.classification });
    created++;
  }
  // Un-reviewed proposals derived from superseded versions of this document are retired; approved ones are flagged via staleSource.
  const retired = db.all(`SELECT id FROM ki_knowledge WHERE org_id=? AND status IN ('proposed','disputed') AND json_extract(source_ref_json,'$.documentId')=? AND json_extract(source_ref_json,'$.versionId')<>?`, [doc.org_id, doc.id, versionId]);
  for (const r of retired) {
    db.run(`UPDATE ki_knowledge SET status='archived', updated_at=? WHERE id=?`, [clock.iso(), r.id]);
    audit.record({ principal: system, action: 'knowledge.auto_archive', entityType: 'knowledge', entityId: r.id, orgId: doc.org_id, projectId: doc.project_id, detail: { reason: 'derived from superseded document version', newVersion: versionId } });
  }
  return { created, skipped, retired: retired.length };
}
module.exports = { extractKnowledgeFromVersion };
