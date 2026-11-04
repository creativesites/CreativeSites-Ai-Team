# Store migration policy (WP0-T8)

Applies to `~/.myaos/runtime.db`, the only workflow store (programme plan K1).

1. **Additive only.** New tables, new nullable or defaulted columns, new indexes. Never drop or rename a column, and never rewrite existing rows in a migration. When a column must change meaning, add a new column and backfill it in code.
2. **Never edit a shipped migration.** Fix forward with the next version. Versions are integers in `src/store/migrations.ts`. `v9` is the last shipped version; the next is `v10`.
3. **One transaction per migration.** `migrate()` already wraps each version in `BEGIN/COMMIT` and rolls back on error.
4. **Automatic backup.** `openStore()` copies the store to `<db>.bak-v<from>-<stamp>` before upgrading, and keeps the newest 10 copies.
5. **Dry-run before merge.** For any PR that adds a migration, run it against a copy of a real store:
   ```
   node runtime/scripts/store.ts backup     # optional, the upgrade also backs up
   node runtime/scripts/store.ts dry-run    # exits 3 if an existing table's row count changes
   ```
   Paste the output into the PR as evidence.
6. **Restore.** `node runtime/scripts/store.ts list`, then `restore <file>` with the app closed. The replaced store is itself saved as a `pre-restore` backup, so a restore can be undone.
7. **Tests.** Every migration gets an idempotency test (re-running is a no-op) and a row-count test.
