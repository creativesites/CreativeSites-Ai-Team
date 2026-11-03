import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { issueAgentToken } from '../src/agent-tools/tokens.ts';
import { discoverSkills, parseSkill } from '../src/skills/loader.ts';
import { SkillService, skillServiceFor } from '../src/skills/service.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';
import { migrate, openStore } from '../src/store/db.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures', 'skills');
const realCatalog = path.resolve(here, '..', '..', 'community', 'skills');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-skills-'));
const skillsRoot = path.join(dir, 'skills');

function writeSkill(id: string, front: Record<string, string>, body = 'Do the thing carefully.\n', root = skillsRoot) {
  const fm = Object.entries({ name: id, description: `${id} skill`, version: '1.0.0', ...front })
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  fs.mkdirSync(path.join(root, id), { recursive: true });
  fs.writeFileSync(path.join(root, id, 'SKILL.md'), `---\n${fm}\n---\n\n# ${id}\n${body}`);
}

function freshRoot() {
  fs.rmSync(skillsRoot, { recursive: true, force: true });
  fs.mkdirSync(skillsRoot, { recursive: true });
}

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('parser handles the catalog frontmatter subset (real SKILL.md copies)', () => {
  const triage = parseSkill(fs.readFileSync(path.join(fixtures, 'intake-triage', 'SKILL.md'), 'utf8'), 'x', 'intake-triage')!;
  assert.equal(triage.id, 'intake-triage');
  assert.equal(triage.version, '1.0.0');
  assert.match(triage.description, /^Standard operating procedure for evaluating incoming/);
  assert.deepEqual(triage.inputs, ['user_request: string', 'project_context: string']);
  assert.ok(triage.outputs.includes('route: "tier_1_direct | tier_2_modular | tier_3_council"'), 'quoted value after key: type is kept');
  assert.ok(triage.triggers.includes('triage'));
  assert.ok(!triage.body.startsWith('---'));
  assert.match(triage.body, /^# Intake Triage Skill/);
  assert.match(triage.contentHash, /^[0-9a-f]{12}$/);

  const hier = parseSkill(fs.readFileSync(path.join(fixtures, 'hierarchical-model-orchestration', 'SKILL.md'), 'utf8'), 'x')!;
  assert.match(hier.description, /^Hierarchical, cost-aware AI workforce orchestration\. Use when executing substantial/, 'folded block joins lines');
  assert.ok(!hier.description.includes('\n'));
  assert.deepEqual(hier.relatedSkills.slice(0, 3), ['intake-triage', 'task-decomposition', 'independent-verification']);
  assert.ok(hier.inputs.includes('assignment: string'), 'trailing comments are stripped');
  assert.deepEqual(hier.workflows, []);

  const found = discoverSkills(fixtures);
  assert.deepEqual(found.skills.map((s) => s.id), ['hierarchical-model-orchestration', 'intake-triage']);
  assert.deepEqual(found.skipped, []);
});

test('triggers, workflows and roles lists; invalid workflows are dropped; inline lists work', () => {
  const s = parseSkill('---\nname: x\nversion: 2\ntriggers: [Deploy, "roll back"]\nworkflows:\n  - quick\n  - bogus\nroles:\n  - builder\n---\nbody', 'p')!;
  assert.deepEqual(s.triggers, ['deploy', 'roll back']);
  assert.deepEqual(s.workflows, ['quick']);
  assert.deepEqual(s.roles, ['builder']);
  assert.equal(parseSkill('no frontmatter', 'p'), null);
});

test('real repo catalog: all 16 SKILL.md files parse (read-only)', () => {
  const found = discoverSkills(realCatalog);
  assert.deepEqual(found.skipped, []);
  assert.equal(found.skills.length, 16);
  for (const s of found.skills) {
    assert.ok(s.id && s.version && s.description, `${s.id} has id, version and description`);
    assert.ok(s.triggers.length > 0, `${s.id} has triggers`);
    assert.ok(s.body.length > 100, `${s.id} has a body`);
  }
  for (const id of ['project-context', 'design-artifact', 'implementation', 'agent-handoff', 'release-safety', 'okr-evidence', 'failure-recovery', 'time-tracking-and-activity-reporting', 'context-management-and-session-renewal', 'token-and-resource-efficiency', 'intake-triage', 'planner-brief', 'task-decomposition', 'independent-verification', 'daily-standup', 'hierarchical-model-orchestration']) {
    assert.ok(found.skills.some((s) => s.id === id), id);
  }
});

test('v18 migration is idempotent and additive', () => {
  const db = openStore(':memory:');
  const v = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number };
  assert.equal(v.v, MIGRATIONS.at(-1)!.version);
  assert.ok(MIGRATIONS.some((m) => m.version === 18));
  const before = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number };
  migrate(db);
  migrate(db);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n, before.n);
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  for (const c of ['id', 'name', 'version', 'content_hash', 'path', 'description', 'triggers', 'workflows', 'roles', 'loaded_at']) assert.ok(cols('skills').includes(c), c);
  assert.deepEqual(cols('task_skills').sort(), ['content_hash', 'reason', 'selected_at', 'skill_id', 'task_id']);
  db.close();
});

