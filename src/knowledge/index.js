'use strict';
/**
 * Organisational Knowledge & Work Intelligence Layer — composition root.
 *   const ki = createKnowledgeSystem({ baseDir });
 *   await ki.tools.invoke(principal, 'ki.documents.search', { query: '...' });
 */
const fs = require('fs');
const path = require('path');
const { KiDb } = require('./core/db');
const { applyMigrations, SCHEMA_VERSION } = require('./core/migrations');
const { Clock } = require('./core/util');
const { Audit, Events } = require('./core/audit');
const { Settings } = require('./core/settings');
const access = require('./core/access');
const { JobQueue, Worker } = require('./jobs/queue');
const { LocalFileStore } = require('./documents/storage');
const { DocumentRepository } = require('./documents/repository');
const { HashingEmbeddingProvider } = require('./retrieval/embeddings');
const { SearchIndex } = require('./retrieval/index');
const { SearchService } = require('./retrieval/search');
const { KnowledgeService } = require('./knowledge/service');
const { HeuristicKnowledgeExtractor } = require('./knowledge/extraction');
const { extractKnowledgeFromVersion } = require('./knowledge/from-documents');
const { SourceService } = require('./sources/service');
const { CommitmentService } = require('./commitments/service');
const { RuleCommitmentExtractor } = require('./commitments/extractor');
const { SqliteWorkPort, StaticWorkPort } = require('./work/port');
const { WorkIntelligence } = require('./work/intelligence');
const { Briefings } = require('./work/briefings');
const { SkillLoader } = require('./context/skills');
const { ContextAssembler } = require('./context/assembler');
const { ToolRegistry } = require('./tools/registry');

