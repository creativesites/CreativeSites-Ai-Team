'use strict';
/**
 * Work Intelligence: an intelligence layer over authoritative records. It owns no projects,
 * tasks or agents; it queries WorkPort for those and KI tables for knowledge/commitments/documents.
 * Every returned assertion carries evidence references, so a reader can open the underlying record.
 */
const { assertCan, canRead } = require('../core/access');
const { parseJson } = require('../core/util');
const { forbidden, notFound } = require('../core/errors');
const { ACTIVE } = require('../commitments/service');

const ev = (type, id, label) => ({ type, id, label });
const DAY = 86400000;

class WorkIntelligence {
  constructor({ db, clock, work, knowledge, commitments, documents, sources, settings }) { Object.assign(this, { db, clock, work, knowledge, commitments, documents, sources, settings }); }

  _assertProject(principal, projectId) {
    if (!projectId) return;
    const ok = principal.projectIds === '*' || principal.projectIds.includes(projectId) || ['owner', 'orchestrator', 'approver'].includes(principal.role);
    if (!ok) throw forbidden(`No access to project ${projectId}`);
  }

  /** Stage of a commitment in the request->verified funnel, using LIVE task state. Never trusts an agent's "done". */
  stageOf(principal, c) {
    if (c.status === 'fulfilled') return 'verified_done';
    if (['rejected', 'cancelled', 'superseded'].includes(c.status)) return 'closed';
    if (['detected', 'needs_confirmation'].includes(c.status)) return 'requested';
    const links = this.db.all('SELECT task_id FROM ki_commitment_tasks WHERE commitment_id=?', [c.id]);
    if (!links.length) return c.status === 'accepted' ? 'accepted' : c.status === 'blocked' ? 'blocked' : (c.status === 'in_progress' ? 'in_progress' : 'assigned');
    const tasks = links.map((l) => this.work.getTask(l.task_id)).filter(Boolean);
    if (c.status === 'blocked' || tasks.some((t) => t.status === 'blocked')) return 'blocked';
    if (tasks.length && tasks.every((t) => t.status === 'done')) return 'reported_done_unverified'; // done, but the fulfilment gate has not passed
    if (tasks.some((t) => ['in_progress', 'in_review'].includes(t.status)) || c.status === 'in_progress') return 'in_progress';
    return 'assigned';
  }

  risks(principal, projectId) {
    assertCan(principal, 'briefing.read'); this._assertProject(principal, projectId);
    const now = this.clock.iso(); const risks = [];
    const cm = this.commitments.list(principal, { projectId, limit: 500 });
    for (const c of cm) {
      if (c.overdue) risks.push({ severity: 'high', kind: 'overdue_commitment', text: `Overdue: ${c.description} (due ${c.deadlineAt})`, evidence: [ev('commitment', c.id, c.description)] });
      else if (c.status === 'blocked') risks.push({ severity: 'high', kind: 'blocked_commitment', text: `Blocked: ${c.description}${c.blockedReason ? ` — ${c.blockedReason}` : ''}`, evidence: [ev('commitment', c.id, c.description)] });
      else if (c.status === 'needs_confirmation' && Date.parse(now) - Date.parse(c.capturedAt) > 2 * DAY) risks.push({ severity: 'medium', kind: 'stale_confirmation', text: `Unconfirmed for over 2 days: ${c.description}`, evidence: [ev('commitment', c.id, c.description)] });
      else if (c.deadlineAt && ACTIVE.includes(c.status) && Date.parse(c.deadlineAt) - Date.parse(now) < 2 * DAY && Date.parse(c.deadlineAt) > Date.parse(now) && !['verified_done'].includes(this.stageOf(principal, { id: c.id, status: c.status }))) {
        const st = this.stageOf(principal, { id: c.id, status: c.status });
        if (['accepted', 'requested', 'assigned'].includes(st)) risks.push({ severity: 'medium', kind: 'deadline_without_progress', text: `Due within 2 days with no work in progress (${st}): ${c.description}`, evidence: [ev('commitment', c.id, c.description)] });
      }
    }
    for (const t of this.work.listTasks({ projectId })) if (['blocked', 'failed', 'unresolved'].includes(t.status)) risks.push({ severity: t.status === 'blocked' ? 'high' : 'medium', kind: `task_${t.status}`, text: `Task ${t.id} is ${t.status}: ${t.title}`, evidence: [ev('task', t.id, t.title)] });
    for (const d of this.work.listPendingDecisions({ projectId })) risks.push({ severity: d.urgency === 'urgent' || d.urgency === 'high' ? 'high' : 'medium', kind: 'pending_human_decision', text: `Decision awaiting a human: ${d.description}`, evidence: [ev('human_decision', d.id, d.description)] });
    for (const c of this.knowledge.listConflicts(principal, { projectId })) risks.push({ severity: 'high', kind: 'knowledge_conflict', text: `Unresolved knowledge conflict: "${c.a.title}" vs "${c.b.title}"`, evidence: [ev('conflict', c.id, c.reason), ev('knowledge', c.a.id, c.a.title), ev('knowledge', c.b.id, c.b.title)] });
    for (const k of this.knowledge.reviewDue(principal, { projectId })) risks.push({ severity: 'low', kind: k.staleSource ? 'stale_source' : 'review_due', text: `${k.type} needs review (${k.staleSource ? 'its source document has a newer version' : k.expired ? 'expired' : 'review date passed'}): ${k.title}`, evidence: [ev('knowledge', k.id, k.title)] });
    const ps = this.documents.pipelineStatus(principal);
    for (const f of ps.failed) risks.push({ severity: 'medium', kind: 'document_processing_failed', text: `Document "${f.name}" v${f.versionNo} failed processing`, evidence: [ev('document', f.documentId, f.name)] });
    const rank = { high: 0, medium: 1, low: 2 };
    return risks.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }

