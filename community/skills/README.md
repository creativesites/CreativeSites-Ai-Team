# MyaOS shared skill catalog

**Status:** The runtime loader exists (WP8, schema v18). `runtime/src/skills/loader.ts` discovers `community/skills/*/SKILL.md` (override with setting `skillsRoot` or env `MYAOS_SKILLS_ROOT`), records each file's version and content hash, selects up to four skills per task, pins the chosen hashes, and injects them into task-session prompts. This applies to the Node runtime only; the Tauri desktop's own orchestration path does not load these skills.

## Catalog

| Skill ID | Use when | Required output | Status |
|---|---|---|---|
| [`intake-triage`](intake-triage/SKILL.md) | A new request arrives or may duplicate existing work. | Normalized outcome, project/session link, duplicate check, planning route and reason. | loaded by runtime (v18) |
| [`project-context`](project-context/SKILL.md) | Work depends on existing code, decisions, data, or product behavior. | Sources inspected, current state, freshness, assumptions and unknowns. | loaded by runtime (v18) |
| [`planner-brief`](planner-brief/SKILL.md) | Triage selects a planner or council review. | Structured planner packet and evidence-backed synthesis with disagreement retained. | loaded by runtime (v18) |
| [`task-decomposition`](task-decomposition/SKILL.md) | A request needs multiple steps, roles, or dependencies. | Ordered tasks with owner capabilities, dependencies and falsifiable acceptance criteria. | loaded by runtime (v18) |
| [`design-artifact`](design-artifact/SKILL.md) | User wants a feature/page/app designed, previewed, or captured from an existing project. | Versioned artifact, viewport/source context, iteration notes and explicit approval state. | loaded by runtime (v18) |
| [`implementation`](implementation/SKILL.md) | An accepted task is ready for code or artifact implementation. | Change summary, files/artifacts, criteria addressed, risks and handoff-ready evidence. | loaded by runtime (v18) |
| [`agent-handoff`](agent-handoff/SKILL.md) | Work transfers to another agent or runtime. | Task ID, goal, context, decisions, evidence, limits and one explicit next action. | loaded by runtime (v18) |
| [`independent-verification`](independent-verification/SKILL.md) | Implementation reports completion or a criterion needs re-checking. | Criterion-by-criterion result, commands/actions, exit/results, actor and evidence links. | loaded by runtime (v18) |
| [`release-safety`](release-safety/SKILL.md) | A change may affect production, credentials, data integrity or users. | Impact, required gates, rollback/recovery and explicit human decision where reserved. | loaded by runtime (v18) |
| [`okr-evidence`](okr-evidence/SKILL.md) | Verified work may change a project objective or key result. | Proven task-to-KR relationship and evidence-backed progress proposal. | loaded by runtime (v18) |
| [`daily-standup`](daily-standup/SKILL.md) | A reporting period closes or the scheduled check-in runs. | Verified outcomes, next actions, blockers, dependencies, KR movement and missing updates. | loaded by runtime (v18) |
| [`failure-recovery`](failure-recovery/SKILL.md) | Dispatch, implementation, verification or scheduling fails. | Failure evidence, safe retry/rollback, owner, next action and escalation condition. | loaded by runtime (v18) |
| [`hierarchical-model-orchestration`](hierarchical-model-orchestration/SKILL.md) | Substantial multi-step work where a lead model plans and delegates bounded tasks to cheaper models. | Classified strategy, task graph with model tier per task, tracked task states, evidence-based final report with workforce and cost (actual/estimated/unavailable). | loaded by runtime (v18) |
| [`time-tracking-and-activity-reporting`](time-tracking-and-activity-reporting/SKILL.md) | A period closes, or someone asks how long work took or what an agent did. | Measured, labelled totals by task and identity, with adjustments and gaps. | loaded by runtime (v18) |
| [`context-management-and-session-renewal`](context-management-and-session-renewal/SKILL.md) | A long session approaches its context limit or loses detail. | Checkpoint (done, active, next) and a renewal decision. | loaded by runtime (v18) |
| [`token-and-resource-efficiency`](token-and-resource-efficiency/SKILL.md) | A task has a budget, an account is near a limit, or an approach must be chosen. | Chosen approach and a usage report labelled by measurement type. | loaded by runtime (v18) |

## Skill document contract

Each skill should have a stable ID and version, owner, trigger, required inputs, ordered steps, supported tools/capabilities, output schema, safety/escalation boundaries, and acceptance evidence. Frontmatter fields the loader reads: `name` (the skill ID), `description`, `version`, `owner`, `inputs`, `outputs`, `related_skills`, and the selection fields `triggers` (keywords), `workflows` (`quick|feature|strategic|incident`) and `roles`. The version is the frontmatter `version` plus the first 12 hex characters of the file's SHA-256, so any edit is a new pinned version.

Selection is deterministic: a skill is chosen when its ID is in the task's required skills, when a trigger keyword appears in the task title, description or required skills, or when the job's workflow is in its `workflows`, in that order of priority, at most four per task. Each task keeps the hash it was given (`task_skills`); editing a skill affects only tasks selected afterwards. Agents list and read skills with the `skill_list` and `skill_read` tools; the API exposes `GET /v1/skills`, `GET /v1/skills/:id`, `GET /v1/tasks/:id/skills` and `POST /v1/skills/reload`. Do not name a skill “active” unless it exists and the loader discovers it.

## Build order

Start with intake triage, project context, planner brief, task decomposition, handoff, and independent verification. Add design artifact, release, OKR, stand-up, and recovery procedures as their corresponding runtime contracts become real. All sixteen catalog skills now exist and are loaded; keep this page synchronized with implementation status and link each completed skill to its file and loader behavior.

