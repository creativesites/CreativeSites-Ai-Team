# MyaOS workflow implementation plan

**Status:** Proposed roadmap; no runtime changes are included in this planning pass  
**Prepared:** 2026-11-03  
**Companion:** [`MYAOS_WORKFLOW_OPERATING_MODEL.md`](MYAOS_WORKFLOW_OPERATING_MODEL.md)

## Goal and completion definition

All supported intake surfaces converge on one durable task lifecycle; the orchestrator can choose a quick route or justified planner review; work can pass between agents with recoverable context; independent verification is evidence-based; and project/OKR, design artifact, communication, and stand-up records remain linked. A fresh agent can discover the workflow and continue a task without relying on hidden chat context.

## Decisions to settle before data/schema implementation

1. **Choose the implementation target.** Current `main` (`6a311d8` at this review) contains v1 `desktop/` + `src/`; it does not contain `runtime/` or `apps/desktop/`. Cadence's v2 implementation and proposals are on `claude/quirky-jennings-dd80cd` (`21be454`, `8891f28`). The v2 live database exists and has been independently inspected, but that does not make v2 the implementation on `main`. Review and reproduce the v2 branch's clean build/launch, runtime-store path, and one real request-to-verification slice, then select v2 adoption or continued v1 work. Do not build two workflow engines in parallel.
2. **Canonical service and deployment topology.** After choosing the target, document service/API authority, schema versions, readers/writers, concurrency, backup/recovery and app-closed behavior. If adopting v2, confirm `runtime` is the sole workflow writer and `~/.myaos/runtime.db` is its intended durable store; define v1/JSON import boundaries. If remaining on v1, settle its store/service architecture before schema changes. Require one writer authority, no dual-write, and explicit idempotent outbox/replay/ack behavior if offline commands are supported.
3. **Planner runtime scope.** Confirm the project-relevant planner identities and adapters. Sage is declared but has no proven planning runtime; Themis/Daedalus are MeetingMind-scoped and Mira is advisory. Select by observed readiness and scope; roster status alone is not reachability.
4. **Skill discovery contract.** Decide path/metadata/versioning, loader permissions, and how selected skills enter fresh sessions. Until implemented, skill docs are guidance only.
5. **Task lifecycle and risk policy.** Define transitions, retry limits, stale assignment handling, and design approval/version rules. Unknown risk must fail closed; low-risk auto-accept applies only after risk classification proves the task eligible.
6. **Daily scheduler ownership.** The Winston-authored v2 decision record specifies 10:00 CAT weekdays and accepts a background service in principle. Confirm timezone/catch-up behavior on the selected target; weekend behavior remains open.

The ADR must resolve or explicitly defer with a safe behavior for: service owner; Node/desktop client topology; storage location; concurrent writers/locking; app closed/offline; daily scheduling and catch-up; backup/restore; migration and rollback from repository DB/JSON data; schema/version compatibility; idempotency; observability; and recovery after partial failure. Do not start schema migrations before this ADR.

Commit `8891f28`, authored and committed by Winston, records v2 planning decisions: eligible low-risk plans may auto-accept; weekday stand-up is 10:00 CAT; Orchestrator is a real agent (Claude Code or Codex considered before the unconfigured Antigravity adapter); a background service is acceptable; and the 46 legacy tasks should be preserved with archive/delete controls. Treat these as authorized planning constraints for the v2 proposal. They do not select v2 as the `main` target, authorize silent service installation, or call for deleting existing records in this planning task. Reconcile the auto-accept feature-flag defaults before implementation.

## Phased work packages

### P0 — Truthful onboarding, runtime inventory and shared vocabulary

**Deliverables:** root `AGENTS.md`; accurate README/community onboarding; current-vs-target workflow docs; reconciled identity/role documentation; proposed skill catalog contract; inventory of actual task/project/OKR/message/artifact/stand-up stores, schema versions, process paths, and every writer/reader.

