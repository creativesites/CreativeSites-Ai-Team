import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openStore } from '../src/store/db.ts';
import { createAccount } from '../src/usage/accounts.ts';
import { decideSessionAccount, startSessionUsage, stopSessionUsage } from '../src/usage/session-hooks.ts';

test('K9 wiring: client project only on its account; client account only on its projects; usage rows open and close', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-k9-'));
  try {
    const db = openStore(path.join(dir, 'r.db'));
    const t = new Date().toISOString();
    for (const id of ['p_client', 'p_personal']) db.prepare("INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)").run(id, id, t);
    const client = createAccount(db, { provider: 'anthropic', plan: 'claude_team', label: 'Client account', ownerScope: 'client:a', limitModel: 'claude_5h_weekly_pct', adapterAccountId: 'me@client.example' });
    const personal = createAccount(db, { provider: 'anthropic', plan: 'claude_pro', label: 'Personal', ownerScope: 'personal', limitModel: 'claude_5h_weekly_pct', adapterAccountId: 'me@personal.example' });
    db.prepare('UPDATE projects SET ai_account_id = ?, confidential = 1 WHERE id = ?').run(client.id, 'p_client');
    db.prepare('UPDATE projects SET ai_account_id = ? WHERE id = ?').run(personal.id, 'p_personal');

    assert.deepEqual(decideSessionAccount(db, 'p_client', 'me@client.example'), { ok: true, accountId: client.id });
    assert.equal(decideSessionAccount(db, 'p_client', 'me@personal.example').ok, false, 'client work refused on the personal login');
    assert.equal(decideSessionAccount(db, 'p_personal', 'me@client.example').ok, false, 'personal work refused on the client login');
    assert.equal(decideSessionAccount(db, null, 'me@client.example').ok, false, 'unassigned work refused on the client login');
    assert.equal(decideSessionAccount(db, null, 'me@personal.example').ok, true);

    db.prepare("INSERT INTO identities (id, name, role, runtime, avatar_mark, avatar_color, seats, created_at) VALUES ('a1','A','b','claude','A','#0','[]',?)").run(t);
    db.prepare("INSERT INTO sessions (id, agent_id, runtime_command, state, started_at) VALUES ('s1','a1','x','running',?)").run(t);
    const id = startSessionUsage(db, { accountId: personal.id, sessionId: 's1', taskId: null, jobId: null, agentId: 'a1', taskType: 'quick' });
    assert.ok(id);
    assert.equal(stopSessionUsage(db, 's1'), 1);
    assert.equal(stopSessionUsage(db, 's1'), 0);
    const row = db.prepare('SELECT measurement, ended_at FROM task_usage WHERE id = ?').get(id!) as { measurement: string; ended_at: string };
    assert.equal(row.measurement, 'estimated');
    assert.ok(row.ended_at);
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
