# MyaOS Desktop v2 — decisions (2026-10-26)

> Source: Winston's answers after the Phase 0 review ([DESKTOP_V2_REVIEW.md](DESKTOP_V2_REVIEW.md)).
> Status: accepted unless marked **assumed**. This file supersedes the corresponding assumptions in `DESKTOP_V2_BUILD_PLAN.md`.

## D1 — Multiple projects are first-class

The app must handle any number of projects. Winston can:

- **add an existing folder** (attach; read remote/branch/dirty state),
- **clone a repo** (URL + parent folder),
- **create a project from empty** (folder + `git init` + starter files optionally),
- **multi-repo projects** (a project can own several repos; Myavana alone has chatbot, dashboard, WordPress, RN SDK).

Model: `projects` → `repos` → `rooms`. A **room defaults to one project** (`#project`); squads can have their own rooms inside a project (`kind = 'squad'`). A job belongs to one room and one project; a job may reference more than one repo when the work spans them. Do not tie a room to a single `repo_path` as the only model.

## D2 — Full-featured app, not a code-only loop

The app is the operating console for the whole team: code, ops/data, browser QA, deploys, production writes, content, design. The worktree + diff flow is **one execution type**, not the only one. Non-code jobs get brief → plan → evidence → approval the same way; evidence kinds include `browser`, `deploy`, `db_read`, `db_write`, `api`, `artifact`.

Keep the useful v1 capabilities: workspace/repo onboarding, git release loop (diff/stage/commit/branch/push/release card), interactive terminals, cost/token telemetry, settings (adapters, integrations, secrets stay out of the app store), Design Studio.

## D3 — Approvals: team lead first, then escalate to the human

- Default rule: **low and medium risk → assigned to the project/team lead agent**; **high and critical risk → Winston** (owner). A lead decision is recorded and auditable; the owner can always override.
- Every approval has an escalation chain: `lead → owner`, with a timeout; on timeout it escalates (never silently disappears). Pending approvals expire only after the owner-level timeout and are recorded as expired.
- Approval defaults live in policy records (global / project / room / action type), editable in Settings.
- Applies to **all consequential actions**: merge, push, force-push, deploy, rollback, production DB write, data export, spend, external send, new repo/remote, agent install/upgrade.
- Every card states the exact action, target, what will and will not happen, reversibility, evidence, risk, requester and expiry.
- The owner identity is a real record (`winston`), not a hardcoded "You".

## D4 — The runtime is canonical; threads are mirrored

The runtime store is the source of truth for **jobs, plans, tasks, sessions, evidence and approvals**. Community threads/inboxes are:

- mirrored/exported so the existing tmux/CLI agents keep working,
- imported into the app with author attribution and **Claimed** provenance when agents write there,
- never a second place where the same approval/job state is edited independently.

Legacy agents can keep writing threads/inboxes; the bridge imports their posts as Claimed. Code work by CLI agents is attributable only through a **branch/patch/commit handoff** so the verifier can re-run in a clean worktree. `GEMINI.md`, planner and verifier prompts get updated in the same change that introduces the `myaos` write commands.

## D5 — Adapters: Claude, Codex, Gemini and DeepSeek Harness

All four are supported through one adapter registry:

| Adapter | Preset command | Notes |
|---|---|---|
| Claude Code | `claude-agent-acp` | subscription OAuth or API key; ACP v1/v2 |
| Codex | `codex-acp` (needs `codex` on PATH) | third-party Go bridge; sandbox is Codex-native |
| Gemini CLI | `gemini --acp` | `--experimental-acp` is deprecated |
| DeepSeek Harness | `dsh` (command to be confirmed in the spike) | if it exposes ACP; otherwise a custom command entry |

Capability is **probed, never assumed**: the runtime records what each adapter actually routes through the ACP client (`fs.readTextFile`, `fs.writeTextFile`, `terminal`) and the UI shows the resulting evidence class. No adapter is required for launch; missing/unauthed adapters show as unavailable, not as fake live.

## D6 — Design Studio stays

Keep the Design Studio direction (threads 026/027) and the uncommitted Phase 1 work in `desktop/src/views/normal/DesignStudioNormalView.tsx` + `designSystemExtractor.ts`. Preserve it before the old `desktop/` app is deleted. It becomes a later screen/work type in v2 (design jobs: scan repo → extract tokens → propose screens → dispatch build task), not sample data.

## D7 — Owner identity

Create identity `winston` (`name: Winston`, role Owner/Founder, `approval_level: owner`, teams: all). Settings key `ownerId = winston`. Existing rows created with `createdBy: "owner"` remain valid; new writes use the settings owner. The UI may still display "You" but the record and audit use `winston`.

## D8 — Budget ceilings are configurable

- Global defaults: per-job and per-month ceilings in Settings.
- Per-project overrides.
- Per-job override at creation.
- Usage is recorded per session/model (tokens + cost); the runtime refuses to start a session/council that would exceed the ceiling (`409` with the reason and remaining budget shown), rather than silently overspending.
- Council run count and estimated cost shown before start.

## D9 — Evidence is capability-driven

Adopt the review's model ([DESKTOP_V2_REVIEW.md](DESKTOP_V2_REVIEW.md) §2.3, [ACP_SPIKE_FINDINGS.md](ACP_SPIKE_FINDINGS.md) when ready):

- **Observed**: the runtime did it — worktree snapshots (git status/diff/hashes), commands the runtime ran (checks/builds), PIDs, commit SHAs, remote results.
- **Attested / Claimed**: agent tool calls, messages, thread posts; never upgraded by assertion.
- **Verified**: a different agent (or the runtime) re-ran the exact check in a clean worktree on the exact commit.
- **Unknown**: no evidence, stale evidence (commit/worktree changed), or gaps.
- Append-only, hash-chained ledger; artifacts content-addressed outside SQLite; gaps in the event stream are shown as Unknown, never silently skipped.

## D10 — Assumed defaults (confirm when convenient)

These three answers were not explicit; I am proceeding with the defaults below and will change them on request:

1. **Rooms**: one default room per project; squad rooms are optional inside a project. (If you want one room per squad instead, only the default changes.)
2. **Canonical**: runtime store canonical; threads mirrored (D4).
3. **Owner identity**: `winston` as above.

## D11 — Working protocol (for the two agents)

- One shared branch: `claude/desktop-app-ai-teams-2fa62f` in the existing worktree. Small atomic commits, tests before commit, no history rewrites, no force pushes.
- **Lead owns `runtime/`** (engine, schema, API, ACP, verifier, bridge). **Claude owns `apps/desktop/`** (UI, screens, Tauri/PTY). Both may edit `community/proposals/*` docs and `bin/myaos.js` only with a note in the handoff.
- The API map and UI tasks live in [DESKTOP_V2_HANDOFF.md](DESKTOP_V2_HANDOFF.md). Read it before starting UI work.
- Tests/gates: `npm test` + `npx tsc --noEmit` in `runtime/`; `npm run typecheck` in `apps/desktop/`. A commit that fails these is not mergeable.
- No fake data in live routes; fixtures stay behind `#/preview/*` and out of production builds.
- When you need a runtime change, write it in the handoff doc's "requests" section instead of editing `runtime/`.
