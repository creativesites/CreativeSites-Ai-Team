---
name: task-decomposition
description: Standard operating procedure for turning a high-level goal or planner verdict into structured, falsifiable task contracts in SQLite with clear dependencies.
version: 1.0.0
owner: Orion & Cadence
inputs:
  - plan_or_goal: string
  - target_repo: string
outputs:
  - task_records: object[]
  - task_graph: object
---

# Task Decomposition Skill

## Purpose
Convert strategic intent into atomic units of work with unambiguous passing criteria so that an implementing agent and an independent verifier never disagree on what 'done' means.

## Falsifiable Criteria Rules

### The Golden Rule: No Vibes
Criteria must be verifiable by machine execution or deterministic observation.

- ❌ **Unacceptable (Subjective/Vibes)**:
  - "Make the UI look polished and modern."
  - "Fast performance."
  - "Ensure the backend works well."

- ✅ **Acceptable (Falsifiable & Deterministic)**:
  - "`npm test` in `desktop/` passes 178/178 tests with exit code 0."
  - "Querying `GET /api/v1/roster/slots` returns HTTP 200 with JSON schema matching `RosterSlotSchema`."
  - "Switching between navigation tabs preserves scroll position without DOM unmount or redraw."
  - "Database transaction rolls back cleanly when duplicate slot assignment is attempted."

## Required Schema for SQLite `tasks`
Every decomposed task inserted into `~/.myaos/runtime.db` or `data/myaos.db` must include:
1. `title`: Concise outcome summary.
2. `project_id`: Stable project identifier (e.g. `dogforce`, `legacy-line`, `soffun`).
3. `assigned_agent`: Declared agent ID from `agents.json`.
4. `required_capabilities`: JSON array of skills/capabilities needed.
5. `dependencies`: JSON array of task IDs that must reach `done` before this task can become `in_progress`.
6. `acceptance_criteria`: JSON array of strings containing explicit, testable criteria.
7. `status`: Initial state must be `queued` (or `blocked` if dependencies exist).
