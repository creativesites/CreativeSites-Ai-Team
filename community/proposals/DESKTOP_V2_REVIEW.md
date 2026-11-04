# MyaOS Desktop v2 — review: how the app must work, and what is missing

> Reviewer: Lead (independent review requested by Winston)
> Date: 2026-10-26
> Reviewed: `DESKTOP_V2_BUILD_PLAN.md` (branch `claude/desktop-app-ai-teams-2fa62f`, HEAD `01d72d7`), the v2 runtime and desktop app, the v1 desktop app, the team system in `src/` and `community/`, and the ACP adapters installed on this machine.
> Status: Phase 0.1–0.5 are built (on a branch, not merged). Phase 0.6 is not started. This review is written against what exists, not against what the plan says exists.

---

## 0. One-page answer

**The plan is pointed in the right direction, but the app is currently a beautiful, honest shell with no way to move work through it.** The product thesis — *Room is the interface, Job is the unit, every fact shows its evidence* — is the right one for how you actually work. The execution risk is not the design system; it is that nothing consequential can be written yet, the one architectural assumption the truth model depends on is probably wrong, and the plan sequences the pieces in an order that cannot produce a working job.

The five findings that matter most:

1. **The app cannot change anything that matters.** The runtime exposes about a dozen routes, and only five write operations (create/edit identity, create room, post message, create job+criteria). There is no write path for job stage, criteria, tasks, evidence, approvals, sessions, transcripts, councils or verdicts. A job created from Home stays in `brief` forever. Every Approve / Interrupt / Accept-plan button is disabled because there is no endpoint behind it. This is the line between a viewer and a control plane.
2. **The ACP evidence assumption fails the reality check.** The plan says the runtime will run file writes and commands itself through ACP `fs/*` and `terminal/*`, making them *Observed*. In fact **none** of the three adapters (Claude, Codex, Gemini) routes command execution through ACP `terminal/*`; only Gemini routes file writes through the client, and only when capability-gated and inside the workspace. Codex is not even installed on this machine. The evidence model must be redesigned around runtime-owned snapshots + check runner + independent verification, not adapter cooperation.
3. **Phase 1 cannot pass its own exit check as sequenced.** The exit check needs a plan with tasks, checks and gates, but the planner is Phase 3. There is no minimal plan path. Pull a simple planner (or plan editor) into Phase 1; keep the council as an upgrade, not a prerequisite.
4. **The app is being built for a narrower world than the team lives in.** The team is now 26 identities across 3 teams (`creativesites`, `deployfleet`, `meetingmind`), working on Myavana, DogForce (Odoo production data) and MeetingMind (Android). The v2 identity model keeps only name/role/runtime/avatar/seats, with no team, provenance, capabilities or lane. The plan says "import identities only, in Phase 2" — that leaves the app empty during active, paid-launch work and throws away the provenance model that makes your team trustworthy.
5. **Several Phase 0 "done" claims are only true on the branch, and some are not true at all.** Your `main` working tree still shows the old fake numbers (`CommandCenterView.tsx:46-69`) and wake-all/sleep-all. Phase 0.1 exists only on the v2 branch. Sleep prevention in v1 is a no-op `AtomicBool` even though the plan says to keep it because it "works today". The old test suite writes the real `data/myaos.db` through the `sqlite3` CLI. And the plan's own "/Users/ count" is wrong: 90 refs in 14 files, not 74 in 10.

What should happen next, in order: finish **0.6 (ACP spike)** and a new **0.7 (state freeze / truth cleanup)**, then build a **write-complete Phase 1** (job lifecycle + repo binding + identity import + minimal plan + one builder session + approvals + evidence + terminal), and only then the council. Details in §6.

---

## 1. Where the build actually stands

### 1.1 Phase 0 status

| Item | Status | Evidence |
|---|---|---|
| 0.1 Stop made-up state | **Done on branch only** | `d491905` removes fallback numbers, seed rows, wake/sleep-all, worker proof file. `main` still has them (`CommandCenterView.tsx:46-69`, `App.tsx:362-371`). |
| 0.2 Store out of git | **Partial** | v2 store at `~/.myaos/runtime.db`; `data/myaos.db` untracked on branch. In `main` it is still tracked and the v1 test suite still writes it (`tests/intelligence_layer_upgrades.test.js:7,71-73,116`). Live state still tracked: `community/agents.json`, `events.ndjson`, proof bundles, handshakes. |
| 0.3 No hard-coded paths | **Partial** | v2 has no `/Users/` refs; config exists. 90 `/Users/winstonzulu` refs remain in 14 v1 source files. `myaos.config.example.json` and the runtime's `MyaosConfig` disagree on field names (`dbPath` vs `runtimeDbPath`), and the runtime ignores `workspaces` / `agentWorkspaces`. |
| 0.4 Desktop scaffold | **Built** | React 19 + Vite + Tailwind 4 + Tauri 2. `tsc -b` passes with zero diagnostics; fresh build is 316 kB and correctly excludes preview fixtures. Solid Glass styling and the shared components are real. |
| 0.5 Runtime skeleton | **Built** | SQLite store with versioned migrations, token auth, SSE replay, health, sidecar auto-start, `myaos status` probe. `npm test` 9/9 passes; `tsc --noEmit` clean. |
| 0.6 ACP spike | **Not started** | No ACP dependency in either `package.json`; no `claude-agent-acp` / `codex-acp` installed; no findings note in `community/proposals/`. |
| **Exit check** | **Not met** | App was not launched end-to-end in this review. Renderer/data path is proven (typecheck, build, live API smoke), not the packaged app. ACP note missing. Legacy 34 tests unverified and not hermetic. Old desktop runs, but that is the only clean "pass". |

