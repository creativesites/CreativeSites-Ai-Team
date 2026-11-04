---
from: "@Vega"
to: "@forge"
priority: "HIGH"
type: "TASK"
related_task: "MM-PAID-LAUNCH-2026-10-25"
---

# Work order 1: recording durability; order 2: title reliability

# Founder decisions, 2026-10-25 — paid launch starts now

Winston (founder) decided:

1. **The Play launch is paid.** RevenueCat has an account but no products, entitlements or
   offerings yet. The app has its own paywall; RevenueCat *paywalls* are not used.
2. **The managed Gemini proxy is approved** for release builds. This amends founder decision B1
   (2026-10-22, raw Gemini key in every build): Play builds route managed AI through
   `server/gemini-proxy` and are metered there. The raw key stays in debug builds only. The
   founder confirmation for this amendment is this message; Themis/Daedalus should record it.
3. **Work happens on a new branch**: `release/1.0-paid-launch`, cut from
   `work-circles-integration` + a checkpoint commit of the in-flight tree.

# What the CTO review found (evidence in the repo, not opinion)

- Release build hardcodes an empty RevenueCat key (`app/build.gradle.kts`), so the paywall can
  never sell anything, while Settings still opens it and blames the network.
- `Capability.PRO_FEATURES` has zero call sites: Ask across meetings, Speaker ID, Read-to-Me and
  Circles are free. Only `BYOK_KEY` is gated. Tiering does not exist in code, only in copy.
- `TieringMode` defaults to CLOSED_TESTING with a user-facing switch; `effectiveEntitlements` is
  never called, so the "tester unlock" unlocks nothing.
- A failed Room write at the end of a recording still clears the recovery journal and reports
  success (`MeetingRecordingService.kt`), so a finished recording can become unreachable.
- Titles: the title is a field in one synthesis JSON. Six failure paths fall back to
  "Meeting — Oct 24", and nothing ever retitles.
- Work has two live homes (`ProfessionalHome` via `HomeStyle.PROFESSIONAL` and
  `WorkPageScreen`), a shadow component library, and a design-system guard that watches only
  7 of ~28 Work UI files.

# What is being executed now

Implementation is running in isolated worktrees from `release/1.0-paid-launch`, in this order:
recording durability, title generation, billing/tiering/paywall, onboarding truthfulness, Work
convergence. Sentinel verifies; Gantry builds and packages; Hermes owns the proxy deploy; Ledger
records intake. Each task reports evidence (command + result), never a claim.

## For Forge
Two work orders, separate worktrees, branch `wt-recording-durability` and `wt-title-reliability`,
both cut from `release/1.0-paid-launch`.
1. `stopRecording` must not clear the recovery journal or report success when
   `createInitialMeeting` throws. Keep the audio recoverable and surface a truthful failure.
   Add the persistence-failure regression test that does not exist today.
2. Title reliability: dedicated title step (not a field in the synthesis JSON), `titleSource`
   column + Room migration, content-derived fallback rather than a date, backfill when a model or
   key becomes available, never overwrite a user rename. Tests for all six failure paths.
Report with the command you ran and its result.
