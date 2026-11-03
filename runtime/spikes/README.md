# ACP spike harness — Phase 0.6

A throwaway probe that answers one question with evidence instead of assumption:

> When MyaOS runs an agent over ACP, does file I/O and command execution actually
> come back through the **client** (`fs/*`, `terminal/*`), or does the adapter do
> it itself and only *tell* us about it?

This directory is **spike-only**. It is not part of the `@myaos/runtime` build, it
must not be imported by `runtime/src/**`, and its dependencies are installed here
(`runtime/spikes/node_modules`), not in `runtime/package.json`.

The results of the 2026-10-26 run are written up in
[`../../community/proposals/ACP_SPIKE_FINDINGS.md`](../../community/proposals/ACP_SPIKE_FINDINGS.md).

## Safety rules the harness enforces

- Every session runs in a fresh scratch directory under `/tmp/myaos-acp-spike/`.
  The workspace is `.../workspace`; the permission scenario targets its sibling
  `.../outside`.
- The client advertises `fs.readTextFile`, `fs.writeTextFile` and `terminal`, and
  **enforces them**: file writes outside the scenario workspace are refused and
  logged as blocked; reads outside the spike root are refused. Nothing outside
  `/tmp/myaos-acp-spike` is written by the client.
- Terminal commands run as real child processes in the scenario workspace. They
  are only the fixed scenario commands (below); the harness never forwards an
  arbitrary command from an adapter without logging it.
- The JSONL transcript records method names, parameter *shapes*, hashes and short
  previews. File contents are stored as `sha256 + bytes + lines + 160-char
  preview`, and anything that looks like a credential (keys named `token`,
  `secret`, `apiKey`, `authorization`, …; `sk-…`/`ghp_…`/JWT/Bearer patterns) is
  redacted. Environment variables are never logged.
- The harness never signs in anywhere. It uses whatever local auth the adapter
  already has; if an adapter demands an interactive auth method it is recorded as
  blocked, not authenticated.
- Prompts are tiny and local; no network tasks are asked of the agents.
- The adapter is spawned in its own process group and the whole group is
  SIGTERM/SIGKILLed at the end; descendant PIDs are sampled during the run (via
  `pgrep -P`, recursively; `ps` is denied by the sandbox on this machine) and
  re-checked after shutdown to report orphans. `summary.json.processSampling`
  records whether enumeration actually worked, so a blind run says
  "unavailable" instead of claiming "no orphans".
- One adapter is capped at ~15 minutes (`--max-minutes`).

## Prerequisites

- Node ≥ 24 (tested on v24.15.0).
- `npm` with a writable cache. The machine's default npm cache is root-owned in
  this environment, so use a redirected cache:
  `npm_config_cache=/tmp/myaos-npm-cache npm install`.
- Adapters, per the runtime's registry (all optional — missing ones are recorded
  as blocked):
  - **Claude** — `claude-agent-acp` (installed as a spike dependency here) plus
    the `claude` CLI signed in (`claude --version`).
  - **Gemini** — `gemini` on `PATH` (spawned as `gemini --acp`), signed in.
  - **Codex** — `codex` on `PATH` **and** the third-party `codex-acp` bridge.
    Without `codex`, the adapter is recorded `blocked-by-missing-binary`.
  - **DeepSeek Harness** — only if an ACP entry point exists. `command -v dsh`
    is checked; otherwise the adapter records `no-acp-entry-point-found` with
    the paths it inspected.

Install the spike dependency once:

```bash
cd runtime/spikes
npm_config_cache=/tmp/myaos-npm-cache npm install
```

## Run

```bash
cd runtime/spikes

# Environment facts and adapter availability only (fast, starts nothing)
node run-spike.js --probe

# Harness self-test: a scripted fake ACP agent that exercises every client method.
# Never part of the findings matrix.
node run-spike.js --adapter fake

# One adapter, all six scenarios
node run-spike.js --adapter claude
node run-spike.js --adapter gemini

# Adapter availability pass for the ones that cannot run here
node run-spike.js --adapter codex
node run-spike.js --adapter dsh

# Everything
node run-spike.js --adapter all

# A subset of scenarios (ids or 1-based numbers)
node run-spike.js --adapter claude --scenarios create-file,cancel-mid-turn
```

`--clean` removes `/tmp/myaos-acp-spike` (scratch only) before running.
`--prompt-timeout-ms` overrides the per-turn timeout (default 180 s).

## The fixed scenario set

