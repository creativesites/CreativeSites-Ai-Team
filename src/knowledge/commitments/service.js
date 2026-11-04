'use strict';
/**
 * Commitments & Actions Register.
 * A commitment is an EXPECTATION/OBLIGATION; a task is an executable unit of work.
 * They are linked many-to-many and never merged. Tasks are read live through WorkPort.
 *
 * Fulfilment is evidence-gated: a commitment becomes `fulfilled` only when every linked task is
 * verified by the work system (independent, observed evidence) and/or independent verified evidence
 * covers the acceptance criteria. An agent saying "done" never fulfils anything.
 */
const { newId, toJson, parseJson } = require('../core/util');
const { assertCan, assertWriteScope, checkRead, canRead, can, rank } = require('../core/access');
const { invalid, notFound, forbidden, illegalState } = require('../core/errors');

const KINDS = ['request', 'instruction', 'action_item', 'promise', 'agreement', 'deliverable', 'question', 'deadline', 'follow_up', 'dependency', 'blocker', 'feedback', 'decision_needed'];
const OPEN = ['detected', 'needs_confirmation', 'accepted', 'assigned', 'in_progress', 'blocked'];
const ACTIVE = ['accepted', 'assigned', 'in_progress', 'blocked'];
const TRANSITIONS = {
  detected: ['needs_confirmation', 'rejected', 'cancelled'],
  needs_confirmation: ['accepted', 'rejected', 'cancelled', 'superseded'],
  accepted: ['assigned', 'in_progress', 'blocked', 'fulfilled', 'cancelled', 'superseded'],
  assigned: ['in_progress', 'accepted', 'blocked', 'fulfilled', 'cancelled', 'superseded'],
  in_progress: ['assigned', 'accepted', 'blocked', 'fulfilled', 'cancelled', 'superseded'],
  blocked: ['accepted', 'assigned', 'in_progress', 'fulfilled', 'cancelled', 'superseded'],
  fulfilled: [], rejected: [], cancelled: [], superseded: [],
};
// 'fulfilled' is reachable ONLY through fulfil() (evidence gate). Statuses an actor may set through updateStatus:
const SELF_SETTABLE = ['assigned', 'in_progress', 'blocked', 'accepted', 'cancelled'];

class CommitmentService {
  constructor({ db, audit, events, clock, index, settings, work, sources, extractor }) { Object.assign(this, { db, audit, events, clock, index, settings, work, sources, extractor }); }

  _row(principal, id) {
    const c = this.db.get('SELECT * FROM ki_commitments WHERE id=?', [id]);
    if (!c) throw notFound('commitment', id);
    const chk = checkRead(principal, c);
    if (!chk.allowed) { this.audit.record({ principal, action: 'commitment.read_denied', entityType: 'commitment', entityId: id, orgId: principal.orgId, outcome: 'denied', detail: { reason: chk.reason } }); throw notFound('commitment', id); }
    return c;
  }
  _transition(principal, c, to, reason, extra = {}) {
    if (!TRANSITIONS[c.status].includes(to)) throw illegalState(`Illegal commitment transition ${c.status} -> ${to}`, { from: c.status, to });
    const now = this.clock.iso();
    const sets = ['status=?', 'updated_at=?']; const vals = [to, now];
    for (const [k, v] of Object.entries(extra)) { sets.push(`${k}=?`); vals.push(v); }
    this.db.run(`UPDATE ki_commitments SET ${sets.join(', ')} WHERE id=?`, [...vals, c.id]);
    this.db.run('INSERT INTO ki_commitment_history(commitment_id,from_status,to_status,actor,reason,ts) VALUES (?,?,?,?,?,?)', [c.id, c.status, to, principal.id, reason || null, now]);
  }
  _index(id, description) { this.index.upsertText('commitment', id, '', description); }

