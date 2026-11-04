import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';
import { shouldRotateSession } from '../src/acp/baton.ts';
import {
  detectConsumptionAnomaly,
  recordContextBands,
  resolveRenewalThresholds,
} from '../src/acp/renewal.ts';
import { migrate, openStore, schemaVersion } from '../src/store/db.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';
import { ConflictError } from '../src/errors.ts';
import { addSnapshot, createAccount } from '../src/usage/accounts.ts';
import { checkBudgets } from '../src/usage/budgets.ts';
import { extractModelId, mapAcpUsage, providerOfAdapter } from '../src/usage/mapAcpUsage.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-renewal-'));
const workRoot = path.join(dir, 'work');
fs.mkdirSync(workRoot, { recursive: true });
const fixture = new URL('./fixtures/fake-acp-agent.mjs', import.meta.url).pathname;
const savedHome = process.env.MYAOS_HOME;
process.env.MYAOS_HOME = path.join(dir, 'home');

let rt: RunningRuntime;
let jobId = '';
let projectId = '';
let n = 0;

const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};

const waitFor = async <T>(fn: () => Promise<T | null>, timeoutMs = 20_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('timed out waiting for condition');
};

/** A session row with no running process: enough for the policy, which only reads the store. */
const bareSession = (agentId: string, adapterId = 'fake') =>
  rt.repo.registerSession({ agentId, runtimeCommand: 'none', adapterId, jobId });

const events = (type: string, subjectId?: string) => rt.repo.listEvents({ type, subjectId, limit: 500 });

before(async () => {
  rt = await startRuntime({
    dbPath: path.join(dir, 'runtime.db'),
    workspaceRoots: [workRoot],
    worktreeRoot: path.join(dir, 'worktrees'),
    artifactsDir: path.join(dir, 'artifacts'),
  });
  await call('POST', '/v1/import/identities', {
    owner: { id: 'winston', name: 'Winston' },
    teams: [{ id: 'creativesites', name: 'CreativeSites AI Team' }],
    identities: ['atlas', 'kael', 'daedalus', 'vera', 'orin', 'sable', 'tess', 'quill', 'rhea', 'ingrid'].map((id) => ({
      id,
      name: id[0]!.toUpperCase() + id.slice(1),
      teamId: 'creativesites',
    })),
  });
  for (const id of ['fake', 'claude']) {
    await call('POST', `/v1/adapters/${id}`, { command: process.execPath, args: [fixture], enabled: true });
  }
  const repoDir = path.join(workRoot, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# repo\n');
  execFileSync('git', ['init', '--quiet', '-b', 'main', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '--quiet', '-m', 'init']);
  const attached = await call('POST', '/v1/projects/attach', { path: repoDir, name: 'Renewal repo' });
  projectId = attached.json.project.id;
  const room = await call('POST', '/v1/rooms', { name: 'renewal', projectId });
  const job = await call('POST', '/v1/jobs', {
    roomId: room.json.id,
    projectId,
    title: 'Renewal and budgets',
    brief: 'Exercise K7 renewal and K6 budgets.',
    createdBy: 'winston',
    criteria: ['Renewal keeps the work moving'],
  });
  jobId = job.json.id;
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'plan', actorId: 'winston' });
  await call('POST', `/v1/jobs/${jobId}/plan`, { plan: { summary: 'Renew and budget' }, actorId: 'winston' });
  await call('POST', `/v1/jobs/${jobId}/stage`, { to: 'build', actorId: 'winston' });
});

