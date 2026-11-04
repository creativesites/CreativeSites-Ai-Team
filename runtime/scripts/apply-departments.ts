#!/usr/bin/env node
// WP2-T7 (K5): set identities.department_id and seniority from the approved §13 table of
// community/proposals/MYAOS_V2_PROGRAMME_PLAN.md. Idempotent; only identities that exist are touched.
//
//   node runtime/scripts/apply-departments.ts
//
// MYAOS_RUNTIME_DB overrides the store path, as for the runtime itself.

import { runtimeDbPath } from '../src/config.ts';
import { applyDepartmentMapping } from '../src/intake/departments.ts';
import { Repo } from '../src/store/repo.ts';
import { openStore } from '../src/store/db.ts';
import type { DepartmentMappingEntry } from '../src/api/types.ts';

const E = 'engineering';
const P = 'platform-runtime';
const Q = 'quality-verification';
const D = 'design';
const S = 'planning-strategy';
const O = 'operations';

/** Programme plan §13 (approved 2026-11-03): 34 agents. Leads per §13 notes: vega, kael, orchestrator. */
export const DEPARTMENT_MAPPING: Record<string, DepartmentMappingEntry> = {
  atlas: { department: P },
  nexus: { department: P },
  cadence: { department: P },
  gemini_cli: { department: P },
  gantry: { department: P },
  cinder: { department: P },
  hermes: { department: P },
  vela: { department: E },
  iris: { department: E },
  astra: { department: E },
  lyra: { department: E },
  sol: { department: E },
  orion: { department: E },
  sirius: { department: E },
  forge: { department: E },
  vega: { department: E, seniority: 'lead' },
  loom: { department: E },
  quill: { department: E },
  kael: { department: Q, seniority: 'lead' },
  sentinel: { department: Q },
  antigravity: { department: Q },
  corona: { department: Q },
  tessera: { department: D },
  faraday: { department: D },
  helios: { department: D },
  reel: { department: D },
  orchestrator: { department: O, seniority: 'lead' },
  ledger: { department: O },
  synapse: { department: O },
  mira: { department: S },
  themis: { department: S },
  daedalus: { department: S },
  codex: { department: O },
  wren: { department: O },
};

if (import.meta.main) {
  const dbPath = runtimeDbPath();
  const db = openStore(dbPath);
  const result = applyDepartmentMapping(new Repo(db), DEPARTMENT_MAPPING);
  console.log(`Store: ${dbPath}`);
  for (const c of result.changed) {
    console.log(`  set ${c.id}: ${c.was.department ?? '(none)'}/${c.was.seniority} -> ${c.department}/${c.seniority}`);
  }
  for (const l of result.leads) console.log(`  lead of ${l.department}: ${l.lead}`);
  console.log(
    `Changed ${result.changed.length}, already correct ${result.unchanged.length}, not in this store ${result.missing.length}` +
      (result.missing.length ? ` (${result.missing.join(', ')})` : '')
  );
  db.close();
}
