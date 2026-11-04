# MyaOS V2 — Gap Audit Against the Approved Vision

**Date:** 2026-11-03 · **Auditor:** Claude Code session (lead). Three read-only sub-audits were run, and the lead re-checked each one's key claims against the source.
**Audited code:** branch `claude/desktop-app-ai-teams-2fa62f` @ `1af6582` (the only branch with `runtime/` and `apps/desktop/`). All paths below are relative to that branch.
**Vision:** [`MYAOS_V2_AUTONOMOUS_ORGANISATION_VISION.md`](MYAOS_V2_AUTONOMOUS_ORGANISATION_VISION.md) (§ numbers refer to it).
**Supersedes, where they disagree:** [`MYAOS_V2_WORKFLOW_AUDIT.md`](MYAOS_V2_WORKFLOW_AUDIT.md). That audit is confirmed on every claim checked. Corrections and omissions are listed in §5.
**Not audited:** the live `~/.myaos/runtime.db`. It is on Winston's machine, not in this checkout, so the row counts in the earlier audit are unverified here.

Status key: **PRESENT** works as the vision requires · **PARTIAL** foundation exists, behaviour incomplete · **MISSING** nothing in code · **CONFLICTING** code contradicts the vision and must change.

---

## 1. Foundation evidence (WP0 inputs)

All commands were run in a clean worktree of `1af6582` with Node v22.23.4. `runtime/package.json` declares `engines.node >=24`; the tests still ran on 22 because Node 22.18+ strips types natively.

| Check | Command | Result |
|---|---|---|
| Runtime tests | `cd runtime && node --test test/*.test.ts` | **64/66 pass, 2 fail.** `api.test.ts:126` "search finds jobs…": search now also returns an `okr` hit the assertion doesn't expect (stale test or result-shape drift). `orchestrator.test.ts` #63 "session-limit & rate-limit awareness…": `timed out waiting for condition`. |
| Runtime typecheck | `cd runtime && npx tsc --noEmit` | **Fails, 6 errors.** `src/api/server.ts:1047-1050` uses `thread.originalFilePath` and `reply.from`, but the types are `original_file_path` / no `from`. The community-sync write-back is therefore broken at the type level. `test/antigravity-adapter.test.ts:12-13`: possibly-undefined `aliases`. |
| Desktop typecheck | `cd apps/desktop && npx tsc -b` | Pass (exit 0) |
| Desktop build | `cd apps/desktop && npx vite build` | Pass (chunk-size warning only) |
| Packaged app launch | — | **Not verified.** Tauri bundle and launch need macOS. |
| Branch topology | `git merge-tree main origin/claude/desktop-app-ai-teams-2fa62f` | **Diverged.** V2 is 71 commits ahead of `main`, and `main` is 16 ahead of V2 (community docs, v1 desktop design-studio work, standup daemon). Merge conflicts: `.gitignore`, `GEMINI.md`, `community/AGENTS_REGISTRY.md`, `community/agents.json`, `desktop/src/App.tsx`, and modify/delete on `data/myaos.db` and `data/provenance.log` (V2 deleted them; `main` still changes them). |

**Conclusion:** the claim "V2 is the authoritative runtime" is not yet true in the repository. V2 lives on an unmerged branch, its typecheck is red, and two tests fail. WP0 must fix this before anything is built on top.

---

## 2. Requirement matrix

### §2 Architectural principles
| Req | Status | Evidence |
|---|---|---|
| 2.1 Single runtime/DB | PRESENT (on branch) | `runtime/src/main.ts`, `lock.ts` (single-instance), token-protected loopback API. Legacy `data/myaos.db` and the v1 desktop SQLite still exist on `main` (§19.2 violation until retired). |
| 2.2 Orchestrator vs engine | PARTIAL | Engine is deterministic (`orchestrator.ts` 2s tick). **No Orchestrator agent**: the "lead" is chosen by `approvalLevel=lead` or the hard-coded names atlas/themis (`orchestrator.ts:~458`). |
| 2.3 Event-driven | PARTIAL | Durable `events` table with seq, actor and hash chain, plus SSE replay (`migrations.ts:167,481`; `server.ts:1260`). About 40 event types. **Absent:** acknowledgement, handoff, blocker, context threshold, stand-up completed, time entry. `task.assigned` is only emitted by `bridge.ts:150`. |
| 2.4 Human authority | PARTIAL | Approvals with policy and risk routing, a 120-minute escalation timeout, idempotent `request_id` (`repo.ts:1480-1540`). No classifier for security, production, financial or irreversible actions. `approve→done` is blocked only by *pending* approvals; it is not tied to a granted one. |
| 2.5 Evidence over self-report | PRESENT | Evidence ladder `UNKNOWN<DECLARED<ATTESTED<OBSERVED<VERIFIED` (`repo.ts:67-74`). Agents cannot write OBSERVED. VERIFIED requires a different actor (`checks.ts`). **Weakness:** the `→verify` gate accepts DECLARED and `→approve` needs only OBSERVED. |