### 1.2 What is good, and should be protected

- **The truth rule is implemented, not just written.** Fresh store returns real zeros; empty states say "no evidence yet"; evidence tags show Observed / Claimed / Verified / Unknown; fixtures are confined to `#/preview/*` and excluded from production builds. That is rare and worth defending.
- **One runtime, one store, no AI in the UI.** The desktop only talks HTTP/SSE to `127.0.0.1`; the Rust side owns the window and sidecar lifecycle; shared wire types are imported from `runtime/src/api/types.ts`, so client/server drift is structurally hard. This is the right architecture.
- **The design system is coherent.** Solid Glass, Geist, status-only colour, stage bar, evidence tag, composer, diff view, tool steps. The Council/Verdict screens are a genuinely strong differentiator — they just aren't on the wire.
- **The preview fixtures are excellent specifications.** They encode the intended UX (brief, criteria with provenance, approval card with consequence, weighted score formula, plan tasks with checks/gates). Use them as acceptance tests for Phase 1–3, not just as demos.

---

## 2. How the app must work

This section is the opinion the rest of the document defends. If the app is built to this model, the missing-feature list in §3 falls out naturally.

### 2.1 Three objects, one writer

```text
Project/Room  (standing context)        Job  (unit of work)              Session/Turn  (execution)
-------------------------------         ----------------------           -------------------------
repo(s) + branch + team + squad   →     brief + plan + criteria     →    ACP agent + worktree
decisions + threads + memory            tasks + checks + gates            transcript + tool calls
members: Winston + agents               stage + evidence + approvals      commands + diffs
```

- **Room** = a project/squad channel bound to one or more repositories and a team. Not a generic chat. Its job is context: repo state, decisions, relevant threads, who is on it.
- **Job** = the only object that moves. It carries the contract (brief, criteria, plan) and the proof (evidence, approvals). Chat is attached to a job; chat is not the job.
- **Session/Turn** = one agent process in one worktree, with a transcript, tool calls, commands and diffs. A job has many sessions; a session belongs to one task.
- **The runtime is the only writer.** Desktop and CLI both send commands; neither opens the DB. The old `data/myaos.db` must eventually be read-only legacy or imported — see §4.4, because today agents are told to `INSERT` into it directly.

### 2.2 The job lifecycle (and who owns each gate)

| Stage | What happens | Owner | Gate to leave the stage |
|---|---|---|---|
| **Brief** | Intake: title, outcome, constraints, repo, acceptance criteria. Intake asks for missing facts instead of guessing. | Winston (+ intake agent) | Brief + at least one criterion; repo bound; risk noted. |
| **Plan** | A plan with tasks, assignees, check commands and gates. Two speeds: quick plan (one planner pass) or council (roster of seats, rounds, scored verdict). | Planner / Chair | Plan accepted by Winston. Criteria traceable to tasks. Run count and cost shown before start. |
| **Build** | One session per task, in its own worktree. Runtime records commands, file writes, diffs, tool calls. | Builder agents | Every task has evidence at Observed or Attested; no unknown task. |
| **Verify** | A *different* agent, in a clean worktree, re-runs each task's check. Runtime may also re-run. | Verifier | Each criterion reaches Verified, or the job returns to Build with the failing evidence. |
| **Approve** | Human decision on the consequence, with diff, evidence and reversibility. | Winston | Explicit approve/decline; decision recorded with actor, time, note, and what will actually run. |
| **Ship** | Merge / push / deploy / production write, executed through the approved action; revert path recorded. | Runtime + Winston's approval | Result is Observed (commit SHA, deploy URL, DB row count). |
| **Done** | Dossier assembled: brief, plan, sessions, evidence, decisions, diff, links. Feeds measures. | Runtime | Criteria Verified, approvals resolved, artifacts exported. |

Branches that must exist from day one: **Cancelled** (with reason), **Blocked** (waiting on Winston / another job / external system), **Failed** (session crashed, check failed, agent went offline), **Reopened** (verification failed after approval).

### 2.3 Evidence: the contract must change

The current plan says: the runtime advertises ACP `fs.writeTextFile` and `terminal`, so writes and commands are *Observed*. The spike says that will mostly not happen:

| Adapter | File writes via client | Commands via client `terminal/*` | Permission via ACP |
|---|---|---|---|
| `claude-agent-acp` 0.95.0 | Plumbed, but edits mostly arrive as `tool_call` diffs; how often the fs path carries real writes is uncertain | **No** (terminals are display-only `_meta`) | Yes |
| `codex-acp` 1.11.0 | No evidence; Codex app-server does its own I/O | **No** | Yes for approvals; Codex sandbox still applies |
| `gemini` 0.63.0 (`--acp`; `--experimental-acp` is deprecated) | **Yes**, capability-gated, workspace-scoped | **No** | Yes, mapped to confirmations |

So the evidence model should be rebuilt **capability-driven**, with three independent sources of truth:

1. **Observed by the runtime.**
   - Worktree snapshot before/after each turn: `git status`, `git diff`, file hashes, base SHA. Any mutation is attributable even if the adapter never called `fs/*`. This is the single highest-value change.
   - Commands the runtime runs itself: checks, builds, tests, the verifier re-run. The runtime owns the exit code and the raw output.
   - Process liveness: the PID is alive, the worktree exists, the commit exists.
   - Git/remote state: commit SHA, branch, push result.
