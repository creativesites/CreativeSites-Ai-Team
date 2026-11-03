# Antigravity agents — assignments, registration, and working rules

> Date: 2026-10-27. Base branch: `claude/desktop-app-ai-teams-2fa62f` (the MyaOS Desktop v2 branch, inside `.claude/worktrees/desktop-app-ai-teams-2fa62f`).
> Goal of the current phase: **Phase 1 close-out** — one real job can be started, planned, built, verified and approved from the app.

Read these first, in order:

1. `community/proposals/DESKTOP_V2_DECISIONS.md` — product decisions (multi-project, approvals, adapters, owner).
2. `community/proposals/DESKTOP_V2_HANDOFF.md` — API map, semantics, UI tasks.
3. `community/proposals/ACP_SPIKE_FINDINGS.md` — what Claude/Codex/Gemini/DSH actually do.
4. `runtime/src/api/types.ts` — the exact wire types. Do not invent fields.

Current reality: the runtime is done and tested (32/32); Claude/Codex adapters work; Gemini needs a valid key; the app UI is the bottleneck.

---

## Registration (do this before any work)

Every agent picks a **unique permanent name** and registers. Suggested names (available): **Loom** and **Quill** — use one each, or pick your own favourite (must be unique).

1. Create your worktree/branch first (see below), then run registration inside it.
2. Check your id is free:
   ```bash
   node runtime/scripts/register-agent.mjs --check loom
   ```
3. Register (example):
   ```bash
   node runtime/scripts/register-agent.mjs \
     --id loom \
     --name Loom \
     --role "Workspaces UI engineer" \
     --team creativesites \
     --symbol "🪡" \
     --mark wave \
     --color teal \
     --capabilities ui,react,typescript \
     --adapter claude
   ```
   It registers you in the v2 runtime store (canonical, the app shows you immediately), appends you to `community/agents.json` and `community/AGENTS_REGISTRY.md`. It never writes `data/myaos.db` (v1).
   - `--team`: `creativesites` (default), `meetingmind`, or `deployfleet`.
   - `--mark` / `--color`: pick from the Solid Glass avatar set in `apps/desktop/src/components/app/avatar.tsx`.
   - `--adapter`: `claude` or `codex` (both are working); `gemini` needs a valid key; `dsh` is not an ACP agent.
   - Provenance starts as `DECLARED`; do not claim OBSERVED/VERIFIED for yourself.
4. Run registrations **one at a time** (they write `community/agents.json`).
5. Commit the registration files as your first commit:
   ```
   git add community/agents.json community/AGENTS_REGISTRY.md
   git commit -m "chore(team): register <name>"
   ```
   The v2 store entry is already live; it does not need a commit.

Do **not** edit `data/myaos.db`, `~/.myaos/runtime.db`, `~/.myaos/adapters.env`, or secrets. Do not push, merge, or rebase the base branch.

## Worktrees and branches (one per agent)

```bash
cd /Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team
git worktree add .claude/worktrees/antigravity-workspaces \
  -b antigravity/workspaces claude/desktop-app-ai-teams-2fa62f
cd .claude/worktrees/antigravity-workspaces
```

Use the matching branch for your stream:
- Workspaces/Settings UI: `antigravity/workspaces`
- Terminal/PTY: `antigravity/terminal`

Before coding, rebase onto the Lead's shared plumbing (already landing):
```bash
git rebase claude/desktop-app-ai-teams-2fa62f
```
If the rebase conflicts, stop and report; do not force anything.

Commit only your files, with small messages. The Lead merges your branch after review and runs the full gate (`runtime` tests + both typechecks + app launch).

## Shared files are Lead-owned

