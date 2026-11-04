# ACP control-plane reality check — 2026-10-26

Machine: macOS 26.3, arm64 (Apple Silicon), node v24.15.0 (nvm), npm 11.12.1.
Legend: **VERIFIED** = read from this machine or published source today; **INFERRED** = reasoned, unconfirmed.

## (a) Installed tools

| Tool | Status | Version | Notes |
|---|---|---|---|
| node | VERIFIED | v24.15.0 (nvm) | also pnpm at `/opt/homebrew/bin/pnpm` |
| npm | VERIFIED | 11.12.1 | `~/.npm` cache is root-owned → `npm view/pack` fails EPERM unless `npm_config_cache` is redirected (had to do this) |
| claude | VERIFIED | 2.1.310, `~/.local/bin/claude` | signed in via OAuth (`oauthAccount` in `~/.claude.json`, no `primaryApiKey`) |
| gemini | VERIFIED | 0.63.0, global npm | `~/.gemini/oauth_creds.json` present → signed in (Google OAuth) |
| codex | VERIFIED absent | — | `~/.codex/auth.json` + `config.toml` exist (previously used), but no binary on PATH or in any nvm bin |
| claude-agent-acp | VERIFIED absent | registry 0.95.0 | |
| codex-acp | VERIFIED absent | registry 1.11.0 | requires `codex` on PATH → currently unusable here |
| global npm | VERIFIED | @google/gemini-cli 0.63.0, @google/jules, corepack, npm, vercel | no ACP adapters installed |

Registry: `@agentclientprotocol/sdk` **2.0.2**; `@agentclientprotocol/claude-agent-acp` **0.95.0** (repo `agentclientprotocol/claude-agent-acp`); `codex-acp` **1.11.0** (repo `baldaworks/codex-acp`, third-party); `@zed-industries/claude-code-acp` 0.16.2 (legacy); `@google/gemini-cli` 0.65.0.

## (b) ACP client capabilities (v1) — exact names

```json
{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":1,
 "clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},
 "terminal":true,"auth":{"terminal":false},"session":{},"elicitation":null}}}
```

