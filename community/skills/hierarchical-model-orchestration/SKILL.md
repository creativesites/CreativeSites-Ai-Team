---
name: hierarchical-model-orchestration
description: >
  Hierarchical, cost-aware AI workforce orchestration. Use when executing
  substantial software engineering, research, planning, documentation,
  testing, or multi-step project tasks. A high-capability lead model owns
  planning, decomposition, delegation, supervision, escalation and final
  acceptance. Lower-cost subagents execute bounded work, with specialist
  models used when complexity requires them. Optimizes verified outcomes
  per token and dollar, not merely the lowest token consumption.
version: 1.0.0
owner: unassigned
triggers: [delegate, subagent, multi-step, orchestration, cheaper model]
workflows: []
roles: [lead]
inputs:
  - assignment: string            # user request or approved implementation plan
  - target_repo: string
  - available_models: object[]    # registry of models with capability, cost, tool access
  - budgets: object               # optional task/agent/job/project limits
outputs:
  - task_graph: object            # tasks with id, scope, deliverables, criteria, deps, tier, verification
  - task_states: object[]         # PENDING → ASSIGNED → RUNNING → REVIEW → VERIFIED → DONE
  - final_report: object          # outcome, implementation, verification, workforce, efficiency, outstanding, next steps
related_skills:
  - intake-triage
  - task-decomposition
  - independent-verification
---

# Hierarchical Model Orchestration

> **Status:** Catalog entry. No MyaOS runtime loader injects this skill yet; agents must read it explicitly. See [`../README.md`](../README.md).

## 1. Mission

Operate as the senior executive, technical lead and orchestration authority for the requested assignment. You own the outcome. You are not expected to personally perform every operation.

Primary responsibilities:

1. Understand the user's desired outcome.
2. Inspect relevant context and existing systems.
3. Develop an execution strategy.
4. Decompose the work into independently executable tasks.
5. Assign each task to the least expensive model capable of completing it reliably.
6. Supervise execution and resolve dependencies.
7. Escalate difficult tasks to stronger models.
8. Independently verify completed work.
9. Deliver the finished outcome with evidence.

**Guiding principle:** keep high-capability intelligence in charge of decisions; use lower-cost intelligence for well-defined execution. Never sacrifice correctness, security, maintainability or completeness merely to reduce token expenditure.

## 2. Model hierarchy

Default hierarchy when these models are available. Keep this in a configurable model registry rather than hardcoding it permanently.

### Tier 1 — Executive Orchestrator: Opus 5.5

The lead agent. Retains responsibility for:

- Understanding ambiguous requirements.
- Architectural decisions.
- Planning and task decomposition.
- Identifying risks and dependencies.
- Assigning and supervising subagents.
- Resolving disagreements and implementation conflicts.
- Reviewing critical changes.
- Making escalation decisions.
- Final acceptance and delivery.

Do not spend expensive reasoning tokens on routine, clearly specified changes a lower tier can handle. Use Opus directly for implementation only when:

- The work requires nuanced architectural judgment.
- A task has resisted lower-tier attempts.
- The change has substantial security or data-integrity implications.
- A difficult cross-system integration requires direct reasoning.
- No suitable specialist is available.

### Tier 2 — Specialist: Sonnet 5.5

For tasks needing stronger reasoning, implementation judgment or contextual understanding than a routine execution agent:

- Complex feature implementation.
- Multi-file changes with non-trivial dependencies.
- Difficult bug investigation.
- Architecture-sensitive implementation.
- API and integration design.
- Database schema and migration work.
- Complex test design.
- Code review and debugging.
- Reviewing Haiku work when independent technical judgment is required.

Sonnet may supervise a small group of Haiku workers when a workstream is sufficiently complex and independently scoped.

### Tier 3 — Execution Workforce: Haiku 5.5

Default execution model for well-defined, bounded tasks:

- Implementing small, specified functions.
- Updating UI components against an established design.
- Writing unit and integration tests.
- Documentation and changelogs.
- Type fixes and straightforward lint issues.
- Routine refactoring.
- Data extraction and structured analysis.
- Repository exploration with a specific question.
- Repetitive file transformations.
- Updating configuration and metadata.
- Running predefined verification procedures.
- Summarizing logs, test results and implementation evidence.

Do not assign Haiku vague architectural responsibilities or tasks requiring it to independently determine product direction.

### Tier 4 — Other available models

Assess actual capabilities, cost, latency and tool access. Do not assume a model belongs in a tier because of its name.

## 3. Mandatory execution workflow

### Phase A — Understand the assignment

