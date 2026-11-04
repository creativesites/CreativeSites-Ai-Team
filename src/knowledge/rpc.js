'use strict';
/**
 * JSON RPC surface used by the desktop (via a Tauri command that spawns bin/ki-rpc.js) and the CLI.
 * It calls the SAME services agents use; there is no second implementation of any rule.
 * The acting principal is configured by the host (env), never taken from the request body.
 */
const { makePrincipal } = require('./core/access');
const { invalid, notFound } = require('./core/errors');
const { Briefings } = require('./work/briefings');
const { captureSlackMessage } = require('./sources/adapters');

function hostPrincipal(env = process.env) {
  return makePrincipal({ id: env.KI_USER || 'winston', type: 'human', role: env.KI_ROLE || 'owner', orgId: env.KI_ORG || 'creativesites', projectIds: '*' });
}

const M = {
  /* overview & health */
  'overview': async (ki, p) => {
    const org = ki.briefings.dailyOrganisation(p);
    const intel = ki.intel.organisationIntelligence(p);
    return {
      attention: org.attention, changes: org.sections.find((s) => s.title.startsWith('Changed'))?.items || [],
      awaitingConfirmation: ki.commitments.awaitingConfirmation(p).slice(0, 20), overdue: ki.commitments.overdue(p).slice(0, 20),
      upcoming: intel.upcomingDeadlines, recentDecisions: ki.briefings.recentDecisions(p, { days: 14 }).slice(0, 10),
      conflicts: ki.knowledge.listConflicts(p).slice(0, 20), proposedKnowledge: ki.knowledge.list(p, { status: 'proposed', limit: 20 }),
      documents: ki.documents.pipelineStatus(p), risks: ki.intel.risks(p).slice(0, 15), counts: counts(ki, p),
    };
  },
  'health': async (ki, p) => ki.health(p),
  'settings.get': async (ki) => ki.settings.all(),
  'settings.set': async (ki, p, a) => ki.settings.set(p, a.key, a.value),
  'search': async (ki, p, a) => ki.search.search(p, { includeFlagged: true, ...a }),
  'work.projects': async (ki) => ki.work.listProjects(),
  'work.tasks': async (ki, p, a) => ki.work.listTasks({ projectId: a.projectId }),
  'worker.drain': async (ki) => ki.worker.drain(200),
  'index.rebuild': async (ki) => ki.rebuildIndex(),
  /* documents */
  'documents.list': async (ki, p, a) => ki.documents.listDocuments(p, a),
  'documents.get': async (ki, p, a) => ki.documents.getDocument(p, a.documentId),
  'documents.read': async (ki, p, a) => ki.documents.readContent(p, a),
  'documents.chunks': async (ki, p, a) => { ki.documents.getDocument(p, a.documentId); return ki.db.all('SELECT id, ordinal, section_path, char_start, char_end, injection_score, has_secret, substr(text,1,400) AS preview FROM ki_chunks WHERE version_id=? ORDER BY ordinal', [a.versionId]); },
  'documents.upload': async (ki, p, a) => {
    if (!a.filename || !a.base64) throw invalid('filename and base64 are required');
    const r = await ki.documents.ingest(p, { filename: a.filename, buffer: Buffer.from(a.base64, 'base64'), projectId: a.projectId, category: a.category, classification: a.classification, displayName: a.displayName, description: a.description, documentId: a.documentId, changeNote: a.changeNote, process: 'inline' });
    await ki.worker.drain(50);
    return r;
  },
  'documents.archive': async (ki, p, a) => ki.documents.archive(p, a.documentId, a.reason),
  'documents.restore': async (ki, p, a) => ki.documents.restore(p, a.documentId),
  'documents.retry': async (ki, p) => { const r = ki.documents.retryFailed(p); await ki.worker.drain(100); return r; },
  'documents.reprocess': async (ki, p, a) => { const r = await ki.documents.reprocess(p, a.versionId); await ki.worker.drain(10); return r; },
  'documents.setAccess': async (ki, p, a) => ki.documents.setAccess(p, a.documentId, a),
  'documents.relations': async (ki, p, a) => {
    const d = ki.documents.getDocument(p, a.documentId);
    return { links: d.links, knowledge: ki.knowledge.list(p, { includeInactive: true, limit: 500 }).filter((k) => k.sourceRef && k.sourceRef.documentId === a.documentId).map((k) => ({ id: k.id, type: k.type, title: k.title, status: k.status })) };
  },
  /* knowledge */
  'knowledge.list': async (ki, p, a) => ki.knowledge.list(p, a),
  'knowledge.get': async (ki, p, a) => ({ record: ki.knowledge.get(p, a.knowledgeId), related: ki.knowledge.related(p, a.knowledgeId) }),
  'knowledge.propose': async (ki, p, a) => ki.knowledge.propose(p, a),
  'knowledge.accept': async (ki, p, a) => ki.knowledge.accept(p, a.knowledgeId, a),
  'knowledge.reject': async (ki, p, a) => ki.knowledge.reject(p, a.knowledgeId, a.reason),
  'knowledge.verify': async (ki, p, a) => ki.knowledge.verify(p, a.knowledgeId, a),
  'knowledge.conflicts': async (ki, p, a) => ki.knowledge.listConflicts(p, a),
  'knowledge.resolve': async (ki, p, a) => ki.knowledge.resolveConflict(p, a.conflictId, a),
  'decisions.list': async (ki, p, a) => ki.knowledge.listDecisions(p, a),
  'decisions.decide': async (ki, p, a) => ki.knowledge.decide(p, a.decisionId, a),
  /* commitments */
  'commitments.list': async (ki, p, a) => ki.commitments.list(p, a),
  'commitments.get': async (ki, p, a) => ki.commitments.get(p, a.commitmentId),
  'commitments.confirm': async (ki, p, a) => ki.commitments.confirm(p, a.commitmentId, a),
  'commitments.reject': async (ki, p, a) => ki.commitments.reject(p, a.commitmentId, a.reason),
  'commitments.assign': async (ki, p, a) => ki.commitments.assign(p, a.commitmentId, a),
  'commitments.status': async (ki, p, a) => ki.commitments.updateStatus(p, a.commitmentId, a.status, a.reason),
  'commitments.linkTask': async (ki, p, a) => ki.commitments.linkTask(p, a.commitmentId, a.taskId, a.relation),
  'commitments.fulfil': async (ki, p, a) => ki.commitments.fulfil(p, a.commitmentId, a),
  'commitments.evidence': async (ki, p, a) => ki.commitments.submitEvidence(p, a.commitmentId, a),
  'commitments.verifyEvidence': async (ki, p, a) => ki.commitments.verifyEvidence(p, a.evidenceId, a),
  'commitments.propose': async (ki, p, a) => ki.commitments.propose(p, a),
  'capture.message': async (ki, p, a) => {
    if (!a.text) throw invalid('text is required');
    const cap = a.slack ? captureSlackMessage(ki, p, a.slack, a.scope) : ki.sources.capture(p, { kind: a.kind || 'message', platform: a.platform || 'manual', channel: a.channel, messageId: a.messageId, authorId: a.authorId, authorName: a.authorName, originalTs: a.originalTs || new Date().toISOString(), text: a.text, projectId: a.projectId });
    const ex = a.extract === false ? null : await ki.commitments.extractFromSource(p, cap.id, { projectId: a.projectId });
    return { source: cap, extraction: ex };
  },
  /* sources & people */
  'sources.list': async (ki, p, a) => ki.sources.list(p, a),
  'sources.get': async (ki, p, a) => ki.sources.get(p, a.sourceId),
  'people': async (ki, p, a) => ({ people: ki.sources.people(p, a), platforms: ki.sources.connectedPlatforms(p) }),
  /* intelligence */
  'project.intelligence': async (ki, p, a) => ki.intel.projectIntelligence(p, a.projectId),
  'briefing.project': async (ki, p, a) => ki.briefings.projectBriefing(p, a.projectId),
  'briefing.organisation': async (ki, p, a) => ki.briefings.dailyOrganisation(p, a),
  'review.weekly': async (ki, p, a) => { const b = ki.briefings.weeklyReview(p, a); return { ...b, markdown: Briefings.toMarkdown(b) }; },
  'report.delivery': async (ki, p, a) => ki.briefings.deliveryReport(p, a),
  'changes': async (ki, p, a) => ki.intel.changes(p, a),
  'context.assemble': async (ki, p, a) => { const pkg = await ki.context.assemble(p, a); return { ...pkg, rendered: pkg.render() }; },
  'context.check': async (ki, p, a) => ki.context.checkStale(p, a.packageId),
  'audit.list': async (ki, p, a) => { if (!['owner', 'approver'].includes(p.role)) throw notFound('audit', 'all'); return ki.audit.list(a); },
};

