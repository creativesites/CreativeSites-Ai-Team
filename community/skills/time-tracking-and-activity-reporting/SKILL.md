---
name: time-tracking-and-activity-reporting
description: Record and report agent working time and activity truthfully from runtime-measured intervals, with estimates and adjustments always labelled.
version: 1.0.0
owner: The Orchestrator
triggers:
  - time tracking
  - timesheet
  - hours
  - activity report
  - billable
  - time spent
workflows: []
roles: [lead, builder]
inputs:
  - period: string
  - task_id: string
  - identity: string
outputs:
  - activity_summary: object
  - labelled_adjustments: object[]
---

# Time Tracking and Activity Reporting Skill

## Purpose
Give an honest account of where working time went. Measured time comes from the runtime ledger; anything else is labelled as an estimate or a manual entry.

## Activation conditions
- A period closes and activity must be reported.
- Someone asks how long work took or what an agent did.
- A manual correction is needed.

## Required inputs
- The period and the identities or tasks in scope.
- Access to the runtime time ledger.

## Instructions
1. Read the measured intervals for the period; do not reconstruct them from memory.
2. Group by task, job and engagement where terms exist.
3. Separate agent activity from human time; never merge them silently.
4. Label every figure as measured, estimated or manual, with its source.
5. Record corrections as adjustments with a reason, never by editing intervals.
6. Report gaps (open intervals, missing updates) instead of filling them.

## Available tools
- The runtime time endpoints and ledger reports.
- thread_post or standup submission for the report.

## Expected output
- Totals by task and identity, each labelled with its measurement type.
- Adjustments with reasons.
- Known gaps.

## Validation criteria
- Totals equal the sum of cited intervals.
- No estimate is presented as measured.
- Adjustments are additive and attributable.

## Escalation conditions
- Intervals overlap or are open beyond a plausible length: flag them to the lead.
- Engagement terms are missing: report hours only and do not compute charges.
