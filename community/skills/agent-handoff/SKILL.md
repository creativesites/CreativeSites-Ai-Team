---
name: agent-handoff
description: Transfer work to another agent or runtime with enough context that the receiver can continue without asking: goal, decisions, evidence, limits and one next action.
version: 1.0.0
owner: The Orchestrator
triggers:
  - handoff
  - hand off
  - transfer
  - takeover
  - take over
  - resume
  - pick up
workflows: []
roles: [builder, planner, lead]
inputs:
  - task_id: string
  - receiver: string
  - state: string
outputs:
  - handoff_packet: object
  - next_action: string
---

# Agent Handoff Skill

## Purpose
Make a change of owner lossless. The receiver should never need the sender's chat history to know where the work stands.

## Activation conditions
- You are stopping before the task is done (limit, rate limit, reassignment).
- A task moves to a different agent, adapter or role.
- You are the receiver and no packet exists yet.

## Required inputs
- Task id and goal.
- What is done, in progress and untouched.
- The receiver, if known.

## Instructions
1. State the goal and the task id first.
2. List decisions already made and why, so they are not reopened.
3. List evidence with commands, exit status and commit ids; mark each DECLARED or VERIFIED.
4. Describe the workspace state: branch, uncommitted changes, running processes.
5. List limits: what must not be touched, open blockers, deadlines.
6. End with exactly one next action the receiver can start immediately.
7. Post the packet in the job thread and attach it as evidence.

## Available tools
- thread_post, evidence_add, task_report.
- git status and diff to describe the workspace honestly.

## Expected output
- Packet with goal, task id, context, decisions, evidence, limits.
- One explicit next action.

## Validation criteria
- A fresh agent could act on the packet alone.
- No claim in the packet is unsupported by a command or file.
- Uncommitted work is committed or clearly described.

## Escalation conditions
- The receiver is unavailable or rate limited: raise it so the lead can reassign.
- The workspace cannot be left in a safe state: raise a blocker before leaving.
