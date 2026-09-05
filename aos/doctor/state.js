'use strict';
/**
 * Evidence taxonomy for MyaOS organizational state.
 *
 * Foundational rule (Winston, 2026-09-05, after the roster incident):
 *
 *     Declared state ≠ observed state ≠ attested state ≠ verified state.
 *     Do not collapse those categories.
 *
 * The morning's incident happened because one category silently became another:
 * something written into a file was read back as something known. Every claim in
 * MyaOS now carries the evidence that produced it, and the strength of a claim is
 * a property of that evidence, never of how confidently it was written.
 *
 * The ladder, weakest to strongest:
 *
 *   UNKNOWN       No usable evidence. The ONLY correct answer when observation
 *                 failed, evidence is stale, or the question is unresolved.
 *                 Never inferred from an error. Never a synonym for "no".
 *   TOLD          Text exists asserting it. Author unestablished. This is what a
 *                 Markdown roster row is, and it is the weakest thing that is not
 *                 nothing.
 *   DECLARED      The subject asserted it about itself. Meaningful for intent and
 *                 capability, worthless for liveness — a stopped agent cannot
 *                 declare that it stopped.
 *   ATTESTED      A named third party asserts having observed it, via a tool a
 *                 script cannot call. Stronger than DECLARED, weaker than
 *                 OBSERVED, and MUST remain visibly distinct from it.
 *   OBSERVED      This process measured it directly from the machine.
 *   CORROBORATED  Two or more independent observers agree, and their accounts
 *                 cross-check.
 *   VERIFIED      Established by executing an artifact — a test run, a probe, a
 *                 command whose output is the evidence.
 *
 * A claim may never be reported at a level above the evidence that produced it.
 */

const LEVELS = ['UNKNOWN', 'TOLD', 'DECLARED', 'ATTESTED', 'OBSERVED', 'CORROBORATED', 'VERIFIED'];
const rank = (l) => { const i = LEVELS.indexOf(l); return i < 0 ? 0 : i; };

/**
 * A single claim plus the evidence for it. `value` may be null; a claim with a
 * null value at UNKNOWN is the honest representation of "we do not know", and is
 * deliberately distinct from a claim with value=false.
 */
function claim(value, level, source, detail) {
    if (!LEVELS.includes(level)) throw new Error(`unknown evidence level: ${level}`);
    if (level !== 'UNKNOWN' && !source) throw new Error(`evidence level ${level} requires a source`);
    return {
        value: level === 'UNKNOWN' ? null : value,
        evidence: level,
        source: level === 'UNKNOWN' ? null : source,
        detail: detail || null,
        at: new Date().toISOString(),
    };
}

const unknown = (why) => claim(null, 'UNKNOWN', null, why || 'no usable evidence');

/**
 * DEPENDENCY: weakest link wins. Use when a conclusion *rests on* several inputs
 * — it can be no stronger than the flimsiest thing holding it up.
 */
function combine(claims, value, detail) {
    if (!claims.length) return unknown('no inputs');
    const weakest = claims.reduce((a, b) => (rank(a.evidence) <= rank(b.evidence) ? a : b));
    if (weakest.evidence === 'UNKNOWN') return unknown(detail || 'an input was unknown');
    return claim(value, weakest.evidence, claims.map((c) => c.source).filter(Boolean).join('+'), detail);
}

/**
 * CORROBORATION: independent sources confirming the SAME fact strengthen it.
 *
 * The opposite operation to combine(), and conflating them is a real error I
 * shipped: using weakest-link here meant a second independent observer could
 * never strengthen anything, which defeats the entire point of corroboration.
 *
 * Requires genuinely independent sources — two readings from one mechanism are
 * one observation taken twice. Two sources at OBSERVED promote to CORROBORATED;
 * anything weaker, or a single source, keeps the best available level.
 */
function corroborate(claims, value, detail) {
    const usable = claims.filter((c) => c && c.evidence !== 'UNKNOWN');
    if (!usable.length) return unknown(detail || 'no usable evidence');

    const sources = [...new Set(usable.map((c) => c.source).filter(Boolean))];
    const best = usable.reduce((a, b) => (rank(a.evidence) >= rank(b.evidence) ? a : b));

    const independent = sources.length > 1;
    const bothObserved = usable.filter((c) => rank(c.evidence) >= rank('ATTESTED')).length > 1;

    const level = independent && bothObserved && rank(best.evidence) < rank('CORROBORATED')
        ? 'CORROBORATED'
        : best.evidence;

    return claim(value, level, sources.join('+'),
        detail || (independent ? `${sources.length} independent sources agree` : 'single source'));
}

/**
 * Winston's §5 field separation, one record per agent. Each field carries its own
 * evidence level, because they genuinely differ: an agent's capabilities are
 * DECLARED at best, while its liveness can be OBSERVED, and conflating them is
 * how "registered" became "online".
 */
