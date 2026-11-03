import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { issueAgentToken } from '../src/agent-tools/tokens.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-planning-'));
const dbPath = path.join(dir, 'runtime.db');
let rt: RunningRuntime;
let db: DatabaseSync;
let roomId = '';

const call = async (method: string, route: string, body?: unknown, token: string | null = rt.token) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as any) : null };
};
let rpcId = 0;
const tool = async (token: string, name: string, args: unknown) =>
  (await call('POST', '/mcp', { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }, token)).json.result;

/** A job that has reached the plan stage. */
async function planJob(title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = (await call('POST', '/v1/jobs', { roomId, title, createdBy: 'winston', criteria: ['Existing criterion'], ...extra })).json.id as string;
  const r = await call('POST', `/v1/jobs/${id}/stage`, { to: 'plan', actorId: 'winston' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return id;
}

const packet = (over: Record<string, unknown> = {}) => ({
  summary: 'Build the thing in two steps',
  risk: 'low',
  criteria: ['Existing criterion', 'New criterion'],
  tasks: [
    { key: 'a', title: 'Step A', assigneeId: 'builder1', criteriaRefs: [0] },
    { key: 'b', title: 'Step B', assigneeId: 'builder2', dependsOn: ['a'], criteriaRefs: [0, 1], verificationRequired: true, priority: 2 },
  ],
  ...over,
});

before(async () => {
  rt = await startRuntime({ dbPath });
  db = new DatabaseSync(dbPath);
  roomId = (await call('POST', '/v1/rooms', { name: 'planning-room' })).json.id;
  for (const [id, role] of [['builder1', 'builder'], ['builder2', 'builder'], ['planner1', 'planner']]) {
    await call('POST', '/v1/identities', { id, name: id, role, runtime: 'claude' });
  }
});

after(async () => {
  db.close();
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a valid packet materialises tasks with mapped depends_on and criteria links', async () => {
  const jobId = await planJob('Materialise');
  const r = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet());
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const job = (await call('GET', `/v1/jobs/${jobId}`)).json;
  assert.equal(job.tasks.length, 2);
  const a = job.tasks.find((t: any) => t.title === 'Step A');
  const b = job.tasks.find((t: any) => t.title === 'Step B');
  assert.deepEqual(b.dependsOn, [a.id], 'keys are mapped to real task ids');
  assert.equal(b.priority, 2);
  assert.equal(b.verificationRequired, true);
  assert.equal(job.criteria.length, 2, 'existing criterion is not duplicated; the new one is added');
  const newCrit = job.criteria.find((c: any) => c.text === 'New criterion');
  assert.deepEqual(new Set(newCrit.taskIds), new Set([b.id]));
  const existing = job.criteria.find((c: any) => c.text === 'Existing criterion');
  assert.deepEqual(new Set(existing.taskIds), new Set([a.id, b.id]));
  assert.equal(job.plan.risk, 'low');
  assert.deepEqual(job.plan.taskKeys, { a: a.id, b: b.id });
  const ev = db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'plan.submitted' AND job_id = ?").get(jobId) as { n: number };
  assert.equal(ev.n, 1);
});

test('a dependency cycle is a 409 and nothing is written; unknown assignee and unknown key are 400', async () => {
  const jobId = await planJob('Invalid');
  const cyc = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet({
    tasks: [{ key: 'a', title: 'A', dependsOn: ['b'] }, { key: 'b', title: 'B', dependsOn: ['a'] }],
  }));
  assert.equal(cyc.status, 409);
  const unknown = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet({ tasks: [{ key: 'a', title: 'A', assigneeId: 'nobody' }] }));
  assert.equal(unknown.status, 400);
  const badKey = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet({ tasks: [{ key: 'a', title: 'A', dependsOn: ['zzz'] }] }));
  assert.equal(badKey.status, 400);
  const dup = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet({ tasks: [{ key: 'a', title: 'A' }, { key: 'a', title: 'A2' }] }));
  assert.equal(dup.status, 400);
  const empty = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet({ tasks: [] }));
  assert.equal(empty.status, 400);
  const job = (await call('GET', `/v1/jobs/${jobId}`)).json;
  assert.equal(job.tasks.length, 0);
  assert.equal(job.criteria.length, 1, 'no criteria were added');
  assert.equal(job.plan.summary, '');
  assert.equal(job.approvals.length, 0);
});

