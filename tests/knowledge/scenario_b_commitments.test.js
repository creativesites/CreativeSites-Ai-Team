'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeKi } = require('./helpers');
const { captureSlackMessage } = require('../../src/knowledge/sources/adapters');

const SCOPE = { workspace: 'creativesites', channels: ['C-PORTAL'], projectByChannel: { 'C-PORTAL': 'proj_portal' }, workspace_url: 'https://creativesites.slack.com' };
const MSG = { channel: 'C-PORTAL', ts: '1762250400.000100', user: 'barbara', user_name: 'Barbara', text: 'Hi team, can you please do a security review and a delivery estimate by Friday? Thanks!' }; // Wed 2026-11-04 10:00Z

test('Scenario B: Barbara\'s Slack message becomes verified, fulfilled commitments (commitments != tasks)', async () => {
  const h = makeKi(); const { ki, principals: p, work } = h;
  try {
    // 1-2: capture with provenance; original text preserved and immutable
    const cap = captureSlackMessage(ki, p.orchestrator, MSG, SCOPE);
    assert.equal(cap.duplicate, false);
    assert.equal(captureSlackMessage(ki, p.orchestrator, MSG, SCOPE).duplicate, true, 'same message id is not captured twice');
    const src = ki.sources.get(p.orchestrator, cap.id);
    assert.deepEqual([src.platform, src.workspace, src.channel, src.messageId, src.authorId, src.originalTs], ['slack', 'creativesites', 'C-PORTAL', MSG.ts, 'barbara', '2025-11-04T10:00:00.000Z']);
    assert.equal(src.text, MSG.text); assert.equal(src.evidenceType, 'original_evidence'); assert.equal(src.trust, 'untrusted');
    assert.equal(src.originalUrl, 'https://creativesites.slack.com/archives/C-PORTAL/p1762250400000100');
    assert.throws(() => ki.db.run('UPDATE ki_sources SET text=? WHERE id=?', ['tampered', cap.id]), /immutable/);
    assert.throws(() => ki.db.run('DELETE FROM ki_sources WHERE id=?', [cap.id]), /cannot be deleted/);

    // 3-5: extraction -> two proposed commitments, Friday deadline resolved, project from the channel, NOT auto-assigned
    h.setNow('2025-11-04T10:00:30.000Z');
    const ex = await ki.commitments.extractFromSource(p.orchestrator, cap.id, {});
    assert.equal(ex.created.length, 2);
    const cs = ex.created.map((id) => ki.commitments.get(p.orchestrator, id));
    assert.deepEqual(cs.map((c) => c.description).sort(), ['A delivery estimate'.replace('A ', 'Do a '), 'Do a security review']);
    for (const c of cs) {
      assert.equal(c.status, 'needs_confirmation'); assert.equal(c.confirmation, 'unconfirmed');
      assert.equal(c.deadlineAt, '2025-11-07T23:59:59.000Z'); assert.equal(c.projectId, 'proj_portal');
      assert.equal(c.responsibleId, null, 'ambiguous statements are not auto-assigned');
      assert.equal(c.sourceAuthor, 'barbara'); assert.equal(c.source.id, cap.id);
    }
    assert.equal((await ki.commitments.extractFromSource(p.orchestrator, cap.id, {})).created.length, 0, 're-extraction is idempotent');
    assert.equal(ki.commitments.awaitingConfirmation(p.orchestrator).length, 2);

    // an engineer may not confirm or fulfil
    assert.throws(() => ki.commitments.confirm(p.engineer, cs[0].id, {}), /lacks permission/);
    // 5: confirm; 6: assign + link tasks (one task satisfies both: many-to-many)
    const [review, estimate] = cs[0].description.includes('security') ? [cs[0], cs[1]] : [cs[1], cs[0]];
    ki.commitments.confirm(p.orchestrator, review.id, { responsibleId: 'atlas', note: 'Barbara is the client contact' });
    ki.commitments.confirm(p.orchestrator, estimate.id, { responsibleId: 'atlas', acceptanceCriteria: ['Estimate covers dev and QA', 'Estimate states assumptions'] });
    work.addTask({ id: 'T_SEC', title: 'Run security review', assignee: 'atlas', criteria: ['No critical findings open'] });
    work.addTask({ id: 'T_SHARED', title: 'Prepare review notes and sizing', assignee: 'atlas' });
    ki.commitments.linkTask(p.orchestrator, review.id, 'T_SEC', 'satisfied_by');
    ki.commitments.linkTask(p.orchestrator, review.id, 'T_SHARED', 'generated');
    ki.commitments.linkTask(p.orchestrator, estimate.id, 'T_SHARED', 'satisfied_by');
    assert.equal(ki.commitments.get(p.orchestrator, review.id).status, 'assigned');
    assert.deepEqual(ki.commitments.commitmentsForTask(p.orchestrator, 'T_SHARED').map((c) => c.id).sort(), [review.id, estimate.id].sort());
    assert.throws(() => ki.commitments.linkTask(p.orchestrator, review.id, 'T_MISSING'), /not found/);

    // 7: work is "completed" by the agent. That is NOT fulfilment.
    ki.commitments.updateStatus(p.engineer, review.id, 'in_progress', 'started');
    work.setStatus('T_SEC', 'done'); work.setStatus('T_SHARED', 'done');
    assert.throws(() => ki.commitments.updateStatus(p.engineer, review.id, 'fulfilled'), /cannot be set directly/);
    assert.throws(() => ki.commitments.fulfil(p.orchestrator, review.id), (e) => e.code === 'ILLEGAL_STATE' && e.details.failing.length === 2);
    assert.equal(ki.intel.stageOf(p.orchestrator, { id: review.id, status: 'in_progress' }), 'reported_done_unverified');
    // the assignee verifying their own work does not count (self-verification is rejected by the work port)
    work.addEvidence('T_SEC', 'atlas'); work.addEvidence('T_SHARED', 'atlas');
    assert.throws(() => ki.commitments.fulfil(p.orchestrator, review.id), /not independently verified/);
    // agent-submitted evidence is only a claim
    const claim = ki.commitments.submitEvidence(p.engineer, review.id, { summary: 'Review done, see report', evidenceClass: 'VERIFIED' });
    assert.equal(claim.recordedClass, 'DECLARED'); assert.equal(claim.downgraded, true);
    assert.throws(() => ki.commitments.fulfil(p.engineer, review.id), /responsible party cannot declare/);

    // 8-9: independent verification in the work system, then the gate opens
    work.addEvidence('T_SEC', 'kael', { details: 'pen-test checklist complete, exit 0' }); work.addEvidence('T_SHARED', 'kael');
    const done = ki.commitments.fulfil(p.orchestrator, review.id, { note: 'Verified by Kael' });
    assert.equal(done.status, 'fulfilled');
    assert.ok(done.evidence.some((e) => e.independentlyVerified && e.verifiedBy === 'kael' && e.taskId === 'T_SEC'));
    assert.deepEqual(done.history.map((x) => x.to_status), ['detected', 'needs_confirmation', 'accepted', 'assigned', 'in_progress', 'fulfilled']);

    // estimate has a shared verified task but ALSO acceptance criteria; with tasks linked the work system's verification is authoritative
    assert.equal(ki.commitments.fulfil(p.orchestrator, estimate.id).status, 'fulfilled');
    assert.equal(ki.commitments.list(p.orchestrator, { status: 'fulfilled' }).length, 2);
    assert.throws(() => ki.commitments.fulfil(p.orchestrator, estimate.id), /Cannot fulfil a fulfilled/);
    assert.ok(ki.audit.list({ action: 'commitment.fulfil' }).length === 2);
  } finally { h.cleanup(); }
});

