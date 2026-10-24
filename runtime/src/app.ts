import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createServer } from './api/server.ts';
import type { Health, RuntimeEvent } from './api/types.ts';
import { openStore, schemaVersion } from './store/db.ts';
import { Repo } from './store/repo.ts';

export const VERSION = '0.1.0';

export interface StartOptions {
  dbPath: string;
  /** 0 picks a free port. */
  port?: number;
  token?: string;
  allowedOrigins?: string[];
}

export interface RunningRuntime {
  url: string;
  port: number;
  token: string;
  repo: Repo;
  close: () => Promise<void>;
}

/** Opens the store and starts the API on 127.0.0.1 only. */
export async function startRuntime(opts: StartOptions): Promise<RunningRuntime> {
  const db = openStore(opts.dbPath);
  const token = opts.token ?? crypto.randomBytes(32).toString('hex');
  const startedAt = new Date().toISOString();

  // The server is created after the repo, so events go through this late-bound hook.
  let broadcast: (e: RuntimeEvent) => void = () => {};
  const repo = new Repo(db, (e) => broadcast(e));
  const health = (): Health => ({ ok: true, version: VERSION, schemaVersion: schemaVersion(db), startedAt, pid: process.pid });

  const api = createServer({ repo, token, health, allowedOrigins: opts.allowedOrigins });
  broadcast = api.broadcast;

  await new Promise<void>((resolve, reject) => {
    api.server.once('error', reject);
    api.server.listen(opts.port ?? 0, '127.0.0.1', () => resolve());
  });
  const port = (api.server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    token,
    repo,
    close: () =>
      new Promise<void>((resolve) => {
        api.server.closeAllConnections();
        api.server.close(() => {
          db.close();
          resolve();
        });
      }),
  };
}