1. Read the request and any supplied implementation plan.
2. Identify the expected final state.
3. Inspect relevant repository structure, documentation and existing implementation.
4. Identify constraints, conventions, technologies and acceptance criteria.
5. Identify what is already implemented.
6. Avoid duplicating existing work.

If the user supplies an approved plan, preserve its intent; do not silently redesign it. If information is missing, investigate before asking the user.

### Phase B — Decide the execution strategy

Classify the assignment:

| Class | Meaning |
|---|---|
| QUICK | Small, straightforward change. |
| STANDARD | Several related implementation steps. |
| COMPLEX | Multiple workstreams with dependencies. |
| STRATEGIC | Architecture, major system development or broad project execution. |
| CRITICAL | Security, production data, irreversible operations or high-consequence changes. |

Choose the simplest viable strategy. Not every task needs a multi-agent workforce. Execute QUICK tasks directly; build a structured task graph for substantial ones.

### Phase C — Decompose into tasks

Each task has: a unique ID, a clear objective, defined scope, expected deliverables, acceptance criteria (see [`task-decomposition`](../task-decomposition/SKILL.md) — no vibes), relevant files/modules/systems, dependencies, required tools and permissions, an assigned model tier, and a verification method.

Keep tasks small enough that an agent need not reconstruct the whole project. Prefer explicit file or module ownership. Do not assign multiple agents to edit the same files concurrently.

### Phase D — Delegate intelligently

Assign the cheapest *capable* model.

| Task characteristic | Preferred model |
|---|---|
| Routine, deterministic, clearly specified | Haiku |
| Small isolated code changes | Haiku |
| Tests against clear requirements | Haiku |
| Documentation and repetitive changes | Haiku |
| Moderate multi-file implementation | Sonnet |
| Difficult debugging | Sonnet |
| Architecture-sensitive implementation | Sonnet or Opus |
| Ambiguous requirements and planning | Opus |
| Security-critical judgment | Opus |
| Final synthesis and acceptance | Opus |

In Claude Code, explicitly set the model for each subagent where supported; do not leave every subagent on inheritance when the purpose is cost optimization. If the interface cannot select a model, report the limitation and use the best available alternative.

### Phase E — Parallelize only independent work

Good candidates: backend implementation alongside independent frontend investigation; tests alongside documentation; separate modules with clear ownership; independent security and performance assessments; independent research into alternatives.

Keep dependent work sequential (e.g. database contract → API implementation → frontend integration). Do not spawn multiple agents on the same problem unless independent review or competing approaches are explicitly valuable.

### Phase F — Manage execution

For each delegated task:

1. Provide a self-contained assignment.
2. Give relevant context and acceptance criteria.
3. Identify the authoritative source of truth.
4. Specify file ownership and boundaries.
5. Require the agent to run relevant tests.
6. Require a concise completion report.
7. Inspect the actual artifacts, not just the agent's claims.

Task states: `PENDING → ASSIGNED → RUNNING → REVIEW → VERIFIED → DONE`, plus `BLOCKED`, `FAILED`, `RETRYING`, `NEEDS_ESCALATION`, `NEEDS_HUMAN`.

Never mark work complete because an agent reports completion. Persist state in the system of record that owns the work (see repository `AGENTS.md`), not in chat.

### Phase G — Review and escalation

When a subagent fails:

1. Diagnose: insufficient context, unclear instructions, technical difficulty, or tool limitation.
2. Provide one targeted correction when appropriate.
3. Retry with the same model only when the problem is straightforward.
4. Escalate to Sonnet when deeper reasoning is required.
5. Escalate to Opus when architectural judgment or difficult synthesis is needed.

Do not resend the same failed task to Haiku without changing the conditions. For high-risk work use an independent reviewer that does not trust the implementer's summary (see [`independent-verification`](../independent-verification/SKILL.md)).

### Phase H — Final acceptance

The lead owns final verification. Check all requested requirements, correct implementation, automated tests, build and type checks, integration behavior, security and permission implications, migration safety, regression risk, and documentation. Use actual execution evidence. Report incomplete or unverified requirements honestly.

## 4. Cost-aware delegation policy

Objective: maximize **verified work delivered per dollar and per unit of elapsed time** — not minimize tokens at any cost.

Total task cost includes initial execution, repeated context, prompt-cache writes and reads, tool calls, output tokens, failed attempts, rework, reviewer effort and orchestration overhead. A cheap agent needing repeated correction may cost more than a specialist.

**Before spawning an agent, ask:**

1. Is the task genuinely independent?
2. Is it sufficiently specified?
3. Is there a measurable deliverable?
4. Can the agent finish without repeatedly asking the lead questions?
5. Will delegation reduce the lead's context burden?
6. Is the expected quality gain worth the extra tokens?

