# MyaOS V2 programme: status and continuation brief

Kept current by the lead session. If a new session takes over, read this first, then the [programme plan](MYAOS_V2_PROGRAMME_PLAN.md).

**Objective:** deliver the approved [vision](MYAOS_V2_AUTONOMOUS_ORGANISATION_VISION.md) through WP0–WP11. First, WP0. Next, the end-to-end slice S1.
**Branch / PR:** `ccr-9ef3b891-fjv3er` → PR #3 (draft) into `main`.
**CI:** `.github/workflows/v2-ci.yml` exists but cannot run: the GitHub account is billing-locked. The owner has ruled this is not a blocker, so every step records its local evidence instead.

## Done (verified locally)

| Item | Evidence |
|---|---|
| WP0-T1: V2 merged into the main line | merge `7833d5c`; 34 identities, none lost |
| WP0-T2/T3: typecheck and hermetic tests | `6ce6074`; fabricated OKR seed removed |
| WP0-T4/T5: CI and v1 legacy markers | `cbc7df2` |
| WP0-T6: adapter readiness gate and account capture | `e8403df` |
| WP0-T7/T8: backup, restore, migration dry-run, policy | `4b7f9d3` |
| WP0-T9: security review | `MYAOS_V2_SECURITY_REVIEW_WP0.md` |
| S1-B (WP2 2.1–2.3, 2.7): intake, triage, dedupe, departments (migration v11) | merge `3168160` |
| S1-D, part 1 (K4): MCP server, session tokens, owner key, env allowlist (migration v12) | `8e9962f` |
| Bug: rate-limited status was overwritten by a sibling session | `8e9962f`; this was the root cause of the intermittent orchestrator test |
| S1-A (WP1 1.2–1.7): K3 task state machine, ready queue, sweeper, migration v10 | merge `2c2f067` |
| S1-D, part 2: per-session MCP token, tools offered to agents, prompt card; S3 env-leak fix | `d8f8e66`; end-to-end test: agent calls `task_report` over MCP |
| WP9 9.1–9.5: time ledger (agent turns, human timers and entries, adjustments, engagements from a local file) and job timeline (migration v16) | `367b46d` |
| WP10 10.2–10.2c: subscription usage tracking, 70% weekly-pace alert, K9 check (migration v13) | merge `1303cb4` |

Runtime suite: **132/132**. `tsc` is clean in `runtime/` and `apps/desktop/`.

## In progress

- **S1-C:** `plan_submit`, `task_claim`, low-risk auto-accept (flag), Needs-You API. Sonnet worker.
- **S1-E part 1:** dispatcher (flag) and one worktree plus branch per task. Sonnet worker.

## Next, in order

1. Merge S1-C and S1-E part 1.
2. Lead: VERIFIED gate for `verification_required` criteria (C7); delivery record; wire `task_usage` and the K9 check into dispatch. Then the S1 end-to-end test with the fake adapter.
4. After S1: WP6 stand-ups, scheduler and catch-up; WP9 time; WP10 subscription usage (K6); WP7 OKRs; WP8 skills; WP3 real council; WP11 desktop.

## Owner-only items

- **WP0-T10:** run `node runtime/scripts/truth-pass.ts` on the Mac.
- **Owner-key enrolment from the desktop**, with the key stored in the Keychain. Needs a macOS build.
- **Store the engagement terms** in `~/.myaos/engagements.local.json` (never in the repo).

## Decisions

The owner's decisions are recorded in plan §12 and §13: K1 (V2 is canonical), the billing model, subscription usage tracking (K6), account isolation (K9), six departments, and a client-specific repository later.