test('auto-accept is OFF by default: an approval is created and the stage stays plan', async () => {
  const jobId = await planJob('Default off');
  const r = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet());
  assert.equal(r.json.outcome, 'approval_requested');
  const job = (await call('GET', `/v1/jobs/${jobId}`)).json;
  assert.equal(job.stage, 'plan');
  assert.equal(job.approvals.length, 1);
  assert.equal(job.approvals[0].actionType, 'plan.accept');
  assert.equal(job.approvals[0].status, 'pending');
  assert.match(job.approvals[0].consequence, /auto-accept is off/);
  assert.equal(job.approvals[0].action.recommendation, 'Build the thing in two steps');
});

test('approving the plan.accept approval accepts the plan and moves to build', async () => {
  const jobId = await planJob('Approve me');
  const r = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet({ risk: 'medium' }));
  const dec = await call('POST', `/v1/approvals/${r.json.approvalId}/decision`, { decision: 'approve', decidedBy: 'winston' });
  assert.equal(dec.status, 200, JSON.stringify(dec.json));
  const job = (await call('GET', `/v1/jobs/${jobId}`)).json;
  assert.equal(job.stage, 'build');
  assert.equal(job.plan.approvedBy, 'winston');
});

test('flag on + low risk auto-accepts; medium risk, human decisions, or exceeded budget still ask', async () => {
  await call('POST', '/v1/settings', { 'workflow.autoAcceptLowRisk': true });
  try {
    const low = await planJob('Auto low');
    const r = await call('POST', `/v1/jobs/${low}/plan/submit`, packet());
    assert.equal(r.json.outcome, 'auto_accepted');
    assert.equal((await call('GET', `/v1/jobs/${low}`)).json.stage, 'build');
    const ev = db.prepare("SELECT payload FROM events WHERE type = 'plan.auto_accepted' AND job_id = ?").get(low) as { payload: string };
    assert.match(JSON.parse(ev.payload).reason, /low/);

    const med = await planJob('Auto medium');
    assert.equal((await call('POST', `/v1/jobs/${med}/plan/submit`, packet({ risk: 'medium' }))).json.outcome, 'approval_requested');
    assert.equal((await call('GET', `/v1/jobs/${med}`)).json.stage, 'plan');

    const dec = await planJob('Auto decisions');
    assert.equal((await call('POST', `/v1/jobs/${dec}/plan/submit`, packet({ humanDecisions: ['Pick a vendor'] }))).json.outcome, 'approval_requested');

    const over = await planJob('Auto over budget', { budgetCents: 100 });
    db.prepare('UPDATE jobs SET cost_cents = 100 WHERE id = ?').run(over);
    assert.equal((await call('POST', `/v1/jobs/${over}/plan/submit`, packet())).json.outcome, 'approval_requested');
  } finally {
    await call('POST', '/v1/settings', { 'workflow.autoAcceptLowRisk': false });
  }
});

test('resubmission replaces untouched tasks, supersedes the old approval; started tasks make it 409', async () => {
  const jobId = await planJob('Resubmit');
  const first = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet());
  const second = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet({ tasks: [{ key: 'only', title: 'Only step' }] }));
  assert.equal(second.status, 200);
  const job = (await call('GET', `/v1/jobs/${jobId}`)).json;
  assert.deepEqual(job.tasks.map((t: any) => t.title), ['Only step']);
  assert.equal(job.approvals.filter((a: any) => a.status === 'pending').length, 1);
  assert.equal((await call('GET', `/v1/approvals/${first.json.approvalId}`)).json.status, 'declined');
  const taskId = job.tasks[0].id;
  await call('POST', `/v1/tasks/${taskId}/transition`, { to: 'assigned', assigneeId: 'builder1', actorId: 'winston' });
  const third = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet());
  assert.equal(third.status, 409);
  assert.equal((await call('GET', `/v1/jobs/${jobId}`)).json.tasks.length, 1, 'untouched by the failed resubmission');
});

