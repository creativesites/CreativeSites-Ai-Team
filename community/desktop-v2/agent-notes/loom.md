# Loom — Status & Task Log

**Agent:** Loom (`loom`), Workspaces UI Engineer  
**Role:** Workspaces & Settings UI engineer  
**Team:** `creativesites`  
**Adapter:** `claude` (ACP)  
**Branch:** `antigravity/workspaces`  
**Base Branch:** `claude/desktop-app-ai-teams-2fa62f`  
**Assignment:** Assignment A — Workspaces + Settings UI (`task-7`)  
**Status:** COMPLETE / IN_REVIEW  

---

## 1. What was done

### 1.1 Workspaces Screen (`apps/desktop/src/screens/workspaces.tsx`)
- **Project List (`GET /v1/projects`)**:
  - Displays each project with name, team badge, root path, stats (room & open job counts), and description.
  - Fetches real live git state (`GET /v1/projects/:id/status`): branch name (`main`/`dev`/detached HEAD), commit SHA, and honest Clean / Dirty / Unknown badge.
  - Shows missing directory if path does not exist; shows "Not a git repository" if uninitialized.
- **Attach Existing Folder (`POST /v1/projects/attach`)**:
  - Form accepting path, optional project name, optional default branch, and team assignment.
  - Validates folder under allowed workspace roots and shows real API errors.
- **Clone Repository (`POST /v1/projects/clone`)**:
  - Form accepting git remote URL, optional parent directory, target name, and team.
- **Create Empty Project Folder (`POST /v1/projects/create-folder`)**:
  - Form accepting directory path, project name, git initialization checkbox, and team.
- **Multi-Repo Management**:
  - Lists all repositories under a project (`project.repos`) with individual git status badges.
  - Add repository form (`POST /v1/projects/:id/repos`).
  - Remove repository action (`DELETE /v1/repos/:id`).
- **Project-Bound Rooms & Members**:
  - Displays rooms bound to the project (`rooms.filter(r => r.projectId === project.id)`) with link to `#/rooms/:id` and job counts.
  - Create room form (`POST /v1/rooms` with `projectId`, `kind`).
  - Supports assigning initial coworker identities on creation via `POST /v1/rooms/:id/members`.
  - Expandable room member list (`GET /v1/rooms/:id/members`) with coworker avatars and inline "Add coworker" action.
- **Honest States**:
  - No mock data or optimistic guesses.
  - Empty state with direct action buttons.
  - Runtime offline banner and disabled action buttons when disconnected.

### 1.2 Settings Screen (`apps/desktop/src/screens/settings.tsx`)
- **Owner Identity (`GET /v1/settings` + `GET /v1/identities`)**:
  - Resolves owner from `settings.ownerId` (fallback 'winston' / identity with `isOwner: true`).
  - Shows owner avatar, name, ID, role, and approval level badge ("Owner · approves high & critical risk").
  - Dropdown selector to switch owner identity with `POST /v1/settings { ownerId }`.
- **Budgets & Spending Ceilings (`GET/POST /v1/budgets`)**:
  - Global defaults: per-job ceiling ($ USD) and monthly team ceiling ($ USD).
  - Updates both settings (`POST /v1/settings`) and budget ledger (`POST /v1/budgets { scope: 'global' }`).
  - Per-project budget overrides list with "Set project budget" form (`POST /v1/budgets { scope: 'project', projectId, period, amountCents }`).
- **Approval Policies (`GET/POST/PATCH/DELETE /v1/policies`)**:
  - Table of policies: scope (Global vs Project), action type (`merge`, `push`, `deploy`, etc.), max risk for lead (`low`, `medium`, `high`, `critical`), lead agent assignment, timeout before escalation to owner.
  - Form to create new policies (`POST /v1/policies`).
  - Inline toggle button to enable/disable policies (`PATCH /v1/policies/:id`).
  - Delete button with `DELETE /v1/policies/:id`.
- **Adapter Health & ACP Capabilities (`GET /v1/adapters`)**:
  - Displays status of all adapters: Claude (Ready), Codex (Ready), Gemini CLI (Needs login / key), DeepSeek Harness (Unsupported).
  - Probed abilities badges (`fs.readTextFile`, `fs.writeTextFile`, `terminal`).
  - Secure CLI instruction card for Gemini: `node runtime/scripts/set-adapter-key.mjs GEMINI_API_KEY <key>` (secrets never accepted or stored in the UI).
- **Team Bridge (`GET /v1/bridge/status` + `settings.bridge`)**:
  - Displays outbound mirroring state, threads directory, inbox directory, last mirror timestamp, and errors.
  - Toggle button to enable/disable auto-mirroring (`POST /v1/settings { bridge: { enabled: true, inbox: true } }`).
- **Runtime Health (`GET /health`)**:
  - Shows local endpoint URL, process PID, schema version, store health (WAL mode), host git availability, node version, and allowed workspace roots.

### 1.3 Reusable Workspace Status Component (`apps/desktop/src/components/workspaces/workspace-status.tsx`)
- Shared badge component rendering git branch, SHA, clean/dirty state, or honest Unknown error string.

---

## 2. Gate Verification

- **Command:** `cd apps/desktop && npm run typecheck`
- **Result:** `tsc -b` completed with **0 errors** (exit code 0).
- **Rule compliance:**
  - `apps/desktop/src/App.tsx` untouched.
  - `apps/desktop/src/lib/runtime.ts` untouched.
  - `apps/desktop/src/lib/route.ts` untouched.
  - `apps/desktop/src/components/app/shell.tsx` untouched.
  - `apps/desktop/src/components/app/status.tsx` untouched.
  - No changes outside Loom's assignment scope.

---

## 3. What is blocked

Nothing is blocked. All APIs needed were already available on `RuntimeClient`.

---

## 4. Requests for Lead

See `community/desktop-v2/agent-notes/loom-requests.md` for exact wiring into `App.tsx`.
Both components accept optional props and have built-in `useRuntimeData` fallbacks for zero-boilerplate mounting:
```tsx
case 'workspaces': return <WorkspacesScreen />;
case 'settings': return <SettingsScreen />;
```
