# MyaOS v2 Workflow Engine — Design Specification

**Author:** Cadence (session-scoped, registered 2026-11-03)
**Status:** Proposed; owner decisions recorded in §19 (2026-11-03). No runtime code is changed by this document.
**Thread:** [`041_myaos_workflow_from_scratch.md`](../threads/041_myaos_workflow_from_scratch.md)
**Builds on:** Codex's [`MYAOS_WORKFLOW_OPERATING_MODEL.md`](MYAOS_WORKFLOW_OPERATING_MODEL.md) and [`MYAOS_WORKFLOW_IMPLEMENTATION_PLAN.md`](MYAOS_WORKFLOW_IMPLEMENTATION_PLAN.md). Evidence: [`MYAOS_V2_WORKFLOW_AUDIT.md`](MYAOS_V2_WORKFLOW_AUDIT.md).
**Companion plan:** [`MYAOS_V2_WORKFLOW_IMPLEMENTATION_PLAN.md`](MYAOS_V2_WORKFLOW_IMPLEMENTATION_PLAN.md)

---

## 0. Position in one paragraph

Thread 041's first pass audited the v1 Tauri desktop (`desktop/`) and the Node runtime (`src/`) and left "which store is canonical?" open. **The answer is the v2 runtime** (`runtime/`, store `~/.myaos/runtime.db`, UI `apps/desktop`). It already owns jobs, stages with gates, tasks, evidence, approvals, rooms, sessions, an orchestrator with timers/cron, threads, announcements, stand-ups and OKRs. What it lacks is not features; it is **connective tissue**: nothing converts a request into a job, agents have no way to act on the system they run inside, nothing advances a job after the plan stage except one hook, and nothing creates recurring work. This spec adds that tissue without a rewrite. The v1 desktop and the Node runtime become read-only sources that are imported once, not parallel authorities.

## 1. Evidence (v2, observed 2026-11-03)

See the audit for method. The facts that drive the design:

| Observation | Source | Consequence |
|---|---|---|
| Agent prompt teaches only `[WAKE]`, `[SCHEDULE]`, `[SPAWN]`, `[STATE]` | `runtime/src/acp/session-manager.ts` `buildPrompt` | Agents cannot create plans, tasks, evidence, threads or stand-ups. |
| ACP sessions start with `mcpServers: []` | `runtime/src/acp/client.ts` (`session/new`, `session/load`) | There is a clean, standard extension point for giving agents structured tools. |
| Stage machine `brief→plan→build→verify→approve→done` with gates; only `build→verify` is automated | `store/repo.ts` `STAGE_TRANSITIONS`, `gates()`, `Orchestrator.handleTurnComplete` | Gates are good; the missing piece is the actor that satisfies and advances them. |
| Tasks have `position` only: no dependencies, no retries, no acknowledgement state | `api/types.ts` `Task` | Sequencing and recovery cannot be expressed. |
| Plan is `{summary, options, chosen, approvedAt, councilId}`; tasks are separate rows | `JobPlan`, `setPlan` | A plan does not carry its tasks or criteria; a planner has nowhere to put them atomically. |
| Orchestrator `tick()` runs every 2s and supports `cron` | `orchestrator.ts` | The scheduler exists. Zero recurring schedules exist (3 one-shot rate-limit timers). |
| `POST /v1/rooms/:id/messages` only reacts to `@mention`/directives | `api/server.ts`, `handleRoomMessage` | A message "I need feature X" creates nothing. |
| Live data: 1 job (stuck in `plan`), 0 tasks, 11 sessions all failed, 9 rooms with 0 messages, 2 stand-ups (last 2026-09-05, imported), 11 threads (last 2026-09-07, imported) | `~/.myaos/runtime.db` | The v2 job loop has never completed once. Nothing downstream of it has been exercised. |
| 46 legacy `project_tasks`, 0 with `okr_kr_id`; jobs have no KR/milestone link | DB | Strategy is not connected to work. |
| KR `telemetry_query` references tables that do not exist; health score = 60% evidence ratio + 40% typed-in objective progress | `okr_key_results`, `getRealityHealthScore` | Progress numbers are decorative. |

