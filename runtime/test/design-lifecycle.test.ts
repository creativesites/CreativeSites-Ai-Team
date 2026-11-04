import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { issueAgentToken } from '../src/agent-tools/tokens.ts';
import { dispatchPrompt } from '../src/dispatch/dispatcher.ts';
import { DESIGN_FRAME_TRANSITIONS } from '../src/store/repo.ts';
import { migrate, openStore } from '../src/store/db.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-design-lifecycle-'));
const savedHome = process.env.MYAOS_HOME;
process.env.MYAOS_HOME = path.join(dir, 'home');
const fixture = new URL('./fixtures/fake-acp-agent.mjs', import.meta.url).pathname;
const dbPath = path.join(dir, 'runtime.db');
let rt: RunningRuntime;
let db: DatabaseSync;

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
const toolJson = (r: any) => JSON.parse(r.content[0].text);
const eventTypes = (subjectId: string) =>
  (db.prepare('SELECT type FROM events WHERE subject_id = ? ORDER BY seq').all(subjectId) as { type: string }[]).map((r) => r.type);

before(async () => {
  rt = await startRuntime({ dbPath, workspaceRoots: [dir], worktreeRoot: path.join(dir, 'wt'), artifactsDir: path.join(dir, 'art') });
  db = new DatabaseSync(dbPath);
  for (const id of ['fake', 'claude']) await call('POST', `/v1/adapters/${id}`, { command: process.execPath, args: [fixture], enabled: true });
});

after(async () => {
  db.close();
  await rt.close();
  if (savedHome === undefined) delete process.env.MYAOS_HOME;
  else process.env.MYAOS_HOME = savedHome;
  fs.rmSync(dir, { recursive: true, force: true });
});

const newBoard = async (jobId?: string) => (await call('POST', '/v1/design-boards', { title: 'Board', jobId })).json;
const newFrame = async (boardId: string, html = '<p>v1</p>', parentFrameId?: string) =>
  (await call('POST', `/v1/design-boards/${boardId}/frames`, { title: 'Home', device: 'phone', htmlContent: html, parentFrameId })).json;

test('transition table: illegal moves are 409, a legal move emits exactly one design.frame_<state> event', async () => {
  const board = await newBoard();
  const frame = await newFrame(board.id);
  const illegal = [
    ['draft', 'superseded'],
    ['draft', 'draft'],
    ['review', 'superseded'],
    ['approved', 'review'],
    ['superseded', 'approved'],
    ['archived', 'draft'],
  ] as const;
  assert.deepEqual(DESIGN_FRAME_TRANSITIONS.review, ['approved', 'iterating', 'archived']);
  for (const [from, to] of illegal) assert.ok(!DESIGN_FRAME_TRANSITIONS[from].includes(to as never), `${from}->${to}`);

  const bad = await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'superseded' });
  assert.equal(bad.status, 409);
  assert.deepEqual(eventTypes(frame.id).filter((t) => ['design.frame_review', 'design.frame_approved', 'design.frame_superseded', 'design.frame_iterating', 'design.frame_archived'].includes(t)), [], 'illegal move emits nothing');

  const before = eventTypes(frame.id).length;
  const review = await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'review', actorId: 'winston', reason: 'ready' });
  assert.equal(review.status, 200);
  assert.equal(review.json.status, 'review');
  assert.deepEqual(eventTypes(frame.id).slice(before), ['design.frame_review']);

  const changes = await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'iterating', reason: 'changes requested' });
  assert.equal(changes.json.status, 'iterating');
  assert.equal((await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'review' })).status, 200);
  const approved = await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'approved', actorId: 'winston' });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.status, 'approved');
  assert.ok(approved.json.evidenceId, 'approval keeps writing evidence');
  assert.equal((await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'review' })).status, 409, 'approved cannot go back to review');
  assert.equal((await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'archived' })).status, 200);
  assert.equal((await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'iterating' })).status, 409, 'archived is terminal');
  assert.equal((await call('PATCH', `/v1/design-frames/${frame.id}`, { status: 'draft' })).status, 409, 'PATCH status goes through the same table');
});