test('submit is refused outside the plan stage', async () => {
  const id = (await call('POST', '/v1/jobs', { roomId, title: 'Still brief', createdBy: 'winston' })).json.id;
  assert.equal((await call('POST', `/v1/jobs/${id}/plan/submit`, packet())).status, 409);
});

test('plan_submit over MCP: a planner may, a member may not; actor comes from the token', async () => {
  const jobId = await planJob('MCP plan');
  const planner = issueAgentToken(db, { identityId: 'planner1', jobId, role: 'planner' });
  const member = issueAgentToken(db, { identityId: 'builder1', jobId, role: 'member' });
  const denied = await tool(member.token, 'plan_submit', packet());
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /needs one of the roles/);
  const ok = await tool(planner.token, 'plan_submit', packet());
  assert.equal(ok.isError, false, JSON.stringify(ok));
  assert.equal(ok.structuredContent.outcome, 'approval_requested');
  const ev = db.prepare("SELECT actor_id, actor_kind FROM events WHERE type = 'plan.submitted' AND job_id = ?").get(jobId) as { actor_id: string; actor_kind: string };
  assert.equal(ev.actor_id, 'planner1');
  assert.equal(ev.actor_kind, 'agent');
  const cycle = await tool(planner.token, 'plan_submit', packet({ tasks: [{ key: 'a', title: 'A', dependsOn: ['a'] }] }));
  assert.equal(cycle.isError, true);
});

test('task_claim: assignee acks (pending->assigned->acknowledged), idempotent, others rejected, unready rejected', async () => {
  const jobId = await planJob('Claims');
  await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet());
  const job = (await call('GET', `/v1/jobs/${jobId}`)).json;
  const a = job.tasks.find((t: any) => t.title === 'Step A');
  const b = job.tasks.find((t: any) => t.title === 'Step B');
  const b1 = issueAgentToken(db, { identityId: 'builder1', jobId, taskId: a.id });
  const b2 = issueAgentToken(db, { identityId: 'builder2', jobId, taskId: a.id });
  const other = await tool(b2.token, 'task_claim', {});
  assert.equal(other.isError, true);
  assert.match(other.content[0].text, /assigned to builder1/);

  const first = await tool(b1.token, 'task_claim', {});
  assert.equal(first.isError, false, JSON.stringify(first));
  assert.equal(first.structuredContent.status, 'acknowledged');
  assert.equal(first.structuredContent.alreadyClaimed, false);
  const types = (db.prepare('SELECT type FROM events WHERE task_id = ? ORDER BY seq').all(a.id) as { type: string }[]).map((e) => e.type);
  assert.deepEqual(types, ['task.assigned', 'task.acknowledged']);

  const again = await tool(b1.token, 'task_claim', {});
  assert.equal(again.isError, false);
  assert.equal(again.structuredContent.alreadyClaimed, true);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'task.acknowledged' AND task_id = ?").get(a.id) as { n: number }).n, 1);

  const notReady = issueAgentToken(db, { identityId: 'builder2', jobId, taskId: b.id });
  const early = await tool(notReady.token, 'task_claim', {});
  assert.equal(early.isError, true);
  assert.match(early.content[0].text, /not ready/);

  // an already-assigned task is acknowledged directly
  await call('POST', `/v1/tasks/${a.id}/transition`, { to: 'failed', actorId: 'winston' });
  assert.equal((await tool(b1.token, 'task_claim', {})).isError, true, 'failed tasks cannot be claimed');
});

