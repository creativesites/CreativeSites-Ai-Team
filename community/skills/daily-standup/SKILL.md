---
name: daily-standup
description: Automated daily standup aggregation and publishing procedure, querying events and commits from the last 24h, compiling attendance, and recording to SQLite.
version: 1.0.0
owner: The Orchestrator
triggers: [standup, stand-up, daily report, blockers]
workflows: []
roles: [lead]
inputs:
  - period_hours: 24
outputs:
  - standup_markdown_file: string
  - standup_db_record: object
---

# Daily Standup Skill

## Purpose
Ensure transparent, continuous, and automated organization-wide visibility into completed work, active blockers, and daily commitments—running automatically every day at 08:00 CAT / 06:00 UTC without relying on human memory.

## Execution Sequence

### Step 1: Pre-Flight Check (First Boot or Scheduled Cron)
Check if `community/daily_standups/YYYY-MM-DD_standup.md` exists for today's date in local time (CAT).
- If already present and ratified: skip execution.
- If missing: invoke `scripts/generate_daily_standup.mjs`.

### Step 2: Telemetry Gathering
1. **Git History**: Scan `git log --since="24 hours ago" --oneline` across active repositories (`CreativeSites-Ai-Team`, `DogFrce Security Services`, etc.).
2. **Database Events**: Scan `~/.myaos/runtime.db` `events` table for recent state changes and completions.
3. **Task Ledger**: Scan `tasks` for items transitioned to `done` (completed) and `blocked` (issues).
4. **Agent Presence**: Check active sockets and sessions against `agents.json`. Mark silent agents explicitly as `idle` or `absent`.

### Step 3: Markdown Publication & Record Keeping
1. Format and write `community/daily_standups/YYYY-MM-DD_standup.md`.
2. Insert a row into the SQLite `standups` table with `standup_date`, `facilitator`, `present_identities`, `absent_identities`, and `content`.
3. Post an announcement to the desktop Notice Board.

## Verification Gate
- File exists at `community/daily_standups/YYYY-MM-DD_standup.md`.
- Exit code 0 from `scripts/generate_daily_standup.mjs`.
- Standup table in `runtime.db` contains a matching row for today's date.
