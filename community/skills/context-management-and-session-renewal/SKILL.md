---
name: context-management-and-session-renewal
description: Keep a long-running session effective: track context use, checkpoint state, and renew the session with a compact capsule before cost or quality degrades.
version: 1.0.0
owner: The Orchestrator
triggers:
  - context window
  - session renewal
  - token limit
  - long running
  - context full
  - renew session
  - checkpoint
workflows: []
roles: [builder, planner, lead]
inputs:
  - session_id: string
  - used_tokens: number
  - window_tokens: number
outputs:
  - checkpoint: string
  - renewal_decision: string
---

# Context Management and Session Renewal Skill

## Purpose
Long sessions get slower, costlier and less accurate. Renew deliberately, carrying forward only what the next session needs.

## Activation conditions
- Context use passes about two thirds of the window.
- You notice repeated re-reading or lost details.
- The runtime asks for a renewal.

## Required inputs
- Current context usage if your client shows it.
- The task state and open questions.

## Instructions
1. Report usage with context_report whenever you know it.
2. Before renewal, write a checkpoint: done, active focus, next step, in the STATE format your prompt describes.
3. Commit or stash work so the workspace is consistent.
4. Capture decisions and evidence ids; leave out transcripts and exploration dead ends.
5. Let the runtime renew the session, then start from the capsule and re-read only the files you need.
6. After renewal, confirm the next action matches the checkpoint.

## Available tools
- context_report, task_report, evidence_add.
- The checkpoint directive in the session prompt.

## Expected output
- Checkpoint with done, active and next.
- Renewal decision and reason.

## Validation criteria
- The capsule is smaller than the context it replaces.
- Nothing needed to continue is only in the old transcript.
- Work resumed from the capsule without repeating finished steps.

## Escalation conditions
- The renewal loses unrecorded work: commit or record it first.
- Repeated renewals on one task: raise a blocker, the task is probably too large.
