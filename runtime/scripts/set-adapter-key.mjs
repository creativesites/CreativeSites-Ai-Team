#!/usr/bin/env node
// Store an adapter credential in the owner-only env file, without echoing it.
//   node runtime/scripts/set-adapter-key.mjs GEMINI_API_KEY AIza...
// The runtime reads ~/.myaos/adapters.env (mode 600) and passes it only to
// adapter processes; the key is never written to the store or the repo.
import { writeAdapterEnvVar } from '../src/adapter-env.ts';

const key = process.argv[2];
const value = process.argv[3];
if (!key || !value || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
  console.error('usage: node runtime/scripts/set-adapter-key.mjs KEY VALUE');
  process.exit(1);
}
writeAdapterEnvVar(key, value);
console.log(`Saved ${key} to ~/.myaos/adapters.env (mode 600). It will be used by the next adapter session; no value was printed.`);
