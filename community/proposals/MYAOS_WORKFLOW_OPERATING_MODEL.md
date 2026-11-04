# MyaOS workflow operating model

**Status:** Proposed target; not yet implemented  
**Owner:** Winston / MyaOS team  
**Prepared:** 2026-11-03

**Target-version note:** This review first audited the current `main` branch's v1 `desktop/` and `src/` paths. Cadence's v2 audit/spec are on `claude/quirky-jennings-dd80cd` (`21be454`, `8891f28`), not in `main` as of this review. V2 is a credible adoption candidate, but the team must choose one implementation target before runtime work proceeds. See the branch-aware review in thread 041 and the adoption gate in the implementation plan.

## Outcome

A request made in any supported entry point becomes one traceable unit of work. The system understands the project and intended outcome, chooses an appropriate planning depth, assigns capable agents, preserves communication and decisions, verifies the result with evidence, and updates project/OKR status from that evidence. Human attention is reserved for decisions that genuinely require it.

The same workflow should support a feature, page, application, design artifact, bug, or a request to inspect an existing project. Design approval is a meaningful product gate: an approved artifact and its version become implementation input, with an explicit link from the build task to the artifact.

## What exists today

The desktop has multiple non-equivalent intake routes: Work Mode creates a local UI card; Intent Bar creates a SQLite task but does not dispatch; Project Board creates a task and requires a separate dispatch; Jules Mission Flow stores a mission plan/message without creating the corresponding durable task. They do not yet converge on one lifecycle.

The Node runtime contains useful operational pieces such as task/event/inbox handling and a verifier, but these are not the same store or lifecycle as the desktop Tauri SQLite app. Desktop threads do not consistently carry project/task links or wake a recipient. Stand-ups can be read and digested, but no daily scheduler or agent-update collection flow was found. Work Mode routines/skills shown in the UI are mock/local behavior. Planner prompts and roster declarations exist, but planner routing and actual runtime availability are not uniformly connected. Current UI verification must not claim a pass based solely on transcript completion; the audit found a Jules/Kael path that records a pass without command evidence.

These findings are documented in [`../threads/041_myaos_workflow_from_scratch.md`](../threads/041_myaos_workflow_from_scratch.md). Treat code and observed state as authoritative over aspirational README descriptions.

## Target lifecycle

```text
Request (chat, project, board, design, existing app)
  → normalize and link context
  → triage (quick path or planner review)
  → plan + acceptance criteria + relevant skills
  → persist task, owner, sequence and dependencies
  → execute with durable handoffs and shared thread
  → independent evidence-based verification
  → fix loop or verified completion
  → update project, OKR evidence, artifact and stand-up
```

Every surface should create or reopen the same durable task record. A conversation is context; it is not a substitute for that record. The record should hold a stable ID, source/session, project/repository, outcome, scope/non-goals, acceptance criteria, planning decision, assigned roles, dependencies, status, artifact versions, handoff references, verification evidence, and optional OKR key result. Preserve links between related design, implementation, and verification tasks.

The durable record is accessed through one versioned service/API contract with one writer authority per deployment. The storage engine and process topology are an ADR decision, not settled here. SQLite is a likely local persistence option; the checked-in `data/myaos.db` is not automatically the canonical database. Evaluate managed app-data SQLite first for a single-user desktop, while treating the repository DB as a possible development fixture or migration source. Do not dual-write between stores. If multiple runtimes need to mutate state, route them through the same service or another explicitly serialized writer boundary.

### State and ownership contract

Use separate task progress and dispatch delivery states so “assigned” cannot imply that an agent received work:

| Task state | Meaning |
|---|---|
| `intake` | Request captured; duplicate/context check pending. |
| `triage` | Outcome, scope, planning route and project context being resolved. |
| `planned` | Acceptance criteria and execution sequence are recorded. |
| `queued` | Ready for work, but no runtime receipt confirms a worker has started. |
| `in_progress` | A runtime/agent acknowledged the task and execution is observed. |
| `in_review` | Implementer reports completion; independent verification is pending. |
| `blocked` | A specific external dependency or human decision prevents progress. |
| `done` | Required acceptance criteria have independent passing evidence. |
| `cancelled` | Work was explicitly cancelled, with reason retained. |

Dispatch delivery has its own states: `not_requested`, `pending`, `delivered`, `acknowledged`, `failed`, and `expired`. Retries use an idempotency key and preserve attempt history. A failed wake leaves the task queued and actionable. Terminal state changes retain actor, timestamp, reason, and source evidence.

Task IDs must be collision-resistant and stable across entry points. Intake retries need an idempotency key so a double click, timeout, or alternate surface does not create duplicate work. Plans, missions/sessions, artifacts and versions, threads, handoffs, approvals, and verification runs should link by stable IDs to the task; use typed child/link records where appropriate rather than turning the task row into a large unstructured blob. Existing optional project/KR/task links should be populated where known.

### 1. Intake and context

The orchestrator captures the request, identifies whether it is new work or a continuation, checks for duplicates, and loads project facts, current tasks, applicable decisions, and relevant skills. It links a project/repository and source session. It may suggest an OKR link but must leave it unset when no evidence supports one. If the request is to view an existing UI, first capture the project baseline and current rendered state as an artifact before proposing changes.

### 2. Triage and planning depth

Use a quick plan for bounded work with a clear outcome, one project/repository, low impact, reversible changes, and testable acceptance criteria. The orchestrator still records scope, owner, skills, and verification plan.

Require planner input when one or more conditions apply: material ambiguity in the user outcome; multiple projects or agent specialties; cross-cutting architecture; security, privacy, data migration, reliability, or release risk; a strategic product/OKR choice; competing approaches with durable cost; or a repeated execution/verification failure. The orchestrator records why it selected the route. Routine work does not need a council meeting.

