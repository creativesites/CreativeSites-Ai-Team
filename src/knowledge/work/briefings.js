'use strict';
/**
 * Briefings and the weekly review. Generated ONLY from records (KI tables + WorkPort);
 * each line carries `evidence` references. There is no free-text model narrative here.
 * Distinguishes: requested -> accepted -> assigned -> in progress -> reported-done (unverified) -> verified done.
 */
const { assertCan, canRead } = require('../core/access');
const { newId, sha256, canonicalJson, isoWeek, toJson, parseJson } = require('../core/util');
const { ev } = require('./intelligence');

const DAY = 86400000;
const line = (text, evidence = [], extra = {}) => ({ text, evidence, ...extra });

class Briefings {
  constructor({ db, clock, work, intel, knowledge, commitments, documents, audit, contextAssembler }) { Object.assign(this, { db, clock, work, intel, knowledge, commitments, documents, audit, contextAssembler }); }

  _wrap(kind, scope, principal, sections, attention, period) {
    const body = { kind, scope, period, generatedAt: this.clock.iso(), generatedBy: principal.id, sections: sections.filter((s) => s.items.length || s.alwaysShow), attention };
    body.fingerprint = sha256(canonicalJson({ ...body, generatedAt: undefined }));
    return body;
  }
  static toMarkdown(b) {
    const out = [`# ${b.title || b.kind.replace(/_/g, ' ')}${b.scope && b.scope.id ? ` — ${b.scope.id}` : ''}`, `_Generated ${b.generatedAt}${b.period ? ` · period ${b.period.start} → ${b.period.end}` : ''} · fingerprint ${b.fingerprint.slice(0, 12)}_`, ''];
    if (b.attention && b.attention.length) { out.push('## Needs attention'); b.attention.forEach((a) => out.push(`- **${a.severity || 'info'}** ${a.text} ${a.evidence ? a.evidence.map((e) => `\`${e.type}:${e.id}\``).join(' ') : ''}`)); out.push(''); }
    for (const s of b.sections) { out.push(`## ${s.title}${s.count !== undefined ? ` (${s.count})` : ''}`); if (!s.items.length) out.push('_None._'); s.items.forEach((i) => out.push(`- ${i.text} ${i.evidence && i.evidence.length ? i.evidence.map((e) => `\`${e.type}:${e.id}\``).join(' ') : ''}`)); out.push(''); }
    return out.join('\n');
  }

  _attention(principal, projectId) {
    const a = [];
    for (const r of this.intel.risks(principal, projectId).filter((x) => x.severity === 'high')) a.push({ severity: 'high', text: r.text, evidence: r.evidence });
    const cm = this.commitments.list(principal, { projectId, status: 'needs_confirmation' });
    if (cm.length) a.push({ severity: 'medium', text: `${cm.length} commitment(s) awaiting confirmation`, evidence: cm.slice(0, 5).map((c) => ev('commitment', c.id, c.description)) });
    return a;
  }

  /* --------------------------------------------------------------- daily org */
  dailyOrganisation(principal, { since } = {}) {
    assertCan(principal, 'briefing.read');
    const from = since || new Date(this.clock.now().getTime() - DAY).toISOString();
    const org = this.intel.organisationIntelligence(principal);
    const ch = this.intel.changes(principal, { since: from });
    const sections = [
      { title: 'Changed since last briefing', items: ch.items.filter((i) => i.importance !== 'low').slice(0, 25).map((i) => line(`[${i.category}] ${i.summary}`, i.evidence)), count: ch.items.length },
      { title: 'Upcoming deadlines (14 days)', items: org.upcomingDeadlines.map((d) => line(`${d.description} — due ${d.deadlineAt}`, d.evidence)) },
      { title: 'Current priorities', items: org.priorities.slice(0, 15).map((c) => line(`[${c.priority}] ${c.description}${c.overdue ? ' (OVERDUE)' : ''}`, c.evidence)) },
      { title: 'Cross-project dependencies', items: org.crossProjectDependencies.map((d) => line(`${d.task} (${d.from}) waits on ${d.dependsOn} (${d.to})`, d.evidence)) },
      { title: 'Standing instructions and policies', items: org.instructionsAndPolicies.slice(0, 15).map((p) => line(`(${p.type}, ${p.authority}) ${p.text}`, p.evidence)) },
    ];
    return this._wrap('daily_organisation', { type: 'organisation', id: principal.orgId }, principal, sections, this._attention(principal), { start: from, end: this.clock.iso() });
  }

  projectBriefing(principal, projectId) {
    assertCan(principal, 'briefing.read');
    const p = this.intel.projectIntelligence(principal, projectId);
    const sections = [
      { title: 'Objectives', items: (p.objectives || []).map((o) => line(typeof o === 'string' ? o : JSON.stringify(o), [ev('project', projectId, p.project.title)])) },
      { title: 'Approved requirements', items: p.approvedRequirements.map((r) => line(`${r.text} (${r.authority})`, r.evidence)), count: p.approvedRequirements.length },
      { title: 'Latest plans and blueprints', items: p.plans.map((d) => line(`${d.name} (${d.category}, v${d.version})`, d.evidence)) },
      { title: 'Decisions', items: p.decisions.map((d) => line(`${d.text} — approved by ${d.approvedBy}`, d.evidence)) },
      { title: 'Risks and blockers', items: p.risks.map((r) => line(`[${r.severity}] ${r.text}`, r.evidence)), count: p.risks.length },
      { title: 'Outstanding commitments', items: p.outstandingCommitments.map((c) => line(`[${c.stage}] ${c.description}${c.deadlineAt ? ` — due ${c.deadlineAt}` : ''}${c.overdue ? ' (OVERDUE)' : ''}`, c.evidence)), count: p.outstandingCommitments.length },
      { title: 'Awaiting confirmation', items: p.awaitingConfirmation.map((c) => line(c.description, c.evidence)) },
      { title: 'Active tasks (from the work system)', items: p.activeTasks.map((t) => line(`${t.id} [${t.status}] ${t.title}${t.assigneeId ? ` — ${t.assigneeId}` : ''}`, t.evidence)) },
      { title: 'Recent changes (7 days)', items: p.recentChanges.slice(0, 15).map((c) => line(`[${c.category}] ${c.summary}`, c.evidence)) },
      { title: 'Delivery history (verified)', items: p.deliveryHistory.map((d) => line(d.description, d.evidence)) },
    ];
    const b = this._wrap('project', { type: 'project', id: projectId }, principal, sections, this._attention(principal, projectId));
    b.title = `Project briefing: ${p.project.title}`;
    return b;
  }

  agentBriefing(principal, agentId = principal.id) {
    assertCan(principal, 'briefing.read');
    if (agentId !== principal.id) assertCan(principal, 'context.assemble_for_others');
    const mine = this.commitments.list(principal, { responsibleId: agentId, limit: 300 }).filter((c) => !['fulfilled', 'rejected', 'cancelled', 'superseded'].includes(c.status));
    const tasks = this.work.listTasks({}).filter((t) => t.assigneeId === agentId && !['done'].includes(t.status));
    const stale = this.db.all(`SELECT id, task_id FROM ki_context_packages WHERE agent_id=? AND status='stale' AND org_id=?`, [agentId, principal.orgId]);
    const sections = [
      { title: 'Your commitments', items: mine.map((c) => line(`[${c.effectiveStatus}] ${c.description}${c.deadlineAt ? ` — due ${c.deadlineAt}` : ''}`, [ev('commitment', c.id, c.description)])) },
      { title: 'Your tasks (from the work system)', items: tasks.map((t) => line(`${t.id} [${t.status}] ${t.title}`, [ev('task', t.id, t.title)])) },
      { title: 'Context that may be out of date', items: stale.map((s) => line(`Context package for ${s.task_id || 'no task'} is stale — refresh before continuing`, [ev('context_package', s.id, s.id)])) },
    ];
    const att = mine.filter((c) => c.overdue).map((c) => ({ severity: 'high', text: `Overdue: ${c.description}`, evidence: [ev('commitment', c.id, c.description)] }));
    const b = this._wrap('agent', { type: 'agent', id: agentId }, principal, sections, att);
    b.title = `Agent briefing: ${agentId}`;
    return b;
  }

  /** Pre-task: the task, linked commitments, open conflicts nearby, and the package summary if one exists. */
  async preTask(principal, taskId, opts = {}) {
    assertCan(principal, 'briefing.read');
    const t = this.work.getTask(taskId);
    const links = this.commitments.commitmentsForTask(principal, taskId);
    const pkg = opts.assemble ? await this.contextAssembler.assemble(principal, { taskId, budgetTokens: opts.budgetTokens }) : null;
    const sections = [
      { title: 'Task', items: t ? [line(`${t.id} [${t.status}] ${t.title}`, [ev('task', t.id, t.title)]), ...(t.acceptanceCriteria || []).map((c, i) => line(`Acceptance ${i + 1}: ${typeof c === 'string' ? c : JSON.stringify(c)}`, [ev('task', t.id, t.title)]))] : [], alwaysShow: true },
      { title: 'Commitments this task serves', items: links.map((c) => line(`[${c.status}] ${c.description}${c.deadlineAt ? ` — due ${c.deadlineAt}` : ''}`, [ev('commitment', c.id, c.description)])) },
      { title: 'Context package', items: pkg ? [line(`${pkg.items.length} items, ~${pkg.tokenEstimate}/${pkg.budgetTokens} tokens`, [ev('context_package', pkg.id, pkg.id)]), ...pkg.warnings.map((w) => line(`Warning: ${w}`, [ev('context_package', pkg.id, pkg.id)]))] : [] },
    ];
    const b = this._wrap('pre_task', { type: 'task', id: taskId }, principal, sections, links.filter((c) => c.overdue).map((c) => ({ severity: 'high', text: `Linked commitment overdue: ${c.description}`, evidence: [ev('commitment', c.id, c.description)] })));
    b.title = `Pre-task briefing: ${taskId}`; b.packageId = pkg && pkg.id;
    return b;
  }

  /* -------------------------------------------------------------- weekly */
  /**
   * @param {object} o  { weekEnding?: ISO, days?: 7, projectId?, persist?: true }
   * Idempotent: one persisted report per (kind, scope, window).
   */
  weeklyReview(principal, o = {}) {
    assertCan(principal, 'briefing.read');
    const end = o.weekEnding ? new Date(o.weekEnding) : this.clock.now();
    const start = new Date(end.getTime() - (o.days || 7) * DAY);
    const S = start.toISOString(); const E = end.toISOString(); const pid = o.projectId || null;
    this.intel._assertProject(principal, pid);
    const scopeId = pid || principal.orgId;
    const all = this.commitments.list(principal, { projectId: pid, limit: 2000 });
    const inWin = (ts) => ts && ts > S && ts <= E;
    const detail = (c) => this.commitments.get(principal, c.id);
    const stageOf = (c) => this.intel.stageOf(principal, { id: c.id, status: c.status });

    const requestsReceived = this.db.all(`SELECT * FROM ki_sources WHERE org_id=? AND captured_at>? AND captured_at<=? ${pid ? 'AND project_id=?' : ''} AND kind IN ('message','user_instruction','conversation') ORDER BY captured_at`, [principal.orgId, S, E, ...(pid ? [pid] : [])])
      .filter((s) => canRead(principal, s));
    const created = all.filter((c) => inWin(c.createdAt));
    const completed = all.filter((c) => c.status === 'fulfilled' && inWin(c.fulfilledAt));
    const outstanding = all.filter((c) => ['accepted', 'assigned', 'in_progress'].includes(c.status) && !c.overdue);
    const overdue = all.filter((c) => c.overdue);
    const blocked = all.filter((c) => c.status === 'blocked');
    const awaiting = all.filter((c) => c.status === 'needs_confirmation');
    const reportedDone = all.filter((c) => ACTIVE_STAGE(stageOf(c)) === 'reported_done_unverified');
    const decisions = this.knowledge.listDecisions(principal, { projectId: pid }).filter((d) => d.status === 'approved' && inWin(d.decided_at));
    const evs = this.intel.changes(principal, { since: S, until: E, projectId: pid });
    const reqChanges = (evs.byCategory.changed_requirements || []);
    const newKnowledge = this.knowledge.list(principal, { projectId: pid, includeInactive: true, limit: 1000 }).filter((k) => inWin(k.capturedAt));
    const funnel = { requested: 0, accepted: 0, assigned: 0, in_progress: 0, reported_done_unverified: 0, verified_done: 0, blocked: 0 };
    for (const c of all) { if (inWin(c.createdAt) || ['accepted', 'assigned', 'in_progress', 'blocked', 'needs_confirmation'].includes(c.status) || inWin(c.fulfilledAt)) { const st = stageOf(c); if (funnel[st] !== undefined) funnel[st]++; } }
    const attention = this._attention(principal, pid);
    if (reportedDone.length) attention.push({ severity: 'medium', text: `${reportedDone.length} commitment(s) have all tasks reported done but are NOT verified — not counted as delivered`, evidence: reportedDone.slice(0, 5).map((c) => ev('commitment', c.id, c.description)) });

    const cl = (c, extra = '') => line(`${c.description}${c.deadlineAt ? ` — due ${c.deadlineAt}` : ''}${extra}`, [ev('commitment', c.id, c.description), ...(c.sourceId ? [ev('source', c.sourceId, 'original request')] : [])]);
    const sections = [
      { title: '1. Requests and instructions received', items: requestsReceived.map((s) => line(`${s.platform}${s.channel ? '/' + s.channel : ''} from ${s.author_name || s.author_id || 'unknown'}: "${String(s.text).slice(0, 140)}"`, [ev('source', s.id, 'captured message')])), count: requestsReceived.length },
      { title: '2. Commitments created', items: created.map((c) => cl(c, ` [${c.status}]`)), count: created.length },
      { title: '3. Completed — verified', items: completed.map((c) => { const d = detail(c); const v = d.evidence.filter((e) => e.independentlyVerified); return line(`${c.description} — verified by ${v.map((e) => e.verifiedBy).join(', ') || 'work system'}`, [ev('commitment', c.id, c.description), ...v.map((e) => ev('evidence', e.id, e.summary))]); }), count: completed.length },
      { title: '3b. Reported done, not yet verified (NOT counted as completed)', items: reportedDone.map((c) => cl(c)), count: reportedDone.length },
      { title: '4. Outstanding (accepted / assigned / in progress)', items: outstanding.map((c) => cl(c, ` [${stageOf(c)}]`)), count: outstanding.length },
      { title: '5. Overdue', items: overdue.map((c) => cl(c, ` [${stageOf(c)}]`)), count: overdue.length },
      { title: '6. Blocked', items: blocked.map((c) => cl(c, c.blockedReason ? ` — ${c.blockedReason}` : '')), count: blocked.length },
      { title: '7. Decisions made', items: decisions.map((d) => line(`${d.title} — decided by ${d.decided_by}: ${d.decision_note || d.rationale}`, [ev('decision', d.id, d.title), ev('knowledge', d.knowledge_id, d.title)])), count: decisions.length },
      { title: '8. Requirements changed', items: reqChanges.map((e) => line(e.summary, e.evidence)), count: reqChanges.length },
      { title: '9. New knowledge captured', items: newKnowledge.map((k) => line(`[${k.type}/${k.status}] ${k.title}`, [ev('knowledge', k.id, k.title)])), count: newKnowledge.length },
      { title: 'Awaiting confirmation', items: awaiting.map((c) => cl(c, ` (confidence ${c.confidence})`)), count: awaiting.length },
    ];
    const b = this._wrap('weekly_review', { type: pid ? 'project' : 'organisation', id: scopeId }, principal, sections.map((s) => ({ ...s, alwaysShow: true })), attention, { start: S, end: E, isoWeek: isoWeek(end) });
    b.title = `Weekly review ${isoWeek(end)}`;
    b.funnel = funnel;
    b.funnelNote = 'requested → accepted → assigned → in progress → reported done (unverified) → verified done. Only verified_done counts as delivered.';
    if (o.persist !== false) {
      const existing = this.db.get('SELECT id, body_json FROM ki_reports WHERE kind=? AND scope_type=? AND scope_id=? AND period_start=? AND period_end=?', ['weekly_review', b.scope.type, scopeId, S, E]);
      if (existing) return { ...parseJson(existing.body_json, b), reportId: existing.id, reused: true };
      const id = newId('rpt');
      this.db.run('INSERT INTO ki_reports(id,kind,scope_type,scope_id,org_id,period_start,period_end,generated_at,generated_by,body_json,fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [id, 'weekly_review', b.scope.type, scopeId, principal.orgId, S, E, b.generatedAt, principal.id, toJson(b), b.fingerprint]);
      this.audit.record({ principal, action: 'report.weekly_review', entityType: 'report', entityId: id, orgId: principal.orgId, projectId: pid, detail: { start: S, end: E, fingerprint: b.fingerprint } });
      b.reportId = id;
    }
    return b;
  }

  /** What we promised vs what is verifiably delivered vs what remains. */
  deliveryReport(principal, { projectId } = {}) {
    assertCan(principal, 'briefing.read');
    const all = this.commitments.list(principal, { projectId, limit: 2000 }).filter((c) => !['rejected', 'cancelled', 'superseded', 'detected'].includes(c.status));
    const promised = all.filter((c) => c.confirmation === 'confirmed');
    const delivered = promised.filter((c) => c.status === 'fulfilled');
    const remaining = promised.filter((c) => c.status !== 'fulfilled');
    const sections = [
      { title: 'Promised (confirmed commitments)', items: promised.map((c) => line(`[${c.status}] ${c.description}`, [ev('commitment', c.id, c.description)])), count: promised.length },
      { title: 'Delivered (verified)', items: delivered.map((c) => line(c.description, [ev('commitment', c.id, c.description)])), count: delivered.length },
      { title: 'Outstanding', items: remaining.map((c) => line(`[${this.intel.stageOf(principal, { id: c.id, status: c.status })}] ${c.description}${c.overdue ? ' (OVERDUE)' : ''}`, [ev('commitment', c.id, c.description)])), count: remaining.length },
      { title: 'Awaiting confirmation (not yet promised)', items: all.filter((c) => c.status === 'needs_confirmation').map((c) => line(c.description, [ev('commitment', c.id, c.description)])) },
    ];
    const b = this._wrap('delivery_report', { type: projectId ? 'project' : 'organisation', id: projectId || principal.orgId }, principal, sections.map((s) => ({ ...s, alwaysShow: true })), this._attention(principal, projectId));
    b.title = 'Delivery and outstanding work';
    b.totals = { promised: promised.length, delivered: delivered.length, outstanding: remaining.length, deliveredPct: promised.length ? Math.round((delivered.length / promised.length) * 100) : null };
    return b;
  }

  recentDecisions(principal, { projectId, days = 30 } = {}) {
    assertCan(principal, 'briefing.read');
    const since = new Date(this.clock.now().getTime() - days * DAY).toISOString();
    return this.knowledge.listDecisions(principal, { projectId, status: 'approved' }).filter((d) => d.decided_at > since);
  }
}
const ACTIVE_STAGE = (s) => s;

module.exports = { Briefings };
