import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore, prunePreMigrationBackups } from '../src/store/db.ts';
import { MIGRATIONS } from '../src/store/migrations.ts';
import { backupStore, listBackups, migrationDryRun, restoreStore, tableCounts } from '../src/store/backup.ts';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-backup-'));
}

test('backup is a consistent copy and restore reproduces row counts (WP0-T7)', () => {
  const dir = tmp();
  try {
    const dbPath = path.join(dir, 'runtime.db');
    const db = openStore(dbPath);
    db.prepare("INSERT INTO identities (id, name, role, runtime, avatar_mark, avatar_color, seats, created_at) VALUES ('t1','T1','builder','claude','T','#000','[]',?)").run(new Date().toISOString());
    const before = tableCounts(db);
    const b = backupStore(dbPath);
    assert.equal((fs.statSync(b.path).mode & 0o777).toString(8), '600', 'backup is owner-only');

    db.prepare('DELETE FROM identities').run();
    db.close();

    const r = restoreStore(b.path, dbPath);
    assert.ok(r.previous && fs.existsSync(r.previous.path), 'the replaced store is kept so a restore can be undone');
    const restored = new DatabaseSync(dbPath, { readOnly: true });
    assert.deepEqual(tableCounts(restored), before);
    restored.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('backups are pruned to the newest N', () => {
  const dir = tmp();
  try {
    const dbPath = path.join(dir, 'runtime.db');
    openStore(dbPath).close();
    for (let i = 0; i < 4; i++) backupStore(dbPath, { keep: 2, now: new Date(Date.UTC(2026, 10, 3, 10, i)) });
    const left = listBackups(path.join(dir, 'backups'));
    assert.equal(left.length, 2);
    assert.match(left[0]!.path, /10-03-00/, 'newest kept first');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restore refuses a corrupt backup and leaves the store untouched', () => {
  const dir = tmp();
  try {
    const dbPath = path.join(dir, 'runtime.db');
    openStore(dbPath).close();
    const bad = path.join(dir, 'bad.db');
    fs.writeFileSync(bad, 'not a database');
    assert.throws(() => restoreStore(bad, dbPath));
    const db = new DatabaseSync(dbPath, { readOnly: true });
    assert.ok(tableCounts(db).identities !== undefined);
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migration dry-run reports pending versions and never touches the real store (WP0-T8)', () => {
  const dir = tmp();
  try {
    const dbPath = path.join(dir, 'runtime.db');
    const older = MIGRATIONS.filter((m) => m.version <= 5);
    openStore(dbPath, older).close();
    const sizeBefore = fs.statSync(dbPath).size;

    const r = migrationDryRun(dbPath);
    assert.equal(r.fromVersion, 5);
    assert.equal(r.toVersion, Math.max(...MIGRATIONS.map((m) => m.version)));
    assert.ok(r.pending.length > 0);
    assert.deepEqual(r.changed, [], 'additive migrations keep existing row counts');
    assert.equal(r.integrity, 'ok');

    const real = new DatabaseSync(dbPath, { readOnly: true });
    const v = (real.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v;
    real.close();
    assert.equal(v, 5, 'real store is still at its old version');
    assert.equal(fs.statSync(dbPath).size, sizeBefore);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-migration copies are capped', () => {
  const dir = tmp();
  try {
    const dbPath = path.join(dir, 'runtime.db');
    fs.writeFileSync(dbPath, '');
    for (let i = 0; i < 5; i++) {
      const f = `${dbPath}.bak-v${i}-x`;
      fs.writeFileSync(f, '');
      fs.utimesSync(f, new Date(1000 * i), new Date(1000 * i));
    }
    const removed = prunePreMigrationBackups(dbPath, 3);
    assert.equal(removed.length, 2);
    assert.ok(removed.includes('runtime.db.bak-v0-x'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
