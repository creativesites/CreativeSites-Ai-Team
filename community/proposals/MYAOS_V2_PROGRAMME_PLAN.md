# MyaOS V2: Detailed Implementation Programme

**Date:** 2026-11-03
**Status:** Plan for approval. No runtime code is changed by this document.
**Accountable planner:** Claude Code lead session, which owns this plan end to end at Winston's instruction.
**Inputs:**
- [Vision](MYAOS_V2_AUTONOMOUS_ORGANISATION_VISION.md): authoritative. Section numbers marked § refer to it.
- [Gap audit](MYAOS_V2_VISION_GAP_AUDIT.md): the evidence. Conflicts it identifies are cited as C1–C7.
- Cadence's [engine spec](MYAOS_V2_WORKFLOW_ENGINE_SPEC.md) and [workflow plan](MYAOS_V2_WORKFLOW_IMPLEMENTATION_PLAN.md): reused where still valid. This plan supersedes their work-package numbering (mapping in §9).

This plan answers Appendix A of the vision: it covers preserve and missing items, conflicts, shared contracts, designs, epics and tasks, dependencies, migrations, API and tool contracts, acceptance, risks, estimates, leads and verification.

---

## 0. Programme rules

1. **Contracts before code.** §2 lists eight shared contracts (K1–K8). A work package may build against a contract only after the contract is merged as a document with a version. Changing one needs a recorded proposal and the Planning lead's sign-off (Appendix A).
2. **Additive, versioned migrations.** Next schema version is `v10`. Never edit a shipped migration. Back up `runtime.db` automatically before each migration. Dry-run on a copy of the real database before merge.
3. **One canonical store.** No new workflow writes to v1 `data/myaos.db`, v1 desktop SQLite, `community/tasks/` or `tasks.json`. Those become import sources (C1, C4).
4. **Flags default off.** `settings.workflow.<feature>`, enabled one at a time with Winston's sign-off.
5. **Independent verification.** No package is accepted by its implementer. Each task records the commands run, exit status and verifier (repo `AGENTS.md`).
6. **Thin slice first.** After WP0, build the end-to-end slice S1 (§6) before widening any package.
7. **Honest numbers.** Every time, token or cost figure carries `actual`, `estimated`, `declared` or `unknown`. No pricing is invented.

---

## 1. Target architecture (one picture)

```
Winston ─► Desktop (apps/desktop) ──HTTP/SSE──► Runtime (runtime/) ──► runtime.db (only writer)
                                               │
              Orchestrator agent ◄─ACP+MCP─────┤  Workflow engine (deterministic):
              Planner / builder / QA agents ◄──┤   intake · state machines · dispatcher ·
                                               │   scheduler · approvals · verifier ·
                                               │   resource ledger (time + usage) · skills
                                               └─► git worktrees (one per task)
```

The engine never waits on the Orchestrator agent. If that agent is down, intake still creates jobs, triage falls back to rules, and the dispatcher keeps running (§2.2).

---

## 2. Shared architectural contracts (decide once, build many)

### K1: Canonical code and store *(WP0, blocks everything)*
- `main` becomes the V2 line. Merge `claude/desktop-app-ai-teams-2fa62f` into `main` (C1).
- `desktop/` (v1 Tauri app), `src/` (Node runtime) and the v1 daemons become **legacy**. Each gets a `LEGACY.md`, no new features, and is removed after the import is verified.
- The store is `~/.myaos/runtime.db`. `data/myaos.db` and `data/provenance.log` stay out of git, keeping V2's deletion.
- Node 24 is the supported engine, as declared. CI runs Node 24.

### K2: Event envelope and taxonomy *(WP1)*
Extend the existing `events` table; do not create a new bus. Envelope: `seq, id, type, actor_kind (human|agent|runtime), actor_id, subject_type, subject_id, job_id, task_id, session_id, project_id, payload, idempotency_key, created_at, prev_hash, hash`.

New types to add:
- **Tasks:** `task.assigned`, `task.acknowledged`, `task.ack_timeout`, `task.retry_scheduled`, `task.reassignment_required`, `task.needs_human`, `task.verified`
- **Intake and planning:** `intake.received`, `job.triaged`, `plan.submitted`, `plan.auto_accepted`
- **Collaboration:** `handoff.created`, `handoff.acknowledged`, `blocker.raised`, `blocker.resolved`
- **Sessions:** `session.context_threshold`, `session.renewed`
- **Time and usage:** `time.interval_closed`, `time.adjusted`, `usage.recorded` (extended)
- **Budgets:** `budget.warning`, `budget.exceeded`
- **Operations:** `standup.requested`, `standup.completed`, `schedule.missed`, `schedule.caught_up`
- **Decisions:** `decision.recorded`

Rule: an event's `idempotency_key` is unique, so a replayed event is a no-op.

