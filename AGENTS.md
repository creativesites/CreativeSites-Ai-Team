# Agent onboarding and workflow

This repository's canonical system is **MyaOS V2**: the runtime in `runtime/` (owns `~/.myaos/runtime.db`, the only workflow store) and the desktop in `apps/desktop/`. The v1 Tauri app (`desktop/`) and Node runtime (`src/`, `bin/`) are **legacy, read-only import sources** (see their `LEGACY.md`). Decision K1 in the programme plan, approved by Winston on 2026-11-03.

Before pushing runtime or desktop changes, run `npm test` and `npm run typecheck` in `runtime/`, and `npm run typecheck` in `apps/desktop/` (CI: `.github/workflows/v2-ci.yml`, Node 24).

## Read first

0. [`community/proposals/MYAOS_V2_AUTONOMOUS_ORGANISATION_VISION.md`](community/proposals/MYAOS_V2_AUTONOMOUS_ORGANISATION_VISION.md) — owner-approved V2 vision; with its [gap audit](community/proposals/MYAOS_V2_VISION_GAP_AUDIT.md) and [programme plan](community/proposals/MYAOS_V2_PROGRAMME_PLAN.md), it supersedes conflicting proposals below.
1. [`community/proposals/MYAOS_WORKFLOW_OPERATING_MODEL.md`](community/proposals/MYAOS_WORKFLOW_OPERATING_MODEL.md) — proposed end-to-end workflow and planner routing.
2. [`community/proposals/MYAOS_WORKFLOW_IMPLEMENTATION_PLAN.md`](community/proposals/MYAOS_WORKFLOW_IMPLEMENTATION_PLAN.md) — staged work and acceptance criteria.
3. [`community/threads/041_myaos_workflow_from_scratch.md`](community/threads/041_myaos_workflow_from_scratch.md) — current-state audit and independent review discussion.
4. [`community/README.md`](community/README.md) and [`community/AGENTS_REGISTRY.md`](community/AGENTS_REGISTRY.md) — collaboration conventions and declared team identities.
5. [`community/skills/README.md`](community/skills/README.md) — planned shared skill catalog and skill-document contract.

These workflow documents describe a proposal. They do not mean the target workflow, skill loader, planner router, or daily scheduler has been implemented.

## Before taking work

- Establish the current repository/project and inspect its actual files, task state, and recent evidence.
- Check `community/agents.json` for declared capability and liveness; a declaration is not proof an agent is online or has performed work.
- Treat `data/myaos.db`, `community/tasks/`, Node runtime files, and desktop SQLite state as separate until an explicit integration proves otherwise. Do not update one state store and imply another was updated.
- Use the applicable skill/runbook if one is available. The repository does not yet have a consistently discovered, runtime-loaded team skill catalog; see the proposed catalog and operating model.
- For changes, state the user outcome, scope, non-goals, and observable acceptance criteria. Link work to a project and OKR only when that relationship is known; never invent a link.
- Persist assignments, blockers, decisions, handoffs, and verification evidence in the system of record that actually owns that work. Do not rely on chat text as durable task state.
- A completion report must identify the independent evidence: commands actually run, exit status, relevant output, and the verifier. Never infer a passing verification from an agent saying “done.”
- Ask the human only for a real product decision, missing access/credentials, or an explicitly reserved release/destructive action. Otherwise continue with a reversible, stated assumption.

## Current workflow boundary

Intake paths in the desktop currently differ: Work Mode creates a local card, Intent Bar creates a database task without dispatch, Project Board creates a task and needs a separate dispatch action, and Jules Mission Flow stores a mission plan separately from durable task creation. Threads, stand-ups, planner identities, and the Node runtime are not yet one integrated desktop workflow. See the audit thread for details and source locations.

