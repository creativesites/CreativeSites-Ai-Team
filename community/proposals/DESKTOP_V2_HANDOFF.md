# Desktop v2 — handoff for the UI workstream

> Written by the Lead, 2026-10-26. Read [DESKTOP_V2_DECISIONS.md](DESKTOP_V2_DECISIONS.md) first.
> Scope: this document is the contract between the runtime owner (Lead) and the app owner (Claude). The runtime/worktree is at `runtime/`; the app is at `apps/desktop/`.

## Status

The runtime is no longer read-only. A foundation commit implements:

- schema **version 2** — projects, repos, teams, members, identity provenance, job plans/tasks/criteria/stage history, sessions/transcript, hash-chained evidence, approvals + policies + escalation, settings, budgets, usage, adapters, idempotency;
- full write API for the job lifecycle, approvals, evidence verification, sessions/transcript, budgets and workspaces;
- runtime-owned **checks, worktree snapshots and independent verification**;
- **ACP session manager**: spawns an adapter over stdio, streams its transcript, converts permission requests into approvals (blocking with timeout), snapshots the worktree before/after each turn and kills the process group;
- runtime hardening: OS lock (one runtime per machine), atomic `~/.myaos/runtime.json`, owner-only store (`0700`/`0600`), transactional events with hash chain, gap-aware SSE, validation, `Idempotency-Key`, real health checks, session reconciliation on restart.

Verified: `runtime` 25/25 tests pass, `tsc --noEmit` clean; `apps/desktop` `tsc -b` clean. The session-manager path is tested end-to-end against a scripted ACP agent; **no real adapter is authenticated on this machine today** (see below), so a real Claude/Gemini/Codex run still needs a re-login / key / install before the UI can show a live turn.

## How to run

```bash
# runtime
cd runtime && npm test && npx tsc --noEmit

# app
cd apps/desktop && npm run typecheck && npm run tauri -- dev

# reset the local store (dev only)
rm -f ~/.myaos/runtime.db ~/.myaos/runtime.db-wal ~/.myaos/runtime.db-shm ~/.myaos/runtime.json ~/.myaos/runtime.lock

# inspect
curl -s http://127.0.0.1:<port>/health
node ../bin/myaos.js status   # from the repo root
```

