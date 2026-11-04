#!/usr/bin/env node
// WP0-T7/T8: back up, list, restore and dry-run-migrate the v2 store.
//
//   node runtime/scripts/store.ts backup            # consistent copy, keeps the newest 10
//   node runtime/scripts/store.ts list
//   node runtime/scripts/store.ts restore <file>    # refuses while a runtime is running
//   node runtime/scripts/store.ts dry-run           # migrate a copy, print row counts
//
// MYAOS_RUNTIME_DB overrides the store path, as for the runtime itself.

import fs from 'node:fs';
import { lockPath, runtimeDbPath } from '../src/config.ts';
import { lockOwner } from '../src/lock.ts';
import { backupDir, backupStore, listBackups, migrationDryRun, restoreStore } from '../src/store/backup.ts';

const [cmd, arg] = process.argv.slice(2);
const dbPath = runtimeDbPath();

function refuseIfRunning() {
  const owner = lockOwner(lockPath());
  let alive = false;
  try {
    if (owner) process.kill(owner.pid, 0);
    alive = Boolean(owner);
  } catch {
    alive = false; // stale lock left by a dead runtime
  }
  if (owner && alive) {
    console.error(`A runtime is running (pid ${owner.pid}). Quit the MyaOS app or stop the runtime first.`);
    process.exit(2);
  }
}

switch (cmd) {
  case 'backup': {
    const b = backupStore(dbPath);
    console.log(`Backed up ${dbPath} -> ${b.path} (${b.bytes} bytes)`);
    break;
  }
  case 'list': {
    for (const b of listBackups(backupDir(dbPath))) console.log(`${b.createdAt}  ${b.bytes.toString().padStart(10)}  ${b.path}`);
    break;
  }
  case 'restore': {
    if (!arg || !fs.existsSync(arg)) {
      console.error('Usage: store.ts restore <backup-file>');
      process.exit(1);
    }
    refuseIfRunning();
    const r = restoreStore(arg, dbPath);
    console.log(`Restored ${arg} -> ${r.restored}${r.previous ? ` (previous store saved as ${r.previous.path})` : ''}`);
    break;
  }
  case 'dry-run': {
    const r = migrationDryRun(dbPath);
    console.log(`Schema v${r.fromVersion} -> v${r.toVersion}; pending: ${r.pending.length ? r.pending.join(', ') : 'none'}; integrity: ${r.integrity}`);
    for (const t of r.tables) console.log(`${t.table.padEnd(32)} ${String(t.before ?? 'new').padStart(8)} -> ${String(t.after).padStart(8)}`);
    if (r.changed.length) {
      console.error(`Row counts changed in existing tables: ${r.changed.join(', ')}`);
      process.exit(3);
    }
    break;
  }
  default:
    console.error('Usage: store.ts backup | list | restore <file> | dry-run');
    process.exit(1);
}
