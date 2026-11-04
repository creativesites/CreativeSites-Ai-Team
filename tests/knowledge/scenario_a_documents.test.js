'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { makeKi, SPEC_MD, ingestAndProcess } = require('./helpers');
const { writeZip } = require('../../src/knowledge/documents/zip');

test('Scenario A: a project specification becomes searchable organisational knowledge with a precise source', async () => {
  const h = makeKi(); const { ki, principals: p } = h;
  try {
    // 1-4: upload, store original, extract, index
    const up = await ingestAndProcess(ki, p.orchestrator, { filename: 'atlas-portal-spec.md', buffer: Buffer.from(SPEC_MD), category: 'technical_spec', projectId: 'proj_portal', displayName: 'Atlas Portal Specification' });
    assert.equal(up.duplicate, false);
    assert.equal(up.status, 'available');
    const doc = ki.documents.getDocument(p.orchestrator, up.documentId);
    assert.equal(doc.versions[0].status, 'available');
    assert.ok(doc.versions[0].chunkCount >= 3);
    // original preserved byte-for-byte
    const orig = ki.documents.downloadOriginal(p.orchestrator, up.documentId);
    assert.equal(orig.buffer.toString(), SPEC_MD);
    assert.equal(ki.documents.verifyStorage().ok, true);

    // 5: knowledge records were created by the pipeline (job) - as PROPOSALS, never as truth
    const drained = await ki.worker.drain();
    assert.ok(drained.every((r) => r.ok), JSON.stringify(drained));
    const proposals = ki.knowledge.list(p.orchestrator, { projectId: 'proj_portal', type: 'requirement' });
    const tokenReq = proposals.find((k) => /expire after 60 minutes/.test(k.content));
    assert.ok(tokenReq, 'token-expiry requirement extracted');
    assert.equal(tokenReq.status, 'proposed');
    assert.equal(tokenReq.authority, 1);
    assert.equal(tokenReq.derivedBy, 'extractor');
    assert.equal(tokenReq.evidenceType, 'extracted_information');

    // 6: reference to the original document + section + exact offsets
    assert.equal(tokenReq.sourceRef.documentId, up.documentId);
    assert.equal(tokenReq.sourceRef.sectionPath, 'Atlas Portal Specification > Authentication');
    const full = ki.documents.readContent(p.orchestrator, { documentId: up.documentId, length: 100000 }).content;
    assert.equal(full.slice(tokenReq.sourceRef.charStart, tokenReq.sourceRef.charEnd), tokenReq.content);
    assert.ok(ki.knowledge.list(p.orchestrator, { type: 'decision' }).some((k) => /PostgreSQL/.test(k.content)));

    // 7-8: natural-language search finds the requirement AND the document section, with citations
    const res = await ki.search.search(p.orchestrator, { query: 'how long before an access token expires', projectId: 'proj_portal' });
    assert.ok(res.results.length > 0);
    const top = res.results.slice(0, 3);
    assert.ok(top.some((r) => r.kind === 'document_chunk' && /Authentication/.test(r.citation.sectionPath) && /60 minutes/.test(r.excerpt)), JSON.stringify(top.map((r) => [r.kind, r.title])));
    const kRes = await ki.search.search(p.orchestrator, { query: 'token lifetime requirement', types: ['knowledge'], projectId: 'proj_portal' });
    assert.ok(kRes.results.some((r) => r.citation.knowledgeId === tokenReq.id && r.citation.sourceRef.documentId === up.documentId));
    // exact-term (FTS) retrieval for an identifier-like phrase
    const exact = await ki.search.search(p.orchestrator, { query: 'AES-256', mode: 'fts', types: ['document'] });
    assert.ok(exact.results[0].excerpt.includes('AES-256'));
  } finally { h.cleanup(); }
});

