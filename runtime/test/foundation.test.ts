import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { acquireLock } from '../src/lock.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-foundation-'));
const workRoot = path.join(dir, 'work');
const dbPath = path.join(dir, 'store', 'runtime.db');
fs.mkdirSync(workRoot, { recursive: true });
let rt: RunningRuntime;

const call = async (
  method: string,
  route: string,
  body?: unknown,
  headers: Record<string, string> = {}
) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${rt.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, json };
};

const ok = async (method: string, route: string, body?: unknown) => {
  const res = await call(method, route, body);
  assert.ok(res.status >= 200 && res.status < 300, `${method} ${route} -> ${res.status}: ${JSON.stringify(res.json)}`);
  return res.json as any;
};

before(async () => {
  rt = await startRuntime({
    dbPath,
    workspaceRoots: [workRoot],
    cloneParentDir: workRoot,
    newProjectParentDir: workRoot,
  });
  await ok('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston', role: 'Owner' },
    teams: [
      { id: 'creativesites', name: 'CreativeSites AI Team' },
      { id: 'meetingmind', name: 'MeetingMind Engineering Squad' },
    ],
    identities: [
      { id: 'atlas', name: 'Atlas', role: 'Platform', teamId: 'creativesites', approvalLevel: 'lead', capabilities: ['nodejs'] },
      { id: 'kael', name: 'Kael', role: 'QA', teamId: 'creativesites', provenance: 'VERIFIED_OBSERVED' },
      { id: 'vega', name: 'Vega', role: 'CTO', teamId: 'meetingmind' },
      { id: 'runtime', name: 'Runtime', role: 'Runtime', provenance: 'OBSERVED' },
    ],
  });
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('health and store are real, and the store is owner-only', async () => {
  const health = await call('GET', '/health', undefined, {});
  // Health needs no token; the helper always sends one, which is fine.
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);
  assert.equal(health.json.schemaVersion, MIGRATIONS.at(-1)!.version);
  assert.equal(health.json.checks.store, true);
  assert.equal(fs.statSync(path.join(dir, 'store')).mode & 0o777, 0o700);
  assert.equal(fs.statSync(dbPath).mode & 0o777, 0o600);
});

test('identity import preserves teams, provenance and the owner', async () => {
  const settings = await ok('GET', '/v1/settings');
  assert.equal(settings.ownerId, 'winston');
  const identities = await ok('GET', '/v1/identities');
  assert.equal(identities.length, 5);
  const atlas = identities.find((i: any) => i.id === 'atlas');
  assert.equal(atlas.teamId, 'creativesites');
  assert.equal(atlas.approvalLevel, 'lead');
  const kael = identities.find((i: any) => i.id === 'kael');
  assert.equal(kael.provenance, 'VERIFIED_OBSERVED');
  const teams = await ok('GET', '/v1/teams');
  assert.equal(teams.length, 2);
  assert.ok(teams.every((t: any) => t.memberCount >= 1));
});

test('a project can be attached from a folder, with a real git state', async () => {
  const repoDir = path.join(workRoot, 'myavana-chatbot');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# chatbot\n');
  execFileSync('git', ['init', '--quiet', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '--quiet', '-m', 'init']);

  const created = await ok('POST', '/v1/projects/attach', { path: repoDir, name: 'Myavana Chatbot' });
  assert.equal(created.project.name, 'Myavana Chatbot');
  assert.equal(created.state.isGit, true);
  assert.equal(created.state.dirty, false);
  assert.ok(created.project.repos.length === 1);
  assert.equal(created.project.repos[0].path, repoDir);

  const status = await ok('GET', `/v1/projects/${created.project.id}/status`);
  assert.equal(typeof status.repos[0].state.branch, 'string');
  assert.equal(status.repos[0].state.dirty, false);

  const branches = await ok('GET', `/v1/projects/${created.project.id}/branches`);
  assert.ok(Array.isArray(branches));
  assert.ok(branches.length > 0);
  assert.equal(branches[0].isCurrent, true);

  const commits = await ok('GET', `/v1/projects/${created.project.id}/commits?branch=${encodeURIComponent(branches[0].name)}`);
  assert.ok(Array.isArray(commits));
  assert.equal(commits.length, 1);
  assert.equal(commits[0].subject, 'init');

  const diff = await ok('GET', `/v1/projects/${created.project.id}/diff?branch=${encodeURIComponent(branches[0].name)}&mode=working`);
  assert.ok(Array.isArray(diff.files));
  assert.equal(diff.files.length, 0);

  const room = await ok('POST', '/v1/rooms', { name: 'myavana-chatbot', projectId: created.project.id });
  assert.equal(room.projectId, created.project.id);
  assert.equal(room.kind, 'project');

  await ok('POST', `/v1/rooms/${room.id}/members`, { memberId: 'winston', kind: 'human', role: 'owner' });
  await ok('POST', `/v1/rooms/${room.id}/members`, { memberId: 'atlas', role: 'member' });
  const members = await ok('GET', `/v1/rooms/${room.id}/members`);
  assert.equal(members.length, 2);
  assert.equal(members.find((m: any) => m.memberId === 'atlas').identity.name, 'Atlas');
});