test('commitments without tasks need independent evidence covering acceptance criteria; amendments, rejection, overdue are tracked', async () => {
  const h = makeKi({ now: '2025-11-03T09:00:00.000Z' }); const { ki, principals: p } = h;
  try {
    const { id } = ki.commitments.propose(p.engineer, { kind: 'deliverable', description: 'Publish the migration runbook', projectId: 'proj_portal', deadlineAt: '2025-11-05T17:00:00.000Z', acceptanceCriteria: ['Runbook reviewed', 'Rollback steps included'], confidence: 0.9 });
    assert.equal(ki.commitments.get(p.engineer, id).status, 'needs_confirmation');
    assert.throws(() => ki.commitments.confirm(p.engineer, id, {}), /lacks permission/, 'agents cannot confirm their own proposal');
    ki.commitments.confirm(p.orchestrator, id, { responsibleId: 'lyra' });
    ki.commitments.assign(p.orchestrator, id, { responsibleId: 'lyra' });
    assert.throws(() => ki.commitments.fulfil(p.orchestrator, id), /No independently verified evidence/);
    const e1 = ki.commitments.submitEvidence(p.engineer2, id, { summary: 'Runbook merged: docs/runbook.md', criteria: [0, 1] });
    assert.throws(() => ki.commitments.verifyEvidence(p.engineer2, e1.id, {}), /lacks permission/);
    ki.commitments.verifyEvidence(p.verifier, e1.id, { note: 'Reviewed runbook and rollback section' });
    // verified evidence that does not cover every criterion is not enough
    const part = ki.commitments.submitEvidence(p.verifier, id, { summary: 'second', criteria: [0] });
    assert.equal(ki.commitments.get(p.owner, id).evidence.filter((e) => e.independentlyVerified).length, 1);
    assert.equal(ki.commitments.fulfil(p.orchestrator, id).status, 'fulfilled');

    // overdue is derived, not stored; sweeping emits once
    const o = ki.commitments.propose(p.planner, { kind: 'action_item', description: 'Send onboarding checklist', projectId: 'proj_portal', deadlineAt: '2025-11-03T12:00:00.000Z' });
    ki.commitments.confirm(p.orchestrator, o.id, {});
    assert.equal(ki.commitments.overdue(p.orchestrator).length, 0);
    h.advance(24 * 3600 * 1000);
    const od = ki.commitments.overdue(p.orchestrator);
    assert.equal(od.length, 1); assert.equal(od[0].effectiveStatus, 'overdue'); assert.equal(od[0].status, 'accepted');
    assert.equal(ki.commitments.sweepOverdue(p.orchestrator).emitted, 1); assert.equal(ki.commitments.sweepOverdue(p.orchestrator).emitted, 0);
    // blocked keeps the prior state and needs a reason
    assert.throws(() => ki.commitments.updateStatus(p.orchestrator, o.id, 'blocked'), /reason/);
    const b = ki.commitments.updateStatus(p.orchestrator, o.id, 'blocked', 'waiting for client logo');
    assert.equal(b.status, 'blocked'); assert.equal(b.blockedReason, 'waiting for client logo');
    // rejection requires a reason; terminal states stay terminal
    const r = ki.commitments.propose(p.planner, { kind: 'question', description: 'Is the logo final?' });
    assert.throws(() => ki.commitments.reject(p.orchestrator, r.id, ''), /reason/);
    ki.commitments.reject(p.orchestrator, r.id, 'answered in thread');
    assert.throws(() => ki.commitments.confirm(p.orchestrator, r.id, {}), /awaiting confirmation/);
    // ambiguous deadlines are flagged, never guessed
    h.setNow('2025-11-07T09:00:00.000Z'); // a Friday
    const src = ki.sources.capture(p.orchestrator, { platform: 'slack', channel: 'C1', messageId: 'm9', authorId: 'barbara', text: 'Please send the report by Friday.', originalTs: '2025-11-07T09:00:00.000Z', projectId: 'proj_portal' });
    const ex = await ki.commitments.extractFromSource(p.orchestrator, src.id, {});
    const amb = ki.commitments.get(p.orchestrator, ex.created[0]);
    assert.equal(amb.deadlineAt, null); assert.equal(amb.deadlineNeedsClarification, true);
  } finally { h.cleanup(); }
});
