'use strict';
/**
 * WorkPort: the ONLY way KI reads projects, tasks, agents and verification state.
 * KI never stores or caches those entities, so there is exactly one source of truth.
 *
 * Contract (all methods synchronous, all read-only):
 *   getProject(id)                      -> Project | null
 *   listProjects()                      -> Project[]
 *   getTask(id)                         -> Task | null
 *   listTasks({projectId, updatedSince})-> Task[]
 *   getVerification(taskId)             -> { verified:boolean, evidence:Evidence[], qualifying:string[] (ids of independent observed evidence), reason:string }
 *   listPendingDecisions({projectId})   -> { id, description, urgency, taskId, requestedAt }[]
 *   describe()                          -> { kind, source }
 * Task.status is normalised to: pending | in_progress | blocked | in_review | done | failed | unresolved
 * A V2 runtime implements this same contract against runtime.db (ADR-KI-001).
 */
const fs = require('fs');
const { KiDb } = require('../core/db');
const { parseJson } = require('../core/util');

const SQL_STATUS = { open: 'pending', claimed: 'pending', in_progress: 'in_progress', blocked: 'blocked', in_review: 'in_review', done: 'done', failed: 'failed', unresolved: 'unresolved' };
const JSON_STATUS = { TODO: 'pending', IN_PROGRESS: 'in_progress', VERIFICATION: 'in_review', DONE: 'done', BLOCKED: 'blocked', UNRESOLVED: 'unresolved', FAILED: 'failed' };

/** Reads the MyaOS SQLite schema (data/schema.sql: projects, tasks, evidence, human_decisions). Read-only. */
class SqliteWorkPort {
  constructor(dbPath) { this.dbPath = dbPath; this.db = new KiDb(dbPath, { readonly: true }); }
  describe() { return { kind: 'sqlite', source: this.dbPath }; }
  getProject(id) {
    const p = this.db.get('SELECT * FROM projects WHERE id=?', [id]);
    return p ? { id: p.id, title: p.title, description: p.description, status: p.status, objectives: parseJson(p.objectives, []), owner: p.human_owner, repo: p.repo } : null;
  }
  listProjects() { return this.db.all('SELECT id FROM projects').map((r) => this.getProject(r.id)); }
  _task(t) {
    return { id: t.id, projectId: t.project_id, title: t.title, description: t.description, rawStatus: t.status, status: SQL_STATUS[t.status] || 'pending', assigneeId: t.assignee_id, creator: t.creator,
      priority: t.priority, acceptanceCriteria: parseJson(t.acceptance_criteria, []), dependencies: parseJson(t.dependencies, []), requiredCapabilities: parseJson(t.required_capabilities, []), createdAt: t.created_at, updatedAt: t.updated_at };
  }
  getTask(id) { const t = this.db.get('SELECT * FROM tasks WHERE id=?', [id]); return t ? this._task(t) : null; }
  listTasks({ projectId, updatedSince } = {}) {
    const w = []; const p = [];
    if (projectId) { w.push('project_id=?'); p.push(projectId); }
    if (updatedSince) { w.push('updated_at>?'); p.push(updatedSince); }
    return this.db.all(`SELECT * FROM tasks ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY updated_at DESC`, p).map((t) => this._task(t));
  }
  getVerification(taskId) {
    const t = this.db.get('SELECT * FROM tasks WHERE id=?', [taskId]);
    if (!t) return { verified: false, evidence: [], reason: 'task_not_found' };
    const ev = this.db.all('SELECT * FROM evidence WHERE task_id=? ORDER BY created_at', [taskId]).map((e) => ({ id: String(e.id), class: e.evidence_class, passed: !!e.passed, verifier: e.verifier_identity, at: e.created_at, details: e.details, exitCode: e.exit_code }));
    const good = ev.filter((e) => e.passed && ['OBSERVED', 'VERIFIED'].includes(e.class) && e.verifier && e.verifier !== t.assignee_id);
    const qualifying = good.map((e) => e.id);
    if (t.status !== 'done') return { verified: false, evidence: ev, qualifying: [], reason: `task_status_${t.status}` };
    if (!good.length) return { verified: false, evidence: ev, qualifying: [], reason: ev.length ? 'no_independent_observed_evidence' : 'no_evidence' };
    return { verified: true, evidence: ev, qualifying, reason: 'independent_observed_evidence' };
  }
  listPendingDecisions({ projectId } = {}) {
    return this.db.all(`SELECT * FROM human_decisions WHERE status='pending' ${projectId ? 'AND project_id=?' : ''} ORDER BY requested_at`, projectId ? [projectId] : [])
      .map((d) => ({ id: String(d.id), description: d.description, urgency: d.urgency, taskId: d.task_id, projectId: d.project_id, requestedAt: d.requested_at, type: d.decision_type }));
  }
  close() { this.db.close(); }
}