test('duplicate ingestion is detected by content hash; a changed file becomes a new version; old chunks are not current', async () => {
  const h = makeKi(); const { ki, principals: p } = h;
  try {
    const a = await ingestAndProcess(ki, p.orchestrator, { filename: 'spec.md', buffer: Buffer.from(SPEC_MD), category: 'technical_spec', projectId: 'proj_portal' });
    const dup = await ki.documents.ingest(p.orchestrator, { filename: 'spec.md', buffer: Buffer.from(SPEC_MD), category: 'technical_spec', projectId: 'proj_portal' });
    assert.equal(dup.duplicate, true); assert.equal(dup.documentId, a.documentId);
    const renamed = await ki.documents.ingest(p.orchestrator, { filename: 'copy-of-spec.md', buffer: Buffer.from(SPEC_MD), category: 'technical_spec', projectId: 'proj_portal' });
    assert.equal(renamed.duplicate, true); assert.equal(renamed.scope, 'other_document');
    assert.equal(ki.documents.listDocuments(p.orchestrator, {}).length, 1);

    const v2text = SPEC_MD.replace('expire after 60 minutes', 'expire after 15 minutes');
    const b = await ingestAndProcess(ki, p.orchestrator, { filename: 'spec.md', buffer: Buffer.from(v2text), category: 'technical_spec', projectId: 'proj_portal', changeNote: 'shorter tokens' });
    assert.equal(b.documentId, a.documentId); assert.equal(b.versionNo, 2);
    const versions = ki.documents.getVersions(p.orchestrator, a.documentId);
    assert.deepEqual(versions.map((v) => [v.versionNo, v.status, v.isCurrent]), [[2, 'available', true], [1, 'superseded', false]]);
    assert.equal(ki.documents.downloadOriginal(p.orchestrator, a.documentId, versions[1].id).buffer.toString(), SPEC_MD, 'v1 original is never overwritten');

    const cur = await ki.search.search(p.orchestrator, { query: 'access tokens expire minutes', types: ['document'] });
    assert.ok(cur.results.every((r) => r.citation.versionNo === 2 && r.citation.current));
    assert.ok(cur.results.some((r) => /15 minutes/.test(r.excerpt)) && !cur.results.some((r) => /60 minutes/.test(r.excerpt)));
    const hist = await ki.search.search(p.orchestrator, { query: 'access tokens expire minutes', types: ['document'], includeSuperseded: true });
    assert.ok(hist.results.some((r) => /60 minutes/.test(r.excerpt) && r.citation.current === false), 'history only on request, flagged non-current');
  } finally { h.cleanup(); }
});

test('all supported formats extract: docx, xlsx, pptx, pdf, csv, code, transcripts; executables and mismatches are rejected', async () => {
  const h = makeKi(); const { ki, principals: p } = h;
  try {
    const docx = writeZip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Security Policy</w:t></w:r></w:p><w:p><w:r><w:t>Passwords must be rotated every 90 days.</w:t></w:r></w:p></w:body></w:document>' });
    const xlsx = writeZip({ 'xl/workbook.xml': '<workbook><sheets><sheet name="Budget" sheetId="1"/></sheets></workbook>', 'xl/sharedStrings.xml': '<sst><si><t>Item</t></si><si><t>Hosting</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>100</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>4200</v></c></row></sheetData></worksheet>' });
    const pptx = writeZip({ 'ppt/slides/slide1.xml': '<p:sld><a:t>Launch plan</a:t><a:t>Beta in January</a:t></p:sld>', 'ppt/slides/slide2.xml': '<p:sld><a:t>Risks</a:t></p:sld>' });
    const content = zlib.deflateSync(Buffer.from('BT /F1 12 Tf (Quarterly delivery report for the portal) Tj ET'));
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length ' + content.length + ' >>\nstream\n'), content, Buffer.from('\nendstream\nendobj\ntrailer\n%%EOF')]);
    const files = [
      ['policy.docx', docx, /Security Policy[\s\S]*rotated every 90 days/], ['budget.xlsx', xlsx, /Sheet: Budget[\s\S]*A2=Hosting; B2=4200/], ['deck.pptx', pptx, /Slide 1[\s\S]*Beta in January/],
      ['report.pdf', pdf, /Quarterly delivery report/], ['users.csv', Buffer.from('name,role\nAda,admin\nBob,viewer\n'), /Row 1: name=Ada; role=admin/],
      ['api.ts', Buffer.from('export function add(a: number, b: number) {\n  return a + b;\n}\n'), /export function add/], ['standup.vtt', Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nWe will ship on Friday.\n'), /ship on Friday/],
    ];
    for (const [filename, buffer, re] of files) {
      const r = await ingestAndProcess(ki, p.orchestrator, { filename, buffer, projectId: 'proj_portal' });
      assert.equal(r.status, 'available', `${filename}: ${JSON.stringify(ki.documents.getVersions(p.orchestrator, r.documentId)[0].extractionError)}`);
      assert.match(ki.documents.readContent(p.orchestrator, { documentId: r.documentId }).content, re, filename);
    }
    assert.equal(ki.documents.getVersions(p.orchestrator, ki.documents.listDocuments(p.orchestrator, {}).find((d) => d.displayName === 'report.pdf').id)[0].extractionQuality, 'best_effort');
    // safe file handling
    await assert.rejects(() => ki.documents.ingest(p.orchestrator, { filename: 'tool.exe', buffer: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]) }), /Executable/);
    await assert.rejects(() => ki.documents.ingest(p.orchestrator, { filename: 'fake.pdf', buffer: Buffer.from('this is not a pdf at all') }), /claims pdf/);
    await assert.rejects(() => ki.documents.ingest(p.orchestrator, { filename: 'zip-bomb.docx', buffer: Buffer.from('PK'.padEnd(30, 'x')) }).then((r) => ki.documents.processVersion(r.versionId)).then((r) => { if (r.status === 'failed') throw new Error('failed as expected'); }), /failed as expected/);
    assert.ok(ki.audit.list({ action: 'document.rejected' }).length >= 2);
  } finally { h.cleanup(); }
});

