import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adapterBlockReason, claudeAccount, codexAccount, geminiAccount } from '../src/adapters.ts';

const base = { name: 'Claude Code', installed: true };

test('adapterBlockReason blocks only adapters known to be unusable (WP0-T6)', () => {
  assert.match(adapterBlockReason({ ...base, installed: false, auth: { state: 'missing_binary', detail: 'x' } })!, /not installed/);
  assert.match(adapterBlockReason({ ...base, auth: { state: 'needs_login', detail: 'run claude' } })!, /not signed in/);
  assert.match(adapterBlockReason({ ...base, auth: { state: 'unsupported', detail: 'x' } })!, /cannot run/);
  assert.equal(adapterBlockReason({ ...base, auth: { state: 'ready', detail: 'ok' } }), null);
  assert.equal(adapterBlockReason({ ...base, auth: { state: 'configured', detail: 'key set' } }), null);
  assert.equal(adapterBlockReason({ ...base, auth: { state: 'unknown', detail: 'override' } }), null, 'unknown may prove itself on a real turn');
});

test('account readers identify the signed-in account for K9 isolation', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-acct-'));
  try {
    assert.deepEqual(claudeAccount({ loggedIn: true, email: 'a@example.com', orgName: 'Client Org' }, home), {
      id: 'a@example.com',
      label: 'a@example.com · Client Org',
      source: 'claude auth status',
    });
    assert.equal(claudeAccount({ loggedIn: true }, home), null, 'no account data -> null, never a guess');
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'b@example.com', organizationName: 'Personal' } }));
    assert.equal(claudeAccount({ loggedIn: true }, home)?.id, 'b@example.com');

    fs.mkdirSync(path.join(home, '.gemini'));
    fs.writeFileSync(path.join(home, '.gemini', 'google_accounts.json'), JSON.stringify({ active: 'g@example.com', old: [] }));
    assert.equal(geminiAccount(home)?.id, 'g@example.com');

    fs.mkdirSync(path.join(home, '.codex'));
    const claims = Buffer.from(JSON.stringify({ email: 'c@example.com' })).toString('base64url');
    fs.writeFileSync(path.join(home, '.codex', 'auth.json'), JSON.stringify({ tokens: { id_token: `h.${claims}.s` } }));
    assert.equal(codexAccount(home)?.id, 'c@example.com');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
