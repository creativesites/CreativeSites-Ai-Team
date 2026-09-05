'use strict';
/**
 * Observed liveness — who is ACTUALLY running, and which agent they are.
 *
 * Contributed by Vela (Stream A/E). Added as a separate module rather than
 * edited into doctor.js, so there is one writer per file.
 *
 * The problem this solves: every "status" field in the registry is a claim
 * somebody typed. Today AGENTS_REGISTRY.md was overwritten three times with
 * agents marked Active who have never had a session, once under a false claim
 * of automated sync. A status field that can be typed will eventually be typed
 * wrong, and it fails silently — work routed to an absent agent simply doesn't
 * happen and nobody reports it blocked, because nobody is there.
 *
 * So nothing here is self-reported. The chain is entirely observed:
 *
 *     socket file → PID → process cwd → repository → agent (via agents.json)
 *
 * A Claude Code session opens /tmp/cc-socks/<pid>.sock. `lsof` gives that PID's
 * working directory. agents.json maps directories to agents. No agent is asked
 * whether it is awake, which is the point — an agent that has stopped cannot
 * answer, and one that is lying would answer anyway.
 *
 * Known limits, stated rather than hidden:
 *   - Only sees agents whose runtime opens a socket here. A remote or
 *     differently-hosted runtime is invisible and will read as absent.
 *   - Two agents in one repo are ambiguous unless one is `role: "owner"`
 *     or has a deeper repo path. Ambiguity is reported, never guessed —
 *     an early version silently mis-attributed a live agent as absent.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOCK_DIR = '/tmp/cc-socks';

/** Running sessions with their working directory. Pure observation. */
function observedSessions(sockDir = SOCK_DIR) {
    let files;
    try { files = fs.readdirSync(sockDir).filter((f) => f.endsWith('.sock')); }
    catch { return []; }

    return files.map((f) => {
        const pid = path.basename(f, '.sock');
        let cwd = null;
        try {
            cwd = execSync(`lsof -a -p ${pid} -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2-`,
                { encoding: 'utf8' }).trim() || null;
        } catch { /* process may exit between readdir and lsof */ }
        return { socket: f, pid, cwd, since: safeMtime(path.join(sockDir, f)) };
    });
}

function safeMtime(p) { try { return fs.statSync(p).mtime.toISOString(); } catch { return null; } }

/**
 * Candidate agents for a working directory.
 * Deepest repo path wins; among equals, `owner` beats `contributor`.
 */
function agentsForCwd(cwd, agents, repoPaths = {}) {
    if (!cwd) return [];
    const m = [];
    for (const a of agents) {
        // Structured form: repos: [{ path, role }]
        for (const r of a.repos || []) {
            if (!r.path) continue;
            if (cwd === r.path || cwd.startsWith(r.path + '/')) {
                m.push({ name: a.name, role: r.role || 'contributor', depth: r.path.length });
            }
        }
        // Short-name form: repositories: ["Repo-Name"], resolved via repo_paths.
        // Supported so existing entries resolve without rewriting anyone's
        // self-declaration — the first version of this only understood the
        // structured form and reported two live agents as absent.
        for (const name of a.repositories || []) {
            const p = repoPaths[name];
            if (!p) continue;
            if (cwd === p || cwd.startsWith(p + '/')) {
                const owns = (a.owned_paths || []).some((op) => op.replace(/\/$/, '').endsWith(name));
                m.push({ name: a.name, role: owns ? 'owner' : 'contributor', depth: p.length });
            }
        }
    }
    if (!m.length) return [];
    const deepest = Math.max(...m.map((x) => x.depth));
    const atDepth = m.filter((x) => x.depth === deepest);
    const owners = atDepth.filter((x) => x.role === 'owner');
    return [...new Set((owners.length ? owners : atDepth).map((x) => x.name))];
}

/**
 * @returns {{online: Map<string,object>, sessions: Array, ambiguous: Array, unmapped: Array}}
 */
function resolveLiveness(agents, sockDir = SOCK_DIR, repoPaths = {}) {
    const sessions = observedSessions(sockDir);
    const online = new Map();
    const ambiguous = [];
    const unmapped = [];

    for (const s of sessions) {
        const cands = agentsForCwd(s.cwd, agents, repoPaths);
        if (cands.length === 1) online.set(cands[0], s);
        else if (cands.length > 1) ambiguous.push({ ...s, candidates: cands });
        else unmapped.push(s);
    }
    return { online, sessions, ambiguous, unmapped };
}

/** Compare a claimed status against observation. Never trusts the claim. */
function reconcile(agents, sockDir = SOCK_DIR, repoPaths = {}) {
    const { online, ambiguous, unmapped } = resolveLiveness(agents, sockDir, repoPaths);
    const rows = agents.map((a) => {
        const seen = online.get(a.name) || null;
        const claimed = (a.status || a.observed?.state || 'unknown').toString();
        const claimsPresent = /active|available|working|reviewing|online/i.test(claimed);
        return {
            name: a.name,
            claimed,
            observed: seen ? 'ONLINE' : 'not observed',
            pid: seen ? seen.pid : null,
            cwd: seen ? seen.cwd : null,
            overclaim: !seen && claimsPresent,
        };
    });
    return { rows, ambiguous, unmapped, onlineCount: online.size };
}

module.exports = { observedSessions, agentsForCwd, resolveLiveness, reconcile, SOCK_DIR };