test('failures are visible and recoverable: OCR unavailable -> failed (retryable) -> retry; originals untouched', async () => {
  const h = makeKi(); const { ki, principals: p } = h;
  try {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
    const r = await ingestAndProcess(ki, p.orchestrator, { filename: 'whiteboard.png', buffer: png, projectId: 'proj_portal' });
    assert.equal(r.status, 'failed');
    const v = ki.documents.getVersions(p.orchestrator, r.documentId)[0];
    assert.equal(v.status, 'failed');
    assert.equal(v.extractionError.code, 'ocr_unavailable'); assert.equal(v.extractionError.retryable, true);
    const status = ki.documents.pipelineStatus(p.orchestrator);
    assert.equal(status.failed.length, 1);
    assert.equal(ki.documents.verifyStorage().ok, true, 'original still intact');
    assert.ok(ki.events.since(h.ORG, '2000-01-01', { types: ['document.failed'] }).length === 1, 'failure raised as an event');
    assert.deepEqual(ki.documents.retryFailed(p.orchestrator), { failed: 1, queued: 1 });
    // a failed new version never replaces the current one
    const ok = await ingestAndProcess(ki, p.orchestrator, { filename: 'notes.md', buffer: Buffer.from('# Notes\n\nThe release is on Friday.\n'), projectId: 'proj_portal' });
    const bad = await ki.documents.ingest(p.orchestrator, { documentId: ok.documentId, filename: 'notes.md', buffer: Buffer.from('# Notes\n\nChanged\n'), process: 'none' });
    ki.db.run(`UPDATE ki_document_versions SET status='failed' WHERE id=?`, [bad.versionId]);
    assert.equal(ki.documents.getDocument(p.orchestrator, ok.documentId).currentVersionId, ok.versionId);
    assert.equal((await ki.search.search(p.orchestrator, { query: 'release Friday' })).results[0].citation.versionId, ok.versionId);
  } finally { h.cleanup(); }
});

test('index recovery: FTS wiped or embedding model swapped, then rebuilt from authoritative rows', async () => {
  const h = makeKi(); const { ki, principals: p } = h;
  try {
    await ingestAndProcess(ki, p.orchestrator, { filename: 'spec.md', buffer: Buffer.from(SPEC_MD), projectId: 'proj_portal', category: 'technical_spec' });
    await ki.worker.drain();
    const before = await ki.search.search(p.orchestrator, { query: 'encrypted at rest', mode: 'fts' });
    assert.ok(before.results.length);
    ki.db.run('DELETE FROM ki_fts'); ki.db.run('DELETE FROM ki_embeddings');
    assert.equal((await ki.search.search(p.orchestrator, { query: 'encrypted at rest' })).results.length, 0, 'index lost');
    const rec = await ki.rebuildIndex();
    assert.ok(rec.fts > 0 && rec.embedded > 0);
    const after = await ki.search.search(p.orchestrator, { query: 'encrypted at rest' });
    assert.ok(after.results.length && after.results[0].explain.via.fts && after.results[0].explain.via.semantic);
    // provider swap with new version -> re-embed; old vectors never mixed
    const prov = new (require('../../src/knowledge/retrieval/embeddings').HashingEmbeddingProvider)({ dim: 128 }); prov.version = '2';
    const swap = await ki.setEmbeddingProvider(prov);
    assert.ok(swap.embedded > 0);
    assert.equal(ki.index.health().staleEmbeddings, 0);
    assert.ok((await ki.search.search(p.orchestrator, { query: 'encrypted at rest', mode: 'semantic' })).results.length);
  } finally { h.cleanup(); }
});
