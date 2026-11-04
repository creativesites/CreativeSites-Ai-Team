# MyaOS shared skill catalog

**Status:** Proposed catalog; no runtime loader is implemented. These entries are planned procedures, not skills currently injected into agents.

## Initial skills to create

| Skill ID | Use when | Required output |
|---|---|---|
| `intake-triage` | A new request arrives or may duplicate existing work. | Normalized outcome, project/session link, duplicate check, planning route and reason. |
| `project-context` | Work depends on existing code, decisions, data, or product behavior. | Sources inspected, current state, freshness, assumptions and unknowns. |
| `planner-brief` | Triage selects a planner or council review. | Structured planner packet and evidence-backed synthesis with disagreement retained. |
| `task-decomposition` | A request needs multiple steps, roles, or dependencies. | Ordered tasks with owner capabilities, dependencies and falsifiable acceptance criteria. |
| `design-artifact` | User wants a feature/page/app designed, previewed, or captured from an existing project. | Versioned artifact, viewport/source context, iteration notes and explicit approval state. |
| `implementation` | An accepted task is ready for code or artifact implementation. | Change summary, files/artifacts, criteria addressed, risks and handoff-ready evidence. |
| `agent-handoff` | Work transfers to another agent or runtime. | Task ID, goal, context, decisions, evidence, limits and one explicit next action. |
| `independent-verification` | Implementation reports completion or a criterion needs re-checking. | Criterion-by-criterion result, commands/actions, exit/results, actor and evidence links. |
| `release-safety` | A change may affect production, credentials, data integrity or users. | Impact, required gates, rollback/recovery and explicit human decision where reserved. |
| `okr-evidence` | Verified work may change a project objective or key result. | Proven task-to-KR relationship and evidence-backed progress proposal. |
| `daily-standup` | A reporting period closes or the scheduled check-in runs. | Verified outcomes, next actions, blockers, dependencies, KR movement and missing updates. |
| `failure-recovery` | Dispatch, implementation, verification or scheduling fails. | Failure evidence, safe retry/rollback, owner, next action and escalation condition. |

## Skill document contract

Each skill should have a stable ID and version, owner, trigger, required inputs, ordered steps, supported tools/capabilities, output schema, safety/escalation boundaries, and acceptance evidence. Tasks should pin the skill version used. The loader should expose only relevant skills to an agent and record which versions it supplied. Do not name a skill “active” until it exists and the runtime can discover and inject it.

## Build order

Start with intake triage, project context, planner brief, task decomposition, handoff, and independent verification. Add design artifact, release, OKR, stand-up, and recovery procedures as their corresponding runtime contracts become real. Keep this page synchronized with implementation status and link each completed skill to its file and loader behavior.