2. **Attested / claimed by an agent.** A `tool_call` / `tool_call_update` with raw input/output and a diff; an agent message; a CLI agent's thread/inbox post. Stored as Claimed until something re-runs it. Never upgraded because the agent says so.
3. **Verified by a different agent (or the runtime) in a clean worktree.** Re-run the exact check, on the exact commit, with a different actor. Record the command, exit code, commit SHA, actor, time. Stale evidence (worktree moved, commit changed, check command edited) becomes Unknown, not Verified.

Additional requirements:

- **Append-only, hash-chained ledger.** Each row: `prev_hash`, `content_hash`, actor, session, task, criterion, artifact reference. Mutations + event emission in one SQLite transaction. Without this, "every step in the ledger" is a claim, not a proof.
- **Artifacts outside SQLite.** Diffs, logs, screenshots, recordings and large command output go to content-addressed files under `~/.myaos/artifacts/`, referenced by hash. SQLite keeps rows, not blobs.
- **Evidence kinds need widening.** Today: command, diff, file, test, message, review. Add: `browser` (Playwright/screenshot/URL), `deploy`, `db_read`, `db_write`, `api`, `approval`, `artifact`. DogForce and MeetingMind work is not all code diffs — production data writes, screenshots, device builds and deploy checks are evidence too.
- **Staleness and gaps are visible.** If the event stream misses events, the UI shows "Unknown / gap" rather than silently continuing. If a session's PID is dead, the UI shows Offline. If a criterion has no evidence, it shows Unknown.
- **UI drill-down.** Every criterion → the evidence that satisfies it; every evidence row → session, command/output, diff, artefacts; every diff → file, hunk, line. Today the Job timeline is not expandable and Dev casts `payload: unknown`.

### 2.4 Approvals: the actual human interface

The approval queue is the product's core, not an accessory. It must handle **all consequential actions**, not just merges:

- Types: merge, push, force-push, deploy, rollback, production DB write, data export, spend, external message/send, granting a new repo/remote, installing/upgrading an agent.
- Structured content per card: the exact action, target (repo/branch/SHA, site, DB table, amount), what will change (diff summary / row count / command), what will **not** happen, reversibility ("can be reverted with one revert; nothing is deployed"), evidence summary, risk level, requested_by, expiry.
- Decision: approve / decline / **approve with conditions** / send back with a reason. Decision is recorded with actor, time, note and the executed outcome. The job continues or stops accordingly.
- **ACP permission is a blocking request.** When an agent asks `session/request_permission`, the runtime must: persist a pending approval, keep the session waiting (or pause it), notify Winston, and enforce a timeout → deny, so a session cannot hang forever. If Winston is away, a job should pause in "Needs you", not die. This state machine is missing from the plan and must be designed before Phase 1.
- **Policy before buttons.** Per room/job/action defaults: reads and checks inside the worktree auto-allow; writes inside the worktree auto-allow for builders; anything outside the worktree, network, push, merge, deploy, prod data, spend → ask. Policies are visible and editable; every auto-allow is logged.
- **Notifications and inbox.** macOS notification + persistent "Needs you" count + deep link to the card. Not just a Home section.

### 2.5 Planning: two speeds, not one

- **Quick plan** (one planner pass, or Winston editing the plan) must exist in Phase 1 so a job can have tasks/checks/gates without a 19-run council.
- **Council** (Phase 3) as designed: Chair, weighted seats, rounds, cards with scores/confidence/ruin/reversibility, score computed only from cards, disaster cap, can't-undo rule, too-fast-agreement rule, options include "smaller version" and "don't do it". Quick mode default; full mode opt-in with run count and estimated cost shown before start.
- The verdict must produce `plan.json` → tasks with owners, check commands and gates. The plan screen must be editable before acceptance; Winston will correct plans, and that correction should be recorded as a decision.
- Seat configuration belongs in the store, not in a fixture: name, question, weight, who plays it, avatar, model/adapter. `identities.seats` (a flat string list) is not enough.

### 2.6 Rooms, teams and the bridge

- Rooms should map to **projects** (Myavana Chatbot, Myavana Dashboard, Hair Journey, Mobile SDK, DogForce, MeetingMind, DeployFleet), each bound to repo(s) and a team/squad. The current `rooms.repo_path` singular field is too small for a job that touches two repos.
- Identities need **team, lane, capabilities, provenance, liveness source** — the v1 registry already has these (`data/myaos.db` identities carry `team_id`, `lane`, `declared_capabilities`, `confidence_provenance`, `evidence_source`; `agents.json` has 25 entries). Losing them would be a regression in the very thing the app is supposed to make trustworthy.
- The **team bridge** must be bidirectional and explicit, because the team's real write path today is files + direct SQLite inserts:
  - `myaos` commands for task/message/evidence/thread writes → runtime API (agents need a supported write path).
  - File watcher/importer for threads/inboxes with stable ids, idempotent event ids, archive/ack to prevent double-ingest.
  - One canonical community root. There are currently two (`./community` and `Myavana-Chatbot/community` with 33 unsynchronized threads), duplicate thread numbers, and whole-file last-write-wins on `agents.json` / `tasks.json`.
  - Legacy agent work (tmux/CLI) appears as Claimed with author attribution; code work is only attributable if the bridge enforces a branch/patch/commit handoff so the verifier can re-run in a clean worktree.
  - Decide the tracked-vs-ignored policy: if every app job writes tracked community files, `git status` will never be clean, which contradicts the plan's own exit check.