If mostly no, execute directly or improve the task definition first.

**Context minimization.** Send only the objective, relevant requirements, architecture/conventions, relevant files and interfaces, constraints, acceptance criteria and output format. Prefer file references over pasted documents. Workers write substantial results to files/artifacts and return concise summaries; the orchestrator should not relay large implementation details between agents.

**Prompt caching.** Keep stable instructions and shared prefixes consistent, reuse stable project context, and track cache-creation and cache-read costs separately. Cached input is not free.

**Output discipline.** Reports contain: result, files changed, important decisions, tests run and outcomes, outstanding concerns, commit/artifact references. No lengthy narratives.

## 5. Concurrency and workforce sizing

Use the smallest number of agents that completes the work efficiently. Starting limits, not targets:

| Class | Subagents |
|---|---|
| Quick | 0–1 |
| Standard | 1–3 |
| Complex | 2–5 |
| Strategic | 3–6, only with genuine independent workstreams |

Weigh context duplication, shared-file conflicts, merge overhead, coordination messages, review capacity, tool and rate limits, and total token budget.

## 6. Session and context management

Do not rely on a long conversation as the only record of progress. Before the lead context becomes expensive or nears its threshold, persist: the current plan, completed tasks with evidence, outstanding work, architectural decisions, blockers and risks — then write a continuation brief and start a fresh executive session when appropriate.

The continuation brief contains: original objective, current phase, approved plan, completed work, pending tasks, dependencies, important decisions, files and commit references, acceptance criteria, outstanding risks, and next recommended actions. Do not copy the whole conversation.

Apply the same to subagents: reuse a worker session only when its context is useful; otherwise start a clean task-specific session.

## 7. Budgets and observability

When available, record per task: model and provider, agent identity, session ID, job and task IDs, input/output tokens, cached-input and cache-write tokens, reasoning tokens, tool calls, estimated or actual cost, duration, retry count, and verification outcome.

Never invent token counts. Label usage as **actual**, **estimated** or **unavailable**.

Budgets may be set per task, agent, job, project and organisation. Approaching a budget, consider: continue; delegate remaining bounded work to a cheaper model; use a specialist only for the hard part; trim context; start a fresh session with a structured handoff; or ask for approval where policy requires it.

## 8. Quality and efficiency metrics

Track cost and tokens per verified task, first-pass acceptance rate, rework rate, failed delegation rate, escalation rate, mean task completion time, total job lead time, agent utilization, human intervention rate, parallel execution benefit, reviewer effort, and defects found after acceptance.

Evaluate models per task category from an empirical record of completed tasks, not benchmark scores alone.

## 9. Communication protocol

The lead communicates with the user; subagents communicate through task reports and persistent artifacts. Do not expose the user to every internal message.

Escalate to the user only when a consequential decision is required, a task is genuinely blocked, a destructive or sensitive operation needs approval, requirements conflict, a material budget threshold is reached, or the result cannot be verified safely. Update at meaningful milestones, not after every tool call.

## 10. Security and operational safeguards

Cost optimization never overrides security. Require appropriate review for authentication and authorization, secrets and credentials, payment flows, sensitive data, production infrastructure, database migrations, destructive commands, access-control changes and security boundaries.

Use isolated worktrees or branches for parallel code changes. Do not let agents overwrite one another's work. Require human approval for irreversible, externally consequential or policy-restricted actions.

## 11. Final reporting format

- **Outcome** — what was achieved.
- **Implementation** — important changes and deliverables.
- **Verification** — tests, checks and evidence.
- **Workforce** — models and agents involved, with responsibilities.
- **Efficiency** — token usage and cost where available (actual/estimated/unavailable), plus observations.
- **Outstanding items** — anything incomplete, uncertain or requiring approval.
- **Next steps** — only genuinely useful follow-up work.

## 12. Operating principles

1. Opus owns the outcome, not every keystroke.
2. Haiku is the default worker for bounded, well-defined execution.
3. Sonnet handles work that needs greater technical reasoning.
4. Opus retains architecture, orchestration and final acceptance authority.
5. Use the cheapest capable model, not automatically the cheapest model.
6. Delegate independent work, not merely more work.
7. Keep agent prompts small and self-contained.
8. Persist substantial results outside conversations.
9. Escalate based on evidence, not model prestige.
10. Verify actual outcomes.
11. Track costs and quality together.
12. Learn from every completed assignment.

Success means delivering the right result with the least unnecessary computation, not simply spending the fewest tokens.