## 2. Answers to the five open decisions in thread 041

1. **Canonical store/service.** The v2 runtime and `runtime.db`. Everything else is an import source.
2. **Planner identities.** Planners are chosen by capability and observed availability, not by roster name. In this repository Sage is the declared Planner; Themis/Daedalus/Mira are MeetingMind-scoped. A planner is "available" only if its identity has an adapter/runtime and its adapter is not rate-limited (the runtime already tracks both). Orchestrator and Ledger currently have **no runtime/adapter** and cannot be woken; see §14.
3. **Skills.** Skills are markdown files with front matter in `community/skills/<id>/SKILL.md`, versioned by content hash. The runtime resolves skills at dispatch time and injects only the selected skills into the task packet. Details in §9.
4. **Daily scheduling when the desktop is closed.** The runtime process is bundled in the app and dies with it. Stand-ups therefore need either a background service (launchd agent running `runtime/src/main.ts`) or an explicit "catch-up on next start" rule. Recommend both: catch-up always, launchd optional. Details in §11.
5. **State transitions, timeouts, retries.** Defined in §4 and §8.

## 3. Design principles

1. **One spine.** Request → job → plan → tasks → execution → independent verification → approval → ship → strategy update. Every surface enters the same spine.
2. **Agents act through tools, not prose.** Parsing free text is the fallback, not the interface.
3. **Declared ≠ available ≠ assigned ≠ acknowledged ≠ done ≠ verified.** Each is a separate recorded state. (Codex's principle 2; the v2 DB already has the vocabulary: `OBSERVED`, `UNKNOWN`, evidence classes.)
4. **The runtime advances; humans decide.** Mechanical transitions are automatic. Human gates exist only where §4 lists them.
5. **Fail loud, retry bounded.** A failed session never leaves a task looking active. Every failure ends in a retry, a reassignment, or a "Needs you" item.
6. **Honest numbers.** Unlinked or unmeasured values display `UNKNOWN`, never a seeded number.
7. **Additive migration.** New columns/tables only. No destructive change to existing data. Back up `runtime.db` before every migration.

## 4. Lifecycle state machine

### 4.1 Job stages (unchanged names; new triggers)

| Transition | Today | Proposed trigger | Human gate? |
|---|---|---|---|
| (none) → `brief` | manual create | **Intake** (§5) from any surface | No |
| `brief` → `plan` | manual | Automatic when a planner is dispatched | No |
| `plan` → `build` | manual (needs plan + ≥1 task) | Automatic when plan is submitted **and** (risk is `low` and budget within limit **or** owner accepted) | **Only** when risk ≥ `medium`, budget over threshold, or the plan lists unresolved human decisions |
| `build` → `verify` | automatic (Kael) | Keep; add retry and verifier-unavailable handling (§8) | No |
| `verify` → `build` | manual | Automatic on a failed verification, with the failing criterion attached | No |
| `verify` → `approve` | manual | Automatic when all criteria reach `OBSERVED` (existing gate) | No |
| `approve` → `done` | manual | **Owner approval (the intended human gate)** | **Yes** |
| `done` → ship | manual | Automatic commit/PR for `code` jobs after approval, per existing `/ship` | No |

### 4.2 Task states

Today: `pending | running | done | failed | blocked`. Add two without renaming any: `assigned` (dispatched, not yet acknowledged) and `needs_review` (implemented, awaiting independent verification).

```
pending ──dispatch──▶ assigned ──agent acks (first turn starts)──▶ running
   ▲                      │ no ack in T_ack                         │
   │                      ▼                                         ├─ check passes ─▶ needs_review ─verifier─▶ done
   └──── retry (≤N) ── failed/blocked ◀── session failed / rate-limited ┘                      │ fail
                                                                                              ▼
                                                                                          failed (reopen with evidence)
```

Defaults (all overridable per project): `T_ack` = 2 min; retries `N` = 2 with 1 min then 5 min backoff; a rate-limited adapter triggers fallback adapter if enabled, else a deferred wake at `resetAt` (both already exist in `wakeAgent`).

## 5. Intake

**Goal:** one function turns a request into a job, from any screen.

`POST /v1/intake` `{ text, source, roomId?, projectId?, actorId, attachments? }` → `{ job, route, plannerSessionId? }`.

Sources, all calling the same endpoint: Home goal box, room message (no `@` needed in a room whose mode is "intake"), the Design button (already creates a board; it should also create the job), the Sessions dock, `@lead`, and agents via the `job.create` tool.

Steps (all in the runtime, deterministic where possible):
1. **Normalize.** Trim, detect kind (`code | research | ops | design | decision`) with a rule set first, a cheap model second.
2. **Dedupe.** Compare against open jobs in the same project (title similarity + same room). If a match scores high, attach as a comment on the existing job and return it instead of creating a new one.
3. **Link.** Resolve project (explicit, or room's project). Suggest a Key Result by keyword overlap with KR titles; store as `suggested_kr_id`, not `okr_kr_id`. The human or planner confirms. Unknown stays unlinked.
4. **Create job** in `brief` with the request as the brief and the source recorded in the history.
5. **Triage** (§6) and dispatch.

An intake agent is **optional**. The runtime does steps 1–4 itself; this removes a dependency on an agent being available for the most basic operation.

## 6. Triage and planning

### 6.1 Triage rule (deterministic, recorded)

Quick path when all hold: one project, `risk=low`, clear acceptance criteria can be derived from the brief, reversible, no security/privacy/data/release keywords. Otherwise planner path. The route and the reason are stored as an event (`job.triaged`), so "why was no planner consulted?" is always answerable.

### 6.2 Plan packet (new, structured)

Extend `JobPlan` additively:

```ts
interface JobPlan {
  summary: string;                 // existing
  options?, chosen?, approvedAt?, approvedBy?, councilId?;   // existing
  tasks?: PlannedTask[];           // NEW: planner proposes; runtime materializes into `tasks` on accept
  criteria?: string[];             // NEW: falsifiable acceptance criteria
  risks?: { text: string; mitigation?: string }[];
  humanDecisions?: { question: string; recommendation: string; consequence: string }[];
  assumptions?: string[];
  dissent?: { by: string; text: string }[];   // preserved disagreement
  author: string; version: number;
}
interface PlannedTask { key: string; title: string; assigneeRole: string; mode; checkCommand?; dependsOn?: string[]; skills?: string[] }
```

`plan.submit` (an agent tool, §7) validates, stores a new version, and, if auto-accept conditions hold, materializes tasks (with `depends_on`), adds criteria and advances to `build`. Otherwise it files an approval ("Needs you") with the plan, the recommendation and the consequence of each choice.

### 6.3 Planner selection

Triggers for the planner path are Codex's list (material ambiguity, multi-project/specialty, architecture/security/privacy/data/release risk, strategic choice, repeated failure). Selection: identities with a planning capability, whose adapter exists and is not rate-limited, preferring the project's team. If none is available the runtime records `planner_unavailable`, uses the quick path with a visible banner, and never labels the plan "council reviewed". When two perspectives are wanted (product + engineering), run two planner sessions and attach both packets; the runtime does not synthesize disagreement away (it stores `dissent`).

## 7. Agent action protocol

### 7.1 Mechanism

Give every session a **per-session MCP server** exposed by the runtime and pass it in `session/new`'s `mcpServers` (today `[]`). Each tool call is authenticated with a session-scoped token, attributed to the calling agent and session, validated against a schema, authorized by role, and written as an event. This replaces parsing prose for anything that changes state.

Why MCP over more bracket directives: validated schemas, structured errors the agent can correct, no brittle line-start regexes, and every ACP-compatible adapter (Claude, Codex, Gemini) can use it. Keep `[WAKE]`/`[SCHEDULE]`/`[SPAWN]` working as-is for backward compatibility.

### 7.2 Tool set (v1 of the protocol)

| Tool | Who | Effect | Notes |
|---|---|---|---|
| `job.get`, `job.list` | all | read | scoped to the agent's rooms/projects |
| `job.create` | lead, planner, intake | create job in `brief` | goes through dedupe (§5) |
| `plan.submit` | planner, lead | store plan packet; may auto-advance | §6.2 |
| `task.create`, `task.update` | planner, lead; assignee may update own status notes | rows with `depends_on` | cannot mark own task `done` (see §10) |
| `task.claim`, `task.report` | assignee | ack + progress | ack clears `assigned` |
| `evidence.add` | any | evidence row, class `CLAIMED` unless runtime-observed | self-reported is never `OBSERVED` |
| `thread.post` | all | message on the job thread (auto-linked) | §10 |
| `inbox.send` | all | targeted action request | creates a delivery record |
| `announce` | lead only | broadcast | |
| `standup.submit` | all | structured daily update | §11 |
| `blocker.raise` | all | task → `blocked` + Needs-you item | carries the question and a recommendation |
| `kr.link` | planner, lead | propose KR link | confirmed by owner or lead |
| `skill.list`, `skill.read` | all | discover/read skills | §9 |
| `design.request`, `design.import` | all | design board runs | wraps what exists |

Every tool returns a compact result plus the next suggested action, so an agent that has just created a task learns what it can do next.

### 7.3 Prompt contract

`buildPrompt` is rewritten around a short, role-aware **operating card** (what the job is, what tools exist, where to talk, when to stop and ask), assembled from the task packet and the selected skills, not an ever-growing paragraph of directives. The card is versioned and its version recorded on the session (so a regression can be traced to a card change).

### 7.4 Safety

Least privilege per role, per-session tokens that die with the session, rate limits per tool, a hard cap on tasks created per job, and a "dry-run" mode for tests. Tool calls that change external state (ship, deploy) are not part of this set; they stay behind approvals.

## 8. Dispatch, execution and recovery

A **dispatcher** (new, runs in the existing `tick`) owns moving ready tasks into sessions:

1. A task is *ready* when its `depends_on` are `done` and the job is in `build`.
2. Choose the assignee: explicit, else by `assigneeRole` → capability + observed availability + current load (existing identity status fields).
3. Create the session through `SessionManager.start` (existing), set the task `assigned`, record a delivery attempt.
4. On first agent turn, set `running` (ack). No ack within `T_ack` → one retry, then fallback adapter, then `blocked` + Needs-you.
5. On session failure or rate limit: retry with backoff (existing auto-resume timer handles the rate-limit case), bounded by `N`. After `N`, task `failed`, job gets a Needs-you item with the exact error and two buttons: **Continue** / **Restart** (the same pair added to Design Studio runs this week; generalize them to all sessions).
6. Concurrency limit per project and per adapter to avoid thrashing quota.

A **stale sweep** (every 10 min) flags tasks `running` with no event for longer than a threshold, and jobs stuck in a stage longer than a threshold.

## 9. Skills

- Location and format: `community/skills/<skill-id>/SKILL.md` with front matter `{ id, version, owner, triggers[], inputs[], tools[], completion_evidence[] }`. Body: ordered steps, output contract, escalation boundary. Codex's [`../skills/README.md`](../skills/README.md) defines the contract; this spec only adds the loader.
- Runtime: `skills.ts` scans the directory at start and on change, hashes each file, exposes `skill.list/read`.
- Selection at dispatch: triggers match task `mode`, job `kind` and keywords. The chosen skill ids and hashes are stored on the task and included in the operating card. An agent never receives skills that were not selected.
- Initial set (matches Codex's list): intake triage, project context, planner packet, decomposition, design artifact, implementation, handoff, independent verification, release safety, OKR evidence, stand-up, failure recovery.

## 10. Verification and communication

### 10.1 Verification

Keep the Independent Verifier Rule exactly as the charter states it. Concretely:
- `task.update` rejects `done` from the assignee. `done` is set only by the runtime (check passed) **and** a non-assignee verifier session.
- The runtime already runs the task's `checkCommand`; verification adds criterion-level mapping: each criterion links to the evidence ids that satisfy it. A criterion reaches `OBSERVED` only from runtime-captured evidence (command output, diff, browser result), never from an agent's own statement.
- Verifier unavailable → job waits with a visible reason; never auto-passes.
- Remove any path that records a pass from transcript completion alone (Codex found one in the v1 desktop; the v2 runtime has none, keep it that way and add a test).

### 10.2 Communication model

| Channel | Purpose | Created by | Delivery tracked? |
|---|---|---|---|
| **Job thread** | The one place work is discussed; auto-attached to a job | runtime on job create | yes |
| **Room** | Broad/standing discussion and human chat | owner | yes |
| **Inbox item** | A specific action requested of one agent | `inbox.send`, or runtime on assign/review/approval | **created → delivered (woken) → acknowledged → resolved** |
| **Announcement** | Lead/owner broadcast | `announce` | read receipts optional |
| **Stand-up** | Daily structured update | scheduler (§11) | n/a |

Today these are four unconnected tables plus markdown mirrors. Proposed: a single `messages` surface with `kind` (`chat | handoff | decision | blocker | status | announcement`) and `job_id/task_id/project_id` links, with the existing thread/inbox/announcement tables kept as views or migrated additively. The markdown bridge (`community/threads/desktop/`, `community/inboxes/`) continues as the human-readable mirror.

Delivery semantics: a message that is `inbox` or `handoff` and addressed to an agent creates a **wake** (existing `agent_wakes` table). If the wake fails or is deferred, the item shows `delivered: false` with the reason.

## 11. Daily operations

### 11.1 Seeded schedules (created idempotently at runtime start)

| Name | Cron (project timezone) | Action |
|---|---|---|
| `standup.daily` | `0 10 * * 1-5` (10:00 CAT, Africa/Lusaka, UTC+2) | Stand-up flow below |
| `standup.catchup` | on runtime start | If today's stand-up (past 10:00 CAT) is missing, run it |
| `retro.weekly` | `0 16 * * 5` | Weekly summary: shipped, KR movement, stale items |
| `sweep.stale` | `*/10 * * * *` | §8 stale sweep (pure runtime, no agent) |
| `sweep.health` | `*/5 * * * *` | Adapter/identity availability refresh |

The scheduler computes cron in **UTC** today (`nextCronDate`). Add a `timezone` setting and convert (default `Africa/Lusaka`, per the owner's decision).

### 11.2 Stand-up flow

1. **Collect facts** from events since the last stand-up: tasks started/finished/failed, verifications, blockers, approvals, messages, session failures per agent. This is the runtime's own data and never fabricated.
2. **Wake each active agent** (identity has runtime, not rate-limited, has an open task or activity in the window) with a prompt containing *their* facts and a request to call `standup.submit {done, next, blockers, needs}`. Agents with nothing open are skipped and listed as idle. Rate-limited/offline agents are listed as **absent** with the reason.
3. **Timeout** (10 min): agents that did not submit are recorded as **no update**, not filled in.
4. **Write** one `standups` row (existing table; `parsed_updates` already exists) plus a markdown copy to `community/daily_standups/`.
5. **Surface** in a Standups screen and the Home digest; blockers become Needs-you items.

Idempotency: one stand-up per date per team (unique key), so catch-up and the cron cannot double-run.

### 11.3 When the app is closed

The runtime is a child of the desktop app. Options: (a) launchd `LaunchAgent` that keeps `runtime/src/main.ts` running (best; also lets agents finish while the window is closed), (b) catch-up on next launch (always on). **Decided (owner): a background service is acceptable.** Ship (b) first as the safety net, then (a) as a Settings toggle (default on once verified), which also covers the existing "Keep Mac awake" use case.

## 12. Strategy linkage

Chain: `Objective → Key Result → Job → Tasks → Evidence`, with `Milestone` grouping jobs inside a project.

- Add `jobs.okr_kr_id`, `jobs.milestone_id`, `jobs.suggested_kr_id` (nullable).
- KR types: `metric` (a real measured number with a source), `outcome` (completes when its linked jobs are `done` with verified criteria), `manual` (explicitly owner-entered, labeled as such).
- **Computed progress:** outcome KRs = verified-done weight / total weight of linked jobs; metric KRs read their declared source; if there is no source or no linked job the value is `UNKNOWN`. Objective progress = mean of its KRs that are not `UNKNOWN`, shown with "n of m measured".
- Drop the dead `telemetry_query` strings (or mark them `UNVERIFIED` until a runnable source exists).
- Health score: report evidence ratio and OKR coverage separately; do not blend with typed-in values.
- Legacy: **keep the 46 `project_tasks` as they are for now (owner decision)**; do not migrate or delete them. Add archive and delete for tasks and jobs: `archived_at` column; `POST …/archive` and `…/unarchive` (reversible, hidden from default views, excluded from KR math); `DELETE` only on archived items and behind a confirmation that states what is removed. Deletions are recorded as events.

## 13. Data model changes (additive)

```
tasks:       + depends_on TEXT (json array of task ids)
             + attempt INTEGER DEFAULT 0, + last_error TEXT, + acked_at TEXT, + assigned_at TEXT
             + skills TEXT (json: [{id,hash}])
jobs:        + okr_kr_id, + milestone_id, + suggested_kr_id, + triage TEXT (json route+reason)
             + plan_version INTEGER
plans:       (stored in jobs.plan JSON; add tasks/criteria/risks/dissent per §6.2)
inbox_items: + delivery_state TEXT, + wake_id TEXT, + task_id, + job_id
standups:    + team_id, + source ('scheduled'|'catchup'|'manual'), UNIQUE(team_id, standup_date)
schedules:   + name TEXT UNIQUE (for idempotent seeding), + timezone
sessions:    + card_version TEXT
okr_key_results: + kind ('metric'|'outcome'|'manual'), + source TEXT, + weight REAL
tool_calls:  NEW (session_id, tool, args_hash, result, actor, at)   -- audit of §7
```

Migration policy: forward-only, wrapped in a transaction, preceded by an automatic file copy of `runtime.db`; every new column nullable or defaulted.

## 14. Identities, onboarding and runtime availability

- **Orchestrator** and **Ledger** exist as identities but have **no adapter/runtime**, so they cannot be woken. Decide: (a) bind them to an adapter, making the orchestrator a real coordinating agent, or (b) retire the identities and let the runtime's dispatcher (§8) be the orchestrator, with a *human-readable* orchestrator persona only for the UI. **Decided (owner): Orchestrator is a real agent.** Mechanical dispatch (ready-queue, retries, sweeps) still runs in the runtime so it works when no agent is available; the Orchestrator agent handles judgment (triage disputes, planner synthesis, assigning roles). **Constraint from the owner:** Antigravity (Gemini adapter) is not properly configured, unlike Claude Code and Codex. So Orchestrator is bound to the Claude Code or Codex adapter first, and the dispatcher treats an adapter as eligible only when a readiness probe passes (see plan WP0b).
- Root `AGENTS.md` (Codex wrote it) becomes the single onboarding entry, and the operating card (§7.3) is generated from the same source so the two cannot drift.
- Registry drift: `AGENTS_REGISTRY.md`, `agents.json` and `identities` disagree. Add a check that reports differences; do not auto-fix.

## 15. UI changes (apps/desktop)

| Screen | Change |
|---|---|
| Home | Goal box → `POST /v1/intake`; shows route taken and planner status |
| Needs you (new, replaces the approvals-only view) | Approvals, plan reviews, blockers, failed runs with Continue/Restart, stand-up blockers; one list, sorted by age |
| Job | Timeline (stage history, plan versions, tasks with dependency order, deliveries/acks, evidence, thread); retry/continue on any failed task |
| Sessions | Generalized Continue/Restart; "Design" button (shipped) |
| Standups (new) | Per-day view, absent/no-update shown explicitly, schedule health |
| OKRs | Linked jobs per KR, computed vs manual badge, `UNKNOWN` states |
| Settings | Timezone, stand-up time, auto-accept policy, concurrency limits, background-service toggle |

## 16. Design Studio as an artifact of the same spine

- A design request creates (or attaches to) a job with a `design` task (mode already exists). The board is the task's artifact.
- Approval pins a frame **version**; the existing `approveFrameAndHandoff` creates the build task. Extend it to store the approved version id on the task and to invalidate the approval when a newer version is approved for iteration.
- Files written anywhere by an agent reach the board via the folder watcher and `design.import` (shipped this week in commit `9c9b3ca`).

## 17. Test strategy

Use the existing `node --test` harness with the fake ACP agent fixture.
- **Spine test (the keystone):** fake agents run intake → plan.submit → dispatch → check → verifier → approve → done, asserting each stage transition and the event trail.
- **Failure matrix:** session fails; no ack; rate limit with fallback; rate limit without fallback; verifier unavailable; plan with human decision (must stop).
- **Protocol tests:** every tool's schema, authorization, audit row; assignee cannot self-verify; claimed evidence is never `OBSERVED`.
- **Stand-up tests:** idempotency (cron + catch-up), absent vs no-update, timezone conversion, no fabricated entries.
- **OKR tests:** `UNKNOWN` propagation; outcome KR math; legacy import preserves links.
- **Migration test:** run against a copy of the real `runtime.db`; row counts preserved; rollback by file restore.

## 18. Risks

| Risk | Mitigation |
|---|---|
| Agents misuse tools or loop | per-role permissions, per-tool rate limits, task-creation cap, audit table |
| Auto-accept ships a bad plan | auto-accept only for `risk=low`; always show a plan diff; verification gate and owner approval still apply |
| Quota burn from stand-up wakes | skip idle agents, wake only those with activity, one prompt per agent, cap per day |
| Planner unavailable | recorded fallback; never claim review |
| Scope creep | ship the vertical slice (plan §P1) first; everything else attaches to it |
| Two stores diverge | v2 runtime is canonical; v1 and Node are import-only with a one-time importer and a drift report |

## 19. Owner decisions (Winston, 2026-11-03)

| Question | Decision | Effect on this spec |
|---|---|---|
| Auto-accept plans for `risk=low`? | **Yes** | §4.1 and §6.2 stand as written; flag defaults on after the first verified end-to-end run |
| Stand-up time and timezone | **10:00 CAT** (Africa/Lusaka, UTC+2), weekdays | §11.1 updated; timezone stored per project, default Africa/Lusaka |
| Orchestrator real agent or dispatcher? | **Real agent**; Antigravity is not properly configured (Claude Code and Codex are) | §14 updated; adapter readiness probe added; bind Orchestrator to Claude Code or Codex first |
| Background service acceptable? | **Yes** | §11.3 updated; WP12 moves up |
| The 46 old v1 tasks | **Keep for now; the owner must be able to archive or delete tasks** | §12 updated; archive/delete added to WP9 |

### Still open
1. Which of Claude Code or Codex should Orchestrator run on first? (default proposal: Claude Code, with Codex as fallback)
2. What does "properly configured" mean for Antigravity, so we can write its readiness probe? (auth, ACP launch, a working file-edit round trip?)
3. Should weekend stand-ups be skipped (proposal) or run daily?