/** Reads the Node runtime's community/tasks.json. Read-only; no projects concept there. */
class JsonTaskWorkPort {
  constructor(file) { this.file = file; }
  describe() { return { kind: 'json-tasks', source: this.file }; }
  _all() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')).tasks || []; } catch (_) { return []; } }
  _task(t) {
    return { id: t.id, projectId: t.project_id || null, title: t.title, description: t.description, rawStatus: t.status, status: JSON_STATUS[t.status] || 'pending', assigneeId: t.assignee || null, creator: t.creator,
      priority: String(t.priority || 'NORMAL').toLowerCase(), acceptanceCriteria: t.acceptance_criteria || [], dependencies: t.dependencies || [], requiredCapabilities: t.required_capabilities || [], createdAt: t.created_at, updatedAt: t.updated_at };
  }
  getProject() { return null; }
  listProjects() { return []; }
  getTask(id) { const t = this._all().find((x) => x.id === id); return t ? this._task(t) : null; }
  listTasks({ projectId, updatedSince } = {}) { return this._all().filter((t) => (!projectId || t.project_id === projectId) && (!updatedSince || t.updated_at > updatedSince)).map((t) => this._task(t)); }
  getVerification(taskId) {
    const t = this._all().find((x) => x.id === taskId);
    if (!t) return { verified: false, evidence: [], reason: 'task_not_found' };
    const v = t.verification_evidence;
    const ev = v ? [{ id: `${taskId}:v`, class: v.status === 'VERIFIED' ? 'VERIFIED' : 'UNKNOWN', passed: !!v.passed, verifier: v.verified_by, at: v.timestamp, details: v.details, exitCode: v.exit_code }] : [];
    const ok = t.status === 'DONE' && v && v.passed === true && v.status === 'VERIFIED' && v.verified_by && v.verified_by !== t.assignee;
    return { verified: !!ok, evidence: ev, qualifying: ok ? ev.map((e) => e.id) : [], reason: ok ? 'independent_observed_evidence' : v ? 'verification_not_passed' : 'no_evidence' };
  }
  listPendingDecisions() { return []; }
}

/** In-memory port for tests and for embedding KI before a runtime exists. */
class StaticWorkPort {
  constructor({ projects = [], tasks = [], decisions = [] } = {}) { this.projects = projects; this.tasks = tasks; this.decisions = decisions; }
  describe() { return { kind: 'static', source: 'memory' }; }
  getProject(id) { return this.projects.find((p) => p.id === id) || null; }
  listProjects() { return this.projects; }
  getTask(id) { return this.tasks.find((t) => t.id === id) || null; }
  listTasks({ projectId, updatedSince } = {}) { return this.tasks.filter((t) => (!projectId || t.projectId === projectId) && (!updatedSince || (t.updatedAt || '') > updatedSince)); }
  getVerification(taskId) {
    const t = this.getTask(taskId);
    if (!t) return { verified: false, evidence: [], reason: 'task_not_found' };
    const ev = t.evidence || [];
    const good = ev.filter((e) => e.passed && ['OBSERVED', 'VERIFIED'].includes(e.class) && e.verifier !== t.assigneeId);
    const ok = t.status === 'done' && good.length > 0;
    return { verified: ok, evidence: ev, qualifying: ok ? good.map((e) => e.id) : [], reason: ok ? 'independent_observed_evidence' : ev.length ? 'no_independent_observed_evidence' : 'no_evidence' };
  }
  listPendingDecisions({ projectId } = {}) { return this.decisions.filter((d) => !projectId || d.projectId === projectId); }
}

module.exports = { SqliteWorkPort, JsonTaskWorkPort, StaticWorkPort };
