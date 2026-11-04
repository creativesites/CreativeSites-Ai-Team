'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeKi } = require('./helpers');

test('Scenario D: conflicting instructions are detected, both preserved, resolved by authority, and retrieval follows the approved one', async () => {
  const h = makeKi(); const { ki, principals: p } = h;
  try {
    // 1: old instruction, approved by a human approver
    h.setNow('2025-09-01T09:00:00.000Z');
    const old = await ki.knowledge.propose(p.planner, { type: 'instruction', title: 'Internal API style', content: 'Use GraphQL for all internal service calls.', projectId: 'proj_portal' });
    ki.knowledge.accept(p.approver, old.id, { authority: 'approved', note: 'Architecture review 2025-09' });
    assert.equal(ki.knowledge.get(p.owner, old.id).authority, 3);

    // 2-3: newer, conflicting instruction is captured (from a chat message) and flagged
    h.setNow('2025-11-01T09:00:00.000Z');
    const msg = ki.sources.capture(p.orchestrator, { platform: 'slack', channel: 'C-PORTAL', messageId: 'k1', authorId: 'barbara', text: 'Use REST for all internal service calls instead of GraphQL, the mobile team cannot consume it.', projectId: 'proj_portal' });
    const nw = await ki.knowledge.propose(p.engineer, { type: 'instruction', title: 'Internal API style (REST)', content: 'Use REST for all internal service calls instead of GraphQL.', projectId: 'proj_portal', sourceId: msg.id });
    assert.equal(nw.conflicts.length, 1);
    const [c] = ki.knowledge.listConflicts(p.orchestrator);
    assert.match(c.reason, /different choices \(graphql vs rest\)|replacement/);
    assert.equal(c.status, 'open');

    // 4: both preserved with authority + timestamps; old stays authoritative (not overwritten, not demoted)
    const a = ki.knowledge.get(p.owner, old.id); const b = ki.knowledge.get(p.owner, nw.id);
    assert.deepEqual([a.status, b.status], ['accepted', 'disputed']);
    assert.ok(a.capturedAt < b.capturedAt);
    assert.equal(b.authority, 0 + (b.derivedBy === 'agent' ? 0 : 1)); assert.equal(c.recommendation.prefer, old.id, 'authority outranks recency');
    assert.deepEqual(ki.knowledge.current(p.orchestrator, { projectId: 'proj_portal' }).map((k) => k.id), [old.id]);
    const pre = await ki.search.search(p.orchestrator, { query: 'internal service calls GraphQL REST', types: ['knowledge'], projectId: 'proj_portal' });
    assert.equal(pre.results[0].id, old.id, 'approved instruction ranks above the newer unapproved one before resolution');

    // cannot paper over it: acceptance blocked while the conflict is open, and agents cannot resolve
    assert.throws(() => ki.knowledge.accept(p.approver, nw.id, {}), /Resolve the open conflict/);
    await assert.rejects(() => ki.knowledge.resolveConflict(p.engineer, c.id, { resolution: 'prefer_b', note: 'newer is better' }), /lacks permission/);
    await assert.rejects(() => ki.knowledge.resolveConflict(p.approver, c.id, { resolution: 'prefer_b' }), /rationale/);

    // 5: resolution by the appropriate authority, recorded
    h.setNow('2025-11-02T09:00:00.000Z');
    const r = await ki.knowledge.resolveConflict(p.approver, c.id, { resolution: 'prefer_b', note: 'Mobile client cannot consume GraphQL; Barbara confirmed.' });
    assert.equal(r.winnerId, nw.id);
    const [resolved] = ki.knowledge.listConflicts(p.owner, { status: 'resolved' });
    assert.deepEqual([resolved.resolved_by, resolved.winner_id, resolved.resolution], ['cadence', nw.id, 'prefer_b']);
    assert.equal(ki.knowledge.get(p.owner, old.id).status, 'superseded');
    assert.equal(ki.knowledge.get(p.owner, old.id).supersededBy, nw.id);
    assert.equal(ki.db.get('SELECT content FROM ki_knowledge WHERE id=?', [old.id]).content, 'Use GraphQL for all internal service calls.', 'old record content preserved');
    const win = ki.knowledge.get(p.owner, nw.id);
    assert.deepEqual([win.status, win.authority, win.approvedBy], ['accepted', 3, 'cadence']);

    // 6: subsequent retrieval prefers the approved current instruction; the old one is history only
    assert.deepEqual(ki.knowledge.current(p.orchestrator, { projectId: 'proj_portal' }).map((k) => k.id), [nw.id]);
    const post = await ki.search.search(p.orchestrator, { query: 'internal service calls GraphQL REST', types: ['knowledge'], projectId: 'proj_portal' });
    assert.deepEqual(post.results.map((x) => x.id), [nw.id]);
    const hist = await ki.search.search(p.orchestrator, { query: 'internal service calls GraphQL REST', types: ['knowledge'], includeSuperseded: true });
    assert.equal(hist.results[0].id, nw.id); assert.equal(hist.results.find((x) => x.id === old.id).status, 'superseded');
    assert.ok(ki.audit.list({ action: 'knowledge.conflict_resolved' })[0].actor_id === 'cadence');
    assert.ok(ki.events.since(h.ORG, '2000-01-01', { types: ['knowledge.conflict'] }).length >= 1);
  } finally { h.cleanup(); }
});