  projectIntelligence(principal, projectId) {
    assertCan(principal, 'briefing.read'); this._assertProject(principal, projectId);
    const project = this.work.getProject(projectId);
    if (!project && this.work.listProjects().length) throw notFound('project', projectId);
    const docs = this.documents.listDocuments(principal, { projectId });
    const plans = docs.filter((d) => ['project_plan', 'architecture', 'technical_spec', 'adr', 'requirements'].includes(d.category) && d.current).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const decisions = this.knowledge.list(principal, { projectId, type: 'decision', limit: 50 }).filter((k) => ['accepted', 'verified'].includes(k.status));
    const requirements = this.knowledge.list(principal, { projectId, type: 'requirement', limit: 100 }).filter((k) => ['accepted', 'verified'].includes(k.status));
    const commitments = this.commitments.list(principal, { projectId, limit: 500 });
    const tasks = this.work.listTasks({ projectId });
    const since = new Date(this.clock.now().getTime() - 7 * DAY).toISOString();
    return {
      project: project || { id: projectId, title: projectId, unknown: true }, generatedAt: this.clock.iso(),
      objectives: project ? project.objectives : [],
      approvedRequirements: requirements.map((k) => ({ id: k.id, text: k.content, authority: k.authorityName, source: k.sourceRef, evidence: [ev('knowledge', k.id, k.title)] })),
      plans: plans.map((d) => ({ id: d.id, name: d.displayName, category: d.category, version: d.current.versionNo, evidence: [ev('document', d.id, d.displayName)] })),
      decisions: decisions.map((k) => ({ id: k.id, text: k.title, approvedBy: k.approvedBy, approvedAt: k.approvedAt, evidence: [ev('knowledge', k.id, k.title)] })),
      risks: this.risks(principal, projectId),
      outstandingCommitments: commitments.filter((c) => ['accepted', 'assigned', 'in_progress', 'blocked'].includes(c.status)).map((c) => ({ ...c, stage: this.stageOf(principal, { id: c.id, status: c.status }), evidence: [ev('commitment', c.id, c.description)] })),
      awaitingConfirmation: commitments.filter((c) => c.status === 'needs_confirmation').map((c) => ({ ...c, evidence: [ev('commitment', c.id, c.description)] })),
      activeTasks: tasks.filter((t) => ['in_progress', 'in_review', 'blocked'].includes(t.status)).map((t) => ({ id: t.id, title: t.title, status: t.status, assigneeId: t.assigneeId, evidence: [ev('task', t.id, t.title)] })),
      recentChanges: this.changes(principal, { projectId, since }).items,
      deliveryHistory: commitments.filter((c) => c.status === 'fulfilled').map((c) => ({ id: c.id, description: c.description, fulfilledAt: c.fulfilledAt, evidence: [ev('commitment', c.id, c.description)] }))
        .concat(tasks.filter((t) => t.status === 'done' && this.work.getVerification(t.id).verified).slice(0, 20).map((t) => ({ id: t.id, description: `Task verified: ${t.title}`, fulfilledAt: t.updatedAt, evidence: [ev('task', t.id, t.title)] }))),
    };
  }