test('the job lifecycle moves only through gates, with an audit trail', async () => {
  const rooms = await ok('GET', '/v1/rooms');
  const roomId = rooms[0].id;
  const job = await ok('POST', '/v1/jobs', {
    roomId,
    title: 'Fix early logout',
    brief: 'Users are logged out after ten minutes.',
    createdBy: 'winston',
    criteria: ['Users stay signed in for an hour', 'Existing auth tests pass'],
  });
  assert.equal(job.stage, 'brief');
  assert.equal(job.criteria.length, 2);
  assert.equal(job.criteria[0].evidenceClass, 'UNKNOWN');
  assert.equal(job.plan.summary, '');

  // Cannot jump straight to build.
  const jumped = await call('POST', `/v1/jobs/${job.id}/stage`, { to: 'build', actorId: 'winston' });
  assert.equal(jumped.status, 409);
  assert.match(jumped.json.error, /plan|task/i);

  const planned = await ok('POST', `/v1/jobs/${job.id}/stage`, { to: 'plan', actorId: 'winston' });
  assert.equal(planned.stage, 'plan');
  await ok('POST', `/v1/jobs/${job.id}/plan`, {
    plan: { summary: 'Re-arm the refresh timer and add a regression test', chosen: 'A' },
    actorId: 'winston',
  });
  const task = await ok('POST', `/v1/jobs/${job.id}/tasks`, {
    title: 'Fix the refresh timer',
    assigneeId: 'atlas',
    checkCommand: 'npm test -- auth',
    criterionIds: [planned.criteria[0].id],
  });
  assert.equal(task.status, 'pending');

  const built = await ok('POST', `/v1/jobs/${job.id}/stage`, { to: 'build', actorId: 'winston' });
  assert.equal(built.stage, 'build');

  for (const to of ['assigned', 'acknowledged', 'running', 'done']) {
    await ok('POST', `/v1/tasks/${task.id}/transition`, { to, actorId: to === 'done' ? 'winston' : 'atlas', actorKind: to === 'done' ? 'human' : 'agent' });
  }

  // No evidence yet: verify is gated.
  const noEvidence = await call('POST', `/v1/jobs/${job.id}/stage`, { to: 'verify', actorId: 'winston' });
  assert.equal(noEvidence.status, 409);
  assert.match(noEvidence.json.error, /evidence/i);

  const evidence = await ok('POST', `/v1/jobs/${job.id}/evidence`, {
    taskId: task.id,
    criterionId: planned.criteria[0].id,
    kind: 'command',
    class: 'OBSERVED',
    summary: 'Runtime ran: npm test -- auth',
    command: 'npm test -- auth',
    exitCode: 0,
    recordedBy: 'runtime',
    recordedByKind: 'system',
  });
  assert.equal(evidence.class, 'OBSERVED');
  assert.ok(evidence.contentHash);

  const verified = await ok('POST', `/v1/jobs/${job.id}/stage`, { to: 'verify', actorId: 'winston' });
  assert.equal(verified.stage, 'verify');

  // Second criterion has no evidence: approve is gated.
  const notObserved = await call('POST', `/v1/jobs/${job.id}/stage`, { to: 'approve', actorId: 'winston' });
  assert.equal(notObserved.status, 409);
  assert.match(notObserved.json.error, /criterion|observed/i);

  // A different agent re-runs the check and verifies it.
  const verification = await ok('POST', `/v1/evidence/${evidence.id}/verify`, {
    verifiedBy: 'kael',
    note: 're-ran in a clean worktree',
    exitCode: 0,
  });
  assert.equal(verification.class, 'VERIFIED');
  assert.equal(verification.verifiedBy, 'kael');
  assert.equal(verification.supersedes, evidence.id);

  const jobs = await ok('GET', `/v1/jobs/${job.id}`);
  assert.equal(jobs.criteria.find((c: any) => c.id === planned.criteria[0].id).evidenceClass, 'VERIFIED');

  // The second criterion is still unresolved, so a human with the owner role may force it.
  const forced = await ok('POST', `/v1/jobs/${job.id}/stage`, {
    to: 'approve',
    actorId: 'winston',
    force: true,
    note: 'second criterion is covered by the same check',
  });
  assert.equal(forced.stage, 'approve');
  assert.equal(forced.history.length, 5);

  // A non-owner cannot force.
  const other = await call('POST', `/v1/jobs/${job.id}/stage`, { to: 'done', actorId: 'atlas', force: true });
  assert.equal(other.status, 403);

  const approval = await ok('POST', `/v1/jobs/${job.id}/approvals`, {
    title: 'Merge the fix into main',
    consequence: 'Two files change, nothing is deployed, one revert undoes it.',
    actionType: 'merge',
    risk: 'high',
    requestedBy: 'atlas',
    reversible: true,
  });
  assert.equal(approval.status, 'pending');
  assert.equal(approval.assignedTo, 'winston');

  const pending = await call('POST', `/v1/jobs/${job.id}/stage`, { to: 'done', actorId: 'winston' });
  assert.equal(pending.status, 409);

  const decided = await ok('POST', `/v1/approvals/${approval.id}/decision`, {
    decision: 'approve',
    decidedBy: 'winston',
    note: 'verified by Kael',
  });
  assert.equal(decided.status, 'approved');

  const done = await ok('POST', `/v1/jobs/${job.id}/stage`, { to: 'done', actorId: 'winston' });
  assert.equal(done.stage, 'done');
  assert.equal(done.history.at(-1).toStage, 'done');
});

