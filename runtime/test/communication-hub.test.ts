import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-comm-'));
// Keep the community mirror inside the temp dir: without this the runtime finds the
// repository's real community/ folder and writes test threads and inbox notes into it.
fs.mkdirSync(path.join(dir, 'community', 'inboxes'), { recursive: true });
fs.mkdirSync(path.join(dir, 'community', 'threads'), { recursive: true });
process.env.MYAOS_COMMUNITY_ROOT = path.join(dir, 'community');
let rt: RunningRuntime;

const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${rt.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as any };
};

before(async () => {
  rt = await startRuntime({
    dbPath: path.join(dir, 'runtime.db'),
    allowedOrigins: ['http://localhost:1430'],
  });
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('1. inboxes: send direct message and list recipient inbox stream', async () => {
  const sent = await call('POST', '/v1/communication/inbox', {
    from: 'Winston',
    to: 'astra',
    subject: 'Widget Streaming Architecture',
    body: 'Please review the new WebSocket frame protocol for iOS and Android Mya SDKs.',
    priority: 'high',
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.json.to_identity, 'astra');
  assert.equal(sent.json.from_identity, 'Winston');
  assert.equal(sent.json.priority, 'high');

  const inbox = await call('GET', '/v1/communication/inbox?identity=astra');
  assert.equal(inbox.status, 200);
  assert.ok(Array.isArray(inbox.json));
  const found = inbox.json.find((m: any) => m.id === sent.json.id);
  assert.ok(found, 'Sent message must appear in target mailbox');
  assert.equal(found.subject, 'Widget Streaming Architecture');
});

test('2. threads: create discussion topic, post replies, and retrieve thread conversation', async () => {
  const created = await call('POST', '/v1/communication/threads', {
    title: 'Platform Adaptive Modular Architecture',
    author: 'Winston',
    targetIdentities: ['atlas', 'astra'],
    initialMessage: 'We need to define the contract boundary between Cloud Run host and local widgets.',
  });
  assert.equal(created.status, 201);
  assert.ok(created.json.id.startsWith('th_'));
  assert.equal(created.json.title, 'Platform Adaptive Modular Architecture');

  // Reply to thread
  const reply = await call('POST', `/v1/communication/threads/${created.json.id}/replies`, {
    from: 'atlas',
    body: 'Agreed. Cloud Run will expose `/v1/widget/stream` over HTTP/2 SSE.',
  });
  assert.equal(reply.status, 201);
  assert.equal(reply.json.from_identity, 'atlas');

  // Fetch thread messages
  const msgs = await call('GET', `/v1/communication/threads/${created.json.id}/messages`);
  assert.equal(msgs.status, 200);
  assert.equal(msgs.json.length, 2, 'Initial message and reply must be in thread');
  assert.equal(msgs.json[0].from_identity, 'Winston');
  assert.equal(msgs.json[1].from_identity, 'atlas');

  // List threads
  const list = await call('GET', '/v1/communication/threads');
  assert.equal(list.status, 200);
  const found = list.json.find((t: any) => t.id === created.json.id);
  assert.ok(found);
  assert.equal(found.message_count, 2);
});

test('3. announcements: broadcast directives and verify audience filtering', async () => {
  const broadcast = await call('POST', '/v1/communication/announcements', {
    title: 'Isolated Staging Deployed for Candace Verification',
    author: 'Winston',
    audience: 'engineering',
    content: 'Staging environment is isolated on Cloud Run. Verification gates required before merge.',
  });
  assert.equal(broadcast.status, 201);
  assert.equal(broadcast.json.audience, 'engineering');

  const list = await call('GET', '/v1/communication/announcements?limit=10');
  assert.equal(list.status, 200);
  const found = list.json.find((a: any) => a.id === broadcast.json.id);
  assert.ok(found);
  assert.equal(found.title, 'Isolated Staging Deployed for Candace Verification');
});

test('4. social: post to watercooler and general channels and filter by channel', async () => {
  const post1 = await call('POST', '/v1/communication/social', {
    channel: 'watercooler',
    author: 'collective',
    content: 'Midnight engineering session complete. All 46 runtime tests green.',
  });
  assert.equal(post1.status, 201);

  const post2 = await call('POST', '/v1/communication/social', {
    channel: 'kudos',
    author: 'Winston',
    content: 'Kudos to Kael and Antigravity for rigorous independent verification!',
  });
  assert.equal(post2.status, 201);

  const watercooler = await call('GET', '/v1/communication/social?channel=watercooler');
  assert.equal(watercooler.status, 200);
  assert.ok(watercooler.json.some((p: any) => p.id === post1.json.id));
  assert.ok(!watercooler.json.some((p: any) => p.id === post2.json.id), 'Channel filter must exclude other channels');
});

test('5. standups: record daily roll-call and commitments', async () => {
  const standup = await call('POST', '/v1/communication/standups', {
    standup_date: '2026-11-02',
    facilitator: 'Atlas',
    present_identities: ['Winston', 'Atlas', 'Astra', 'Kael'],
    content: `# Daily Standup: 2026-11-02\n\n### @Astra\n- Done: ported Communication Hub components\n- Next: preview fixtures\n- Blockers: None`,
  });
  assert.equal(standup.status, 201);
  assert.equal(standup.json.standup_date, '2026-11-02');

  const list = await call('GET', '/v1/communication/standups?limit=5');
  assert.equal(list.status, 200);
  const found = list.json.find((s: any) => s.id === standup.json.id);
  assert.ok(found);
  assert.equal(found.facilitator, 'Atlas');
});

test('6. ai generate: without a model it refuses instead of returning canned text', async () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const res = await call('POST', '/v1/communication/ai/generate', {
      prompt: 'Break down the following message. Original: Ensure independent verification rule is satisfied.',
      contextType: 'instruction',
      agentId: 'kael',
    });
    assert.equal(res.status, 503);
    assert.match(res.json.error, /no AI text was generated/);
    assert.equal(res.json.text, undefined, 'no canned summary is returned');
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
  }
});
