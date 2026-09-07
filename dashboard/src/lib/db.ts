import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), '../data/myaos.db');

export function getDb() {
  const db = new Database(dbPath, { readonly: false });
  db.pragma('journal_mode = WAL');
  return db;
}
