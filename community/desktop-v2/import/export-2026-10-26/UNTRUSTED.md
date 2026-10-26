# UNTRUSTED — quarantine list for the v1 → v2 import

> Companion to `DATA_INVENTORY.md` in this folder. Machine-readable copy: `quarantine.json`.
> Rule: **none of the rows/artifacts below may be imported as evidence, facts, or
> "Verified" state in the v2 runtime.** They are listed here so the Lead can explicitly
> reject, archive, or re-derive them; they are never silently dropped.
>
> Sources: `data/myaos.db` (v1 store), read-only; files under `data/artifacts/`,
> `data/proof_bundles/`, `data/snapshots/`, `community/`.

## 1. Fake seed evidence (v1 `evidence` rows) — do not import

The two `TASK_LIVE_*` tasks were created by the v1 orchestrator's own self-test loop on
2026-09-05. Their "evidence" is a 206-byte JSON stub that asserts its own success; the
`evidence` row only says "All machine-observed verification checks passed" and its
`verified_files` copy is a stat of that same stub.

| evidence.id | task_id | verifier | class | passed | verdict |
|---|---|---|---|---|---|
| 1 | `TASK_LIVE_3414` | kael | VERIFIED | 1 | **fake seed evidence** — no command, no diff, no test output |
| 2 | `TASK_LIVE_8759` | kael | VERIFIED | 1 | **fake seed evidence** — same stub, different task |

Related fake `verification.passed` events (same rows, echoed into `events`):
`events.id = 17, 20, 37, 40`.

Related `provenance_log` rows that assert VERIFIED for those stubs:
`provenance_log.id = 16, 18, 31, 33` (plus `id = 3`, a self-asserted
`MIGRATION_PHASE1_COMPLETE` VERIFIED row with no check command).

## 2. Worker SUCCESS artifacts / proof bundles — archive, do not import

| file | sha256 | why untrusted |
|---|---|---|
| `data/artifacts/task_live_3414_proof.json` | `387ace3abc176ea26b91578ebab0ee1a81e0469ed803c662b0c1bb59ce27b323` | `{"worker":"Atlas","status":"SUCCESS"}` self-assertion, 206 bytes |
| `data/artifacts/task_live_8759_proof.json` | `cced9b877e08090601ea33f5fb944e0242b7aadc65c48138f4772fb23fc4af5a` | same self-assertion |
| `data/proof_bundles/proof_bundle_task_live_3414.json` | `6c3984c6ff415a74ad4bc598703e8cf018968d99253ec72e240c9c0528726289` | `"verification_status":"VERIFIED"`; its "independent verification" command only re-reads the stub and checks `status==='SUCCESS'` |
| `data/proof_bundles/proof_bundle_task_live_8759.json` | `4028589e5b7633b0ae1d822642d31ecf397b12c176f9a6ee388f13480a352ee6` | same |

These bundles also feed `data/snapshots/2026-09-07T11-28-09/system/VERIFICATION_RECORD.json`,
which claims `26/26` tests passed at commit `7ecae33`. That record is a historical
self-report with no task linkage — keep as an archive file, do not load it as v2 evidence.

## 3. Mission-pipeline "VERIFIED" claims — do not import

The v1 "Jules mission flow" writes a UI claim that verification completed without ever
writing an evidence row. Evidence rows referencing any mission: **0**.

**Mission plans whose "Machine Proof" stage is marked `completed`** (`jules_mission_plans`):

- `mission_1789209227914` — "Mission 2: Astra", assignee `kael`
- `mission_1789285494860` — "Mission 2: Astra", assignee `kael`

(The other two rows, `mission_default_astra` and `mission_1792486194238`, have the proof
stage `pending` and are equally unimportable as evidence.)

**Auto-generated "verification complete" messages** (`jules_mission_messages.id`):
`4, 5, 8, 11` — e.g. *"Independent Verification Complete by Kael [KL]. Evidence recorded
to SQLite substrate (`data/myaos.db`). Un-mocked regression tests executed."* The
matching `verifier.completed` event payload is unrelated chat text (a stale monitor
timeout), and no evidence row exists.

**Mission / verifier events** (`events.id`) — orchestration log lines, not evidence:
`mission.*` = `88, 90, 91, 93, 94, 95, 96, 97, 98, 99, 103, 104, 106, 107, 108, 109, 111`;
of those, `verifier.completed` = `95, 97, 99, 109` and `mission.verifier_dispatched` = `93, 106`.

## 4. Self-verified rows labelled VERIFIED — downgrade to ATTESTED at most

`verifier_identity` equals the task assignee, so verifiability is not independent
(`evidence.id`):

| evidence.id | task_id | verifier = assignee | details (claim, unverified here) |
|---|---|---|---|
| 25 | `TASK_MM_001` | synapse | commit `d1628f7`; 3/3 unit tests, compileDebugUnitTest exit 0 |
| 26 | `TASK_MM_002` | synapse | AudioRecorderShortStopTest 3/3, WorkPage* tests, compileDebugKotlin |
| 27 | `TASK_MM_003` | synapse | commit `d54baec`; compileDebugKotlin, 67/67 server tests |

These may be real work, but v2's D9 rule says VERIFIED requires a *different* agent
re-running the check in a clean worktree on the exact commit. Import as Claimed/Attested
and re-derive before any Verified label.

## 5. Synthetic / duplicate v1 task rows (still exported as real rows in `tasks.json`)

- Orchestrator self-test tasks: `TASK_LIVE_3414`, `TASK_LIVE_3415`, `TASK_LIVE_8759`,
  `TASK_LIVE_8760` — created by the v1 self-test loop, not real work.
- Duplicate dispatch rows (same title, 2–4 copies):
  - `task_design_fleet_intelligence_overview_11499903`, `..._55d319cc`, `..._beed085b`,
    `..._d47f9385` (4 × "Implement Approved Design: Fleet Intelligence Overview (v1)";
    the stored titles also carry a trailing tab),
  - `TASK_LIVE_3414` / `TASK_LIVE_8759`,
  - `TASK_LIVE_3415` / `TASK_LIVE_8760`.
- `tasks.json` keeps all 45 rows (they are real DB rows, per the task requirement) but
  these ids must not be presented as distinct completed/planned work.

## 6. Legacy live-state files (not app evidence; do not ingest as truth)

Observed on disk in the main tree and deliberately **not** exported as structured data:

- `community/events.ndjson`, `community/tasks.json` — last-write-wins legacy mirrors.
- `data/events.ndjson`, `data/tasks.json` — older copies of the same.
- `data/runtime_handshakes.json`, `data/runtime_sessions.json` — stale liveness snapshots
  (v1 agents are not necessarily alive; v2 must probe, never trust these).
- `data/provenance.log` — append-only-ish log with the VERIFIED rows listed above.
- `data/snapshots/2026-09-07T11-28-09/**` — snapshot of the *pre-26-identity* state
  (`agents.json` with 8 identities, old tasks, `system/VERIFICATION_RECORD.json`).

## 7. What is NOT quarantined (for contrast)

The remaining v1 evidence rows (`evidence.id` 4, 7–24) are ordinary records: either
independent verification by a different identity (meridian verifying other agents'
work), DECLARED/UNKNOWN self-reports, or passed=0 corrections. They are outside the scope
of this import (v2 starts with no evidence) but are **not** classified as fake; if the
Lead later imports v1 evidence history, these are the rows to re-read first.
