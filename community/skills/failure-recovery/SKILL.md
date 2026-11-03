---
name: failure-recovery
description: Respond to a failed dispatch, implementation, verification or schedule: capture evidence, choose a safe retry or rollback, name the owner and escalate on time.
version: 1.0.0
owner: The Orchestrator
triggers:
  - fail
  - failed
  - failure
  - retry
  - rollback
  - broken
  - crash
  - outage
  - regression
  - error
workflows: [incident]
roles: [builder, lead, verifier]
inputs:
  - task_id: string
  - failure_event: string
  - attempt: number
outputs:
  - failure_evidence: object
  - recovery_action: string
  - owner: string
  - escalation: string
---

# Failure Recovery Skill

## Purpose
Fail safe and in the open. A failure is recorded with evidence, recovered with the least risky action, and escalated when the retry budget is spent.

## Activation conditions
- A command, dispatch, verification or scheduled run fails.
- A task reaches its retry limit.
- A change causes a regression.

## Required inputs
- The failing command, its output and exit status.
- The attempt count and retry limit.
- The last known good state.

## Instructions
1. Stop making further changes until you have captured the failure: command, exit status, relevant output, time.
2. Classify it: transient, environmental, defect in your change, or defect in the plan.
3. Pick the safest recovery: retry once for transient causes, fix forward for small defects, roll back when users or data are affected.
4. Never repeat the same step unchanged more than once.
5. Record what you tried and the result after each attempt.
6. Name who owns the next step and when it is due.

## Available tools
- evidence_add with the failing command and exit code.
- blocker_raise to escalate; task_report for progress.
- git revert or reset in your own worktree only.

## Expected output
- Failure evidence with exit status.
- Classification and chosen recovery.
- Owner and next action.
- Escalation status.

## Validation criteria
- The recovery restored the last known good state or a verified fix.
- Each attempt is recorded, including those that failed.
- No destructive action touched shared state without approval.

## Escalation conditions
- Retry limit reached: raise a blocker with the evidence.
- Data loss or user impact suspected: stop and notify the owner now.
- The cause is outside your access: name the access needed.
