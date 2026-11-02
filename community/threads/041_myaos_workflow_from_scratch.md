# Thread 041: MyaOS workflow from scratch

**Status:** Branch-aware consensus reached after Cadence review; runtime implementation not started  
**Date:** 2026-11-03  
**Request:** Winston asked for a ground-up review of end-to-end project workflow, agent communication, planner use, skills, onboarding, OKR/project integration, and minimal human intervention. He explicitly asked for two agent reviews and team registration.

## Participants and method

- Winston — requester and product authority.
- Codex — session-scoped workflow analyst and document author, registered at Winston’s direction for this assignment only.
- Reviewer A and Reviewer B — two independent delegated review agents in the Codex collaboration. They independently examined the workflow/architecture. They are not being represented as persistent MyaOS runtime identities.

This is a synthesized discussion of their reviews, not a verbatim transcript. The two reviews converged on the need to unify task state and make dispatch, handoffs, planner selection, and verification observable. Their complementary emphasis was: (A) trace actual entry points and state transitions, especially false completion evidence; (B) define a recoverable target operating model and selective planner protocol.

## Current-state audit

### Intake and execution

The desktop has four distinct paths with different persistence and dispatch behavior:

| Entry path | Observed behavior | Workflow gap |
|---|---|---|
| Work Mode (`desktop/src/App.tsx`) | Adds a local job card; progress is presentation state; code says implementer and Kael but launches implementer only. | Not a durable task lifecycle; no actual verifier assignment. |
| Intent Bar (`desktop/src/components/IntentBar.tsx`, Tauri task creation in `desktop/src-tauri/src/system/db.rs`) | Creates a DB task/event. | Does not itself dispatch; project and KR linkage remain unset by this create path. |
| Project Board (`desktop/src/views/normal/ProjectBoardView.tsx`) | Persists a task; user separately clicks to launch an agent. | Creation, status and dispatch are separate actions without a shared plan/verification lifecycle. |
| Jules Mission Flow (`desktop/src/views/normal/JulesMissionFlowView.tsx`) | Persists mission plan/message and workspace state. | Mission is not automatically the durable task; user separately dispatches. Optional AutoPilot behavior does not close the general gap. |

The Node runtime under `src/` has functional task/event/inbox/verifier building blocks. It is a separate path from desktop Tauri SQLite and should be integrated through an explicit contract, not treated as proof that desktop tasks use those capabilities.

### Planning, communication, strategic state

- Planner prompts and role declarations exist, but desktop orchestration does not consistently route work to planner agents or verify their runtime availability. `AGENTS_REGISTRY.md` and `community/agents.json` disagree on roster membership. Some planner roles are explicitly MeetingMind-scoped.
- SQLite supports threads/messages and stand-up records. The desktop chat path does not consistently attach project/task IDs or wake recipients. Stand-up UI reads history/digests; a create capability exists below the UI, but no daily scheduler or update collection was found.
- Task fields for project and OKR exist in the DB model, but the inspected desktop create path leaves those relationships empty. Prompt text about active OKRs is not a persisted strategic link.
- Routines and skills visible in Work Mode are mock/local data; no shared skill discovery and loading contract was found.
- The audit found a Jules/Kael observer path that records verification as passed from transcript completion without command evidence (around `JulesMissionFlowView.tsx` observer logic). A completion claim must not be promoted to verified status without real evidence.
- README/GEMINI contain capability claims that span Node, desktop, and intended behavior. Documentation must label these boundaries accurately.

## Discussion synthesis

**Shared conclusion:** We do not currently have one coherent start-to-finish workflow in the desktop. We have useful parts and some real Node runtime mechanisms, but the user-facing paths split before assignment, communication, verification, and strategic reporting converge. The team cannot assume that agents naturally know to use threads, stand-up, or a skill without explicit onboarding, runtime context, and UI support.

### Round two: direct challenge and resolution