### K3: Task state machine *(WP1)*
```
pending → assigned → acknowledged → running → needs_review → verified → done
   any non-terminal → blocked | failed
   failed → retrying → assigned          (attempt < max_attempts)
   failed → reassignment_required → assigned (new assignee) | needs_human
```
- Transitions happen only through `repo.transitionTask(id, to, actor, reason)`, which validates the transition and emits one event each time.
- `PATCH /v1/tasks/:id` stops accepting `status`. This fixes the unchecked status write the audit found at `repo.ts:1268`.
- An assignee can never move its own task to `verified` or `done`.
- Defaults live in settings: `ackTimeoutSec=120`, `maxAttempts=3` (one run plus two retries), `backoffSec=[60,300]`, `staleSweepSec=600`.
- Job stages are kept. Add a stage-to-trigger table taken from Cadence's spec §4.1.
- Gate change (C7): `→approve` requires VERIFIED evidence for each criterion where `verification_required=1`.

### K4: Agent action protocol *(WP4; minimal version in S1)*
- The runtime hosts an **MCP server** (streamable HTTP on loopback) and passes it in `mcpServers` on `session/new` and `session/load`.
- Each session gets a token bound to `(identity_id, session_id, job_id?, task_id?)`, so an agent cannot act under another identity.
- Tool names follow vision §15. Each tool has a JSON Schema, a role permission check, an audit row in `tool_calls` and an `idempotency_key`.
- Business logic lives in `runtime/src/actions/*.ts`, independent of transport. MCP, HTTP and the bracket-directive fallback all call the same functions.
- Tool set v1, needed for S1: `job.get`, `plan.submit`, `task.claim` (which is the acknowledgement), `task.report`, `evidence.add` (stored as CLAIMED), `thread.post`, `blocker.raise`, `usage.report`, `context.report`.
- All other tools ship in WP4 to WP10.
- Fallback: when an adapter ignores `mcpServers`, it keeps the bracket directives. The runtime records `protocol=directive` on the session so the gap is visible.

### K5: Organisation and identity model *(WP2 schema, WP11 UI)*
- **New table** `departments(id, name, lead_identity_id)`. Seed it with the six approved departments in §13.
- **New identity columns:** `department_id`, `seniority (exec|lead|senior|member)`, `skills` (array of skill IDs), `providers` (array of adapter IDs, ordered by preference) and `permissions` (array of action names).
- `approval_level` stays as the authority used by the approvals engine.
- An identity is an employee and a session is an employee's working session, as the code already implements. Usage, time and performance records hang off `identity_id`, never off the session alone.
- Import from `community/agents.json`: `primary_domain` → department, using a mapping table reviewed by Winston once.

### K6: Resource ledger, time and usage *(WP9 and WP10 share it; designed in WP1)*
These tables are one ledger, so time and tokens reconcile per agent, task, job and project.

**`activity_intervals`**: one row per contiguous period of work.
- **Columns:**
  - who and where: `id, actor_kind (human|agent), identity_id, session_id, turn_id, job_id, task_id, project_id, engagement_id`
  - what: `category` (vision §6.1 categories for humans; `execute|plan|review|verify|standup|idle_excluded` for agents)
  - when: `started_at, ended_at, duration_ms` (from a monotonic clock where the runtime measured it)
  - origin: `source (timer|manual|turn|adjustment|import)`
  - billing: `billable_status (unclassified|billable|non_billable)`
  - corrections: `adjusts_interval_id, note, created_by, created_at`
- **Agent time** = turn intervals (prompt sent → `turn_end` or failure). The key is unique on `(session_id, turn_id)`, so a reconnect or replay cannot double-count. Session renewal starts new turn IDs under the same `identity_id`.
- **Human time** comes only from explicit timers or manual entries (§6.1). It is never derived from agent activity.
- **Parallel time:** agent-hours = sum of durations. Elapsed time = the union of intervals. Both are stored and shown (§6.1).
- **Corrections:** an adjustment is a new row with `source=adjustment` and `adjusts_interval_id`. Original rows are never updated (§6.4).
- **Restart safety:** an interval left open across a runtime restart is closed at the session's `last_event_at`, marked `closed_by=recovery`.

**`engagements`**: client, contract_ref, role, hourly_rate_minor, currency, min_weekly_hours, max_weekly_hours, start/end, external_time_system (e.g. Gusto), external_task_system (e.g. Jira), pay_schedule (may be `unknown`), billable_categories, `allow_agent_billing` (default **0**), period (weekly), approval_required.
- **Confidentiality rule:** engagement rows are created **only** in the local `runtime.db`, from an untracked file `~/.myaos/engagements.local.json`. Client names, rates, people and contract terms are never written to this repository, which is public, or to `community/`.
- **Billing model (owner decision, 2026-11-03):** only Winston's own human hours, as logged in the external time system, are billable. Agent hours are always `non_billable`. An agent interval can carry `supports_interval_id`, which links it to the human billable interval for the same task, so you can see what the AI did inside a billed hour without billing it separately.

**`timesheets`**: engagement_id, period_start, totals snapshot, state (`draft|submitted|approved`), approved_by, export_hash. An export is a CSV and PDF rebuilt from the intervals, and its hash proves the two reconcile (§18.3).

**`usage` (extended, per-turn token data where an adapter exposes it)**:
- **New columns:** `agent_id, task_id, project_id, provider, model_id, cached_input_tokens, cache_write_tokens, reasoning_tokens, measurement (actual|estimated|unavailable), context_used, context_size`. No cost columns: the team uses subscription plans, not per-token API billing (owner decision).
- **Mapper fix:** read the ACP `usage_update` fields `{used, size, cost}`. This is the adapter-fidelity risk in the audit.
- **Unique key** `(session_id, turn_id, kind)`.