after(async () => {
  if (savedHome === undefined) delete process.env.MYAOS_HOME;
  else process.env.MYAOS_HOME = savedHome;
  delete process.env.FAKE_MODEL_ID;
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------------------ 10.1 mapper

test('mapAcpUsage: legacy flat fields', () => {
  const m = mapAcpUsage({ sessionUpdate: 'usage_update', inputTokens: 120, outputTokens: 45, costCents: 3 });
  assert.equal(m.inputTokens, 120);
  assert.equal(m.outputTokens, 45);
  assert.equal(m.costCents, 3);
  assert.equal(m.measurement, 'actual');
  assert.equal(m.contextUsed, null);
  assert.equal(mapAcpUsage({ usage: { tokensIn: 7, tokensOut: 9 } }).outputTokens, 9);
});

test('mapAcpUsage: ACP usage_update {used, size, cost} is context, not tokens, and cost.amount is not cents', () => {
  const m = mapAcpUsage({ sessionUpdate: 'usage_update', used: 53000, size: 200000, cost: { amount: 0.42, currency: 'USD' } });
  assert.equal(m.contextUsed, 53000);
  assert.equal(m.contextSize, 200000);
  assert.equal(m.hasTokens, false);
  assert.equal(m.inputTokens, 0);
  assert.equal(m.costCents, 0, 'no prices: a currency amount is never read as cents');
  assert.equal(m.measurement, 'actual');
});

test('mapAcpUsage: nested _meta.usage and Claude-style fields', () => {
  const m = mapAcpUsage({
    stopReason: 'end_turn',
    _meta: { usage: { input_tokens: 10, cache_read_input_tokens: 900, cache_creation_input_tokens: 40, output_tokens: 25, reasoning_tokens: 6, model: 'claude-sonnet-4-5' } },
  });
  assert.deepEqual(
    [m.inputTokens, m.cachedInputTokens, m.cacheWriteTokens, m.outputTokens, m.reasoningTokens, m.modelId],
    [10, 900, 40, 25, 6, 'claude-sonnet-4-5']
  );
  assert.equal(m.measurement, 'actual');
  const viaUsage = mapAcpUsage({ usage: { input_tokens: 1, output_tokens: 2 } });
  assert.equal(viaUsage.inputTokens + viaUsage.outputTokens, 3);
});

test('mapAcpUsage: missing data is unavailable, never an actual zero', () => {
  for (const src of [undefined, null, {}, { stopReason: 'end_turn' }, { usage: {} }, { usage: { inputTokens: 'abc', outputTokens: -4 } }]) {
    const m = mapAcpUsage(src);
    assert.equal(m.measurement, 'unavailable', JSON.stringify(src));
    assert.equal(m.contextUsed, null);
    assert.equal(m.hasTokens, false);
  }
});

test('extractModelId reads session/new models, _meta and agentInfo; the agent name is not a model id', () => {
  assert.equal(extractModelId({ agentInfo: { name: 'fake-acp-agent' } }, { sessionId: 's' }), null);
  assert.equal(extractModelId({}, { models: { currentModelId: 'claude-opus-4-1' } }), 'claude-opus-4-1');
  assert.equal(extractModelId({}, { _meta: { model: 'gemini-2.5-pro' } }), 'gemini-2.5-pro');
  assert.equal(extractModelId({ agentInfo: { name: 'x', _meta: { model: 'm1' } } }, {}), 'm1');
  assert.equal(providerOfAdapter('claude'), 'anthropic');
  assert.equal(providerOfAdapter('gemini'), 'google');
});

test('a fake adapter that reports a model id: sessions.model_id is captured, sessions.model is unchanged', async () => {
  process.env.FAKE_MODEL_ID = 'claude-sonnet-4-5';
  process.env.MYAOS_AGENT_ENV_PASS = 'FAKE_MODEL_ID';
  try {
    const started = await call('POST', `/v1/jobs/${jobId}/sessions`, { agentId: 'tess', adapterId: 'claude', prompt: 'report usage' });
    assert.equal(started.status, 202, JSON.stringify(started.json));
    const idle = await waitFor(async () => {
      const r = await call('GET', `/v1/sessions/${started.json.id}`);
      return r.json?.state === 'idle' ? r.json : null;
    });
    assert.equal(idle.modelId, 'claude-sonnet-4-5');
    assert.equal(idle.model, 'fake-acp-agent', 'the existing model field keeps the ACP agent name');
    const usage = (await call('GET', `/v1/jobs/${jobId}/usage`)).json as any[];
    const row = usage.find((u) => u.sessionId === started.json.id && u.inputTokens === 120);
    assert.ok(row, 'legacy flat usage still recorded');
    assert.equal(row.measurement, 'actual');
    assert.equal(row.agentId, 'tess');
    assert.equal(row.provider, 'anthropic');
    assert.equal(row.modelId, 'claude-sonnet-4-5');
    // Nothing is shipped in the registry and the adapter never reported a size: the window is unknown.
    const before = shouldRotateSession(rt.repo, rt.repo.getSession(started.json.id));
    assert.equal(before.contextWindow ?? null, null);
    // The owner enters a window for this model; it is then used (value is the test's own, not a claim about the model).
    const added = await call('POST', '/v1/model-registry', { provider: 'anthropic', modelId: 'claude-sonnet-4-5', contextWindow: 123456, notes: 'test entry' });
    assert.ok(added.status < 300, JSON.stringify(added.json));
    const check = shouldRotateSession(rt.repo, rt.repo.getSession(started.json.id));
    assert.equal(check.contextWindow, 123456);
  } finally {
    delete process.env.FAKE_MODEL_ID;
    delete process.env.MYAOS_AGENT_ENV_PASS;
  }
});

// ------------------------------------------------------------------ v21

test('v21 migration is idempotent, keeps existing money budgets, and ships an empty registry without prices', () => {
  const file = path.join(dir, 'v21.db');
  const old = openStore(file, MIGRATIONS.filter((m) => m.version <= 18));
  old.prepare("INSERT INTO budgets (id, scope, project_id, period, amount_cents, currency, created_at, updated_at) VALUES ('bud_old','global',NULL,'month',5000,'USD','t','t')").run();
  old.close();
  const db = openStore(file);
  assert.equal(schemaVersion(db), Math.max(...MIGRATIONS.map((m) => m.version)));
  const kept = db.prepare("SELECT kind, amount_cents, warn_pct, hard_pct FROM budgets WHERE id = 'bud_old'").get() as any;
  assert.deepEqual({ ...kept }, { kind: 'money', amount_cents: 5000, warn_pct: 80, hard_pct: 100 });
  const seeded = (db.prepare('SELECT COUNT(*) AS c FROM model_registry').get() as any).c;
  assert.equal(seeded, 0, 'no context window is shipped from memory');
  migrate(db);
  migrate(db);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM schema_migrations WHERE version = 21').get() as any).c, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM model_registry').get() as any).c, seeded);
  const cols = (db.prepare('PRAGMA table_info(usage)').all() as any[]).map((c) => c.name);
  for (const c of ['agent_id', 'task_id', 'provider', 'model_id', 'cached_input_tokens', 'cache_write_tokens', 'reasoning_tokens', 'measurement', 'context_used', 'context_size']) {
    assert.ok(cols.includes(c), `usage.${c}`);
  }
  const scols = (db.prepare('PRAGMA table_info(sessions)').all() as any[]).map((c) => c.name);
  assert.ok(scols.includes('context_window') && scols.includes('model_id'));
  assert.ok((db.prepare('PRAGMA table_info(identities)').all() as any[]).some((c) => c.name === 'renewal_policy'));
  assert.equal((db.prepare('PRAGMA table_info(model_registry)').all() as any[]).some((c) => /price|cost/i.test(c.name)), false);
  db.close();
});

