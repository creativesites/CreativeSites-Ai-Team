'use strict';
/**
 * Thin synchronous wrapper over node:sqlite (no native modules, FTS5 included).
 * - normalises parameters (booleans -> 0/1, undefined -> null)
 * - returns plain objects
 * - nested transactions via savepoints; outermost uses BEGIN IMMEDIATE so two
 *   processes sharing a file serialise their writes instead of deadlocking.
 */
const fs = require('fs');
const path = require('path');

let DatabaseSync;
{
  const orig = process.emitWarning;
  process.emitWarning = function (w, ...rest) {
    if (/SQLite/i.test(String(w && w.message ? w.message : w))) return undefined;
    return orig.call(process, w, ...rest);
  };
  try { ({ DatabaseSync } = require('node:sqlite')); } finally { process.emitWarning = orig; }
}

const norm = (p) => {
  if (p === undefined) return null;
  if (typeof p === 'boolean') return p ? 1 : 0;
  return p;
};

class KiDb {
  constructor(file, { readonly = false } = {}) {
    this.file = file;
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file, { readOnly: readonly });
    this._depth = 0;
    this._sp = 0;
    if (!readonly) {
      this.raw.exec('PRAGMA journal_mode = WAL;');
      this.raw.exec('PRAGMA synchronous = NORMAL;');
    }
    this.raw.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 8000;');
    this._stmts = new Map();
  }

  _stmt(sql) {
    let s = this._stmts.get(sql);
    if (!s) { s = this.raw.prepare(sql); this._stmts.set(sql, s); }
    return s;
  }
  exec(sql) { this.raw.exec(sql); }
  run(sql, params = []) {
    const r = this._stmt(sql).run(...params.map(norm));
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }
  get(sql, params = []) {
    const r = this._stmt(sql).get(...params.map(norm));
    return r ? { ...r } : undefined;
  }
  all(sql, params = []) {
    return this._stmt(sql).all(...params.map(norm)).map((r) => ({ ...r }));
  }

  tx(fn) {
    if (this._depth === 0) {
      this.raw.exec('BEGIN IMMEDIATE');
      this._depth = 1;
      try {
        const out = fn();
        this.raw.exec('COMMIT');
        return out;
      } catch (e) {
        try { this.raw.exec('ROLLBACK'); } catch (_) { /* already closed */ }
        throw e;
      } finally { this._depth = 0; }
    }
    const name = `sp_${++this._sp}`;
    this.raw.exec(`SAVEPOINT ${name}`);
    this._depth++;
    try {
      const out = fn();
      this.raw.exec(`RELEASE ${name}`);
      return out;
    } catch (e) {
      this.raw.exec(`ROLLBACK TO ${name}`);
      this.raw.exec(`RELEASE ${name}`);
      throw e;
    } finally { this._depth--; }
  }

  backupTo(dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    this.raw.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    return dest;
  }
  close() { this._stmts.clear(); this.raw.close(); }
}

module.exports = { KiDb };
