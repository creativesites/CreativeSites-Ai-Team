'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeKi, SPEC_MD } = require('./helpers');
const { KiDb } = require('../../src/knowledge/core/db');
const mig = require('../../src/knowledge/core/migrations');
const { Clock } = require('../../src/knowledge/core/util');
const { JobQueue, Worker } = require('../../src/knowledge/jobs/queue');
const { createKnowledgeSystem } = require('../../src/knowledge');
const { SqliteWorkPort, JsonTaskWorkPort } = require('../../src/knowledge/work/port');
const { makePrincipal } = require('../../src/knowledge/core/access');

const tmp = () => fs.mkdtempSync(path.join(process.env.KI_TEST_TMP || os.tmpdir(), 'ki-eng-'));

test('migrations: idempotent, additive, checksum-protected, backed up before upgrade', () => {
  const dir = tmp(); const file = path.join(dir, 'k.db');
  try {
    const db = new KiDb(file); const clock = new Clock();
    const first = mig.applyMigrations(db, { clock, backupDir: path.join(dir, 'bak') });
    assert.deepEqual(first.applied, [1]); assert.equal(first.backup, null, 'fresh DB: nothing to back up');
    assert.deepEqual(mig.applyMigrations(db, { clock }).applied, [], 're-running is a no-op');
    db.run("INSERT INTO ki_settings(key,value_json,updated_by,updated_at) VALUES ('keep','1','t','now')");
    // a future additive migration: backup is taken first and existing rows survive
    mig.MIGRATIONS.push({ version: 2, name: 'test_additive', sql: 'ALTER TABLE ki_events ADD COLUMN test_col TEXT; CREATE INDEX idx_ki_test ON ki_events(test_col);' });
    try {
      const r = mig.applyMigrations(db, { clock, backupDir: path.join(dir, 'bak') });
      assert.deepEqual(r.applied, [2]); assert.ok(r.backup && fs.existsSync(r.backup));
      const bak = new KiDb(r.backup, { readonly: true });
      assert.equal(bak.get("SELECT value_json v FROM ki_settings WHERE key='keep'").v, '1'); assert.equal(bak.all("SELECT * FROM ki_schema_migrations").length, 1, 'backup is the pre-upgrade state'); bak.close();
      assert.equal(db.get("SELECT value_json v FROM ki_settings WHERE key='keep'").v, '1');
      // editing an applied migration is refused
      mig.MIGRATIONS[1].sql += ' -- edited';
      assert.throws(() => mig.applyMigrations(db, { clock }), /modified after being applied/);
    } finally { mig.MIGRATIONS.pop(); }
    // reopening the same file via the composition root keeps data
    db.close();
    const ki = createKnowledgeSystem({ baseDir: dir, dataDir: dir, dbPath: file, work: new (require('../../src/knowledge/work/port').StaticWorkPort)() });
    assert.equal(ki.db.get("SELECT value_json v FROM ki_settings WHERE key='keep'").v, '1'); ki.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('constraints: immutable versions, unique lineage, CHECK constraints and foreign keys hold', async () => {
  const h = makeKi(); const { ki, principals: p } = h;
  try {
    const r = await ki.documents.ingest(p.orchestrator, { filename: 'a.md', buffer: Buffer.from('# A\n\nsome text here\n'), process: 'inline' });
    assert.throws(() => ki.db.run("UPDATE ki_document_versions SET content_hash='x' WHERE id=?", [r.versionId]), /immutable/);
    assert.throws(() => ki.db.run("UPDATE ki_document_versions SET storage_key='x' WHERE id=?", [r.versionId]), /immutable/);
    assert.throws(() => ki.db.run("INSERT INTO ki_knowledge(id,type,title,content,org_id,author_id,author_type,captured_at,content_hash,created_at,updated_at,authority) VALUES ('k','fact','t','c','o','a','h','n','h','n','n',9)"), /CHECK/);
    assert.throws(() => ki.db.run("INSERT INTO ki_commitment_tasks(commitment_id,task_id,linked_by,linked_at) VALUES ('nope','t','a','n')"), /FOREIGN KEY/);
    assert.throws(() => ki.db.run("INSERT INTO ki_commitments(id,kind,description,org_id,captured_at,created_by,created_at,updated_at,status) VALUES ('c','request','d','o','n','a','n','n','done')"), /CHECK/);
  } finally { h.cleanup(); }
});

test('jobs: idempotent enqueue, retry with backoff, dead-lettering, lease recovery after a crash', async () => {
  const h = makeKi(); const { ki } = h;
  try {
    const q = new JobQueue(ki.db, ki.clock);
    const a = q.enqueue('reindex', 'x', '1'); const b = q.enqueue('reindex', 'x', '1');
    assert.equal(a.id, b.id); assert.equal(b.created, false);
    let calls = 0;
    const w = new Worker(q, { reindex: async () => { calls++; if (calls < 3) { const e = new Error('transient'); throw e; } } }, { workerId: 'w1' });
    assert.equal((await w.runOnce()).ok, false);
    assert.equal(await w.runOnce(), null, 'backoff: not runnable immediately');
    h.advance(5000); assert.equal((await w.runOnce()).ok, false);
    h.advance(5000); assert.equal((await w.runOnce()).ok, true);
    assert.equal(q.stats().done, 1); assert.equal(calls, 3);
    // non-retryable errors and attempt exhaustion are visible as failed, and can be retried by an operator
    const w2 = new Worker(q, { embed: async () => { const e = new Error('boom'); e.retryable = false; throw e; } });
    const j = q.enqueue('embed', 'x', '2'); assert.equal((await w2.runOnce()).dead, true);
    assert.equal(q.list({ status: 'failed' }).length, 1); assert.equal(q.retry(j.id), true); assert.equal(q.stats().queued, 1);
    // crashed worker: claimed, never completed; after the lease it is re-claimed by another worker
    const c = q.enqueue('reindex', 'x', '3'); const claimed = q.claim('crashy', { leaseMs: 1000, types: ['reindex'] });
    assert.equal(claimed.id, c.id); assert.equal(q.claim('w2', { types: ['reindex'] }), null, 'a leased job is not handed out twice');
    h.advance(2000); const re = q.claim('rescuer', { types: ['reindex'] });
    assert.equal(re.id, c.id); assert.equal(re.attempts, 2);
  } finally { h.cleanup(); }
});

test('concurrent processing: two processes/workers share one database; every version is processed exactly once', async () => {
  const dir = tmp(); const file = path.join(dir, 'ki', 'knowledge.db');
  const mk = () => createKnowledgeSystem({ baseDir: dir, dataDir: path.join(dir, 'ki'), dbPath: file, work: new (require('../../src/knowledge/work/port').StaticWorkPort)() });
  const a = mk(); const b = mk();
  try {
    const p = makePrincipal({ id: 'orch', role: 'orchestrator', orgId: 'org1', projectIds: '*' });
    for (let i = 0; i < 24; i++) await a.documents.ingest(p, { filename: `doc${i}.md`, buffer: Buffer.from(`# Doc ${i}\n\nThis is document number ${i} about topic ${i % 5}.\n`), category: 'general' });
    const [ra, rb] = await Promise.all([a.worker.drain(), b.worker.drain()]);
    const done = [...ra, ...rb].filter((r) => r.type === 'process_version');
    assert.equal(done.length, 24, 'each version processed once across both workers');
    assert.ok(done.every((r) => r.ok));
    assert.equal(a.db.get("SELECT COUNT(*) n FROM ki_document_versions WHERE status='available'").n, 24);
    assert.equal(a.db.get('SELECT MAX(attempts) m FROM ki_jobs').m, 1);
    assert.equal(a.db.get('SELECT COUNT(*) n FROM ki_chunks').n, a.db.get('SELECT COUNT(DISTINCT id) n FROM ki_chunks').n);
    assert.ok(done.length === 24 && ra.length > 0 && rb.length > 0, 'both workers actually participated');
    // processing is idempotent: re-processing the same version does not duplicate chunks
    const v = a.db.get('SELECT id FROM ki_document_versions LIMIT 1').id;
    const before = a.db.get('SELECT COUNT(*) n FROM ki_chunks WHERE version_id=?', [v]).n;
    await a.documents.processVersion(v, { force: true });
    assert.equal(a.db.get('SELECT COUNT(*) n FROM ki_chunks WHERE version_id=?', [v]).n, before);
    assert.equal(a.db.get("SELECT COUNT(*) n FROM ki_fts WHERE entity_type='chunk'").n, a.db.get('SELECT COUNT(*) n FROM ki_chunks').n, 'FTS stays in lock-step with chunks');
  } finally { a.close(); b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('background loop: ingestion returns immediately; the worker indexes without blocking the caller', async () => {
  const h = makeKi(); const { ki, principals: p } = h;
  try {
    const r = await ki.documents.ingest(p.orchestrator, { filename: 'bg.md', buffer: Buffer.from('# BG\n\nBackground processing works fine.\n') });
    assert.equal(r.status, 'stored');
    assert.equal(ki.documents.getVersions(p.orchestrator, r.documentId)[0].status, 'stored');
    ki.worker.start(20);
    for (let i = 0; i < 100 && ki.documents.getVersions(p.orchestrator, r.documentId)[0].status !== 'available'; i++) await new Promise((res) => setTimeout(res, 20));
    ki.worker.stop();
    assert.equal(ki.documents.getVersions(p.orchestrator, r.documentId)[0].status, 'available');
  } finally { h.cleanup(); }
});

test('search relevance: ranking prefers authoritative, current, on-topic records (fixed corpus)', async () => {
  const h = makeKi(); const { ki, principals: p } = h;
  try {
    const mk = async (type, title, content, accept) => { const k = await ki.knowledge.propose(p.planner, { type, title, content, projectId: 'proj_portal' }); if (accept) ki.knowledge.accept(p.approver, k.id, { authority: accept }); return k.id; };
    const ids = {
      pwd: await mk('policy', 'Password rotation', 'Employee passwords must be rotated every 90 days.', 'approved'),
      pwdIdea: await mk('hypothesis', 'Password idea', 'We might consider longer passwords someday.', null),
      db: await mk('decision', 'Primary database', 'We decided to use PostgreSQL as the primary datastore.', 'approved'),
      ui: await mk('preference', 'UI framework', 'The team prefers React for the web interface.', 'documented'),
      lunch: await mk('reference', 'Lunch', 'Pizza on Friday for the whole team.', 'documented'),
    };
    const top = async (query, n = 1) => (await ki.search.search(p.orchestrator, { query, types: ['knowledge'], limit: n })).results.map((r) => r.id);
    assert.deepEqual(await top('how often do passwords have to change'), [ids.pwd], 'approved policy outranks speculative idea');
    assert.deepEqual(await top('which database do we use'), [ids.db]);
    assert.deepEqual(await top('web frontend framework'), [ids.ui]);
    assert.deepEqual(await top('PostgreSQL'), [ids.db], 'exact term via FTS');
    assert.equal((await ki.search.search(p.orchestrator, { query: 'zxqv nonsense quantum', types: ['knowledge'] })).results.length, 0, 'no match, no results');
    const r = (await ki.search.search(p.orchestrator, { query: 'password rotation days', types: ['knowledge'] })).results;
    assert.ok(r.every((x) => x.explain && x.citation), 'results expose explanation and citations');
  } finally { h.cleanup(); }
});

test('real runtime smoke: KI reads the repository\'s actual data/myaos.db through the WorkPort (read-only) without owning any of it', async () => {
  const real = path.resolve(__dirname, '../../data/myaos.db');
  if (!fs.existsSync(real)) return;
  const dir = tmp();
  try {
    const before = fs.statSync(real).mtimeMs;
    const work = new SqliteWorkPort(real);
    const ki = createKnowledgeSystem({ baseDir: dir, dataDir: path.join(dir, 'ki'), work });
    const owner = makePrincipal({ id: 'winston', type: 'human', role: 'owner', orgId: 'creativesites', projectIds: '*' });
    const projects = work.listProjects(); assert.ok(projects.length >= 1);
    const busy = projects.find((pr) => work.listTasks({ projectId: pr.id }).some((t) => ['in_progress', 'in_review'].includes(t.status))) || projects[0];
    const brief = ki.briefings.projectBriefing(owner, busy.id);
    assert.equal(brief.kind, 'project'); assert.ok(brief.sections.some((s) => s.title.startsWith('Active tasks')), 'live task state from the runtime DB appears in the briefing');
    const done = work.listTasks().filter((t) => t.status === 'done');
    for (const t of done) { const v = work.getVerification(t.id); assert.equal(typeof v.verified, 'boolean'); assert.ok(v.reason); }
    const task = work.listTasks({ projectId: busy.id })[0];
    const pkg = await ki.context.assemble(owner, { taskId: task.id });
    assert.equal(pkg.items[0].type, 'constraint'); assert.ok(pkg.items.some((i) => i.refId === task.id));
    assert.equal(fs.statSync(real).mtimeMs, before, 'runtime DB untouched');
    assert.throws(() => work.db.run('UPDATE tasks SET title=title'), /readonly/i);
    // the JSON task store of the Node runtime is a separate port, never merged
    const jp = new JsonTaskWorkPort(path.resolve(__dirname, '../../community/tasks.json'));
    assert.ok(Array.isArray(jp.listTasks()));
    ki.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