function svc() {
  const db = openStore(':memory:');
  return { db, s: new SkillService(db, { skillsRoot }) };
}

test('reload is idempotent; an edit changes the hash and adds a row', () => {
  freshRoot();
  writeSkill('alpha', { triggers: '[alpha]' });
  writeSkill('beta', { workflows: '[feature]' });
  const { db, s } = svc();
  const first = s.sync();
  assert.deepEqual([first.found, first.added, first.unchanged], [2, 2, 0]);
  const second = s.sync();
  assert.deepEqual([second.found, second.added, second.unchanged], [2, 0, 2]);
  const rows = () => (db.prepare('SELECT COUNT(*) AS n FROM skills').get() as { n: number }).n;
  assert.equal(rows(), 2);
  const h1 = s.list().find((x) => x.id === 'alpha')!.contentHash;
  writeSkill('alpha', { triggers: '[alpha]' }, 'Changed instructions.\n');
  assert.equal(s.sync().added, 1);
  assert.equal(rows(), 3, 'old content kept');
  const h2 = s.list().find((x) => x.id === 'alpha')!.contentHash;
  assert.notEqual(h1, h2);
  db.close();
});

test('selection by required skill, trigger and workflow; priority order and cap of 4', () => {
  freshRoot();
  writeSkill('req-skill', {});
  writeSkill('trig-skill', { triggers: '[deploy, rollback plan]' });
  writeSkill('flow-a', { workflows: '[feature]' });
  writeSkill('flow-b', { workflows: '[feature, incident]' });
  writeSkill('flow-c', { workflows: '[feature]' });
  writeSkill('flow-d', { workflows: '[incident]' });
  const { db, s } = svc();

  const byRequired = s.selectSkills({ id: 't1', title: 'Nothing special', requiredSkills: ['req-skill'] }, { workflow: null });
  assert.deepEqual(byRequired.map((x) => [x.skillId, x.reason]), [['req-skill', 'required skill']]);

  const byTrigger = s.selectSkills({ id: 't2', title: 'Prepare the Rollback Plan for tonight' }, {});
  assert.deepEqual(byTrigger.map((x) => x.skillId), ['trig-skill']);
  assert.match(byTrigger[0]!.reason, /trigger "rollback plan"/);

  const noPartial = s.selectSkills({ id: 't2b', title: 'redeployment notes' }, {});
  assert.deepEqual(noPartial, [], 'a trigger must match a whole word or phrase');

  const byFlow = s.selectSkills({ id: 't3', title: 'Plain' }, { workflow: 'incident' });
  assert.deepEqual(byFlow.map((x) => x.skillId), ['flow-b', 'flow-d']);

  const capped = s.selectSkills({ id: 't4', title: 'We deploy things', requiredSkills: ['req-skill'] }, { workflow: 'feature' });
  assert.equal(capped.length, 4);
  assert.deepEqual(capped.map((x) => x.skillId), ['req-skill', 'trig-skill', 'flow-a', 'flow-b'], 'required, then trigger, then workflow by id');

  assert.deepEqual(s.selectSkills({ id: 't5', title: 'Plain' }, {}), [], 'no match, no skills');
  db.close();
});

