'use strict';
/**
 * Storage abstraction for ORIGINAL document bytes. Content-addressed so an
 * existing object can never be overwritten with different bytes. A cloud
 * implementation (S3/GCS) only has to satisfy the same four methods.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class LocalFileStore {
  constructor(root) { this.root = root; fs.mkdirSync(root, { recursive: true }); }
  _path(key) {
    if (!/^sha256\/[0-9a-f]{2}\/[0-9a-f]{64}$/.test(key)) throw new Error(`Invalid storage key: ${key}`);
    return path.join(this.root, key);
  }
  put(buffer) {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const key = `sha256/${hash.slice(0, 2)}/${hash}`;
    const dest = this._path(key);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, buffer, { mode: 0o440 });
      fs.renameSync(tmp, dest); // atomic; identical bytes by construction
    }
    return { key, hash, size: buffer.length };
  }
  get(key) { return fs.readFileSync(this._path(key)); }
  exists(key) { return fs.existsSync(this._path(key)); }
  /** Integrity check used by recovery tooling. */
  verify(key) {
    if (!this.exists(key)) return { ok: false, reason: 'missing' };
    const hash = crypto.createHash('sha256').update(this.get(key)).digest('hex');
    return hash === key.split('/')[2] ? { ok: true } : { ok: false, reason: 'hash_mismatch' };
  }
  /** Only reachable through the controlled-deletion path in DocumentRepository. */
  delete(key) { try { fs.rmSync(this._path(key), { force: true }); return true; } catch (_) { return false; } }
}

module.exports = { LocalFileStore };