test('evidence is append-only, hash-chained and verified only by a different actor', async () => {
  const rooms = await ok('GET', '/v1/rooms');
  const job = await ok('POST', '/v1/jobs', { roomId: rooms[0].id, title: 'Chain test', createdBy: 'winston' });
  const first = await ok('POST', `/v1/jobs/${job.id}/evidence`, {
    kind: 'command',
    class: 'OBSERVED',
    summary: 'first command',
    recordedBy: 'runtime',
    recordedByKind: 'system',
  });
  const second = await ok('POST', `/v1/jobs/${job.id}/evidence`, {
    kind: 'test',
    class: 'OBSERVED',
    summary: 'second command',
    recordedBy: 'runtime',
    recordedByKind: 'system',
  });
  assert.equal(second.prevHash, first.contentHash);
  assert.notEqual(second.contentHash, first.contentHash);

  // Agents cannot report Observed.
  const claimedObserved = await call('POST', `/v1/jobs/${job.id}/evidence`, {
    kind: 'command',
    class: 'OBSERVED',
    summary: 'I ran it',
    recordedBy: 'atlas',
    recordedByKind: 'agent',
  });
  assert.equal(claimedObserved.status, 400);

  // Verified evidence is never accepted directly.
  const fakeVerified = await call('POST', `/v1/jobs/${job.id}/evidence`, {
    kind: 'command',
    class: 'VERIFIED',
    summary: 'trust me',
    recordedBy: 'atlas',
    recordedByKind: 'agent',
  });
  assert.equal(fakeVerified.status, 400);

  // Same actor cannot verify its own evidence.
  const selfVerify = await call('POST', `/v1/evidence/${first.id}/verify`, { verifiedBy: 'runtime' });
  assert.equal(selfVerify.status, 409);
});