test('pinning: editing a skill changes the next selection only; reset re-selects', () => {
  freshRoot();
  writeSkill('pin-me', { workflows: '[quick]' }, 'Version one text.\n');
  const { db, s } = svc();
  const a = s.selectSkills({ id: 'ta', title: 'x' }, { workflow: 'quick' });
  writeSkill('pin-me', { workflows: '[quick]' }, 'Version two text.\n');
  const again = s.selectSkills({ id: 'ta', title: 'x' }, { workflow: 'quick' });
  assert.equal(again[0]!.contentHash, a[0]!.contentHash, 're-selection keeps the pinned hash');
  const b = s.selectSkills({ id: 'tb', title: 'x' }, { workflow: 'quick' });
  assert.notEqual(b[0]!.contentHash, a[0]!.contentHash, 'the next task pins the new hash');
  const rows = db.prepare('SELECT task_id, content_hash FROM task_skills ORDER BY task_id').all() as { task_id: string; content_hash: string }[];
  assert.deepEqual(rows.map((r) => r.content_hash), [a[0]!.contentHash, b[0]!.contentHash]);
  assert.match(s.skillPacket('ta'), /Version one text/);
  assert.doesNotMatch(s.skillPacket('ta'), /Version two text/);
  assert.match(s.skillPacket('tb'), /Version two text/);
  s.resetTask('ta');
  assert.equal(s.selectSkills({ id: 'ta', title: 'x' }, { workflow: 'quick' })[0]!.contentHash, b[0]!.contentHash);
  db.close();
});

