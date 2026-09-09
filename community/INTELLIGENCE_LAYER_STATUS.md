# Intelligence Layer — Status (2026-09-09)

Scope note up front: the full 57-section spec Winston gave for this
(providers, router, context manager, event bus, dashboard, planner/verifier
integration, learning loop) is a multi-week build. This document reports
**Phase A only** (real provider foundation) — built, tested, verified — plus
two security fixes found during the mandatory reality audit. Everything past
Phase A is explicitly listed as NOT IMPLEMENTED below, not implied by silence.

## REAL AND WORKING

- **`.env` with `GEMINI_API_KEY` exists and authenticates.** Verified via
  direct REST calls to `generativelanguage.googleapis.com` (no SDK — none is
  installed in this repo; Node 25's native `fetch`/`process.loadEnvFile()`
  covers it with zero new dependencies).
- **`src/intelligence/geminiAdapter.js`** — real, tested module:
  - `listModels()` — returns 50 real models from the live API.
  - `generateContent(prompt, opts)` — real call, verified with actual output
    (`"adapter test passed"`), real provider-reported usage
    (`inputTokens`/`outputTokens`/`thoughtsTokens`/`totalTokens` — including
    Gemini's internal reasoning-token count, which is real and provider-specific,
    not invented), and real latency.
  - `classifyError()` — built from 3 real responses, not guessed:
    invalid model → `404`/`MODEL_UNAVAILABLE`; invalid key → `400` with
    `reason: API_KEY_INVALID` → `AUTH_FAILURE`; success → `200`.
- **Corrected a wrong assumption from earlier this session**: I'd assumed
  `gemini-3.6/3.7/3.8-flash`-style names in an earlier (fabricated) report
  were invented version numbers. They're real — confirmed present in the
  live model list, and `gemini-flash-latest` currently resolves to
  `gemini-3.8-flash` server-side. Flagging my own earlier error rather than
  leaving it uncorrected.
- **Two distinct Gemini execution paths, kept separate as required** —
  `model_registry`:
  - `model-gemini-api` — the REST path above. `availability = available`,
    verified 2026-09-09.
  - `model-gemini-antigravity-ide` — the separate Antigravity IDE runtime
    (a human-spawned session, not an in-process call). `availability =
    unavailable` — quota-based (Winston: weekly limit, resets 2026-09-10),
    not pay-per-token. No automated quota check exists; update manually.
- **Two real security issues found and fixed during the audit**:
  1. Root `.gitignore` had no `.env` exclusion at all — fixed
     (`.env`, `.env.*`, with `!.env.example` preserved). The key was
     untracked, never committed.
  2. `community/secrets/test_credentials.md` (real production WordPress
     test-account passwords, plaintext) was committed in local-only commits
     (`b6c3a68`, `0cd118e` — confirmed via `git log origin/main` that these
     never reached the remote). Untracked it (`git rm --cached`) and added
     `community/secrets/` to `.gitignore`. **Not yet resolved**: those two
     commits still contain the plaintext password in local git history.
     Since they were never pushed, a clean rewrite is possible without
     rewriting shared history — but that's a destructive git operation
     (rebase/history-edit) I won't do without your explicit go-ahead. Say
     the word and I'll do it before anyone pushes.

## PHASE B — real model registry queries + live health check (2026-09-09, later same session)

- **`ANTHROPIC_API_KEY` checked — does not exist anywhere** (`.env`, shell
  env). Claude remains Claude-Code-session-only; no second real API provider
  path exists. Not fabricating one.
- **`src/intelligence/modelRegistry.js`** — real, tested:
  - `getCandidates(requiredCapabilities)` — reads `model_registry` live,
    exact-matches against each row's `capabilities` JSON array, sorted
    cheapest-tier first. Verified it correctly *excludes* Haiku from a
    `[coding, reasoning]` query because Haiku's declared capability is
    literally `"simple-reasoning"`, not `"reasoning"` — exact matching, not
    fuzzy, confirmed by checking the negative case, not just the positive one.
  - `checkHealth(modelId)` — for `model-gemini-api`, makes a real
    `listModels()` call and writes the result back to the database. Verified
    live: 50 models visible, `availability` and `last_checked` updated in
    `data/myaos.db`, confirmed by querying the table after the call, not by
    trusting the function's return value alone.
  - For the two runtimes with no possible automated check (Antigravity IDE,
    any Claude tier), it returns `ok: null` with an explicit human-readable
    reason — not a guessed `true`/`false`. This was a deliberate design
    choice, tested by calling it against both and checking the output isn't
    silently coerced into a fake boolean.
- **This is still query/health-check infrastructure, not a router.** It
  tells you who *could* do something and whether a model is *currently*
  reachable — it does not select, dispatch, execute, retry, or escalate
  anything on its own. That's Phase D, still not implemented.

## Git history remediation (per Winston's go-ahead)

- Confirmed `0cd118e` (added `community/secrets/test_credentials.md`,
  plaintext production test-account password) was the only commit anywhere
  in history touching that file, and was HEAD with nothing after it —
  the simplest possible case.
