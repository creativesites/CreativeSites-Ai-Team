# ACP spike findings — Phase 0.6 (2026-10-26)

> Deliverable for Phase 0.6 of [DESKTOP_V2_BUILD_PLAN.md](DESKTOP_V2_BUILD_PLAN.md).
> Works with [DESKTOP_V2_REVIEW.md](DESKTOP_V2_REVIEW.md) §2.3 and
> [DESKTOP_V2_DECISIONS.md](DESKTOP_V2_DECISIONS.md) D5/D9.
>
> Machine: macOS 26.3 (25D5087f), arm64, Node v24.15.0, npm 11.12.1.
> Harness: [`../../runtime/spikes/`](../../runtime/spikes/README.md).
> Raw evidence: `runtime/spikes/runs/` (gitignored, left on disk for review).
> No adapter was signed in during this spike. No destructive command was run.

## 0. Bottom line

1. **The probe harness is built and validated.** A scripted fake ACP agent proves
   the harness observes client file writes, client file reads, client-run terminal
   commands with real exit codes, permission requests/answers, `session/cancel →
   stopReason: "cancelled"`, workspace mutations and orphan processes.
2. **No real adapter completed a single prompt turn today.** Not because of ACP,
   but because of credentials/binaries on this machine:
   - `claude-agent-acp` 0.95.0: ACP v1 `initialize` **and** `session/new` succeed;
     every prompt is refused with JSON-RPC `-32000 "Authentication required"` and
     an `agent_message_chunk` reporting `401 OAuth access token has expired`.
   - `gemini --acp` 0.63.0: never answers `initialize`; on shutdown stderr says
     `Error authenticating: Error: When using Gemini API, you must specify the
     GEMINI_API_KEY environment variable.`
   - `codex` is not installed and `codex-acp` is not installed → skipped.
   - DeepSeek Harness has **no ACP agent entry point** found → skipped.
3. **Therefore the per-adapter probe matrix for fs/terminal/permission/cancel is
   empty (Unknown), not "No".** The honest result is "blocked-by-auth" /
   "blocked-by-missing-binary", not "adapter does not support it".
4. **The build plan's assumption ("the runtime advertises fs/terminal, therefore
   writes and commands are Observed") is not supported by anything observed
   today.** The review's capability-driven evidence model is the correct default:
   runtime-owned worktree snapshots and runtime-run checks are the only Observed
   sources we can guarantee; agent tool calls are Attested/Claimed until re-run.
5. **Hard lesson the runtime must encode: `session/new` success ≠ authenticated.**
   Claude created a full session (id, permission modes, config options) while
   unable to make a single model call. A capability probe that stops at
   `initialize`/`session/new` will show a dead adapter as live.

Source-read of the shipped adapter code (section 6) adds two implementation
facts that do not depend on credentials: `claude-agent-acp` **cannot** route
shell commands through the client (`terminal/*` absent; commands can only be
tool calls ⇒ Attested), and it **does** wire client file read/write and ACP
permissions; Gemini's client-backed file system is installed only after auth and
only when the client advertises `fs`.

## 1. What ran

| Run | Adapter | Result | Artifact |
|---|---|---|---|
| instrument self-test | fake ACP agent | **6/6 scenarios observed** (fs read/write, terminal exit 0/3, permission reject, cancel) | `runtime/spikes/runs/2026-10-26T09-01-38-639Z-fake/` |
| probe 1 | `claude-agent-acp` 0.95.0 | handshake + session OK; 6/6 prompts auth-refused | `runtime/spikes/runs/2026-10-26T09-02-02-819Z-claude/` |
| probe 2 | `gemini --acp` 0.63.0 | no `initialize` response; auth error on stderr | `runtime/spikes/runs/2026-10-26T09-02-02-819Z-gemini/` |
| probe 3 | `codex-acp` | never spawned (missing binaries) | `runtime/spikes/runs/2026-10-26T08-59-49-404Z-codex/` |
| discovery | DeepSeek Harness | no ACP agent entry point found | `runtime/spikes/runs/2026-10-26T08-59-52-761Z-dsh/` |
| environment | — | versions/availability probe | `runtime/spikes/runs/probe-2026-10-26T09-02-10-260Z.json` |