- `fs.readTextFile` / `fs.writeTextFile` are booleans under `fs`; `terminal` is a **boolean**, not an object.
- Client caps are "SHOULD specify" → **optional**; agents **MUST NOT** call a method whose capability is absent/false. Nothing is mandatory.
- Methods: `fs/read_text_file {sessionId,path,line?,limit?}` → `{content}`; `fs/write_text_file {sessionId,path,content}` → `{}` (client **MUST** create missing file); `terminal/create {sessionId,command,args?,env?:[{name,value}],cwd?(absolute),outputByteLimit?}` → `{terminalId}`, then `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release` (agent **MUST** release).
- `session/update` kinds (v1 schema): `user_message_chunk`, `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, `available_commands_update`, `current_mode_update`, `config_option_update`, `session_info_update`, `usage_update`, `notice`, `compaction_update`, `compaction_summary_chunk`.
- `session/request_permission` params `{sessionId,toolCall,options:[{optionId,name,kind}]}` (kinds `allow_once|allow_always|reject_once|reject_always`) → `{outcome:{outcome:"selected",optionId}}` or `{outcome:{outcome:"cancelled"}}`.
- `session/cancel {sessionId}` is a notification: client SHOULD mark unfinished tool calls cancelled and **MUST** answer pending permission requests with `cancelled`; agent SHOULD stop LLM+tools ASAP and **MUST** answer the pending `session/prompt` with `stopReason:"cancelled"`. Per-request cancellation also exists (`$/cancel_request`, error `-32800`).
- **ACP v2 is Draft**; SDK 2.0.2 ships v1+v2. Pin the SDK and negotiate explicitly.

Sources: [file-system](https://agentclientprotocol.com/protocol/v1/file-system), [terminals](https://agentclientprotocol.com/protocol/v1/terminals), [tool-calls](https://agentclientprotocol.com/protocol/v1/tool-calls), [prompt-turn](https://agentclientprotocol.com/protocol/v1/prompt-turn), [cancellation](https://agentclientprotocol.com/protocol/v1/cancellation), [v2 draft](https://agentclientprotocol.com/announcements/acp-v2-draft).

## (c) Per-adapter support matrix

| | claude-agent-acp 0.95.0 | codex-acp 1.11.0 | gemini 0.63.0 |
|---|---|---|---|
| fs via client | **Yes, wired** (`methods.client.fs.readTextFile/writeTextFile` present) — but edits are primarily reported as tool_call diffs; how often the fs path carries real writes is **INFERRED-uncertain** (medium) | **No** evidence: zero `fs/read_text_file` / `terminal/create` in its docs; it runs `codex --sandbox=… app-server` and Codex does I/O itself (medium-high) | **Yes, real + gated**: `AcpFileSystemService` uses client fs only when capability advertised, path is inside workspace root and not `~/.gemini`; otherwise local fallback (high, source-read) |
| terminal via client | **No** — zero `terminal/*` calls; only display `_meta.terminal_info` / `terminal_output` keys (high) | **No** — commands run inside Codex sandbox (medium-high) | **No** — `terminal/*` appears only in the SDK method-constant map (high) |
| permission | ACP `session/request_permission` (+ `$/cancel_request` race, AIR permission extension) | ACP `session/request_permission` for approval/elicitation forms; sandbox/`approvalPolicy` stay Codex-native (`--sandbox`, `--mcp-approval-policy`) | ACP `session/request_permission`; ACP `optionId` mapped back to Gemini `ToolConfirmationOutcome` (high) |
| auth | Claude Agent SDK → subscription OAuth or `ANTHROPIC_API_KEY`; terminal/URL-elicitation auth methods | terminal auth delegating to `codex login`; bridge never sees credentials | existing `~/.gemini` OAuth or `GEMINI_API_KEY` |
| cancel | `session/cancel`, abort-aware permission race, `stopReason:"cancelled"` | `session/cancel` → app-server interrupt → `interrupted` → `cancelled` | SDK-level `session/cancel`; `cancelled` **INFERRED** |
| protocol | v1 **and** v2 (`CLAUDE_AGENT_ACP_PROTOCOL=auto|v1|v2`) | v1 | v1 (`PROTOCOL_VERSION = 1`) |

Practical consequence: **the plan's core assumption is false for all three adapters today.** None routes shell commands through `terminal/*`, so command evidence will be "Claimed" unless we change approach. Gemini is the only one with capability-gated runtime-owned file writes.

Correction: `gemini --experimental-acp` is **deprecated** in 0.63.0; use `gemini --acp`.

## (d) Tauri v2 sidecar pitfalls

1. **Node is not shipped** by Tauri (system WebView + Rust). Bundle node as `externalBin` (per-target-triple filename, e.g. `runtime-aarch64-apple-darwin`) or a SEA/pkg binary — [Node.js as a sidecar](https://v2.tauri.app/learn/sidecar-nodejs/), [embedding external binaries](https://v2.tauri.app/develop/sidecar/). The user's nvm node is a dev-only assumption.
2. **PATH**: a Finder-launched app gets a minimal PATH. Here `claude` is in `~/.local/bin` and `gemini` under nvm — both would be invisible. Resolve absolute paths at startup and probe, don't rely on PATH.
3. **Code signing/notarization**: every nested Mach-O must be signed inside-out with hardened runtime; a missing nested signature fails notarization/Gatekeeper. Node under hardened runtime needs `allow-jit`/`allow-unsigned-executable-memory`. `--deep` is not a fix. Mac App Store sandbox is a non-starter (cannot exec user CLIs or read `~/.claude`) → Developer ID + notarization.
4. **Lifecycle**: sidecars are not auto-killed; Node then spawns agent children, so grandchildren leak. Handle `RunEvent::ExitRequested`/`Exit`, kill the process group, and use the [single-instance plugin](https://v2.tauri.app/plugin/single-instance/).
5. **Port/token races**: bind `:0` and report the real port instead of scanning; write `~/.myaos/runtime.json` atomically (tmp+rename), mode 0600, with pid + start time to detect stale files; retry on stale/absent; token never in argv (visible via `ps`); bind 127.0.0.1 only, validate token **and** Host/Origin (DNS-rebinding).

## (e) Phase 0.6 spike

Build a harness that logs **every inbound JSON-RPC request** (method, params, timestamps, negotiated `protocolVersion`/`agentInfo`) for 3 agents × 5 scenarios: (1) create file, (2) edit existing file, (3) run a command that fails (nonzero exit), (4) trigger a permission, (5) cancel mid-turn.

Record per scenario: did the write arrive as `fs/write_text_file` (content + our own before/after hash + diff)? did a command arrive as `terminal/create` with `wait_for_exit` exit code + signal? permission `options[].kind`; cancel → final `stopReason`; orphans after exit.

Pass: write arrives via `fs/write_text_file` and we produce the diff; command arrives via `terminal/create` and we capture a real exit code; permission arrives via `session/request_permission` with ≥2 options; cancel yields `cancelled` and no lingering children.
Expected: gemini 3/5, claude 2/5, codex 0–1/5 (and codex blocked until `codex` is installed).
Fail-fast: crash on `initialize` with caps present, or adapter ignoring unknown `_meta`.

**Fallback evidence model (recommended now, not later):** two tiers — **Observed** (runtime performed it: fs write / terminal exec with exit code) vs **Attested** (agent-reported `tool_call`/`tool_call_update` with `rawInput`/`rawOutput`/diff content). Detect silently unreported changes by snapshotting the workspace before/after each turn (stat+hash) and running each session in a per-session git worktree, so any mutation is attributable via `git diff` regardless of which path it took. Degrade the badge per session from probed capabilities; never assume runtime-owned I/O. Treat "force everything through runtime" as achievable for **file writes on Gemini/Claude only**, and for commands only via adapter-specific hooks (e.g. Claude Code pre-tool hooks denying Bash) — INFERRED, unverified, worth one spike.