- The old DB cannot be ignored. Agents are instructed to `INSERT INTO tasks/facts/task_claims` (`PLANNER_AGENT_PROMPT.md`, `VERIFIER_AGENT_PROMPT.md`), and `GEMINI.md` calls `data/myaos.db` the single source of record. If v2 ships with a separate store and does not either import/observe this DB or change those prompts, the team has two brains.

### 2.7 Screen contract

Keep the seven, add four. Every screen must work on an empty store, and every number must resolve to evidence.

| Screen | Must show | Must allow | Missing today |
|---|---|---|---|
| **Home** | Needs you (approval cards), running jobs, recently done, team live | Open card, start brief, choose room/repo | No repo choice; taps "Jobs" to first job; no inbox queue |
| **Room** | Project header (repos, branch, team), messages, job cards, decisions, links | Post message, start a job in the room, bind/switch repo | Repo binding absent; composer cannot start a job; members never populated |
| **Job** | Brief, stage bar, plan/tasks, criteria + provenance, evidence timeline, approvals, done-means | Approve/decline/send back, edit brief/criteria, retry/cancel, open session/diff | All actions disabled; tasks/plan not rendered |
| **Council** | Rounds, seats, cards, scoreboard with formula, debate, rules | Configure seats, run quick/full, watch live | Preview-only, unrouted |
| **Verdict** | Call, score trace, objections, plan tasks/checks/gates, confidence | Accept/edit plan, export PDF | Preview-only; accept disabled |
| **Dev** | Sessions + transcript, terminal, tool calls, diff review, evidence ledger, gaps | Interrupt, follow-up prompt, run command, inspect diff | No terminal/PTY, no transcript, no interrupt, no diff review |
| **Coworkers** | Identity, team, role, runtime, seats, provenance, capabilities, liveness, current session | Edit identity, import, view sessions/history | Flat list, no teams/provenance, no import, seats read-only |
| **Workspaces** (new) | Repos, remotes, branch/dirty state, worktrees, health | Clone/attach/create, bind to room | Absent |
| **Jobs index** (new) | Filter by room/stage/owner/status, search | Open, archive | Absent (sidebar links to `jobs[0]`) |
| **Measures** (new) | Jobs, verification failures caught, human interventions, time-to-approval, cost | Filter by period/project | Absent (Phase 4, but schema hooks needed now) |
| **Settings/Health** (new) | Adapters + versions + auth state, Node/runtime versions, policy, notifications, data/export | Configure, test, repair | Absent |

### 2.8 Work / Dev modes

"Two levels of detail on the same records" is right, but the current implementation is a sidebar preset: `mode` is read only by `Sidebar`; no screen changes. Implement it as a **density/detail toggle on the same route** (Work = story + evidence cards + approvals; Dev = transcript/terminal/diff/ledger for the same job), or remove the claim. Do not create two app shells.

### 2.9 Reliability, security and packaging

- **Single runtime per machine must be real.** The current check-then-act in `runtime/src/main.ts:46-52` is racy: two concurrent starts can both run on one DB (reproduced: one crashes with "database is locked", another with "Migration 1 failed"; two event buses, duplicate agents/approvals in Phase 1). Use an OS lock held for process life + atomic info-file publish (tmp + rename).
- **Store permissions.** `~/.myaos` is 0755 and `runtime.db`/WAL are 0644 while `runtime.json` is 0600. Transcripts, prompts and evidence will be readable by other local users. 0700/0600, and re-apply mode on overwrite.
- **Reconnect.** Token rotates when the runtime restarts; the desktop only re-discovers on mount or "Try again", and the SSE loop retries forever with the old token. Implement 401-driven re-discovery, backoff, and an explicit "runtime restarted" state.
- **Packaging.** `tauri.conf` has no `externalBin`; the sidecar locates `runtime/` via `env!("CARGO_MANIFEST_DIR")` (compile-time path) and uses the system Node. That works in dev and on the build machine, not in a signed DMG on another Mac. Package Node + runtime correctly, sign nested Mach-Os inside-out, handle a Finder-launched minimal PATH (claude lives in `~/.local/bin`, gemini under nvm), and never assume `npm`/`npx` at runtime. Mac App Store is a non-starter if you must exec user CLIs.
- **Local trust boundary.** Bind 127.0.0.1, validate Host and Origin on every request (today only OPTIONS is rejected for a bad Origin; a real GET with a bad Origin + valid token executes), body limits, idempotency keys, revision checks on approvals, per-request validation (today `criteria:"oops"` → 500; `repoPath:{}` → 500; `seats:{}` accepted).
- **Crash recovery.** Sessions must be reconciled against actual PIDs on startup (today `liveSessions` counts DB rows; after a crash the UI would show dead agents as live). Worktrees must be garbage-collected. Jobs resume from the last Observed step.

---

## 3. Missing features, ranked

### P0 — required before Phase 1 can produce one real job