  organisationIntelligence(principal) {
    assertCan(principal, 'briefing.read');
    const now = this.clock.now();
    const open = this.commitments.list(principal, { status: 'open', limit: 1000 });
    const policies = this.knowledge.list(principal, { limit: 200 }).filter((k) => ['policy', 'instruction'].includes(k.type) && ['accepted', 'verified'].includes(k.status));
    const upcoming = this.commitments.list(principal, { dueBefore: new Date(now.getTime() + 14 * DAY).toISOString(), limit: 100 });
    const crossProject = [];
    for (const t of this.work.listTasks({}).filter((x) => (x.dependencies || []).length)) {
      for (const dep of t.dependencies) { const d = this.work.getTask(dep); if (d && d.projectId && t.projectId && d.projectId !== t.projectId && d.status !== 'done') crossProject.push({ task: t.id, dependsOn: dep, from: t.projectId, to: d.projectId, evidence: [ev('task', t.id, t.title), ev('task', dep, d.title)] }); }
    }
    const people = this.sources.people(principal);
    return {
      generatedAt: now.toISOString(),
      instructionsAndPolicies: policies.map((k) => ({ id: k.id, type: k.type, text: k.title, authority: k.authorityName, evidence: [ev('knowledge', k.id, k.title)] })),
      priorities: open.filter((c) => ['urgent', 'high'].includes(c.priority)).map((c) => ({ ...c, evidence: [ev('commitment', c.id, c.description)] })),
      upcomingDeadlines: upcoming.map((c) => ({ id: c.id, description: c.description, deadlineAt: c.deadlineAt, projectId: c.projectId, evidence: [ev('commitment', c.id, c.description)] })),
      crossProjectDependencies: crossProject,
      unresolvedIssues: {
        conflicts: this.knowledge.listConflicts(principal).map((c) => ({ id: c.id, reason: c.reason, evidence: [ev('conflict', c.id, c.reason)] })),
        awaitingConfirmation: open.filter((c) => c.status === 'needs_confirmation').length,
        pendingHumanDecisions: this.work.listPendingDecisions({}).map((d) => ({ id: d.id, description: d.description, projectId: d.projectId, evidence: [ev('human_decision', d.id, d.description)] })),
      },
      responsibilities: people.slice(0, 20).map((p) => ({ id: p.id, name: p.name, owns: p.commitmentsOwned, requested: p.commitmentsRequested, projects: p.projects })),
    };
  }

  /** Change intelligence from the KI change feed (not from agent narrative). */
  changes(principal, { since, projectId, until } = {}) {
    assertCan(principal, 'briefing.read'); this._assertProject(principal, projectId);
    const from = since || new Date(this.clock.now().getTime() - 7 * DAY).toISOString();
    const rows = this.db.all(`SELECT * FROM ki_events WHERE org_id=? AND ts>? ${until ? 'AND ts<=?' : ''} ${projectId ? 'AND project_id=?' : ''} AND type NOT LIKE 'context.%' ORDER BY ts DESC LIMIT 500`,
      [principal.orgId, from, ...(until ? [until] : []), ...(projectId ? [projectId] : [])]);
    const visible = rows.filter((e) => this._eventVisible(principal, e));
    const cat = (e) => (e.type === 'knowledge.accepted' && /^(instruction|policy)/.test(e.summary) ? 'new_instructions' : e.type === 'knowledge.accepted' && /^requirement/.test(e.summary) ? 'changed_requirements'
      : e.type === 'knowledge.accepted' && /^decision/.test(e.summary) ? 'new_decisions' : e.type === 'knowledge.superseded' ? (/^requirement/.test(e.summary) ? 'changed_requirements' : /^(instruction|policy)/.test(e.summary) ? 'new_instructions' : 'superseded_knowledge')
        : e.type === 'document.superseded' ? 'superseded_documents' : e.type === 'commitment.detected' ? 'new_commitments' : e.type === 'commitment.fulfilled' ? 'completed_commitments'
          : e.type === 'commitment.overdue' ? 'overdue' : e.type === 'commitment.blocked' ? 'new_blockers' : e.type.startsWith('knowledge.conflict') ? 'conflicts' : e.type === 'document.failed' ? 'processing_failures' : 'other');
    const items = visible.map((e) => ({ id: e.id, ts: e.ts, type: e.type, category: cat(e), importance: e.importance, summary: e.summary, projectId: e.project_id, evidence: [ev('event', e.id, e.summary), e.entity_id ? ev(e.entity_type, e.entity_id, e.summary) : null].filter(Boolean) }));
    const byCategory = {};
    for (const i of items) (byCategory[i.category] = byCategory[i.category] || []).push(i);
    return { since: from, items, byCategory };
  }

  _eventVisible(principal, e) {
    try {
      if (e.entity_type === 'knowledge') return this.db.get('SELECT * FROM ki_knowledge WHERE id=?', [e.entity_id]) ? canRead(principal, this.db.get('SELECT * FROM ki_knowledge WHERE id=?', [e.entity_id])) : true;
      if (e.entity_type === 'commitment') { const c = this.db.get('SELECT * FROM ki_commitments WHERE id=?', [e.entity_id]); return c ? canRead(principal, c) : true; }
      if (e.entity_type === 'document') { const d = this.db.get('SELECT * FROM ki_documents WHERE id=?', [e.entity_id]); return d ? canRead(principal, d) : true; }
      if (e.entity_type === 'conflict') { const c = this.db.get('SELECT * FROM ki_conflicts WHERE id=?', [e.entity_id]); return c ? canRead(principal, this.db.get('SELECT * FROM ki_knowledge WHERE id=?', [c.a_id])) && canRead(principal, this.db.get('SELECT * FROM ki_knowledge WHERE id=?', [c.b_id])) : true; }
    } catch (_) { return false; }
    return true;
  }
}

module.exports = { WorkIntelligence, ev };