### §3 Organisation and identity
| Req | Status | Evidence |
|---|---|---|
| Persistent identity; session ≠ employee | PRESENT | `identities` plus `sessions.agent_id`. Rotation keeps `agentId` and writes `parent_session_id`/`generation` (`acp/session-manager.ts:561-600`). |
| Teams | PARTIAL | `teams`, `team_members` (`migrations.ts:194-207`) |
| Departments | MISSING | no table or column |
| Seniority / authority | PARTIAL | `approval_level` (owner/lead/member/none) is a permission, not a seniority level |
| Skills, tools, providers, permissions | PARTIAL | `capabilities` is a free-form JSON list; `adapter_id` is a single value. No skill or provider list. |
| Performance and cost history per identity | MISSING | `usage` has no `agent_id` (join via session only) |

### §4–5 Work lifecycle and collaboration
| Req | Status | Evidence |
|---|---|---|
| 4.1 Unified intake | MISSING | `POST /v1/jobs` needs roomId, title and createdBy. Room messages create nothing (`orchestrator.ts:504-545`). No dedupe or urgency. |
| 4.2 Triage, 4 workflows | MISSING | `jobs.kind` and `risk` are set by hand; there are no workflow types |
| 4.3 Planning Council | **CONFLICTING** | `council-runner.ts` `startLiveCouncil` is **scripted**: `setTimeout` sleeps (`:376`) and template cards from `generateRound1Card/2/3` (`:193,421`) with hard-coded scores. It never wakes an agent. The scoring maths (`council.ts`) and the dissent records (`verdicts.minority`, card votes) are sound and worth keeping. Fixed 4- or 7-seat boards; no selection by request. |
| 4.4 Risk-based gates | PARTIAL | Plan acceptance is human-only (`repo.ts:1125`). No auto-accept for low risk (owner decided "yes" on 2026-11-03; not built). |
| 4.5 Task graph | PARTIAL | Tasks are flat: `position`, `assignee_id`, `check_command`, `gate`, `evidence_required`. No dependencies, priority, skills, budget or parent. |
| 4.6 Dispatch + acknowledgement | PARTIAL | Manual `POST /v1/jobs/:id/sessions` or `[WAKE]`. No ready queue, no acknowledgement. |
| 4.7 Independent verification | PRESENT (code) | `checks.ts` re-runs checks in a fresh detached worktree at the base SHA, and the verifier must not be the assignee. A failure does not return work to the assignee. The verifier is "kael or any non-assignee", with no capability check. |
| 4.8 Delivery | PARTIAL | Ship by merge, cherry-pick or branch (`checks.ts`). A `pr_opened` status exists, but no code path opens a PR. |
| 4.9 Learning | MISSING | — |
| 5.2 Structured collaboration | MISSING | Only `[WAKE]`, `[SPAWN]`, `[SCHEDULE]`, `[STATE]` |
| 5.3 One task, one worktree, one branch | **CONFLICTING** | `checks.ts worktreeForJob`: one worktree and branch `myaos/job-N` **per job**, shared by all tasks and agents. `worktrees.task_id` exists but is unused. |
| 5.4 Ack/retry states, timeouts | MISSING | Task status is only `pending/running/done/failed/blocked` (`api/types.ts:10`). `PATCH /v1/tasks/:id` sets any status unchecked (`repo.ts:1268`). The only automatic resume is the rate-limit timer. |

