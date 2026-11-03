# MyaOS V2 — The Autonomous AI Organisation

**Unified Operating System, Workflow Architecture & Implementation Programme**

| | |
|---|---|
| Document type | Product Vision & Technical Implementation Blueprint |
| Organisation | CreativeSites AI Team |
| Platform | MyaOS Desktop V2 |
| Date | 3 November 2026 |
| Status | **Approved direction — ready for detailed planning** (owner: Winston) |
| Architecture | Local-first, cloud-ready, event-driven AI workforce |

> This is the owner-approved vision, recorded verbatim in substance. It is **not** an implementation status report and not permission to build everything in one cycle (see Appendix A). Gap analysis against the code: [`MYAOS_V2_VISION_GAP_AUDIT.md`](MYAOS_V2_VISION_GAP_AUDIT.md). Detailed programme: [`MYAOS_V2_PROGRAMME_PLAN.md`](MYAOS_V2_PROGRAMME_PLAN.md).

---

## 1. Executive Vision

### 1.1 The vision

MyaOS is evolving from an AI agent management platform into a fully integrated autonomous AI organisation: a proper company structure, leadership hierarchy, specialist departments, communication channels, operational procedures, strategic objectives and execution workflows.

The organisation should be capable of receiving an instruction from Winston, understanding what needs to be accomplished, determining the appropriate workflow, organising the necessary specialists, executing the work, coordinating collaboration, independently verifying results and presenting completed outcomes.

Winston should primarily interact with the organisation through its **Orchestrator**, rather than manually coordinating individual agents.

A request could be: an entirely new product idea; a new feature for an existing project; an improvement to an existing feature; a bug or production incident; a technical investigation; a design request; a strategic objective; a routine operational responsibility. The organisation should understand the request and initiate the appropriate process.

For substantial work, the **Planning Council** is activated. The council investigates the request, evaluates alternatives, establishes requirements and produces an actionable implementation plan. Once planning is complete, the Orchestrator coordinates execution: agents are assigned tasks, collaborate where necessary and report progress through structured workflows. The work is independently verified, reviewed and delivered.

Human involvement should be minimal, except where a consequential decision, approval, intervention or clarification is genuinely necessary.

### 1.2 Core operating principle

**One organisation. One source of truth. One connected work lifecycle.**

Planning, task management, project management, design, communications, agent execution, quality assurance, time tracking, resource consumption and strategic reporting must be connected. The system must not become a collection of independent modules that happen to share a desktop application. Every important organisational activity must have a traceable relationship to the underlying work, its responsible agents, its resources and its outcomes.

### 1.3 Desired experience

Winston opens MyaOS and tells the Orchestrator: *"Let's build a new student accommodation management platform."* The organisation should independently:

1. Understand and classify the request.
2. Determine whether it is a new project or an extension of an existing project.
3. Activate the appropriate planning specialists.
4. Investigate requirements, opportunities, risks and architecture.
5. Develop a comprehensive proposal.
6. Decompose the proposal into implementation tasks.
7. Establish dependencies and acceptance criteria.
8. Determine the appropriate agents and resources.
9. Execute tasks in parallel where possible.
10. Coordinate agent-to-agent collaboration.
11. Monitor execution, time and resource consumption.
12. Verify and review completed work.
13. Escalate important decisions when necessary.
14. Deliver the completed outcome.
15. Update project records, OKRs, documentation and organisational knowledge.

Winston should not have to manually create tasks, wake agents, relay messages or coordinate every handoff.

---

## 2. Architectural Principles

### 2.1 Single authoritative runtime
The V2 runtime and its canonical database own organisational state. Canonical database: `~/.myaos/runtime.db`. The desktop application is the primary control plane and user interface; all desktop functionality communicates with the authoritative runtime rather than implementing independent workflow logic. Local-first, with a clean path to future cloud-hosted workers and synchronisation.

### 2.2 Separation of intelligence and execution
- **Orchestrator Agent** — understands Winston's requests, exercises judgment, selects workflows, delegates, synthesises recommendations, resolves disagreements, monitors outcomes, escalates consequential decisions.
- **Workflow Engine** — state transitions, task dispatch, scheduling, permissions, retry and recovery, session management, event processing, evidence collection, resource accounting, workflow enforcement.

