'use strict';
const { parseJson } = require('./util');
const { assertCan } = require('./access');
const { invalid } = require('./errors');

const DEFAULTS = Object.freeze({
  maxUploadBytes: 25 * 1024 * 1024,
  chunkTargetChars: 900,
  quarantineInjection: true,          // suspicious chunks are withheld from agent search/context
  autoExtractKnowledge: true,
  commitmentMinConfidence: 0.4,       // below this an extracted candidate is dropped (counted, not stored)
  commitmentAutoAcceptThreshold: null,// null = never auto-accept; humans/orchestrator confirm
  embeddingProvider: 'local-hashing',
  recencyHalfLifeDays: 365,
  retrieval: { ftsWeight: 1.0, semanticWeight: 1.0, authorityBoost: 0.15, minSemanticScore: 0.12 },
  allowedKinds: ['text', 'code', 'csv', 'html', 'transcript', 'docx', 'xlsx', 'pptx', 'pdf', 'image'],
  stalenessImpactThreshold: 0.5,
  defaultRetentionDays: null,
  contextDefaultBudgetTokens: 6000,
});

class Settings {
  constructor(db, clock, audit) { this.db = db; this.clock = clock; this.audit = audit; }
  all() {
    const out = { ...DEFAULTS, retrieval: { ...DEFAULTS.retrieval } };
    for (const r of this.db.all('SELECT * FROM ki_settings')) {
      const v = parseJson(r.value_json, undefined);
      if (v !== undefined) out[r.key] = r.key === 'retrieval' ? { ...DEFAULTS.retrieval, ...v } : v;
    }
    return out;
  }
  get(key) { return this.all()[key]; }
  set(principal, key, value) {
    assertCan(principal, 'settings.write');
    if (!(key in DEFAULTS)) throw invalid(`Unknown setting: ${key}`);
    if (typeof DEFAULTS[key] === 'number' && typeof value !== 'number') throw invalid(`${key} must be a number`);
    if (typeof DEFAULTS[key] === 'boolean' && typeof value !== 'boolean') throw invalid(`${key} must be boolean`);
    const old = this.get(key);
    this.db.tx(() => {
      this.db.run(`INSERT INTO ki_settings(key,value_json,updated_by,updated_at) VALUES (?,?,?,?)
        ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
      [key, JSON.stringify(value), principal.id, this.clock.iso()]);
      this.audit.record({ principal, action: 'settings.change', entityType: 'setting', entityId: key, detail: { from: old, to: value } });
    });
    return this.get(key);
  }
}
module.exports = { Settings, DEFAULTS };