Each run directory contains `messages.jsonl` (every JSON-RPC message),
`events.jsonl` (harness facts), `run.json`, `scenario-<id>.json`, `summary.json`.
The harness advertised exactly the capabilities the runtime intends to
(D5): `fs.readTextFile`, `fs.writeTextFile`, `terminal` over ACP v1.

## 2. Environment verified (not assumed)

| Fact | Observed value |
|---|---|
| Node / npm | `v24.15.0` / `11.12.1` (nvm) |
| `claude` | `2.1.310 (Claude Code)`, `/Users/winstonzulu/.local/bin/claude` |
| local Claude auth | `oauthAccount` present, but `bridgeOauthDeadExpiresAt = 2026-09-12T00:00:12Z` (expired before this run) |
| `gemini` | `0.63.0`, nvm global; `--help` lists `--acp` and `--experimental-acp` ("deprecated, use --acp instead") |
| local Gemini auth | `~/.gemini/oauth_creds.json` present, `expiry_date = 2026-09-12T18:12:07Z` (expired; `refresh_token` present) |
| `codex` | **absent** from PATH |
| `dsh` | **absent** from PATH |
| `claude-agent-acp` | absent globally; installed spike-only at `runtime/spikes/node_modules/.bin/claude-agent-acp` (0.95.0) |
| `codex-acp` | absent |
| npm cache | working install required `npm_config_cache=/tmp/myaos-npm-cache` (default cache root-owned) |
| process enumeration | `ps` denied by sandbox ("Operation not permitted"); `pgrep -P` and `lsof` work — harness records which method was used |

## 3. Per-adapter matrix (probe evidence)

"What was measured with the adapter running", not what its source suggests.
`—` = adapter never reached that step.

