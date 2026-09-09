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

## PHASE G — orchestrator integration (2026-09-09, later same session)

**Real, important finding first**: `src/orchestrator.js`'s event handlers
listen to a *different*, legacy task store (`community/tasks.json` via
`TaskManager`/`EventBus`) than the SQLite `tasks` table this entire
Intelligence Layer is built against. Checked directly: `TASK-QA-001` exists
in the JSON store but not (yet) in SQLite - the two are not reliably synced.
Reconciling them is a real, separate project. Rather than paper over that
with a fragile dual-write, **Phase G is built SQLite-native** and states
this limitation plainly: it does not hook into the legacy JSON event system.

**`src/intelligence/orchestratorIntegration.js`** —
`attemptAutomaticExecution(taskId)`: reads a real SQLite task, maps its
`required_capabilities` to a real, narrow set of task types that actually
have an executable path (`large-context`/`summarization` → Gemini; nothing
else maps to anything, on purpose — most real work in this org needs a
human-spawned session, and pretending otherwise would be dishonest). If it
executes successfully, records real `evidence` (class `OBSERVED`, matching
this org's own Planner/Verifier distinction — technical pass moves the task
to `in_review`, not `done`) and updates task status for real.

Tested three real cases: a `large-context` task executed automatically
(evidence row inserted, status → `in_review`); a `coding`/`architecture`
task correctly refused automatic execution and was left untouched
(`status` stayed `open`); a nonexistent task ID returned `TASK_NOT_FOUND`.

## PHASE F — token telemetry (2026-09-09, later same session)

**`src/intelligence/tokenTelemetry.js`** — `getUsageSummary()` aggregates
real `attempt_log` data by model (attempts, successes, real token sums, avg
latency). Cost is reported as the string `'UNKNOWN - no verified pricing
exists'` in every row, not a number — consistent with Phase A's finding that
no real pricing was ever obtained. `checkBudget(taskId, budget)` compares a
task's real summed token usage against caller-supplied thresholds. Tested
against a real execution: correctly reported real totals, correctly flagged
`WITHIN_EXPECTED` against a generous budget and `HARD_LIMIT_EXCEEDED`
against a deliberately tiny one using the *same* real usage number.

## PHASE E — context manager (2026-09-09, later same session)

**`src/intelligence/contextManager.js`** — `buildContextPackage(taskId,
tier)`, tiers 0-3, strictly additive. Tier 2's `findRelevantFacts()` does
real keyword/tag overlap matching against the live `facts` table (explicitly
NOT semantic search - no embedding model exists anywhere in this system, so
claiming "semantic relevance" would be fabricated). Tested with a real task
titled around "BlockType protocol duplication": correctly surfaced the two
real, actually-relevant facts about that exact issue, correctly ranked by
match strength, and correctly did *not* surface an unrelated fact (about a
missing hairstyle field) that shares no keywords. Tier 3 (organizational
policies/lessons) honestly reports `available: false` — no such populated
store exists yet, stated rather than silently returning an empty array that
would look like "checked, found nothing."

## PHASE I — dashboard (2026-09-09, later same session)

**`dashboard/src/app/api/intelligence/route.ts`** + **`/intelligence`
page**, added to the sidebar. Live queries only - models, availability,
recent routing decisions with their real recorded reason, recent
escalations, and token usage. Cost is rendered as `UNKNOWN`, not blank or
zero. Verified against the actual running dashboard (port 47821, both the
API and the page return 200 with real data).

## PHASE J — learning loop (2026-09-09, later same session)

**Found and fixed a real integration gap while building this**:
`escalationRouter` (Phase D) never wrote to `model_selection_history` -
only `intelligenceService.route()` (Phase C) did. The two code paths for
recording "why a model was chosen" were silently inconsistent since Phase D
was built. Caught because `learningLoop`'s join returned zero rows on real
data that should have produced results - didn't paper over the zero, traced
it to the actual cause and fixed the earlier phase's file.

**`src/intelligence/learningLoop.js`** — `recomputeModelPerformance()`
aggregates real `attempt_log` + `model_selection_history` (joined on
task_id to recover task_type) into `model_performance`, idempotently (upsert,
not append). `getHistoricalSuccessRate(modelId, taskType)` returns a rate
**with its sample size**, and an explicit `confidence` field
(`NO_DATA`/`LOW_SAMPLE_SIZE`/`SUFFICIENT_SAMPLE`, threshold n=5, stated not
hidden) - a rate without a sample size is not information.