**`model_registry`**: provider, model_id, context_window. No prices (subscription plans, owner decision).

**`ai_accounts`**: id, provider (`anthropic|google`), plan (`claude_pro`, `claude_team_or_client`, `google_ai_pro`), owner_scope (`client:<engagement_id>` or `personal`), surfaces (claude.ai / Claude Code / desktop share one limit; Gemini app; Gemini CLI), limit_model (`claude_5h_weekly_pct`, `gemini_app_5h_weekly_pct`, `gemini_cli_requests_per_day` with quota 1500). No token caps are stored, because neither provider publishes them.

**`account_limit_snapshots`**: account_id, captured_at, session_pct, session_resets_at, weekly_pct, weekly_resets_at, requests_today (Gemini CLI), source (`manual` from Claude Code `/usage` or Settings → Usage | `cli_capture` | `runtime_count`), measurement (`actual` for a read value | `estimated`).

**`task_usage`**: task_id, session_id, account_id, agent_id, model_id, started_at, ended_at, session_pct_before/after, weekly_pct_before/after, requests (Gemini CLI), `concurrent_tasks_on_account`, `attributed_weekly_pct`, measurement = **`estimated`** always. When several tasks share an account at once, the weekly delta is split by active time and the split is flagged.

**Per-task-type estimates:** median `attributed_weekly_pct` per (task type, model, agent), shown as estimates with sample size.

**Priority metric:** weekly % used per account, and which agents and task types consume it fastest.

**Alert:** when any account passes **70% of its weekly limit before the midpoint of its own weekly window** (measured from `weekly_resets_at`, not calendar Wednesday), raise a Needs You item and a `budget.warning` event.

