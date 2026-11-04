'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const rpc = require('../../src/knowledge/rpc');
const { makeKi, SPEC_MD } = require('./helpers');

function tsxFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tsxFiles(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

test('UI contract: every KI method the desktop calls exists in the RPC, and the view is registered in navigation', () => {
  const root = path.resolve(__dirname, '../../desktop/src');
  const files = [...tsxFiles(path.join(root, 'views/knowledge')), path.join(root, 'views/KnowledgeIntelligenceView.tsx')];
  const called = new Set();
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\b(?:ki(?:<[^>]*>)?|useKi(?:<[^>]*>)?)\(\s*'([a-zA-Z.]+)'/g)) called.add(m[1]);
  assert.ok(called.size >= 30, `found ${called.size} calls`);
  const missing = [...called].filter((m) => !rpc.methods.includes(m));
  assert.deepEqual(missing, [], 'desktop calls methods the runtime does not implement');
  assert.match(fs.readFileSync(path.join(root, 'components/NavigationSidebar.tsx'), 'utf8'), /id: 'knowledge', label: 'Knowledge & Intelligence'/);
  assert.match(fs.readFileSync(path.join(root, 'App.tsx'), 'utf8'), /devView === 'knowledge' && <KnowledgeIntelligenceView/);
  assert.match(fs.readFileSync(path.resolve(__dirname, '../../desktop/src-tauri/src/main.rs'), 'utf8'), /myaos_knowledge_call/);
});

test('RPC bridge end to end (spawned process, host-configured principal): upload -> list -> search -> error envelope', () => {
  const dir = fs.mkdtempSync(path.join(process.env.KI_TEST_TMP || os.tmpdir(), 'ki-rpc-'));
  const env = { ...process.env, KI_DB_PATH: path.join(dir, 'k.db'), MYAOS_DB_PATH: path.join(dir, 'none.db'), KI_USER: 'winston', KI_ROLE: 'owner', KI_ORG: 'creativesites' };
  const call = (method, params = {}) => { const r = spawnSync('node', [path.resolve(__dirname, '../../bin/ki-rpc.js')], { input: JSON.stringify({ method, params }), env, encoding: 'utf8' }); return JSON.parse(r.stdout); };
  try {
    // data dir is derived from baseDir; point it at the temp dir via KI_DB_PATH only, objects go under repo data/ki (git-ignored)
    const up = call('documents.upload', { filename: 'spec.md', base64: Buffer.from(SPEC_MD).toString('base64'), category: 'technical_spec' });
    assert.equal(up.ok, true, JSON.stringify(up)); assert.equal(up.result.status, 'available');
    const dup = call('documents.upload', { filename: 'spec.md', base64: Buffer.from(SPEC_MD).toString('base64'), category: 'technical_spec' });
    assert.equal(dup.result.duplicate, true);
    assert.equal(call('documents.list').result.length, 1);
    const s = call('search', { query: 'encrypted at rest', types: ['document'] });
    assert.ok(s.result.results.length > 0);
    const cap = call('capture.message', { text: 'Please send the audit report by 2026-12-01.', authorId: 'barbara' });
    assert.equal(cap.result.extraction.created.length, 1);
    assert.equal(call('commitments.list', { status: 'needs_confirmation' }).result.length, 1);
    assert.equal(call('health').result.audit.ok, true);
    const bad = call('does.not.exist'); assert.equal(bad.ok, false); assert.equal(bad.error.code, 'NOT_FOUND');
    // the request body cannot choose its own privileges
    const viewerEnv = { ...env, KI_ROLE: 'viewer' };
    const r = spawnSync('node', [path.resolve(__dirname, '../../bin/ki-rpc.js')], { input: JSON.stringify({ method: 'knowledge.propose', params: { type: 'fact', title: 't', content: 'c' }, principal: { role: 'owner' } }), env: viewerEnv, encoding: 'utf8' });
    assert.equal(JSON.parse(r.stdout).ok, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('every RPC method that mutates is permission-checked by the service layer (viewer cannot mutate)', async () => {
  const h = makeKi(); const { ki, principals: p } = h;
  try {
    for (const [m, params] of [['knowledge.propose', { type: 'fact', title: 't', content: 'c' }], ['commitments.propose', { kind: 'request', description: 'x y z' }], ['documents.upload', { filename: 'a.md', base64: Buffer.from('# a\n\nbody text\n').toString('base64') }]]) {
      await assert.rejects(() => rpc.handle(ki, { method: m, params }, { KI_USER: 'v', KI_ROLE: 'viewer', KI_ORG: h.ORG }), /lacks permission/, m);
    }
  } finally { h.cleanup(); }
});
