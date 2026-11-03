---
name: release-safety
description: Gate any change that may affect production, credentials, data integrity or users: impact, required gates, rollback, and an explicit human decision where one is reserved.
version: 1.0.0
owner: The Orchestrator
triggers:
  - deploy
  - release
  - production
  - migration
  - credentials
  - rollback
  - secret
  - publish
workflows: [strategic, incident]
roles: [builder, lead, verifier]
inputs:
  - task_id: string
  - change_scope: string
  - environment: string
outputs:
  - impact_assessment: string
  - gates: string[]
  - rollback_plan: string
  - decision_required: boolean
---

# Release Safety Skill

## Purpose
Make risky changes boring. Before anything reaches users or touches shared data, the impact, the gates and the way back are written down and a human approves what is reserved to humans.

## Activation conditions
- The change deploys, migrates data, rotates or reads credentials, or alters billing or access.
- The task mentions production or an external publish.

## Required inputs
- The exact change set and target environment.
- Current test and verification state.
- Who holds the reserved decision.

## Instructions
1. Describe the impact: who and what is affected, and how badly if it goes wrong.
2. List the gates: tests, independent verification, backup, review, approval.
3. Check each gate with real evidence; an agent saying done is not a gate.
4. Write the rollback or recovery steps and test that they are possible.
5. Stage first where a staging path exists; ship the smallest unit.
6. Request the human decision for reserved actions and wait for it. Silence is not approval.

## Available tools
- evidence_add for gate results; blocker_raise to request the decision.
- Backups, dry-run and diff commands in the workspace.

## Expected output
- Impact statement.
- Gate list with pass or fail evidence.
- Rollback plan.
- Whether a human decision is required and its status.

## Validation criteria
- Every gate has evidence from a command or an independent actor.
- A rollback exists and does not depend on the failed change.
- No reserved action ran without a recorded approval.

## Escalation conditions
- Any gate fails or cannot be checked: stop and report.
- Irreversible data change or credential exposure: stop and ask the owner.
- Deployment already started and is failing: switch to failure-recovery.
