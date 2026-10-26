import fs from 'node:fs';
import path from 'node:path';
import { startRuntime, VERSION } from './app.ts';
import { loadConfig, lockPath, myaosHome, runtimeDbPath, runtimeInfoPath } from './config.ts';
import { acquireLock, type RuntimeLock } from './lock.ts';

// Entry point. The desktop starts this as a sidecar; it can also be run by hand
// (`npm start` in runtime/). One runtime per machine, held by an OS lock file.

export interface RuntimeInfo {
  pid: number;
  url: string;
  port: number;
  token: string;
  version: string;
  dbPath: string;
  startedAt: string;
}

function readInfo(file: string): RuntimeInfo | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as RuntimeInfo;
  } catch {
    return null;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function healthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Only the owner can read the token: write a temp file, chmod, then rename. */
function writeInfo(file: string, info: RuntimeInfo) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(path.dirname(file), 0o700);
  } catch {
    /* best effort */
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(info, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* best effort */
  }
}

async function waitForRuntime(file: string, timeoutMs: number): Promise<RuntimeInfo | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = readInfo(file);
    if (info && alive(info.pid) && (await healthy(info.url))) return info;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function main() {
  // Everything the runtime writes (store, logs, artifacts) is owner-only.
  process.umask(0o077);
  const home = myaosHome();
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(home, 0o700);
  } catch {
    /* best effort */
  }

  const infoFile = runtimeInfoPath();
  const lockFile = lockPath();

  const existing = readInfo(infoFile);
  if (existing && existing.pid !== process.pid && alive(existing.pid) && (await healthy(existing.url))) {
    console.log(`[runtime] Already running (pid ${existing.pid}) at ${existing.url}`);
    return;
  }

  const lock: RuntimeLock | null = acquireLock(lockFile);
  if (!lock) {
    // Another process is starting (or running without a published info file).
    const info = await waitForRuntime(infoFile, 10_000);
    if (info) {
      console.log(`[runtime] Already running (pid ${info.pid}) at ${info.url}`);
      return;
    }
    console.error(`[runtime] Another runtime holds ${lockFile} but never became healthy. Remove the lock if no runtime is running.`);
    process.exitCode = 1;
    return;
  }

  let rt: Awaited<ReturnType<typeof startRuntime>> | null = null;
  let stopping = false;

  const stop = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[runtime] Stopping: ${reason}`);
    if (readInfo(infoFile)?.pid === process.pid) fs.rmSync(infoFile, { force: true });
    lock.release();
    if (rt) await rt.close();
    process.exit(0);
  };

  try {
    // Re-check after taking the lock: a concurrent start may have won the race.
    const raced = readInfo(infoFile);
    if (raced && raced.pid !== process.pid && alive(raced.pid) && (await healthy(raced.url))) {
      console.log(`[runtime] Already running (pid ${raced.pid}) at ${raced.url}`);
      lock.release();
      return;
    }

    const cfg = loadConfig();
    const dbPath = runtimeDbPath(cfg);
    const allowedOrigins = (process.env.MYAOS_RUNTIME_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    rt = await startRuntime({
      dbPath,
      port: Number(process.env.MYAOS_RUNTIME_PORT ?? 0) || 0,
      allowedOrigins,
    });

    const info: RuntimeInfo = {
      pid: process.pid,
      url: rt.url,
      port: rt.port,
      token: rt.token,
      version: VERSION,
      dbPath,
      startedAt: new Date().toISOString(),
    };
    writeInfo(infoFile, info);
    console.log(`[runtime] v${VERSION} listening on ${rt.url} (store ${dbPath})`);
  } catch (e) {
    lock.release();
    console.error('[runtime] Failed to start:', e);
    process.exit(1);
  }

  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));

  // When started by the desktop, exit once the desktop is gone instead of lingering.
  const parent = Number(process.env.MYAOS_PARENT_PID ?? 0);
  if (parent > 0) {
    setInterval(() => {
      if (!alive(parent)) void stop(`parent ${parent} exited`);
    }, 2000).unref();
  }
}

main().catch((e) => {
  console.error('[runtime] Failed to start:', e);
  process.exit(1);
});