**Deliberate scope boundary, not a gap I missed**: this does not feed back
into routing decisions yet. Reordering a deterministic escalation chain
based on a handful of manual test calls (n=2 in this session's real data)
would be manufacturing statistical confidence that doesn't exist - that's
exactly the class of fabrication this whole effort exists to prevent. The
aggregation is real and tested; acting on it is correctly gated behind
having enough real volume for a rate to mean something.

## All phases A-J: summary

| Phase | Real | Tested | Notes |
|---|---|---|---|
| A - Provider foundation | ✅ | ✅ | Gemini only; no Claude/DeepSeek/OpenAI API |
| B - Model registry | ✅ | ✅ | Live health check for Gemini; honest UNKNOWN for session-based runtimes |
| C - IntelligenceService | ✅ | ✅ | Real execute-or-honest-handback |
| D - Escalation router | ✅ | ✅ | 2 real bugs caught by forcing failure, not trusting the code |
| E - Context manager | ✅ | ✅ | Keyword matching, not semantic search |
| F - Token telemetry | ✅ | ✅ | Cost always UNKNOWN, never estimated |
| G - Orchestrator integration | ✅ | ✅ | SQLite-native only; legacy JSON task store NOT wired in (stated limitation) |
| H - Planner/Verifier integration | Deferred to Winston | — | Prompts exist (community/*_AGENT_PROMPT.md); wiring them to this code is his own task |
| I - Dashboard | ✅ | ✅ | `/intelligence`, live data only |
| J - Learning loop | ✅ | ✅ | Aggregation real; NOT wired into routing decisions (deliberate, stated why) |

## CONFIGURED BUT UNVERIFIED

- Rate limits, quota ceiling, and any real per-token pricing for the Gemini
  API path — the API didn't expose these in the calls made; would need
  either a documented published rate from Google or triggering an actual
  429 to observe it. Not fabricating a number for either.
- Vision/audio/computer-use capabilities listed in `model_registry` for the
  Gemini rows are carried over from the model's advertised
  `supportedGenerationMethods`/description, not independently exercised
  (no image/audio/computer-use call was actually made).

## NOT IMPLEMENTED (as of Phase A only — SUPERSEDED, see below)

> **This section is stale and was left uncorrected after Phases B-J were
> added later in this same document — a real documentation bug, caught by
> Atlas reading this section faithfully and correctly, then flagging that it
> contradicted the later PHASE B-J sections he'd also checked. Not his
> error. Kept below struck through rather than deleted, so the mistake and
> its correction are both visible - deleting it would repeat exactly the
> "erase instead of correct" problem flagged earlier tonight with Gemini
> CLI's evidence deletion.**

~~Everything past the provider adapter. Explicitly, not implied:~~
~~- No provider-agnostic `IntelligenceService`/adapter interface~~ → **built, Phase C**
~~- No model router, no capability matching, no escalation execution~~ → **built, Phases B/D**
~~- No context manager / context tiers / context caching~~ → **built, Phase E**
~~- No token budget enforcement, no token telemetry~~ → **built, Phase F**
~~- No dashboard Intelligence section~~ → **built, Phase I (`/intelligence`)**
~~- No event bus wiring~~ → still true, see the real current list below.

## NOT IMPLEMENTED (current, accurate as of Phase J)

- No streaming support.
- No structured-output / schema-validated generation.
- No `event_bus`/`task_events` emission from real execution — the tables
  exist, `model_selection_history`/`attempt_log`/`escalation_decisions` are
  populated for real (a more specific, already-working form of the same
  idea), but the generic event bus itself is not wired.
- No retry strategy differentiated by failure classification beyond
  "escalate to the next chain step" — `geminiAdapter.classifyError()`
  produces real categories (`AUTH_FAILURE`/`RATE_LIMIT`/etc.) but nothing
  branches on them differently yet.
- No Planner/Orchestrator/Verifier *code* integration —
  `PLANNER_AGENT_PROMPT.md`/`VERIFIER_AGENT_PROMPT.md` are prompts for
  human-spawned Claude Code sessions, not automated dispatch. This is
  explicitly Winston's own piece (Phase H), not deferred by omission.
- No context caching (Phase E has tiers and relevance-matching; caching
  identical/near-identical context across calls is not built).
- Learning loop aggregation is real (Phase J) but deliberately not wired
  into routing decisions — see Phase J's own section for why.
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
