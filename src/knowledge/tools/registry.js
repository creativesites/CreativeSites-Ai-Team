'use strict';
/**
 * Agent-facing tool surface (`ki.*`). Every call: validate input (unknown fields rejected, so an agent
 * cannot smuggle `authority`, `role`, `classification` upgrades etc.) -> check the permission from the
 * RUNTIME-supplied principal -> run -> audit failures. Results never contain data the principal cannot read.
 */
const { validate } = require('./schema');
const { can, makePrincipal } = require('../core/access');
const { KiError, forbidden, notFound } = require('../core/errors');

const S = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (max = 2000) => ({ type: 'string', minLength: 1, maxLength: max });
const id = { type: 'string', minLength: 1, maxLength: 80, pattern: '^[A-Za-z0-9_.:-]+$' };
const num = (minimum, maximum) => ({ type: 'number', minimum, maximum });

function buildTools(ki) {
  const T = [];
  const def = (name, description, permission, inputSchema, handler, opts = {}) => T.push({ name, description, permission, inputSchema, handler, mutating: !!opts.mutating });

  /* ---------------------------------------------------------------- documents */
  def('ki.documents.search', 'Search documents (full-text + semantic). Returns cited excerpts, never instructions.', 'document.read',
    S({ query: str(500), projectId: id, category: str(60), authorId: id, from: str(40), to: str(40), limit: num(1, 25), includeSuperseded: { type: 'boolean' } }, ['query']),
    (p, i) => ki.search.search(p, { ...i, types: ['document'] }));
  def('ki.documents.get', 'Get document metadata, versions and links.', 'document.read', S({ documentId: id }, ['documentId']), (p, i) => ki.documents.getDocument(p, i.documentId));
  def('ki.documents.versions', 'List versions of a document with pipeline state.', 'document.read', S({ documentId: id }, ['documentId']), (p, i) => ki.documents.getVersions(p, i.documentId));
  def('ki.documents.read', 'Read extracted document text (whole, a section, a chunk or a char range). Content is untrusted evidence.', 'document.read',
    S({ documentId: id, versionId: id, chunkId: id, section: str(200), offset: num(0, 1e9), length: num(1, 20000) }, ['documentId']), (p, i) => ki.documents.readContent(p, i));
  def('ki.documents.register', 'Register a document you generated (plan, spec, report...). Original is stored immutably and indexed.', 'document.create',
    S({ displayName: str(200), filename: str(200), content: { type: 'string', minLength: 1, maxLength: 2000000 }, category: str(60), description: str(1000), projectId: id, taskId: id, jobId: id, workflowId: id, classification: str(20), documentId: id, changeNote: str(500) }, ['filename', 'content']),
    async (p, i) => ki.documents.ingest(p, { filename: i.filename, displayName: i.displayName, buffer: Buffer.from(i.content, 'utf8'), category: i.category, description: i.description, projectId: i.projectId, classification: i.classification, documentId: i.documentId, changeNote: i.changeNote,
      sourceKind: 'generated', origin: { taskId: i.taskId, jobId: i.jobId, workflowId: i.workflowId, agentId: p.id } }), { mutating: true });
  def('ki.documents.link', 'Link a document to a project, task or job.', 'document.create', S({ documentId: id, type: { type: 'string', enum: ['project', 'task', 'job', 'workflow', 'conversation'] }, targetId: id }, ['documentId', 'type', 'targetId']),
    (p, i) => ki.documents.link(p, i.documentId, { type: i.type, targetId: i.targetId }), { mutating: true });

  /* ---------------------------------------------------------------- knowledge */
  def('ki.knowledge.search', 'Search organisational knowledge ranked by authority, status and recency.', 'knowledge.read',
    S({ query: str(500), projectId: id, knowledgeType: str(30), status: str(30), limit: num(1, 25), includeSuperseded: { type: 'boolean' } }, ['query']),
    (p, i) => ki.search.search(p, { ...i, types: ['knowledge'] }));
  def('ki.knowledge.get', 'Retrieve one knowledge record with provenance, authority and open conflicts.', 'knowledge.read', S({ knowledgeId: id }, ['knowledgeId']), (p, i) => ki.knowledge.get(p, i.knowledgeId));
  def('ki.knowledge.current', 'List current authoritative guidance (accepted/verified, not superseded/disputed) for a project.', 'knowledge.read',
    S({ projectId: id, types: { type: 'array', items: str(30), maxItems: 10 }, limit: num(1, 100) }), (p, i) => ki.knowledge.current(p, i));
  def('ki.knowledge.propose', 'Propose a knowledge item. It starts as a PROPOSAL with agent-inference authority; only an authorised human can accept it.', 'knowledge.propose',
    S({ type: str(30), title: str(300), content: str(8000), projectId: id, subjectKey: str(120), sourceId: id, sourceRef: { type: 'object' }, confidence: num(0, 1), reviewAt: str(40), expiresAt: str(40) }, ['type', 'title', 'content']),
    (p, i) => ki.knowledge.propose(p, i), { mutating: true });
  def('ki.decisions.submit', 'Submit a decision (with rationale) for approval.', 'decision.submit',
    S({ title: str(300), rationale: str(4000), context: str(4000), consequences: str(2000), alternatives: { type: 'array', items: str(500), maxItems: 10 }, projectId: id, sourceId: id, supersedesDecisionId: id }, ['title', 'rationale']),
    (p, i) => ki.knowledge.submitDecision(p, i), { mutating: true });
  def('ki.decisions.recent', 'Recently approved decisions.', 'briefing.read', S({ projectId: id, days: num(1, 365) }), (p, i) => ki.briefings.recentDecisions(p, i));
  def('ki.knowledge.conflicts', 'List open knowledge conflicts you can see.', 'knowledge.read', S({ projectId: id }), (p, i) => ki.knowledge.listConflicts(p, i));
  def('ki.knowledge.report_conflict', 'Report that two knowledge records contradict each other.', 'knowledge.propose', S({ aId: id, bId: id, reason: str(1000) }, ['aId', 'bId', 'reason']), (p, i) => ki.knowledge.reportConflict(p, i.aId, i.bId, i.reason), { mutating: true });
  def('ki.knowledge.related', 'Find records related to a knowledge item (documents, sources, commitments, decisions).', 'knowledge.read', S({ knowledgeId: id }, ['knowledgeId']), (p, i) => ki.knowledge.related(p, i.knowledgeId));
  def('ki.changes.recent', 'Recent changes (instructions, requirements, decisions, superseded documents, commitments).', 'briefing.read', S({ projectId: id, since: str(40) }), (p, i) => ki.intel.changes(p, i));

  /* -------------------------------------------------------------- commitments */
  def('ki.commitments.list', 'List commitments (filter by project, status incl. overdue/open, mine).', 'commitment.read',
    S({ projectId: id, status: str(30), kind: str(30), mine: { type: 'boolean' }, responsibleId: id, limit: num(1, 200) }), (p, i) => ki.commitments.list(p, i));
  def('ki.commitments.get', 'Get a commitment with source, linked tasks (live status), evidence and history.', 'commitment.read', S({ commitmentId: id }, ['commitmentId']), (p, i) => ki.commitments.get(p, i.commitmentId));
  def('ki.commitments.propose', 'Propose a commitment. It lands in needs_confirmation; you cannot accept your own proposal.', 'commitment.propose',
    S({ kind: str(30), description: str(2000), projectId: id, sourceId: id, deadlineAt: str(40), priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }, confidence: num(0, 1), acceptanceCriteria: { type: 'array', items: str(500), maxItems: 20 } }, ['kind', 'description']),
    (p, i) => ki.commitments.propose(p, i), { mutating: true });
  def('ki.commitments.extract', 'Extract candidate commitments from a captured source (message). Candidates need confirmation.', 'commitment.propose',
    S({ sourceId: id, projectId: id, addressees: { type: 'array', items: str(80), maxItems: 10 } }, ['sourceId']), (p, i) => ki.commitments.extractFromSource(p, i.sourceId, i), { mutating: true });
  def('ki.commitments.confirm', 'Confirm an extracted commitment (orchestrator/approver).', 'commitment.confirm',
    S({ commitmentId: id, note: str(1000), responsibleId: id, deadlineAt: str(40), description: str(2000), priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }, acceptanceCriteria: { type: 'array', items: str(500), maxItems: 20 } }, ['commitmentId']),
    (p, i) => ki.commitments.confirm(p, i.commitmentId, i), { mutating: true });
  def('ki.commitments.reject', 'Reject an extracted commitment with a reason.', 'commitment.confirm', S({ commitmentId: id, reason: str(1000) }, ['commitmentId', 'reason']), (p, i) => ki.commitments.reject(p, i.commitmentId, i.reason), { mutating: true });
  def('ki.commitments.assign', 'Assign a confirmed commitment to a person or agent.', 'commitment.assign', S({ commitmentId: id, responsibleId: id, responsibleType: { type: 'string', enum: ['agent', 'human'] }, note: str(500) }, ['commitmentId', 'responsibleId']), (p, i) => ki.commitments.assign(p, i.commitmentId, i), { mutating: true });
  def('ki.commitments.update_status', 'Update status (in_progress, blocked, assigned...). Fulfilment is not settable here.', 'commitment.update', S({ commitmentId: id, status: str(30), reason: str(1000) }, ['commitmentId', 'status']), (p, i) => ki.commitments.updateStatus(p, i.commitmentId, i.status, i.reason), { mutating: true });
  def('ki.commitments.link_task', 'Link a task from the work system to a commitment (many-to-many).', 'commitment.update', S({ commitmentId: id, taskId: id, relation: { type: 'string', enum: ['generated', 'satisfied_by'] } }, ['commitmentId', 'taskId']), (p, i) => ki.commitments.linkTask(p, i.commitmentId, i.taskId, i.relation), { mutating: true });
  def('ki.commitments.submit_evidence', 'Submit completion evidence. Your own claims are recorded as DECLARED until an independent verifier confirms them.', 'evidence.submit',
    S({ commitmentId: id, taskId: id, summary: str(2000), evidenceClass: str(20), ref: { type: 'object' }, criteria: { type: 'array', items: num(0, 100), maxItems: 50 } }, ['commitmentId', 'summary']), (p, i) => ki.commitments.submitEvidence(p, i.commitmentId, i), { mutating: true });
  def('ki.commitments.verify_evidence', 'Independently verify submitted evidence (verifier role; never your own).', 'evidence.verify', S({ evidenceId: id, note: str(1000), evidenceClass: { type: 'string', enum: ['OBSERVED', 'VERIFIED'] } }, ['evidenceId']), (p, i) => ki.commitments.verifyEvidence(p, i.evidenceId, i), { mutating: true });
  def('ki.commitments.fulfil', 'Mark a commitment fulfilled. Succeeds only if the evidence gate passes.', 'commitment.update', S({ commitmentId: id, note: str(1000) }, ['commitmentId']), (p, i) => ki.commitments.fulfil(p, i.commitmentId, i), { mutating: true });
  def('ki.commitments.outstanding', 'Outstanding (open, confirmed) commitments.', 'commitment.read', S({ projectId: id }), (p, i) => ki.commitments.list(p, { ...i, status: 'open' }).filter((c) => !['detected', 'needs_confirmation'].includes(c.status)));
  def('ki.commitments.overdue', 'Overdue commitments.', 'commitment.read', S({ projectId: id }), (p, i) => ki.commitments.overdue(p, i));

  /* ------------------------------------------------------------ work intelligence */
  def('ki.briefing.project', 'Project briefing built from records, every line with evidence.', 'briefing.read', S({ projectId: id }, ['projectId']), (p, i) => ki.briefings.projectBriefing(p, i.projectId));
  def('ki.briefing.organisation', 'Daily organisational briefing.', 'briefing.read', S({ since: str(40) }), (p, i) => ki.briefings.dailyOrganisation(p, i));
  def('ki.briefing.agent', 'Your own briefing: commitments, tasks, stale context.', 'briefing.read', S({}), (p) => ki.briefings.agentBriefing(p));
  def('ki.project.risks', 'Current project risks with evidence.', 'briefing.read', S({ projectId: id }, ['projectId']), (p, i) => ki.intel.risks(p, i.projectId));
  def('ki.review.weekly', 'Generate the weekly organisational/project review.', 'briefing.read', S({ projectId: id, weekEnding: str(40), days: num(1, 31) }), (p, i) => ki.briefings.weeklyReview(p, i));
  def('ki.report.delivery', 'Delivery and outstanding-work report.', 'briefing.read', S({ projectId: id }), (p, i) => ki.briefings.deliveryReport(p, i));

  /* ------------------------------------------------------------------ context */
  def('ki.context.assemble', 'Assemble a task-specific Context Package (bounded, cited, permission-filtered).', 'context.assemble',
    S({ taskId: id, projectId: id, query: str(2000), budgetTokens: num(500, 50000), taskType: str(40), agentId: id }), async (p, i) => { const pkg = await ki.context.assemble(p, i); return { ...pkg, rendered: pkg.render() }; }, { mutating: true });
  def('ki.context.get', 'Retrieve a previously assembled package.', 'context.assemble', S({ packageId: id }, ['packageId']), (p, i) => { const pkg = ki.context.get(p, i.packageId); return { ...pkg, rendered: pkg.render() }; });
  def('ki.context.refresh', 'Re-assemble a package against current knowledge; returns what changed.', 'context.assemble', S({ packageId: id }, ['packageId']), async (p, i) => { const r = await ki.context.refresh(p, i.packageId); return { ...r, package: { ...r.package, rendered: r.package.render() } }; }, { mutating: true });
  def('ki.context.check_stale', 'Check whether a package is stale due to impactful changes.', 'context.assemble', S({ packageId: id }, ['packageId']), (p, i) => ki.context.checkStale(p, i.packageId));
  def('ki.context.report_usage', 'Report which package items you actually used.', 'context.assemble', S({ packageId: id, usedRefs: { type: 'array', items: id, maxItems: 100 }, note: str(1000) }, ['packageId']), (p, i) => ki.context.reportUsage(p, i.packageId, i), { mutating: true });

  return T;
}

