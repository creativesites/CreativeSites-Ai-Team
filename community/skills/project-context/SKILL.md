---
name: project-context
description: Gather and record what is true about an existing project before changing it: sources inspected, current state, freshness, assumptions and unknowns.
version: 1.0.0
owner: The Orchestrator
triggers:
  - existing
  - legacy
  - refactor
  - codebase
  - how does
  - current behaviour
  - context
workflows: [feature]
roles: [planner, builder, lead]
inputs:
  - task_id: string
  - project_path: string
  - question: string
outputs:
  - context_summary: string
  - sources: string[]
  - assumptions: string[]
  - unknowns: string[]
---

# Project Context Skill

## Purpose
Stop agents from acting on memory or guesses. Work that depends on existing code, data, decisions or product behaviour starts from inspected evidence with a stated age.

## Activation conditions
- The task changes or depends on something that already exists.
- The brief refers to behaviour, data or decisions you have not read.
- You are picking up work after a gap or a handoff.

## Required inputs
- The task and its project or repository.
- The question the context must answer (one sentence).

## Instructions
1. Name the question first. Context gathering without a question wastes tokens.
2. Inspect the real files, tests, task state and recent commits. Prefer reading to remembering.
3. Record each source with a path or id and when it was last changed.
4. Separate what you observed from what you infer. Mark every inference as an assumption.
5. List unknowns that would change the plan, and who or what could resolve them.
6. Stop when the question is answered. Do not map the whole repository.

## Available tools
- job_get and task state for the brief and criteria.
- Read, search and git history in the task workspace.
- skill_read for related procedures; evidence_add to attach the summary.

## Expected output
- Short summary answering the question.
- Sources inspected, each with freshness.
- Assumptions and unknowns, each with an owner or next step.

## Validation criteria
- Every claim cites a source you actually opened.
- Nothing in the summary is stated as fact without evidence.
- A reader can tell what is stale or unverified.

## Escalation conditions
- Sources conflict and the choice changes scope: raise a blocker with both sources.
- Required access is missing: raise a blocker naming the access.
- The context shows the task is already done or duplicated: report it before doing anything else.