// ------------------------------------------------------------------ 10.3 policy

test('utilisation % exists only with a known window; bands fire once each; the prepare band stores the continuation package', () => {
  const s = bareSession('daedalus');
  // Unknown window first: no percentage, ever.
  rt.repo.recordUsage({ sessionId: s.id, jobId, inputTokens: 1000, outputTokens: 10 });
  const unknown = shouldRotateSession(rt.repo, rt.repo.getSession(s.id));
  assert.equal(unknown.pct, null);
  assert.equal(unknown.contextWindow, null);
  assert.equal(unknown.measurement, 'estimated');

  const at = (used: number) => rt.repo.recordUsage({ sessionId: s.id, jobId, contextUsed: used, contextSize: 100_000, inputTokens: 5, outputTokens: 5 });
  const bandsSeen = () => events('session.context_threshold', s.id).map((e) => (e.payload as any).band);

  at(50_000);
  let c = shouldRotateSession(rt.repo, rt.repo.getSession(s.id));
  assert.equal(c.pct, 50);
  assert.equal(c.band, 'healthy');
  assert.equal(c.measurement, 'actual');
  assert.equal(c.rotate, false);
  recordContextBands(rt.repo, s.id);
  assert.deepEqual(bandsSeen(), []);

  at(62_000);
  recordContextBands(rt.repo, s.id);
  recordContextBands(rt.repo, s.id); // a second look at the same band emits nothing
  assert.deepEqual(bandsSeen(), ['monitor']);
  assert.equal(rt.repo.getSession(s.id).continuationPackage, null);

  at(76_000);
  recordContextBands(rt.repo, s.id);
  assert.deepEqual(bandsSeen(), ['monitor', 'prepare']);
  const pkg = rt.repo.getSession(s.id).continuationPackage as any;
  assert.ok(pkg, 'the prepare band compiles and stores the continuation package');
  for (const k of ['discoveries', 'decisions', 'commits', 'blockers', 'acceptanceCriteria', 'nextActions']) {
    assert.ok(Array.isArray(pkg[k]), k);
  }
  assert.equal(pkg.acceptanceCriteria[0].text, 'Renewal keeps the work moving');

  at(86_000);
  c = shouldRotateSession(rt.repo, rt.repo.getSession(s.id));
  assert.equal(c.band, 'renew');
  assert.equal(c.rotate, true);
  assert.equal(c.reason, 'context_pct_threshold');
  assert.equal(c.blocked, false);
  recordContextBands(rt.repo, s.id);

  at(96_000);
  c = shouldRotateSession(rt.repo, rt.repo.getSession(s.id));
  assert.equal(c.band, 'block');
  assert.equal(c.blocked, true);
  recordContextBands(rt.repo, s.id);
  recordContextBands(rt.repo, s.id);
  assert.deepEqual(bandsSeen(), ['monitor', 'prepare', 'renew', 'block']);
  const first = events('session.context_threshold', s.id)[0]!.payload as any;
  assert.equal(first.pct, 62);
  assert.equal(first.measurement, 'actual');
});