function counts(ki, p) {
  const c = (sql, params = []) => ki.db.get(sql, [p.orgId, ...params]).n;
  return {
    documents: c("SELECT COUNT(*) n FROM ki_documents WHERE org_id=? AND status='active'"),
    knowledge: c("SELECT COUNT(*) n FROM ki_knowledge WHERE org_id=? AND status IN ('accepted','verified')"),
    proposedKnowledge: c("SELECT COUNT(*) n FROM ki_knowledge WHERE org_id=? AND status='proposed'"),
    commitmentsOpen: c("SELECT COUNT(*) n FROM ki_commitments WHERE org_id=? AND status IN ('accepted','assigned','in_progress','blocked')"),
    awaitingConfirmation: c("SELECT COUNT(*) n FROM ki_commitments WHERE org_id=? AND status='needs_confirmation'"),
    fulfilled: c("SELECT COUNT(*) n FROM ki_commitments WHERE org_id=? AND status='fulfilled'"),
    openConflicts: c("SELECT COUNT(*) n FROM ki_conflicts WHERE org_id=? AND status='open'"),
    sources: c('SELECT COUNT(*) n FROM ki_sources WHERE org_id=?'),
  };
}

async function handle(ki, request, env = process.env) {
  const p = hostPrincipal(env);
  const fn = M[request.method];
  if (!fn) throw notFound('method', request.method);
  return fn(ki, p, request.params || {});
}

const safe = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? Number(x) : x)));
module.exports = { handle, hostPrincipal, methods: Object.keys(M), safe };
