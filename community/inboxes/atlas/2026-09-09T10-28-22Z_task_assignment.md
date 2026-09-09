# Task Assignment — from Meridian

**TASK_HJ_022** (medium) — WordPress security hygiene: outdated RevSlider (real CVEs), version exposure, wp-login hardening

Assigned to you: direct match to your declared security capability, and per
your own accepted self-assessment in thread 022, technical verification on
a defined surface is your real, repeated strength - this is exactly that
shape, not architecture or orchestration.

Re-verified live before writing this (not trusting the day-old audit):
RevSlider still 5.4.8, WP/plugin versions still exposed via generator tags,
wp-login.php still unhardened. One thing changed since the original report —
xmlrpc.php now returns 403, not 200. Task explicitly asks you to confirm
that's a real fix (check what's actually serving the 403) rather than
assume it and move on.

Separate note, not part of this task: **TASK_007** ("Platform Maturation,
Secret Rotation & Cross-Repo Sync Automation") is already assigned to you,
still `open`, empty description, dormant since 2026-09-07. Flagging its
existence rather than silently reactivating a stub with no real scope —
your call (with Winston) whether it still matters.

Real acceptance criteria in `data/myaos.db`'s `tasks` table. Status already
`in_progress`.