test('threshold resolution: global, then provider, then model, then identity override', () => {
  const s = bareSession('vera', 'claude');
  rt.repo.updateSession(s.id, { modelId: 'claude-opus-4-1' });
  const resolve = () => resolveRenewalThresholds(rt.repo, { agentId: 'vera', provider: 'anthropic', modelId: 'claude-opus-4-1' });
  assert.deepEqual(resolve().thresholds, { monitor: 60, prepare: 75, renew: 85, block: 95 });
  rt.repo.updateSettings({ 'renewal.contextPct': { monitor: 55, prepare: 70, renew: 80, block: 92 } });
  assert.equal(resolve().thresholds.renew, 80);
  rt.repo.updateSettings({ 'renewal.byProvider.anthropic': { renew: 82 } });
  assert.equal(resolve().thresholds.renew, 82);
  rt.repo.updateSettings({ 'renewal.byModel.claude-opus-4-1': { renew: 78, block: 90 } });
  assert.equal(resolve().thresholds.renew, 78);
  assert.equal(resolve().thresholds.block, 90);
  rt.repo.setIdentityRenewalPolicy('vera', { renew: 74, prepare: 65 });
  const r = resolve();
  assert.equal(r.thresholds.renew, 74);
  assert.deepEqual(r.layers, ['default', 'global', 'provider:anthropic', 'model:claude-opus-4-1', 'identity:vera']);
  // The layers change the decision: 76% is now past renew.
  rt.repo.recordUsage({ sessionId: s.id, jobId, contextUsed: 76_000, contextSize: 100_000, inputTokens: 1 });
  assert.equal(shouldRotateSession(rt.repo, rt.repo.getSession(s.id)).band, 'renew');
  // An inconsistent layer is ignored rather than half applied.
  rt.repo.updateSettings({ 'renewal.byProvider.anthropic': { renew: 40 } });
  assert.equal(resolve().thresholds.renew, 74);
  for (const k of ['renewal.contextPct', 'renewal.byProvider.anthropic', 'renewal.byModel.claude-opus-4-1']) rt.repo.updateSettings({ [k]: null as never });
  rt.repo.setIdentityRenewalPolicy('vera', null);
});