**`budgets` (extended; for subscriptions a budget is a % of an account's weekly limit, never money)**:
- **Scopes:** add `agent`, `task`, `department` and `session`.
- **Kinds:** `weekly_pct`, `session_pct`, `requests_per_day`, and `tokens` where an adapter reports them.
- **Thresholds:** `warn_pct` and `hard_pct`.
- **Enforcement point:** each prompt send, not only session start. This fixes `assertBudget(job,0)`.

### K7: Session renewal policy *(WP10; minimal version in S1)*
- Policy keys: `contextPct.monitor=60, prepare=75, renew=85, block=95`. They resolve global → provider → model → identity.
- When `context_size` is unknown, fall back to the current absolute thresholds (36k soft, 64k hard), labelled `estimated` (C6).
- The existing baton capsule becomes the §7.3 continuation package. Add the vision fields it lacks: discoveries, decisions, commits, blockers, acceptance criteria and next actions. It is stored as an artifact and can be inspected from the desktop.
- Triggers: threshold crossed, unusual consumption (tokens per turn above 3× the agent's median), or manual. Each renewal emits `session.renewed` with the old and new session IDs.

### K9: AI account isolation *(WP0 follow-up; enforced from S1 onward)*
- Every project has `ai_account_id`. A job inherits it, and so does every session started for the job.
- **Client work runs only on that client's account; that account runs only that client's work.** Example: all work for a client engagement uses that client's Claude account, and nothing else does. Personal projects use Claude Pro or Google AI Pro. This is a contract security rule, not a preference.
- The dispatcher refuses (409 plus a Needs You item) any session whose adapter login is not the project's account. Adapter readiness (WP0-T6) records which account each adapter is signed in to.
- Projects marked `confidential` are excluded from `community-sync`. Their threads, inboxes and stand-up lines stay in `runtime.db` and are never written to the repository.
- No external AI service processes confidential project data unless that service is on the project's approved list.

### K8: Worktree policy *(WP4)*
- Each task gets its own worktree and branch, `myaos/job-<n>/task-<m>`, created from the job's integration branch `myaos/job-<n>` (C2).
- The runtime merges task branches into the job branch after verification passes.
- Merging to the base branch happens only through ship plus approval.
- A conflict creates a `needs_human` item or a conflict-resolution task. Agents never merge to protected branches.

---

## 3. Data migrations (v10+), all additive

| Ver | WP | Contents |
|---|---|---|
| v10 | WP1 | Task columns: `depends_on` (JSON), `priority`, `attempt`, `max_attempts`, `acknowledged_at`, `ack_deadline_at`, `next_retry_at`, `parent_task_id`, `required_skills`, `budget_tokens`, `verification_required`, `legacy_project_task_id`. Status CHECK widened to K3. Event envelope columns (K2). |
| v11 | WP2 | Job columns: `workflow (quick|feature|strategic|incident)`, `triage_reason`, `urgency`, `impact`, `intake_id`, `okr_kr_id`, `milestone_id`. New tables: `intake_requests`, `departments`. Identity columns (K5). |
| v12 | WP4 | `tool_calls` (audit), `session_tokens`, `handoffs`, `blockers`. `worktrees.task_id` brought into use. |
| v13 | WP6 | Schedule columns: `name` UNIQUE, `timezone`. New table: `schedule_runs` (due_at, ran_at, status, catch_up). `standups` unique per (team, date). Inbox `delivery_state`. Message links to job, task and project. `decisions` table. |
| v14 | WP9/10 | `activity_intervals`, `engagements`, `timesheets`, `model_registry`, `ai_accounts`, `account_limit_snapshots`, `task_usage`. Extended `usage` and `budgets`. Project columns `ai_account_id`, `confidential` (K9). |
| v15 | WP7 | KR `kind`, `source`, `weight`. `archived_at` on tasks and jobs. |
| v16 | WP8 | `skills` (id, version, content_hash, path). `task_skills` (task_id, skill_id, hash). |
| v17 | WP12 | Design frame status widened to add `review` and `superseded`. `design_task_id`. |

Backward compatibility:
- Old clients ignore new columns.
- The `PATCH` status removal is gated behind a deprecation that returns HTTP 409 with a message.
- Legacy `project_tasks` are untouched (owner decision, 2026-11-03).

---

## 4. Work packages

**Model tier** says which model runs the implementing agent, following the `hierarchical-model-orchestration` skill:
- **H** = Haiku, for bounded tasks.
- **S** = Sonnet, for multi-file work and design-sensitive work.
- **O** = Opus, for architecture and security.

Sizes: S ≈ 1 agent-day, M ≈ 2–3, L ≈ 4–6. These are estimates.

**Leads and verifiers** are proposals taken from `community/agents.json`. That file records what each agent declares it can do, not that it is online. Before anything is dispatched, WP0-T6 checks that each lead actually has a working adapter.

### WP0: V2 adoption and runtime foundations *(L; lead: Atlas; verifier: Kael)*
The full task specification is in §5.

### WP1: Unified work lifecycle *(L; lead: Nexus; verifier: Sentinel)*
| ID | Task | Tier | Accept |
|---|---|---|---|
| 1.1 | Publish K2 and K3 as `docs/contracts/` | O | Planning lead signs off |
| 1.2 | Migration v10 with backup helper | S | Copy of the real DB migrates; row counts unchanged; re-run is a no-op |
| 1.3 | `transitionTask` plus a transition table; remove the unchecked `PATCH` status | S | Every illegal transition returns 409 (table-driven test); each legal one emits exactly one event |
| 1.4 | Dependency-aware ready queue (`depends_on`) | S | A task whose dependency is not `done` is never dispatched; cycles are rejected at plan submission |
| 1.5 | Ack timeout, retry with backoff, stale sweep | S | Injected-clock tests: no acknowledgement in 120 s → retry at 60 s, then 300 s, then `reassignment_required`; a task never stays `running` for more than 10 minutes without events |
| 1.6 | Failed verification moves `verify→build` and returns the task to its assignee with the failing criterion | H | Test: failing check → task `assigned` to the same owner, with the reason attached |
| 1.7 | Event idempotency key | H | Replaying the same key creates no second row |

### WP2: Executive intake and orchestration *(M–L; lead: Orchestrator identity plus Cadence; verifier: Kael)*
| ID | Task | Tier | Accept |
|---|---|---|---|
| 2.1 | `POST /v1/intake` that keeps the raw request and creates `intake_requests` and a job | S | Home, room, Design and Sessions entry points each produce one job and one `intake.received` |
| 2.2 | Duplicate detection: title or text similarity plus open jobs in the same project | S | A near-duplicate links to the existing job and records the reason |
| 2.3 | Rule-based triage into the four workflows (§4.2), with an Orchestrator override and a recorded reason | S | Fixture set of 20 requests is classified as expected; the fallback works with the Orchestrator offline |
| 2.4 | Bind the Orchestrator identity to an adapter that passes its readiness check (Claude Code first, Codex fallback) | S | Orchestrator wakes and replies in a room; failover is visible |
| 2.5 | Risk-based approval routing (§4.4) and auto-accept for low-risk plans behind a flag | S | Low risk → `plan.auto_accepted`; high risk → Needs You item |
| 2.6 | Needs You aggregate API: approvals, blockers, `needs_human` tasks, budget exceptions, delivery approvals | S | Each source appears exactly once; resolving it removes it |
| 2.7 | Department and identity migration v11 (K5) | H | 20 identities mapped; Winston reviews the mapping once |

### WP3: Planning Council *(L; lead: Sage; verifier: Cadence)*
| ID | Task | Tier | Accept |
|---|---|---|---|
| 3.1 | Planner selection from the request's needs, each planner's skills and observed availability | S | Selection is recorded with reasons; unavailable planners are excluded and the exclusion is noted |
| 3.2 | Replace the template card generators with real agent sessions; keep `council.ts` scoring; label the old path `simulation` (C3) | O | A council run with two real planners produces cards written by agents (session IDs on each card); no hard-coded scores in the live path |
| 3.3 | Structured plan packet `plan.submit` (requirements, architecture, risks, estimates, task graph, criteria) | S | Schema-validated; materialises tasks with `depends_on` and criteria in one transaction |
| 3.4 | Orchestrator synthesis that keeps dissent | S | `verdicts.minority` filled whenever any card dissents |

### WP4: Agent execution and collaboration *(L; lead: Atlas; verifier: Sentinel)*
| ID | Task | Tier | Accept |
|---|---|---|---|
| 4.1 | Runtime MCP server, session tokens, `tool_calls` audit (K4) | O | A fake ACP agent calls every v1 tool; bad schema or unauthorised role gets an actionable rejection; one audit row per call |
| 4.2 | Pass `mcpServers` and run a per-adapter fidelity spike for Claude, Codex, Gemini and Antigravity | S | Each adapter: one real tool call recorded, or `protocol=directive` documented with evidence |
| 4.3 | Operating card in `buildPrompt` that teaches the tools; the directive fallback stays | H | Prompt snapshot test |
| 4.4 | Dispatcher: ready queue → assignee selection by skills, availability and load, with concurrency limits | S | 10 ready tasks with 2 slots: never more than 2 running; assignment events emitted |
| 4.5 | One worktree per task (K8) and integration into the job branch | S | Two parallel tasks edit separate trees; integration conflict → `needs_human` |
| 4.6 | Handoffs and blockers as objects (§9.3) with wake and acknowledgement | S | `handoff.create` → recipient woken → `handoff.acknowledged`, or a timeout item |
| 4.7 | Session crash recovery: reconcile on start and resume from the last baton | S | Killing the adapter mid-turn → task `retrying`, then resumes in a new generation with the same identity |

### WP5: Independent verification and delivery *(M; lead: Kael-adjacent engineer, not Kael; verifier: Sentinel)*
| ID | Task | Tier | Accept |
|---|---|---|---|
| 5.1 | `needs_review` state; verifier selected by QA skill and availability, never the assignee | S | Self-verification impossible through API and tools (test) |
| 5.2 | Criterion → evidence mapping; the VERIFIED gate for `verification_required` (C7) | S | A criterion with only CLAIMED or OBSERVED evidence blocks `→approve` |
| 5.3 | Deliver by opening a PR (the `pr_opened` path) plus a delivery record in the job dossier | S | A shipped job has a PR URL and commit SHAs as evidence |

### WP6: Communications and organisational operations *(L; lead: Iris; verifier: Kael)*
| ID | Task | Tier | Accept |
|---|---|---|---|
| 6.1 | Timezone-aware cron and named, idempotent schedule seeds | S | Africa/Lusaka 10:00 Mon–Fri fires once per weekday (injected clock) |
| 6.2 | `schedule_runs` ledger and startup catch-up with deduplication and a delay record (§10.3) | S | Runtime off from 09:00 to 12:00 → one catch-up stand-up marked delayed; a second start does not run it again |
| 6.3 | Stand-up pipeline: gather, per-agent request, validate against events, compile, publish to the UI and `community/daily_standups/`, turn blockers into items | S | Offline agent listed `absent`; no reply → `no update`; nothing fabricated |
| 6.4 | Retire the v1 standup daemon (C5) | H | Its process and entry points are removed or disabled; documented |
| 6.5 | Message links (job, task, project), inbox delivery and acknowledgement, decision records, job thread created automatically | S | `inbox.send` shows created → delivered → acknowledged, or the failure reason |
| 6.6 | macOS LaunchAgent: install and uninstall from Settings; shares the lock with the app | S | Window closed → stand-up still runs; visible on next open (manual macOS evidence) |
| 6.7 | Recurring routines: health check, stale sweep, weekly retro, weekly OKR review | H | Seeded once each; visible in Runtime and Health |

### WP7: Strategy and project management *(M; lead: Meridian; verifier: Antigravity)*
Link jobs to KRs and milestones; add KR kinds (computed, manual or evidence); compute progress only from verified linked jobs, otherwise show `UNKNOWN`; remove the dead `telemetry_query` evaluation; split the health score; project health from execution data; archive and delete for tasks and jobs; keep the 46 legacy tasks untouched. Acceptance as in Cadence's WP9.

### WP8: Skills and knowledge *(M; lead: Codex; verifier: Sage)*
A `skills.ts` loader for `community/skills/*/SKILL.md` (frontmatter as in the catalog contract), with content-hash versions. Selection by trigger at dispatch, injected into the task packet, with hashes pinned on `task_skills`. `skill.list` and `skill.read` tools. Write the 9 remaining skills, including the new #13–15 (time reporting, context renewal, resource efficiency). Accept: a task packet lists exactly the selected skills; editing a skill changes its hash on the next task.

### WP9: Workforce time tracking and productivity *(L; lead: Nexus; verifier: Kael)*
| ID | Task | Tier | Accept |
|---|---|---|---|
| 9.1 | `activity_intervals` writer from turn start and end (K6) | S | 4 concurrent agents for 1 h → 4.0 agent-hours, 1.0 h elapsed (test) |
| 9.2 | Reconnect, restart and renewal safety | S | Replay or reconnect adds 0 ms; restart closes open intervals at `last_event_at` |
| 9.3 | Human timers and manual entries (desktop, plus `time.start` and `time.stop` for Winston only) | S | Agents can never create `actor_kind=human` rows (authorisation test) |
| 9.4 | Engagement profiles loaded from `~/.myaos/engagements.local.json`; agent hours always non-billable; agent intervals linkable to the human billable interval | H | Weekly view shows remaining hours against the min/max; pay schedule shows `unknown` when unset; no engagement data in any tracked file (grep test in CI) |
| 9.5 | Adjustments as an audit trail | H | Original row unchanged; net total includes the adjustment |
| 9.6 | Timesheet draft → approve → CSV and PDF export with a reconciliation hash | S | Export total equals the sum of intervals; editing after approval needs a new revision |
| 9.7 | Time & Productivity screen: daily, weekly and monthly views (§6.3) | S | Every number links through to its intervals |

### WP10: Token, context and AI resource intelligence *(L; lead: Atlas; verifier: Sentinel)*
| ID | Task | Tier | Accept |
|---|---|---|---|
| 10.1 | Usage mapper fix for the ACP `{used,size,cost}` fields; extended columns; measurement label | S | Fixture of each adapter's real payload → correct rows; missing data → `unavailable`, never 0 presented as actual |
| 10.2 | `model_registry` (windows only), `ai_accounts`, a real `model_id` on sessions (today it stores the agent name) | H | Context % computed only when the window is known |
| 10.2b | Account limit snapshots: manual entry from `/usage` (desktop form, about 10 s), a spike to capture it automatically from Claude Code, Gemini CLI requests counted by the runtime; `task_usage` before/after per task | S | Each task row has account, agent, model, times and before/after %; values labelled `estimated`; reset times recorded |
| 10.2c | 70%-before-mid-window alert per account | H | Injected snapshots: 71% at 40% of the window raises one alert; 71% at 60% does not |
| 10.3 | K7 policy resolution and percentage thresholds; capsule extended to the §7.3 fields | S | Injected usage crosses 85% → renewal; new generation has the same identity and the task continues |
| 10.4 | Budgets as weekly-% limits per account, agent, task and project; enforcement on each prompt; actions (continue with approval, renew, smaller model, reassign, escalate) | O | A budget exceeded mid-task produces a Needs You item and stops work; no silent overrun |
| 10.5 | Anomaly detection (more than 3× median tokens per turn) | H | Seeded spike → `session.context_threshold` recommendation |
| 10.6 | AI Resources screen, led by **weekly % per account**, then usage by agent and task type, then per-project usage (§7.5, with cost replaced by plan usage) | S | Every number traces to snapshots or `task_usage`; estimates labelled |

### WP11: Unified desktop integration *(L, continuous; lead: Iris with Tessera on design; verifier: Antigravity)*
- **Navigation:** rework to the 15 items in §14.2.
- **Executive Home:** add the stand-up, organisation health, and time and token summaries.
- **Needs You:** a unified view using the 2.6 API.
- **Job timeline:** a view that merges stage history, events, sessions, intervals, usage, commits and approvals. `GET /v1/jobs/:id/history` already exists, but no screen calls it.
- **New screens:** QA & Verification and Skills.
- **Moves:** Runtime and Health moves out of Settings.
- **Design Studio:** add the `review` and `superseded` states, and create a design task automatically on request (v17).

Each screen's acceptance: every label matches the backend state, and reloading the app preserves it.

---

## 5. WP0 specification (first to execute)

**Goal:** a single authoritative V2 on `main` that builds, typechecks, passes its tests and is safe to migrate.

| ID | Task | Tier | Depends | Acceptance (observable) |
|---|---|---|---|---|
| T1 | Merge `claude/desktop-app-ai-teams-2fa62f` into `main` through a PR. Resolve the 7 conflicts (§1 of the gap audit): keep V2's removal of `data/myaos.db` and `provenance.log`; union-merge `agents.json` and `AGENTS_REGISTRY.md` (main's newer identities, such as Tessera, plus V2's fields); keep main's v1 `App.tsx` design-studio change only if v1 still ships, otherwise V2's | S | — | PR merges cleanly; no identity in either side is lost (script diff of IDs); `data/myaos.db` untracked |
| T2 | Fix the runtime typecheck: `server.ts:1047-1050` (`original_file_path`, reply author field), and the `aliases` guard in the antigravity test | H | T1 | `npx tsc --noEmit` exit 0 |
| T3 | Fix the 2 failing tests: `api.test.ts:126` (decide whether an `okr` search hit is expected, then fix the test or the search) and the orchestrator rate-limit test #63 timeout (find the cause; "flake" is not a root cause) | S | T1 | `node --test test/*.test.ts` 66/66, three consecutive runs |
| T4 | CI: GitHub Actions on Node 24 running runtime tests, runtime typecheck, desktop `tsc -b` and `vite build` | H | T2, T3 | Green on the PR |
| T5 | Mark legacy: `LEGACY.md` in `desktop/`, `src/` and `bin/`; disable the v1 standup daemon; update `AGENTS.md` and `README.md` to say V2 is canonical | H | T1 | No v1 entry point writes workflow state (grep plus test); docs agree |
| T6 | Adapter readiness probe per adapter (command, auth, ACP `initialize`, a temporary file edit), stored and shown in Coworkers | S | T1 | A broken adapter shows `not ready` with the reason and receives no dispatch |
| T7 | Backup and restore: automatic copy before migrating, `myaos backup` and `myaos restore`, keep the last 10 | H | T1 | Restoring a backup reproduces row counts; tested |
| T8 | Migration policy doc plus a dry-run script against a copy of the DB | H | T7 | Documented; script prints a per-table row diff |
| T9 | Runtime security review: token storage, loopback binding, CORS, self-asserted `actorId` on `POST /v1/jobs/:id/stage` (found in the audit; bind the actor to the token) | O | T1 | Actor spoofing test fails closed; findings recorded |
| T10 | Live DB truth pass on Winston's Mac: diagnose why sessions failed, decide the stuck job, record counts | S (needs Mac) | T6 | Note in `community/proposals/` with the actual counts |

WP0 exits when T1–T9 are merged with CI green, and T10 is recorded or explicitly deferred.

---

## 6. First end-to-end slice S1 (proves the architecture)

A real low-risk request typed in Executive Home goes through every stage below, with Winston touching only the goal box and the final approval:

1. **Intake.** One `intake.received` event and one job (2.1).
2. **Triage.** Rule triage classifies it `quick` (2.3).
3. **Plan.** A single planner submits a one-task plan via `plan.submit`. It is low risk, so `plan.auto_accepted` fires (2.5, 3.3; the full council is not needed).
4. **Assign.** The ready queue assigns the task (1.4, 4.4).
5. **Acknowledge.** The agent calls `task.claim`, which is the acknowledgement (4.1).
6. **Work.** The agent works in its own task worktree (4.5).
7. **Account.** Turn intervals and usage are recorded with measurement labels (9.1, 10.1).
8. **Check.** The runtime runs the check and records OBSERVED evidence.
9. **Verify.** An independent verifier records VERIFIED evidence (5.1–5.2).
10. **Approve and deliver.** An approval appears in Needs You. Approving it opens a PR (5.3).
11. **Timeline.** The job timeline shows all of the above (WP11 minimum).

Tasks S1 needs, from the packages above: 1.2–1.5, 2.1, 2.3, 2.5 (flag), 3.3, 4.1–4.5 (Claude adapter only), 5.1–5.3, 9.1, 10.1, plus a minimal timeline.

**S1 recovery checks:**
- **Missing acknowledgement:** retried, then reassigned.
- **Verifier failure:** returns to `build`.
- **Runtime restart mid-task:** resumes with no duplicated time.

Everything else waits until S1 passes on a clean DB **and** on Winston's real DB copy.

---

## 7. Sequencing and parallelism

```
WP0 ─► contracts K2,K3,K4,K6 (docs) ─► S1 slice ─┬─► WP3 full council
                                                 ├─► WP4 rest ─► WP8 skills
                                                 ├─► WP5 rest
                                                 ├─► WP6 ops (stand-ups can start right after WP0+1.2)
                                                 ├─► WP9 ║ WP10   (parallel; share K6)
                                                 └─► WP7 (needs 5.2 evidence) 
WP11 runs continuously behind each backend package.
```

Ownership boundaries:
- New code goes in new modules: `runtime/src/{actions,intake,dispatch,ledger,skills,schedules}/`.
- `repo.ts` (about 4.6k lines) and `server.ts` get thin wiring only, with one writer per file at a time.

Maximum concurrency after S1 is 4 implementation agents.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Adapters ignore `mcpServers` or emit no usage | Agents have no tools; numbers show zero | 4.2 and 10.1 fidelity spikes first; directive fallback; `unavailable` label |
| Merging V2 into `main` loses community data | Lost identities or threads | T1 identity-diff script; the PR is reviewable and reversible |
| `repo.ts`/`server.ts` contention | Merge conflicts | New modules, single writer, contracts first |
| Time numbers used for billing are wrong | Contractual and financial harm | Human time only from explicit entries; agent time never billable by default; timesheet approval; reconciliation hash |
| No published token caps on subscription plans | Usage reported in tokens would be invented | Track plan % from `/usage`, label per-task attribution `estimated`, never derive token caps |
| Client work processed on the wrong account, or published | Contract and security breach | K9 isolation enforced by the dispatcher; confidential projects excluded from community sync; public-repo grep in CI |
| Live DB migration corrupts data | Data loss | T7 backups, dry-run on a copy, additive migrations only |
| Agent spoofs `actorId` | Bypassed gates | T9 binds actor to token; K4 session tokens |
| Usage limits starve work | Stalls | Rate-limit fallback (exists); budget-aware dispatch |
| Local-only runtime is off when the Mac is off | Missed operations | 6.2 catch-up ledger; K1 keeps the runtime transport-agnostic for a later cloud worker |

## 9. Mapping to Cadence's plan (to avoid duplicate numbering)

| Cadence WP | This plan |
|---|---|
| WP0 truth/unblock, WP0b adapter readiness | WP0 T6, T10; 2.4 |
| WP1 stand-ups | WP6 6.1–6.3 |
| WP2 schema | migrations v10–v13 inside WP1, WP2, WP4, WP6 |
| WP3 agent protocol | WP4 4.1–4.3 (K4) |
| WP4 intake, WP5 planner | WP2, WP3 |
| WP6 dispatcher, WP7 verification | WP1 1.4–1.5, WP4 4.4, WP5 |
| WP8 comms | WP6 6.5 |
| WP9 OKRs | WP7 |
| WP10 skills | WP8 |
| WP11 UI | WP11 |
| WP12 LaunchAgent | WP6 6.6 |
| *(none)* | **New:** WP9 time tracking, WP10 tokens and context, K5 departments, K8 worktree per task, C3 council fix |

## 10. Verification and release procedure

Every merge passes:
1. Runtime tests and typecheck, and the desktop typecheck and build, in CI on Node 24.
2. Migration dry-run on a copy of the real DB.
3. A verifier other than the implementer records evidence in the job: commands, exit codes and the verifier's name.
4. No new number reaches the UI without a provenance label.

A release candidate additionally passes:
- §18.1 (autonomous delivery), §18.2 (recovery), §18.3 (accounting) and §18.4 (resource intelligence), run on macOS.
- Flags enabled one at a time.
- Winston approves the release, which is a reserved action.

## 11. Effort and AI resource estimate (estimated, not measured)

| Block | Agent-days |
|---|---|
| WP0 | 6–8 |
| Contracts | 2 |
| S1 | 10–12 |
| WP1–WP5 remainder | 20–25 |
| WP6 | 8–10 |
| WP7 | 4–5 |
| WP8 | 4–5 |
| WP9 | 8–10 |
| WP10 | 8–10 |
| WP11 | 12–15 |
| **Total** | **≈ 82–102 agent-days** |

At 3–4 parallel agents, that is roughly 6–8 calendar weeks after WP0, with a re-plan after S1. Expected tier mix: about 45% Haiku, 45% Sonnet and 10% Opus (contracts, security, council rework, budget enforcement). No token figures are given, because no measured per-task baseline exists yet. WP10 creates that baseline.

## 12. Decisions (recorded 2026-11-03)

1. **Approved:** merge V2 into `main` and retire v1 as legacy. Done in WP0-T1 and T5.
2. **Contract engagement:** terms received. They are held only in the local `engagements.local.json` (K6 confidentiality rule). Billing model: only Winston's logged hours are billable; agent hours are non-billable but can be linked.
3. **AI usage:** subscription plans, not API. Track plan % per account (K6, WP10 10.2b–c). Three accounts. The client account is isolated (K9).
4. **Departments:** approved, with a sixth department, Planning & Strategy, for the planners (§13).
5. **Client repository:** after the team and desktop app are complete, client work moves to a separate, client-specific repository. Until then this repo is private, at the owner's direction (2026-11-03), and K9 still applies: no client-confidential content in shared files.

## 13. Departments (approved by Winston, 2026-11-03)

Departments: **Engineering**, **Platform & Runtime**, **Quality & Verification**, **Design**, **Planning & Strategy**, **Operations**. The basis is each agent's declared `primary_domain` in `community/agents.json` (34 identities after the merge: 20 on `main`, plus 14 that existed only on the V2 branch).

| Agent | Department | Basis |
|---|---|---|
| atlas | Platform & Runtime | Platform, Cloud Run, Git & Security |
| nexus | Platform & Runtime | Orchestration platform engineering |
| cadence | Platform & Runtime | V2 workflow engine |
| gemini_cli | Platform & Runtime | CLI substrate operations |
| gantry | Platform & Runtime | Android build pipelines, release packaging |
| cinder | Platform & Runtime | Cloud infrastructure, Cloudflare Workers, Firebase security |
| hermes | Platform & Runtime | API gateways, Workers, R2, Firebase rules |
| vela | Engineering | WordPress system of record and host bridge |
| iris | Engineering | Dashboard and operator console |
| astra | Engineering | Widget SDK and AI protocol |
| lyra | Engineering | Mobile and React Native SDK |
| sol | Engineering | DogForce Odoo platform |
| orion | Engineering | Full-stack systems, Odoo and rostering engines |
| sirius | Engineering | Odoo operations, UI and mobile client |
| forge | Engineering | Android Kotlin / Compose |
| vega | Engineering | MeetingMind CTO: review and release (lead) |
| loom | Engineering | Workspaces UI |
| quill | Engineering | Dev-mode terminal |
| kael | Quality & Verification | QA, testing and verification (lead) |
| sentinel | Quality & Verification | Independent QA, regression, reliability |
| antigravity | Quality & Verification | Automated browser QA and production testing |
| corona | Quality & Verification | Script and claim-ledger verifier |
| tessera | Design | Desktop product design, Design Studio |
| faraday | Design | AI generation lead (visuals) |
| helios | Design | Team leader and AI generation lead (Carrington) |
| reel | Design | Showrunner, editing and sound |
| orchestrator | Operations | Coordination and task dispatch (lead) |
| ledger | Operations | Intake, context and workflow routing |
| synapse | Operations | MeetingMind squad orchestration |
| mira | Planning & Strategy | MeetingMind planning |
| themis | Planning & Strategy | Product planning, UX and privacy guardrails |
| daedalus | Planning & Strategy | Systems architecture and technical planning |
| codex | Operations | Workflow analysis and documentation |
| wren | Operations | Site growth, analytics and SEO |

Planning & Strategy also hosts the Planning Council seats (WP3). These departments seed the `departments` table in migration v11 (K5, task 2.7).
