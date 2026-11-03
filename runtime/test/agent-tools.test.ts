import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { issueAgentToken, revokeSessionTokens } from '../src/agent-tools/tokens.ts';
import { agentEnv } from '../src/agent-tools/env.ts';
import { hashOwnerKey } from '../src/agent-tools/owner-key.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-agent-tools-'));
const dbPath = path.join(dir, 'runtime.db');
let rt: RunningRuntime;
let db: DatabaseSync;
let jobId = '';
let otherJobId = '';
let roomId = '';

const call = async (method: string, route: string, body?: unknown, token: string | null = rt.token, extra: Record<string, string> = {}) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as any) : null };
};

let rpcId = 0;
const mcp = (token: string, method: string, params?: unknown) => call('POST', '/mcp', { jsonrpc: '2.0', id: ++rpcId, method, params }, token);
const tool = async (token: string, name: string, args: unknown) => (await mcp(token, 'tools/call', { name, arguments: args })).json.result;

before(async () => {
  rt = await startRuntime({ dbPath });
  db = new DatabaseSync(dbPath);
  roomId = (await call('POST', '/v1/rooms', { name: 'tools-room' })).json.id;
  await call('POST', '/v1/identities', { id: 'builder1', name: 'Builder', role: 'builder', runtime: 'claude' });
  jobId = (await call('POST', '/v1/jobs', { roomId, title: 'Agent tools job', createdBy: 'winston', criteria: ['It works'] })).json.id;
  otherJobId = (await call('POST', '/v1/jobs', { roomId, title: 'Someone else', createdBy: 'winston' })).json.id;
});