These files are being edited by the Lead/Claude. **Do not edit them** unless your assignment explicitly says so. If you need a route, nav item, client method or permission, write the exact request in `community/desktop-v2/agent-notes/<your-id>-requests.md`, commit that note, and message the Lead.

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/lib/runtime.ts`
- `apps/desktop/src/lib/route.ts`
- `apps/desktop/src/components/app/shell.tsx`
- `apps/desktop/src/components/app/status.tsx`
- `apps/desktop/src-tauri/src/main.rs` (except the Terminal agent's command registration)
- `runtime/**` (unless your assignment is a runtime task)

---

## Assignment A — Workspaces + Settings UI (task-7)

**Owner:** one Antigravity agent (suggested name Loom). **Branch:** `antigravity/workspaces`.
**Goal:** first-run from an empty store lets Winston attach/clone/create a project, bind a room to it, and configure the team.

### Deliverables
1. `apps/desktop/src/screens/workspaces.tsx`
   - Project list from `GET /v1/projects`: name, repos, branch/dirty/unknown state (`GET /v1/projects/:id/status`), room/job counts.
   - **Attach existing folder** (`POST /v1/projects/attach`), **clone** (`POST /v1/projects/clone`), **create empty** (`POST /v1/projects/create-folder`).
   - Add/remove repos (`POST /v1/projects/:id/repos`, `DELETE /v1/repos/:id`).
   - Create a room bound to a project (`POST /v1/rooms` with `projectId`), and show initial members (`POST /v1/rooms/:id/members`).
   - Empty / loading / runtime-offline / unknown states are honest; no sample data.
2. `apps/desktop/src/screens/settings.tsx`
   - Owner identity (from `GET /v1/settings` + `GET /v1/identities`).
   - Budgets (`GET/POST /v1/budgets`) global + per project; approval policies (`GET/POST/PATCH/DELETE /v1/policies`).
   - Adapter health from `GET /v1/adapters` (Ready / Needs login / Not installed / Unsupported) and the bridge toggle (`POST /v1/settings {"bridge":{"enabled":true|false}}`).
   - Link to `runtime/scripts/set-adapter-key.mjs` for Gemini (do not accept or store secrets in the UI).
3. New reusable components under `apps/desktop/src/components/workspaces/` and `apps/desktop/src/components/settings/` (if useful).
4. `community/desktop-v2/agent-notes/<id>-requests.md`: the route path, nav label/icon, and client methods needed; exact props you expect from `App.tsx`. The Lead wires them.

### Rules
- Use Solid Glass patterns from `home.tsx` / `coworkers.tsx`; reuse `Tag`, `EmptyState`, `SectionTitle`, `buttonVariants`.
- Use real API data only; unknown shows Unknown, never a guess.
- Do not edit `App.tsx`, `lib/runtime.ts`, `route.ts`, `shell.tsx`; do not touch runtime or Tauri.
- Typecheck with `cd apps/desktop && npm run typecheck`.
- Screens are not routed yet; the Lead wires them. Make components accept props so wiring is trivial.

### Acceptance
- `tsc -b` clean.
- With the runtime running, the Workspaces screen can attach a real folder and create a project/room; Settings reads/writes budgets and policies.
- Notes file lists every integration request.

---

## Assignment B — Terminal / PTY (Dev mode)

**Owner:** one Antigravity agent (suggested name Quill). **Branch:** `antigravity/terminal`.
**Goal:** a real terminal in the job worktree, ported from the working v1 PTY.

### Deliverables
1. `apps/desktop/src-tauri/src/pty.rs` (or `pty/mod.rs`) ported from `desktop/src-tauri/src/pty/mod.rs` (v1):
   - spawn a login shell in a given cwd, write input, resize, kill, read output.
   - Tauri commands (choose clear names, e.g. `terminal_spawn`, `terminal_write`, `terminal_resize`, `terminal_kill`) and an output event/channel.
   - Login-shell PATH discovery (v1 code is the reference); no hard-coded `/Users/...` paths.
   - Add the `portable-pty` dependency to `apps/desktop/src-tauri/Cargo.toml`; register commands in `main.rs` (this is the one allowed edit there).
2. `apps/desktop/src/components/terminal.tsx` — xterm.js + FitAddon wrapper (v1 `desktop/src/components/XTermTerminal.tsx` is the reference), Solid Glass dark theme, resize on container change, cleanup on unmount.
3. Add `@xterm/xterm` and `@xterm/addon-fit` to `apps/desktop/package.json` (npm install).
4. `community/desktop-v2/agent-notes/<id>-terminal.md`: how to wire it into `DevScreen` (props `cwd`, `onReady`, `onExit`), plus any permission/capability changes.

### Rules
- Do not edit any screen other than the new terminal component; do not edit `App.tsx`, `lib/runtime.ts`, or other Rust modules.
- No shell on the runtime's token; the terminal is a user terminal, not an agent session.
- Build: `cd apps/desktop/src-tauri && cargo build` (or `cargo check`). Typecheck: `cd apps/desktop && npm run typecheck`.
- Test manually: spawn shell in a repo, `pwd`, `echo ok`, resize, `exit`; report exact commands/output in your note.

### Acceptance
- Rust compiles; terminal component typechecks.
- Manual terminal works in a real folder (login shell, resize, clean exit).
- No other files changed.

---

## Coordination protocol

- Work only in your own worktree/branch. Commit small, only your files.
- Use `community/desktop-v2/agent-notes/<id>.md` for status (what done, what blocked, requests).
- Do not merge, push, rebase shared branches, or edit other agents' files.
- Run your gate before reporting:
  - UI: `cd apps/desktop && npm run typecheck`
  - Rust/terminal: `cargo check` + `npm run typecheck`
- Report back with: branch, commits, files, commands run + results, what is blocked, and the exact wiring request.
- The Lead reviews and merges; the Lead runs the full gate and the app launch.
