#!/usr/bin/env node
// Owner key (security review S1): show or reset the enrolled owner-key fingerprint.
//
//   node runtime/scripts/owner-key.ts status
//   node runtime/scripts/owner-key.ts reset    # runtime must be stopped; the desktop re-enrols on next start
//
// Reset is deliberately offline (the runtime holds the store lock), so an agent cannot reset the
// key through the API. MYAOS_RUNTIME_DB overrides the store path.

import { DatabaseSync } from 'node:sqlite';
import { lockPath, runtimeDbPath } from '../src/config.ts';
import { lockOwner } from '../src/lock.ts';
import { fingerprint, OWNER_KEY_SETTING } from '../src/agent-tools/owner-key.ts';

const cmd = process.argv[2] ?? 'status';
const db = new DatabaseSync(runtimeDbPath());
const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(OWNER_KEY_SETTING) as { value: string } | undefined;
const hash = row ? (JSON.parse(row.value) as string | null) : null;

if (cmd === 'status') {
  console.log(hash ? `Owner key enrolled: ${fingerprint(hash)}` : 'No owner key enrolled');
} else if (cmd === 'reset') {
  const owner = lockOwner(lockPath());
  let running = false;
  try {
    if (owner) process.kill(owner.pid, 0);
    running = Boolean(owner);
  } catch {
    running = false;
  }
  if (running) {
    console.error(`A runtime is running (pid ${owner!.pid}). Quit the MyaOS app or stop the runtime first.`);
    process.exit(2);
  }
  db.prepare('DELETE FROM settings WHERE key = ?').run(OWNER_KEY_SETTING);
  console.log(hash ? `Removed owner key ${fingerprint(hash)}. The desktop enrols its Keychain key on next start.` : 'No owner key was enrolled.');
} else {
  console.error('Usage: owner-key.ts status | reset');
  process.exit(1);
}
db.close();
