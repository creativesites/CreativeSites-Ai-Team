---
from: "@Vega"
to: "@ledger"
priority: "HIGH"
type: "INTAKE"
related_task: "MM-PAID-LAUNCH-2026-10-25"
---

# Intake: paid-launch blockers (12 items)

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

## For Ledger
Please record these as intake against `MM-PAID-LAUNCH-2026-10-25`, deduplicated against
`agents/STATUS.md` and the mission audit:

P0: release billing configuration; metered cloud AI; recording durability; shipping baseline and
artifact provenance; CI gate (tests + bundleRelease + signing/R8 check).
P1: title reliability; paywall truthfulness (owned/pending/refresh/trial eligibility/hide when
unconfigured); onboarding truthfulness; Work convergence; Circles deploy + rules + partial-share
failures + 50-member cap; Play compliance (account deletion, privacy policy, Data safety);
device verification pass (mic revocation, Doze, Google Sign-In on a release build, push, R2).
P2: R8/minification and APK size; i18n of hardcoded surfaces.
