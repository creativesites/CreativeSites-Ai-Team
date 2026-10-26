import fs from 'node:fs';
import path from 'node:path';

export interface RuntimeLock {
  path: string;
  release: () => void;
}

interface LockRecord {
  pid: number;
  startedAt: string;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function read(file: string): LockRecord | null {
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8')) as LockRecord;
    return typeof record.pid === 'number' ? record : null;
  } catch {
    return null;
  }
}

/**
 * One runtime per machine. The lock is an O_EXCL file held for the life of the
 * process; a stale lock (dead pid) is replaced once. Returns null when another
 * live runtime owns the lock.
 */
export function acquireLock(file: string): RuntimeLock | null {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });

  const attempt = (): RuntimeLock | null => {
    try {
      const fd = fs.openSync(file, 'wx', 0o600);
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() } satisfies LockRecord));
      fs.closeSync(fd);
      let released = false;
      return {
        path: file,
        release: () => {
          if (released) return;
          released = true;
          const held = read(file);
          if (held?.pid === process.pid) fs.rmSync(file, { force: true });
        },
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      return null;
    }
  };

  const first = attempt();
  if (first) return first;

  const existing = read(file);
  if (existing && !alive(existing.pid)) {
    // The process that held it is gone: take over. A live owner keeps the lock.
    fs.rmSync(file, { force: true });
    return attempt();
  }
  return null;
}

export function lockOwner(file: string): LockRecord | null {
  return read(file);
}