| # | Feature | Why it blocks | Acceptance |
|---|---|---|---|
| 1 | **Job lifecycle writes** — stage transitions, plan, tasks, criteria CRUD, evidence append, approvals decide, session cancel | Nothing can leave `brief`; all controls disabled | A job can go brief → plan → build → verify → approve via API + UI; every transition is an event with actor |
| 2 | **Repo/workspace binding + onboarding** (clone/attach/create, branch/dirty state, worktree root) | A room created from Home has no repo, so no agent can run | First run lets Winston attach a repo; job runs in a worktree of that repo |
| 3 | **Identity/team import** (26 identities, 3 teams, provenance, capabilities, avatars) | Empty app during active work; flat roster loses the team model | Import script + review UI; identities show team/provenance/liveness; no fake rows |
| 4 | **ACP session manager** (spawn, prompt, cancel, permission→approval, liveness, transcript) + adapter capability probe | No agent can run; evidence source undefined | One Claude session and one Gemini session complete a task; transcript stored; dead session marked Offline |
| 5 | **Runtime-owned evidence** (worktree snapshot, check runner, artifact store, hash chain) | The plan's Observed model doesn't hold; without snapshots, diffs are unobserved | After a session, `git diff`/hashes are recorded even if the adapter used its own tools; checks re-run by runtime |
| 6 | **Minimal plan path** (quick planner or editable plan) | Phase 1 exit needs tasks/checks/gates; council is Phase 3 | A job gets a plan with tasks, checks, gates, and Winston can edit/accept it |
| 7 | **Approvals end-to-end** (decision API + UI, blocking ACP permission, timeout, audit) | Merge gate cannot be enforced; agent may hang on permission | A real merge is gated, approved, executed; decline sends the job back with reason |
| 8 | **Terminal + transcript in Dev** (port PTY + xterm; session transcript; interrupt) | Dev mode is read-only evidence; agents' work is invisible | Open terminal in worktree; see live transcript; interrupt a session |
| 9 | **Fix runtime P0s**: single-instance lock, transactional hash-chained events, gap-aware SSE with backpressure, store perms, validation, idempotency | Duplicate runtimes/agents/approvals; ledger unprovable; missed events silent | Two concurrent starts → exactly one runtime; 520-event replay reports a gap; duplicate POST is idempotent |
| 10 | **Mock-free recovery**: startup reconciliation, orphan worktree/session cleanup, runtime restart handling in UI | After a crash the app lies about live sessions | Kill runtime mid-job: UI says restarted; sessions show Offline; job resumes/stops honestly |

### P1 — required to use the app daily

| # | Feature | Notes |
|---|---|---|
| 11 | **Jobs index + search (⌘K)** | Filter by room/stage/assignee/status; search messages/evidence/jobs. Sidebar "Jobs" currently opens `jobs[0]`. |
| 12 | **Needs-you inbox + notifications** | Persistent queue, macOS notifications, deep links, unread badges; decisions never lost. |
| 13 | **Session steering** | Follow-up prompt, queue message while running, pause/resume, retry with context; not just cancel. |
| 14 | **Diff review + ship actions** | Per-file/hunk review, comment, commit message, push/merge/PR through approval, revert. |
| 15 | **Verifier engine** | Different agent, clean worktree, re-run checks, commit SHA, failures returned to Build; Verified rules enforced. |
| 16 | **Approval policies** | Per-room/action defaults; auto-allow reads/checks; ask for writes/network/merge/deploy/prod data/spend; visible audit. |
| 17 | **Cost/time meters** | Per job/session: tokens, model, wall time, run count; budget alerts; council cost preview. v1 already has `token_ledger` (12 real rows) — don't lose it. |
| 18 | **Council wired** | Seat config, quick/full run, live rounds, verdict→plan, PDF export. |
| 19 | **Team bridge v1** | Canonical community root; `myaos` write commands for agents; importer with stable ids/archive; legacy work as Claimed; branch/patch handoff for code. |
| 20 | **Non-code jobs** | Ops/data/marketing jobs (DogForce cycle, Odoo writes, deploys, content) with the same brief/plan/evidence/approval model; not everything is a git worktree. |
| 21 | **Workspaces screen** | Repos, worktrees, branches, dirty state, per-room binding, clone/attach. |
| 22 | **Settings/Health** | Adapter discovery + versions + auth state, Node/runtime versions, policy, theme, data/export, doctor results. |
| 23 | **Offline/graceful degradation** | Runtime down banner is good; add auto-reconnect, cached last-known state labelled stale, queue outbound messages. |
| 24 | **Export** | Job dossier (Markdown/PDF), evidence bundle, verdict PDF; investor/demo and audit use. |

### P2 — polish and scale

| # | Feature |
|---|---|
| 25 | Packaging: bundle runtime + Node, sign/notarize, auto-update, Intel/ARM, first-run install checks |
| 26 | Multi-window / menu bar / global shortcuts; open job in window, terminal window |
| 27 | Measures dashboard (jobs completed, verification failures caught, human interventions, time from brief to approval, cost) |
| 28 | Memory/context pack builder for briefs (prior decisions, threads, facts, repo map) |
| 29 | Decision/fact/incident timelines; org/squad view; identity collisions and merges |
| 30 | Backups, DB repair, artifact retention/GC, audit export, log viewer |
| 31 | Accessibility polish (focus order, labels, contrast, reduced motion, keyboard-only approval) |
| 32 | Performance: per-subject cache/invalidation instead of global refetch on every event; virtualised lists; pagination |

---

## 4. Corrections to the plan

