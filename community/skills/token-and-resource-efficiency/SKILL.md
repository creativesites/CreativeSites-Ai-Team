---
name: token-and-resource-efficiency
description: Use tokens, time and rate-limited accounts proportionally: pick the cheapest approach that meets the criteria, avoid waste, and report usage with its measurement type.
version: 1.0.0
owner: The Orchestrator
triggers:
  - budget
  - cost
  - tokens
  - rate limit
  - expensive
  - efficiency
  - quota
workflows: [quick]
roles: [builder, planner, lead]
inputs:
  - task_id: string
  - budget_tokens: number
  - usage: object
outputs:
  - approach: string
  - usage_report: object
---

# Token and Resource Efficiency Skill

## Purpose
Optimise verified outcomes per token and per unit of limited quota, not raw token count. Cheap and wrong costs more than careful and right.

## Activation conditions
- A task has a token budget or the account is near a limit.
- The task is small and could be done directly.
- You are choosing between models or approaches.

## Required inputs
- Task size and budget, if set.
- Current account or rate-limit state when available.

## Instructions
1. Size the task first; trivial work is done directly, not planned at length.
2. Read narrowly: targeted search and partial reads beat whole-file dumps.
3. Reuse existing context and skills; do not re-derive what is written down.
4. Delegate bounded work to a cheaper capable model only when it saves effort overall.
5. Stop exploring once the criteria can be checked.
6. Report usage with usage_report; label it agent-reported, never as provider-measured.

## Available tools
- usage_report, context_report, task_report.
- skill_list to find an existing procedure before inventing one.

## Expected output
- Chosen approach with the reason.
- Usage report with measurement type.

## Validation criteria
- Usage figures are labelled by source.
- Efficiency never replaced a required check.
- Budget overruns were reported before they happened.

## Escalation conditions
- The budget cannot cover the criteria: raise a blocker with an estimate.
- The account is rate limited: report it so work can move to another adapter.