test('unknown window falls back to the absolute token thresholds and is labelled estimated', () => {
  const s = bareSession('orin');
  rt.repo.recordUsage({ sessionId: s.id, jobId, inputTokens: 26_000, outputTokens: 100 });
  let c = shouldRotateSession(rt.repo, rt.repo.getSession(s.id));
  assert.equal(c.pct, null);
  assert.equal(c.measurement, 'estimated');
  assert.equal(c.band, 'monitor'); // 26k of the 36k soft limit is past 60/85 of it (25.4k) but not 75/85 (31.8k)
  assert.equal(c.rotate, false);
  // (the existing absolute figure sums a session's input tokens, so each step uses its own session)
  const s2 = bareSession('orin');
  rt.repo.recordUsage({ sessionId: s2.id, jobId, inputTokens: 40_000, outputTokens: 100 });
  c = shouldRotateSession(rt.repo, rt.repo.getSession(s2.id));
  assert.equal(c.rotate, true);
  assert.equal(c.reason, 'context_tokens_threshold');
  assert.equal(c.measurement, 'estimated');
  assert.equal(c.blocked, false);
  const s3 = bareSession('orin');
  rt.repo.recordUsage({ sessionId: s3.id, jobId, inputTokens: 70_000, outputTokens: 100 });
  assert.equal(shouldRotateSession(rt.repo, rt.repo.getSession(s3.id)).band, 'block');
  recordContextBands(rt.repo, s3.id);
  const ev = events('session.context_threshold', s3.id).map((e) => e.payload as any);
  assert.deepEqual(ev.map((p) => p.band), ['monitor', 'prepare', 'renew', 'block']);
  assert.ok(ev.every((p) => p.measurement === 'estimated' && p.pct === null && typeof p.tokens === 'number'));
});