The organisation must continue operating when the Orchestrator is temporarily unavailable.

### 2.3 Event-driven architecture
Important activities produce durable, attributable events, e.g. job created, plan submitted, task assigned, agent acknowledged, session started, context threshold reached, token usage recorded, handoff created, blocker raised, task completed, verification failed, approval granted, stand-up completed, time entry recorded. Events support auditability, recovery, analytics and reporting.

### 2.4 Human authority
Agents may make routine decisions within delegated authority. The system must escalate consequential decisions involving security, sensitive data, production deployment, financial commitments, significant architectural changes, external contractual commitments and irreversible operations. The organisation must never bypass mandatory approval requirements.

### 2.5 Evidence-based reporting
Self-reported progress must not automatically become verified organisational truth. Task completion, OKR progress, productivity measurements and delivery claims must be supported by recorded evidence.

---

## 3. Organisational Structure

### 3.1 Executive leadership
- **Human executive: Winston** — company vision, strategic direction, final authority, major approvals, resource allocation policy, external commitments.
- **AI Executive Orchestrator** — primary interface between Winston and the organisation: intake, triage, workflow selection, delegation, coordination, organisational reporting, cross-department communication, escalation.

### 3.2 Departments
- **Planning and Strategy** — product strategy, technical architecture, requirements analysis, research, Planning Council, task decomposition, strategic analysis.
- **Engineering** — backend, frontend, mobile, infrastructure, database, integration.
- **Design** — UX research, product design, visual design, Design Studio, design system management, design reviews.
- **Quality Assurance** — independent verification, testing, code review, security review, regression testing, release readiness.
- **Project and Operations Management** — project health, milestones, scheduling, resource allocation, daily stand-ups, weekly reviews, organisational reporting.
- **Knowledge and Enablement** — skills catalog, documentation, knowledge management, context management, process improvement, agent performance analysis.

Department membership and job responsibility are distinct. An agent may belong to one department while contributing to several projects.

### 3.3 Agent identity
Each agent has a persistent organisational identity that survives session termination, context resets, model changes and runtime restarts. It includes: agent ID, name, role, department, seniority/authority level, skills, supported tools, supported model providers, runtime availability, permissions, performance history, current assignments, cost and resource history.

**A new AI session does not create a new employee. It creates a new working session for an existing employee.**

---

## 4. Unified Work Lifecycle

### 4.1 Intake
Every request enters through a unified intake mechanism, from: Winston's conversation with the Orchestrator, desktop forms, project management, internal agent requests, scheduled operations, external integrations. Intake must: (1) preserve the original request; (2) identify the relevant project or repository; (3) classify the request; (4) detect possible duplicates; (5) determine urgency and impact; (6) establish initial ownership; (7) create a durable job record.

### 4.2 Triage
The Orchestrator selects a workflow based on complexity, uncertainty, risk and impact. Initially supported:
- **Quick Execution** — small changes, straightforward bugs, minor improvements, routine maintenance.
- **Feature Development** — new features, significant improvements, design and implementation work.
- **Strategic Project Development** — new products, major architectural initiatives, complex organisational changes.
- **Incident Response** — production failures, security incidents, urgent operational problems.

### 4.3 Planning
For substantial work the Planning Council is activated, selecting specialists according to the request rather than waking every planner. Planning establishes: business context, user requirements, functional and non-functional requirements, technical architecture, design requirements, dependencies, risks, resource estimates, acceptance criteria, implementation phases, required agents and skills. Council members investigate independently, challenge assumptions and contribute different perspectives. The Orchestrator consolidates them into one plan. Disagreements and rejected recommendations remain recorded.

### 4.4 Approval gates (risk-based)
- Low-risk routine work: automatic acceptance within delegated authority.
- Medium-risk: automatic acceptance where policy permits, with visibility.
- High-risk: Winston's approval.
- Irreversible or externally consequential actions: explicit authorisation.

Approval requirements are enforced by the runtime.

