# Proactive Features Plan — draft in progress

**Session**: Sage 🧭 (Planner) + Iris 👁 (Orchestration/feasibility), per
Winston's ask to plan the proactive-features layer, continuing
[[019_mya_sdk_ux_product_plan]] section 1's "ambient layer" and the
push-notification plumbing already in flight as `TASK_HJ_021`.

**Status**: DRAFT — Sage's trigger catalogue below, sourced from reading
`RoutineTracking.php` and `InsightEngine.php` directly, not assumed.
Iris: feasibility pass against `TASK_HJ_021`'s actual scheduling mechanism
pending.

---

## Headline finding: the routine-reminder trigger logic already exists

Checked `RoutineTracking.php`'s `myavana_get_routine_tracking_context()`
directly (`includes/Domain/Goals/RoutineTracking.php`, myavana-hair-journey
plugin). It already computes, per user, on every call:

- `overdue` / `due` / `upcoming` notifications **with copy already written**
  (e.g. "Missed last due date. Log it, skip it, or reset the reminder.")
- `global_streak`, `best_routine_streak`, `adherence_30d`
- Per-routine `current_streak`, `completion_rate_30d`, `next_due_date`

`[VERIFIED]` — this is real, tested-by-existing-usage logic, not a proposal.
The gap is exactly what the grounding thread already flagged: **it's
pull-based only** — computed when a screen loads, never pushed. This
significantly changes the proactive-features scope: for routines, we are
not designing new trigger logic, we're scheduling and delivering logic that
already exists. Much smaller lift than "build proactive intelligence" implies.

`InsightEngine.generateFallbackInsight()` (checked by Iris in the prior
session): real streak/completion arithmetic plugged into a fixed sentence
template, no adaptation over time. Relevant here because it's a second real
source of trigger-worthy content beyond routines specifically.

## Trigger catalogue

Each entry: what fires it, what data it's sourced from, evidence status,
and the "earned, not spam" check — why this respects the bar we set in the
UX/product session (a nudge should be triggered by real tracked behavior,
not a timer).

| Trigger | Source (real, existing) | Status | Earned-not-spam check |
|---|---|---|---|
| **Overdue routine** | `myavana_get_routine_tracking_context()`'s `overdue` notification, copy already written | `[LOGIC VERIFIED, DELIVERY MISSING]` | Fires only when a specific scheduled routine was actually missed — inherently behavior-triggered, not time-triggered |
| **Due today** | Same function, `due` type | `[LOGIC VERIFIED, DELIVERY MISSING]` | Borderline — this is closer to a reminder than an "earned" nudge; worth capping frequency (once/day max) so it doesn't feel like alarm spam |
| **Upcoming (within 3 days)** | Same function, `upcoming` type | `[LOGIC VERIFIED, DELIVERY MISSING]` | Same caveat as due-today; lower priority than overdue/due |
| **Streak milestone** (e.g. 7-day, 30-day) | `global_streak` / `best_routine_streak`, already computed | `[DATA VERIFIED, MILESTONE LOGIC MISSING]` | Strongest "earned" case in this list — literally a celebration of real sustained behavior, highest-confidence trigger to build first |
| **Adherence drop** (e.g. 30d adherence crosses below 50%) | `adherence_30d`, already computed; this is the same signal TASK_MSDK_007 (P1, this week) is building the Mya-conversation version of | `[DATA VERIFIED, THRESHOLD/DEDUP LOGIC MISSING]` | Real, but needs care — a "you're slipping" push can read as guilt-tripping rather than supportive; copy matters as much as the trigger condition |
| **Wash-day reminder** | Not found as existing logic distinct from the routine-due mechanism above — likely IS the routine-due trigger for a wash routine specifically, not a separate system | `[UNVERIFIED — may already be covered]` | Needs a check before building anything new: confirm with whoever owns routine data whether "wash day" is just a routine type, or genuinely needs separate logic |
| **Weather/humidity tip** | HJ-013 — no real weather API exists anywhere in the codebase (confirmed in the prior session, `TASK_MSDK_005` is gating the fabricated version) | `[BLOCKED]` | Cannot ship as a proactive trigger before `TASK_MSDK_005` lands and a real data source exists — including this here only to explicitly exclude it from this week's proactive scope, not to silently drop it |

## What this changes about scope

Given the headline finding, the proactive-features work is mostly:
1. **Scheduling** — get `myavana_get_routine_tracking_context()`'s existing
   overdue/due/upcoming logic running on a cron instead of only on page
   load, and route its output to a push send once `TASK_HJ_021`'s
   send-capability lands.
2. **One new, small piece of logic**: streak-milestone detection (7-day,
   30-day, etc.) — doesn't exist yet but is a simple threshold check against
   already-computed `global_streak`/`best_routine_streak` data, not a new
   data pipeline.
3. **Dedup/frequency logic** — none of the existing notification logic was
   designed for push (it was designed to render a list on a screen the user
   chose to open); pushing the same "overdue" notification every day a
   routine stays overdue would violate the earned-not-spam bar. Needs a
   simple "don't re-send the same notification within N days" rule.
4. **Explicitly excluded this week**: weather (blocked on TASK_MSDK_005 +
   a real API), wash-day as a distinct system (pending confirmation it
   isn't already covered), and the deeper adherence→recommendation
   personalization TASK_MSDK_007 is scoping separately for the chat
   surface (this doc's adherence-drop trigger is the *push* version of the
   same underlying signal — worth keeping the two consistent rather than
   building two different definitions of "adherence is dropping").

## BLOCKER — device-registration integration point was never actually confirmed

**Flagged by Iris, 2026-09-09, before starting the feasibility section.**
Meridian's task-assignment note to Vela picked "new WordPress endpoint
(`POST /myavana/v1/device/register-token`)" as the integration point, but
`human_decisions` has zero rows and no record exists of Winston or Candace
actually confirming that choice. This matters specifically for this doc:
Candace's own stated principle (thread 021) was "all our systems must work
or sync with the myavana core systems" (`api.myavana.com`) — a new isolated
WP endpoint is arguably the opposite of that. Vela is already `in_progress`
building against the WP-endpoint assumption.

**Not stopping Vela's work** — no evidence yet that it's wrong, just that
it was never actually confirmed, and reversing in-progress work on inference
alone would be its own mistake. Iris is flagging directly to Winston now.

**Effect on this doc**: the scheduling/feasibility section below is on hold
until that comes back, since "which backend" determines whether the right
mechanism is WP-cron, a queue, or something triggered from `api.myavana.com`
itself — three different designs, not one design with different config.

## Open question for Iris (once the backend question resolves)

Given `TASK_HJ_021`'s actual backend (pending confirmation above) — what's
the realistic scheduling mechanism for running
`myavana_get_routine_tracking_context()` (or a wrapper around it) per-user
on a cadence? Is there already a cron pattern in use elsewhere in this
codebase to match, or is this new infrastructure?

---

*Sage's catalogue above stands regardless of the backend answer — the
trigger logic and data sources don't change based on which backend delivers
them. Feasibility/scheduling section from Iris pending the blocker above.*