function agentState(name, { registryRow, declaration, liveness, provenance, census } = {}) {
    const s = { name };

    s.identity = registryRow
        ? claim(name, 'TOLD', 'AGENTS_REGISTRY.md', 'a roster row asserts this agent exists')
        : unknown('no roster row');

    if (declaration) {
        const by = declaration.declared_by || null;
        // Self-declaration is DECLARED. A declaration written by someone else
        // about an agent is only TOLD, however authoritative it looks.
        const selfDeclared = !!by && new RegExp(`^${name}\\b`, 'i').test(by);
        const lvl = selfDeclared ? 'DECLARED' : 'TOLD';
        const src = by || 'agents.json (author unrecorded)';
        s.declaredCapabilities   = claim(declaration.capabilities || {}, lvl, src);
        s.declaredResponsibilities = claim(declaration.org_roles || declaration.proposed_roles || [], lvl, src);
        s.declaredRepositories   = claim(declaration.repos || declaration.repositories || [], lvl, src);
    } else {
        s.declaredCapabilities = s.declaredResponsibilities = s.declaredRepositories =
            unknown('no entry in agents.json');
    }

    // Liveness. The distinction Winston drew: registered ≠ online, and
    // online ≠ verified as the claimed identity.
    if (!liveness || liveness.observed === 'UNKNOWN') {
        s.runtimeIdentity = unknown('liveness could not be observed');
        s.observedLiveness = unknown('liveness could not be observed');
        s.lastObserved = unknown('liveness could not be observed');
    } else if (liveness.observed === 'ONLINE') {
        const base = claim(true, 'OBSERVED', 'socket→pid→cwd→agents.json',
            `pid ${liveness.pid} in ${liveness.cwd}`);
        // Socket attribution and the session census are independent mechanisms
        // measuring the same fact, so they corroborate rather than constrain.
        s.observedLiveness = census && census.corroborated
            ? corroborate(
                [base, claim(true, 'ATTESTED', `census(${(census.attestors || []).join(',')})`,
                             'independent session census')],
                true, 'socket attribution and an independent session census agree')
            : base;
        s.runtimeIdentity = claim(liveness.pid, 'OBSERVED', 'process table',
            'pid resolved to this agent by repo ownership; NOT proof of claimed identity, only of location');
        s.lastObserved = claim(new Date().toISOString(), 'OBSERVED', 'socket mtime');
    } else if (liveness.observed === 'AMBIGUOUS') {
        s.observedLiveness = unknown(
            `a session exists in this agent's repo but could not be attributed uniquely `
            + `(shared with ${(liveness.sharesWith || []).join(', ')}). Not evidence of presence OR absence.`);
        s.runtimeIdentity = unknown('session not uniquely attributable');
        s.lastObserved = unknown('session not uniquely attributable');
    } else {
        // NOT OBSERVED is only meaningful when the census closes the total.
        s.observedLiveness = census && census.usable
            ? claim(false, census.corroborated ? 'CORROBORATED' : 'ATTESTED',
                    `census(${(census.attestors || []).join(',')})`,
                    'all sessions accounted for and none is this agent')
            : unknown('no session attributed, and no corroborated census to close the total');
        s.runtimeIdentity = unknown('no session attributed');
        s.lastObserved = unknown('never observed');
    }

    // Has this agent ever demonstrably existed? Separate from being online now.
    const p = provenance || {};
    if (p.direct_interaction === true || p.direct_interaction === 'self') {
        s.existence = claim(true, 'OBSERVED', 'runtime message delivery',
            'this session received a message from them; a nonexistent agent cannot send one');
    } else if (p.uniquely_attributed === true) {
        s.existence = claim(true, 'OBSERVED', 'socket attribution');
    } else if (/^REAL/.test(p.assessment || '')) {
        s.existence = claim(true, 'ATTESTED', 'verifier assessment', p.assessment);
    } else if (p.entry_origin) {
        s.existence = unknown(`no evidence of existence beyond a roster row (${p.entry_origin})`);
    } else {
        s.existence = unknown('no provenance recorded');
    }

    s.confidence = {
        strongest: LEVELS[Math.max(...Object.values(s).filter((v) => v && v.evidence).map((v) => rank(v.evidence)))],
        weakestUseful: 'see per-field evidence; do not average these',
    };
    return s;
}

/** Guard: a claim may never be reported above the evidence that produced it. */
function assertNotOverstated(c, maxLevel) {
    if (rank(c.evidence) > rank(maxLevel))
        throw new Error(`claim reported as ${c.evidence} but evidence supports at most ${maxLevel}`);
    return c;
}

module.exports = { LEVELS, rank, claim, unknown, combine, corroborate, agentState, assertNotOverstated };