### 4.5 Task decomposition
Approved plans become structured task graphs. Each task contains: task ID, parent job, project, description, accountable agent, required skills, dependencies, priority, acceptance criteria, expected deliverables, repository and branch where relevant, resource budget, verification requirements, status. Tasks support parallel execution and dependency-aware scheduling.

### 4.6 Execution
The runtime dispatches tasks to suitable agents. Agents acknowledge assignments before execution is considered started. Agents can request assistance, negotiate technical details, raise blockers and initiate authorised handoffs. The Orchestrator monitors without becoming a bottleneck for every small interaction.

### 4.7 Verification
Independent of implementation. QA agents and deterministic runtime checks establish whether acceptance criteria are satisfied. A failed verification returns the work to the responsible agent.

### 4.8 Delivery
After verification and required approvals: commits, pull requests, merged branches, releases, documentation, design artifacts, deployment records. The job dossier is updated with all evidence.

### 4.9 Learning
Completed work contributes to organisational knowledge: repeated failures, inefficient workflows, common blockers, useful skills, agent performance patterns, cost inefficiencies, automation opportunities. Improvements to procedures are versioned and reviewed.

---

## 5. Autonomous Agent Collaboration

### 5.1 Task graph
A dependency-aware task graph; a job may contain tasks that run independently or sequentially. Each task has one accountable owner; multiple agents may contribute through authorised collaboration.

### 5.2 Structured collaboration
Agents can request assistance, assign authorised subtasks, ask technical questions, share artifacts, create handoffs, raise blockers, request reviews and negotiate implementation contracts. These actions are recorded and linked to the originating job and task.

### 5.3 Branch and worktree management
**One implementation task, one accountable owner, one isolated worktree, one working branch.** The runtime manages repository discovery, base branch selection, worktree creation, branch naming, agent assignment, commit tracking, diff capture, verification, integration and conflict recovery. Agents do not independently merge into protected branches.

### 5.4 Task acknowledgement and recovery
Lifecycle: `PENDING → ASSIGNED → ACKNOWLEDGED → RUNNING → NEEDS_REVIEW → VERIFIED → DONE`. Failure states: `FAILED`, `BLOCKED`, `RETRYING`, `REASSIGNMENT_REQUIRED`, `NEEDS_HUMAN`.

Initial configurable defaults: acknowledgement timeout 2 minutes; retry limit 2; backoff 1 minute then 5 minutes; stale task detection every 10 minutes.

---

## 6. Workforce Time Tracking and Productivity Accounting

A core capability, not an optional report. MyaOS must provide accurate, detailed records of the time invested by Winston and every AI employee, to understand labour contribution, measure productivity, support contractor timesheets and found resource optimisation.

### 6.1 Time categories
**Human time** — time Winston personally contributes. Categories: direct implementation, prompting and instruction, planning and strategy, reviewing agent work, meetings and discussions, testing, administration, other project work. Human time must **not** be inferred from agent execution duration; it is recorded through explicit timers, activity sessions or manual entries.

**Agent time** — record: agent ID, name, department, session ID, job ID, task ID, project ID, model and provider, start, end, duration, execution status, activity category. Measured from actual execution activity, not the gap between two arbitrary session timestamps.

**Collective time** — total agent-hours, total human hours, combined labour, project-, job- and department-level time, daily/weekly/monthly summaries. **Parallel agent-hours are distinct from elapsed wall-clock time** (four agents for one hour = four agent-hours in one elapsed hour); the desktop makes this explicit.

### 6.2 Contractor time tracking
Initial use case: Winston is a contractor for **Freeing Returns**, with a contractual commitment of **20–40 hours per week**.

Configurable **engagement profiles**: client, contract reference, hourly rate, currency, minimum and maximum weekly hours, contract start/end, billing rules, billable activity categories, reporting period, approval requirements.

A contractor time dashboard calculates: weekly human hours, weekly agent hours, combined team contribution, billable human hours, billable agent hours (only where the contract explicitly permits), non-billable time, remaining contractual hours, project and client allocation, estimated billable value.

**Agent execution time must not automatically be treated as billable contractor time.** Labour contribution and billing eligibility are distinct. For Winston's engagement, the 20–40-hour commitment is tracked against approved human working hours unless the contract explicitly says otherwise. Support manual corrections, notes, timesheet approval and export.

