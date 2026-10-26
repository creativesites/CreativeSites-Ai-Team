import fs from 'node:fs';
import { adaptersEnvPath, loadConfig, type MyaosConfig } from './config.ts';

// Adapter credentials (GEMINI_API_KEY etc.) live in an owner-only env file, not
// in the store and not in git. The runtime passes them to adapter processes only.

export function readAdapterEnv(cfg: MyaosConfig = loadConfig()): Record<string, string> {
  const file = adaptersEnvPath(cfg);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[runtime] Could not read adapter env ${file}: ${(e as Error).message}`);
    }
    return {};
  }
  const env: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function hasAdapterEnv(key: string, cfg: MyaosConfig = loadConfig()): boolean {
  return Boolean(process.env[key] || readAdapterEnv(cfg)[key]);
}

/** Set/replace one key in the owner-only env file (used by the app's Settings later). */
export function writeAdapterEnvVar(key: string, value: string, cfg: MyaosConfig = loadConfig()): void {
  const file = adaptersEnvPath(cfg);
  const current = readAdapterEnv(cfg);
  current[key] = value;
  const text = `${Object.entries(current)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')}\n`;
  fs.mkdirSync(file.slice(0, file.lastIndexOf('/')) || '.', { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, text, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* best effort */
  }
}
