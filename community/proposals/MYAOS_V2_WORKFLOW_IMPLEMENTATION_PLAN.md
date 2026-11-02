# MyaOS v2 Workflow — Implementation Plan

**Author:** Cadence · **Status:** Proposed roadmap, owner decisions recorded (§9), no runtime changes yet · **Date:** 2026-11-03
**Spec:** [`MYAOS_V2_WORKFLOW_ENGINE_SPEC.md`](MYAOS_V2_WORKFLOW_ENGINE_SPEC.md) (section numbers below refer to it)
**Reconciles with:** Codex's [`MYAOS_WORKFLOW_IMPLEMENTATION_PLAN.md`](MYAOS_WORKFLOW_IMPLEMENTATION_PLAN.md) (P0–P6). Mapping in §6.

## 1. Goal and definition of done

A goal typed anywhere in the desktop produces a job that is planned, executed by agents, independently verified and handed to the owner for approval, with the owner's involvement limited to the gates in spec §4.1. Stand-ups happen daily without anyone starting them. Key results move only from verified work. Every step is visible in one job timeline and every failure ends in a retry or a "Needs you" item.

**The release is done when, on a clean copy of `runtime.db`, the spine test passes and a real low-risk job completes end to end through the desktop with the owner touching only the goal box and the final approval.** Code presence does not count.

## 2. Ground rules

- **One canonical store:** the v2 runtime. No new writes to v1 desktop SQLite or Node JSON for workflow state.
- **Additive migrations only**, each preceded by an automatic copy of `runtime.db`.
- **Independent verifier per work package:** the author of a package never signs its acceptance. Proposed pairing is in §5.
- **Feature flags** (`settings.workflow.*`) for intake auto-routing, auto-accept, dispatcher, stand-ups, so each piece can be switched off in the field.
- **Tests first for the spine**, per spec §17.
- Work in a worktree per package; merge to `main` only after the verifier's evidence is recorded in the job.

## 3. Work packages

Sizes: S ≈ 0.5–1 day, M ≈ 2–3 days, L ≈ 4–6 days (one engineer-agent, including tests).

### WP0 — Truth and unblock (S) — *no dependencies*
- **Why first:** every session is `failed` and the one job is stuck, so nothing downstream can be tested.
- **Do:** (1) diagnose the 11 failed sessions from the transcript and `error` columns (usage limit vs adapter vs auth) and write the finding down; (2) generalize the Design Studio **Continue/Restart** (shipped in `9c9b3ca`) into `POST /v1/sessions/:id/retry` `{mode}` and a button on every failed session row; (3) mark the stuck job with a decision (plan it or cancel it).
- **Files:** `runtime/src/api/server.ts`, `runtime/src/acp/session-manager.ts`, `apps/desktop/src/screens/dev.tsx`, `job.tsx`.
- **Accept:** a failed session can be continued or restarted from Sessions and Job; failure reason is shown in plain words; test covers continue and restart for a non-design session.

### WP0b — Adapter readiness and Orchestrator binding (S–M) — *none, parallel to WP0*
- **Why:** the owner confirmed Orchestrator is a real agent, and that Antigravity (Gemini adapter) is not properly configured while Claude Code and Codex are. A dispatcher that assumes every adapter works will route work into failures.
- **Do:** (1) a readiness probe per adapter (command found, auth present, ACP `initialize` succeeds, a throwaway file-edit round trip in a temp folder) with the result stored and shown in Settings and Coworkers; (2) the dispatcher and stand-up wakes consider only adapters whose probe passed within the last N minutes; (3) bind the Orchestrator identity to an adapter that passes (Claude Code first, Codex fallback); (4) write down what Antigravity needs and file it as its own task, not as a blocker for this plan.
- **Files:** `runtime/src/adapters.ts`, `orchestrator.ts`, `api/server.ts`, `apps/desktop/src/screens/{settings,coworkers}.tsx`.
- **Accept:** a deliberately broken adapter shows `not ready` with the reason and receives no work; Orchestrator wakes and replies in a room; fallback to the second adapter is visible when the first is rate-limited or not ready.