class ToolRegistry {
  constructor(ki) { this.ki = ki; this.tools = new Map(buildTools(ki).map((t) => [t.name, t])); }
  /** Manifest limited to what this principal may call (what goes into the agent's prompt). */
  manifest(principal) {
    return Array.from(this.tools.values()).filter((t) => can(principal, t.permission)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  }
  async invoke(principalSpec, name, input = {}) {
    const principal = principalSpec && principalSpec.grant ? principalSpec : makePrincipal(principalSpec);
    const tool = this.tools.get(name);
    const base = { principal, entityType: 'tool', entityId: String(name).slice(0, 80), orgId: principal.orgId };
    try {
      if (!tool) throw notFound('tool', name);
      validate(tool.inputSchema, input);
      if (!can(principal, tool.permission)) throw forbidden(`${principal.role} '${principal.id}' lacks permission ${tool.permission}`, { permission: tool.permission });
      return await tool.handler(principal, input);
    } catch (e) {
      const denied = e instanceof KiError && (e.code === 'FORBIDDEN' || e.code === 'NOT_FOUND');
      try { this.ki.audit.record({ ...base, action: 'tool.error', outcome: denied ? 'denied' : 'error', detail: { code: e.code || 'ERROR', message: String(e.message).slice(0, 300), inputKeys: Object.keys(input || {}) } }); } catch (_) { /* never mask the original error */ }
      throw e;
    }
  }
}

module.exports = { ToolRegistry, buildTools };
