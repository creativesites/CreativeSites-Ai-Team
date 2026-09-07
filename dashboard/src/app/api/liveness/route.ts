import { queryDb } from '@/lib/db';
import { execFileSync } from 'child_process';
import { NextResponse } from 'next/server';

// Real-time observation, independent of any stale DB column.
// Mirrors src/runtime/interactiveIdeAdapter.js's socket/cwd matching logic
// so the dashboard reports exactly what that adapter would observe right now.

const SOCK_DIR = '/tmp/cc-socks';

const IDE_CWD_HINTS: Record<string, string> = {
  atlas: 'myavana-chatbot',
  iris: 'myavana-chatbot-dashboard',
  vela: 'myavana-hair-journey',
  astra: 'myavana-chatbot',
  nexus: 'creativesites-ai-team',
  meridian: 'creativesites-ai-team',
};

// Kael/Lyra currently run only as ephemeral headless-cli child processes
// (src/runtime/headlessAdapter.js). That adapter tracks liveness in an
// in-memory Map local to whichever process spawned the worker - there is
// no durable, cross-process record of whether one is running. We do not
// fabricate a status for them.
const EPHEMERAL_HEADLESS = new Set(['kael', 'lyra']);

function getObservedSockets() {
  let files: string[] = [];
  try {
    files = require('fs').readdirSync(SOCK_DIR).filter((f: string) => f.endsWith('.sock'));
  } catch {
    return { sockets: [], error: null }; // dir missing = genuinely zero sockets, not an error
  }
  const sockets = files.map((f: string) => {
    const pidMatch = f.match(/^(\d+)\.sock$/);
    const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
    let cwd: string | null = null;
    let alive = false;
    if (pid) {
      try {
        const out = execFileSync('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'], { encoding: 'utf8' });
        const match = out.match(/n(.*)/);
        if (match) cwd = match[1].trim();
        alive = true; // lsof succeeded => process exists right now
      } catch {
        alive = false; // stale socket file, process is gone
      }
    }
    return { socket: f, pid, cwd, alive };
  });
  return { sockets, error: null };
}

export async function GET() {
  try {
    const { sockets } = getObservedSockets();
    const identities = queryDb(`
      SELECT i.id, i.display_name, i.symbol, a.current_task_id, a.status as declared_status,
             t.title as current_task_title, t.status as current_task_status
      FROM identities i
      LEFT JOIN agents a ON a.identity_id = i.id
      LEFT JOIN tasks t ON t.id = a.current_task_id
      ORDER BY i.joined_at ASC
    `);

    const now = new Date().toISOString();

    // Exact basename match only - "myavana-chatbot" must NOT match
    // "myavana-chatbot-dashboard". A loose .includes() check here previously
    // caused Atlas and Astra to be falsely reported LIVE off Iris's actual
    // session, purely because one repo name is a substring of another.
    const basename = (p: string) => p.replace(/\/+$/, '').split('/').pop()?.toLowerCase() || '';

    let firstPass = identities.map((identity: any) => {
      const id = identity.id;
      if (EPHEMERAL_HEADLESS.has(id)) {
        return {
          identity,
          liveness: 'UNKNOWN' as const,
          evidence: 'No durable session tracking for headless-cli workers. They run as short-lived child processes and self-terminate; there is no cross-process record to check.',
          matchedSocket: null as any,
        };
      }
      const hint = IDE_CWD_HINTS[id];
      if (!hint) {
        return { identity, liveness: 'UNKNOWN' as const, evidence: 'No known socket/cwd hint registered for this identity — cannot be observed by this method.', matchedSocket: null };
      }
      const matchedSocket = sockets.find((s: any) => s.alive && s.cwd && basename(s.cwd) === hint);
      if (matchedSocket) {
        return {
          identity,
          liveness: 'LIVE' as const,
          evidence: `Live process observed: PID ${matchedSocket.pid}, cwd is exactly ".../${hint}", socket ${matchedSocket.socket} responded to lsof just now.`,
          matchedSocket,
        };
      }
      return {
        identity,
        liveness: 'OFFLINE' as const,
        evidence: `No live socket with cwd exactly ".../${hint}" found in ${SOCK_DIR} at time of check.`,
        matchedSocket: null,
      };
    });

    // Two identities can legitimately be configured with the same expected cwd
    // (e.g. Nexus and Meridian both point at creativesites-ai-team). A single
    // live socket there tells us *a* runtime is up, not *which* identity it is
    // - the underlying system has no per-identity session token to disambiguate.
    // Reporting both as LIVE would be a guess dressed up as an observation.
    const pidCounts = new Map<number, number>();
    for (const r of firstPass) {
      if (r.matchedSocket) pidCounts.set(r.matchedSocket.pid, (pidCounts.get(r.matchedSocket.pid) || 0) + 1);
    }

    const observed = firstPass.map((r: (typeof firstPass)[number]) => {
      const identity = r.identity;
      let { liveness, evidence, matchedSocket } = r;
      if (matchedSocket && (pidCounts.get(matchedSocket.pid) || 0) > 1) {
        liveness = 'UNKNOWN';
        evidence = `PID ${matchedSocket.pid} is live in the expected directory, but ${pidCounts.get(matchedSocket.pid)} identities share that same expected cwd with no way to tell which one this session actually is. Reporting UNKNOWN rather than guessing.`;
      }
      return {
        id: identity.id,
        display_name: identity.display_name,
        symbol: identity.symbol,
        observed_liveness: liveness,
        observed_evidence: evidence,
        observed_at: now,
        observed_pid: matchedSocket ? matchedSocket.pid : null,
        // Separate, explicitly-labeled DECLARED info - what the DB *says* this agent
        // is doing. This is NOT verified against the liveness check above; an agent
        // can be declared WORKING on a task while observed_liveness is OFFLINE.
        declared_status: identity.declared_status || 'UNKNOWN',
        declared_current_task_id: identity.current_task_id || null,
        declared_current_task_title: identity.current_task_title || null,
      };
    });

    return NextResponse.json({
      checked_at: now,
      sockets_seen: sockets.map((s: any) => ({ pid: s.pid, alive: s.alive, cwd: s.cwd })),
      agents: observed,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