### WP1 — Recurring schedules and daily stand-up (M) — *depends on WP0 only for retry*
- **Do:** spec §11. **Stand-up at 10:00 CAT, weekdays (owner decision).** Named idempotent seeds (`schedules.name` unique), timezone setting, stand-up collector (facts from events, wake only active agents, 10-minute timeout, absent vs no-update), `standups` unique per team/day, markdown copy, catch-up on start, Standups screen, schedule-health banner. `standup.submit` initially accepted as a bracket directive `[STANDUP: done=… | next=… | blockers=…]` so it ships before the protocol in WP3.
- **Files:** `runtime/src/orchestrator.ts`, `runtime/src/store/{migrations,repo}.ts`, `runtime/src/api/server.ts`, `apps/desktop/src/screens/` (new `standups.tsx`, nav).
- **Accept:** with the clock injected, the cron fires once per weekday; catch-up does not double-run; an offline agent is listed absent; an agent that did not reply is `no update`; no entry is fabricated; stand-up appears in the UI and `community/daily_standups/`.
- **Why early:** smallest visible win and fixes "only twice".

### WP2 — Schema for the spine (M) — *none*
- **Do:** spec §13 migrations (task deps/attempt/ack fields, job KR/milestone/triage, schedules name/timezone, standups key, inbox delivery, `tool_calls`, KR kind/source/weight). Backup-then-migrate helper. No behavior change.
- **Files:** `runtime/src/store/migrations.ts`, `repo.ts`, `api/types.ts`.
- **Accept:** migration runs on a copy of the real DB with identical row counts for existing tables; re-running is a no-op; rollback by file restore documented and tested.

### WP3 — Agent action protocol (L) — *WP2*
- **Do:** spec §7. Per-session MCP server in the runtime (HTTP/stdio bridge), session-scoped tokens, role permissions, audit rows, tool set v1, operating card replacing the long directive block in `buildPrompt` (keep `[WAKE]/[SCHEDULE]/[SPAWN]/[STATE]`). Pass the server in `session/new` and `session/load` (`mcpServers`).
- **Files:** new `runtime/src/agent-tools/` (server, tools, auth), `acp/client.ts`, `acp/session-manager.ts`, `types.ts`.
- **Accept:** a fake ACP agent can call `job.create`, `plan.submit`, `task.create`, `thread.post`, `standup.submit`, `blocker.raise`; invalid schema and unauthorized role are rejected with an actionable message; assignee `done` is rejected; claimed evidence is stored as `CLAIMED`; every call has an audit row; a real Claude, Codex and Gemini session each complete one tool call (manual evidence recorded).
- **Risk:** adapter MCP support differs; verify per adapter and keep the directive fallback.

### WP4 — Intake and triage (M) — *WP2, WP3*
- **Do:** spec §5–6.1. `POST /v1/intake`, dedupe, kind detection, KR suggestion, triage with a recorded reason; wire Home goal box, room messages in intake rooms, Design button (also creates the job), Sessions dock, `@lead`.
- **Accept:** the same text from five entry points yields one job each, with correct project and a `job.triaged` event; a duplicate request attaches to the existing job; ambiguity and risk keywords route to the planner path; no entry point creates local-only state.

### WP5 — Planner packet and auto-accept (M) — *WP3, WP4*
- **Do:** spec §6.2–6.3. Extend `JobPlan`, `plan.submit`, materialize tasks and criteria, planner selection by capability and observed availability, `planner_unavailable` handling, two-planner mode with `dissent`, approval item when a human decision or risk ≥ medium is present, auto-accept for low risk behind a flag.
- **Accept:** low-risk plan advances `plan→build` with no click; medium risk stops with an approval carrying recommendation and consequence; planner offline is recorded and shown; a plan is never labeled reviewed without a contribution row.

