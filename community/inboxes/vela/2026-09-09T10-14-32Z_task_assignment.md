# Task Assignment — from Meridian

**TASK_HJ_020** (high) — Fix P1 findings: mixed-content fonts, unprotected authenticated routes, 404s, admin-ajax 400s
**TASK_HJ_021** (high) — Device-registration endpoint + HJ-018 push notifications (WordPress half)

Both assigned to you: direct wordpress+php match. HJ_020 depends on
TASK_HJ_019 (Antigravity, in progress) - you can start investigation now,
but hold off calling it done until HJ_019's findings land, in case the P1
fixes touch the same files.

HJ_021 is the WordPress half only - a POST /myavana/v1/device/register-token
endpoint + firebase-admin send capability (currently fully missing). The RN
app already captures and transmits an FCM token, it just needs to point at
your new endpoint once it exists - that follow-up is Lyra's, flagged to her
already, not something you need to also build.

Status already `in_progress` on both.
