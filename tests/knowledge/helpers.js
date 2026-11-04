'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createKnowledgeSystem } = require('../../src/knowledge');
const { KiDb } = require('../../src/knowledge/core/db');
const { Clock } = require('../../src/knowledge/core/util');
const { SqliteWorkPort } = require('../../src/knowledge/work/port');
const { makePrincipal } = require('../../src/knowledge/core/access');

const ORG = 'creativesites';
const SCHEMA = path.resolve(__dirname, '../../data/schema.sql');

/** A realistic harness: real KI database file, real MyaOS schema for the work system (data/schema.sql), controllable clock. */
function makeKi({ now = '2026-11-04T10:00:00.000Z', ki: kiOpts = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(process.env.KI_TEST_TMP || os.tmpdir(), 'ki-test-'));
  const state = { now: new Date(now) };
  const clock = new Clock(() => state.now);
  // --- work system (authoritative tasks/projects live HERE, not in KI)
  const workFile = path.join(dir, 'myaos.db');
  const wdb = new KiDb(workFile);
  wdb.exec(fs.readFileSync(SCHEMA, 'utf8'));
  for (const [id, name] of [['barbara', 'Barbara'], ['atlas', 'Atlas'], ['kael', 'Kael'], ['lyra', 'Lyra'], ['sage', 'Sage']]) wdb.run('INSERT INTO identities(id, display_name) VALUES (?,?)', [id, name]);
  wdb.run(`INSERT INTO projects(id,title,description,objectives) VALUES ('proj_portal','Atlas Portal','Customer portal','["Launch the portal","Pass security review"]')`);
  wdb.run(`INSERT INTO projects(id,title,description) VALUES ('proj_other','Other Project','Unrelated')`);
  const work = {
    db: wdb,
    addTask: (t) => wdb.run(`INSERT INTO tasks(id,project_id,title,description,assignee_id,status,acceptance_criteria,dependencies,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [t.id, t.project || 'proj_portal', t.title, t.description || '', t.assignee || null, t.status || 'open', JSON.stringify(t.criteria || []), JSON.stringify(t.deps || []), state.now.toISOString(), state.now.toISOString()]),
    setStatus: (id, status) => wdb.run('UPDATE tasks SET status=?, updated_at=? WHERE id=?', [status, state.now.toISOString(), id]),
    addEvidence: (taskId, verifier, { cls = 'VERIFIED', passed = 1, details = 'checks passed' } = {}) => wdb.run(`INSERT INTO evidence(task_id,verifier_identity,evidence_class,passed,details,exit_code) VALUES (?,?,?,?,?,0)`, [taskId, verifier, cls, passed, details]),
    addHumanDecision: (d) => wdb.run(`INSERT INTO human_decisions(task_id,project_id,decision_type,description) VALUES (?,?,?,?)`, [d.taskId || null, d.project || 'proj_portal', 'APPROVAL', d.description]),
  };
  const port = new SqliteWorkPort(workFile);
  const ki = createKnowledgeSystem({ baseDir: dir, dataDir: path.join(dir, 'ki'), dbPath: opts_db(dir, kiOpts), clock, work: port, skillsDir: path.resolve(__dirname, '../../community/skills'), ...kiOpts });
  const P = (id, role, extra = {}) => makePrincipal({ id, role, orgId: ORG, type: role === 'owner' || role === 'approver' ? 'human' : 'agent', projectIds: ['proj_portal'], ...extra });
  const principals = {
    owner: P('winston', 'owner', { projectIds: '*' }),
    approver: P('cadence', 'approver', { type: 'human' }),
    orchestrator: P('orchestrator', 'orchestrator'),
    planner: P('sage', 'planner'),
    engineer: P('atlas', 'engineer'),
    engineer2: P('lyra', 'engineer'),
    verifier: P('kael', 'verifier'),
    otherProjectAgent: P('rogue', 'engineer', { projectIds: ['proj_other'] }),
    viewer: P('viewer', 'viewer'),
    foreignOrg: makePrincipal({ id: 'mallory', role: 'engineer', orgId: 'other-org', projectIds: '*' }),
  };
  return {
    ki, dir, work, principals, state, ORG,
    advance: (ms) => { state.now = new Date(state.now.getTime() + ms); },
    setNow: (iso) => { state.now = new Date(iso); },
    cleanup: () => { try { ki.close(); } catch (_) { /* */ } try { wdb.close(); } catch (_) { /* */ } fs.rmSync(dir, { recursive: true, force: true }); },
  };
}
function opts_db(dir, o) { return (o && o.dbPath) || path.join(dir, 'ki', 'knowledge.db'); }

const SPEC_MD = `# Atlas Portal Specification

## Overview

The Atlas Portal gives customers a single place to manage their accounts.

## Authentication

All API requests must be authenticated with OAuth2 bearer tokens. Access tokens must expire after 60 minutes.
Refresh tokens should be rotated on every use.

## Data Protection

All customer data must be encrypted at rest using AES-256. We decided to use PostgreSQL as the primary datastore.

## Working Agreements

The team prefers TypeScript for new services. Always write migrations that are reversible.
`;

async function ingestAndProcess(ki, principal, input) {
  const r = await ki.documents.ingest(principal, { process: 'inline', ...input });
  return r;
}

module.exports = { makeKi, SPEC_MD, ingestAndProcess, ORG };
