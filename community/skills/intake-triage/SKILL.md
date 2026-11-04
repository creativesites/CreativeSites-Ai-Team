---
name: intake-triage
description: Standard operating procedure for evaluating incoming user requests or jobs and routing them to Tier 1 (Direct Execution), Tier 2 (Multi-Agent Modular Task), or Tier 3 (Council of Planners).
version: 1.0.0
owner: The Orchestrator
triggers: [triage, new request, intake, duplicate, route, classify]
workflows: []
roles: [orchestrator, lead]
inputs:
  - user_request: string
  - project_context: string
outputs:
  - route: "tier_1_direct | tier_2_modular | tier_3_council"
  - rationale: string
  - assigned_roles: string[]
  - target_project: string
---

# Intake Triage Skill

## Purpose
Ensure no agent acts as an isolated 'lone wolf' on complex tasks, and ensure trivial fixes do not waste time convening heavy council sessions. Every incoming request must be classified into one of three tiers before code is authored.

## Triage Decision Matrix

### 1. Tier 1: Direct Execution (Quick Path)
- **Criteria**:
  - Scoped to 1–2 files.
  - Estimated effort < 1 hour.
  - Low ambiguity, reversible change.
  - Bug fix, localized CSS/layout tweak, simple script update.
- **Workflow**:
  1. Implementing agent executes changes directly.
  2. Authors un-mocked regression test.
  3. Hands off to Independent Verifier (`Kael` or `Antigravity`).
  4. Upon verification pass, commits atomically.

### 2. Tier 2: Multi-Agent Modular Feature
- **Criteria**:
  - Affects multiple components or repositories (e.g. Odoo backend + React frontend).
  - Clear user outcome, low strategic ambiguity.
  - Requires 2 or more specialized domain agents (e.g. Sol for backend, Lyra for mobile, Orion for UI).
- **Workflow**:
  1. Orchestrator opens or updates a thread in `community/threads/`.
  2. Decomposes work into SQLite `tasks` with falsifiable acceptance criteria JSON.
  3. Dispatches subtasks to domain agents.
  4. Each agent implements, tests, and requests Kael's verification.

### 3. Tier 3: Council of Planners (Strategic Bet / High Ruin Risk)
- **Criteria**:
  - High ambiguity in user outcome or product direction.
  - Brand new client onboarding (e.g. **The Legacy Line**, **SOFFUN**).
  - Significant architectural paradigm shift or database schema overhaul.
  - High ruin risk (data loss, security boundary changes, irreversible production impact).
- **Workflow**:
  1. Convene Council of Planners via `planner-brief`.
  2. 4–7 seated advisors deliberate over 3 rounds with explicit options scoring.
  3. Output a stamped **Verdict Sheet** with Kill Criteria and Task Blueprint.
  4. One-click transition (`Plan → Build`) inserts tasks into `~/.myaos/runtime.db`.

## Verification Gate
- Did this triage prevent an unverified lone-wolf implementation?
- Is the routing rationale durably recorded in `threads/` or `task_events`?