The app still discovers the runtime through the Rust side (or Vite's `/__myaos/runtime` in a browser). No API tokens belong in the UI; use `RuntimeClient`.

## Data model (what the UI can rely on)

| Record | Notes |
|---|---|
| `projects` | A project can have several `repos` (path, remote, branch). `rootPath` is the primary folder. |
| `rooms` | `projectId`, `teamId`, `kind` (`project`/`squad`/`adhoc`). Members are separate records. |
| `identities` | `teamId`, `lane`, `symbol`, `capabilities[]`, `provenance` (DECLARED/ATTESTED/OBSERVED/VERIFIED), `isOwner`, `approvalLevel` (`owner`/`lead`/`member`/`none`), `adapterId`. |
| `jobs` | `stage` (`brief`/`plan`/`build`/`verify`/`approve`/`done`/`cancelled`), `plan` JSON (summary/options/chosen/approvedAt), `risk`, `priority`, `budgetCents`, `costCents`, `startedAt`, `endedAt`, `stageNote`, `baseSha`, `shipSha`, `ownerId`, stage history. |
| `criteria` | Text + computed `evidenceClass` (strongest evidence from the criterion or its linked tasks) + `taskIds`. |
| `tasks` | `position`, `planTaskId`, `mode` (build/verify/review/ops/design), `checkCommand`, `gate`, `status`, timestamps, `evidenceRequired`. |
| `sessions` | ACP fields (`acpSessionId`, `adapterId`), `mode`, `worktree`, `baseSha/branch`, `state`, `pid`, `exitCode`, `error`, `cancelRequestedAt`, `turnCount`. |
| `transcript_entries` | Per-session `seq`, `kind`, `role`, `turnId`, `itemId`, `payload`. |
| `evidence` | Append-only, `prevHash`/`contentHash` chain, `class`, `kind` (command/diff/file/test/message/review/browser/deploy/db_read/db_write/api/approval/artifact), `command`, `exitCode`, `commitSha`, `worktree`, `verifiedBy`, `supersedes`. |
| `approvals` | `actionType`, `action` JSON, `risk`, assigned/escalated to, `expiresAt`, `policyId`, `decidedBy(Kind)`, `note`, `execution`, `requestId`, `reversible`, `sessionId`/`taskId`. |
| `approval_policies` | scope global/project/room, action type, max risk for lead, lead id, escalate-to, timeout. |
| `settings` | `ownerId`, `defaultBudgetCents`, `defaultMonthlyBudgetCents` (free-form key/value too). |
| `budgets` | global/project, period job/day/month, amount cents, currency. |
| `usage` | per job/session/model tokens + cost; job cost rolls up automatically. |
| `adapters` | presets Claude / Codex / Gemini / DeepSeek Harness merged with user overrides; `installed/version/abilities` are probed, never assumed. |

## API map (all need `Authorization: Bearer <token>` except `/health`)

### Read / meta

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | open; `ok`, `schemaVersion`, `checks.store/git/node/adapters/workspaceRoots` |
| GET | `/v1/summary` | counts (kept stable for the existing sidebar) |
| GET | `/v1/settings` | object |
| POST | `/v1/settings` | merge patch |
| GET | `/v1/events/recent?since=&type=&subjectId=&limit=` | JSON replay (for debugging / catch-up) |
| GET | `/v1/events` | **SSE** stream; `Last-Event-ID`; may emit `event: gap` with `{requestedSince, oldestAvailable, latestAvailable, truncated}`. Show a gap as Unknown. |

### Identities / teams

| Method | Path |
|---|---|
| GET/POST | `/v1/identities`, `/v1/identities/:id` (POST updates) |
| POST | `/v1/import/identities` `{ owner?, teams?, identities? }` |
| GET/POST | `/v1/teams`, `/v1/teams/:id` (POST updates) |
| GET/POST | `/v1/teams/:id/members`; DELETE `/v1/teams/:id/members/:memberId` |

### Projects / repos / workspaces

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/v1/projects` | create with `{name, rootPath?, teamId?, repos?[]}` |
| POST | `/v1/projects/attach` | `{path, name?}` — validates under `workspaceRoots`, reads real git state |
| POST | `/v1/projects/clone` | `{url, parentDir?, name?}` |
| POST | `/v1/projects/create-folder` | `{path, name?, initGit?}` |
| GET | `/v1/projects/:id` | includes repos |
| GET | `/v1/projects/:id/status` | `{project, repos:[{repo,state}]}` — `state` is real git state or `unknown` with error |
| POST | `/v1/projects/:id/repos`; DELETE `/v1/repos/:id` | add/remove repo |

### Rooms / members / messages

| Method | Path |
|---|---|
| GET/POST | `/v1/rooms` (create with `projectId`, `teamId`, `kind`) |
| GET/POST | `/v1/rooms/:id` (POST updates name/project/team/archived) |
| GET/POST | `/v1/rooms/:id/members`; DELETE `/v1/rooms/:id/members/:memberId` |
| GET/POST | `/v1/rooms/:id/messages` |

### Jobs / plan / tasks / evidence / approvals

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/jobs?roomId=&projectId=&stage=&limit=` | summaries |
| POST | `/v1/jobs` | `{roomId,title,brief,createdBy,criteria?,risk?,priority?,budgetCents?}` |
| GET | `/v1/jobs/:id` | full detail: plan, criteria, tasks, evidence, approvals, sessions, usage, history |
| PATCH | `/v1/jobs/:id` | title, brief, risk, priority, budgetCents, blockedReason |
| POST | `/v1/jobs/:id/stage` | `{to, actorId, actorKind?, note?, force?}` — validated transitions + gates; force is owner-only and audited |
| POST | `/v1/jobs/:id/plan` | `{plan:{summary, options?, chosen?}, actorId}` |
| POST | `/v1/jobs/:id/plan/accept` | `{actorId}` |
| GET | `/v1/jobs/:id/history` | stage history |
| GET | `/v1/jobs/:id/budget`; POST `/v1/jobs/:id/budget/check` | `{estimateCents}` → 409 when over |
| GET/POST | `/v1/jobs/:id/criteria` | POST add criterion; PATCH/DELETE `/v1/criteria/:id` |
| GET/POST | `/v1/jobs/:id/tasks` | POST create with `criterionIds?[]`; PATCH `/v1/tasks/:id` |
| GET/POST | `/v1/jobs/:id/evidence` | append (see rules); GET `/v1/evidence/:id`; POST `/v1/evidence/:id/verify` `{verifiedBy, note?, command?, exitCode?, commitSha?}` |
| POST | `/v1/jobs/:id/checks` | `{taskId}` — **the runtime runs the task's check itself** in the job worktree; records OBSERVED evidence with real exit code/output/commit |
| POST | `/v1/jobs/:id/snapshot` | `{actorId?}` — git status + `git diff HEAD` in the job worktree; records OBSERVED diff evidence with content-addressed artifacts |
| POST | `/v1/jobs/:id/verify` | `{actorId, taskIds?}` — re-runs each check in a **clean detached worktree** at the job base commit; passing runs become VERIFIED, failing runs stay Observed; rejects self-verification |
| GET | `/v1/artifacts/:sha` | raw artifact bytes (diff/output), token required |
| GET/POST | `/v1/jobs/:id/approvals`; GET `/v1/approvals?status=&assignedTo=`; GET `/v1/approvals/:id`; POST `/v1/approvals/:id/decision` | decision `{decision:'approve'\|'decline', decidedBy, decidedByKind?, note?, execution?}` |
| GET/POST | `/v1/policies`; PATCH/DELETE `/v1/policies/:id` | approval defaults |
| GET/POST | `/v1/budgets` | create/update global/project budgets |
| GET/POST | `/v1/jobs/:id/usage` | record usage `{model, inputTokens, outputTokens, costCents, sessionId?}` |

### Sessions / transcript

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/sessions`; GET `/v1/sessions/:id` | includes ACP fields |
| POST | `/v1/jobs/:id/sessions` | **starts a real ACP session**: `{agentId, adapterId?, taskId?, prompt?, mode?}` → `202` with the session row; progress streams as transcript/SSE. The manager creates the worktree, snapshots, prompts, records evidence, and handles permission→approval. |
| POST | `/v1/sessions` | register a session record manually (used by CLI/debug; the manager uses its own path) |
| PATCH | `/v1/sessions/:id` | runtime records state/exit/error/turnCount; UI should read, not write |
| POST | `/v1/sessions/:id/cancel` | `{actorId}` — cancels the live ACP turn (or records a cancel request) and answers pending permissions as cancelled |
| POST | `/v1/sessions/:id/prompt` | `{text}` — follow-up turn while the session is idle (`202`) |
| GET/POST | `/v1/sessions/:id/transcript?since=&limit=` | append with `{seq?, kind, role?, turnId?, itemId?, title?, payload?}` |

### Adapters

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/adapters` | presets + overrides; `installed/version` probed; `?probe=1` forces |
| POST | `/v1/adapters/:id` | override `{command?, args?, enabled?, abilities?}` |

## Semantics the UI must honor

- **Stage gates.** `brief→plan→build→verify→approve→done` (plus `cancelled`, and `verify→build` / `approve→build` for send-back). Build requires a plan summary and at least one task. Verify requires all tasks done and each evidence-required task has evidence. Approve requires every criterion at `OBSERVED` or better. Done requires no pending approvals. A `409` body explains which gate failed. Owner-only `force` is an escape hatch and is recorded.
- **Evidence.** Agents can record `DECLARED`/`ATTESTED`; only the runtime records `OBSERVED`; `VERIFIED` exists only by calling `/v1/evidence/:id/verify` with a different actor. A successful verify supersedes the original and raises the criterion's class. Never render a claim as Observed.
- **Approvals.** On create, policy decides lead vs owner: risk ≤ `maxRiskForLead` and a lead is configured → lead agent; otherwise owner. Timeout escalates to the owner; expiry is visible. The owner can decide any pending approval; the lead can decide only what is assigned. Decline is a decision, not a delete. History is the `events` log + approval row.
- **Budgets.** `GET /v1/jobs/:id/budget` returns `configured:false` (not zero!) when no ceiling is set. `POST /v1/jobs/:id/budget/check` is a 409 when over. Show remaining only when configured.
- **Sessions.** A session row is evidence of an intent/run record, not proof a process is alive. `reconcileSessions` marks dead ones failed on runtime start. The UI should show state + last seen, and treat stale as Unknown/Offline.
- **Events.** Every write emits a hash-chained event; the chain is verifiable via `/v1/events/recent`. A `gap` SSE event means the client missed data: show Unknown and refetch.
- **Idempotency.** Send `Idempotency-Key` on retryable POSTs; the runtime replays the stored response.
- **Errors.** 400 validation with a field message; 403 permission/owner-only; 404; 409 gate/conflict/overspend. Show these, don't swallow.

## UI workstream (owned by Claude)

Read the task board entries `task-7` and `task-8`. Concrete order:

1. **Runtime client types/methods** in `src/lib/runtime.ts`: add the endpoints above (projects, workspaces/status, teams, members, job PATCH/stage/plan, criteria, tasks, evidence verify, approvals decision, policies, budgets, settings, adapters, transcript). Everything is typed in `runtime/src/api/types.ts`; import the types, don't duplicate.
2. **Workspaces screen + first-run**: attach folder / clone / create empty; show repo state (branch/dirty/unknown); bind a room to a project; make Home's brief box require/choose a project (or create one). This is the blocker for a real job.
3. **Coworkers**: group by team; show provenance, capabilities, approval level, liveness from sessions; owner record; import action (call `/v1/import/identities` with the import payload from `runtime/scripts/` once the import workstream lands).
4. **Job lifecycle + plan surface**: stage transitions with gate explanations, plan editor (summary/options/tasks/criteria), task board with checks/gates, criteria with evidence classes and drill-down.
5. **Approval center**: Needs-you queue, structured card (action/consequence/risk/reversibility/evidence/expiry/assignee), approve/decline/send back, audit link, notifications; show lead vs owner clearly.
6. **Budget/settings**: owner identity, global/project budgets, approval policy defaults, adapter health.
7. **Work/Dev modes**: Work = story + cards; Dev = transcript + tool steps + diff + evidence ledger + terminal. Same records.
8. **Dev terminal**: port the v1 PTY (`desktop/src-tauri/src/pty/mod.rs`, `XTermTerminal.tsx`) into `apps/desktop/src-tauri` + xterm; add a Terminal tab and "open terminal here". This is a separate Tauri/PTY task, coordinate with Lead before changing Rust build config.
9. **Council/Verdict**: the screens already exist; wire them once the council endpoints land (Phase 3). Until then leave the placeholder honest.

Remove disabled placeholders as endpoints land. No fixture data in live routes. Dates show date+time (not time only). Handle `UNKNOWN`/`Offline`/`configured:false` honestly.

## Ground rules

- **Own your files.** Claude: `apps/desktop/**`. Lead: `runtime/**`, `bin/myaos.js`, docs. Do not edit the other side; write a request in this doc instead.
- Small commits, tests/typecheck before commit, no force pushes.
- Update the task board (`task-7`, `task-8`) as you go; record what is done and what is blocked.
- If an API is missing, say exactly what shape you need in the "Requests" section below; the Lead will add it.

## Adapter reality (Phase 0.6, 2026-10-26)

Read [ACP_SPIKE_FINDINGS.md](ACP_SPIKE_FINDINGS.md) before building adapter UI. Current machine state:

| Adapter | State to show |
|---|---|
| Claude (`claude-agent-acp`) | installed but **OAuth expired** (401 on every prompt) → "Re-authenticate Claude Code" |
| Gemini (`gemini --acp`) | installed but needs `GEMINI_API_KEY` (local OAuth expired) → "Set GEMINI_API_KEY / sign in" |
| Codex (`codex-acp`) | **not installed** (`codex` absent) → "Install Codex" |
| DeepSeek Harness | **no ACP agent entry point** → "Unsupported as an ACP agent" |

`GET /v1/adapters` reports installed/version; it cannot prove auth. The session manager reports a failed session with the adapter's error in the transcript; show that as Unknown/failed, never as a successful empty turn. Starting a session with a blocked adapter returns a `409` with the reason. A custom adapter can be added via `POST /v1/adapters/:id` (command/args) — the tests use that with a scripted fake agent.

## Requests from the UI side

_(Claude: append here when you need a runtime change.)_

## Known gaps owned by the Lead

- Real-adapter verification of the session manager: the code path is tested with a scripted ACP agent; unblock auth/install and run the spike again (Phase 0.6 §9) before claiming any adapter is live.
- Worktree snapshots, runtime check runner and the independent verifier are implemented; the ACP manager still needs to call them after each turn.
- Artifact GC/retention and diff review UI.
- Council/verdict endpoints and scoring persistence (Phase 3).
- Team bridge (threads/inboxes ↔ runtime) and legacy-agent claims.
- Non-code job execution (ops/data/browser/deploy) beyond the evidence kinds.
- Identity import: the reviewed export is in `community/desktop-v2/import/` and `runtime/scripts/apply-import.mjs` applies it (29 identities incl. owner, 3 teams, projects, rooms, lead policies). It has been applied to the local store.
- PTY port and packaging (bundle Node/runtime, signing) for Phase 4.