| Question | Claude `claude-agent-acp` 0.95.0 | Gemini `gemini --acp` 0.63.0 | Codex `codex-acp` | DeepSeek Harness |
|---|---|---|---|---|
| Spawn command | `node_modules/.bin/claude-agent-acp` | `$(which gemini) --acp` | none | none |
| Spawned? | yes (pid observed) | yes (pid observed) | **no — `codex` not on PATH** | **no — no ACP entry point** |
| ACP `initialize` | **yes**, v1, 1,132 ms | **no response** (15 s and 60 s runs) | — | — |
| `agentInfo` | `@agentclientprotocol/claude-agent-acp` 0.95.0 ("Claude Agent") | — | — | — |
| `authMethods` | `[]` (empty) | — | — | — |
| `session/new` | **yes**, 5,256 ms; `modes` default/acceptEdits/plan/auto/bypassPermissions; config options mode/model/effort/agent | — | — | — |
| Prompt turns completed | **0 / 6** | **0** (never initialized) | 0 | 0 |
| fs read via client | not exercised — 0 calls (turn never ran) | not exercised | — | — |
| fs write via client | not exercised — 0 calls | not exercised | — | — |
| terminal via client | not exercised — 0 calls | not exercised | — | — |
| Commands observed | none | none | — | — |
| Exit codes observed | none | none | — | — |
| Permission flow / options | none observed | none observed | — | — |
| Cancel behavior | **not exercised**: prompt already failed before the 5,003 ms cancel; no `stopReason` | — | — | — |
| Auth outcome | **blocked**: prompt → JSON-RPC `-32000 "Authentication required"`; chunk: `401 OAuth access token has expired` | **blocked**: no initialize; stderr demands `GEMINI_API_KEY` | **blocked**: missing binary | n/a |
| Protocol version | **1** (negotiated) | unknown (no hello) | — | — |
| Orphan processes | **0 survivors** of 7 tracked descendants (incl. the adapter's bundled `@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`); group SIGTERM → exit 0 | **0 survivors** of 1 tracked pid; SIGTERM → exit 0 | n/a | n/a |
| Adapter status | `blocked-by-auth` after handshake | `blocked-by-auth` at handshake | `blocked-by-missing-binary` | `no-acp-entry-point-found` |

### 3.1 Claude (`claude-agent-acp` 0.95.0)

Observed, in order:

1. `initialize` → v1, 1,132 ms. Capabilities reported: `loadSession: true`,
   `promptCapabilities {image, embeddedContext}`, `mcpCapabilities {http, sse}`,
   `auth {logout}`, rich `sessionCapabilities` (additionalDirectories, close,
   delete, fork, list, resume, systemPrompt), `_meta.claudeCode.promptQueueing`,
   `_meta.authStatus: {}`. `authMethods: []`.
2. `session/new` → session id, 5 permission modes and 4 config options in 5,256 ms.
3. Two `available_commands_update` notifications (the full Claude skill/command
   catalogue) arrived before any prompt — the adapter pushes these without
   authentication.
4. Every `session/prompt` returned JSON-RPC error `-32000 "Authentication
   required"` after 2.7–4.1 s, preceded by an `agent_message_chunk`:
   `Failed to authenticate. API Error: 401 OAuth access token has expired.
   Re-authenticate to continue.`
5. Cancel: the cancel notification was sent at 5,003 ms of the cancel scenario,
   but the turn had already failed, so no `stopReason` could be observed.
6. Shutdown: SIGTERM to the process group; adapter exit code 0; no surviving
   descendants.

The adapter spawns its own bundled `claude` binary as a grandchild — the runtime
must kill the whole process group, not just the adapter pid.

### 3.2 Gemini (`gemini --acp` 0.63.0)

- Spawns, but emits no JSON-RPC response to `initialize` (timeout at 15 s; the
  first run also timed out at 60 s).
- At shutdown, stderr finally shows the cause:
  `Error authenticating: Error: When using Gemini API, you must specify the
  GEMINI_API_KEY environment variable.` / `Update your environment and try
  again (no reload needed if using .env)!`
- Exit code 0 on SIGTERM; no surviving descendants.
- This contradicts "gemini is signed in via OAuth" as an adapter-readiness fact:
  the local OAuth file exists but is expired (2026-09-12), and the ACP path
  reported an API-key requirement. We did not sign in or set a key.

### 3.3 Codex (`codex-acp`)

- `command -v codex` → nothing; `command -v codex-acp` → nothing.
- No spawn was attempted. Recorded exactly as `blocked-by-missing-binary`:
  `codex-acp` requires the `codex` binary, so installing the bridge alone would
  still not produce a session.
- The runtime must show Codex as "unavailable — install codex + codex-acp", never
  as a live adapter (D5, review risk table).

### 3.4 DeepSeek Harness

`command -v dsh` → nothing. The app bundle was inspected cheaply:

- Bundled CLI shim exists:
  `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`,
  which boots `dsh` profiles. Running its `--help` (via
  `ELECTRON_RUN_AS_NODE=1 … app.asar/dsh/…/cli.js --help`) lists
  `--profile`, `--patch`, `--dump-config`, and example profiles
  `web`, `headless`, `tui`, `rescue` — **no ACP mode**.
- User profiles: `~/.dsh/profiles` contains only `desktop`.
- The app bundle contains `@agentclientprotocol/sdk` and its config zod schema has
  an MCP-server type `"acp"` — i.e. DeepSeek Harness **uses ACP as a client**
  (it can drive ACP agents), not as a spawnable ACP agent server.
- Conclusion: **"no ACP entry point found"** for MyaOS to spawn as an adapter.
  Confidence high for the CLI observation; medium for the client-only
  interpretation (source-read, not executed).

## 4. Scenario results (all four adapters)

| # | Scenario | Claude | Gemini | Codex | DSH |
|---|---|---|---|---|---|
| 1 | `create-file` | prompt error `Authentication required` (4,075 ms) | not run (no session) | skipped | skipped |
| 2 | `edit-file` | prompt error (2,949 ms) | not run | skipped | skipped |
| 3 | `command-exit-0` | prompt error (2,688 ms) | not run | skipped | skipped |
| 4 | `command-exit-nonzero` | prompt error (2,738 ms) | not run | skipped | skipped |
| 5 | `outside-workspace-write` | prompt error (2,852 ms); no outside file created | not run | skipped | skipped |
| 6 | `cancel-mid-turn` | prompt error; cancel sent at 5,003 ms; `stopReason` unknown | not run | skipped | skipped |

No scenario mutated either the workspace or the outside directory; no client
method (`fs/*`, `terminal/*`, `session/request_permission`) was called by a real
adapter. **This is an auth-blocked result, not a capability result.**

Instrument check (same six scenarios, fake agent): `fsWrite=2`, `fsRead=1`,
`terminal=3` with observed exit codes **0** and **3**, one permission request
with offer `[allow_once, reject_once]` answered **reject**, `stopReason=cancelled`,
workspace mutations `created.txt` (+1) and `edit.txt` (modified), outside
directory untouched, zero orphans.

## 5. Auth evidence (exact strings, no secrets logged)

Claude:

- JSON-RPC response: `{"code":-32000,"message":"Authentication required"}`
- `session/update` → `agent_message_chunk`:
  `Failed to authenticate. API Error: 401 OAuth access token has expired. Re-authenticate to continue.`
- `.claude.json` metadata: `bridgeOauthDeadExpiresAt = 2026-09-12T00:00:12.793Z`
  (expired). No token contents were read or printed.

Gemini:

- stderr: `Error authenticating: Error: When using Gemini API, you must specify the GEMINI_API_KEY environment variable.`
- `~/.gemini/oauth_creds.json`: `expiry_date = 2026-09-12T18:12:07.108Z`
  (expired; `refresh_token` present). No token contents were read or printed.

No sign-in was attempted. The runtime's adapter health check must surface these
as "re-authenticate" states, not crash or pretend the adapter is live.

## 6. Implementation facts read from shipped code (no credentials needed)

These are source-read facts, kept separate from probe evidence.

**`claude-agent-acp` 0.95.0** (published `dist/`, 93 JS files; dependencies
`@agentclientprotocol/sdk` 2.0.1, `@anthropic-ai/claude-agent-sdk` 0.3.309):

| Fact | Evidence |
|---|---|
| Client fs methods are wired to the ACP connection | `dist/acp-agent.js`: `readTextFile(params) { return this.ctx.request(methods.client.fs.readTextFile, params) }`, same for `writeTextFile`; 10 references each |
| ACP permissions are wired | `requestPermission(params, signal) → methods.client.session.requestPermission` (14 references) |
| **No client terminal execution** | `terminal/create`, `createTerminal`, `terminalCreate` = **0** references in `dist/` |
| Terminal output is display-only | `dist/v2/terminal.js` maps `_meta.terminal_info` / `terminal_output` / `terminal_exit` into v2 `terminal_update` notifications |
| Protocol v1 and v2 supported | `dist/serve.js` parses `CLAUDE_AGENT_ACP_PROTOCOL` (`auto`/`v1`/`v2`); this run negotiated v1 |

**Gemini 0.63.0** (`@google/gemini-cli` bundle):

| Fact | Evidence |
|---|---|
| ACP client method names present (SDK constant table) | `CLIENT_METHODS = { fs_read_text_file: "fs/read_text_file", fs_write_text_file: "fs/write_text_file", session_request_permission: "session/request_permission", terminal_create: "terminal/create", terminal_kill: "terminal/kill", terminal_output: "terminal/output", terminal_release: "terminal/release", terminal_wait_for_exit: "terminal/wait_for_exit" }` |
| Client-backed file system exists and is gated | `AcpFileSystemService(connection, sessionId, capabilities, fallback, root)`; installed only `if (this.clientCapabilities?.fs)` and **after** an auth guard that throws `RequestError(-32000, "Authentication required.")` |
| Neither fs nor terminal calls observed at run time | adapter never answered `initialize`; this run proves nothing about call frequency |
| Terminal `terminal/*` entries are constants only | strings appear once each in the SDK method table; no call-site evidence found |

**DeepSeek Harness**: bundle contains `@agentclientprotocol/sdk`; config schema
supports MCP-server entries of `type: "acp"`; CLI boots `web`/`headless`/`tui`/
`rescue` profiles. No ACP server entry point observed.

## 7. Confidence levels

| Claim | Confidence | Basis |
|---|---|---|
| Harness correctly observes fs writes/reads, terminal exit codes, permissions, cancel, snapshots, orphans | **High** | fake-agent self-test, all six scenarios |
| Claude handshake is ACP v1 and `session/new` succeeds unauthenticated | **High** | observed twice |
| Claude prompts are blocked by expired OAuth on this machine | **High** | JSON-RPC `-32000` + 401 chunk + expiry metadata |
| Claude cannot route commands via client terminal | **High** | source-read of published dist (zero `terminal/*` calls) |
| Claude fs writes/permissions *may* arrive via client | **Medium** | source-read shows wiring; real write frequency unverified (matches prior research) |
| Gemini `--acp` requires `GEMINI_API_KEY` here (or a working OAuth refresh) | **High** | observed stderr, two runs |
| Gemini fs is capability-gated and workspace-scoped | **Medium** | source-read (`AcpFileSystemService` + capability guard); not exercised |
| Gemini terminal usage | **Unknown** | method constants exist; no call evidence; prior research says display-only |
| Codex unusable here | **High** | binaries absent |
| DSH has no ACP agent entry point | **High** (CLI/help), **Medium** on "client-only" interpretation | CLI `--help`, profiles dir, bundle scan |
| Permission flow / options per adapter | **Unknown** | not exercised; instrument validated only against fake agent |
| Cancel → `cancelled` per adapter | **Unknown** | not exercised; instrument validated only against fake agent |
| Orphan behavior per adapter | **Low–Medium** | 0 survivors observed for Claude/Gemini, but only during auth-failed sessions; no successful command runs existed to leak |

## 8. What the runtime can call Observed vs Attested today (definitive)

**This is the decision the ledger and the UI badges must encode now.**

### 8.1 Observations the runtime can create itself — trustworthy today

These do not depend on any adapter capability and were validated by the
instrument self-test (or observed on real adapters):

1. **Worktree state and mutations.** Snapshot before/after every turn
   (`git status`, `git diff`, file hashes). The harness detected `created.txt`
   and the edit to `edit.txt` from snapshots alone. Any file the agent changed is
   attributable this way even if it never called `fs/*` — this is the single
   highest-value Observed source (review §2.3).
2. **Commands the runtime runs itself** (checks, builds, tests, verifier re-runs):
   command, output, exit code, timestamp. The harness's terminal manager observed
   `echo ok → 0` and `sh -c 'exit 3' → 3` because *we* ran them; the same must be
   true for runtime checks.
3. **Process liveness / orphans.** PID alive/dead, descendant sampling (`pgrep`;
   `ps` unavailable here), kill results. Record the sampling method and never
   report "no orphans" when enumeration is unavailable.
4. **Protocol facts**: negotiated version, agent info/capabilities, session id,
   configured modes, auth errors. These are Observed, but none of them implies
   the agent is authenticated or capable.
5. **Permission requests and the answer given** — once an adapter actually asks.
   The harness records offered `optionId/name/kind` and answers; instrument-tested
   with the fake agent, not yet with a real adapter.

### 8.2 Evidence that must stay Attested / Claimed

- Every `tool_call`, `tool_call_update`, agent message, command the agent says it
  ran, and every diff the agent reports. Never upgrade because the adapter looks
  trustworthy.
- **All command evidence from Claude** — source-read shows no client-terminal
  path, so Claude commands can only be Attested until the runtime or a different
  agent re-runs the exact check in a clean worktree.
- **Claude file edits** — if the runtime sees `fs/write_text_file`, that write is
  Observed; if it only sees a tool-call diff, it is Attested. Do not infer one
  from the other.
- **Gemini file edits** — same rule: Observed only when `fs/write_text_file`
  actually arrives (source says it can, capability-gated); otherwise Attested.
- Anything from a session that failed authentication, or whose process died, is
  **Unknown**, not "empty success".

### 8.3 Runtime rules implied by this spike

1. **Do not assume Observed I/O from advertised capabilities.** Capability =
   permission to ask, not proof of use. Badge per session from what actually
   happened (`capabilityUse` in the harness summary is the model).
2. **Probe auth with a real microscopic prompt turn** (e.g. "reply OK"). A
   successful `initialize`/`session/new` is not health. Claude demonstrated a
   fully-formed session with dead credentials.
3. **Always snapshot the worktree before/after each turn** and store the diff as
   Observed. This is the fallback that keeps the product honest for every
   adapter, including future ones.
4. **Treat permission requests as blocking approvals** with persistence and
   timeout→deny (review §2.4). The client must answer `cancelled` to pending
   permissions on `session/cancel`.
5. **Kill the adapter's process group**, not just its pid: Claude spawns a
   bundled `claude` grandchild. Track sampled descendants and report survivors.
6. **Show adapter auth state explicitly** ("Claude: re-authenticate — OAuth token
   expired"; "Gemini: GEMINI_API_KEY required"; "Codex: not installed";
   "DeepSeek Harness: no ACP entry point"). Never show these as live/empty.
7. **Record the enumeration/sampling method** for process evidence; the sandbox
   here denies `ps`, so a runtime must not assume it.

### 8.4 Direct answers to the question this phase was created to settle

> Can the runtime produce Observed file-write and command evidence from ACP
> client capabilities for these adapters today?

- **Commands: no, for every adapter we could inspect.** Claude has no client
  terminal path (source-read); Gemini shows only SDK constants and never ran;
  Codex/DSH unavailable. Plan on command evidence being Attested until the
  runtime/verifier re-runs the command itself.
- **File writes: unproven today for all adapters, possible for Claude and Gemini
  by source-read** (both wire capability-gated client fs). Build the ledger so
  the badge is per-occurrence: Observed when `fs/write_text_file` is handled by
  the runtime, Attested when only a tool-call diff arrives.
- **Permission and cancel: unproven today for all adapters.** The runtime must
  implement them and re-run this harness with credentials before claiming
  support.

## 9. Unblocking the matrix (exact next steps)

1. **Claude**: refresh the CLI credentials (`claude` login) or run the probe with a
   dedicated `ANTHROPIC_API_KEY`, then `node run-spike.js --adapter claude`.
   Expect fs/permission data; expect commands to remain Attested (source-read).
   If auth cannot be arranged, the adapter stays "blocked-by-auth" in the product.
2. **Gemini**: set `GEMINI_API_KEY` for a test run (or fix OAuth refresh), then
   `node run-spike.js --adapter gemini`. Prior research predicts fs writes arrive
   via client when inside the workspace, no terminal calls.
3. **Codex**: install `codex` + `codex-acp`, sign in via `codex login`, rerun.
4. **DeepSeek Harness**: treat as "no ACP entry point" until a version/plugin
   exposes one. Its ACP-client capability is not an adapter path for MyaOS.
5. Re-run the harness on every adapter version bump; store `runs/` artifacts as
   evidence and update this matrix (do not edit old runs).

Expectation from the prior research memo (not observed here): Gemini ~3/5,
Claude ~2/5, Codex 0–1/5 even with credentials. Treat that as a hypothesis to
verify, not as a finding.

## 10. Reproduce

```bash
cd runtime/spikes
npm_config_cache=/tmp/myaos-npm-cache npm install   # spike-only deps
node run-spike.js --probe                            # environment facts
node run-spike.js --adapter fake                     # instrument self-test
node run-spike.js --adapter claude                   # ~40 s with expired auth
node run-spike.js --adapter gemini --init-timeout-ms 15000
node run-spike.js --adapter codex                    # blocked result, fast
node run-spike.js --adapter dsh                      # discovery result, fast
```

Artifacts are written to `runtime/spikes/runs/<stamp>-<adapter>/` and scratch
workspaces to `/tmp/myaos-acp-spike/<stamp>-<adapter>/`. Nothing outside those
directories, `runtime/spikes/`, and this document was modified. `node_modules/`,
`runs/` are gitignored; `runtime/package.json`, `runtime/src/**` and
`apps/desktop/**` were not touched; nothing was committed.
