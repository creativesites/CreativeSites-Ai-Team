// Process-tree sampling for orphan detection.
//
// The DSH file sandbox in this environment denies /bin/ps ("Operation not
// permitted"), so this module uses pgrep(1) for the process tree and lsof(1)
// for executable paths. Capability is probed and reported rather than assumed:
// if neither tool works, the run records that orphan detection was unavailable
// instead of silently reporting "no orphans".

import { execFileSync } from 'node:child_process';

function run(command, args, { timeout = 5000 } = {}) {
  try {
    return { ok: true, stdout: execFileSync(command, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout }) };
  } catch (err) {
    // pgrep exits 1 when there are no matches; that is a successful "no children".
    if (typeof err.status === 'number') return { ok: err.status === 1, stdout: typeof err.stdout === 'string' ? err.stdout : '' };
    return { ok: false, stdout: typeof err.stdout === 'string' ? err.stdout : '', error: err.code || err.message };
  }
}

function parsePids(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

/** Direct children of a PID via pgrep -P. Empty when enumeration is unavailable. */
export function childPids(parentPid) {
  if (!parentPid) return [];
  return parsePids(run('pgrep', ['-P', String(parentPid)]).stdout);
}

/** Executable path for a PID via lsof -d txt (best effort; pgrep -l has only the basename). */
export function executableOf(pid) {
  const result = run('lsof', ['-p', String(pid), '-a', '-d', 'txt', '-Fn']);
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('n/')) return line.slice(1);
  }
  return null;
}

export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively sample descendants of a root PID.
 * Returns [{ pid, ppid, depth, executable }] — never throws.
 */
export function sampleDescendants(rootPid) {
  if (!rootPid) return [];
  const seen = new Set([rootPid]);
  const found = [];
  let frontier = [{ pid: rootPid, depth: 0 }];
  while (frontier.length) {
    const next = [];
    for (const node of frontier) {
      for (const pid of childPids(node.pid)) {
        if (seen.has(pid)) continue;
        seen.add(pid);
        found.push({ pid, ppid: node.pid, depth: node.depth + 1, executable: executableOf(pid) });
        next.push({ pid, depth: node.depth + 1 });
      }
    }
    frontier = next;
  }
  return found;
}

/** Live PIDs among a recorded set, with an executable path where visible. */
export function survivors(pids) {
  const out = [];
  for (const pid of new Set(pids)) {
    if (!pid || pid === process.pid) continue;
    if (!isAlive(pid)) continue;
    out.push({ pid, executable: executableOf(pid) });
  }
  return out;
}

/**
 * Report which enumeration mechanism worked, so a run can say "orphan
 * detection was unavailable" instead of claiming "no orphans".
 */
export function processEnumerationSupport() {
  const pgrep = run('pgrep', ['-P', String(process.pid)]);
  const lsof = run('lsof', ['-p', String(process.pid), '-a', '-d', 'txt', '-Fn']);
  return {
    method: pgrep.ok ? 'pgrep' : 'unavailable',
    pgrepAvailable: pgrep.ok,
    lsofAvailable: lsof.ok && lsof.stdout.startsWith('p'),
    psAvailable: false, // ps is not used: it is denied in the sandboxed environment
    pgrepError: pgrep.ok ? null : pgrep.error ?? 'pgrep failed',
  };
}
