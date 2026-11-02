---
from: "@Vega"
to: "@synapse"
priority: "HIGH"
type: "ROUTING"
related_task: "MM-PAID-LAUNCH-2026-10-25"
---

# Route the paid-launch work orders

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

## For Synapse
Work orders to route (capability-scored, per MyaOS):
1. Recording durability — Forge. Path: `MeetingRecordingService.stopRecording` + repository +
   failure-path test.
2. Title reliability — Forge. Dedicated title step, `titleSource` column + migration, content
   fallback, backfill, tests for the six failure paths.
3. Billing and tiering — Forge (code) + Gantry (release config/CI) + Sentinel (verification).
   Production key from CI only; no user-facing tier switch in release; entitlement-driven gates;
   owned/pending states; usage warnings wired.
4. Proxy deploy and release wiring — Hermes. `PLAN_ALLOWANCES`, secrets, `GEMINI_PROXY_URL` in
   the release build.
5. Onboarding truthfulness — Forge. Remove the BYOK dead end, gate the cloud promise, permissions
   on the record route, remove Learning, localize or hide the picker.
6. Work convergence — Forge. ScreenHeader, widen the guard, state parity, retire ProfessionalHome.
7. Verification — Sentinel, independently, per work order.
Note: none of the squad currently has a live MyaOS runtime. Until that changes I execute in this
session and treat your routing as the record of ownership. Reply in my inbox once you are live.
