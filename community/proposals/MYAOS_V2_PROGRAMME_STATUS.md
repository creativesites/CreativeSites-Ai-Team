# MyaOS V2 programme: status and continuation brief

Kept current by the lead session. If a new session takes over, read this first, then the [programme plan](MYAOS_V2_PROGRAMME_PLAN.md).

**Objective:** deliver the approved [vision](MYAOS_V2_AUTONOMOUS_ORGANISATION_VISION.md) through WP0–WP11. First, WP0. Next, the end-to-end slice S1.
**Branch / PR:** `ccr-9ef3b891-fjv3er` → PR #3 (draft) into `main`.
**CI:** `.github/workflows/v2-ci.yml` exists but cannot run: the GitHub account is billing-locked. The owner has ruled this is not a blocker, so every step records its local evidence instead.

## Done (verified locally; runtime suite **223/223**, `tsc` clean in `runtime/` and `apps/desktop/`)

| Package | What exists | Evidence |
|---|---|---|
| WP0 | V2 merged into the main line; typecheck and hermetic tests fixed; CI file (cannot run: GitHub billing lock); v1 marked legacy; adapter readiness gate and signed-in account capture; backup/restore/dry-run; security review | `7833d5c` … `4b7f9d3` |
| WP1 | K3 task state machine, dependencies, ready queue, ack/retry/stale sweeper, event idempotency (migration v10) | merge `2c2f067` |
| WP2 | Unified intake, rule triage, dedupe, six departments (v11) | merge `3168160` |
| WP4 | MCP agent action interface with session tokens, owner key, env allowlist (v12); dispatcher (flag, default off); one worktree per task | `8e9962f`, `d8f8e66`, `fe90ada` |
| WP5 | VERIFIED gate for verification-required criteria; delivery as a draft PR | `8e3e2b9`, `0de86b0` |
| WP6 | Timezone cron, schedule_runs, catch-up, stand-up pipeline, routines (v17) | merge `f249a75` |
| WP7 | Evidence-derived KR progress (UNKNOWN when unlinked), health split, archive/delete (v19) | merge `4509d91` |
| WP8 | Runtime-loaded versioned skills, 16-skill catalog (v18) | merge `c9ebbb6` |
| WP9 | Time ledger, engagements from a local file, timesheets with reconciliation hash, job timeline (v16, v22) | `367b46d`, `9ecbf6c` |
| WP10 | Subscription usage tracking, 70% weekly-pace alert, K9 isolation enforced at session start (v13); model-aware renewal, budgets, usage mapper (v21); no prices, no shipped context windows | merge `1303cb4`, WP10 merge, `e9b1ea9` |
| WP3 | Agent-driven Planning Council (live sessions per seat, absent seats never filled, dissent kept); the scripted one is labelled simulation (v20) | merge `86f5aea` |
| WP6 6.6 | LaunchAgent generator and install script (launchctl itself not run here) | `220ec28` |
| WP11 | 15-item navigation; Time, AI Resources, Skills, Stand-ups, QA, Health screens; job timeline; Executive Home cards | merge `545f922` |
| Design | Design Studio lifecycle (draft/iterating/review/approved/superseded), design requests with linked task, approved-design references to engineers, conformance reports (v23) | merge `b5673a9` |
| Recovery | Restart mid-task recovery test; shutdown no longer hangs or leaks agent processes | `1edd3a7` |
| S1 | End-to-end slice test (intake → shipped, verified, accounted, on the timeline) | `9d1d819` |
| Security | Owner key in the macOS Keychain (Rust command compiled standalone; Tauri build and real Keychain not verified here) | `dd0249e` |

## In progress

Nothing. All packages in the plan have a first implementation; see Not done for what only the owner's Mac can prove.

## Not done

- **Packaged app launch, Keychain backend, real adapters (Claude/Codex/Gemini MCP and usage fidelity):** need the owner's Mac; WP0-T10 truth pass.
- **CI:** blocked by the GitHub account billing lock, so every merge records local evidence instead.
- **Flags:** all new automation is off by default (`workflow.dispatcher`, `autoAcceptLowRisk`, `standups`, routines); enable one at a time with sign-off.
- **LaunchAgent (6.6), release checklist, §18 acceptance runs on macOS.**

## Owner-only items

- Run `node runtime/scripts/truth-pass.ts` on the Mac and share the output (WP0-T10).
- Save `~/.myaos/engagements.local.json` (template: `runtime/engagements.local.example.json`).
- Create the three AI accounts (`node runtime/scripts/seed-ai-accounts.ts`) and enter `/usage` snapshots.
- Approve the §13 department mapping run (`runtime/scripts/apply-departments.ts`).