1. **Phase 0.6 is the gate, not a detail.** Do it before any Phase 1 code. The evidence architecture depends on the answer. Budget 2–3 days; record the matrix in §2.3 and decide the capability-driven fallback before writing the ledger.
2. **Pull identity import forward.** It is currently Phase 2; it should be Phase 1 (first week), otherwise the app is empty while MeetingMind's paid launch is live (45 tasks, 24 evidence rows, 122 events in the v1 DB). Import teams/lane/capabilities/provenance too, not just names/roles/avatars. Preserve `confidence_provenance`; quarantine fake evidence/proof bundles rather than importing them as truth.
3. **Pull a minimal planner into Phase 1.** Phase 1's exit check requires a plan. Either a single planner session (not a council) or an editable plan UI is enough. Keep the council as Phase 3.
4. **Move the "Verified" capability into Phase 1 as a *manual* verifier step.** The plan defers the verifier to Phase 2 but the job lifecycle needs a Verify gate. Phase 1 can run checks manually and record Verified only if a different agent re-ran them; otherwise criteria stay Observed/Claimed and the merge gate is human. Do not label unverified checks Verified.
5. **The 7-screen set is too small for daily use.** Add Workspaces, Jobs index, Measures, Settings/Health (or fold into existing screens deliberately). Home's "Needs you" section is not an inbox.
6. **Add a non-code job path.** DogForce cycle generation, Odoo production writes, deploys, browser QA, content. The worktree model must be one execution type, not the only one.
7. **Correct the "keep" list.** Sleep prevention in v1 is a no-op (`desktop/src-tauri/src/system/mod.rs:20-28`), not a working feature; notifications don't exist. They are new work, not ports. PTY/xterm are real and must actually be ported (currently absent from v2).
8. **Correct the counts.** 90 hardcoded `/Users/winstonzulu` refs in 14 files (not 74/10). 10 seed blocks among 48 `INSERT`s; the other 38 are real write paths to port, not delete. The "34 tests" suite is not hermetic and writes the real DB.
9. **Phase 0.1 is not in `main`.** Merge or cherry-pick the truth fixes to `main` early, or the old app keeps misleading while the new one is built. Watch the uncommitted Design Studio work in `main` (674 insertions/316 deletions) — do not let the "drop Design Studio" line delete it without a decision.
10. **Add a "state freeze / truth cleanup" step (0.7).** Untrack live state beyond the DB (agents.json, events.ndjson, tasks.json, provenance/handshake files, inboxes), make the legacy tests use temp DBs, quarantine fake artifacts (proof bundles, mission evidence), mark legacy evidence untrusted, and document which store is canonical.
11. **"No human relaying" is not achievable in Phase 2 as written.** The tmux/CLI adapters are incomplete (`tmuxAdapter` sends a nonexistent `myaos work`; interactive IDE send returns `delivered:false`). Build the bridge contract (write commands + importer + branch/patch handoff) and update `GEMINI.md` / planner / verifier prompts in the same change.
12. **Fix the plan's database/event assumptions before Phase 1.** The runtime's event log is not append-only, not transactional with mutations, has no hash chain, and SSE truncates replay at 500 with no gap marker. Phase 1's "every step in the ledger" cannot be proven on this.
13. **Merge the v2 branch to `main` in small steps.** The plan doc and all Phase 0 work exist only on `claude/desktop-app-ai-teams-2fa62f`; `main` is at `9d287fe`. Long-lived divergence with a dirty `main` is a merge-conflict trap (files overlap: `db.rs`, `commands/mod.rs`, `App.tsx`).
14. **Config must be one schema.** `myaos.config.example.json` uses `dbPath`, workspaces, agentWorkspaces; runtime `MyaosConfig` has `runtimeDbPath`/`teamRepo`, ignores the rest. Decide one file shape and validate it, or a typo silently opens a different (empty) store.

---

## 5. Risks and unknowns

| Risk | Severity | Mitigation |
|---|---|---|
| Adapters don't route fs/terminal through ACP → little "Observed" evidence | **High** | Capability-driven model (§2.3); worktree snapshots; runtime check runner; verifier re-run; never assume |
| Codex adapter requires `codex` on PATH; not installed; third-party Go bridge | Medium | Install/verify in 0.6; make adapter availability visible; don't block launch on Codex |
| Dual runtime instances / duplicate agents and approvals | **High** | OS lock + atomic info publish + test before Phase 1 |
| Ledger not transactional/immutable; SSE gap loss | **High** | Migration 2 design now; mutate+emit in one transaction; gap-aware replay; client shows Unknown |
| Team bridge split-brain (two community roots, direct DB writes, last-write-wins JSON) | **High** | One canonical root; supported agent write API; importer with ids/archive; prompts updated together |
| Node/runtime not bundled; Finder PATH; notarization | Medium (Phase 4, but affects architecture) | externalBin + bundled Node; absolute CLI resolution; sign nested binaries; check early |
| Council cost (~19 runs) | Medium | Quick mode default; show run count/cost before start; per-job budget |
| Agent can act outside the worktree (network, secrets, prod) | **High** | Runtime-side sandbox/policy, deny by default outside worktree; approvals for everything consequential; audit |
| v1 data loss (MeetingMind tasks/evidence/token history) | Medium | Export before untracking; quarantine fake evidence; import real tasks/facts/capabilities/token rows |
| Uncommitted Design Studio work deleted with `desktop/` | Medium | Preserve/patch before Phase 4; explicit decision |
| Schema churn after Phase 1 data exists | Medium | Freeze migration 2 now (workspaces, plan/stage history, task↔criterion↔session, ACP fields, transcript order, evidence hashes, approvals action/expiry, council seats) |

---

## 6. Recommended path

### Now (this week): finish Phase 0 properly