### 6.3 Time tracking dashboard
- **Daily** — human hours, agent-hours by employee, total team contribution, project allocation, billable vs non-billable.
- **Weekly** — contractual hours, completed, remaining, agent contribution, department contribution, project allocation, estimated billable value.
- **Monthly** — total labour contribution, project profitability indicators where financial data exists, productivity trends, agent utilisation, client allocation.

### 6.4 Accuracy
Records are auditable, using reliable timestamps and monotonic elapsed-time measurement where appropriate, accounting for runtime restarts, suspended sessions, failed executions, overlapping sessions, idle time, retries and manual adjustments. **Never double-count time because a session reconnects. Never silently rewrite history; corrections are adjustments with an audit trail.**

---

## 7. Token, Context Window and AI Resource Management

Tokens are a measurable organisational resource, not an invisible implementation detail.

### 7.1 Token usage tracking
Per AI session, wherever the provider or adapter exposes it: input, output, cached input, cache creation, reasoning, total, estimated (when exact is unavailable), actual provider-reported, estimated cost, actual cost. Each record links to agent, session, model, provider, job, task, project and timestamp. **Provider-reported usage takes precedence over estimates; actual, estimated and unavailable are always distinguished.**

### 7.2 Context window monitoring
Per active session: model context capacity, current usage, utilisation %, remaining, token history, compaction events, context-reset events, session age, session activity. Use provider-reported context information wherever possible; do not assume identical metrics across providers.

### 7.3 Intelligent session renewal
Configurable per agent (and globally, by provider, by model). Illustrative defaults: **60%** monitor and record; **75%** prepare a continuation handoff; **85%** recommend or initiate a new session; **95%** prevent further normal work unless policy permits. These are policy suggestions, not model limits.

Automatic renewal: (1) runtime detects the threshold; (2) agent receives a controlled continuation request; (3) session prepares a structured handoff; (4) important context is persisted; (5) outstanding task state and artifacts are recorded; (6) session is safely closed or suspended; (7) a new session is created for **the same employee**; (8) it receives the handoff; (9) work resumes from the last verified state. The new session does not inherit an unnecessarily large history.

Continuation package: original job and task, objective, status, work completed, discoveries, technical decisions, file paths, commits, outstanding work, blockers, acceptance criteria, next actions, references to earlier discussions. Additional history is retrieved only when needed.

Manual renewal — Winston can inspect context utilisation and token consumption, request a fresh session, set a new threshold, suspend an agent, inspect the continuation package, resume or reassign work. The system also flags unusually high consumption before the threshold.

### 7.4 Token budgets
Budgets at session, agent, task, job, project, department and organisation level, with warnings and enforcement. On exceeding a budget the runtime assesses: continue with authorisation; fresh session; switch to a more economical compatible model (respecting quality and capability requirements); request a different agent; escalate.

### 7.5 AI resource dashboard
- **Organisation** — tokens today/week/month, estimated and actual expenditure, tokens per completed task, cost per verified task, cost per project.
- **Per agent** — input/output tokens, context utilisation, session count, average session duration, renewal count, tokens per hour, average cost per task, failed-session consumption, trends.
- **Per project** — tokens, expenditure, agent-hours, cost per deliverable, cost per verified feature, budget vs actual.

---

## 8. Workforce Intelligence and Continuous Improvement

### 8.1 Agent performance
Tasks completed and verified, first-pass verification rate, rework frequency, average completion and acknowledgement time, blocker frequency, handoff success, token and cost efficiency, renewal frequency, failure and recovery rate — evaluated relative to role and task complexity, never by raw completion counts alone.

### 8.2 Workflow efficiency
Intake→planning, planning→execution, waiting for assignment, blocked time, review time, request→verified delivery, unnecessary handoffs, failed retries, parallel execution efficiency, planning accuracy, estimated vs actual resource consumption.

### 8.3 Token efficiency
Identify agents with excessive context, skills producing unnecessary instructions, repeated context loading, tasks better suited to smaller models, excessive agent communication, repeated reasoning that could be persisted knowledge, and places structured output beats conversation. The objective is to maximise verified output quality per unit of time and computational cost, not to minimise tokens.

