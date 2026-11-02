# MyaOS v2 — Workflow, Communication and Strategy Audit

Date: 2026-11-03. Evidence: `runtime/src/orchestrator.ts`, `runtime/src/store/repo.ts`, `runtime/src/acp/session-manager.ts`, and the live store `~/.myaos/runtime.db`.

## 1. What actually happens today when you ask for a feature

1. You talk to an agent (a room message, `@lead`, or Wake). `Orchestrator.handleRoomMessage` wakes whoever you `@`mention. `@lead` wakes the team leader with a roster and the instruction to use `[WAKE]`, `[SPAWN]` and `[SCHEDULE]`.
2. The woken agent replies. The reply is posted to the room, and any `[WAKE]`/`[SCHEDULE]`/`[SPAWN]` lines in it are executed.
3. That is the whole automatic loop. Nothing turns a conversation into a **job**, a **plan**, **tasks** or **criteria**.
4. Job stages are `brief → plan → build → verify → approve → done`. Only one transition is automated: `build → verify`, when every task is `done`, checks passed, and a non-assignee verifier (Kael) passes. Everything else needs a human clicking in the UI, or an HTTP call.
5. Agents cannot call that HTTP API. Their prompt (`buildPrompt`) teaches exactly four things: `[WAKE]`, `[SCHEDULE]`, `[SPAWN]`, `[STATE]`. It never mentions plans, tasks, evidence, threads, announcements, stand-ups, inboxes or OKRs, and gives no API address or token.

So today: an agent can ask another agent to do something. It cannot create or advance the work itself. A human has to create the job, write the plan, create the tasks and move the stages.

## 2. What the live store shows (`~/.myaos/runtime.db`)

| Thing | Count | Meaning |
|---|---|---|
| Jobs | 1, stuck in `plan` | no plan accepted, no work started |
| v2 tasks (under jobs) | 0 | the job machinery has never run end to end |
| Sessions | 11, all `failed` | no agent turn has completed in v2 |
| Rooms / room messages | 9 / 0 | rooms are unused |
| Stand-ups | 2, last 2026-09-05 | imported from v1; nothing in v2 creates one |
| Threads / replies | 11 / 19, last 2026-09-07 | imported from v1 markdown; dormant |
| Announcements | 2 | imported |
| Recurring schedules | 0 | the 3 schedules are one-shot rate-limit timers |
| OKR objectives / key results | 2 / 4 | seeded from v1 |
| `project_tasks` | 46 (9 done, 9 in progress, 12 in review, 14 open) | legacy v1 tasks |
| `project_tasks` linked to a key result | 0 | OKRs link to nothing |
| Milestones | 0 | |

Stand-ups happened "only twice" because no code ever makes one happen. The scheduler (`Orchestrator.tick`, every 2s, supports cron) works, but nobody creates a recurring schedule. Nothing is wrong with the scheduler; it has nothing to run.

## 3. Five structural gaps

1. **No intake.** A request is not converted into a job. Identities such as Ledger ("issue intake and workflow routing") and Orchestrator exist as names only; no code gives them that power.
2. **Agents have no hands inside the system.** They can wake each other but cannot write plans, create tasks, attach evidence, post to threads, announce, or report progress. All of that is human-only or legacy markdown.
3. **Two disconnected work models.** v1 `project_tasks` (carries `okr_kr_id`, project, milestone) and v2 `tasks` (belong to a job, carry checks, evidence and gates). Neither links to the other. Jobs have no key-result link at all.
4. **Strategy is decorative.** Key-result progress is typed in by hand. `telemetry_query` holds SQL for tables that do not exist (`turns`, `evidence.passed`). The "health score" is `60% evidence-pass ratio + 40% average objective progress`, so it can report 88% with zero running jobs.
5. **Four overlapping communication channels** (rooms, threads, inbox, announcements) plus stand-ups, with no rule about which one to use when, and no agent instructions at all for any of them.

## 4. Ideal flow (one spine, minimal human steps)