One session per adapter; each scenario is one `session/prompt` turn:
`workspace/edit.txt` is seeded with `line one\n` before the session starts.

| # | id | Prompt (tiny) | What the harness looks for |
|---|---|---|---|
| 1 | `create-file` | create `created.txt` with one line | `fs/write_text_file` call (Observed write) vs only a `tool_call` (Attested) |
| 2 | `edit-file` | append a line to `edit.txt` | `fs/read_text_file` + `fs/write_text_file` vs tool-call diff only |
| 3 | `command-exit-0` | run `echo ok` | `terminal/create` + real exit 0 vs agent-reported output |
| 4 | `command-exit-nonzero` | run `sh -c 'exit 3'` | observed exit code 3 vs agent's claim |
| 5 | `outside-workspace-write` | write `../outside/outside.txt` | `session/request_permission` options; harness **rejects**; whether the file appears |
| 6 | `cancel-mid-turn` | run `sleep 20`, cancel after 5 s | final `stopReason`; surviving child processes |

The harness also snapshots `workspace/` and `outside/` (path + size + sha256)
before and after every turn, so a mutation is detected even when the adapter
never used the client — that is exactly the evidence tier distinction the runtime
needs.

## What is written

Each run gets `runtime/spikes/runs/<stamp>-<adapter>/`:

| File | Contents |
|---|---|
| `messages.jsonl` | every inbound/outbound JSON-RPC message (sanitised) with timestamp and sequence |
| `events.jsonl` | harness-side facts: client method calls, permission decisions, terminal lifecycle, process samples, adapter stderr |
| `run.json` | spawn command, environment facts, workspace paths |
| `scenario-<id>.json` | per-scenario record: prompt, result/stopReason, capability use, tool calls, terminal results (observed exit codes), before/after snapshots + mutation diff, cancel timing, descendant PIDs |
| `summary.json` | adapter-level summary: init result, session, aggregate capability use, shutdown/orphans, verdict |
| `runs/matrix.json` | last command's aggregate (environment + adapter summaries) |
| `runs/probe-<stamp>.json` | output of `--probe` |

Scratch workspaces under `/tmp/myaos-acp-spike/<stamp>-<adapter>/` are left for
inspection; the summary prints the path. `node_modules/` and `runs/` are
gitignored.

## Client capabilities advertised

Exactly what the runtime intends to advertise (see
[`DESKTOP_V2_DECISIONS.md`](../../community/proposals/DESKTOP_V2_DECISIONS.md) D5):

```json
{
  "protocolVersion": 1,
  "clientCapabilities": {
    "fs": { "readTextFile": true, "writeTextFile": true },
    "terminal": true
  }
}
```

Client methods implemented: `fs/read_text_file`, `fs/write_text_file`,
`terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`,
`terminal/release`, and `session/request_permission` (recording the offered
options, answering allow-once for workspace actions and reject for
outside-workspace actions). Unknown methods are answered with JSON-RPC
`-32601` and logged, so an adapter asking for a capability we did not advertise
shows up in the transcript instead of hanging.

## Reading a run

- `capabilityUse.fsWrite > 0` → the runtime's own write path carried the edit ⇒
  **Observed** file evidence is possible for that adapter.
- `terminalCreate > 0` and `terminalResults[].exitCode` present → the runtime ran
  the command and owns the exit code ⇒ **Observed** command evidence is possible.
- A workspace/outside mutation with zero client calls → the adapter did the I/O
  itself; only the tool-call record is available ⇒ **Attested/Claimed**.
- `permissionRequests > 0` with `options[].kind` recorded → the adapter uses ACP
  permissions; the harness answers according to the scenario policy.
- `cancel.stopReason === "cancelled"` → ACP cancel is honoured; otherwise note
  the actual stop reason and the elapsed time.
- `orphans.survivors` lists PIDs still alive after the adapter process group was
  killed (sampled descendants via `pgrep`; PID reuse in a 1.5 s window is
  unlikely but possible). Check `processSampling.method` first — if it is
  `unavailable`, orphan detection did not run.

## Self-test

`--adapter fake` runs `test/fake-agent.js`, a deterministic ACP agent that calls
every implemented client method, rejects the outside workspace, and honours
`session/cancel`. Its only purpose is to prove the harness observes what it
claims to observe before trusting it on a real adapter. A clean self-test shows:
`fs.write=2`, `fs.read=1`, `terminal=3` with exit codes 0 and 3, one permission
request rejected, `stopReason=cancelled`, and zero orphans.