test('the legacy approve API still works from draft and records OBSERVED evidence', async () => {
  const board = await newBoard();
  const frame = await newFrame(board.id);
  const res = await call('POST', `/v1/design-frames/${frame.id}/approve`, { actorId: 'winston', note: 'ship it' });
  assert.equal(res.status, 200);
  assert.equal(res.json.frame.status, 'approved');
  assert.equal(res.json.evidence.class, 'OBSERVED');
  assert.equal(res.json.evidence.payload.type, 'design_reference');
  assert.ok(fs.existsSync(res.json.evidence.payload.artifactPath));
  assert.equal(res.json.evidence.payload.contentSha.length, 64);
  assert.ok(eventTypes(frame.id).includes('design.frame_approved'));
});

test('approving a second version supersedes the first, with lineage', async () => {
  const board = await newBoard();
  const frame = await newFrame(board.id, '<p>one</p>');
  await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'review' });
  await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'approved', actorId: 'winston' });
  // An edit starts v2 and puts the frame back to iterating.
  const edited = await call('PATCH', `/v1/design-frames/${frame.id}`, { htmlContent: '<p>two</p>' });
  assert.equal(edited.json.version, 2);
  assert.equal(edited.json.status, 'iterating');
  await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'review' });
  const before = eventTypes(frame.id).length;
  const second = await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'approved', actorId: 'winston' });
  assert.equal(second.json.status, 'approved');
  const v = new Map<number, any>(second.json.versions.map((x: any) => [x.version, x]));
  assert.equal(v.get(1).state, 'superseded');
  assert.equal(v.get(1).supersededBy, v.get(2).id, 'lineage points at the newer version');
  assert.equal(v.get(2).state, 'approved');
  assert.notEqual(v.get(1).artifactPath, v.get(2).artifactPath);
  assert.equal(fs.readFileSync(v.get(1).artifactPath, 'utf8'), '<p>one</p>', 'old approval snapshot is immutable');
  assert.deepEqual(eventTypes(frame.id).slice(before).sort(), ['design.frame_approved', 'design.version_superseded']);

  // A forked frame approved later supersedes its approved parent frame.
  const child = await newFrame(board.id, '<p>fork</p>', frame.id);
  const approvedChild = await call('POST', `/v1/design-frames/${child.id}/approve`, { actorId: 'winston' });
  assert.equal(approvedChild.json.frame.status, 'approved');
  const parent = (await call('GET', `/v1/design-boards/${board.id}`)).json.frames.find((f: any) => f.id === frame.id);
  assert.equal(parent.status, 'superseded');
  assert.equal(parent.supersededBy, child.id);
  assert.ok(eventTypes(frame.id).includes('design.frame_superseded'));
});