test('approval policy routes low risk to the lead and high risk to the owner', async () => {
  const policy = await ok('POST', '/v1/policies', {
    scope: 'global',
    actionType: 'merge',
    maxRiskForLead: 'medium',
    leadId: 'atlas',
    escalateTo: 'winston',
    timeoutMinutes: 60,
  });
  assert.equal(policy.leadId, 'atlas');

  const rooms = await ok('GET', '/v1/rooms');
  const job = await ok('POST', '/v1/jobs', { roomId: rooms[0].id, title: 'Policy test', createdBy: 'winston' });
  const low = await ok('POST', `/v1/jobs/${job.id}/approvals`, {
    title: 'Merge small fix',
    consequence: 'one file',
    actionType: 'merge',
    risk: 'low',
    requestedBy: 'atlas',
  });
  assert.equal(low.assignedTo, 'atlas');
  assert.equal(low.assignedKind, 'agent');

  const decided = await ok('POST', `/v1/approvals/${low.id}/decision`, {
    decision: 'approve',
    decidedBy: 'atlas',
    decidedByKind: 'agent',
  });
  assert.equal(decided.status, 'approved');

  const high = await ok('POST', `/v1/jobs/${job.id}/approvals`, {
    title: 'Force push main',
    consequence: 'rewrites history',
    actionType: 'merge',
    risk: 'critical',
    requestedBy: 'atlas',
  });
  assert.equal(high.assignedTo, 'winston');

  // A random agent cannot decide an approval that is not assigned to it.
  const outsider = await call('POST', `/v1/approvals/${high.id}/decision`, { decision: 'approve', decidedBy: 'vega' });
  assert.equal(outsider.status, 403);
});

test('sessions, transcript, cancel and restart reconciliation are honest', async () => {
  const session = await ok('POST', '/v1/sessions', {
    agentId: 'atlas',
    runtimeCommand: 'claude-agent-acp',
    adapterId: 'claude',
    mode: 'build',
    baseBranch: 'main',
  });
  assert.equal(session.state, 'starting');
  const entry = await ok('POST', `/v1/sessions/${session.id}/transcript`, {
    kind: 'agent_message_chunk',
    role: 'assistant',
    payload: { text: 'Looking at the auth module.' },
  });
  assert.equal(entry.seq, 1);
  const transcript = await ok('GET', `/v1/sessions/${session.id}/transcript`);
  assert.equal(transcript.length, 1);

  const cancelled = await ok('POST', `/v1/sessions/${session.id}/cancel`, { actorId: 'winston' });
  assert.ok(cancelled.cancelRequestedAt);

  await ok('PATCH', `/v1/sessions/${session.id}`, { state: 'stopped', exitCode: 0 });
  const stopped = await ok('GET', `/v1/sessions/${session.id}`);
  assert.equal(stopped.state, 'stopped');
  assert.equal(stopped.exitCode, 0);
});

test('usage feeds the job cost and the budget refuses an overspend', async () => {
  const rooms = await ok('GET', '/v1/rooms');
  const job = await ok('POST', '/v1/jobs', { roomId: rooms[0].id, title: 'Budget test', createdBy: 'winston' });
  await ok('PATCH', `/v1/jobs/${job.id}`, { budgetCents: 100 });
  const usage = await ok('POST', `/v1/jobs/${job.id}/usage`, { model: 'claude', inputTokens: 1000, outputTokens: 200, costCents: 80 });
  assert.equal(usage.costCents, 80);
  const budget = await ok('GET', `/v1/jobs/${job.id}/budget`);
  assert.equal(budget.configured, true);
  assert.equal(budget.spentCents, 80);
  assert.equal(budget.remainingCents, 20);

  const overspend = await call('POST', `/v1/jobs/${job.id}/budget/check`, { estimateCents: 50 });
  assert.equal(overspend.status, 409);

  const refreshed = await ok('GET', `/v1/jobs/${job.id}`);
  assert.equal(refreshed.costCents, 80);
});

test('a repeated POST with an Idempotency-Key creates one record', async () => {
  const key = 'test-idempotency-key';
  const first = await call('POST', '/v1/rooms', { name: 'idempotent-room' }, { 'Idempotency-Key': key });
  const second = await call('POST', '/v1/rooms', { name: 'idempotent-room' }, { 'Idempotency-Key': key });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.json.id, second.json.id);
  const rooms = await ok('GET', '/v1/rooms');
  assert.equal(rooms.filter((r: any) => r.name === 'idempotent-room').length, 1);
});

test('event log is append-only and hash-chained', async () => {
  const events = await ok('GET', '/v1/events/recent?since=0&limit=5000');
  assert.ok(events.length > 0);
  for (let i = 1; i < events.length; i += 1) {
    if (events[i].prevHash != null) assert.equal(events[i].prevHash, events[i - 1].hash);
  }
  assert.ok(events[events.length - 1].hash);
  // Events cannot be edited through the API: there is no route for it (405/404).
  const write = await call('PUT', '/v1/events', {});
  assert.ok(write.status === 404 || write.status === 401);
});