**0.6 — ACP spike (2–3 days).**
- Harness that logs every JSON-RPC message with method, params, timestamps and negotiated protocol.
- 3 adapters × 5 scenarios: create file, edit file, failing command, permission request, cancel mid-turn.
- Record: did the write arrive as `fs/write_text_file`? did the command arrive as `terminal/create` with a real exit code? which permission option kinds? what does cancel produce? any orphan children?
- Expected result: Gemini best (fs writes, no terminal), Claude partial, Codex unavailable. Write the findings note; adopt the capability-driven evidence model.
- Also fix the npm-cache/EPERM and install gaps found during the spike (`claude-agent-acp`, `codex` CLI).

**0.7 — State freeze and truth cleanup (1–2 days).**
- Make legacy tests hermetic (temp DB); untrack all live state; quarantine fake artifacts; snapshot/export the v1 DB (45 tasks, 24 evidence, 122 events, 16 token rows, 26 identities, 3 teams).
- Merge/cherry-pick Phase 0.1 truth fixes to `main`; protect the uncommitted Design Studio diff.
- Fix the runtime P0s (lock, transactional events, perms, gap-aware SSE) and freeze **migration 2** schema.

### Revised Phase 1: one real job end to end (2–3 weeks)

1. **Workspaces/repos**: table, binding to rooms, onboarding screen (attach/clone/create), branch/dirty state, worktree root.
2. **Identity/team import** + Coworkers screen with teams/provenance/liveness.
3. **Write API** (stage, plan, tasks, criteria, evidence, approvals, sessions, transcripts) with validation + idempotency.
4. **Minimal plan** (planner session or editable plan) → tasks/checks/gates.
5. **Session manager**: spawn a Claude and a Gemini session; worktree per task; transcript; cancel; liveness reconciliation; permission → approval.
6. **Evidence**: worktree snapshots, runtime check runner, artifacts, hash chain, criteria rollup; Job timeline drill-down.
7. **Approvals**: decide API + UI, blocking permission + timeout, notification, audit, merge gated.
8. **Terminal + Dev**: port PTY + xterm, transcript, diff review, interrupt.
9. **Jobs index + search + reconnect**; Home queue real.
10. **Exit check**: a real Myavana bug fix goes brief → plan → build (one agent) → checks (runtime Observed) → review/diff → merge gated on Winston's approval, with every step in the ledger and no fake data. Then use it for one week on one project before Phase 2.

### Phase 2: verification, policies, bridge

Verifier as a different agent in a clean worktree; approval policies; notifications; cost meters; team bridge with agent write API and branch/patch handoff; non-code job path (DogForce/MeetingMind); v1 evidence quarantine and real-data import.

### Phase 3: council and measures

Seat config, quick/full council, rounds, scoring rules, verdict→plan, PDF; Measures dashboard; export.

### Phase 4: cut-over

Bundle Node/runtime, sign/notarize DMG, auto-update, remove old desktop and dropped runtime code.

---

## 7. Decisions needed from Winston