- Checked the adjacent commit (`b6c3a68`) for the same secret leaking into
  its own file (`.../nonce_fix_verification_report.md`) — found only a
  disposable `mailinator.com` test address, not a real credential; left that
  commit untouched rather than over-scoping the rewrite.
- Dropped `0cd118e` via `git reset --hard b6c3a68`, then fully purged it
  (`git reflog expire --all` + `git gc --prune=now --aggressive`) rather
  than just moving the branch pointer. Hit a real snag mid-process: my own
  `git stash` (used to safely park uncommitted Phase A/B work during the
  rewrite) kept the commit reachable via `refs/stash`, since a stash records
  current HEAD as its parent at creation time — had to restore the stash,
  drop it, and re-run the purge. Verified the object is genuinely gone
  (`git cat-file -e <sha>` exits non-zero), not just unreferenced — the
  weaker check (`git log --all`) still showed it after the first pass, which
  is exactly why the object-existence check matters more than the log check.
- `origin/main` was never at any point ahead of or containing this commit —
  confirmed again after the rewrite. Nothing to force-push; the remote was
  never touched.

## PHASE C — IntelligenceService (2026-09-09, later same session)

**`src/intelligence/intelligenceService.js`** — the single entry point other
code should call instead of talking to providers or `modelRegistry`
directly. Two functions:

- `route(task)` — picks the cheapest candidate via `modelRegistry
  .getCandidates()` and writes a real, explainable decision to
  `model_selection_history` (candidates considered, reason, timestamp) —
  Section 31's "why this model" requirement, persisted, not just returned.
- `execute(task)` — routes, then does exactly one of three honest things:
  1. **Real API call** if the selected candidate is `model-gemini-api` — no
     simulation, an actual `generateContent()` request.
  2. **Explicit hand-back** if the selected candidate is any Claude tier —
     returns `executionPath: 'HAND_TO_CURRENT_SESSION'` and a note saying so,
     because there is no API path to dispatch to. This was the one place in
     the whole file where it would have been easy to fake a provider-agnostic
     result; didn't.
  3. **`NONE`** if no registered model satisfies the required capabilities.

**Tested all three paths for real**, with a genuine test task row (deleted
after, along with its `model_selection_history` rows — not left as clutter):
- `requiredCapabilities: ['large-context']` → routed to and **actually
  executed** via Gemini, real output (`"phase c gemini execution verified"`),
  real usage (116 total tokens), `success = 1` persisted in
  `model_selection_history`.
- `requiredCapabilities: ['architecture']` → routed to `model-claude-sonnet-5`,
  **did not fake execution** — returned the explicit hand-back note, and
  `success`/`tokens_used` correctly left `NULL` in the persisted row rather
  than recording a fabricated outcome for something that didn't run.
- `requiredCapabilities: ['quantum-annealing']` → `selected: null`,
  `executionPath: 'NONE'`, no crash, no invented candidate.

**What this is not**: a full router (Section 10/11) — no cost/latency
optimization beyond tier ordering, no escalation-on-failure logic (the
`escalation_chains` data exists; nothing reads it yet), no retry
classification wired in (though `geminiAdapter.classifyError()` is ready to
be used by whatever calls this next), no streaming, no context management.
Single-candidate-selection-and-execute only.

## PHASE D — real escalation execution (2026-09-09, later same session)

**`src/intelligence/escalationRouter.js`** — walks `escalation_chains` step
by step for a task type, attempting real execution where one exists.

Added a new chain (`large_context`) that actually includes Gemini as step 1
— every escalation chain populated before this only contained Claude tiers,
which meant escalation across them was structurally untestable (no API to
fail against). This one is realistic: try the cheap large-context model
first, fall back to Claude if it fails.

**Two real bugs caught by testing the failure path, not just the happy
path** — worth naming because both would have made "Phase D complete" a
repeat of exactly the earlier fabrication problem if left unfound:
1. `attempt_log` has `UNIQUE(task_id, attempt_number)`. My first version
   reset `attemptNumber` to 0 on every call instead of continuing from the
   task's actual logged history — would have collided on any task escalated
   more than once across separate invocations. Fixed: query
   `MAX(attempt_number)` for the task first.
2. **More serious**: the Gemini branch never actually read which concrete
   model the registry row pointed at — it always called the adapter's
   hardcoded default, ignoring `model_registry.model_id` entirely. My first
   attempt to test failure (pointing the registry at an invalid model)
   silently succeeded anyway, because the broken config was never consulted.
   Fixed: look up and pass the real `model_id` into `generateContent()`.
   Caught this specifically because I insisted on actually forcing and
   observing a failure rather than trusting that the failure path "should"
   work from reading the code.

**Verified for real, after both fixes**:
- Success case: Gemini succeeds at step 1, `escalated: false`, one
  `attempt_log` row, no `escalation_decisions` row.
- Forced failure (registry temporarily pointed at a nonexistent model,
  restored after): Gemini failed with the exact real API error text
  captured verbatim in `attempt_log.error_message`, correctly classified as
  `MODEL_UNAVAILABLE`, a real `escalation_decisions` row recording the
  `model-gemini-api → model-claude-sonnet-5` transition and the true
  failure reason, and the chain correctly stopped at the Claude step with an
  honest hand-back rather than a third fake attempt.