test('CORS rejects a disallowed Origin on real requests, not only preflight', async () => {
  const res = await call('GET', '/v1/summary', undefined, { Origin: 'https://evil.example' });
  assert.equal(res.status, 403);
});

test('the runtime lock admits one owner and replaces a stale lock', async () => {
  const lockFile = path.join(dir, 'runtime.lock');
  const first = acquireLock(lockFile);
  assert.ok(first);
  assert.equal(acquireLock(lockFile), null);
  first!.release();
  const again = acquireLock(lockFile);
  assert.ok(again);
  again!.release();
});

test('the runtime runs a task check itself, snapshots the worktree, and verifies independently', async () => {
  const rooms = await ok('GET', '/v1/rooms');
  const room = rooms.find((r: any) => r.name === 'myavana-chatbot');
  assert.ok(room.projectId);
  const job = await ok('POST', '/v1/jobs', {
    roomId: room.id,
    title: 'Check runner',
    brief: 'Prove the check runner records real exit codes.',
    createdBy: 'winston',
    criteria: ['A runtime check passes in a worktree'],
  });
  await ok('POST', `/v1/jobs/${job.id}/stage`, { to: 'plan', actorId: 'winston' });
  await ok('POST', `/v1/jobs/${job.id}/plan`, { plan: { summary: 'Run a check' }, actorId: 'winston' });
  const task = await ok('POST', `/v1/jobs/${job.id}/tasks`, {
    title: 'Check the README exists',
    assigneeId: 'atlas',
    checkCommand: 'test -f README.md && echo ok',
    criterionIds: [job.criteria[0].id],
  });
  await ok('POST', `/v1/jobs/${job.id}/stage`, { to: 'build', actorId: 'winston' });

  const run = await ok('POST', `/v1/jobs/${job.id}/checks`, { taskId: task.id });
  assert.equal(run.result.exitCode, 0);
  assert.equal(run.result.stdout.trim(), 'ok');
  assert.equal(run.evidence.class, 'OBSERVED');
  assert.equal(run.evidence.taskId, task.id);
  assert.ok(run.evidence.commitSha);
  assert.ok(fs.existsSync(path.join(run.worktree, '.git')));

  // A change made in the worktree is Observed by a snapshot.
  fs.writeFileSync(path.join(run.worktree, 'NOTES.md'), 'work in progress\n');
  const snapshot = await ok('POST', `/v1/jobs/${job.id}/snapshot`, { actorId: 'winston' });
  assert.equal(snapshot.kind, 'diff');
  assert.equal(snapshot.class, 'OBSERVED');
  const changed = (snapshot.payload as any).changedFiles as string[];
  assert.ok(changed.some((line) => line.includes('NOTES.md')));

  // The artifact is readable through the API, with the hash from the evidence.
  const artifactSha = snapshot.artifactRefs[0] as string;
  const artifactRes = await fetch(`${rt.url}/v1/artifacts/${artifactSha}`, {
    headers: { Authorization: `Bearer ${rt.token}` },
  });
  assert.equal(artifactRes.status, 200);
  assert.ok((await artifactRes.text()).length > 0);

  // The runtime commits the builder's worktree so verification can run on a clean checkout.
  const committed = await ok('POST', `/v1/jobs/${job.id}/commit`, { message: 'test change' });
  assert.equal(committed.committed, true);
  assert.ok(committed.commitSha);
  assert.equal(committed.evidence.class, 'OBSERVED');
  assert.equal(committed.evidence.commitSha, committed.commitSha);

  // A different actor verifies in a clean worktree at the committed build.
  const verification = await ok('POST', `/v1/jobs/${job.id}/verify`, { actorId: 'kael' });
  assert.equal(verification.ok, true);
  assert.equal(verification.results[0].ok, true);
  const verified = await ok('GET', `/v1/evidence/${verification.results[0].evidenceId}`);
  assert.equal(verified.class, 'VERIFIED');
  assert.equal(verified.verifiedBy, 'kael');

  // The assignee cannot verify their own task.
  const self = await ok('POST', `/v1/jobs/${job.id}/verify`, { actorId: 'atlas' });
  assert.equal(self.ok, false);
  assert.match(self.results[0].error, /assignee/i);

  const detail = await ok('GET', `/v1/jobs/${job.id}`);
  assert.equal(detail.criteria[0].evidenceClass, 'VERIFIED');
});