1. **First project/repo** to prove the loop (Myavana-Chatbot? A DogForce ops job? MeetingMind?). Pick one; the app should be judged on it.
2. **Scope of "job"**: code only, or code + ops/data/production actions? (Recommendation: both, with worktree as one execution type.)
3. **Approval defaults**: what may run without asking (reads? checks? writes in worktree? browser?) and what always asks (push/merge/deploy/prod data/spend/network).
4. **Rooms**: one room per project, one per squad, or both? Which repos bind to which room? Multi-repo jobs allowed?
5. **Bridge direction**: does the app become the canonical place (and threads are mirrors/exports), or do threads stay canonical and the app reads them? This changes the whole sync design.
6. **Identity import scope**: which identities are real today (the registry has collisions: `Synapse`, `Meridian`, `test_spec`; `agents.json` 25 vs DB 26 vs markdown 23). Who owns the merge?
7. **Codex**: is it required at launch, or is Claude + Gemini enough for Phase 1? (Codex isn't installed; ACP adapter is third-party.)
8. **Design Studio**: keep, defer, or drop? It has uncommitted real Phase 1 work; the plan says drop. Decide before Phase 4.
9. **Owner identity**: name, id, avatar, role — currently hardcoded as `"You" / "owner"` with no record.
10. **Cost ceiling**: per-job and per-council budget; what should the app refuse to start?

---

## Appendix A — Verification log

Run on 2026-10-26, worktree `.../.claude/worktrees/desktop-app-ai-teams-2fa62f` (HEAD `01d72d7`) unless stated.

| Check | Result |
|---|---|
| `runtime/npm test` | 9/9 pass, 201 ms (Node v24.15.0) |
| `runtime/npx tsc --noEmit` | exit 0 |
| `apps/desktop npm run typecheck` (`tsc -b`) | exit 0, zero diagnostics |
| `apps/desktop` fresh `vite build` | 316 kB JS; preview fixtures absent from production bundle |
| `grep -rn "/Users/" apps/desktop/src apps/desktop/src-tauri/src runtime/src bin/myaos.js` | no matches |
| ACP dependency / spike note | absent |
| Runtime API live probe (temp store) | health, summary, rooms, messages, jobs work; evidence/approvals/session/cancel/council write routes 404 |
| Two concurrent runtime starts | reproduced race: "database is locked"; "Migration 1 failed: table identities already exists"; both runtimes alive |
| 520-event SSE replay | exactly 500 replayed, no gap marker |
| Runtime store perms | DB/WAL 0644, `~/.myaos` 0755; runtime.json 0600 but mode not re-applied on overwrite |
| `main` v1 fake data | `CommandCenterView.tsx:46-69` still has `|| 6 || 8 || 12 || 42`; wake/sleep-all still in `App.tsx:362-371` |
| v1 sleep prevention | no-op `AtomicBool` (`system/mod.rs:20-28`) |
| v1 test hermeticity | writes `data/myaos.db` via `sqlite3` (`tests/intelligence_layer_upgrades.test.js`) |
| v1 hardcoded paths | 90 refs in 14 files |
| v1 live data | 45 tasks, 24 evidence, 122 events, 16 token rows, 19 facts, 26 identities, 3 teams; 5 open MeetingMind tasks (MM-B01…B05) |
| Branch state | `main` at `9d287fe`; v2 work only on `claude/desktop-app-ai-teams-2fa62f`; `main` working tree has 52 changed/untracked entries including uncommitted Design Studio work |

## Appendix B — Sources

- `DESKTOP_V2_BUILD_PLAN.md` (v2 branch) — the plan under review.
- Independent review passes: runtime skeleton, Desktop v2 UI, v1 desktop + team system.
- ACP findings: local adapter inspection (Claude 2.1.310, Gemini 0.63.0, node 24.15.0; codex absent), npm registry versions (`@agentclientprotocol/sdk` 2.0.2, `claude-agent-acp` 0.95.0, `codex-acp` 1.11.0), agentclientprotocol.com protocol docs, Tauri v2 sidecar/signing docs.
- Team registry/threads: `community/AGENTS_REGISTRY.md`, `community/agents.json`, `community/threads/029`, `community/threads/035`, `data/myaos.db` identities/teams/tasks.

---

## Update — 2026-10-26 (same day): what was implemented

The gaps in §3/§4 were acted on immediately, on the v2 branch `claude/desktop-app-ai-teams-2fa62f` (the branch that holds the plan and Phase 0 work):

| Commit | What |
|---|---|
| `5319740` | **Phase 1 foundation**: schema v2 (projects/repos/teams/members/identity provenance/plans/tasks/criteria/stage history/sessions/transcript/evidence chain/approvals+policies/settings/budgets/usage/adapters), full write API for the job lifecycle, single-instance lock, owner-only store, transactional hash-chained events, gap-aware SSE, validation, idempotency, real health, session reconciliation |
| `c9f9acc` | **runtime-owned checks, worktree snapshots and independent verification** — the "Observed" tier no longer depends on ACP adapter cooperation |
| `03824a9` | **identity/team/project import** from the reviewed v1 export (29 identities incl. owner, 3 teams, 7 projects/rooms, team leads, approval policies); live v1 DB archived outside the repo |
| `047d39d` | **Phase 0.6 ACP spike** + findings: no adapter on this machine is authenticated (Claude OAuth expired, Gemini needs `GEMINI_API_KEY`, Codex/DSH absent); capability-driven evidence model confirmed |
| `4d34df2` | **ACP session manager**: spawn/prompt/cancel, transcript, permission → approval with timeout, process-group cleanup, snapshots before/after each turn |
| `c3e89e8` | **planning council engine**: weighted card scoring, disaster cap, cannot-undo, too-fast-agreement, verdict → job plan + tasks |
| `958d5c3` | **team bridge (outbound)**: opt-in job dossiers to `community/threads/desktop` + inbox notes for assigned agents |
| `7fbe4ba`, `2a1ea13` | room↔project repo binding; docs/README point at the handoff, decisions and ACP findings |

Verified: runtime 32/32 tests pass, `tsc --noEmit` clean; desktop `tsc -b` clean. The local v2 store has the imported team and projects, so the app shows real coworkers/rooms on restart.

**Still open from this review:** UI wiring (Workspaces, job lifecycle, approval center, Dev terminal, Council/Verdict, Settings — assigned to the UI workstream in `task-7/8/14`), real-adapter authentication (user action), bridge ingest, council seat ACP sessions, Phase 0.7 state freeze and the merge to `main`. The handoff document is the contract: `community/proposals/DESKTOP_V2_HANDOFF.md` on the v2 branch.

### Adapter update — 2026-10-26 17:00

The earlier "no adapter usable" finding was a credentials/install state, not a protocol limit. Fixed on the machine and in the runtime:

| Adapter | State now |
|---|---|
| **Claude** | `claude-agent-acp` 0.97.0 installed; Claude Code signed in (claude.ai pro). Spike: **6/6** scenarios pass (permission requests, cancel → cancelled, 0 orphans); real runtime smoke turn returned `OK`. |
| **Codex** | `codex` 0.164.0 + `codex-acp` 1.11.0 installed; logged in via ChatGPT. Spike: **5/6** (outside-workspace scenario times out; normal turns/permission/cancel pass); real runtime smoke turn returned `OK`. |
| **Gemini** | CLI installed, but the local `GEMINI_API_KEY` is rejected (`401 API key not valid / ACCESS_TOKEN_TYPE_UNSUPPORTED`) and OAuth expired 2026-09-12. Needs a valid key (`node runtime/scripts/set-adapter-key.mjs GEMINI_API_KEY <key>`) or a fresh `gemini` login. |
| **DeepSeek Harness** | No spawnable ACP agent entry point; its ACP use is client-side. Unsupported as an adapter unless an upstream ACP mode appears. |

Runtime changes that made this real: adapter probing now searches nvm/volta/homebrew install dirs (Finder-launched app), reports honest `auth {state, detail}` in `/v1/adapters` and the Coworkers screen, loads adapter credentials only from the owner-only `~/.myaos/adapters.env`, augments `PATH` for child CLIs, and has a `smoke-adapter.mjs` that runs one real turn through the runtime. Runtime tests 32/32; both typechecks clean.