### 8.4 Continuous improvement
The Orchestrator periodically reviews workforce performance and proposes improvements (renewal thresholds, decomposition, agent instructions, skills, reassignment, model selection, less council participation). Important policy changes are reviewed and versioned.

---

## 9. Unified Communication System

### 9.1 Channels
Job threads (primary collaboration for specific work); rooms (persistent team and project discussion); inboxes (assignments, notifications, handoffs); announcements (organisation-wide); stand-ups (structured reporting); decision records (durable consequential decisions).

### 9.2 Relationships
Messages link to agents, jobs, tasks, projects, departments, sessions and handoffs, with unread state, acknowledgement, delivery status and artifact references.

### 9.3 Handoffs
Structured workflow objects, not informal messages: sender, recipient, job and task, reason, requested action, context, required artifacts, priority, acknowledgement status. The runtime delivers and wakes the recipient where appropriate.

---

## 10. Daily Stand-ups and Recurring Operations

- **10.1 Schedule** — Monday–Friday, 10:00 Africa/Lusaka (CAT, UTC+2). Configurable.
- **10.2 Process** — (1) gather events since the previous stand-up; (2) identify active and relevant agents; (3) send each an individual request; (4) agents report progress and blockers; (5) runtime validates reports against recorded work; (6) Orchestrator compiles the report; (7) persist and publish; (8) blockers become actionable workflow items.
- **10.3 Startup catch-up** — inspect missed operations, determine which remain outstanding, run eligible catch-ups without duplicates, record the delay, publish results. A missed stand-up must not silently disappear.
- **10.4 Background service** — a macOS LaunchAgent so the runtime runs without the desktop window. When the computer is off, missed operations reconcile at next start. Preserve a path to cloud-hosted execution.
- **10.5 Recurring routines** — agent health checks, stale-task sweeps, daily stand-ups, weekly retrospectives, weekly OKR reviews, project health reviews, monthly skill-effectiveness reviews — all on the central scheduler.

---

## 11. Strategic Planning and Project Management Integration

Hierarchy: **Company Strategy → Strategic Objectives → Key Results → Projects and Initiatives → Jobs → Tasks → Evidence and Outcomes.**

- **11.1 OKRs** — measurable and connected to actual work, updated through verified evidence wherever possible, distinguishing manually reported, agent-reported, runtime-observed and independently verified progress.
- **11.2 Projects** — objectives, milestones, jobs, tasks, dependencies, agents, budgets, time records, token consumption, design artifacts, risks, decisions, deliverables.
- **11.3 Resource-aware PM** — agent availability and workload, agent-hours, human hours, token budgets, estimated costs, deadlines, dependencies. Project health reflects actual execution, not manual status fields. Historical project tasks and records are preserved during migration.

---

## 12. Design Studio Integration

A design request creates a linked design task. The designer produces versioned artifacts: `Draft → Review → Approved → Superseded`. Approved designs become implementation references; engineering agents receive them automatically; QA verifies the implementation against the approved design. Existing boards, frames, versions and lineage are preserved and extended.

---

## 13. Skills and Organisational Knowledge

Skills become runtime-loaded, versioned operational instructions, each defining: unique ID, version, activation conditions, required inputs, instructions, available tools, expected output, validation criteria, escalation conditions. The runtime selects relevant skills when creating or dispatching assignments.

Initial essential skills: (1) intake triage; (2) project context; (3) planner brief; (4) task decomposition; (5) design artifact; (6) implementation; (7) agent handoff; (8) independent verification; (9) release safety; (10) OKR evidence; (11) daily stand-up; (12) failure recovery; (13) time tracking and activity reporting; (14) context management and session renewal; (15) token and resource efficiency. Skills improve through controlled versioning.

---

## 14. V2 Desktop Application