  /* --------------------------------------------------------------- capture */
  /** Extract candidate commitments from an already-captured source. Everything lands in needs_confirmation. */
  async extractFromSource(principal, sourceId, { projectId, addressees = [], tzOffsetMinutes } = {}) {
    assertCan(principal, 'commitment.propose');
    const src = this.sources.get(principal, sourceId);
    const cfg = this.settings.all();
    const cands = await this.extractor.extract({ text: src.text, author: src.authorId || src.authorName, ts: src.originalTs || src.capturedAt, addressees, tzOffsetMinutes });
    const created = []; let dropped = 0; const duplicates = [];
    const pid = projectId || src.projectId || null;
    for (const cand of cands) {
      if (cand.confidence < cfg.commitmentMinConfidence) { dropped++; continue; }
      const r = this._create(principal, {
        kind: cand.kind, description: cand.description, priority: cand.priority, confidence: cand.confidence, sourceId, projectId: pid,
        deadlineAt: cand.deadline && cand.deadline.at, deadlineText: cand.deadline && cand.deadline.text, deadlineConfidence: cand.deadline && cand.deadline.confidence,
        deadlineNeedsClarification: !!(cand.deadline && cand.deadline.needsClarification), responsibleHint: cand.responsibleHint, requester: cand.requester, evidenceQuote: cand.evidenceQuote,
        extractedBy: `${this.extractor.id}@${this.extractor.version}`, classification: src.classification,
      }, { fromExtraction: true });
      if (r.duplicate) duplicates.push(r.id); else created.push(r.id);
    }
    this.audit.record({ principal, action: 'commitment.extract', entityType: 'source', entityId: sourceId, orgId: principal.orgId, projectId: pid, detail: { candidates: cands.length, created: created.length, dropped, duplicates: duplicates.length } });
    return { created, duplicates, dropped, candidates: cands.length };
  }

  /** Manual/agent proposal. Always lands in needs_confirmation; only confirm() makes it accepted. */
  propose(principal, input) {
    assertCan(principal, 'commitment.propose');
    return this._create(principal, input, {});
  }