test('migration v23 rebuilds design_frames preserving rows, columns, indexes and foreign keys; idempotent', () => {
  const p = path.join(dir, 'mig', 'runtime.db');
  const old = openStore(p, MIGRATIONS.filter((m) => m.version < 23));
  const t = '2026-11-01T00:00:00.000Z';
  old.prepare("INSERT INTO design_boards (id, project_id, job_id, room_id, title, description, mode, created_by, created_at, updated_at) VALUES ('b1', 'p', NULL, NULL, 'Board 1', 'd', 'hybrid', 'winston', ?, ?)").run(t, t);
  old.prepare("INSERT INTO design_boards (id, title, created_at, updated_at) VALUES ('b2', 'Board 2', ?, ?)").run(t, t);
  const insF = old.prepare(
    `INSERT INTO design_frames (id, board_id, parent_frame_id, title, version, device, width, height, x, y, status, source_files_json, html_path, html_content, notes, author_id, approved_by, approved_at, evidence_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insF.run('f1', 'b1', null, 'Home', 2, 'desktop', 1200, 780, 10.5, 20.5, 'approved', '["src/a.tsx"]', '/x/f1.html', '<p>h</p>', 'n', 'muse', 'winston', t, 'ev_1', t, t);
  insF.run('f2', 'b1', 'f1', 'Fork', 1, 'phone', 393, 852, 80, 80, 'iterating', '[]', null, '', null, 'atlas', null, null, null, t, t);
  insF.run('f3', 'b2', null, 'Old', 1, 'tablet', 834, 1080, 0, 0, 'archived', '[]', null, 'x', null, 'atlas', null, null, null, t, t);
  insF.run('f4', 'b2', null, 'Fresh', 1, 'custom', 500, 500, 1, 2, 'draft', '[]', null, 'y', null, 'atlas', null, null, null, t, t);
  const insV = old.prepare('INSERT INTO design_frame_versions (id, frame_id, version, title, html_content, notes, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insV.run('v1', 'f1', 1, 'Home', '<p>a</p>', null, 'muse', t);
  insV.run('v2', 'f1', 2, 'Home', '<p>h</p>', 'n', 'muse', t);
  insV.run('v3', 'f2', 1, 'Fork', '', null, 'atlas', t);
  const rowsBefore = old.prepare('SELECT * FROM design_frames ORDER BY id').all() as Record<string, unknown>[];
  const versionsBefore = old.prepare('SELECT * FROM design_frame_versions ORDER BY id').all() as Record<string, unknown>[];
  const boardsBefore = old.prepare('SELECT * FROM design_boards ORDER BY id').all() as Record<string, unknown>[];
  const indexNames = (d: DatabaseSync, table: string) => (d.prepare(`PRAGMA index_list(${table})`).all() as { name: string }[]).map((i) => i.name).filter((n) => !n.startsWith('sqlite_')).sort();
  const framesIdxBefore = indexNames(old, 'design_frames');
  const colsBefore = (old.prepare('PRAGMA table_info(design_frames)').all() as { name: string }[]).map((c) => c.name);
  old.close();

  const db2 = openStore(p);
  const rowsAfter = db2.prepare('SELECT * FROM design_frames ORDER BY id').all() as Record<string, unknown>[];
  assert.equal(rowsAfter.length, rowsBefore.length);
  for (let i = 0; i < rowsBefore.length; i++) {
    for (const col of colsBefore) assert.equal(rowsAfter[i]![col], rowsBefore[i]![col], `design_frames.${col} of ${rowsBefore[i]!.id}`);
    assert.equal(rowsAfter[i]!.superseded_by, null);
  }
  const versionsAfter = db2.prepare('SELECT * FROM design_frame_versions ORDER BY id').all() as Record<string, unknown>[];
  assert.equal(versionsAfter.length, 3, 'versions were not cascade-deleted by the rebuild');
  for (let i = 0; i < versionsBefore.length; i++) for (const col of Object.keys(versionsBefore[i]!)) assert.equal(versionsAfter[i]![col], versionsBefore[i]![col]);
  assert.equal(versionsAfter[0]!.state, null);
  const boardsAfter = db2.prepare('SELECT * FROM design_boards ORDER BY id').all() as Record<string, unknown>[];
  for (let i = 0; i < boardsBefore.length; i++) for (const col of Object.keys(boardsBefore[i]!)) assert.equal(boardsAfter[i]![col], boardsBefore[i]![col]);

  assert.deepEqual(indexNames(db2, 'design_frames'), framesIdxBefore, 'indexes preserved');
  assert.ok(indexNames(db2, 'design_frame_versions').includes('design_frame_versions_frame'));
  const fk = (table: string) => (db2.prepare(`PRAGMA foreign_key_list(${table})`).all() as { table: string; from: string; on_delete: string }[]).map((f) => `${f.from}->${f.table}:${f.on_delete}`);
  assert.deepEqual(fk('design_frames'), ['board_id->design_boards:CASCADE']);
  assert.deepEqual(fk('design_frame_versions'), ['frame_id->design_frames:CASCADE']);
  assert.equal(db2.prepare('PRAGMA foreign_key_check').all().length, 0);
  // the widened CHECK accepts the new states and still rejects nonsense
  db2.prepare("UPDATE design_frames SET status = 'review' WHERE id = 'f4'").run();
  db2.prepare("UPDATE design_frames SET status = 'superseded' WHERE id = 'f4'").run();
  assert.throws(() => db2.prepare("UPDATE design_frames SET status = 'bogus' WHERE id = 'f4'").run());
  // cascade still works against the rebuilt table
  db2.prepare("DELETE FROM design_frames WHERE id = 'f2'").run();
  assert.equal((db2.prepare("SELECT COUNT(*) AS n FROM design_frame_versions WHERE frame_id = 'f2'").get() as { n: number }).n, 0);

  const applied = () => (db2.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 23').get() as { n: number }).n;
  assert.equal(applied(), 1);
  migrate(db2);
  assert.equal(applied(), 1, 'idempotent');
  assert.equal((db2.prepare('SELECT COUNT(*) AS n FROM design_frames').get() as { n: number }).n, 3);
  db2.close();
});

test('design request: creates a job via intake (source design) and a task for an eligible design identity; none eligible leaves it unassigned', async () => {
  // No design identity yet: the task is still created, unassigned, with a reason.
  const lone = await call('POST', '/v1/design/requests', { brief: 'Design the onboarding flow for new users', deviceTargets: ['phone'] });
  assert.equal(lone.status, 201);
  assert.equal(lone.json.assigneeId, null);
  assert.match(lone.json.assignmentReason, /unassigned/);
  const loneTask = (await call('GET', `/v1/jobs/${lone.json.jobId}`)).json.tasks.find((t: any) => t.id === lone.json.taskId);
  assert.equal(loneTask.assigneeId, null);
  assert.equal(loneTask.mode, 'design');
  assert.deepEqual(loneTask.requiredSkills, ['design-artifact']);

  await call('POST', '/v1/identities', { id: 'muse', name: 'Muse', role: 'designer', runtime: 'claude' });
  await call('POST', '/v1/identities', { id: 'ruby', name: 'Ruby', role: 'engineer', runtime: 'claude' });
  db.prepare("UPDATE identities SET department_id = 'design' WHERE id = 'muse'").run();
  db.prepare("UPDATE identities SET department_id = 'engineering' WHERE id = 'ruby'").run();

  const res = await call('POST', '/v1/design/requests', { brief: 'Design a pricing page with three tiers', deviceTargets: ['desktop', 'phone'] });
  assert.equal(res.status, 201);
  assert.equal(res.json.assigneeId, 'muse', 'only a design-department identity is chosen');
  const intake = db.prepare('SELECT source, job_id FROM intake_requests WHERE job_id = ?').get(res.json.jobId) as { source: string };
  assert.equal(intake.source, 'design');
  const job = (await call('GET', `/v1/jobs/${res.json.jobId}`)).json;
  const task = job.tasks.find((t: any) => t.id === res.json.taskId);
  assert.equal(task.assigneeId, 'muse');
  assert.match(task.title, /^Design: /);
  const board = (await call('GET', `/v1/design-boards/${res.json.boardId}`)).json;
  assert.equal(board.jobId, res.json.jobId);
  assert.equal(board.taskId, res.json.taskId);
  assert.ok(eventTypes(res.json.boardId).includes('design.requested'));

  // Attaching to an existing job creates no new job.
  const attached = await call('POST', '/v1/design/requests', { jobId: res.json.jobId, brief: 'Also a checkout screen' });
  assert.equal(attached.json.jobId, res.json.jobId);
  assert.equal((await call('GET', `/v1/jobs/${res.json.jobId}`)).json.tasks.length, 2);

  // A rate-limited design agent is skipped: unassigned again, no crash.
  db.prepare("UPDATE identities SET rate_limit_reset_at = ? WHERE id = 'muse'").run(new Date(Date.now() + 3_600_000).toISOString());
  const limited = await call('POST', '/v1/design/requests', { brief: 'Design an empty state illustration' });
  assert.equal(limited.status, 201);
  assert.equal(limited.json.assigneeId, null);
  assert.match(limited.json.assignmentReason, /rate-limited/);
  db.prepare('UPDATE identities SET rate_limit_reset_at = NULL WHERE id = ?').run('muse');

  assert.equal((await call('POST', '/v1/design/requests', { brief: '  ' })).status, 400);
});

test('an approved design reaches job_get, the dispatch prompt, and conformance reports are DECLARED evidence from the token identity', async () => {
  const req = await call('POST', '/v1/design/requests', { brief: 'Design the settings screen' });
  const { jobId, boardId } = req.json;
  const frame = await newFrame(boardId, '<h1>Settings</h1>');
  const { token } = issueAgentToken(db, { identityId: 'ruby', jobId });

  assert.deepEqual(toolJson(await tool(token, 'job_get', {})).approvedDesigns, [], 'nothing approved yet');
  await call('POST', `/v1/design-frames/${frame.id}/transition`, { to: 'review' });
  assert.deepEqual(toolJson(await tool(token, 'job_get', {})).approvedDesigns, [], 'review is not approved');
  const approved = await call('POST', `/v1/design-frames/${frame.id}/approve`, { actorId: 'winston' });
  assert.equal(approved.status, 200);

  const refs = toolJson(await tool(token, 'job_get', {})).approvedDesigns;
  assert.equal(refs.length, 1);
  assert.deepEqual({ ...refs[0], path: typeof refs[0].path }, { frameId: frame.id, title: 'Home', version: 1, device: 'phone', path: 'string' });
  assert.ok(fs.existsSync(refs[0].path));

  // Evidence on the job: design_reference, OBSERVED, artifact kind.
  const refEv = db.prepare("SELECT kind, class, payload FROM evidence WHERE job_id = ? AND kind = 'artifact'").all(jobId) as { kind: string; class: string; payload: string }[];
  assert.equal(refEv.length, 1);
  assert.equal(refEv[0]!.class, 'OBSERVED');
  const payload = JSON.parse(refEv[0]!.payload);
  assert.deepEqual([payload.type, payload.frameId, payload.version, payload.boardId], ['design_reference', frame.id, 1, boardId]);

  // A later implementation task's dispatch prompt lists the design; a design task's does not.
  const jobDetail = (await call('GET', `/v1/jobs/${jobId}`)).json;
  const buildTask = rt.repo.createTask(jobId, { title: 'Implement settings', mode: 'build' });
  const prompt = dispatchPrompt(buildTask, jobDetail.number, rt.repo.listApprovedDesigns(jobId));
  assert.match(prompt, new RegExp(`Home \\(frame ${frame.id}, v1, phone\\): ${refs[0].path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.doesNotMatch(dispatchPrompt(jobDetail.tasks[0], jobDetail.number, refs), /Approved designs/);
  assert.doesNotMatch(dispatchPrompt(buildTask, jobDetail.number), /Approved designs/);

  // QA / engineer conformance report over MCP.
  const ok = toolJson(await tool(token, 'design_conformance_report', { frameId: frame.id, result: 'deviates', notes: 'Header is 8px too tall' }));
  assert.equal(ok.class, 'DECLARED');
  const row = db.prepare('SELECT kind, class, recorded_by, recorded_by_kind, payload FROM evidence WHERE id = ?').get(ok.evidenceId) as any;
  assert.deepEqual([row.kind, row.class, row.recorded_by, row.recorded_by_kind], ['review', 'DECLARED', 'ruby', 'agent']);
  const p2 = JSON.parse(row.payload);
  assert.deepEqual([p2.type, p2.frameId, p2.result, p2.version], ['design_conformance', frame.id, 'deviates', 1]);

  // Bad input and cross-job frames are rejected; an unapproved frame has nothing to conform to.
  const other = await newFrame(boardId, '<p>wip</p>');
  assert.equal((await tool(token, 'design_conformance_report', { frameId: other.id, result: 'matches' })).isError, true);
  const otherBoard = await newBoard((await call('POST', '/v1/design/requests', { brief: 'Another unrelated design' })).json.jobId);
  const foreign = await newFrame(otherBoard.id);
  await call('POST', `/v1/design-frames/${foreign.id}/approve`, { actorId: 'winston' });
  assert.equal((await tool(token, 'design_conformance_report', { frameId: foreign.id, result: 'matches' })).isError, true);
  assert.equal((await tool(token, 'design_conformance_report', { frameId: frame.id, result: 'maybe' })).isError, true);
});

test('an approved frame can be handed off again without recording a second approval', async () => {
  const board = await newBoard();
  const frame = await newFrame(board.id, '<p>handoff</p>');
  const first = await call('POST', `/v1/design-frames/${frame.id}/approve`, { actorId: 'winston' });
  assert.equal(first.status, 200, JSON.stringify(first.json));
  const approvals = () => (rt.repo.listEvidence({ jobId: board.jobId ?? undefined, limit: 500 }).filter((e) => (e.payload as any)?.type === 'design_reference' && (e.payload as any)?.frameId === frame.id)).length;
  const before = approvals();
  const again = await call('POST', `/v1/design-frames/${frame.id}/approve`, { actorId: 'winston', note: 'build it again' });
  assert.equal(again.status, 200, 'handing off again is not a 409');
  assert.equal(again.json.frame.status, 'approved');
  assert.equal(again.json.evidence.id, first.json.evidence.id, 'the original approval evidence is reused');
  assert.equal(approvals(), before, 'no second approval recorded');
});