test('renew band: the next prompt rotates the same identity into a new generation with the continuation package', async () => {
  const started = await call('POST', `/v1/jobs/${jobId}/sessions`, { agentId: 'sable', adapterId: 'fake', prompt: 'create a file' });
  assert.equal(started.status, 202, JSON.stringify(started.json));
  const gen1 = started.json.id as string;
  await waitFor(async () => ((await call('GET', `/v1/sessions/${gen1}`)).json?.state === 'idle' ? true : null));
  await call('POST', `/v1/sessions/${gen1}/transcript`, {
    kind: 'message',
    role: 'assistant',
    payload: { text: 'Chose the SQLite store. We decided to keep one writer.\n[STATE]\ndone: wrote the schema\nnext: wire the renewal policy\n[/STATE]' },
  });
  const blocker = await call('POST', `/v1/jobs/${jobId}/blockers`, { raisedBy: 'sable', summary: 'Waiting on the model registry values', needs: 'owner confirmation' });
  await call('POST', `/v1/jobs/${jobId}/usage`, { sessionId: gen1, contextUsed: 86_000, contextSize: 100_000, inputTokens: 100, outputTokens: 50 });

  const prompt = await call('POST', `/v1/sessions/${gen1}/prompt`, { text: 'echo ok' });
  assert.equal(prompt.status, 202, JSON.stringify(prompt.json));
  const gen2 = prompt.json.session;
  assert.notEqual(gen2.id, gen1);
  assert.equal(gen2.agentId, 'sable');
  assert.equal(gen2.generation, 2);
  assert.equal(gen2.parentSessionId, gen1);
  const pkg = gen2.continuationPackage ?? (await call('GET', `/v1/sessions/${gen2.id}`)).json.continuationPackage;
  assert.ok(pkg, 'the new generation carries the continuation package');
  assert.ok(pkg.discoveries.some((d: string) => /wrote the schema/.test(d)));
  assert.ok(pkg.decisions.some((d: string) => /decided to keep one writer/.test(d)));
  assert.ok(pkg.nextActions.some((d: string) => /wire the renewal policy/.test(d)));
  assert.ok(pkg.acceptanceCriteria.some((c: any) => c.text === 'Renewal keeps the work moving'));
  if (blocker.status === 201 || blocker.status === 200) assert.ok(pkg.blockers.some((b: string) => /model registry values/.test(b)));
  assert.match(gen2.batonCapsule, /\[CONTINUATION PACKAGE\]/);
  assert.match(gen2.batonCapsule, /Next actions:/);

  const renewed = events('session.renewed', gen1);
  assert.equal(renewed.length, 1);
  assert.deepEqual({ from: (renewed[0]!.payload as any).from, to: (renewed[0]!.payload as any).to, reason: (renewed[0]!.payload as any).reason }, { from: gen1, to: gen2.id, reason: 'context_pct_threshold' });
  assert.equal((renewed[0]!.payload as any).trigger, 'threshold');
  await waitFor(async () => ((await call('GET', `/v1/sessions/${gen2.id}`)).json?.state === 'idle' ? true : null));
});

test('block band refuses a prompt that cannot be carried (409) unless renewal.allowOverBlock is true', async () => {
  const started = await call('POST', `/v1/jobs/${jobId}/sessions`, { agentId: 'quill', adapterId: 'fake', prompt: 'echo ok' });
  const id = started.json.id as string;
  await waitFor(async () => ((await call('GET', `/v1/sessions/${id}`)).json?.state === 'idle' ? true : null));
  await call('POST', `/v1/jobs/${jobId}/usage`, { sessionId: id, contextUsed: 96_000, contextSize: 100_000, inputTokens: 10 });

  const refused = await call('POST', `/v1/sessions/${id}/prompt`, { text: 'echo ok', skipAutoRotate: true });
  assert.equal(refused.status, 409);
  assert.match(refused.json.error ?? refused.json.message ?? JSON.stringify(refused.json), /block level/);

  await call('POST', '/v1/settings', { 'renewal.allowOverBlock': true });
  const allowed = await call('POST', `/v1/sessions/${id}/prompt`, { text: 'echo ok', skipAutoRotate: true });
  assert.equal(allowed.status, 202, JSON.stringify(allowed.json));
  await call('POST', '/v1/settings', { 'renewal.allowOverBlock': false });
  await waitFor(async () => ((await call('GET', `/v1/sessions/${id}`)).json?.state === 'idle' ? true : null));
});

// ------------------------------------------------------------------ 10.5 anomaly

