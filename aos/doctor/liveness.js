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
const CENSUS = path.join(__dirname, '..', '..', 'community', 'system', 'session_census.json');

/** Running sessions with their working directory. Pure observation. */
function observedSessions(sockDir = SOCK_DIR) {
    let files;
    try {
        files = fs.readdirSync(sockDir).filter((f) => f.endsWith('.sock'));
    } catch (err) {
        // "I could not look" is not "there is nothing there". Returning []
        // here would make every agent read as absent and accuse an accurate
        // registry of over-claiming — a confident negative produced by a
        // failure to observe. A verifier must fail toward "I don't know".
        return { ok: false, reason: `cannot read ${sockDir}: ${err.code || err.message}`, sessions: [] };
    }

    const sessions = files.map((f) => {
        const pid = path.basename(f, '.sock');
        let cwd = null;
        try {
            cwd = execSync(`lsof -a -p ${pid} -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2-`,
                { encoding: 'utf8' }).trim() || null;
        } catch { /* process may exit between readdir and lsof */ }
        return { socket: f, pid, cwd, since: safeMtime(path.join(sockDir, f)) };
    });
    return { ok: true, reason: null, sessions };
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
 * Read an agent-attested session census.
 *
 * ListAgents enumerates sessions authoritatively, but it is an agent tool and a
 * script cannot call it — the same boundary that stops mya.js sending messages.
 * So an agent records the count here and the doctor may use it.
 *
 * This is the one place agent-supplied evidence enters the verifier, so it is
 * fenced twice:
 *
 *   1. STALENESS — a census older than its own budget is ignored. Sessions
 *      start and stop; yesterday's count proves nothing about now.
 *   2. CROSS-CHECK — the attested total must equal the number of sockets
 *      observed independently. If they disagree, BOTH are treated as
 *      unreliable and the doctor abstains. It does not pick a winner.
 *
 * Without the cross-check this would be a hole straight through the design: an
 * agent could assert any census and the verifier would inherit it. With it, the
 * census can only ever *confirm* what the sockets already show, and its value
 * is that it makes the total authoritative — closing "is there a session I
 * cannot see?", which socket attribution alone cannot answer.
 */
function readCensus(observedCount, now = Date.now()) {
    if (!fs.existsSync(CENSUS)) return { usable: false, reason: 'no census file' };
    let c;
    try { c = JSON.parse(fs.readFileSync(CENSUS, 'utf8')); }
    catch (e) { return { usable: false, reason: `census unparseable: ${e.message}` }; }

    const at = Date.parse(c.attested_at || '');
    if (!Number.isFinite(at)) return { usable: false, reason: 'census has no valid attested_at' };

    const ageMin = (now - at) / 60000;
    const budget = Number(c.staleness_budget_minutes) || 30;
    if (ageMin > budget)
        return { usable: false, reason: `census is ${Math.round(ageMin)}m old (budget ${budget}m)`, census: c };

    if (typeof c.total_sessions !== 'number')
        return { usable: false, reason: 'census has no total_sessions', census: c };

    if (c.total_sessions !== observedCount)
        return {
            usable: false, census: c, conflict: true,
            reason: `census claims ${c.total_sessions} sessions, ${observedCount} sockets observed — `
                  + 'disagreement between two independent observations; trusting neither',
        };

    return { usable: true, census: c, ageMin: Math.round(ageMin) };
}

/**
 * @returns {{online: Map<string,object>, sessions: Array, ambiguous: Array, unmapped: Array}}
 */
function resolveLiveness(agents, sockDir = SOCK_DIR, repoPaths = {}) {
    const probe = observedSessions(sockDir);
    if (!probe.ok) {
        // Abstain. No online set, no absences, no assessment.
        return { ok: false, reason: probe.reason, online: new Map(), sessions: [], ambiguous: [], unmapped: [] };
    }
    const sessions = probe.sessions;
    const online = new Map();
    const ambiguous = [];
    const unmapped = [];

    for (const s of sessions) {
        const cands = agentsForCwd(s.cwd, agents, repoPaths);
        if (cands.length === 1) online.set(cands[0], s);
        else if (cands.length > 1) ambiguous.push({ ...s, candidates: cands });
        else unmapped.push(s);
    }
    return { ok: true, reason: null, online, sessions, ambiguous, unmapped };
}

/** Compare a claimed status against observation. Never trusts the claim. */
function reconcile(agents, sockDir = SOCK_DIR, repoPaths = {}) {
    const live = resolveLiveness(agents, sockDir, repoPaths);
    if (!live.ok) {
        // Every agent's observed state is genuinely unknown. Emit that, and
        // flag nothing as an over-claim — we have no standing to accuse.
        return {
            ok: false, reason: live.reason, onlineCount: null, contested: [], ambiguous: [], unmapped: [],
            rows: agents.map((a) => ({
                name: a.name, claimed: (a.status || a.observed?.state || 'unknown').toString(),
                observed: 'UNKNOWN', pid: null, cwd: null, sharesWith: [], overclaim: false,
            })),
        };
    }
    const { online, ambiguous, unmapped } = live;

    // With a corroborated census the TOTAL is authoritative: if every session is
    // accounted for, an agent matching none of them has no session anywhere.
    // That conclusion survives cwd ambiguity because it never uses attribution.
    const census = readCensus(live.sessions.length);
    const allAccountedFor = census.usable;

    const rows = agents.map((a) => {
        const seen = online.get(a.name) || null;
        // A session in this agent's repo that could not be attributed uniquely
        // is NOT evidence of absence. Reporting "not observed" there would be
        // the same error this module exists to catch: an unknown rendered as a
        // confident answer. Ambiguity gets its own state and never counts as an
        // over-claim.
        const amb = seen ? null : ambiguous.find((x) => (x.candidates || []).includes(a.name)) || null;
        const claimed = (a.status || a.observed?.state || 'unknown').toString();
        const claimsPresent = /active|available|working|reviewing|online/i.test(claimed);

        let observed = allAccountedFor ? 'NOT OBSERVED' : 'UNATTRIBUTED';
        if (seen) observed = 'ONLINE';
        else if (amb) observed = 'AMBIGUOUS';

        return {
            name: a.name,
            claimed,
            observed,
            pid: seen ? seen.pid : amb ? amb.pid : null,
            cwd: seen ? seen.cwd : amb ? amb.cwd : null,
            sharesWith: amb ? amb.candidates.filter((n) => n !== a.name) : [],
            overclaim: !seen && !amb && claimsPresent,
        };
    });
    // Ambiguity is honest but weak evidence. Six agents declaring one repo and
    // one session running means at most one of them is present — the registry's
    // repo declarations are too coarse to attribute anyone in that repo. State
    // the arithmetic rather than letting six AMBIGUOUS rows read as six agents.
    const contested = ambiguous.map((x) => ({
        pid: x.pid,
        cwd: x.cwd,
        candidates: x.candidates,
        note: `1 session, ${x.candidates.length} candidates — at most one of these is present. `
            + `Narrow by giving each agent a distinct repos[].path (e.g. their owned subdirectory).`,
    }));

    // Arithmetic that survives ambiguity entirely, when the census corroborates.
    // Total sessions minus those uniquely attributed leaves the number of
    // contested candidates that can possibly be present. Everyone beyond that
    // is provably absent WITHOUT resolving who is who — which is the conclusion
    // socket attribution alone cannot reach.
    let bound = null;
    if (allAccountedFor) {
        // An agent already uniquely attributed to its own session is not a
        // candidate for someone else's — leaving it in inflates the pool and
        // understates how many are provably absent.
        const candidates = [...new Set(ambiguous.flatMap((x) => x.candidates))]
            .filter((n) => !online.has(n));
        const unaccounted = Math.max(0, census.census.total_sessions - online.size);
        bound = {
            totalSessions: census.census.total_sessions,
            uniquelyAttributed: [...online.keys()],
            contestedCandidates: candidates,
            atMostPresent: Math.min(unaccounted, candidates.length),
            provablyAbsentCount: Math.max(0, candidates.length - unaccounted),
            statement:
                `${census.census.total_sessions} sessions exist and all are accounted for. `
                + `${online.size} uniquely attributed (${[...online.keys()].join(', ')}). `
                + `At most ${Math.min(unaccounted, candidates.length)} of `
                + `[${candidates.join(', ')}] can be present; the remaining `
                + `${Math.max(0, candidates.length - unaccounted)} have no session.`,
        };
    }

    return {
        ok: true, reason: null, rows, ambiguous, contested, unmapped, bound,
        onlineCount: online.size,
        census: { usable: census.usable, reason: census.reason || null, conflict: !!census.conflict },
    };
}

module.exports = { observedSessions, agentsForCwd, resolveLiveness, reconcile, readCensus, SOCK_DIR, CENSUS };
