---
name: implementation
description: Implement an accepted task in the smallest reviewable change, address each acceptance criterion, and hand off evidence for independent verification.
version: 1.0.0
owner: The Orchestrator
triggers:
  - implement
  - fix
  - build
  - bug
  - add
  - update
  - change
workflows: [quick, feature, incident]
roles: [builder]
inputs:
  - task_id: string
  - acceptance_criteria: string[]
  - workspace: string
outputs:
  - change_summary: string
  - files: string[]
  - criteria_addressed: string[]
  - risks: string[]
---

# Implementation Skill

## Purpose
Turn an accepted task into working, minimal, reviewable change. The implementer produces evidence; an independent verifier decides whether the task is done.

## Activation conditions
- A task is assigned to you and its dependencies are done.
- A failed verification sends the task back for rework.

## Required inputs
- Task, acceptance criteria and check command.
- A clean workspace or worktree.
- Project context for the area you will change.

## Instructions
1. Claim the task, then read the criteria and the check command before editing.
2. Make the smallest change that satisfies each criterion. Note anything you deliberately leave out.
3. Follow the conventions already in the code; do not reformat unrelated files.
4. Run the check command and the relevant tests yourself and keep the real output.
5. Commit in small, conventional commits.
6. Report what changed per criterion, the commands you ran with exit status, and the remaining risks.

## Available tools
- task_claim, task_report, evidence_add (test, command, diff, commit).
- Shell, editor and git in the task workspace.
- blocker_raise when you cannot proceed.

## Expected output
- Change summary mapped to each criterion.
- Files changed and commit ids.
- Commands run with exit status.
- Known risks and follow-ups.

## Validation criteria
- Every criterion is addressed or explicitly listed as not addressed.
- Your evidence is DECLARED or ATTESTED, never claimed as verified.
- The diff contains nothing outside the task scope.

## Escalation conditions
- The criteria cannot be met as written: raise a blocker, do not redefine them.
- The change touches production, credentials or data integrity: follow release-safety first.
- Two failed attempts at the same step: stop and follow failure-recovery.