### WP6 — Dispatcher and recovery (L) — *WP2, WP3, WP5*
- **Do:** spec §4.2 and §8. Ready-queue from `depends_on`, assignee selection, ack timeout, bounded retry with backoff, fallback adapter, concurrency limits, stale sweep, Needs-you items on exhaustion, job auto-return `verify→build` on failed verification.
- **Accept:** failure matrix from spec §17 passes (session failure, no ack, rate limit with and without fallback, verifier unavailable); a task never stays `running` without events past the threshold; limits are respected under load (10 ready tasks, 2 slots).

### WP7 — Independent verification hardening (M) — *WP6*
- **Do:** spec §10.1. `needs_review` state, criterion→evidence mapping, runtime-only `OBSERVED`, verifier selection excluding assignees and unavailable agents, test that proves transcript completion alone never passes.
- **Accept:** self-verification impossible through API and tools; a criterion with only `CLAIMED` evidence blocks `approve`; verifier outage shows a waiting reason, not a pass.

### WP8 — Communication unification (M) — *WP2, WP3*
- **Do:** spec §10.2. `messages.kind` and job/task/project links, job thread auto-created, inbox delivery states via `agent_wakes`, announcements lead-only, importer for the 11 legacy threads and 2 announcements, markdown mirror kept.
- **Accept:** an `inbox.send` shows created→delivered→acknowledged, or the failure reason; legacy threads appear under their projects; a failed wake never reads as delivered.

### WP9 — Strategy linkage and computed OKRs (M) — *WP2, WP7*
- **Do:** spec §12. KR kinds, linking UI, computed progress with `UNKNOWN`, remove dead queries, split the health score. **Keep the 46 `project_tasks` untouched (owner decision) and add archive, unarchive and confirmed delete for tasks and jobs** (`archived_at`, endpoints, buttons on Projects and Job screens, archived items excluded from KR math, deletions recorded as events).
- **Accept:** archiving hides a task everywhere by default and restores it; delete requires the item to be archived and a confirmation; the 46 legacy tasks are unchanged after migration; a KR with no linked job shows `UNKNOWN`; completing a verified linked job moves its outcome KR by the documented weight; no number is shown that cannot be traced to a job or a declared source.

### WP10 — Skills (M) — *WP3*
- **Do:** spec §9. `skills.ts` loader, `skill.list/read`, selection at dispatch, hashes stored on tasks, the initial twelve skills written from Codex's catalog.
- **Accept:** a task's packet lists exactly the skills selected by trigger; editing a skill changes its hash and shows on the next task; agents cannot read skills not selected unless they call `skill.read`.

### WP11 — Needs-you, job timeline and settings UI (L) — *WP4–WP8*
- **Do:** spec §15. Unified Needs-you list, job timeline, generalized retry, Settings (timezone, stand-up time, auto-accept, limits).
- **Accept:** from the desktop alone, an owner can start, inspect, retry, approve and verify work; reload and restart preserve state; each label matches backend state.

### WP12 — Always-on background service (M) — *WP1, WP0b* (owner approved a background service)
- **Do:** spec §11.3. launchd `LaunchAgent` that keeps the runtime running, install/uninstall from Settings, single-instance lock shared with the app (the runtime already has `lock.ts`), status shown in the UI; catch-up logic already ships in WP1.
- **Accept:** with the window closed, the 10:00 CAT stand-up runs and is visible on next open.

## 4. Sequencing

```
WP0b (adapter readiness, Orchestrator binding) ─ feeds WP1, WP6, WP12
WP0 ─┬─ WP1 (stand-ups)                         ← first visible win
     └─ WP2 ─┬─ WP3 ─┬─ WP4 ─ WP5 ─ WP6 ─ WP7 ─ WP9
             │       ├─ WP8
             │       └─ WP10
             └──────────────────────────────── WP11 (continuous, lands after WP4–WP8)
WP12 after WP1 and WP0b
```

**First vertical slice (the keystone, WP0+WP2+WP3(min)+WP4+WP5(quick path)+WP6(min)+WP7(min)):** one low-risk job entered from Home goes intake → quick triage → plan with one task → dispatch → check → independent verification → owner approval. Build this thinnest path before widening any package.

