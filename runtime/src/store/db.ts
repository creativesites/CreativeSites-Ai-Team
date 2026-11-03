import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, type Migration } from './migrations.ts';

/** The store holds transcripts, prompts and evidence: only the owner may read it. */
function privateDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* best effort on filesystems without POSIX modes */
  }
}

function privateFile(file: string) {
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* the file may not exist yet */
  }
}

/**
 * Before a migration runs, keep a copy of the previous store. Cheap insurance
 * for the one operation that can rewrite the schema under real evidence.
 */
function backupBeforeUpgrade(db: DatabaseSync, dbPath: string, from: number, to: number) {
  if (dbPath === ':memory:' || from <= 0 || from >= to) return;
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = `${dbPath}.bak-v${from}-${stamp}`;
    fs.copyFileSync(dbPath, target);
    privateFile(target);
    prunePreMigrationBackups(dbPath, 10);
  } catch (e) {
    console.warn(`[runtime] Could not back up the store before migration: ${(e as Error).message}`);
  }
}

/** Keeps only the newest `keep` pre-migration copies (`<db>.bak-v*`), oldest removed first. */
export function prunePreMigrationBackups(dbPath: string, keep: number): string[] {
  const dir = path.dirname(dbPath);
  const prefix = `${path.basename(dbPath)}.bak-v`;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t || (a.f < b.f ? 1 : -1));
  const removed: string[] = [];
  for (const { f } of files.slice(keep)) {
    fs.rmSync(path.join(dir, f), { force: true });
    removed.push(f);
  }
  return removed;
}

/** Opens (creating if needed) the v2 store and brings its schema up to date. */
export function openStore(dbPath: string, migrations: Migration[] = MIGRATIONS): DatabaseSync {
  if (dbPath !== ':memory:') privateDir(path.dirname(dbPath));
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  const latest = Math.max(...migrations.map((m) => m.version));
  const current = rawSchemaVersion(db);
  backupBeforeUpgrade(db, dbPath, current, latest);
  migrate(db, migrations);

  if (dbPath !== ':memory:') {
    privateFile(dbPath);
    privateFile(`${dbPath}-wal`);
    privateFile(`${dbPath}-shm`);
  }
  return db;
}

function rawSchemaVersion(db: DatabaseSync): number {
  try {
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null } | undefined;
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

export function migrate(db: DatabaseSync, migrations: Migration[] = MIGRATIONS): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version)
  );
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue;
    if (m.foreignKeysOff) db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      const violationsBefore = m.foreignKeysOff ? foreignKeyViolations(db) : 0;
      db.exec(m.sql);
      if (m.foreignKeysOff && foreignKeyViolations(db) > violationsBefore) {
        throw new Error('the table rebuild introduced foreign-key violations');
      }
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        new Date().toISOString()
      );
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.version} (${m.name}) failed: ${(e as Error).message}`);
    } finally {
      if (m.foreignKeysOff) db.exec('PRAGMA foreign_keys = ON');
    }
  }
  return schemaVersion(db);
}

function foreignKeyViolations(db: DatabaseSync): number {
  return db.prepare('PRAGMA foreign_key_check').all().length;
}

export function schemaVersion(db: DatabaseSync): number {
  return rawSchemaVersion(db);
}
