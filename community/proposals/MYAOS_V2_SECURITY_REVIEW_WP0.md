# MyaOS V2 runtime: security review (WP0-T9)

**Date:** 2026-11-03 · **Reviewer:** Claude Code lead session · **Scope:** `runtime/` HTTP API, store, agent process launch, community sync. **Code:** main line after the WP0 merge.

## What is sound (keep)

| Control | Evidence |
|---|---|
| API bound to loopback only | `app.ts:140` `listen(port, '127.0.0.1')` |
| Random 256-bit bearer token; constant-time compare | `app.ts:46`, `server.ts` `tokenMatches` (`timingSafeEqual`) |
| Token and info file owner-only; written atomically | `main.ts:46` (temp file, chmod, rename); `~/.myaos` is 0700 |
| Store, WAL and backups owner-only (0600) | `store/db.ts` `privateFile`; `store/backup.ts` |
| Browser origin allowlist (Tauri origins plus explicit env) | `server.ts:66`, `:215`; other origins get 403 |
| Request body cap; idempotency keys bounded | `server.ts` `MAX_BODY`, Idempotency-Key ≤ 200 chars |
| Token is not passed to agent processes | No `MYAOS_*` token variable in the agent environment (`acp/client.ts:133`) |
| One writer per machine | `lock.ts` O_EXCL lock with stale-pid takeover |
| Evidence ladder: agents cannot write OBSERVED; VERIFIED needs a different actor | `repo.ts:67-74`, `checks.ts` |

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| S1 | **High** (once agents act autonomously) | **Agents can read the owner token.** Agents run as the owner's macOS user, so any agent can read `~/.myaos/runtime.json` and call the API with full owner rights. With those rights it can approve its own work, force stages, ship, or restore the store. Today agents are not told the API exists, so this is latent. It becomes live the moment the agent action interface (WP4) ships. | **Scheduled, blocking WP4.** K4 gives each session its own token, bound to identity, session, job and task, with role permissions. Owner-reserved actions (approval decisions, forced stage changes, ship, policy edits, restore) will additionally require an owner key that only the desktop holds, stored in the macOS Keychain with an app-bound access control list. The runtime stores only its hash. Until that ships, WP4 must not expose the HTTP API to agents. |
| S2 | Medium | **Self-asserted `actorId`.** `POST /v1/jobs/:id/stage`, plan accept, cancel and verify take the actor from the request body. With one owner token this only lets the owner act "as" an agent, but it makes audit actor fields untrustworthy. | **Scheduled with S1 (WP4).** Once session tokens exist, the actor comes from the token; the body field is accepted only from the owner key, and then recorded as `on_behalf_of`. |
| S3 | Medium | **Full environment is inherited by agents.** `acp/client.ts:133` spawns adapters with `{ ...process.env }`, so any secret present in the runtime's environment reaches every agent. | **Open, WP4.** Pass an allowlist of environment variables plus the per-adapter keys from `adapters.env`. |
| S4 | Medium (confidentiality) | **Community sync writes into the git working tree.** `community-sync.ts` and the thread-reply write-back put thread, inbox and stand-up text into `community/`, from where it gets committed. Client-confidential projects would leak this way, and this already happened on `main` before this review (threads 042 and 043). | **K9 rule added.** Projects marked `confidential` are excluded from sync (implementation in S1). The owner made the repository private on 2026-11-03. Client work moves to its own repository later. |
| S5 | Low | **`/health` and other `open` routes are unauthenticated.** They expose version and status only. | Accepted. Re-check that no open route returns store data whenever routes are added. |
| S6 | Low | The pre-migration backup used `copyFileSync` after a WAL checkpoint, which is consistent only because a single writer holds the lock. | **Fixed in WP0-T7.** Explicit backups use `VACUUM INTO`, and pre-migration copies are capped at 10. |
| S7 | Info | Adapter accounts are now read locally for K9 (`adapters.ts`). Only labels are stored and nothing leaves the machine. The Codex id_token is decoded, not verified, and is used only as a label. | By design |

## Required before WP4 ships (gate)

1. S1 and S2: session tokens, the owner key in the Keychain, and actors derived from the token.
2. S3: environment allowlist.
3. A test showing that an agent session token cannot call any owner-reserved route (403), and cannot act as another identity.
