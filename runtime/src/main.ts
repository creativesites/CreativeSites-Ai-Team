import fs from 'node:fs';
import path from 'node:path';
import { startRuntime, VERSION } from './app.ts';
import { loadConfig, runtimeDbPath, runtimeInfoPath } from './config.ts';

// Entry point. The desktop starts this as a sidecar; it can also be run by hand
// (`npm start` in runtime/). One runtime per machine: a second start exits and
// leaves the running one in place.

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

async function main() {
  const infoFile = runtimeInfoPath();
  const existing = readInfo(infoFile);
  if (existing && existing.pid !== process.pid && alive(existing.pid) && (await healthy(existing.url))) {
    console.log(`[runtime] Already running (pid ${existing.pid}) at ${existing.url}`);
    return;
  }

  const dbPath = runtimeDbPath(loadConfig());
  const allowedOrigins = (process.env.MYAOS_RUNTIME_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const rt = await startRuntime({
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
  fs.mkdirSync(path.dirname(infoFile), { recursive: true });
  // The token lets anything on this machine act as the owner, so only the owner can read it.
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2), { mode: 0o600 });
  console.log(`[runtime] v${VERSION} listening on ${rt.url} (store ${dbPath})`);

  let stopping = false;
  const stop = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[runtime] Stopping: ${reason}`);
    if (readInfo(infoFile)?.pid === process.pid) fs.rmSync(infoFile, { force: true });
    await rt.close();
    process.exit(0);
  };
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