- **14.1 Executive Home** — conversational interface with the Orchestrator; active jobs, pending approvals, important blockers, organisational health, today's stand-up, priorities, recent completed work, time and token summaries.
- **14.2 Core navigation** — (1) Executive Home; (2) Workflows; (3) Coworkers; (4) Planning Council; (5) Projects; (6) Communications; (7) Stand-ups; (8) Design Studio; (9) Strategy and OKRs; (10) Skills and Knowledge; (11) Time and Productivity; (12) AI Resources and Usage; (13) QA and Verification; (14) Engineering Cockpit; (15) Runtime and Health.
- **14.3 Unified Needs You** — one place for high-risk approvals, consequential architecture decisions, unrecoverable blockers, security authorisation, production deployment approval, budget exceptions, final delivery approval. Routine progress does not interrupt Winston.
- **14.4 Unified job timeline** — chronological history of request, triage, planning, council contributions, decisions, tasks, assignments, communications, handoffs, sessions, time records, token usage, branches and commits, design artifacts, verification, approvals, delivery. A central feature of the desktop.

---

## 15. Runtime Agent Action Interface

A structured, authenticated agent action interface, exposed through MCP or compatible adapter tools:

| Area | Operations |
|---|---|
| Jobs | `job.get`, `job.create` |
| Planning | `plan.submit`, `plan.request_review` |
| Tasks | `task.create`, `task.claim`, `task.update`, `task.report` |
| Evidence | `evidence.add` |
| Communication | `thread.post`, `inbox.send` |
| Collaboration | `blocker.raise`, `handoff.create` |
| Operations | `standup.submit`, `schedule.request` |
| Time tracking | `time.start`, `time.stop`, `time.report`, `time.adjust` |
| AI resources | `usage.report`, `context.report`, `session.renew`, `budget.check` |
| Knowledge | `skill.list`, `skill.read` |
| Design | `design.request`, `design.import` |

Every operation enforces authentication, authorisation, schema validation, audit logging and appropriate idempotency. Business logic stays independent of the transport.

---

## 16. Implementation Programme (work packages)

| WP | Title | Scope | Deliverable |
|---|---|---|---|
| WP0 | V2 Adoption and Runtime Foundations | Authoritative V2 branch; resolve legacy architecture/doc conflicts; validate desktop build and launch; canonical DB ownership; session adapters; backup and recovery; migration policies; runtime security | Stable, authoritative V2 foundation |
| WP1 | Unified Work Lifecycle | Job/task state machines, dependencies, event processing, transitions, idempotency, recovery | Functional workflow engine |
| WP2 | Executive Intake and Orchestration | Unified intake, classification, routing, Orchestrator integration, project resolution, approval routing, Needs You | One entry point for work |
| WP3 | Planning Council | Planner selection, sessions, independent contributions, debate and synthesis, structured plans, decomposition, risk | Autonomous planning |
| WP4 | Agent Execution and Collaboration | Action interface, dispatcher, acknowledgement, worktrees, collaboration, handoffs, parallel execution, session recovery | Autonomous execution |
| WP5 | Independent Verification and Delivery | Verification workflows, evidence, criteria, review assignment, failed-verification recovery, controlled delivery | Verified outcomes |
| WP6 | Communications and Organisational Operations | Threads, rooms, inboxes, announcements, stand-ups, weekly reviews, scheduler, catch-up, background runtime | Coordinated operations |
| WP7 | Strategy and Project Management | OKRs, KRs, project hierarchy, milestones, task integration, evidence-driven progress, portfolio reporting | Connected strategy and execution |
| WP8 | Skills and Knowledge | Runtime skill catalog, versioning, discovery, context retrieval, injection, learning | Consistent procedures |
| WP9 | Workforce Time Tracking and Productivity | Human/agent/collective time, engagement profiles, billable classification, timesheets, analytics, utilisation, project allocation | Complete workforce time accounting |
| WP10 | Token, Context and AI Resource Intelligence | Usage collection, context monitoring, renewal, continuation handoffs, budgets, cost attribution, model efficiency, dashboards | Measurable, optimisable AI resource use |
| WP11 | Unified Desktop Integration | All desktop surfaces in §14 | Unified desktop experience |

## 17. Implementation Dependencies

WP0 → WP1 → WP2 → WP3 → WP4 → WP5. WP6 begins once event and communication contracts exist. WP7 depends on the unified work and evidence models. WP8 depends on the agent action and session infrastructure. WP9 and WP10 share the event and resource-accounting foundations and can proceed in parallel once those contracts are defined. WP11 integrates completed capabilities. Parallel work is encouraged once shared contracts are agreed.