test('anomaly: a turn above 3x the identity median (and 2000 tokens) emits band anomaly and does not force renewal', () => {
  const s = bareSession('rhea');
  for (let i = 0; i < 8; i++) rt.repo.recordUsage({ sessionId: s.id, jobId, inputTokens: 1000, outputTokens: 500 });
  // Exactly 3x is not above 3x.
  rt.repo.recordUsage({ sessionId: s.id, jobId, inputTokens: 3000, outputTokens: 1500 });
  assert.equal(detectConsumptionAnomaly(rt.repo, s.id).anomaly, false);
  assert.equal(events('session.context_threshold', s.id).length, 0);

  rt.repo.recordUsage({ sessionId: s.id, jobId, inputTokens: 9000, outputTokens: 1000 });
  const r = detectConsumptionAnomaly(rt.repo, s.id);
  assert.equal(r.anomaly, true);
  assert.equal(r.medianTokens, 1500);
  assert.equal(r.tokens, 10_000);
  const ev = events('session.context_threshold', s.id);
  assert.equal(ev.length, 1);
  const p = ev[0]!.payload as any;
  assert.equal(p.band, 'anomaly');
  assert.equal(p.recommendation, 'renew');
  assert.equal(p.tokens, 10_000);
  detectConsumptionAnomaly(rt.repo, s.id); // the same turn is reported once
  assert.equal(events('session.context_threshold', s.id).length, 1);
  assert.equal(shouldRotateSession(rt.repo, rt.repo.getSession(s.id)).rotate, false, 'an anomaly recommends, it does not force');
});

test('anomaly: needs more than 2000 tokens, enough history, and ignores unavailable rows', () => {
  const s = bareSession('ingrid');
  for (let i = 0; i < 8; i++) rt.repo.recordUsage({ sessionId: s.id, jobId, inputTokens: 200, outputTokens: 100 });
  rt.repo.recordUsage({ sessionId: s.id, jobId, inputTokens: 1400, outputTokens: 100 }); // 5x the median but under 2000
  assert.equal(detectConsumptionAnomaly(rt.repo, s.id).anomaly, false);
  rt.repo.recordUsage({ sessionId: s.id, jobId, measurement: 'unavailable' });
  const r = detectConsumptionAnomaly(rt.repo, s.id);
  assert.equal(r.anomaly, false);
  assert.equal(r.tokens, 1500, 'an unavailable row is not a zero-token turn');
});

// ------------------------------------------------------------------ 10.4 budgets

test('tokens budget: warn once per period, then hard refuses with 409 and a Needs You approval; approving is a one-time override', async () => {
  rt.repo.createBudget({ scope: 'agent', scopeId: 'kael', period: 'month', kind: 'tokens', amount: 1000 });
  const ctx = { agentId: 'kael', jobId, projectId };
  const bs = bareSession('kael');
  rt.repo.recordUsage({ sessionId: bs.id, jobId, inputTokens: 700, outputTokens: 150 }); // 850 of 1000

  let check = checkBudgets(rt.repo, ctx);
  assert.equal(check.warnings.length, 1);
  assert.equal(check.warnings[0]!.level, 'warn');
  checkBudgets(rt.repo, ctx);
  checkBudgets(rt.repo, ctx);
  assert.equal(events('budget.warning').filter((e) => (e.payload as any).scopeKey === 'agent:kael').length, 1, 'one warning per budget per period');

  // Unavailable usage never counts toward a tokens budget.
  rt.repo.recordUsage({ sessionId: bs.id, jobId, measurement: 'unavailable' });
  assert.doesNotThrow(() => checkBudgets(rt.repo, ctx));

  rt.repo.recordUsage({ sessionId: bs.id, jobId, inputTokens: 120, outputTokens: 80 }); // 1050
  assert.throws(() => checkBudgets(rt.repo, ctx), (e: unknown) => e instanceof ConflictError && /Budget reached/.test((e as Error).message));
  const pending = () => rt.repo.listApprovals({ status: 'pending', limit: 100 }).filter((a) => a.actionType === 'budget.exceed');
  assert.equal(pending().length, 1);
  assert.throws(() => checkBudgets(rt.repo, ctx), ConflictError);
  assert.equal(pending().length, 1, 'a repeated attempt does not stack approvals');
  const card = pending()[0]!;
  for (const word of ['continue with approval', 'renew the session', 'smaller model', 'reassign', 'escalate']) {
    assert.match(card.consequence, new RegExp(word, 'i'));
  }
  assert.ok(rt.repo.needsYou().some((i) => i.kind === 'approval' && i.id === card.id), 'shows in /v1/needs-you');
  const needs = await call('GET', '/v1/needs-you');
  assert.ok((needs.json as any[]).some((i) => i.id === card.id));

  // The same refusal reaches the HTTP edge as a 409 on session start.
  const refused = await call('POST', `/v1/jobs/${jobId}/sessions`, { agentId: 'kael', adapterId: 'fake', prompt: 'echo ok' });
  assert.equal(refused.status, 409);

  rt.repo.decideApproval(card.id, { decision: 'approve', decidedBy: 'winston', decidedByKind: 'human' });
  check = checkBudgets(rt.repo, ctx);
  assert.ok(check.overrideUsed, 'the first prompt after approval passes on the override');
  assert.throws(() => checkBudgets(rt.repo, ctx), ConflictError);
  assert.equal(pending().length, 1, 'a fresh card for the next refusal; the override was spent once');
  assert.equal(events('budget.override_used').length >= 1, true);
});

