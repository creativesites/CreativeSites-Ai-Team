#!/usr/bin/env node
'use strict';
/**
 * Tests that forged or insufficient organizational state cannot be reported as
 * known. Written against the actual incident: a roster row asserting an agent is
 * Active, with no session and no self-declaration, must never produce a positive
 * liveness claim.
 */
const { claim, unknown, combine, agentState, assertNotOverstated, rank } = require('../state.js');

let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n)); };
const throws = (n, fn) => { try { fn(); ok(n, false); } catch { ok(n, true); } };

console.log('\nEvidence taxonomy\n' + '─'.repeat(58));

// ── The incident, reproduced ───────────────────────────────────────────────
const forged = agentState('Kael', {
    registryRow: { status: 'Active' },                    // the fabricated row
    declaration: { capabilities: {}, declared_by: null }, // not self-declared
    liveness: { observed: 'NOT OBSERVED' },
    provenance: { entry_origin: 'appeared in AGENTS_REGISTRY.md; author unknown' },
    census: null,
});
ok('a forged "Active" row yields UNKNOWN liveness, not true',
   forged.observedLiveness.evidence === 'UNKNOWN' && forged.observedLiveness.value === null);
ok('a forged row cannot establish existence',
   forged.existence.evidence === 'UNKNOWN');
ok('identity from a roster row is only TOLD',
   forged.identity.evidence === 'TOLD');
ok('a declaration not written by the agent is TOLD, not DECLARED',
   forged.declaredCapabilities.evidence === 'TOLD');

// ── UNKNOWN is never a negative ────────────────────────────────────────────
ok('UNKNOWN carries a null value, distinct from false',
   unknown('x').value === null && claim(false, 'OBSERVED', 's').value === false);
ok('observation failure does not become absence',
   agentState('X', { liveness: { observed: 'UNKNOWN' } }).observedLiveness.value === null);
ok('ambiguity is neither presence nor absence',
   agentState('X', { liveness: { observed: 'AMBIGUOUS', sharesWith: ['Y'] } })
     .observedLiveness.evidence === 'UNKNOWN');

// ── Absence needs the census to close the total ────────────────────────────
const noCensus = agentState('Ghost', { liveness: { observed: 'NOT OBSERVED' }, census: null });
ok('no session + no census = UNKNOWN, not absent',
   noCensus.observedLiveness.evidence === 'UNKNOWN');
const withCensus = agentState('Ghost', {
    liveness: { observed: 'NOT OBSERVED' },
    census: { usable: true, corroborated: true, attestors: ['Vela', 'Atlas'] },
});
ok('no session + corroborated census = absence at CORROBORATED',
   withCensus.observedLiveness.value === false &&
   withCensus.observedLiveness.evidence === 'CORROBORATED');
const attestedOnly = agentState('Ghost', {
    liveness: { observed: 'NOT OBSERVED' },
    census: { usable: true, corroborated: false, attestors: ['Vela'] },
});
ok('a single attestor yields ATTESTED, never OBSERVED',
   attestedOnly.observedLiveness.evidence === 'ATTESTED');

// ── Attested must stay distinct from observed ──────────────────────────────
ok('ATTESTED ranks below OBSERVED', rank('ATTESTED') < rank('OBSERVED'));
ok('DECLARED ranks below ATTESTED', rank('DECLARED') < rank('ATTESTED'));
ok('TOLD ranks below DECLARED', rank('TOLD') < rank('DECLARED'));

// ── Weakest link ───────────────────────────────────────────────────────────
ok('a conclusion is only as strong as its weakest input',
   combine([claim(1, 'VERIFIED', 'a'), claim(1, 'TOLD', 'b')], 1).evidence === 'TOLD');
ok('any UNKNOWN input makes the conclusion UNKNOWN',
   combine([claim(1, 'VERIFIED', 'a'), unknown('b')], 1).evidence === 'UNKNOWN');

// ── Structural guards ──────────────────────────────────────────────────────
throws('a non-UNKNOWN claim without a source is rejected', () => claim(true, 'OBSERVED', null));
throws('an invalid evidence level is rejected', () => claim(true, 'PROBABLY', 's'));
throws('overstating a claim is rejected',
       () => assertNotOverstated(claim(true, 'VERIFIED', 's'), 'ATTESTED'));

// ── A real agent still resolves correctly ──────────────────────────────────
const real = agentState('Vela', {
    registryRow: {},
    declaration: { capabilities: { languages: ['php'] }, declared_by: 'vela (self, 2026-09-05)' },
    liveness: { observed: 'ONLINE', pid: '8235', cwd: '/plugin' },
    provenance: { direct_interaction: 'self' },
    census: { usable: true, corroborated: true, attestors: ['Vela', 'Atlas'] },
});
ok('self-declared capabilities are DECLARED', real.declaredCapabilities.evidence === 'DECLARED');
ok('an observed live agent with a corroborated census reaches CORROBORATED',
   real.observedLiveness.value === true && real.observedLiveness.evidence === 'CORROBORATED');
ok('runtime identity is OBSERVED but explicitly not identity proof',
   real.runtimeIdentity.evidence === 'OBSERVED' && /NOT proof of claimed identity/.test(real.runtimeIdentity.detail));


// ── combine vs corroborate are opposite operations ─────────────────────────
{
  const { corroborate } = require('../state.js');
  const a = claim(true, 'OBSERVED', 'sockets');
  const b = claim(true, 'ATTESTED', 'census');
  ok('corroboration of two independent sources promotes to CORROBORATED',
     corroborate([a, b], true).evidence === 'CORROBORATED');
  ok('corroboration from ONE source does not promote',
     corroborate([a, claim(true, 'ATTESTED', 'sockets')], true).evidence === 'OBSERVED');
  ok('dependency on the same two claims takes the WEAKEST, not the strongest',
     combine([a, b], true).evidence === 'ATTESTED');
  ok('corroborating nothing usable stays UNKNOWN',
     corroborate([unknown('x'), unknown('y')], true).evidence === 'UNKNOWN');
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