after(async () => {
  db.close();
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('MCP: initialize and tools/list over the agent token', async () => {
  const { token } = issueAgentToken(db, { identityId: 'builder1', jobId });
  const init = await mcp(token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.status, 200);
  assert.equal(init.json.result.serverInfo.name, 'myaos-runtime');
  const list = await mcp(token, 'tools/list');
  const names = list.json.result.tools.map((t: { name: string }) => t.name);
  for (const n of ['job_get', 'task_report', 'evidence_add', 'thread_post', 'blocker_raise', 'usage_report', 'context_report']) assert.ok(names.includes(n), n);
  const notif = await call('POST', '/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, token);
  assert.equal(notif.status, 202, 'notifications get no body');
});

test('an agent token cannot call any owner API route (security S1)', async () => {
  const { token } = issueAgentToken(db, { identityId: 'builder1', jobId });
  for (const [m, r] of [['GET', '/v1/jobs'], ['POST', `/v1/jobs/${jobId}/stage`], ['POST', '/v1/settings'], ['GET', '/v1/settings']] as const) {
    const res = await call(m, r, m === 'POST' ? { to: 'plan' } : undefined, token);
    assert.equal(res.status, 401, `${m} ${r}`);
  }
});

test('the owner token is not an agent token, and bad/expired/revoked tokens are refused', async () => {
  assert.equal((await mcp(rt.token, 'tools/list')).status, 401);
  assert.equal((await mcp('myaos_agt_nope', 'tools/list')).status, 401);
  const expired = issueAgentToken(db, { identityId: 'builder1', jobId, ttlMs: -1000 });
  assert.equal((await mcp(expired.token, 'tools/list')).status, 401);
  const live = issueAgentToken(db, { identityId: 'builder1', jobId, sessionId: 'ses_x' });
  assert.equal((await mcp(live.token, 'tools/list')).status, 200);
  revokeSessionTokens(db, 'ses_x');
  assert.equal((await mcp(live.token, 'tools/list')).status, 401);
});

test('actor comes from the token: evidence is recorded as the token identity, never higher than DECLARED/ATTESTED', async () => {
  const { token } = issueAgentToken(db, { identityId: 'builder1', jobId });
  const ok = await tool(token, 'evidence_add', { kind: 'test', summary: 'ran npm test', command: 'npm test', exitCode: 0 });
  assert.equal(ok.isError, false);
  const mine = (await call('GET', `/v1/evidence/${ok.structuredContent.evidenceId}`)).json;
  assert.equal(mine.recordedBy, 'builder1');
  assert.equal((db.prepare('SELECT recorded_by_kind AS k FROM evidence WHERE id = ?').get(mine.id) as { k: string }).k, 'agent');
  assert.equal(mine.class, 'DECLARED');
  const forged = await tool(token, 'evidence_add', { kind: 'test', summary: 'trust me', class: 'VERIFIED' });
  assert.equal(forged.isError, true, 'VERIFIED is rejected by schema');
  const extra = await tool(token, 'evidence_add', { kind: 'test', summary: 'x', recordedBy: 'kael' });
  assert.equal(extra.isError, true, 'no field lets the caller choose the actor');
  assert.match(extra.content[0].text, /recordedBy is not allowed/);
});

test('a token bound to a job cannot act on another job', async () => {
  const { token } = issueAgentToken(db, { identityId: 'builder1', jobId });
  const r = await tool(token, 'job_get', { jobId: otherJobId });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /only on job/);
  const mine = await tool(token, 'job_get', {});
  assert.equal(mine.structuredContent.id, jobId);
});

test('every call is audited, and idempotency keys replay instead of acting twice', async () => {
  const { token } = issueAgentToken(db, { identityId: 'builder1', jobId });
  const a = await tool(token, 'thread_post', { body: 'hello team', idempotencyKey: 'k1' });
  const b = await tool(token, 'thread_post', { body: 'hello team', idempotencyKey: 'k1' });
  assert.equal(a.structuredContent.messageId, b.structuredContent.messageId);
  const rows = db.prepare("SELECT status FROM tool_calls WHERE identity_id = 'builder1' AND tool = 'thread_post'").all();
  assert.equal(rows.length, 1, 'replay is not a second action');
  await tool(token, 'nope_tool', {});
  const rej = db.prepare("SELECT status, error FROM tool_calls WHERE tool = 'nope_tool'").get() as { status: string; error: string };
  assert.equal(rej.status, 'rejected');
});

test('blocker_raise creates an open blocker linked to the job', async () => {
  const { token } = issueAgentToken(db, { identityId: 'builder1', jobId });
  const r = await tool(token, 'blocker_raise', { summary: 'Need repo access', needs: 'GitHub invite', severity: 'high' });
  const row = db.prepare('SELECT * FROM blockers WHERE id = ?').get(r.structuredContent.blockerId) as Record<string, string>;
  assert.equal(row.job_id, jobId);
  assert.equal(row.status, 'open');
  assert.equal(row.raised_by, 'builder1');
});

test('owner key: once enrolled, reserved routes need it; enrolment happens once', async () => {
  const key = crypto.randomBytes(32).toString('hex');
  assert.equal((await call('GET', '/v1/owner-key')).json.enrolled, false);
  assert.equal((await call('POST', '/v1/settings', { someFlag: true })).status, 200, 'not enforced before enrolment');
  const enrol = await call('POST', '/v1/owner-key', { keyHash: hashOwnerKey(key) });
  assert.equal(enrol.status, 201);
  assert.equal((await call('POST', '/v1/owner-key', { keyHash: hashOwnerKey('attacker') })).status, 409, 'cannot re-enrol');
  assert.equal((await call('POST', '/v1/settings', { someFlag: false })).status, 403, 'owner token alone is not enough');
  assert.equal((await call('POST', '/v1/settings', { someFlag: false }, rt.token, { 'X-MyaOS-Owner-Key': 'wrong' })).status, 403);
  assert.equal((await call('POST', '/v1/settings', { someFlag: false }, rt.token, { 'X-MyaOS-Owner-Key': key })).status, 200);
  assert.equal((await call('POST', '/v1/settings', { ownerKeyHash: 'x' }, rt.token, { 'X-MyaOS-Owner-Key': key })).json.ownerKeyHash, hashOwnerKey(key), 'settings cannot overwrite the key');
  assert.equal((await call('GET', '/v1/jobs')).status, 200, 'ordinary routes are unaffected');
});

test('agent environment allowlist drops runtime variables (security S3)', () => {
  const env = agentEnv({ PATH: '/bin', HOME: '/h', MYAOS_RUNTIME_PORT: '1', MYAOS_SECRET: 'x', ANTHROPIC_API_KEY: 'k', RANDOM_SECRET: 's', LC_ALL: 'C' }, { GEMINI_API_KEY: 'g' });
  assert.deepEqual(Object.keys(env).sort(), ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'HOME', 'LC_ALL', 'PATH']);
  assert.equal(agentEnv({ FOO: '1', MYAOS_AGENT_ENV_PASS: 'FOO' }).FOO, '1');
});

test('a rate-limited agent stays rate-limited when another of its sessions changes state', async () => {
  await call('POST', '/v1/identities', { id: 'limited1', name: 'Limited', role: 'builder', runtime: 'claude' });
  const s1 = (await call('POST', '/v1/sessions', { agentId: 'limited1', runtimeCommand: 'x' })).json;
  await call('POST', '/v1/identities/limited1/rate-limit', { resetAt: new Date(Date.now() + 3600_000).toISOString(), reason: 'weekly limit' });
  await call('POST', '/v1/sessions', { agentId: 'limited1', runtimeCommand: 'y' });
  await call('PATCH', `/v1/sessions/${s1.id}`, { state: 'idle' });
  const row = db.prepare("SELECT status_state FROM identities WHERE id = 'limited1'").get() as { status_state: string };
  assert.equal(row.status_state, 'rate_limited');
});
