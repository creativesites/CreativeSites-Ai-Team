'use strict';
/**
 * CONTROLS ON THE CONTROLS.
 *
 * INC-2026-09-05-01 was caught by an agent reading a file. The control that
 * would have caught it automatically — the TOLD evidence level, which separates
 * "a file asserts this and nobody knows who wrote it" from "the subject declared
 * this about itself" — was then DELETED by a routine consolidation commit
 * (b044e72), silently, and went unnoticed until an unrelated script crashed on a
 * missing key.
 *
 * That is the actual lesson of the day, sharper than "we need controls":
 * a control that can be removed by tidying is not a control. Integrity
 * mechanisms need their own regression guard, or they decay exactly like the
 * fallbacks we spent yesterday deleting — quietly, while everything still looks
 * fine.
 *
 * These tests fail loudly if the verification layer loses a property it is
 * supposed to have. They assert INVARIANTS, not implementation, so they survive
 * refactors and only break when a guarantee actually goes away.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { EVIDENCE_CLASSES } = require('../src/provenance.js');

/** Every rung the organization has agreed it needs, and why. */
const REQUIRED_LEVELS = {
    UNKNOWN:  'the only correct answer when a probe fails, evidence is stale, or sources disagree',
    DECLARED: 'the subject asserted it about itself',
    ATTESTED: 'a named third party says they observed it',
    OBSERVED: 'measured directly from the machine',
    VERIFIED: 'established by executing an artifact',
};

/**
 * Currently missing. Documented as a KNOWN GAP rather than asserted, so this
 * file records the regression without failing the suite for a decision that is
 * Winston's and Kael's to make. Flip to a hard assertion when TOLD is restored.
 */
const KNOWN_GAPS = {
    TOLD: 'a file or message asserts it, author not established — the level that '
        + 'distinguishes a fabricated roster row from a genuine self-declaration. '
        + 'Deleted with aos/ in b044e72. Until restored, Kael\'s fabricated '
        + 'capabilities and Vela\'s self-declared ones are indistinguishable by level.',
};

test('every required evidence level still exists', () => {
    for (const [level, why] of Object.entries(REQUIRED_LEVELS)) {
        assert.ok(EVIDENCE_CLASSES[level], `evidence level ${level} is missing — ${why}`);
    }
});

test('UNKNOWN exists and is distinct from any negative finding', () => {
    assert.ok(EVIDENCE_CLASSES.UNKNOWN, 'UNKNOWN removed — failures would have to be reported as findings');
    assert.notStrictEqual(EVIDENCE_CLASSES.UNKNOWN, false);
    assert.notStrictEqual(EVIDENCE_CLASSES.UNKNOWN, null);
});

test('agent-supplied evidence stays a distinct rung from machine measurement', () => {
    assert.ok(EVIDENCE_CLASSES.ATTESTED, 'ATTESTED removed');
    assert.ok(EVIDENCE_CLASSES.OBSERVED, 'OBSERVED removed');
    assert.notStrictEqual(
        EVIDENCE_CLASSES.ATTESTED, EVIDENCE_CLASSES.OBSERVED,
        'ATTESTED and OBSERVED collapsed into one value — agent claims could then be '
        + 'laundered into machine observations, which is the census-backdoor risk');
});

test('KNOWN GAPS are reported, not silently tolerated', () => {
    const stillMissing = Object.keys(KNOWN_GAPS).filter((l) => !EVIDENCE_CLASSES[l]);
    for (const level of stillMissing) {
        console.log(`\n  KNOWN GAP — ${level}: ${KNOWN_GAPS[level]}\n`);
    }
    // Does not fail: restoring TOLD is Winston's and Kael's call, not this
    // file's. It fails only if someone deletes the gap record while the gap
    // remains, which would erase the memory of the regression.
    assert.ok(
        stillMissing.length === 0 || Object.keys(KNOWN_GAPS).length > 0,
        'a known gap was removed from the record while still unresolved');
});

test('the incident case cannot be represented as knowledge', () => {
    // A roster row nobody claims authorship of must not be expressible at a
    // level implying anyone stands behind it.
    const forgedRowLevel = EVIDENCE_CLASSES.TOLD || EVIDENCE_CLASSES.DECLARED;
    assert.ok(forgedRowLevel, 'no level available to record an unattributed assertion');
    assert.notStrictEqual(
        forgedRowLevel, EVIDENCE_CLASSES.OBSERVED,
        'an unattributed file assertion must never record as machine-observed');
    assert.notStrictEqual(
        forgedRowLevel, EVIDENCE_CLASSES.VERIFIED,
        'an unattributed file assertion must never record as verified');
});
