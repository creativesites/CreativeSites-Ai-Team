# MyaOS Desktop v2: build plan

> Owner: Winston · Drafted 2026-10-24 · Status: **Phase 0 complete, Phase 1 foundation implemented** (update 2026-10-26 — see [DESKTOP_V2_HANDOFF.md](DESKTOP_V2_HANDOFF.md) and [DESKTOP_V2_DECISIONS.md](DESKTOP_V2_DECISIONS.md))
> Approved design: [MyaOS Desktop v2 Design](https://claude.ai/artifact/A1bGwBoupBuz7MBwkGtA6j) (Home, Room, Job, Council, Verdict, Dev, Coworkers)

---

## 1. Decisions already made

| Decision | Choice |
|---|---|
| Product shape | **The Room is the interface, the Job is the unit.** Rooms are threads where Winston and agents are members; a job is a thread with a structured header (brief, plan, criteria, stage, evidence, approvals). |
| Two modes | Work and Dev are two levels of detail on the **same** records, switched in the sidebar. Not two apps. |
| Planning | A planner council run like roast-room: a Chair, weighted seats, rounds, scored verdict, a plan with checks. |
| Design | Solid Glass (shadcn/ui + Base UI + Tailwind 4), dark first, Geist type. Colour is used only for status: blue Observed, green Verified, dashed grey Claimed, amber Needs you. |
| Truth rule | Every fact shows where it came from. No fallback numbers. Unknown shows as unknown. |
| Build approach | **New app in the same repo.** Carry over only the parts listed in section 3. The old `desktop/` keeps working until Phase 4, then it is deleted. |
| Engine | **One runtime** (Node) owns all state and drives agents over ACP. The desktop shows the runtime's records and sends commands. **The desktop makes no AI calls of its own.** |

---

## 2. Target architecture

```text
 Winston
   │
 MyaOS Desktop v2  (apps/desktop: Tauri v2 shell + React 19 UI)
   │  Rust side: window, user terminals (PTY), sleep prevention, notifications, starts the runtime
   │  UI side: renders runtime records, sends commands. No AI calls, no direct DB access.
   │
   │  HTTP + server-sent events on 127.0.0.1 (random port, token in ~/.myaos/runtime.json)
   ▼
 MyaOS Runtime  (runtime/: Node + TypeScript)        ◄── myaos CLI uses the same API
   ├─ Store: one SQLite file in ~/.myaos/ (never in git)
   ├─ Job engine: Brief → Plan → Build → Verify → Approve
   ├─ Council engine: Chair, seats, rounds, scoring, verdict → plan
   ├─ Session manager: one ACP client connection per agent session
   │     ├─ claude-agent-acp   (Claude Code)
   │     ├─ codex-acp          (Codex)
   │     ├─ gemini --experimental-acp (Gemini CLI)
   │     └─ any command that speaks ACP over stdio
   ├─ Worktrees: one git worktree per task session (.myaos/worktrees/<job>-<agent>)
   ├─ Evidence ledger: written from ACP tool calls, file writes and commands, not from agent summaries
   ├─ Verifier: re-runs each task's check, as a different agent, in a clean worktree
   └─ Team bridge: mirrors jobs into community/threads + inboxes so the current CLI and tmux team keeps working
```

### Why the runtime stays in Node

The existing runtime, CLI and 34 passing tests are Node. The official ACP SDK is TypeScript (`@agentclientprotocol/sdk` 2.0.2), as is the Claude adapter (`@agentclientprotocol/claude-agent-acp` 0.95.0). Buzz built its harness in Rust, but for us that would be a rewrite with no gain. New runtime code is written in **TypeScript**, because the ACP message types are where most bugs would hide. The old `src/` modules are ported into `runtime/` as they are needed.

### How ACP gives us real evidence

The runtime is the ACP **client**; each agent is an ACP **agent** process on stdio.

1. `initialize`: the runtime advertises the client capabilities `fs.readTextFile`, `fs.writeTextFile` and `terminal`.
2. `session/new` with `cwd` set to the task's worktree, plus the MCP servers that task is allowed.
3. `session/prompt` with the task's prepared prompt (brief, plan, criteria, how to report).
4. The runtime handles everything the agent asks for:
   - `session/update` notifications: message chunks, `tool_call`, `tool_call_update` (status, diffs, terminal output), and `plan`. These are stored as transcript entries and ledger rows.
   - `fs/write_text_file`: **the runtime writes the file itself**, so the diff is Observed.
   - `terminal/create` and `terminal/output`: **the runtime runs the command itself**, so the exit code is Observed.
   - `session/request_permission`: answered by the job's approval policy. Reads inside the worktree are allowed. Anything outside the worktree, any push or merge, and anything consequential becomes an Approval card for Winston.
5. `session/cancel` is the Interrupt button.

Whether each adapter actually routes file writes and commands through the client is **not yet confirmed**. The Phase 0 spike (0.6) settles this. An adapter that runs commands itself still reports them as tool calls; those entries are stored as **Claimed** until the verifier re-runs the check.

### Mapping evidence to what the UI shows

The UI reuses the evidence classes in `src/provenance.js`:

| Runtime class | UI label | When |
|---|---|---|
| `OBSERVED` | Observed | The runtime executed or saw it: a command and its exit code, a file write, a diff, a live process |
| `DECLARED`, `ATTESTED` | Claimed | An agent or a person said it, and nothing has checked it |
| `VERIFIED` | Verified | A **different** agent, or the runtime itself, re-ran the check in a clean worktree and it held. The self-verification check in `src/verifier.js` stays. |
| `UNKNOWN` | Unknown | No evidence, stale evidence, or conflicting evidence |

### Core records (store schema, first pass)

`rooms`, `members` (human or agent), `messages`, `jobs` (stage, brief, room), `criteria`, `tasks` (job, assignee, check command, gate), `sessions` (agent, runtime command, pid, worktree, state, last seen), `transcript_entries`, `evidence` (job, task, session, kind, class, payload, hash), `approvals`, `councils`, `council_cards`, `verdicts`, `identities` (name, role, avatar mark and colour, runtime, seats).

---

## 3. What we keep, port or drop

### Keep and move into `apps/desktop`

| From | What | Why |
|---|---|---|
| `desktop/src-tauri/src/pty/mod.rs` | User terminals (PTY) | Works today. Becomes the Terminal tab and "Open terminal here". |
| `desktop/src/components/XTermTerminal.tsx` | xterm.js wrapper | Restyled in Solid Glass. |
| `system_enable_sleep_prevention` and the two related commands | Keep the Mac awake during long jobs | Native, and small. |
| `desktop/src-tauri/tauri.conf.json`, icons, the `desktop:*` npm scripts | App shell and packaging | Pointed at the new app. |

### Port into the runtime (the logic is reused, not the Tauri command)

| From | What |
|---|---|
| `myaos_get_git_diff` (`desktop/src-tauri/src/commands/mod.rs:729`) | Diff parsing → runtime diff endpoint, used by both Work and Dev mode |
| `myaos_create_git_branch`, `myaos_create_git_commit`, `myaos_push_git_branch` | Git steps of a job. Push and merge always go through an Approval. |
| `myaos_clone_github_repo`, `myaos_connect_local_project`, `myaos_create_new_project` | Workspaces → the repo a room is bound to |
| `src/provenance.js`, `src/verifier.js` | Evidence classes, the self-verification check, check execution |
| `src/registry.js`, `community/agents.json` | Identities → coworkers (with avatars and seats added) |
| `src/events.js`, `src/inboxes.js` | Event shape; inbox delivery for the team bridge |
| `src/runtime/handshake.js`, `src/liveness.js` | Liveness probes → session last-seen |
| `src/doctor.js` | Health checks → a runtime health endpoint |
| `tests/*.test.js` | The suite keeps running against the ported modules |

### Drop

| What | Why |
|---|---|
| Every Normal-mode view plus `desktop/src/services/normalModeData.ts` | Sample data, not connected to anything |
| `JulesMissionFlowView`, `JulesCockpitView`, `CommandCenterView`, `OKRIntelligenceView`, `DesignStudioView` and `DesignStudioNormalView`, `TeamOrgChartView`, `AutomationView`, `utils/soundEffects.ts` | Replaced by the approved screens, or not needed for the core loop |
| `desktop/src/services/geminiOrchestrator.ts`, `myaos_call_gemini_orchestrator`, `myaos_get_gemini_api_key` | The desktop must not call AI or read secrets |
| `pty_spawn_claude`, `pty_spawn_gemini`, `pty_spawn_antigravity`, `myaos_get_claude_latest_turn` | Replaced by ACP sessions; no more reading agent log files |
| `myaos_wake_all_agents`, `myaos_sleep_all_agents` | They mark agents LIVE without any process (`db.rs:1078`) |
| Announcements, social posts, standups, OKR and design-project commands and tables | Not part of the product |
| The 48 `INSERT` statements in `desktop/src-tauri/src/system/db.rs`, including the sample autopilot queue | Sample rows presented as real |
| The `worker` command's proof file (`bin/myaos.js:216-229`) | It writes `status: SUCCESS` and completes the task without doing any work |
| The 74 hard-coded `/Users/winstonzulu/...` references in 10 desktop files | The app must run on any machine |

### Data carried over

Only identities (names, roles, runtimes) and the avatar choices, through a one-off import script. The current `data/myaos.db` (61 tables) is not migrated. The new store starts empty and fills from real runs.

---

## 4. Phases

Each phase ends with an exit check that can be shown, not just reported.

### Phase 0: truth and foundations (start here)

**0.1 Stop the current app showing made-up state.** It stays in use until Phase 4, so it must not mislead in the meantime.
- Remove the fallback numbers: `CommandCenterView.tsx:46-69` (`|| 6`, `|| 8`, `|| 12`, `|| 42`) and `JulesCockpitView.tsx:62-63`. Show "unknown" instead.
- Remove the Wake all / Sleep all buttons, and make `wake_all_agents` stop writing `LIVE`.
- Delete the seeded autopilot queue and the other sample inserts in `db.rs`.
- Make the `worker` command fail loudly instead of writing a SUCCESS proof file.

**0.2 Take the runtime store out of git.**
- `data/myaos.db` is tracked, and `myaos status` and `myaos test` modify it (seen on 2026-10-24). `myaos test` also rewrites `community/system/VERIFICATION_RECORD.json`.
- Move the live store to `~/.myaos/myaos.db` (configurable), remove the db from git, and add it to `.gitignore`.
- Tests use a temporary directory.

**0.3 Remove hard-coded paths.**
- Add a config file, `~/.myaos/config.json`, holding the workspace roots and the team repo path.
- Replace the 74 path references, starting with `desktop/src-tauri/src/main.rs:32`, `commands/mod.rs:276` and `App.tsx` `currentWorkspace`.

**0.4 Scaffold `apps/desktop`.**
- Tauri v2, React 19, Vite, TypeScript, Tailwind 4, shadcn with Base UI, and the Solid Glass stylesheet (`npx shadcn@latest add deeplethe/solid-glass/solid-glass`). Fonts: Geist and Geist Mono.
- Shared components:
  - Avatar (mark plus colour)
  - Status tag (Observed / Claimed / Verified / Unknown / Needs you)
  - Stage bar
  - Tool steps
  - Diff view
  - Ask card
  - Composer
- Build the 7 approved screens against a typed client for the runtime API. Fixtures are allowed only in a dev-only preview route, never as the app's starting state.

**0.5 Runtime skeleton (`runtime/`).**
- Store, schema and migrations; the local API with token auth; the event stream; a health endpoint.
- The desktop starts the runtime as a Tauri sidecar. If the runtime is down, the app says so instead of showing stale data.
- `bin/myaos.js status` reads from the same API.

**0.6 ACP spike.**
- Start one session each with `claude-agent-acp`, `codex-acp` and `gemini --experimental-acp`, each in a temporary worktree, on a trivial task: "add a line to a file and run a command".
- Record every message to the ledger.
- Write down, for each adapter:
  - Does it use the client's file and terminal capabilities?
  - How does it ask for permission?
  - How does it sign in (subscription or API key)?
  - What does cancel do?
- Result: a short findings note in `community/proposals/`, which decides how much evidence will be Observed versus Claimed in Phase 1.

**Phase 0 exit check**
- The new app opens and shows real runtime data, even if that data is empty.
- It makes no AI calls, and a search for `/Users/` in `apps/` and `runtime/` returns nothing.
- `git status` stays clean after `myaos test`.
- The ACP findings note is written.
- The existing 34 tests still pass, and the old `desktop/` app still runs.

### Phase 1: jobs that really run

- Implement the job stage machine. Briefs come from Home or the Room composer.
- Create a worktree per task session.
- Build the session manager: spawn, prompt, cancel, and permission requests turned into Approvals. It keeps checking the sessions it expects against the processes it actually sees, as Buzz does, and marks a session Offline when its process is gone.
- Write the evidence ledger from tool calls, file writes and commands.
- Connect the Work mode screens (Home, Room, Job) and the Dev mode screen (transcript, diff, terminal, evidence).
- **Exit check:** a real bug fix in one of the Myavana repos goes from brief to merge-ready, with one builder agent, every step in the ledger, and the merge gated on Winston's approval. Verification is still done by hand in this phase.

### Phase 2: independent verification and the team bridge

- The verifier runs as a different agent in a clean worktree. The runtime re-runs each task's check itself. Criteria move to Verified only under the rules in section 2.
- Approval cards say exactly what will happen ("merges X into main, deploys nothing, can be reverted").
- The team bridge writes each job thread to `community/threads/` and delivers @mentions to `community/inboxes/`, so the tmux and CLI agents can still take part. Their messages come back as Claimed evidence.
- The identity import brings over the existing team with avatars, runtimes and council seats.
- **Exit check:** the same kind of job as Phase 1, with Kael verifying Atlas's work end to end and no human relaying messages.

### Phase 3: the planning council

- The roast-room protocol adapted for software work:
  - Brief intake that asks for missing facts.
  - Openings, disagreements, debate, draft plan, ratify, verdict.
- Seat settings: name, question, weight, who plays it, avatar.
- A fixed card format for each seat:
  - a score from 0 to 10 for each option
  - a score for its own area
  - confidence
  - disaster risk on each option (none / possible / likely)
  - whether the change can be undone
  - the argument
- The Chair computes every number from the cards using the formula from roast-room's `scoring.md` and applies the three rules: the disaster cap, the can't-undo check, and the too-fast-agreement check.
- The options always include "smaller version" and "don't do it".
- Seats run as read-only ACP sessions, in parallel within a round.
- Quick mode (4 seats, 2 rounds) is the default for small jobs, because a full council is about 19 agent runs.
- The verdict produces `plan.json` → tasks with assignees, checks and gates.
- Council and Verdict screens; PDF export.
- **Exit check:** a council on a real decision produces a plan that Phase 1–2 then carries out, with the scores traceable to the stored cards.

### Phase 4: demo, measures and cut-over

- The scripted investor demo:
  1. Brief.
  2. Council.
  3. Build.
  4. Independent verification.
  5. Approval.
  6. Evidence.
- Measures computed only from the ledger:
  - jobs completed
  - verification failures caught
  - human interventions
  - time from brief to approval
- Package a signed `.dmg`. Remove the old `desktop/` folder and the dropped runtime code.

---

## 5. Risks and open questions

| Risk or question | Plan |
|---|---|
| ACP adapters differ in whether they use the client's file and terminal capabilities | The 0.6 spike decides. Fallback: tool-call records are Claimed until the verifier re-runs the check. |
| Sign-in inside the adapters (Claude subscription vs API key; Codex and Gemini sign-in) | Recorded in the spike note. Credentials stay with each CLI; the runtime never stores them. |
| Council cost (about 19 agent runs for a full council) | Quick mode is the default; the full council is opt-in, and its run count is shown before it starts. |
| Today's tmux and CLI agents do not speak ACP | They join through the team bridge, and their work counts as Claimed until it is re-run. |
| Several sessions on one repo | Every session gets its own worktree, with a limit on parallel sessions per runtime (as Buzz does). |
| TypeScript for the new runtime | Recommended. The old `src/` stays JavaScript until each module is ported. |