- Attempt numbering verified correct **across two separate process
  invocations** of the same task (1, then 2 — not reset, not colliding).

**Still not implemented**: cost-aware selection (Section 24 — no verified
per-token pricing exists to optimize against, noted in Phase A), retry
backoff/classification-specific strategy beyond "escalate to next chain
step" (Section 29's fuller taxonomy — AUTH_FAILURE vs RATE_LIMIT should
arguably behave differently; today both just escalate the same way), and
no learning loop reading `model_performance` to influence future routing —
that table exists and nothing writes to it yet.

## CONFIGURED BUT UNVERIFIED

- Rate limits, quota ceiling, and any real per-token pricing for the Gemini
  API path — the API didn't expose these in the calls made; would need
  either a documented published rate from Google or triggering an actual
  429 to observe it. Not fabricating a number for either.
- Vision/audio/computer-use capabilities listed in `model_registry` for the
  Gemini rows are carried over from the model's advertised
  `supportedGenerationMethods`/description, not independently exercised
  (no image/audio/computer-use call was actually made).

## NOT IMPLEMENTED

Everything past the provider adapter. Explicitly, not implied:

- No provider-agnostic `IntelligenceService`/adapter interface — only the
  one real Gemini adapter exists. No `AnthropicAdapter` (Claude execution
  today is the Claude Code session itself, not an API call this repo makes).
- No model router, no capability matching, no escalation execution (the
  `escalation_chains` table has real *data*; nothing reads it and acts yet).
- No context manager / context tiers / context caching.
- No streaming support.
- No structured-output / schema-validated generation.
- No token budget enforcement, no token telemetry populated automatically
  (the `attempt_log` table exists; nothing writes to it yet).
- No event bus wiring — `event_bus`/`task_events` tables exist; nothing
  emits to them from real execution.
- No dashboard Intelligence section.
- No Planner/Orchestrator/Verifier code integration with any of the above —
  `community/PLANNER_AGENT_PROMPT.md` and `VERIFIER_AGENT_PROMPT.md` (from
  the previous pass) are prompts for human-spawned Claude Code sessions,
  not automated dispatch.
- No retry/backoff logic beyond the error classification function itself.
- No tests beyond the three manual verification calls shown above (no test
  file, no CI).

## PROVIDERS

| Provider | Auth | Models discovered | Models executable | Status | Evidence |
|---|---|---|---|---|---|
| Google (Gemini, API) | Verified — key authenticates | 50 | 1 tested (`gemini-flash-latest`) | Available | Real `generateContent` call, real usage metadata |
| Google (Gemini, Antigravity IDE) | N/A — separate runtime, not an API key | N/A | N/A | Unavailable (quota, per Winston) | Registered identity `agent-8`; no direct test performed this session |
| Anthropic (Claude) | N/A — no API key configured, runs as Claude Code sessions | N/A | N/A (this IS the current runtime) | Available via Claude Code only | This session is the evidence |
| DeepSeek / OpenAI | Not configured | 0 | 0 | Not implemented | No key, no SDK, nothing to test |

## MODEL ROUTING

No router exists yet, so no real routing example to show. What routing
*would* look like today, manually, using what's real:

```
Task: "summarize this 500-line log file"
Requirements: large-context, cheap
Candidates checked: model-gemini-api (available, 1M context), Claude Sonnet (current session)
Would select: model-gemini-api — cheaper class, context fits, no reason to spend Claude session budget
Fallback if Gemini errors: continue in the current Claude Code session
```

This is a hand-reasoned example, not a system decision — no code makes this
choice automatically today.

## TOKEN EFFICIENCY

`UNKNOWN` — telemetry not yet populated. The one real data point: the single
test `generateContent` call used 7 input + 3 output + 87 thinking = 97 total
tokens. That's a sample size of one manual test call, not a metric.

## TESTS

Manual, run directly, not a test suite:
1. `listModels()` → `ok: true`, 50 models — PASS
2. `generateContent('...')` → real text, real usage, `finishReason: STOP` — PASS
3. `generateContent('...', {model: 'not-a-real-model'})` → `errorClass:
   MODEL_UNAVAILABLE`, `httpStatus: 404` — PASS
4. Invalid key via raw curl → `400`/`API_KEY_INVALID` → maps to
   `AUTH_FAILURE` in `classifyError()` — PASS (verified via curl before
   writing the classifier, then confirmed the classifier's logic matches)

No automated test file exists yet — these were run manually this session.

## REMAINING RISKS

- **Git history still contains a plaintext production test password** in
  two local, unpushed commits. Needs your decision on whether to rewrite
  before anything gets pushed.
- **No automated quota/availability check** for either Gemini path — the
  `availability` column is a manually-set value, not live-monitored. It
  will silently go stale.
- **Single provider, single tested model.** Calling this an "Intelligence
  Layer" is generous — it's one verified adapter. The architectural
  separation Winston asked for (identity/role/capability/runtime/provider/
  model/session/task) exists in the database schema already, but nothing
  in the execution path enforces or uses that separation yet.