test('weekly_pct budgets use the latest account snapshot and attributed task_usage for the scope', () => {
  const db = rt.repo.sqlite();
  const account = createAccount(db, { provider: 'anthropic', plan: 'Max 5x', label: 'Test account', limitModel: 'claude_5h_weekly_pct' });
  const resets = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
  const nowMs = Date.now();
  addSnapshot(db, account.id, { weeklyPct: 30, weeklyResetsAt: resets, capturedAt: new Date(nowMs - 60_000).toISOString() });

  // Whole-account share: stop the team at 50% of the weekly limit.
  rt.repo.createBudget({ scope: 'global', period: 'week', kind: 'weekly_pct', amount: 50, accountId: account.id });
  const ctx = { agentId: 'atlas', jobId, projectId, accountId: account.id };
  let check = checkBudgets(rt.repo, ctx);
  assert.equal(check.statuses.length, 1);
  assert.equal(check.statuses[0]!.level, 'ok');
  assert.equal(check.statuses[0]!.used, 30);

  addSnapshot(db, account.id, { weeklyPct: 45, weeklyResetsAt: resets, capturedAt: new Date(nowMs - 30_000).toISOString() });
  check = checkBudgets(rt.repo, ctx);
  assert.equal(check.warnings[0]!.level, 'warn', '45 of 50 is 90%');
  assert.equal(check.warnings[0]!.measurement, 'actual');

  addSnapshot(db, account.id, { weeklyPct: 51, weeklyResetsAt: resets, capturedAt: new Date(nowMs - 10_000).toISOString() });
  assert.throws(() => checkBudgets(rt.repo, ctx), ConflictError);

  // A share for one agent: attributed task_usage rows, always an estimate.
  const insert = db.prepare(
    `INSERT INTO task_usage (id, task_id, job_id, session_id, account_id, agent_id, started_at, ended_at, attributed_weekly_pct)
     VALUES (?, NULL, ?, NULL, ?, 'tess', ?, ?, ?)`
  );
  const t = new Date().toISOString();
  insert.run('tu_1', jobId, account.id, t, t, 3);
  insert.run('tu_2', jobId, account.id, t, t, 4.5);
  rt.repo.createBudget({ scope: 'agent', scopeId: 'tess', period: 'week', kind: 'weekly_pct', amount: 10, accountId: account.id });
  db.prepare("DELETE FROM budgets WHERE scope = 'global' AND kind = 'weekly_pct'").run(); // isolate the agent budget
  check = checkBudgets(rt.repo, { agentId: 'tess', jobId, projectId, accountId: account.id });
  assert.equal(check.statuses.length, 1);
  assert.equal(check.statuses[0]!.used, 7.5);
  assert.equal(check.statuses[0]!.level, 'ok');
  assert.equal(check.statuses[0]!.measurement, 'estimated');
  insert.run('tu_3', jobId, account.id, t, t, 3);
  assert.throws(() => checkBudgets(rt.repo, { agentId: 'tess', jobId, projectId, accountId: account.id }), ConflictError); // 10.5 of 10
});
