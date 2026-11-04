# runtime/scripts — import-identities.mjs

One-off, deterministic v1 → v2 data import for Phase 1 (identity/team import plus the
v1 data inventory). Plain Node ESM (`node >= 24`), **no dependencies**; the v1 SQLite
store is queried read-only through the `sqlite3` CLI (`sqlite3` must be on `PATH`).

It does **not** write the v2 runtime store, start the runtime, or touch
`runtime/src/**`, `apps/desktop/**`, `runtime/package.json` or `package.json`. Output is
files only.

## What it reads

| source | why |
|---|---|
| `data/myaos.db` | v1 `identities` (26), `teams` (3), `projects` (6), `tasks` (45), `token_ledger` (16); `evidence`/`events`/`jules_mission_*`/`provenance_log` only for the quarantine list |
| `community/agents.json` | 25 identity entries (nested and flat shapes) |
| `community/AGENTS_REGISTRY.md` | 23 named identities; used only to detect roster coverage gaps and recorded prose contradictions |
| `community/proposals/DESKTOP_V2_DECISIONS.md` | D7 owner identity (`winston`) |

**Source root matters.** The script lives in the v2 worktree, but the worktree copy of
`data/myaos.db` (and `community/agents.json` / `AGENTS_REGISTRY.md`) is **stale**: the
worktree DB is the committed HEAD blob with 13 identities, while the live v1 state lives
only as an uncommitted modification of `data/myaos.db` in the main working tree
(26 identities). The script therefore reads from the main tree by default when it detects
it is running inside `.claude/worktrees/<name>`. Override with `--main-root` or `--db`.
Never import from the worktree DB.

## What it writes

```
community/desktop-v2/import/import-payload.json          # canonical payload:
                                                         # { schemaVersion, source, stats,
                                                         #   owner, teams, identities, conflicts }
community/desktop-v2/import/export-2026-10-26/
  identities.json     # owner + 28 identities + conflicts (same objects as the payload)
  teams.json          # 3 teams, member ids, home-repo observation, bridge partner
  projects.json       # 6 v1 projects + 8 repo specs checked with existsSync/test -d
  tasks.json          # 45 real v1 task rows (id/title/status/assignee/created_at + repo)
  token_usage.json    # 16 v1 token rows + totals
  quarantine.json     # fake evidence, proof bundles, mission VERIFIED claims, self-verified rows
```

Hand-written companions in the same export folder:
`UNTRUSTED.md` (quarantine list and reasons) and `DATA_INVENTORY.md` (safe-to-import,
data-loss risk, exact schema/columns, resolution rules, conflicts, unknowns).
The script does not overwrite those two.

## Run it

```bash
# from the v2 worktree root
node runtime/scripts/import-identities.mjs            # (re)write all generated files
node runtime/scripts/import-identities.mjs --check    # exit 1 if generated files are stale/missing
node runtime/scripts/import-identities.mjs --db /path/to/myaos.db
node runtime/scripts/import-identities.mjs --main-root /path/to/CreativeSites-Ai-Team
node runtime/scripts/import-identities.mjs --agents /path/to/agents.json \
     --registry /path/to/AGENTS_REGISTRY.md
```

`--check` compares the on-disk files byte-for-byte against a fresh build and is the
determinism gate: keys are deep-sorted, every list has an explicit order, and no
generation timestamps are written. Source facts (task `created_at`, `last_observed_time`,
token `ts`, repo branch/head) are data, not generation metadata.

## Merge rules (full detail in `DATA_INVENTORY.md`)

- Identity set = `identities` table (26) ∪ `agents.json` (25) = **28**; owner `winston`
  is separate (D7). DB-only `meridian`, `sage`, `test_spec`; agents-only `sirius`, `wren`.
- `data/myaos.db` wins for name/symbol/primary_domain/team/lane/provenance/liveness;
  capability/responsibility/repository lists are unioned and sorted.
- v1 `VERIFIED_OBSERVED` maps to v2 `OBSERVED` (it was not independently re-verified);
  `UNVERIFIED_DECLARATION` maps to `DECLARED` and is flagged.
- `seats` is empty everywhere (no v1 seat assignment exists); `liveness` is a copied
  v1 snapshot, never a probe.
- Avatar marks come from the supported Solid Glass set (`avatar.tsx` → `AVATAR_MARKS`);
  unmapped symbols use the real monogram fallback and say so. Avatar colours are
  team-semantic (creativesites=teal, meetingmind=violet, deployfleet=blue,
  unknown=graphite, owner=amber).
- Adapter preference is written only with evidence: `gemini_cli`→gemini (declared);
  `atlas, kael, lyra, vega, vela, wren`→claude (inferred from v1
  `/tmp/cc-socks/<pid>.sock` session ids); everything else `null` + `adapter-unknown`.
- Every divergence between DB / `agents.json` / registry is recorded in
  `identities.json#conflicts` (73 entries: 20 material, 41 informational, 12 coverage).
  Quarantined rows are listed in `quarantine.json` / `UNTRUSTED.md` and never exported
  as evidence.

## Mapping the payload onto the v2 runtime

The visible payload is a superset of the v2 wire types in
`runtime/src/api/types.ts`. To create rows with the Phase 1 write API:

- `identities[]` → `CreateIdentityInput`:
  `id`, `name`, `role`, `runtime` ← `adapter`, `avatarMark`, `avatarColor`,
  `seats`; keep `team`, `lane`, `capabilities`, `provenance`, `evidenceClass`,
  `liveness`, `livenessSource`, `repositories` as v2 identity extensions (review §2.6).
- `owner` → identity `winston` (`approval_level: owner`), and set
  `settings.ownerId = "winston"` (D7). The UI may still render "You".
- `teams[]` → team records; `memberCount`/`members` are advisory (computed from
  `identities.team`). `deployfleet` currently has no members — resolve before import.
- `projects.json` → v2 project/workspace candidates; **probe repo state live** — the
  exported branch/head/dirty values are a one-time snapshot.
- `tasks.json` / `token_usage.json` → optional real-history import for Measures; these
  are v1 rows, not v2 tasks, and must not be mixed into the v2 job/task tables without
  an explicit mapping decision.

## Verification

A correct run prints:

```
identities: 28 (db 26 + agents.json 25, union) + owner winston
teams: 3; tasks: 45; token rows: 16; conflicts: 73
source db: <abs path> sha256=f031e9fd…ad0ee
```

Expected counts: 28 identities + owner, 3 teams, 6 projects + 8 observed repo specs,
45 tasks, 16 token rows, 73 conflicts, 0 evidence rows imported.