test('packet lists exactly the selected skills, headed id@version, size-capped', () => {
  freshRoot();
  writeSkill('one', { version: '3.1.0', workflows: '[feature]' }, 'ONE body\n');
  writeSkill('two', { version: '0.2.0', workflows: '[feature]' }, 'TWO body\n' + 'x'.repeat(9000));
  writeSkill('three', { version: '1.0.0', workflows: '[incident]' }, 'THREE body\n');
  const { db, s } = svc();
  s.selectSkills({ id: 'tp', title: 'x' }, { workflow: 'feature' });
  const packet = s.skillPacket('tp');
  assert.match(packet, /### one@3\.1\.0 \(/);
  assert.match(packet, /### two@0\.2\.0 \(/);
  assert.doesNotMatch(packet, /three/);
  assert.doesNotMatch(packet, /^---/m, 'frontmatter is not included');
  assert.match(packet, /\[truncated: call skill_read/);
  assert.ok(packet.length < 16100);
  assert.equal(s.skillPacket('nobody'), '');
  db.close();
});

// ------------------------------------------------------------------ runtime wiring
let rt: RunningRuntime;
let db: DatabaseSync;
let jobId = '';
const dbPath = path.join(dir, 'runtime.db');
const rtRoot = path.join(dir, 'rt-skills');
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
const tool = async (token: string, name: string, args: unknown) => {
  const r = await call('POST', '/mcp', { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }, token);
  return r.json.result;
};

before(async () => {
  writeSkill('deploy-guide', { description: 'How to deploy', triggers: '[deploy]' }, 'Deploy steps here.\n', rtRoot);
  writeSkill('general-guide', { description: 'General', workflows: '[feature]' }, 'General steps.\n', rtRoot);
  rt = await startRuntime({ dbPath, skillsRoot: rtRoot });
  db = new DatabaseSync(dbPath);
  const roomId = (await call('POST', '/v1/rooms', { name: 'skills-room' })).json.id;
  await call('POST', '/v1/identities', { id: 'builder1', name: 'Builder', role: 'builder', runtime: 'claude' });
  jobId = (await call('POST', '/v1/jobs', { roomId, title: 'Skills job', createdBy: 'winston', criteria: ['ok'] })).json.id;
});

after(async () => {
  db.close();
  await rt.close();
});

test('startup synced the skills; HTTP list, read, reload and per-task skills', async () => {
  const list = await call('GET', '/v1/skills');
  assert.equal(list.status, 200);
  assert.equal(list.json.root, rtRoot);
  assert.deepEqual(list.json.skills.map((s: { id: string }) => s.id).sort(), ['deploy-guide', 'general-guide']);

  const one = await call('GET', '/v1/skills/deploy-guide');
  assert.equal(one.status, 200);
  assert.match(one.json.body, /Deploy steps here/);
  assert.equal((await call('GET', '/v1/skills/missing')).status, 404);

  assert.equal((await call('POST', '/v1/skills/reload', {}, null)).status, 401, 'reload needs the owner token');
  const reload = await call('POST', '/v1/skills/reload', {});
  assert.equal(reload.status, 200);
  assert.equal(reload.json.added, 0);
  assert.equal(reload.json.unchanged, 2);

  const task = (await call('POST', `/v1/jobs/${jobId}/tasks`, { title: 'Deploy the thing' })).json;
  skillServiceFor(rt.repo)!.selectSkills(task, { workflow: null });
  const mine = await call('GET', `/v1/tasks/${task.id}/skills`);
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.json.skills.map((s: { skillId: string }) => s.skillId), ['deploy-guide']);
  assert.match(mine.json.packet, /### deploy-guide@1\.0\.0/);
  assert.equal((await call('GET', '/v1/tasks/nope/skills')).status, 404);
});

test('MCP skill_list and skill_read with an agent token', async () => {
  const task = (await call('POST', `/v1/jobs/${jobId}/tasks`, { title: 'Deploy again', assigneeId: 'builder1' })).json;
  skillServiceFor(rt.repo)!.selectSkills(task, { workflow: 'feature' });
  const { token } = issueAgentToken(db, { identityId: 'builder1', jobId, taskId: task.id });

  const names = (await call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, token)).json.result.tools.map((t: { name: string }) => t.name);
  assert.ok(names.includes('skill_list') && names.includes('skill_read'));

  const list = JSON.parse((await tool(token, 'skill_list', {})).content[0].text);
  assert.deepEqual(list.selected.map((s: { id: string }) => s.id), ['deploy-guide', 'general-guide']);
  assert.deepEqual(list.available.map((s: { id: string }) => s.id).sort(), ['deploy-guide', 'general-guide']);
  assert.ok(list.available.every((s: { description: string }) => s.description));

  const read = JSON.parse((await tool(token, 'skill_read', { id: 'general-guide' })).content[0].text);
  assert.equal(read.pinned, true);
  assert.match(read.instructions, /General steps/);

  // A skill that is not selected for the task can still be read; an unknown one is rejected.
  const other = issueAgentToken(db, { identityId: 'builder1', jobId });
  const unbound = JSON.parse((await tool(other.token, 'skill_read', { id: 'deploy-guide' })).content[0].text);
  assert.equal(unbound.pinned, false);
  const missing = await tool(token, 'skill_read', { id: 'nope' });
  assert.equal(missing.isError, true);

  const audited = db.prepare("SELECT tool, status FROM tool_calls WHERE tool IN ('skill_list','skill_read') ORDER BY created_at").all() as { tool: string; status: string }[];
  assert.ok(audited.some((a) => a.tool === 'skill_list' && a.status === 'ok'));
  assert.ok(audited.filter((a) => a.tool === 'skill_read').length >= 3);
  assert.ok(audited.some((a) => a.status === 'rejected'));
});