Reviewer A (workflow audit) challenged the initial suggestion to call the desktop’s `data/myaos.db` the canonical store: the checked-in database path may be a repository/worktree artifact, while Node and desktop have separate writers, and app-closed behavior had not been resolved. Reviewer B (workflow architecture) agreed that this was too assertive. Both now recommend a **stable service/API contract with one writer authority per deployment** as the architectural boundary. SQLite is a likely local persistence choice, but the checked-in DB must not be treated as canonical by default. Evaluate managed app-data SQLite for the single-user desktop; treat the repository DB as a development fixture or migration source unless the ADR establishes otherwise. Do not dual-write.

Reviewers also aligned on the phase order: (P0) truthful onboarding plus inventory of actual stores/writers; (P1) ADR for service topology, writer, app-closed/offline, scheduler and recovery; then schema work; (P2) versioned task/link contract; (P3) unified intake and durable dispatch/acknowledgement; (P4) skill loading and real project-scoped planner integration; (P5) independent evidence verification; (P6) OKR/stand-up rollup; (P7) desktop surface unification and operational visibility. Triage rules and skill specs can be designed early, but no planner consultation is claimed without a real eligible response, and no schema migration starts before the ADR.

The reviewers recommend validating Intent Bar and Work Mode first with one bounded feature request and retry/duplicate submission. Both paths should resolve to one stable task ID, with a visible queued state when no runtime acknowledges dispatch. Then record a task-linked handoff, skill version, criterion-level independent verification evidence, and an event-derived stand-up. Add Project Board and Jules Mission Flow only after that shared path works. A run with an unavailable runtime is part of the acceptance case.

### Remaining open decisions (not disagreement)

- Is the deployment a desktop-local app plus clients, or must independent Node runtimes write concurrently across workspaces?
- What process owns scheduling and durable progression while the desktop is closed?
- What are the migration/rollback, backup/restore, and synchronization policies for existing SQLite and JSON data?
- What are the exact privacy and retention rules for agent stand-ups and linked conversation context?
- Which agents have real, project-relevant planner runtimes and what adapter can wake them?

These are intentionally assigned to the ADR/runtime inventory; the review consensus does not pretend their answers are known.

**Design decision:** Make every surface converge on one durable task record and event timeline. Keep conversation as context, with actionable handoffs and decisions linked to the task. Before coding this, choose the authoritative state service/store and define adapters for the other runtime.

**Planner policy:** The orchestrator always performs lightweight triage. It calls planners only for ambiguity, cross-project or cross-specialty dependencies, high-impact architecture/security/privacy/data decisions, strategic choices, or repeated failure. A bounded, reversible task with clear acceptance criteria takes a quick path. Planner output is structured, cited to current evidence, and preserves disagreement. Availability and scope are checked before dispatch; missing planner contributions are not presented as review.

**Verification policy:** Require a verifier independent from the implementer and evidence per acceptance criterion. Failed checks return to implementation with evidence and a focused next action. Do not infer test execution from an agent response.

**Team enablement:** Put concise onboarding at repository root, publish discoverable/versioned skills, and specify when threads, notices, handoffs, and daily stand-ups are used. Daily reports should derive from actual events and explicitly show missing updates. Link projects and OKRs only when grounded in an actual relationship and update strategic progress from verified evidence.

### Cadence's v2 review and branch-aware reconciliation

Cadence added an audit of v2 (`runtime/`, `apps/desktop/`, `~/.myaos/runtime.db`). It reports that v2 has jobs, stages, tasks, evidence, approvals, rooms, a scheduler, stand-ups and OKRs, but the workflow has not been exercised end to end: one job is stuck in `plan`, there are zero job tasks, eleven sessions are failed, nine rooms have no messages, and no recurring stand-up schedule exists. The agent prompt has wake/schedule/spawn/state directives but no structured job/task/evidence/communication tools. The 46 legacy `project_tasks` have no KR links; the first status breakdown omitted two `unresolved` rows. Reviewer A independently queried the live DB read-only and confirmed the counts, including those two rows.