### §6 Time tracking — MISSING across the board
No timers, time entries, engagement, rate, billable or timesheet concept anywhere in `runtime/src` or `apps/desktop/src` (all `rate` hits are rate limits). Raw material exists: `sessions.started_at/ended_at/last_event_at`, `transcript_entries` with `prompt`/`turn_end` timestamps (turn wall time can be derived), `agent_wakes.dispatched_at/completed_at`, and `job_stage_history`. There is no `turns` table. `sessions.turn_count` counts transcript entries, not turns (`repo.ts:1861`), so it is mislabelled.

### §7 Tokens, context, renewal, budgets
| Req | Status | Evidence |
|---|---|---|
| 7.1 Usage capture | PARTIAL | `usage` table (`migrations.ts:439`: job, session, model, input/output tokens, cost_cents, source). The ACP prompt result and `usage_update` notifications are mapped (`session-manager.ts:652,822,999`). **No** cached, cache-write or reasoning tokens; no provider; no agent_id; no actual/estimated flag. |
| Adapter fidelity | **RISK** | The mapper reads only `inputTokens/input_tokens/tokensIn` etc. The ACP `usage_update` shape (`used`, `size`, `cost{amount,currency}`) is ignored, so real adapters probably record **nothing**. No per-adapter probe has confirmed what Claude, Codex, Gemini or Antigravity emit. `sessions.model` holds the ACP agent *name*, not a model ID (`session-manager.ts:~815`). |
| 7.2 Context monitoring | PARTIAL | `sessions.context_tokens` is an estimate (transcript characters ÷ 3.8), raised to the real input tokens when those arrive. The window size is never captured, so a utilisation % is impossible. No compaction events. |
| 7.3 Session renewal | PRESENT (mechanism) / PARTIAL (policy) | `acp/baton.ts` compiles a deterministic 3-tier continuation capsule with no LLM call, and `rotate()` starts Gen N+1 for the same identity. Thresholds are absolute tokens (soft 36k, hard 64k, 10 turns; `baton.ts:14-19`), **not model-aware percentages**, and not per agent, provider or model. Rotation triggers only on follow-up prompts. |
| 7.4 Budgets | PARTIAL | `budgets` (global/project × job/day/month) and `jobs.budget_cents/cost_cents`. Only the `month` period is evaluated (`repo.ts:1973`). `assertBudget` runs at session start with estimate 0 (`session-manager.ts:434`), so it cannot stop a session that will overrun. No agent, task, department or session budgets; no pricing table. |
| 7.5 Dashboards | PARTIAL | Per-session generation, context and cost in `screens/dev.tsx:547-592`; job cost in `job.tsx:562`; budget forms in `settings.tsx`. No organisation, agent or project usage view. |
| Rate limits | PRESENT | Text parser plus reset times, deferred wakes, auto-resume and adapter fallback (`session-manager.ts:~97-160`, `orchestrator.ts:~109-260`) |

### §8 Workforce intelligence — MISSING
No aggregation of throughput, first-pass rate, cycle time or rework. The legacy Node runtime has a useful prior: `src/model_router.js` (cheapest model with more than 80% success), `src/intelligence/learningLoop.js`, and `tokenTelemetry.js`, which deliberately reports cost as **UNKNOWN** rather than invent pricing. Keep that principle; it is not ported.

### §9 Communications
Rooms and room messages: PRESENT (`messages.job_id` exists). Threads, thread messages, inbox and announcements: PARTIAL (imported, no job or task links; inbox has no delivery or acknowledgement state). Stand-ups: PARTIAL (CRUD only). **Decision records, handoffs and acknowledgement/delivery status: MISSING.** Community markdown sync exists (`community-sync.ts`), but its reply write-back is the typecheck failure in §1.

### §10 Stand-ups and recurring operations
Scheduler PRESENT (cron, timer, interval, max_runs; `orchestrator.ts:20-70`), **UTC only**. Seeded recurring schedules: none. Stand-up pipeline (gather, per-agent request, validate, compile): MISSING (`repo.ts:3494` is CRUD). Catch-up: accidental only. A missed schedule fires once on the first tick, without a delay record or dedupe. LaunchAgent: MISSING; `main.ts` exits when `MYAOS_PARENT_PID` dies. Note: `main` carries a separate v1 "autonomous daily standup daemon" (`a0246b9`). That is a **competing implementation** (§19.2) and must be retired or ported.

### §11 Strategy and projects
OKR objectives and key results exist. `telemetry_query` is stored but never evaluated; progress is typed by hand (`repo.ts:3760`). `project_tasks.okr_kr_id` is the only KR link; **jobs and tasks have no KR or milestone link**. Milestones exist, unused by health calculations. Status: PARTIAL, with strategy not connected to execution.

