# Sage: Task contracts for mobile SDK polish + Hair Journey readiness

**Date**: 2026-09-09
**Author**: Sage 🧭 (Planner)

---

## Context

Winston asked (relayed by Meridian) to plan next tasks across two workstreams,
now that the P0 auth nonce fix (v3.2.3) has Level-3 production verification
and is closed. Wrote 7 real task contracts directly into `data/myaos.db`'s
`tasks` table (not `community/tasks.json` — confirmed with Meridian that only
SQLite is visible to the Intelligence Layer / routing / dashboard).

Sources read before writing contracts, not assumed:
- `community/inboxes/antigravity/qa_baseline_2026-09-08.md` — full P0/P1/P2/P3
  QA baseline for myhairjourney.ai
- `community/inboxes/iris/2026-09-09_nonce_fix_verification_report.md` —
  today's Level-3 re-verification, confirms P0-1/P0-2 closed
- `Myavana-Chatbot/community/threads/016_mya_mobile_uiux_redesign_kickoff.md` —
  Winston's real-device mobile bug report + Meridian's static-analysis findings
- `Myavana-Chatbot/community/threads/021_push_notifications_hj018_approved.md` —
  HJ-018 approval and verified existing technical state

## Task contracts written (SQLite `tasks`)

### Mobile SDK polish (`MyAvana_FrontEnd_RN`)
| ID | Title | Priority | Effort tier |
|---|---|---|---|
| TASK_MSDK_001 | Fix missing safe-area/inset handling in Mya chat screen | high | general/Haiku start |
| TASK_MSDK_002 | Fix Mya welcome card permanent persistence | medium | general/Haiku start |
| TASK_MSDK_003 | Root-cause + fix image attachments rendering as text | high | general/Haiku start, expect escalation |
| TASK_MSDK_004 | Root-cause + fix Mya asking authenticated users for their name | medium | general/Haiku start |

### Hair Journey production readiness (`myavana-hair-journey-next`)
| ID | Title | Priority | Effort tier |
|---|---|---|---|
| TASK_HJ_019 | Re-verify remaining P0s (empty nav, networkidle timeout) | urgent | general/Haiku start |
| TASK_HJ_020 | Fix P1s: mixed-content fonts, unprotected routes, 404s, admin-ajax 400 | high | general/Haiku start, depends on HJ_019 |
| TASK_HJ_021 | Resolve device-registration integration point, then implement HJ-018 | high | architecture/Sonnet start |

Full descriptions, dependencies, and falsifiable `acceptance_criteria` are in
the `tasks` table itself — this thread is the summary, not the source of
truth. Effort-tier reasoning recorded per-task in `task_notes`.

## What I deliberately did NOT do

- Did not write contracts for every P2/P3 item in the QA baseline (default
  WP sidebar on auth pages, xmlrpc.php exposure, RevSlider CVEs, missing OG
  tags, etc.) — real but lower priority than the P0/P1s and the mobile bugs
  Winston explicitly asked about. Flagging here rather than silently
  dropping them; can write contracts for these on request.
- Did not assume P0-3 (empty nav) and P0-4 (networkidle timeout) are fixed
  just because P0-1/P0-2 are — the 2026-09-09 verification report doesn't
  cover them. TASK_HJ_019 exists specifically to re-test, not assume.
- Did not claim TASK_HJ_020's Kommunicate item is resolved by the nonce fix
  even though it's plausible (same chat-token endpoint) — needs its own
  re-test per the acceptance criteria.

## Verifier note

Per the org's "no completion claim ships without independent re-derivation"
norm — Kael (Level-4 interactive browser) and Antigravity (Level-3 automated
Playwright) are the natural Verifier partners for the HJ tasks; whoever picks
up the MSDK tasks needs real device/emulator access, not static reads, per
the same discipline thread 016 already established for those bugs.

## Status

All 7 tasks are `open`, unassigned, no claims yet. Available to answer
questions on any of them or write contracts for the P2/P3 backlog if wanted.
