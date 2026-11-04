import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Diffs, command output and other large evidence live outside SQLite, addressed
// by content hash. The store keeps the hash; the bytes live here.

export interface StoredArtifact {
  sha256: string;
  path: string;
  mime: string;
  bytes: number;
}

export function saveArtifact(root: string, data: string | Buffer, mime = 'text/plain; charset=utf-8'): StoredArtifact {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const dir = path.join(root, sha256.slice(0, 2), sha256.slice(2, 4));
  const file = path.join(dir, sha256);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file)) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, bytes, { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  return { sha256, path: file, mime, bytes: bytes.length };
}

export function readArtifact(root: string, sha256: string): Buffer | null {
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
  const file = path.join(root, sha256.slice(0, 2), sha256.slice(2, 4), sha256);
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}
