#!/usr/bin/env node
// Seeds the three subscription AI accounts (programme plan K6/K9), with generic labels.
//
//   node runtime/scripts/seed-ai-accounts.ts
//
// Idempotent: does nothing if any account already exists. Rename labels and set
// adapter_account_id locally afterwards (labels and logins stay in the local DB,
// never in this repository). MYAOS_RUNTIME_DB overrides the store path.
// Stop the runtime first if you can; SQLite handles a concurrent writer, but the
// running app will not show the new rows until its next refresh.

import { runtimeDbPath } from '../src/config.ts';
import { openStore } from '../src/store/db.ts';
import { createAccount, listAccounts } from '../src/usage/accounts.ts';

const SEED_ACCOUNTS = [
  { provider: 'anthropic', plan: 'claude_team_or_client', label: 'Client Claude account', ownerScope: 'client:primary', limitModel: 'claude_5h_weekly_pct' },
  { provider: 'anthropic', plan: 'claude_pro', label: 'Personal Claude Pro', ownerScope: 'personal', limitModel: 'claude_5h_weekly_pct' },
  { provider: 'google', plan: 'google_ai_pro', label: 'Personal Google AI Pro', ownerScope: 'personal', limitModel: 'gemini_app_5h_weekly_pct' },
] as const;

const db = openStore(runtimeDbPath());
try {
  const existing = listAccounts(db, { includeArchived: true });
  if (existing.length) {
    console.log(`AI accounts already exist (${existing.length}); nothing seeded.`);
    for (const a of existing) console.log(`${a.id}\t${a.label}\t${a.ownerScope}`);
  } else {
    for (const seed of SEED_ACCOUNTS) {
      const a = createAccount(db, { ...seed });
      console.log(`${a.id}\t${a.label}\t${a.ownerScope}`);
    }
  }
} finally {
  db.close();
}