Suggested calendar if one agent per package and two in parallel: week 1 WP0, WP1, WP2; week 2 WP3 and the slice test; week 3 WP4, WP5; week 4 WP6, WP7; week 5 WP8, WP9, WP10; week 6 WP11, WP12 and hardening. Re-plan after the slice; estimates are for sizing, not a promise.

## 5. Proposed ownership and verification

Roles, not commitments. Winston and the agents confirm in thread 041.

| Package | Implementer | Independent verifier |
|---|---|---|
| WP0b | Atlas (platform) with Codex checking the Codex adapter path | Kael |
| WP0, WP1 | Loom or Quill (already on the desktop UI/terminal) with runtime help from Atlas | Kael |
| WP2, WP3, WP6 | Atlas or Nexus (platform/runtime) | Sentinel |
| WP4, WP5 | Sage (planner logic) + a runtime engineer | Kael |
| WP7, WP8 | Kael-adjacent engineer; **not** Kael as implementer of WP7 | Sentinel |
| WP9 | Meridian (organizational infrastructure) | Antigravity (browser check of the OKR screen) |
| WP10 | Codex (authored the skill contract) | Sage |
| WP11 | Loom | Antigravity |
| WP12 | Atlas | Kael |

Cadence (this document's author) is the design owner: reviews package designs against the spec, maintains the spec, and does not implement a package it verifies.

## 6. Mapping to Codex's phases

| Codex phase | This plan |
|---|---|
| P0 onboarding and vocabulary | Done by Codex (`AGENTS.md`, skills README); WP10 adds the loader |
| P1 canonical store and data contract | **Decided:** v2 runtime. WP2 is the schema; a short ADR (`community/proposals/ADR-001-canonical-store.md`) should record the decision before WP2 starts |
| P2 orchestrator intake, triage, planning | WP4, WP5 |
| P3 skills and communication | WP3 (protocol), WP8, WP10 |
| P4 verification and recovery | WP6, WP7 |
| P5 project/OKR/artifacts/daily coordination | WP1, WP9 (+ spec §16 for design artifacts) |
| P6 unify desktop surfaces | WP11, WP12 |

One change of ordering: stand-ups (WP1) move to the front, because they are independent of the rest, fix a visible failure, and exercise the scheduler path the later packages rely on.

## 7. Cross-cutting acceptance checks (run at every merge)

1. `npm test` in `runtime/` and `npm run typecheck` in both packages.
2. Spine test and failure matrix.
3. Migration dry-run on a copy of the real `runtime.db`.
4. No new code path records a pass without runtime-captured evidence.
5. No screen displays a number that is not traceable (KR, health, counts).
6. Feature flags default to **off** in the first release candidate; each is enabled one at a time with the owner's sign-off.

## 8. Risks to schedule

| Risk | Plan |
|---|---|
| Real adapters do not honor `mcpServers` equally | Spike WP3 on Claude, Codex and Gemini first (half a day each); keep directive fallback |
| Agent usage limits starve stand-ups and retries | Prefer fallback adapters; stand-up wakes only active agents; show quota state in Needs-you |
| Migration corrupts the live DB | Automatic backup, dry-run on copy, forward-only additive changes |
| Parallel packages touch `repo.ts` and `server.ts` (4.6k and 1.3k lines) | Split new code into new modules; keep edits to those files as thin wiring; one writer per file at a time |
| Owner overload from approvals | Auto-accept for low risk, bundled questions with recommendations |

## 9. Owner decisions (Winston, 2026-11-03)

- **Auto-accept low-risk plans:** yes.
- **Stand-up:** 10:00 CAT (Africa/Lusaka, UTC+2), weekdays.
- **Orchestrator:** a real agent. Antigravity is not properly configured (Claude Code and Codex are), hence WP0b.
- **Background service:** acceptable (WP12).
- **46 legacy tasks:** keep for now; the owner must be able to archive or delete tasks (WP9).

Still open: which adapter Orchestrator runs on first (proposal: Claude Code, Codex fallback); what "properly configured" means for Antigravity (for its readiness probe); whether weekends are skipped (proposal: yes).