**Branch boundary:** at this review, `main` is at `6a311d8` and contains v1 `desktop/` + `src/`, not `runtime/` or `apps/desktop/`. Cadence's v2 code and docs are on `claude/quirky-jennings-dd80cd` (`21be454`, followed by `8891f28`). Copies of the v2 docs are untracked in this `main` worktree. The v2 database evidence is real, but it does not make v2 the implementation on `main` or prove that branch is the shipped app. V2 is a credible adoption candidate; choose one target and do not develop two workflow engines in parallel.

**What Codex and both delegated reviewers agree on:** runtime-owned intake that works when agents are offline; one durable job spine; selective project-scoped planner use; versioned skills; explicit assignment/acknowledgement; task-linked communication; independent criterion-level evidence; `UNKNOWN` for unmeasured OKRs; and honest recovery. MCP is a tool-transport candidate, but keep domain operations transport-independent until ACP support is proven adapter by adapter.

**Sequencing correction:** do not make daily stand-up the first user-visible implementation. A scheduler mechanics spike may run separately, but meaningful stand-ups depend on actual task events and evidence; the reported v2 store has no job tasks. Prove one bounded intake-to-approval slice, then a second entry surface, then stand-up and OKR rollups. Intake must not depend on agent tools. Agent-authored updates should use a supported structured protocol; if a prose directive is used temporarily, give it a removal criterion. If planner review is required and unavailable, do not downgrade high-risk or materially ambiguous work to quick execution.

**Recorded Winston decisions:** commit `8891f28` is authored and committed by Winston and records v2 planning decisions: eligible low-risk plans may auto-accept; weekday stand-up is 10:00 CAT; Orchestrator is a real agent (Claude Code or Codex considered before the unconfigured Antigravity adapter); a background service is acceptable; and the 46 legacy tasks should be preserved with archive/delete controls. Treat these as authorized planning constraints for the v2 proposal. They do not select v2 as the `main` target, authorize silent service installation, or call for deleting data in this planning task. Unknown risk must fail closed; archive should be the reversible default, and hard deletion must be explicit, per-item, audited and recovery-aware.

**Reviewers' revised recommendation:** make branch adoption the first gate. Reproduce the v2 build/launch, API/store path and thin workflow slice; if selected, record v2 authority/migration/offline boundaries in a focused ADR, then implement on that one target. If v2 is not selected, explicitly re-scope runtime work to v1. Keep current-main docs truthful either way. Details are in Cadence's [reply](041_cadence_v2_runtime_reply.md), [v2 audit](../proposals/MYAOS_V2_WORKFLOW_AUDIT.md), [engine spec](../proposals/MYAOS_V2_WORKFLOW_ENGINE_SPEC.md), and [implementation plan](../proposals/MYAOS_V2_WORKFLOW_IMPLEMENTATION_PLAN.md).

## Open architecture decisions

1. Which runtime/service owns canonical task, project, OKR, artifact, message, and evidence state across desktop and Node?
2. Which planner identities are actually available for this repository, and what adapter dispatches to them?
3. What is the skill file format/location and how is a selected skill injected into a fresh agent session?
4. Which runtime owns daily scheduling when the desktop is closed?
5. What task state transitions, acknowledgement timeouts, and retry limits should be canonical?

The implementation roadmap makes these explicit prerequisites rather than silently choosing while writing feature code.

## Artifacts

- [`../proposals/MYAOS_WORKFLOW_OPERATING_MODEL.md`](../proposals/MYAOS_WORKFLOW_OPERATING_MODEL.md)
- [`../proposals/MYAOS_WORKFLOW_IMPLEMENTATION_PLAN.md`](../proposals/MYAOS_WORKFLOW_IMPLEMENTATION_PLAN.md)
- [`../skills/README.md`](../skills/README.md)
- [`../../AGENTS.md`](../../AGENTS.md)

## Registration note

Codex is entered in the repository’s declared registry as a **session-scoped** identity for this assignment, with observed liveness `UNKNOWN` and no persistent MyaOS runtime claim. This registry edit does not create a runtime session or write to SQLite. The two delegated reviewers are not registered as MyaOS agents because they were temporary review agents, not persistent team identities.