**Acceptance:** new agent can identify current runtimes and stores, distinguish implemented from proposed capabilities, find the task/communication/skill conventions, and see the workflow audit. No onboarding doc claims a desktop capability that is only present in Node or only proposed.

### P1 — Target adoption gate and architecture decision record

**Deliverables:** explicitly select v1 or v2 as the sole implementation target. If v2 is selected, reproduce a clean build/launch, confirm its API and DB path, and exercise a request-to-verification slice; record runtime authority, migration/import, offline/app-closed semantics, scheduler, concurrency, backup/recovery and observability in a focused ADR. If v1 is selected, complete the prior store/service ADR before schema work.

**Acceptance:** one version is named as the sole implementation target; the team can reproduce its build/launch and store path; reviewers can trace its writers, offline behavior, migration and recovery. No new workflow schema or parallel runtime begins before this gate.

### P2 — Versioned task contract and persistence adapters

**Deliverables:** versioned service/API contract and implementation for task, project, source conversation/session, plan, artifact/version, event, thread, handoff, approval, and verification evidence references. Add schema migration/adapter according to the ADR. Keep the task record normalized; use stable typed link records for related entities.

**Acceptance:** each supported client can create/read/update the same stable task ID; known project/repository and optional KR links persist; duplicate/retried intake is safe; linked child records survive restart; no parallel authoritative state or silent dual write remains.

### P3 — Runtime-owned intake and durable job spine

**Deliverables:** basic intake works without any agent being available; one runtime/API path creates or reopens jobs and persists source, project, risk classification, idempotency key, plan/criteria and events. Add deterministic triage; dispatch has delivery/acknowledgement/timeout and retry; thread/handoff is task-linked. Inject the first relevant skills before dispatch. A scheduler mechanics test may run independently, but defer a user-facing daily stand-up until the workflow emits real task/activity/evidence data.

**Acceptance:** repeated requests with the same idempotency key create/reopen one job; fuzzy similarity is a reversible suggestion, never a silent merge. Bounded work records its quick route. High-risk or materially ambiguous work does not silently downgrade to quick when a required planner is unavailable. A recipient appears to be working only after runtime acknowledgement; otherwise work remains visibly queued. A stuck job is diagnosed and presented for a decision, not silently cancelled.

### P4 — Skill library, agent tools and selective planner integration

**Deliverables:** transport-independent, permissioned runtime action contract; evaluate MCP per ACP adapter and use it only where readiness is proven; keep compatibility paths explicit. Add skill discovery/version pinning/injection; planner adapter and project-scoped capability/readiness lookup; structured planner packet/result; synthesis preserving disagreement. Runtime-owned intake must not depend on these agent tools.

**Acceptance:** a cold-start agent receives only applicable skill versions plus the task packet; planner consultation is recorded only with a real eligible runtime response; orchestrator-only triage is labeled as such; MeetingMind-specific roles are not routed to unrelated projects; planner timeout/unavailability does not misrepresent review. Work that requires planner judgment stays queued or escalates rather than being silently downgraded.

### P5 — Independent evidence-based verification and recovery

**Deliverables:** verifier service and evidence schema; independent verifier assignment; criterion-level checks; implement-fix-reverify loop; timeout/retry and blocked state; removal of transcript-only pass transitions.

**Acceptance:** each passed criterion points to actual verification evidence with command/action, exit/result, time, actor, and artifact/revision; author cannot self-verify; a reported completion without evidence stays unverified; failure creates a targeted handoff; task completion is derived from all required criteria; stale/failed verification is visible.

### P6 — Project, OKR, artifacts and daily coordination

**Deliverables:** project and optional OKR linkage from intake through verified completion; evidence-based KR updates; first-class design artifact/version/approval links; event-derived stand-up collector and scheduler at the recorded 10:00 CAT weekday cadence; missed check-in and stale-task reporting. Agent-authored updates use the supported structured protocol.

**Acceptance:** an approved design version is immutably linked to implementation; new design revisions require an explicit approval decision; existing UI capture records source and scope; OKR movement points to verified linked tasks; daily report is generated from actual events and records missing inputs rather than inventing updates; scheduler reports whether it is active.