Before dispatch, confirm the planner is actually registered for the relevant team/project, reachable through a supported runtime, and in scope. Roster presence alone is not availability. If unavailable, use the orchestrator’s documented fallback and mark planner review as unavailable; never label a plan “council reviewed” without its contribution.

### 3. Planner packet and synthesis

Planner input is structured and evidence-backed. Each planner returns:

- task/project and relevant OKR; user problem and desired outcome
- current-state evidence with source and freshness; assumptions called out
- scope, non-goals, options, trade-offs, recommendation, and confidence
- dependencies, risks, rollback/recovery notes, and unresolved human decisions
- falsifiable acceptance criteria and verification strategy
- suggested skills, roles, and sequence

The orchestration result should at minimum persist this contract (exact schema and version belong in the ADR/API design):

```json
{
  "route": "quick | planner | council",
  "reason": "explicit trigger or quick-path rationale",
  "planner_consulted": false,
  "planner_contributions": [],
  "evidence": [],
  "outcome": "user-visible result",
  "scope": [],
  "non_goals": [],
  "acceptance_criteria": [],
  "dependencies": [],
  "risks": [],
  "skills": [],
  "roles_and_sequence": [],
  "verification_strategy": [],
  "open_decisions": [],
  "confidence": "low | medium | high"
}
```

The orchestrator must distinguish “triaged by orchestrator” from “reviewed by planner.” A planner contribution includes identity, runtime receipt, response reference, time, and applicable scope; absent contributions remain absent.

For product/UX and engineering reviews, retain both perspectives and show agreement, disagreement, and the synthesizer’s resolution. Do not manufacture consensus. Keep the result as a versioned plan attached to the task.

### 4. Assignment and execution

Choose an implementer by required capabilities, project scope, availability evidence, and workload. Assign discrete work with acceptance criteria and relevant skill references. Each handoff contains task ID, goal, files/artifacts, evidence already collected, decisions, known limits, next action, and requested response. Store it durably and notify/wake through a real adapter. If notification fails, keep the task visible as assigned-but-not-acknowledged and surface that state.

Use a shared task thread for decisions and cross-agent coordination, not as the only state store. Link messages to project/task and distinguish a question, decision, handoff, blocker, and status update. The recipient should be able to recover context from the task and handoff without replaying an entire conversation.

### 5. Skills

Skills are versioned operating procedures, not UI toggles or claims about agent memory. Each skill document defines: stable ID and owner; trigger; required inputs and context; ordered steps; tools/capabilities; output contract; safety/escalation boundary; and completion evidence. The task records which skill version was selected. Agents receive only relevant skills plus the short team onboarding instructions. The initial catalog and skill contract are in [`../skills/README.md`](../skills/README.md); it is not runtime-loaded yet.

Initial skill set: intake triage; project-context and fact gathering; planner packet; task decomposition and acceptance criteria; design artifact creation/iteration; implementation; durable handoff; independent verification; release safety; OKR evidence update; daily stand-up; and failure recovery. Build discovery/loading before claiming that skills execute automatically.

### 6. Design approval

Designs are first-class artifacts with stable IDs and version history, linked to project and originating task/session. An artifact records prompt/brief, target viewport, preview, iteration notes, status, and approval identity/time. “Approved” pins a version and creates or unblocks implementation work with explicit references to the approved artifact and its constraints. Revision after approval creates a new version and invalidates the prior approval for implementation unless the user re-approves. Existing-project capture records its source and limits; a generated preview is not evidence that the product code has changed.

### 7. Verification and recovery

The implementer cannot be the sole verifier. The verifier runs the acceptance checks and records exact commands, exit codes, concise results, commit/diff or artifact references, and criterion-by-criterion disposition. A criterion passes only with evidence appropriate to it; conversation text is not evidence that a command ran. A failure reopens implementation with the failed criterion and evidence attached. A blocked task states the missing decision, access, or external dependency and continues independent work where possible.

Completion updates project and OKR progress only from linked, verified outcomes. A task can be technically complete while an OKR link remains absent or its strategic contribution remains unconfirmed.

### 8. Communication and daily stand-up

Threads are linked conversations, notices are broadcast announcements, and handoffs are actionable task transfers. They have different purposes. Agent instructions explain when to use each and the UI should make the correct action easy. A sent message is not a delivered/acknowledged handoff.

A daily stand-up is generated from the previous period’s task events, handoffs, blockers, decisions, and verification evidence. Available agents contribute structured updates or the system marks the update missing; it never fabricates activity. The report includes shipped/verified outcomes, active work and next action, blockers/owners, aging tasks, cross-project dependencies, OKR movement with evidence, and failed/missed agent check-ins. Schedule using the actual runtime’s clock and persist the report. If no scheduler is available, show a clear unscheduled status rather than imply recurrence.

## Human intervention policy

Proceed autonomously on reversible, in-scope work with clear criteria. Ask Winston for a product choice that changes scope or user experience, missing credentials/access, a conflicting strategic priority, destructive data operation, production release, or external financial/legal commitment. Bundle related questions and include a recommendation plus the consequence of each answer. Routine assignment, planner routing, ordinary implementation and verification should not require repeated approval.

## Operating principles

1. One canonical task lifecycle across entry points; one authoritative state store per deployment.
2. Declared capability, runtime availability, assignment, delivery, and verified completion are separate states.
3. Preserve provenance for decisions, artifacts, planner contributions, handoffs, and verification.
4. Make planner use selective, justified, and reproducible.
5. Link project management and OKRs with evidence rather than labels alone.
6. Optimize for recoverability: a newly spawned agent can resume from the task packet and relevant skills.
7. Keep user approval at genuine decision boundaries and make routine flow autonomous.