```
Goal / request (any screen: room, Home, Job, Design "Design" button, Sessions)
   │  Intake (Ledger-role agent or the runtime itself): classify, pick project, link a Key Result
   ▼
JOB (brief)  ── owner: Winston, accountable lead: the project lead agent
   │  Planner (Sage) writes plan + tasks + acceptance criteria         ← agent action: runtime tool
   ▼
PLAN  ── human approves ONLY if risk ≥ medium or budget above threshold; otherwise auto-accept
   ▼
BUILD ── tasks dispatched to assignees in dependency order; each task: worktree, session, check command
   │      agents post progress to the job thread, not DMs; blockers raise a "Needs you" item
   ▼
VERIFY ── independent verifier (Kael/Sentinel/Antigravity) runs checks, writes evidence       (already built)
   ▼
APPROVE ── human gate (this is the intended human touchpoint)
   ▼
DONE ── ship (commit/PR), export thread, update Key Result and milestone automatically
```

Human intervention is limited to: stating the goal, approving risky plans, approving the final result, and resolving real blockers.

### Communication model
- **Job thread = the one place a piece of work is discussed** (rooms stay for broad chat). Everything an agent says about a job goes there, automatically attached to the job.
- **Inbox** = targeted "you need to act" notes, auto-created by the runtime (task assigned, review requested, approval needed).
- **Announcements** = owner/lead broadcasts only.
- **Stand-up** = a daily recurring schedule per team that wakes each active agent with *their own* data (tasks in progress, last session result, blockers), collects a short reply, and writes one stand-up record. Absent agents (rate-limited, offline) are recorded as absent.
- **Retro/weekly** = same mechanism, weekly cron, summarising key-result movement.

### Strategy linkage
`Objective → Key Result → Job (and its tasks) → Evidence`. A key result's progress is computed from linked jobs that reached `done` with verified evidence, or from a real metric query, never typed in. Milestones group jobs inside a project.

## 5. Fix plan, in dependency order

| # | Change | Why it comes first | Size |
|---|---|---|---|
| 1 | **Agent action protocol.** Add directives the runtime parses, like `[WAKE]` already: `[JOB]`, `[PLAN]`, `[TASK]`, `[EVIDENCE]`, `[THREAD]`, `[BLOCKED]`, `[PROGRESS]`. Teach them in `buildPrompt` per role. | Unlocks every later step; without it agents cannot work inside the system. | M |
| 2 | **Intake.** A room message or Home goal with no job creates one (brief + project + key result) and wakes the planner. | Gives the flow a start. | S–M |
| 3 | **Auto-advance.** `brief→plan` when a plan exists; `plan→build` on auto-accept (low risk) and dispatch ready tasks; `approve` stays human. Add retry when a task session fails. | Removes the manual clicking. | M |
| 4 | **Recurring schedules at startup.** Seed a daily stand-up cron per team and a weekly retro; stand-up writes `standups` rows. | Fixes "only twice". Small and independent, can ship first. | S |
| 5 | **Merge task models.** Migrate `project_tasks` into job tasks or link them; add `jobs.okr_kr_id`, `jobs.milestone_id`. | Required for coherent project/OKR reporting. | M |
| 6 | **Make OKR progress computed.** Drop dead `telemetry_query` strings; derive from linked jobs/evidence; show `UNKNOWN` when unlinked (matches the GEMINI.md "UNKNOWN for missing telemetry" rule). | Honest numbers. | S |
| 7 | **Single "Needs you" inbox** fed by approvals, blocked tasks, failed sessions and plan reviews. | Keeps the human touchpoints in one place. | S |

Suggested order: **4 → 1 → 2 → 3 → 5 → 6 → 7**. Step 4 is quick and visible; step 1 is the keystone.

## 6. Open questions for Winston
1. Which agent is the intake/orchestrator: a real coworker (Ledger/Orchestrator) or the runtime itself?
2. Auto-accept plans for low-risk jobs, or always show you the plan first?
3. Stand-up time and timezone (the scheduler computes cron in UTC).
4. Keep v1 `project_tasks` as history only, or migrate into v2 job tasks?