### §12 Design Studio
PARTIAL. `design_frames` status is `draft/iterating/approved/archived` with version and version history; approval writes Observed evidence (`design-studio.ts:192-220`). **Missing:** the `review` and `superseded` states, and an automatic linked design task on request.

### §13 Skills — MISSING
No loader, table or versioning (`grep -i skill runtime/src` matches one comment). The catalog exists only on `main` (`community/skills/`, 6 skills including `hierarchical-model-orchestration`); the V2 branch does not carry it and nothing reads it.

### §14 Desktop
Screens: home, jobs, job, approvals, room, communication, council-room, coworkers, team, okrs, projects, design-studio, workspaces, settings, dev.

| Vision nav | Status |
|---|---|
| Executive Home | PARTIAL (no stand-up, health, time or token summary) |
| Workflows | PARTIAL (Jobs) |
| Coworkers, Projects, Communications, Design Studio, OKRs | PRESENT |
| Planning Council | PARTIAL (only when a job exists) |
| Stand-ups | PARTIAL (sub-tab of Communication) |
| Engineering Cockpit | PARTIAL (dev mode Sessions/Evidence) |
| Runtime and Health | PARTIAL (inside Settings) |
| Skills, Time & Productivity, AI Resources, QA & Verification | MISSING |

Needs You: PARTIAL (approvals only; `jobs.blocked_reason` is read by no screen). Job timeline: **MISSING as a view**, although `GET /v1/jobs/:id/history` and the client method `jobHistory` (`lib/runtime.ts:372`) exist and no screen calls them.

### §15 Agent action interface — MISSING
`mcpServers: []` in both `session/new` and `session/load` (`acp/client.ts:165,186`). No tool surface, and agents receive no API URL or token. `buildPrompt` (`session-manager.ts:1145-1205`) teaches only the four bracket directives. **This is the single largest blocker:** without it, no agent can create, advance or report work.

---

## 3. Preserve (do not rebuild)

The evidence ladder and independent re-run verifier (`checks.ts`); the hash-chained events table and SSE replay; the approvals engine with policies, escalation and idempotency; the baton continuation capsule and session generations; rate-limit detection and fallback; the cron scheduler; council *scoring* (`council.ts`) and dissent records; the budgets and usage tables; Design Studio boards, frames, versions and lineage; the community-sync bridge; the token-auth loopback API; the desktop design system and truth rule (no fabricated numbers).

## 4. Conflicts that must be resolved, not extended

| # | Conflict | Resolution (proposed contract, see programme plan) |
|---|---|---|
| C1 | V2 on an unmerged, diverged branch; `main` still ships v1 | WP0: merge V2 into `main` and mark v1 `desktop/` and `src/` as legacy read-only import sources |
| C2 | Worktree per job vs one per task (§5.3) | Worktree and branch per task (`myaos/job-N/task-M`); the job branch becomes the integration branch |
| C3 | Scripted council vs agent-driven council (§4.3) | Keep the scoring and data model; replace the card generators with real agent sessions through the action interface; label the existing path `simulation` |
| C4 | Two task models (`tasks` vs `project_tasks`) | `tasks` is canonical; `project_tasks` stays as preserved history, linked by `legacy_project_task_id`, never written by new code |
| C5 | v1 standup daemon on `main` vs V2 scheduler | Retire the v1 daemon at the WP0 merge; the V2 scheduler is the only scheduler |
| C6 | Absolute-token baton thresholds vs model-aware percentages | Thresholds become % of the captured window, with an absolute-token fallback when the window is unknown (labelled) |
| C7 | Weak gates (`→verify` accepts DECLARED; `→approve` needs OBSERVED) | `→approve` requires VERIFIED for every criterion marked `verification_required` |

## 5. Corrections to the earlier audit

1. It does not mention that the live council is synthetic (C3). This is the most important omission.
2. It does not mention per-job worktrees (C2).
3. Budget enforcement: not "absent". `assertBudget` is called at session start, but with estimate 0.
4. Token and context tracking is further along than it implied (baton, usage, generations), but the adapter mapping probably records nothing in practice.
5. It assumes V2 is the base, but V2 is unmerged with a red typecheck.