  _create(principal, input, { fromExtraction = false }) {
    if (!KINDS.includes(input.kind)) throw invalid(`Unknown commitment kind: ${input.kind}`);
    if (!input.description || !String(input.description).trim()) throw invalid('description is required');
    assertWriteScope(principal, { project_id: input.projectId });
    const conf = input.confidence === undefined ? 0.5 : Number(input.confidence);
    if (!(conf >= 0 && conf <= 1)) throw invalid('confidence must be between 0 and 1');
    let src = null;
    if (input.sourceId) { src = this.db.get('SELECT * FROM ki_sources WHERE id=?', [input.sourceId]); if (!src || !canRead(principal, src)) throw notFound('source', input.sourceId); }
    if (input.projectId && this.work && this.work.getProject && this.work.listProjects().length && !this.work.getProject(input.projectId)) throw invalid(`Unknown project: ${input.projectId}`);
    if (input.sourceId) {
      const dup = this.db.get('SELECT id FROM ki_commitments WHERE source_id=? AND description=?', [input.sourceId, input.description]);
      if (dup) return { id: dup.id, duplicate: true };
    }
    const cfg = this.settings.all();
    const id = newId('cmt'); const now = this.clock.iso();
    let classification = input.classification || (src && src.classification) || 'internal';
    if (src && rank(src.classification) > rank(classification)) classification = src.classification;
    const acl = src && src.acl_json ? src.acl_json : toJson(input.acl);
    const auto = fromExtraction && cfg.commitmentAutoAcceptThreshold !== null && conf >= cfg.commitmentAutoAcceptThreshold && src && src.trust === 'trusted' && !input.deadlineNeedsClarification;
    this.db.tx(() => {
      this.db.run(`INSERT INTO ki_commitments(id,kind,description,status,priority,confidence,confirmation,source_id,source_platform,source_author,source_ref_json,captured_at,requester,responsible_id,responsible_type,org_id,project_id,classification,acl_json,
        deadline_at,deadline_text,deadline_confidence,deadline_needs_clarification,acceptance_criteria_json,extracted_by,created_by,created_at,updated_at)
        VALUES (?,?,?, 'detected',?,?, 'unconfirmed',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, input.kind, String(input.description).trim(), input.priority || 'medium', conf, input.sourceId || null, src ? src.platform : input.sourcePlatform || null,
        src ? src.author_id || src.author_name : input.sourceAuthor || null, toJson(input.evidenceQuote ? { quote: input.evidenceQuote, messageId: src && src.message_id, threadId: src && src.thread_id, url: src && src.original_url } : input.sourceRef),
        now, input.requester || (src && (src.author_id || src.author_name)) || null, null, null, principal.orgId, input.projectId || (src && src.project_id) || null, classification, acl,
        input.deadlineAt || null, input.deadlineText || null, input.deadlineConfidence ?? null, input.deadlineNeedsClarification ? 1 : 0, toJson(input.acceptanceCriteria), input.extractedBy || null, principal.id, now, now]);
      this.db.run('INSERT INTO ki_commitment_history(commitment_id,from_status,to_status,actor,reason,ts) VALUES (?,?,?,?,?,?)', [id, null, 'detected', principal.id, fromExtraction ? 'extracted from source' : 'proposed', now]);
      const c = this.db.get('SELECT * FROM ki_commitments WHERE id=?', [id]);
      this._transition(principal, c, 'needs_confirmation', conf < 0.6 ? 'low confidence: needs human review' : 'awaiting confirmation');
      if (input.responsibleHint) this.db.run(`UPDATE ki_commitments SET resolution_notes=? WHERE id=?`, [`Suggested owner: ${input.responsibleHint} (unconfirmed)`, id]);
      this._index(id, c.description);
      this.audit.record({ principal, action: 'commitment.detected', entityType: 'commitment', entityId: id, orgId: principal.orgId, projectId: c.project_id, detail: { kind: input.kind, confidence: conf, sourceId: input.sourceId || null, extractedBy: input.extractedBy || null } });
      this.events.emit({ type: 'commitment.detected', entityType: 'commitment', entityId: id, orgId: principal.orgId, projectId: c.project_id, importance: input.priority === 'urgent' ? 'high' : 'normal', summary: `New ${input.kind} awaiting confirmation: ${input.description}`, payload: { deadlineAt: input.deadlineAt || null } });
    });
    this.index.embedEntities([{ entityType: 'commitment', entityId: id, text: String(input.description).trim() }]).catch(() => {});
    if (auto) this.confirm({ ...principal, role: principal.role }, id, { note: 'auto-accepted: trusted source above threshold', _auto: true });
    return { id, duplicate: false, status: this.db.get('SELECT status FROM ki_commitments WHERE id=?', [id]).status };
  }

  /* ------------------------------------------------------------ decisions */
  confirm(principal, id, { note, responsibleId, responsibleType, deadlineAt, description, priority, acceptanceCriteria, _auto } = {}) {
    if (!_auto) assertCan(principal, 'commitment.confirm');
    const c = this._row(principal, id);
    if (c.status !== 'needs_confirmation' && c.status !== 'detected') throw illegalState(`Only commitments awaiting confirmation can be confirmed (is ${c.status})`);
    if (c.deadline_needs_clarification && !deadlineAt && !_auto) {
      // allowed, but the confirmer must knowingly accept an undated commitment: recorded in the note
      note = `${note || ''} [confirmed without a deadline: "${c.deadline_text}" was ambiguous]`.trim();
    }
    this.db.tx(() => {
      const cur = c.status === 'detected' ? (this._transition(principal, c, 'needs_confirmation', 'implicit'), this.db.get('SELECT * FROM ki_commitments WHERE id=?', [id])) : c;
      this._transition(principal, cur, 'accepted', note || 'confirmed', { confirmation: 'confirmed', confirmed_by: _auto ? 'auto' : principal.id, confirmed_at: this.clock.iso(),
        description: description || c.description, priority: priority || c.priority, deadline_at: deadlineAt || c.deadline_at, deadline_needs_clarification: deadlineAt ? 0 : c.deadline_needs_clarification,
        acceptance_criteria_json: acceptanceCriteria ? JSON.stringify(acceptanceCriteria) : c.acceptance_criteria_json });
      if (responsibleId) this.db.run('UPDATE ki_commitments SET responsible_id=?, responsible_type=?, resolution_notes=NULL WHERE id=?', [responsibleId, responsibleType || 'agent', id]);
      if (description) this._index(id, description);
      this.audit.record({ principal, action: 'commitment.confirm', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, detail: { note, responsibleId, deadlineAt, auto: !!_auto } });
      this.events.emit({ type: 'commitment.accepted', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, summary: `Commitment accepted: ${description || c.description}` });
    });
    return this.get(principal, id);
  }
  reject(principal, id, reason) {
    assertCan(principal, 'commitment.confirm');
    if (!reason) throw invalid('A reason is required to reject a commitment');
    const c = this._row(principal, id);
    this.db.tx(() => {
      this._transition(principal, c, 'rejected', reason, { confirmation: 'rejected', confirmed_by: principal.id, confirmed_at: this.clock.iso(), resolution_notes: reason });
      this.audit.record({ principal, action: 'commitment.reject', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, detail: { reason } });
      this.events.emit({ type: 'commitment.rejected', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, summary: `Commitment rejected: ${c.description}` });
    });
    return this.get(principal, id);
  }

  assign(principal, id, { responsibleId, responsibleType = 'agent', note }) {
    assertCan(principal, 'commitment.assign');
    if (!responsibleId) throw invalid('responsibleId is required');
    const c = this._row(principal, id);
    if (c.confirmation !== 'confirmed') throw illegalState('Only confirmed commitments can be assigned');
    this.db.tx(() => {
      this.db.run('UPDATE ki_commitments SET responsible_id=?, responsible_type=?, updated_at=? WHERE id=?', [responsibleId, responsibleType, this.clock.iso(), id]);
      if (['accepted'].includes(c.status)) this._transition(principal, c, 'assigned', note || `assigned to ${responsibleId}`);
      this.audit.record({ principal, action: 'commitment.assign', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, detail: { responsibleId, responsibleType, note } });
      this.events.emit({ type: 'commitment.assigned', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, summary: `Commitment assigned to ${responsibleId}: ${c.description}` });
    });
    return this.get(principal, id);
  }

  updateStatus(principal, id, to, reason) {
    assertCan(principal, 'commitment.update');
    if (!SELF_SETTABLE.includes(to)) throw invalid(`Status '${to}' cannot be set directly (${to === 'fulfilled' ? 'use fulfil with evidence' : to === 'rejected' ? 'use reject' : 'not allowed'})`);
    const c = this._row(principal, id);
    const privileged = can(principal, 'commitment.assign');
    if (!privileged && c.responsible_id !== principal.id) throw forbidden('Only the responsible party or an assigner can change this commitment');
    if (!privileged && !['in_progress', 'blocked', 'assigned'].includes(to)) throw forbidden(`Responsible parties cannot set '${to}'`);
    if (c.confirmation !== 'confirmed') throw illegalState('Commitment is not confirmed yet');
    this.db.tx(() => {
      if (to === 'blocked') {
        if (!reason) throw invalid('A blocker reason is required');
        this._transition(principal, c, 'blocked', reason, { blocked_from: c.status === 'blocked' ? c.blocked_from : c.status, blocked_reason: reason });
        this.events.emit({ type: 'commitment.blocked', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, importance: 'high', summary: `Commitment blocked: ${c.description} (${reason})` });
      } else {
        this._transition(principal, c, to, reason, { blocked_from: null, blocked_reason: null });
      }
      this.audit.record({ principal, action: 'commitment.status', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, detail: { from: c.status, to, reason } });
    });
    return this.get(principal, id);
  }

  supersede(principal, id, byId, reason) {
    assertCan(principal, 'commitment.confirm');
    const c = this._row(principal, id); this._row(principal, byId);
    this.db.tx(() => {
      this._transition(principal, c, 'superseded', reason || `superseded by ${byId}`, { superseded_by_id: byId });
      this.audit.record({ principal, action: 'commitment.supersede', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, detail: { by: byId, reason } });
    });
    return this.get(principal, id);
  }

  /* ----------------------------------------------------------- tasks link */
  linkTask(principal, id, taskId, relation = 'satisfied_by') {
    assertCan(principal, 'commitment.update');
    if (!['generated', 'satisfied_by'].includes(relation)) throw invalid('relation must be generated or satisfied_by');
    const c = this._row(principal, id);
    if (!['accepted', 'assigned', 'in_progress', 'blocked'].includes(c.status)) throw illegalState(`Cannot link tasks to a ${c.status} commitment; confirm it first`);
    const task = this.work.getTask(taskId);
    if (!task) throw notFound('task', taskId);
    if (task.projectId && c.project_id && task.projectId !== c.project_id) throw invalid('Task belongs to a different project than the commitment');
    this.db.tx(() => {
      this.db.run(`INSERT OR IGNORE INTO ki_commitment_tasks(commitment_id,task_id,relation,linked_by,linked_at) VALUES (?,?,?,?,?)`, [id, taskId, relation, principal.id, this.clock.iso()]);
      if (c.status === 'accepted') this._transition(principal, c, 'assigned', `linked to task ${taskId}`);
      this.audit.record({ principal, action: 'commitment.link_task', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, detail: { taskId, relation } });
      this.events.emit({ type: 'commitment.task_linked', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, summary: `Commitment linked to task ${taskId}: ${c.description}` });
    });
    return this.get(principal, id);
  }
  unlinkTask(principal, id, taskId) {
    assertCan(principal, 'commitment.update'); const c = this._row(principal, id);
    this.db.run('DELETE FROM ki_commitment_tasks WHERE commitment_id=? AND task_id=?', [id, taskId]);
    this.audit.record({ principal, action: 'commitment.unlink_task', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, detail: { taskId } });
    return this.get(principal, id);
  }
  commitmentsForTask(principal, taskId) {
    return this.db.all('SELECT c.* FROM ki_commitment_tasks l JOIN ki_commitments c ON c.id=l.commitment_id WHERE l.task_id=?', [taskId]).filter((c) => canRead(principal, c)).map((c) => this._shape(c));
  }

  /* ------------------------------------------------------------- evidence */
  submitEvidence(principal, id, { taskId, evidenceClass = 'DECLARED', summary, ref, criteria }) {
    assertCan(principal, 'evidence.submit');
    if (!summary) throw invalid('summary is required');
    const c = this._row(principal, id);
    if (!['DECLARED', 'ATTESTED', 'OBSERVED', 'VERIFIED', 'UNKNOWN'].includes(evidenceClass)) throw invalid('Unknown evidence class');
    // Self-claimed evidence is always DECLARED; stronger classes require an independent verifier role and are not the responsible party.
    let cls = evidenceClass;
    if (['OBSERVED', 'VERIFIED'].includes(cls) && (!can(principal, 'evidence.verify') || principal.id === c.responsible_id)) cls = 'DECLARED';
    const eid = newId('evd');
    this.db.tx(() => {
      this.db.run(`INSERT INTO ki_commitment_evidence(id,commitment_id,task_id,evidence_class,summary,ref_json,submitted_by,submitted_by_type,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        [eid, id, taskId || null, cls, summary, toJson({ ...(ref || {}), criteria: criteria || (ref && ref.criteria) || undefined }), principal.id, principal.type, this.clock.iso()]);
      this.audit.record({ principal, action: 'commitment.evidence_submitted', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, detail: { evidenceId: eid, requestedClass: evidenceClass, recordedClass: cls } });
    });
    return { id: eid, recordedClass: cls, downgraded: cls !== evidenceClass };
  }
  /** Independent verifier confirms a piece of evidence. Cannot verify own submission or the owner's own work. */
  verifyEvidence(principal, evidenceId, { note, evidenceClass = 'VERIFIED' } = {}) {
    assertCan(principal, 'evidence.verify');
    if (!['OBSERVED', 'VERIFIED'].includes(evidenceClass)) throw invalid('Verified evidence must be OBSERVED or VERIFIED');
    const e = this.db.get('SELECT * FROM ki_commitment_evidence WHERE id=?', [evidenceId]);
    if (!e) throw notFound('evidence', evidenceId);
    const c = this._row(principal, e.commitment_id);
    if (e.submitted_by === principal.id) throw forbidden('Evidence cannot be verified by its submitter');
    if (c.responsible_id === principal.id) throw forbidden('The responsible party cannot verify their own work');
    this.db.tx(() => {
      this.db.run('UPDATE ki_commitment_evidence SET evidence_class=?, verified_by=?, verified_at=?, verification_note=? WHERE id=?', [evidenceClass, principal.id, this.clock.iso(), note || null, evidenceId]);
      this.audit.record({ principal, action: 'commitment.evidence_verified', entityType: 'commitment', entityId: c.id, orgId: c.org_id, projectId: c.project_id, detail: { evidenceId, evidenceClass, note } });
    });
    return { verified: true };
  }

  /** The fulfilment gate. */
  fulfil(principal, id, { note } = {}) {
    assertCan(principal, 'commitment.update');
    const c = this._row(principal, id);
    if (!ACTIVE.includes(c.status)) throw illegalState(`Cannot fulfil a ${c.status} commitment`);
    if (c.responsible_id === principal.id && !['owner', 'approver'].includes(principal.role)) throw forbidden('The responsible party cannot declare their own commitment fulfilled');
    const links = this.db.all('SELECT * FROM ki_commitment_tasks WHERE commitment_id=?', [id]);
    const failing = []; const verifiedTasks = [];
    for (const l of links) {
      const t = this.work.getTask(l.task_id);
      if (t && ['failed'].includes(t.status) ) { failing.push({ taskId: l.task_id, reason: 'task_failed' }); continue; }
      const v = this.work.getVerification(l.task_id);
      if (v.verified) verifiedTasks.push({ taskId: l.task_id, evidence: v.evidence, qualifying: v.qualifying || [] }); else failing.push({ taskId: l.task_id, reason: v.reason });
    }
    if (failing.length) throw illegalState('Linked task(s) are not independently verified; commitment cannot be fulfilled', { failing });
    const ev = this.db.all(`SELECT * FROM ki_commitment_evidence WHERE commitment_id=? AND verified_by IS NOT NULL AND evidence_class IN ('OBSERVED','VERIFIED')`, [id]);
    const criteria = parseJson(c.acceptance_criteria_json, []);
    if (!links.length) {
      if (!ev.length) throw illegalState('No independently verified evidence on this commitment', { required: 'OBSERVED/VERIFIED evidence confirmed by a non-owner verifier' });
      if (criteria.length) {
        const covered = new Set(ev.flatMap((e) => (parseJson(e.ref_json, {}).criteria || [])));
        const missing = criteria.map((_, i) => i).filter((i) => !covered.has(i));
        if (missing.length) throw illegalState('Acceptance criteria not covered by verified evidence', { uncovered: missing.map((i) => ({ index: i, criterion: criteria[i] })) });
      }
    }
    this.db.tx(() => {
      for (const vt of verifiedTasks) {
        const exists = this.db.get('SELECT id FROM ki_commitment_evidence WHERE commitment_id=? AND task_id=? AND submitted_by=?', [id, vt.taskId, 'work-port']);
        if (!exists) {
          const best = vt.evidence.find((e) => vt.qualifying.includes(e.id)) || {};
          this.db.run(`INSERT INTO ki_commitment_evidence(id,commitment_id,task_id,evidence_class,summary,ref_json,submitted_by,submitted_by_type,created_at,verified_by,verified_at,verification_note)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [newId('evd'), id, vt.taskId, best.class || 'VERIFIED', `Task ${vt.taskId} verified by work system${best.details ? ': ' + String(best.details).slice(0, 300) : ''}`, toJson({ taskEvidenceIds: vt.evidence.map((e) => e.id) }),
            'work-port', 'system', this.clock.iso(), best.verifier || 'work-system', best.at || this.clock.iso(), 'copied from the work system, not asserted by KI']);
        }
      }
      const now = this.clock.iso();
      this._transition(principal, c, 'fulfilled', note || 'evidence gate satisfied', { fulfilled_at: now, blocked_from: null, blocked_reason: null, resolution_notes: note || c.resolution_notes });
      this.audit.record({ principal, action: 'commitment.fulfil', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, detail: { tasks: verifiedTasks.map((t) => t.taskId), evidenceRows: ev.length, note } });
      this.events.emit({ type: 'commitment.fulfilled', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, importance: 'high', summary: `Commitment fulfilled with verified evidence: ${c.description}` });
    });
    return this.get(principal, id);
  }

  /** Reopen a fulfilled commitment (e.g. evidence retracted). Owner/approver only. */
  reopen(principal, id, reason) {
    if (!['owner', 'approver'].includes(principal.role)) throw forbidden('Only owners/approvers can reopen a fulfilled commitment');
    if (!reason) throw invalid('reason required');
    const c = this._row(principal, id);
    if (c.status !== 'fulfilled') throw illegalState('Only fulfilled commitments can be reopened');
    this.db.tx(() => {
      this.db.run(`UPDATE ki_commitments SET status='in_progress', fulfilled_at=NULL, updated_at=? WHERE id=?`, [this.clock.iso(), id]);
      this.db.run('INSERT INTO ki_commitment_history(commitment_id,from_status,to_status,actor,reason,ts) VALUES (?,?,?,?,?,?)', [id, 'fulfilled', 'in_progress', principal.id, `reopened: ${reason}`, this.clock.iso()]);
      this.audit.record({ principal, action: 'commitment.reopen', entityType: 'commitment', entityId: id, orgId: c.org_id, projectId: c.project_id, detail: { reason } });
    });
    return this.get(principal, id);
  }

  /* ----------------------------------------------------------------- reads */
  isOverdue(c, nowIso = this.clock.iso()) { return !!(c.deadline_at && c.deadline_at < nowIso && ACTIVE.includes(c.status)); }
  _shape(c) {
    const now = this.clock.iso();
    const overdue = this.isOverdue(c, now);
    return { id: c.id, kind: c.kind, description: c.description, status: c.status, effectiveStatus: overdue ? 'overdue' : c.status, overdue, priority: c.priority, confidence: c.confidence, confirmation: c.confirmation,
      confirmedBy: c.confirmed_by, confirmedAt: c.confirmed_at, sourceId: c.source_id, sourcePlatform: c.source_platform, sourceAuthor: c.source_author, sourceRef: parseJson(c.source_ref_json, null), capturedAt: c.captured_at, requester: c.requester,
      responsibleId: c.responsible_id, responsibleType: c.responsible_type, orgId: c.org_id, projectId: c.project_id, classification: c.classification, deadlineAt: c.deadline_at, deadlineText: c.deadline_text,
      deadlineNeedsClarification: !!c.deadline_needs_clarification, acceptanceCriteria: parseJson(c.acceptance_criteria_json, []), resolutionNotes: c.resolution_notes, blockedReason: c.blocked_reason,
      supersededBy: c.superseded_by_id, createdAt: c.created_at, updatedAt: c.updated_at, fulfilledAt: c.fulfilled_at, extractedBy: c.extracted_by, lowConfidence: c.confidence < 0.6 };
  }
  get(principal, id) {
    assertCan(principal, 'commitment.read');
    const c = this._row(principal, id);
    const tasks = this.db.all('SELECT * FROM ki_commitment_tasks WHERE commitment_id=?', [id]).map((l) => {
      const t = this.work.getTask(l.task_id); const v = t ? this.work.getVerification(l.task_id) : { verified: false, reason: 'task_not_found' };
      return { taskId: l.task_id, relation: l.relation, title: t && t.title, status: t ? t.status : 'missing', assigneeId: t && t.assigneeId, verified: v.verified, verificationReason: v.reason };
    });
    const evidence = this.db.all('SELECT * FROM ki_commitment_evidence WHERE commitment_id=? ORDER BY created_at', [id]).map((e) => ({ id: e.id, taskId: e.task_id, class: e.evidence_class, summary: e.summary, ref: parseJson(e.ref_json, null), submittedBy: e.submitted_by, createdAt: e.created_at, verifiedBy: e.verified_by, verifiedAt: e.verified_at, independentlyVerified: !!e.verified_by }));
    const history = this.db.all('SELECT from_status, to_status, actor, reason, ts FROM ki_commitment_history WHERE commitment_id=? ORDER BY id', [id]);
    const source = c.source_id ? (() => { try { return this.sources.get(principal, c.source_id); } catch (_) { return null; } })() : null;
    return { ...this._shape(c), tasks, evidence, history, source };
  }
  list(principal, f = {}) {
    assertCan(principal, 'commitment.read');
    const w = ['org_id=?']; const p = [principal.orgId];
    if (f.projectId) { w.push('project_id=?'); p.push(f.projectId); }
    if (f.responsibleId) { w.push('responsible_id=?'); p.push(f.responsibleId); }
    if (f.mine) { w.push('responsible_id=?'); p.push(principal.id); }
    if (f.requester) { w.push('(requester=? OR source_author=?)'); p.push(f.requester, f.requester); }
    if (f.kind) { w.push('kind=?'); p.push(f.kind); }
    if (f.sourceId) { w.push('source_id=?'); p.push(f.sourceId); }
    const wantOverdue = f.status === 'overdue' || f.overdue === true;
    if (f.status && f.status !== 'overdue' && f.status !== 'open') { w.push('status=?'); p.push(f.status); }
    if (f.status === 'open') w.push(`status IN (${OPEN.map(() => '?').join(',')})`), p.push(...OPEN);
    if (wantOverdue) { w.push(`deadline_at < ? AND status IN (${ACTIVE.map(() => '?').join(',')})`); p.push(this.clock.iso(), ...ACTIVE); }
    if (f.dueBefore) { w.push('deadline_at <= ? AND deadline_at >= ?'); p.push(f.dueBefore, this.clock.iso()); }
    if (f.since) { w.push('created_at >= ?'); p.push(f.since); }
    return this.db.all(`SELECT * FROM ki_commitments WHERE ${w.join(' AND ')} ORDER BY CASE WHEN deadline_at IS NULL THEN 1 ELSE 0 END, deadline_at, captured_at DESC LIMIT ?`, [...p, f.limit || 300])
      .filter((c) => canRead(principal, c)).map((c) => this._shape(c));
  }
  awaitingConfirmation(principal, f = {}) { return this.list(principal, { ...f, status: 'needs_confirmation' }); }
  overdue(principal, f = {}) { return this.list(principal, { ...f, status: 'overdue' }); }

  /** Emit one `commitment.overdue` event per newly overdue commitment (idempotent). */
  sweepOverdue(principal) {
    assertCan(principal, 'commitment.read');
    let emitted = 0;
    for (const c of this.db.all(`SELECT * FROM ki_commitments WHERE org_id=? AND deadline_at < ? AND status IN (${ACTIVE.map(() => '?').join(',')})`, [principal.orgId, this.clock.iso(), ...ACTIVE])) {
      if (this.db.get(`SELECT id FROM ki_events WHERE type='commitment.overdue' AND entity_id=?`, [c.id])) continue;
      this.events.emit({ type: 'commitment.overdue', entityType: 'commitment', entityId: c.id, orgId: c.org_id, projectId: c.project_id, importance: 'high', summary: `Overdue: ${c.description} (was due ${c.deadline_at})` });
      emitted++;
    }
    return { emitted };
  }
}

module.exports = { CommitmentService, KINDS, TRANSITIONS, OPEN, ACTIVE };