## 18. Quality and Acceptance Requirements

Features existing is not completion; acceptance is end-to-end operation.

- **18.1 Autonomous delivery test** — submit a real, low-risk feature through the desktop and verify it: creates a durable job; classifies; activates appropriate planners; produces a structured plan; creates dependent tasks; assigns agents; receives acknowledgements; coordinates collaboration; tracks time and tokens; renews sessions where necessary; implements; independently verifies; presents required approvals; delivers; updates project and organisational records.
- **18.2 Recovery tests** — agent unavailable; session crash; runtime, desktop and computer restart; missing acknowledgement; failed verification; conflicting branches; duplicate scheduling; interrupted stand-up; context threshold reached mid-execution; token budget exceeded.
- **18.3 Workforce accounting tests** — concurrent agent work counted correctly; human and agent time separate; billable/non-billable classified correctly; restarts and renewals do not duplicate time; adjustments auditable; timesheet exports reconcile with records.
- **18.4 Resource intelligence tests** — provider-reported usage captured; estimated vs actual distinguished; context % is model-specific; renewals preserve task continuity and employee identity; budgets trigger actions; cost attribution consistent across agents, jobs and projects.

## 19. Non-Negotiable Architectural Requirements

1. One authoritative runtime and organisational database.
2. No competing legacy workflow implementation.
3. Durable state transitions.
4. Event-driven orchestration.
5. Structured and authenticated agent operations.
6. Independent verification.
7. Persistent agent identities across sessions.
8. Controlled agent collaboration.
9. Explicit permission and approval boundaries.
10. Reliable scheduling and startup recovery.
11. Accurate human and agent time accounting.
12. Model-aware token and context monitoring.
13. Configurable session renewal.
14. Resource budgets and cost attribution.
15. Evidence-driven OKR reporting.
16. Versioned operational skills.
17. Complete job-level traceability.
18. Auditable decisions and historical records.
19. A unified desktop control plane.
20. Local-first architecture with cloud-ready execution boundaries.

## 20. Final Product Vision

A self-coordinating AI organisation that accepts objectives, plans work, allocates its workforce, executes projects, communicates internally, monitors resources, verifies outcomes and continuously improves its own procedures. Winston focuses on ideas, direction, important decisions and reviewing outcomes; the organisation carries the operational complexity.

It should know what it is trying to accomplish, what work needs to happen, who is responsible, what everyone is doing, how much time and computation is being invested, which projects and objectives are progressing, what is blocked, what requires human attention, and what has genuinely been completed. It must explain its own performance with evidence — not merely report that it is busy, but demonstrate what it accomplished, how efficiently, and what it can improve next.

The objective is not more AI agents. It is an intelligent organisation that consistently turns ideas into verified outcomes with minimal human operational overhead.

---

## Appendix A — Instructions for the Detailed Planning Team

This document is the approved product vision and architectural direction. It is **not** permission to implement everything in one cycle. The Planning Council and Orchestrator use it as the authoritative source for the detailed programme, and must:

1. Audit the current V2 implementation against every section.
2. Identify existing functionality that can be preserved.
3. Identify missing capabilities.
4. Identify incomplete or partially implemented functionality.
5. Identify conflicting implementations and data models.
6. Establish shared architectural contracts.
7. Produce detailed technical designs.
8. Decompose every work package into independently actionable epics and tasks.
9. Establish dependencies and parallel execution opportunities.
10. Define database migrations and backward compatibility.
11. Define API and agent-tool contracts.
12. Define measurable acceptance criteria.
13. Identify security, reliability and performance risks.
14. Estimate implementation effort and AI resource requirements.
15. Assign accountable technical leads.
16. Establish verification and release procedures.

Each work package has its own implementation specification; each task carries enough detail for an agent to execute independently without rediscovering the architecture. Agents coordinate shared interfaces before building dependent components. The Planning Council preserves architectural consistency across packages; no agent redefines a shared architectural decision without recording the proposed change and obtaining approval.

**First priority: WP0, followed by a proven end-to-end workflow slice.** The organisation must demonstrate that the architecture works before scaling implementation across the programme.