function createKnowledgeSystem(opts = {}) {
  const baseDir = opts.baseDir || path.resolve(__dirname, '../..');
  const dataDir = opts.dataDir || path.join(baseDir, 'data', 'ki');
  const clock = opts.clock || new Clock();
  const db = new KiDb(opts.dbPath || path.join(dataDir, 'knowledge.db'));
  const migration = applyMigrations(db, { clock, backupDir: path.join(path.dirname(db.file === ':memory:' ? dataDir : db.file), 'backups') });
  const audit = new Audit(db, clock);
  const events = new Events(db, clock);
  const settings = new Settings(db, clock, audit);
  const provider = opts.embeddingProvider || new HashingEmbeddingProvider();
  const index = new SearchIndex(db, clock, provider);
  const store = opts.store || new LocalFileStore(opts.storeDir || path.join(dataDir, 'objects'));
  const queue = new JobQueue(db, clock);
  let work = opts.work;
  if (!work) {
    const runtimeDb = path.join(baseDir, 'data', 'myaos.db');
    work = fs.existsSync(runtimeDb) ? new SqliteWorkPort(runtimeDb) : new StaticWorkPort();
  }
  const search = new SearchService({ db, index, settings, audit, clock });
  const documents = new DocumentRepository({ db, store, audit, events, clock, queue, index, settings });
  const knowledge = new KnowledgeService({ db, audit, events, clock, index, settings, search });
  const sources = new SourceService({ db, audit, events, clock });
  const commitments = new CommitmentService({ db, audit, events, clock, index, settings, work, sources, extractor: opts.commitmentExtractor || new RuleCommitmentExtractor({ tzOffsetMinutes: opts.tzOffsetMinutes || 0 }) });
  const intel = new WorkIntelligence({ db, clock, work, knowledge, commitments, documents, sources, settings });
  const skills = new SkillLoader(opts.skillsDir || path.join(baseDir, 'community', 'skills'));
  const context = new ContextAssembler({ db, audit, events, clock, settings, search, knowledge, commitments, work, skills, sources, notifier: opts.notifier, agentDirectory: opts.agentDirectory });
  const briefings = new Briefings({ db, clock, work, intel, knowledge, commitments, documents, audit, contextAssembler: context });
  const knowledgeExtractor = opts.knowledgeExtractor || new HeuristicKnowledgeExtractor();

  const handlers = {
    process_version: async (job) => {
      const r = await documents.processVersion(job.entity_id, { force: !!(job.payload && job.payload.force) });
      if (r && r.status === 'failed' && r.retryable) { /* visible failed state; operator retry via retryFailed() */ }
    },
    extract_knowledge: async (job) => { await extractKnowledgeFromVersion({ db, knowledge, extractor: knowledgeExtractor, audit, clock }, job.entity_id); },
    reindex: async () => { await ki.indexPending(); },
    embed: async () => { await ki.indexPending(); },
  };
  const worker = new Worker(queue, handlers, { workerId: opts.workerId });

  const ki = {
    db, clock, audit, events, settings, access, queue, worker, store, index, provider, work, search, documents, knowledge, sources, commitments, intel, skills, context, briefings,
    schemaVersion: SCHEMA_VERSION, migration,
    /** Embed anything missing/outdated (incremental). Safe to call repeatedly; used after provider swaps and outages. */
    async indexPending() {
      const items = [
        ...db.all('SELECT c.id, c.text FROM ki_chunks c JOIN ki_document_versions v ON v.id=c.version_id WHERE v.is_current=1').map((r) => ({ entityType: 'chunk', entityId: r.id, text: r.text })),
        ...db.all("SELECT id, title, content FROM ki_knowledge WHERE status NOT IN ('archived')").map((r) => ({ entityType: 'knowledge', entityId: r.id, text: `${r.title}\n${r.content}` })),
        ...db.all('SELECT id, description FROM ki_commitments').map((r) => ({ entityType: 'commitment', entityId: r.id, text: r.description })),
      ];
      return index.embedEntities(items);
    },
    /** Index recovery: rebuild FTS from authoritative rows, then re-embed. Originals and structured records are untouched. */
    async rebuildIndex() {
      index.rebuildFts(() => [
        ...db.all(`SELECT c.id, c.text, c.section_path, d.display_name FROM ki_chunks c JOIN ki_documents d ON d.id=c.document_id WHERE d.status<>'deleted'`).map((r) => ({ entityType: 'chunk', entityId: r.id, title: [r.display_name, r.section_path].filter(Boolean).join(' / '), body: r.text })),
        ...db.all("SELECT id, title, content FROM ki_knowledge WHERE status<>'archived'").map((r) => ({ entityType: 'knowledge', entityId: r.id, title: r.title, body: r.content })),
        ...db.all('SELECT id, description FROM ki_commitments').map((r) => ({ entityType: 'commitment', entityId: r.id, title: '', body: r.description })),
      ]);
      const emb = await ki.indexPending();
      audit.record({ principal: { id: 'ki-ops', type: 'system', role: 'system' }, action: 'index.rebuild', detail: emb });
      return { fts: index.health().ftsRows, ...emb };
    },
    /** Swap embedding provider and re-embed everything under the new model/version. */
    async setEmbeddingProvider(p) { index.provider = p; ki.provider = p; db.run('DELETE FROM ki_embeddings WHERE model_id=? AND model_version<>?', [p.id, p.version]); return ki.indexPending(); },
    health(principal) {
      const jobs = queue.stats();
      const pipeline = documents.pipelineStatus(principal);
      return { schemaVersion: SCHEMA_VERSION, work: work.describe ? work.describe() : { kind: 'custom' }, jobs, pipeline: pipeline.counts, failedDocuments: pipeline.failed.length,
        index: index.health(), audit: audit.verifyChain(), storage: documents.verifyStorage(), settings: settings.all() };
    },
    close() { worker.stop(); if (work.close) work.close(); db.close(); },
  };
  ki.tools = new ToolRegistry(ki);
  return ki;
}

module.exports = { createKnowledgeSystem, access, ...access };