test('authority rules: agents cannot self-approve, set authority, or verify their own knowledge; mandated needs the owner; decisions carry rationale', async () => {
  const h = makeKi(); const { ki, principals: p } = h;
  try {
    const k = await ki.knowledge.propose(p.engineer, { type: 'policy', title: 'All endpoints require auth', content: 'Every endpoint must require authentication.', projectId: 'proj_portal', autoAccept: true, authority: 'mandated' });
    assert.equal(ki.knowledge.get(p.owner, k.id).status, 'proposed', 'autoAccept ignored without knowledge.approve');
    assert.equal(ki.knowledge.get(p.owner, k.id).authority, 0, 'agent proposals are inference-level');
    await assert.rejects(() => ki.tools.invoke(p.engineer, 'ki.knowledge.propose', { type: 'policy', title: 't', content: 'c', authority: 5 }), /not an allowed field/);
    assert.throws(() => ki.knowledge.accept(p.engineer, k.id, {}), /lacks permission/);
    assert.throws(() => ki.knowledge.verify(p.engineer, k.id, { evidenceClass: 'VERIFIED', evidence: 'x' }), /lacks permission/);
    const own = await ki.knowledge.propose(p.approver, { type: 'policy', title: 'Own', content: 'We always review code.', projectId: 'proj_portal' });
    assert.throws(() => ki.knowledge.accept(p.approver, own.id, {}), /own proposal/);
    assert.throws(() => ki.knowledge.accept(p.approver, k.id, { authority: 'mandated' }), /Only the owner/);
    assert.equal(ki.knowledge.accept(p.owner, k.id, { authority: 'mandated' }).authority, 5);
    assert.throws(() => ki.knowledge.verify(p.verifier, k.id, { evidenceClass: 'DECLARED', evidence: 'x' }), /OBSERVED or VERIFIED/);

    const d = await ki.knowledge.submitDecision(p.planner, { title: 'Use PostgreSQL', rationale: 'Relational integrity and team expertise', alternatives: ['MongoDB', 'MySQL'], projectId: 'proj_portal' });
    assert.equal(ki.knowledge.getDecision(p.owner, d.decisionId).status, 'proposed');
    assert.throws(() => ki.knowledge.decide(p.planner, d.decisionId, { approve: true }), /lacks permission/);
    const out = ki.knowledge.decide(p.approver, d.decisionId, { approve: true, note: 'ok' });
    assert.equal(out.status, 'approved'); assert.deepEqual(out.alternatives, ['MongoDB', 'MySQL']);
    assert.equal(ki.knowledge.get(p.owner, d.knowledgeId).authority, 3);
    // a replacing decision supersedes the earlier one on approval
    const d2 = await ki.knowledge.submitDecision(p.planner, { title: 'Use CockroachDB', rationale: 'Multi-region', projectId: 'proj_portal', supersedesDecisionId: d.decisionId, subjectKey: 'none' });
    ki.db.run(`UPDATE ki_conflicts SET status='dismissed' WHERE status='open'`); ki.db.run(`UPDATE ki_knowledge SET status='proposed' WHERE id=?`, [d2.knowledgeId]);
    ki.knowledge.decide(p.approver, d2.decisionId, { approve: true });
    assert.equal(ki.knowledge.getDecision(p.owner, d.decisionId).status, 'superseded');
    assert.equal(ki.knowledge.get(p.owner, d.knowledgeId).status, 'superseded');
  } finally { h.cleanup(); }
});