test('needs-you lists each source once, and resolving removes it', async () => {
  // approvals + blockers + task states + budget + delivery on fresh jobs
  const jobId = await planJob('Needs you');
  const sub = await call('POST', `/v1/jobs/${jobId}/plan/submit`, packet());
  const approvalId = sub.json.approvalId as string;

  const blk = issueAgentToken(db, { identityId: 'builder1', jobId });
  const raised = await tool(blk.token, 'blocker_raise', { summary: 'Need credentials', needs: 'API key', severity: 'high' });
  const blockerId = raised.structuredContent.blockerId as string;

  const job = (await call('GET', `/v1/jobs/${jobId}`)).json;
  const a = job.tasks.find((t: any) => t.title === 'Step A');
  await call('POST', `/v1/tasks/${a.id}/transition`, { to: 'assigned', assigneeId: 'builder1', actorId: 'winston' });
  await call('POST', `/v1/tasks/${a.id}/transition`, { to: 'failed', actorId: 'winston' });
  await call('POST', `/v1/tasks/${a.id}/transition`, { to: 'reassignment_required', actorId: 'winston' });

  const overJob = await planJob('Over budget', { budgetCents: 50 });
  db.prepare('UPDATE jobs SET cost_cents = 60 WHERE id = ?').run(overJob);

  const deliveryJob = await planJob('Delivery');
  db.prepare("UPDATE jobs SET stage = 'approve' WHERE id = ?").run(deliveryJob);

  const items = (await call('GET', '/v1/needs-you')).json as { kind: string; id: string; jobId: string }[];
  const count = (kind: string, id: string) => items.filter((i) => i.kind === kind && i.id === id).length;
  assert.equal(count('approval', approvalId), 1);
  assert.equal(count('blocker', blockerId), 1);
  assert.equal(count('task_reassignment_required', a.id), 1);
  assert.equal(count('budget_exception', overJob), 1);
  assert.equal(count('delivery_approval', deliveryJob), 1);
  assert.equal(new Set(items.map((i) => `${i.kind}:${i.id}`)).size, items.length, 'no duplicates');

  assert.equal((await call('GET', '/v1/blockers?status=open')).json.some((b: any) => b.id === blockerId), true);

  // resolve each
  assert.equal((await call('POST', `/v1/blockers/${blockerId}/resolve`, { resolvedBy: 'winston' })).status, 200);
  assert.equal((await call('POST', `/v1/blockers/${blockerId}/resolve`, { resolvedBy: 'winston' })).status, 409);
  await call('POST', `/v1/approvals/${approvalId}/decision`, { decision: 'decline', decidedBy: 'winston' });
  await call('POST', `/v1/tasks/${a.id}/transition`, { to: 'needs_human', actorId: 'winston' });
  let after = (await call('GET', '/v1/needs-you')).json as { kind: string; id: string }[];
  assert.equal(after.some((i) => i.kind === 'blocker' && i.id === blockerId), false);
  assert.equal(after.some((i) => i.kind === 'approval' && i.id === approvalId), false);
  assert.equal(after.some((i) => i.kind === 'task_reassignment_required' && i.id === a.id), false);
  assert.equal(after.filter((i) => i.kind === 'task_needs_human' && i.id === a.id).length, 1, 'moves to its new source, once');
  await call('POST', `/v1/tasks/${a.id}/transition`, { to: 'pending', actorId: 'winston' });
  db.prepare('UPDATE jobs SET cost_cents = 0 WHERE id = ?').run(overJob);
  db.prepare("UPDATE jobs SET stage = 'done' WHERE id = ?").run(deliveryJob);
  after = (await call('GET', '/v1/needs-you')).json;
  for (const [k, id] of [['task_needs_human', a.id], ['budget_exception', overJob], ['delivery_approval', deliveryJob]]) {
    assert.equal(after.some((i) => i.kind === k && i.id === id), false, `${k} resolved`);
  }
  assert.equal((await call('GET', '/v1/needs-you', undefined, null)).status, 401, 'owner token required');
});
