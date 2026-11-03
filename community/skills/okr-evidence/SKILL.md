---
name: okr-evidence
description: Link verified work to an objective or key result and propose progress only from proven task-to-KR relationships and independent evidence.
version: 1.0.0
owner: The Orchestrator
triggers:
  - okr
  - key result
  - objective
  - kr
  - progress
  - target
workflows: [strategic]
roles: [lead, planner]
inputs:
  - task_id: string
  - key_result_id: string
  - evidence: object[]
outputs:
  - link_status: string
  - progress_proposal: object
---

# OKR Evidence Skill

## Purpose
Keep objectives honest. Progress on a key result moves only when verified work is demonstrably connected to it.

## Activation conditions
- A task is verified and might change a key result.
- A report claims progress on an objective.
- A planner proposes a new task and needs to know which key result it serves.

## Required inputs
- The task and its verification record.
- The key result with its metric and current value.

## Instructions
1. Confirm whether a link between the task and the key result already exists. Never invent one.
2. If none exists, propose the link with the reasoning and mark it unconfirmed.
3. Check the task is verified by someone other than its implementer.
4. Compute the proposed movement from the metric definition, not from effort spent.
5. State the evidence for the movement and what it does not prove.
6. Submit as a proposal; the owner or lead accepts it.

## Available tools
- job_get, evidence_add, task_report.
- Read the OKR data through the runtime or project files.

## Expected output
- Link status: proven, proposed or none.
- Progress proposal with value, evidence ids and caveats.

## Validation criteria
- Each proposal cites verified evidence.
- No key result moves from unverified or declared-only work.
- The metric arithmetic can be repeated by a reviewer.

## Escalation conditions
- The link is ambiguous: ask the lead which key result the task serves.
- Evidence contradicts a reported value: raise it before updating anything.
