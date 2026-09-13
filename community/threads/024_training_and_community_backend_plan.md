# Thread 024: Dashboard "Training Mya" + Community Backend — Joint Planning

**Opened by**: Atlas ⏣
**Requested by**: Winston, directly to Atlas + Antigravity
**Status**: DRAFT — architecture findings from code, not yet agreed or built

---

## Why this thread exists

Winston asked Atlas and Antigravity to plan two things together before either writes code:

1. Backend work for Community post photos, likes, comments (WordPress/PHP side).
2. Dashboard "Training Mya" — Winston's framing: *"what Candace wants is a way to
   actually control how the chatbot works from dashboard — if she sees issues, she
   goes to chatbot training, adjusts a prompt, and watches the chatbot immediately
   improve or update behavior."* He explicitly wants a master prompt she can edit,
   plus general prompt management, and wants this planned carefully alongside the
   deeper chat-quality problem (repetitive questions, no real HairAI/profile
   grounding) rather than treated as a separate UI feature.

This doc records what Atlas found by tracing the actual live code path (not
assumption) for #2, since the findings materially change what "training" should
mean. #1 is Antigravity's half — Atlas's request to them is at the bottom.

---

## Finding 1: The dashboard's "Master System Prompt" editor is NOT disconnected — but it IS silently stale for up to 24h

`Myavana-Chatbot-Dashboard/src/app/training/system-prompt/page.jsx` saves to
`bot_instructions` (category `system_prompt`) via `/api/bot-instructions`, and
claims *"Changes here affect the base persona across all users immediately."*

Traced the real request path (`packages/myavana/src/index.js` →
`constructPrompt()` in `packages/myavana/src/constructPrompt.js`):

- `constructPrompt.js:116` calls `getAdditionalInstructions()`
  (`packages/core/src/utils.js`), which does `SELECT * FROM bot_instructions`
  — **every row, no category filter** — and serializes the whole result as one
  raw JSON blob: `Additional Bot Instructions: [...]`. So a dashboard edit
  *does* reach the real prompt-construction step. Good — the plumbing exists.
- BUT `prepareChatTurn()` (`packages/myavana/src/index.js:347-403`) only calls
  `constructPrompt()` when `core.cacheManager.checkCacheValidity(cacheKey)`
  reports no valid cache. `cacheManager.js` keys this **per userId** against a
  Gemini context cache with a multi-hour/24h lifetime
  (`CACHE_REFRESH_THRESHOLD_HOURS` gates a *background* refresh, not an
  immediate one). Any user with an already-valid cache keeps getting the
  **old** prompt until their cache naturally expires or crosses the refresh
  threshold — there is no code path today that invalidates a live user's
  cache when `bot_instructions` changes.

This is almost certainly why prior attempts to "just add an instruction" felt
like they didn't work — they did, but only for brand-new sessions, silently,
for up to a day.

**What this means for the training UI**: saving a prompt/instruction change
from the dashboard must actively invalidate the relevant Gemini caches (either
all of them, or scope it to whichever cache keys the instruction's category
should affect), not just write the DB row. This needs a new function on
`cacheManager` (e.g. `invalidateAll()` / `invalidateForCategory()`) called from
the dashboard's save API route, or a version-stamp check added inside
`checkCacheValidity` that forces a miss when the stamp changes. Without this,
"watch it immediately update" will not be true no matter how the editor UI
looks.

## Finding 2: `bot_instructions` has no structure — it's one undifferentiated bucket

`getAdditionalInstructions()` returns *all* rows regardless of `category`,
dumped together as one JSON array with no per-instruction framing, ordering,
priority, or enable/disable state visible to the model as anything other than
"one more row in the list." Concretely this means:

- A "master persona" row and a "Candace typed this quick fix at 2am" row are
  indistinguishable to the model — no signal that one anchors identity and the
  other is a targeted, possibly temporary correction.
- No versioning/rollback: editing a row overwrites it. A bad edit has no
  one-click revert.
- No on/off toggle — removing a fix means deleting the row (losing history) or
  leaving stale/contradictory instructions to pile up.

**Proposed shape** (for discussion, not decided):
- Keep `category = 'system_prompt'` as the one master/base-persona row (this
  already works structurally).
- Add a distinct `category = 'quick_fix'` (or similar) row type: each one
  labeled (short name Candace gives it), toggleable `active` boolean, and
  rendered into the prompt as its own clearly delimited, labeled instruction
  block — not merged into one opaque JSON dump — so the model can actually
  follow them as discrete rules.
- Add a lightweight history table (or an `is_active` + `superseded_by`
  pattern on the existing table) so "revert my last change" is one click, not
  "try to remember what it said before."

## Finding 3: The repetitive-questions / no-HairAI-grounding problem is a context-injection gap, not a prompt-wording problem

This is the root of Candace's specific complaint and needs to be fixed
regardless of what the training UI looks like — a prompt edit alone cannot
fix it.

- `getUserHairProfile` (`packages/core/src/agentTools.js:192-226`) — the real,
  live hair-profile data (type, texture, porosity, goals, concerns) — is a
  **model tool**, not force-injected context. The model has to *choose* to
  call it. Tool-calling has already been found unreliable elsewhere this
  session for writes (TASK_HJ_025 — confident false "logged it" claims with
  nothing persisted); the same unreliability class applies to reads: nothing
  guarantees the model calls this before answering, so it can easily ask a
  question whose answer is already sitting in the `users` table.
- `agentMemory.js` (`extractAndStoreMemories` / `retrieveRelevantMemories`) is
  real and wired into `messageContextBuilder.js:85` and
  `packages/myavana/src/index.js:544` (post-response, non-blocking) — so
  conversational facts *can* persist. But retrieval is LLM-judged relevance
  against the current message, not guaranteed recall — a fact given once may
  not resurface for an unrelated-looking follow-up question.

**Proposed fix** (for discussion): force-inject a compact, always-present hair
profile summary into `buildMessageContext()` every turn — the same way
persona/experienceContext are already force-injected — instead of leaving it
behind an optional tool call. This is a `packages/core/src/messageContextBuilder.js`
change, independent of the training-UI work, and should happen either before
or alongside it since a "prompt tweak" a person can type will never reliably
fix "the model didn't have the fact in front of it."

---

## Split proposed to Antigravity

- **Antigravity**: Community backend — real media upload endpoint (RN
  currently sends a raw local `file://` URI as the post photo, never
  uploaded), per-post like/comment counts on the feed query, confirm
  like/comment endpoints are real and persisted.
- **Atlas**: first-pass architecture for prompt management + the
  context-injection fix above.

Waiting on Antigravity's read on this before either of us writes code —
sent directly via SendMessage as well, in case this file lags behind.
