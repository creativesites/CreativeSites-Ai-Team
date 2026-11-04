'use strict';
/**
 * Principals, roles and the single read/write policy used by every KI service.
 * Agents cannot grant themselves anything: roles come from the host (runtime
 * identity), never from tool input.
 */
const { forbidden } = require('./errors');
const { parseJson } = require('./util');

const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted', 'secret'];
const rank = (c) => Math.max(0, CLASSIFICATIONS.indexOf(c));

const ROLE_PERMISSIONS = {
  owner: ['*'],
  approver: ['document.read', 'document.create', 'knowledge.propose', 'knowledge.approve', 'knowledge.resolve', 'knowledge.read',
    'commitment.propose', 'commitment.confirm', 'commitment.assign', 'commitment.update', 'commitment.read', 'evidence.submit',
    'evidence.verify', 'context.assemble', 'briefing.read', 'source.capture', 'source.read'],
  orchestrator: ['document.read', 'document.create', 'knowledge.propose', 'knowledge.read', 'commitment.propose', 'commitment.confirm',
    'commitment.assign', 'commitment.update', 'commitment.read', 'evidence.submit', 'context.assemble', 'context.assemble_for_others',
    'briefing.read', 'source.capture', 'source.read', 'decision.submit'],
  planner: ['document.read', 'document.create', 'knowledge.propose', 'knowledge.read', 'decision.submit', 'commitment.propose',
    'commitment.read', 'commitment.update', 'context.assemble', 'briefing.read', 'source.read'],
  engineer: ['document.read', 'document.create', 'knowledge.propose', 'knowledge.read', 'commitment.propose', 'commitment.read',
    'commitment.update', 'evidence.submit', 'context.assemble', 'briefing.read', 'source.read'],
  verifier: ['document.read', 'knowledge.read', 'commitment.read', 'evidence.submit', 'evidence.verify', 'context.assemble',
    'briefing.read', 'source.read', 'knowledge.propose'],
  viewer: ['document.read', 'knowledge.read', 'commitment.read', 'briefing.read'],
  system: ['document.read', 'document.create', 'document.process', 'knowledge.propose', 'knowledge.read', 'commitment.propose',
    'commitment.read', 'source.capture', 'source.read'],
};

const DEFAULT_CLEARANCE = { owner: 'secret', approver: 'restricted', orchestrator: 'confidential', planner: 'confidential',
  engineer: 'internal', verifier: 'internal', viewer: 'internal', system: 'confidential' };

/** @typedef {{id:string,type:'human'|'agent'|'system',role:string,orgId:string,projectIds?:string[]|'*',clearance?:string,grant?:string[],deny?:string[]}} Principal */
function makePrincipal(p) {
  if (!p || !p.id || !p.role || !p.orgId) throw forbidden('A principal needs id, role and orgId');
  if (!ROLE_PERMISSIONS[p.role]) throw forbidden(`Unknown role: ${p.role}`);
  return Object.freeze({
    id: String(p.id), type: p.type || (p.role === 'system' ? 'system' : 'agent'), role: p.role, orgId: p.orgId,
    projectIds: p.projectIds === '*' ? '*' : Array.from(p.projectIds || []),
    clearance: p.clearance || DEFAULT_CLEARANCE[p.role] || 'internal',
    grant: Object.freeze(Array.from(p.grant || [])), deny: Object.freeze(Array.from(p.deny || [])),
  });
}

function can(principal, permission) {
  if (principal.deny.includes(permission)) return false;
  const perms = ROLE_PERMISSIONS[principal.role] || [];
  return perms.includes('*') || perms.includes(permission) || principal.grant.includes(permission);
}
function assertCan(principal, permission) {
  if (!can(principal, permission)) {
    throw forbidden(`${principal.role} '${principal.id}' lacks permission ${permission}`, { permission, principal: principal.id });
  }
}

const sees = (principal, projectId) => !projectId || principal.projectIds === '*' || principal.projectIds.includes(projectId)
  || ['owner', 'orchestrator', 'approver'].includes(principal.role);

/**
 * Decide whether `principal` may read `res` ({org_id, project_id, classification, acl_json|acl}).
 * Returns {allowed, reason} so audits can record *why* access was refused.
 */
function checkRead(principal, res) {
  if (res.org_id !== principal.orgId) return { allowed: false, reason: 'other_org' };
  const cls = res.classification || 'internal';
  if (principal.role === 'owner') return { allowed: true, reason: 'owner' };
  const acl = res.acl || parseJson(res.acl_json, null);
  if (acl && Array.isArray(acl.deny) && (acl.deny.includes(principal.id) || acl.deny.includes(`role:${principal.role}`))) {
    return { allowed: false, reason: 'acl_deny' };
  }
  const listed = !!acl && ((acl.principals || []).includes(principal.id) || (acl.roles || []).includes(principal.role));
  if (cls === 'restricted' || cls === 'secret') {
    if (!listed) return { allowed: false, reason: 'explicit_acl_required' };
    if (rank(principal.clearance) < rank(cls) && cls === 'secret') return { allowed: false, reason: 'insufficient_clearance' };
    return { allowed: true, reason: 'acl' };
  }
  if (rank(principal.clearance) < rank(cls)) return { allowed: false, reason: 'insufficient_clearance' };
  const hasAcl = !!acl && ((acl.principals || []).length || (acl.roles || []).length);
  if (hasAcl && !listed) return { allowed: false, reason: 'not_in_acl' };
  if (!sees(principal, res.project_id)) return { allowed: false, reason: 'not_project_member' };
  return { allowed: true, reason: hasAcl ? 'acl' : 'scope' };
}

const canRead = (principal, res) => checkRead(principal, res).allowed;

/** Secret-class records never appear in general search/briefings, even for those who may fetch them by id. */
const isSearchable = (res) => (res.classification || 'internal') !== 'secret';

function assertWriteScope(principal, { project_id }) {
  if (!sees(principal, project_id)) throw forbidden(`No access to project ${project_id}`, { projectId: project_id });
}

/** Authority ladder. Only `knowledge.approve` holders who did not author a record may raise it to >= 3. */
const AUTHORITY = { inference: 0, informal: 1, documented: 2, approved: 3, verified: 4, mandated: 5 };
const AUTHORITY_NAMES = Object.fromEntries(Object.entries(AUTHORITY).map(([k, v]) => [v, k]));

module.exports = { CLASSIFICATIONS, rank, ROLE_PERMISSIONS, makePrincipal, can, assertCan, checkRead, canRead, isSearchable,
  assertWriteScope, sees, AUTHORITY, AUTHORITY_NAMES };