**Data policy:** Preserve all 46 v1 `project_tasks`, including the two `unresolved` records omitted from Cadence's first status breakdown. Archive is reversible and the default retention action. A hard-delete control must be per-item, explicitly confirmed, auditable, and recovery/retention-aware; this plan does not perform deletion.

### P7 — Unify desktop surfaces and operational visibility

**Deliverables:** desktop screens consume the common task lifecycle; unified task timeline shows plan, agent, handoff, messages, artifacts, blockers and verifier evidence; retry/resume controls invoke a real persisted transition; metrics and recovery diagnostics.

**Acceptance:** a user can start, inspect, resume, retry, approve and verify work from the desktop without creating parallel local-only state; reload/restart preserves the same lifecycle; status labels correspond to observed backend state; failure modes offer a precise recovery action.

## Cross-cutting implementation rules

- Assign one accountable owner per work package and an independent verifier for its acceptance.
- Build against explicit interfaces; do not have frontend screens write competing lifecycle states.
- Add migration backup/rollback plans before altering the database; preserve existing user data.
- Instrument assignment, planner selection, delivery, retries, verification and stand-up generation with traceable IDs.
- Use capability and observed availability, not roster titles alone, for routing.
- Keep a human approval only where the operating model calls for a decision.
- Do not mark a phase complete from code presence; satisfy the listed acceptance criteria in the integrated desktop and relevant runtime.

## First implementation slice

After the target adoption gate and ADR, validate one bounded request through the chosen target's primary intake: idempotent job → quick triage → plan/criteria → relevant versioned skill → dispatch receipt/ack → implementation → independent criterion-level verification → owner approval. Include duplicate submission and an unavailable-runtime case that remains queued. Then prove a second entry surface (Work Mode or Design Studio) uses the same lifecycle before routing the rest. Generate the first meaningful stand-up from these real events; a scheduler-only test can run earlier but does not prove the workflow works.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Two stores continue to diverge | Decide authority first; make all alternate paths explicit adapters and measure drift during migration. |
| Planner council becomes mandatory overhead | Encode deterministic trigger reasons and retain a quick path. |
| Registry says an agent is available when it is not | Require runtime availability and acknowledgement; expire stale presence. |
| Chat transcript is treated as work evidence | Require criterion-level evidence records and independent verification. |
| OKR links are added decoratively | Update KRs only from linked, verified task evidence. |
| Daily stand-up is scheduled without a live runtime | Surface scheduler health and missing check-ins; never create synthetic updates. |
| Design approval loses version context | Pin artifact version and approval identity/time; implementation references that immutable version. |
| Repeating requests create duplicate tasks or colliding IDs | Use collision-resistant IDs, intake idempotency keys, dedupe rules, and retry-safe transactions. |
| A handoff is persisted but never reaches an agent | Use an outbox/queue, delivery receipt, acknowledgement timeout, visible retry, and stale-assignment recovery. |
| Workspaces or branches mutate different local DB copies | Resolve runtime topology in the ADR; prefer managed app data for a local desktop and define explicit sync/backup. |
| Skill content is stale or overrides policy | Version and scope skills, keep system policy higher priority, and review skill changes as code/docs. |
| Stand-up misses a day or uses the wrong date | Configure local timezone, idempotent daily keys, scheduler health, and catch-up without synthetic updates. |
| Agent availability is stale or concurrent writes conflict | Require live receipt, transaction boundaries, stale-session expiry, and observable conflict handling. |
| Auto-accept misclassifies unknown risk as low | Make unknown risk ineligible; require classification evidence and reconcile feature-flag defaults with the owner decision. |
| Fuzzy dedupe discards distinct intent | Use exact idempotency for retries; show similarity as a reversible suggestion. |
| Tool transport varies across adapters | Keep domain commands transport-independent and verify tool support per adapter before enabling it. |
| Branch proposal is mistaken for current product | Keep target selection and a reproducible adoption gate explicit in status/docs. |

