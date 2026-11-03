import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, type Migration } from './migrations.ts';
import { migrate, schemaVersion } from './db.ts';

/**
 * WP0-T7/T8: backup, restore and migration dry-run for the v2 store.
 *
 * Backups use `VACUUM INTO`, which writes a consistent copy even while the
 * store is open in WAL mode. Files are owner-only (0600) because the store
 * holds transcripts, prompts and evidence.
 */

export const DEFAULT_KEEP = 10;

export interface BackupInfo {
  path: string;
  createdAt: string;
  bytes: number;
}

function stamp(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, '-');
}

function ownerOnly(file: string) {
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* best effort */
  }
}

export function backupDir(dbPath: string): string {
  return path.join(path.dirname(dbPath), 'backups');
}

/** Writes a consistent copy of the store and prunes to the newest `keep` backups. */
export function backupStore(dbPath: string, opts: { dir?: string; keep?: number; label?: string; now?: Date } = {}): BackupInfo {
  if (!fs.existsSync(dbPath)) throw new Error(`No store at ${dbPath}`);
  const dir = opts.dir ?? backupDir(dbPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = `${path.basename(dbPath, '.db')}-${stamp(opts.now)}${opts.label ? `-${opts.label.replace(/[^a-z0-9-]/gi, '')}` : ''}.db`;
  const target = path.join(dir, name);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.prepare('VACUUM INTO ?').run(target);
  } finally {
    db.close();
  }
  ownerOnly(target);
  pruneBackups(dir, opts.keep ?? DEFAULT_KEEP);
  return { path: target, createdAt: (opts.now ?? new Date()).toISOString(), bytes: fs.statSync(target).size };
}

export function listBackups(dir: string): BackupInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      return { path: p, createdAt: st.mtime.toISOString(), bytes: st.size };
    })
    .sort((a, b) => (a.path < b.path ? 1 : -1)); // names carry an ISO stamp: newest first
}

export function pruneBackups(dir: string, keep: number): string[] {
  const removed: string[] = [];
  for (const b of listBackups(dir).slice(Math.max(keep, 1))) {
    fs.rmSync(b.path, { force: true });
    removed.push(b.path);
  }
  return removed;
}

/**
 * Replaces the store with a backup. The current store is itself backed up first
 * (label `pre-restore`), so a restore can always be undone. The caller must make
 * sure no runtime is running (one writer).
 */
export function restoreStore(backupPath: string, dbPath: string, opts: { dir?: string } = {}): { restored: string; previous: BackupInfo | null } {
  if (!fs.existsSync(backupPath)) throw new Error(`No backup at ${backupPath}`);
  const check = new DatabaseSync(backupPath, { readOnly: true });
  try {
    const ok = check.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    if (ok.integrity_check !== 'ok') throw new Error(`Backup failed integrity check: ${ok.integrity_check}`);
  } finally {
    check.close();
  }
  const previous = fs.existsSync(dbPath) ? backupStore(dbPath, { dir: opts.dir, label: 'pre-restore', keep: Number.MAX_SAFE_INTEGER }) : null;
  for (const suffix of ['-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
  fs.copyFileSync(backupPath, dbPath);
  ownerOnly(dbPath);
  return { restored: dbPath, previous };
}

export function tableCounts(db: DatabaseSync): Record<string, number> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  const out: Record<string, number> = {};
  for (const { name } of tables) {
    out[name] = Number((db.prepare(`SELECT COUNT(*) AS c FROM "${name.replace(/"/g, '""')}"`).get() as { c: number }).c);
  }
  return out;
}

export interface DryRunReport {
  fromVersion: number;
  toVersion: number;
  pending: number[];
  tables: { table: string; before: number | null; after: number }[];
  /** Existing tables whose row count changed: additive migrations should leave this empty. */
  changed: string[];
  integrity: string;
}

/**
 * Runs pending migrations against a throwaway copy of the store and reports
 * per-table row counts before and after. The real store is only read.
 */
export function migrationDryRun(dbPath: string, migrations: Migration[] = MIGRATIONS, workDir?: string): DryRunReport {
  const dir = workDir ?? fs.mkdtempSync(path.join(path.dirname(dbPath), '.dryrun-'));
  const copy = path.join(dir, 'dry-run.db');
  try {
    const src = new DatabaseSync(dbPath, { readOnly: true });
    try {
      src.prepare('VACUUM INTO ?').run(copy);
    } finally {
      src.close();
    }
    const db = new DatabaseSync(copy);
    try {
      const fromVersion = schemaVersion(db);
      const before = tableCounts(db);
      const pending = migrations.map((m) => m.version).filter((v) => v > fromVersion).sort((a, b) => a - b);
      const toVersion = migrate(db, migrations);
      const after = tableCounts(db);
      const tables = Object.keys(after).map((t) => ({ table: t, before: t in before ? before[t]! : null, after: after[t]! }));
      const changed = tables.filter((t) => t.before !== null && t.before !== t.after && t.table !== 'schema_migrations').map((t) => t.table);
      const integrity = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
      return { fromVersion, toVersion, pending, tables, changed, integrity };
    } finally {
      db.close();
    }
  } finally {
    if (!workDir) fs.rmSync(dir, { recursive: true, force: true });
  }
}
