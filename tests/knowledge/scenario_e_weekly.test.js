'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeKi } = require('./helpers');
const { Briefings } = require('../../src/knowledge/work/briefings');

test('Scenario E: weekly review distinguishes requested, accepted, assigned, in-progress, reported-done and verified work', async () => {
  const h = makeKi({ now: '2026-11-02T09:00:00.000Z' }); const { ki, principals: p, work } = h; // Monday
  try {
    const mk = async (text, id, day) => {
      const src = ki.sources.capture(p.orchestrator, { platform: 'slack', channel: 'C-PORTAL', messageId: id, authorId: 'barbara', authorName: 'Barbara', text, originalTs: day, projectId: 'proj_portal' });
      return (await ki.commitments.extractFromSource(p.orchestrator, src.id, {})).created[0];
    };
    // several commitments over the week
    const c1 = await mk('Please complete the security review by Thursday.', 'e1', '2026-11-02T09:00:00Z');
    const c2 = await mk('Can you send the delivery estimate by Friday?', 'e2', '2026-11-02T09:05:00Z');
    const c3 = await mk('Please fix the login bug by Wednesday.', 'e3', '2026-11-02T09:10:00Z');
    const c4 = await mk('Please update the onboarding docs by Friday.', 'e4', '2026-11-02T09:15:00Z');
    const c5 = await mk('We need the invoice export by Friday.', 'e5', '2026-11-02T09:20:00Z');
    const c6 = await mk('Please prepare the launch checklist.', 'e6', '2026-11-02T09:25:00Z'); // stays unconfirmed
    for (const id of [c1, c2, c3, c4, c5]) ki.commitments.confirm(p.orchestrator, id, { responsibleId: 'atlas' });
    // tasks: c1 done+verified, c2 done but NOT verified, c3 in progress (overdue by Thursday), c4 blocked, c5 only accepted (no task)
    for (const [id, st] of [['T1', 'open'], ['T2', 'open'], ['T3', 'open'], ['T4', 'open']]) work.addTask({ id, title: `Task ${id}`, assignee: 'atlas', status: st });
    ki.commitments.linkTask(p.orchestrator, c1, 'T1'); ki.commitments.linkTask(p.orchestrator, c2, 'T2'); ki.commitments.linkTask(p.orchestrator, c3, 'T3'); ki.commitments.linkTask(p.orchestrator, c4, 'T4');
    h.setNow('2026-11-03T12:00:00Z');
    work.setStatus('T1', 'done'); work.addEvidence('T1', 'kael', { details: 'security checklist OK' });
    ki.commitments.fulfil(p.orchestrator, c1, { note: 'verified' });
    work.setStatus('T2', 'done'); // agent says done, nobody verified
    work.setStatus('T3', 'in_progress');
    ki.commitments.updateStatus(p.orchestrator, c4, 'blocked', 'waiting for design assets');
    // decision approved this week + requirement change
    const d = await ki.knowledge.submitDecision(p.planner, { title: 'Use Stripe for billing', rationale: 'Existing contract', projectId: 'proj_portal' });
    ki.knowledge.decide(p.approver, d.decisionId, { approve: true, note: 'go' });
    const r1 = await ki.knowledge.propose(p.planner, { type: 'requirement', title: 'Report export format', content: 'Reports must be exportable as CSV.', projectId: 'proj_portal' });
    ki.knowledge.accept(p.approver, r1.id, {});
    const r2 = await ki.knowledge.propose(p.planner, { type: 'requirement', title: 'Report export format v2', content: 'Reports must be exportable as CSV and XLSX.', projectId: 'proj_portal', subjectKey: 'report-export' });
    ki.knowledge.supersede(p.approver, r1.id, r2.id, 'client asked for XLSX'); ki.knowledge.accept(p.approver, r2.id, {});
    h.setNow('2026-11-06T12:00:00Z'); // Friday noon: c3 (due Wed) overdue

    const review = ki.briefings.weeklyReview(p.orchestrator, { weekEnding: '2026-11-06T18:00:00.000Z', projectId: 'proj_portal' });
    const sec = (n) => review.sections.find((s) => s.title.startsWith(n));
    const texts = (n) => sec(n).items.map((i) => i.text).join('\n');
    assert.equal(sec('1.').count, 6, 'six requests received');
    assert.equal(sec('2.').count, 6);
    assert.equal(sec('3. Completed').count, 1); assert.match(texts('3. Completed'), /security review.*verified by kael/i);
    assert.equal(sec('3b').count, 1); assert.match(texts('3b'), /delivery estimate/i);
    assert.ok(!/delivery estimate/i.test(texts('3. Completed')), 'reported-done is NOT counted as completed');
    assert.match(texts('5.'), /login bug/); assert.match(texts('6.'), /onboarding docs|waiting for design assets/);
    assert.match(texts('4.'), /invoice export/); assert.ok(!/login bug/.test(texts('4.')), 'overdue items are not double counted as merely outstanding');
    assert.match(texts('7.'), /Use Stripe/); assert.match(texts('8.'), /requirement superseded|requirement accepted|Report export/i);
    assert.ok(sec('9.').count >= 3); assert.equal(sec('Awaiting').count, 1);
    assert.deepEqual(review.funnel, { requested: 1, accepted: 1, assigned: 0, in_progress: 1, reported_done_unverified: 1, verified_done: 1, blocked: 1 });
    assert.ok(review.attention.some((a) => /NOT verified/.test(a.text)));
    // every assertion is traceable to a record
    for (const s of review.sections) for (const i of s.items) assert.ok(i.evidence.length > 0, `${s.title}: "${i.text}" has no evidence`);
    assert.ok(sec('1.').items.every((i) => i.evidence[0].type === 'source'));
    // idempotent for the same window; markdown render works
    const again = ki.briefings.weeklyReview(p.orchestrator, { weekEnding: '2026-11-06T18:00:00.000Z', projectId: 'proj_portal' });
    assert.equal(again.reused, true); assert.equal(again.reportId, review.reportId);
    assert.match(Briefings.toMarkdown(review), /## 3b\. Reported done, not yet verified/);
    // organisation-wide and delivery report agree with the records
    const dr = ki.briefings.deliveryReport(p.orchestrator, { projectId: 'proj_portal' });
    assert.deepEqual(dr.totals, { promised: 5, delivered: 1, outstanding: 4, deliveredPct: 20 });
    // a viewer role with no project membership sees nothing of this project
    assert.throws(() => ki.briefings.weeklyReview(p.otherProjectAgent, { projectId: 'proj_portal' }), /No access to project/);
  } finally { h.cleanup(); }
});

test('project/organisation/agent/pre-task briefings and change intelligence come from records', async () => {
  const h = makeKi({ now: '2026-11-04T09:00:00.000Z' }); const { ki, principals: p, work } = h;
  try {
    work.addTask({ id: 'T9', title: 'Build export', assignee: 'atlas', status: 'blocked', criteria: ['CSV works'] });
    work.addHumanDecision({ description: 'Approve production deploy window' });
    const c = ki.commitments.propose(p.planner, { kind: 'deliverable', description: 'Ship export', projectId: 'proj_portal', deadlineAt: '2026-11-03T00:00:00Z' });
    ki.commitments.confirm(p.orchestrator, c.id, { responsibleId: 'atlas' }); ki.commitments.linkTask(p.orchestrator, c.id, 'T9');
    const pb = ki.briefings.projectBriefing(p.orchestrator, 'proj_portal');
    const titles = pb.sections.map((s) => s.title);
    assert.ok(titles.includes('Objectives') && titles.includes('Risks and blockers') && titles.includes('Outstanding commitments'));
    const risks = pb.sections.find((s) => s.title.startsWith('Risks')).items.map((i) => i.text).join('\n');
    assert.match(risks, /Overdue: Ship export/); assert.match(risks, /Task T9 is blocked/); assert.match(risks, /Decision awaiting a human: Approve production deploy window/);
    assert.ok(pb.attention.length >= 2 && pb.attention.every((a) => a.severity === "high" && a.evidence.length), "attention lists high-severity risks with evidence");
    const ab = ki.briefings.agentBriefing(p.engineer, 'atlas'.replace('atlas', 'atlas'));
    assert.ok(ab.sections.find((s) => s.title === 'Your tasks (from the work system)').items.some((i) => /T9/.test(i.text)));
    const pre = await ki.briefings.preTask(p.orchestrator, 'T9', { assemble: true });
    assert.ok(pre.packageId && pre.sections.some((s) => s.title === 'Commitments this task serves' && s.items.length === 1));
    const ch = ki.intel.changes(p.orchestrator, { projectId: 'proj_portal', since: '2026-11-01T00:00:00Z' });
    assert.ok(ch.byCategory.new_commitments.length === 1);
    const org = ki.briefings.dailyOrganisation(p.orchestrator);
    assert.equal(org.kind, 'daily_organisation'); assert.ok(org.fingerprint);
  } finally { h.cleanup(); }
});
