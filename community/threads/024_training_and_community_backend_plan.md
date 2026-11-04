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

Update: the peer session working this with Atlas went offline before either
side could confirm the split. Atlas went ahead and shipped the two backend
fixes described above (dashboard→cache-invalidation wiring, WordPress
profile force-injection into `messageContextBuilder.js`) since they were
concrete, low-risk, and test-covered. The Community backend half (media
upload, like/comment counts) is still unclaimed as of this update.

---

## Addendum: Live chat-quality review from real screenshots (2026-09-14)

Winston asked for a joint review of a fresh 15-screenshot set (a single real
conversation) at `~/WebstormProjects/mya screenshots/`, planning only — no
code changed for this section. This is not "the chat feels bad" impressions;
every item below is a specific, reproducible defect traced to a specific
mechanism.

### 1. A client-side heuristic mislabels ordinary bulleted text as a fake, checkable "routine"

`MyaChatScreen.js`'s `synthesizeRichBlocksFromProse()` scans any assistant
reply for 2+ lines matching `^\s*(?:\d+[\.\)]|[-*•])\s+`, and if found,
renders a `routine_card` titled **"PRESCRIBED REGIMEN STEPS"** with a
`0 of N completed` checklist and a "Save to Hair Diary" button — regardless
of whether the bulleted lines are actually sequential steps.

Observed misfires, each nonsensical once you read what got "checked off":
- A glossary explaining what the letters in **LOC**/**LCO** stand for
  ("L = Liquid...", "O = Oil...", "C = Cream...") became a 7-step regimen
  to complete.
- Mya's own profile-intake *questions* ("Curl/Pattern: Are your strands
  straight, wavy...", "Moisture Behavior: Does your hair drink up water...")
  became a 4-step regimen to complete — the interview questions themselves,
  presented as if they were hair-care actions.
- A list of **consultation booking options** (Virtual Consultation, HairSI
  Strand Analysis) became a 2-step "regimen" with "Save to Hair Diary" — on
  a message that never even offered a real link to book.

This is the single most severe and most reproducible finding — it appeared
in at least 4 of the 15 screenshots. It's also very likely a meaningful
chunk of what reads as "chat is spamming me with card stuff": the model
didn't decide to show a routine card; a regex did, on content that was never
a routine.

**This needs the same treatment as the "Today's Hair Care Focus" fallback
already removed this session**: either drop this heuristic branch entirely
(let the model's own `routine_card` tool-call/block choice, which the system
prompt already defines, be the only path to a routine card), or make the
detector require actual sequential/actionable language, not just "2+ lines
starting with a bullet or bold label."

### 2. Raw, unrendered markdown leaks into plain chat bubbles

Literal `####` heading syntax appears as visible text in two screenshots
("#### 1. The LOC Method", "#### 2. The LCO Method"). The model is emitting
markdown headings, and nothing between the model output and the message
bubble strips or renders them. Real rendering bug, not a style nitpick.

### 3. The same two "trending" topics are stapled onto nearly every reply, regardless of the question

"Peptide-infused leave-ins" and "bond-repair treatments" appear, verbatim or
near-verbatim, in at least 5 of the 15 screenshots — answering a 4C
conditioner question, a hair-goals question, a diary recap, a hairstyle
question, and (most tellingly) **"What is the community saying today?"**,
which got a generic trend blurb instead of anything from the app's actual
Community feed.

Root cause, traced to `packages/core/src/trendManager.js`: `getTrendContext()`
returns just the **top 2 trends by score** for the user's inferred journey
stage, refreshed only every 48h, and this same short string is injected into
*every* turn's context via `buildMessageContext()` regardless of what the
message is about. With a small trend pool and a 48h cache, most users in a
similar stage get the identical 1-2 trend names on every single message for
days — and the model leans on them as a crutch even when asked something
they're irrelevant to (like "what's the community saying," where real,
distinct Community post data exists and should have been used instead).

**Fix direction (planning only)**: trend context should not be
unconditionally injected on every turn — gate it to when the query is
actually about products/trends, rotate/vary selection instead of always the
top-2, and "what is the community saying" should route to real Community
feed data (the same feed `MyaCommunityScreen` reads), not the trend blurb.

### 4. Explicit product-recommendation requests get generic ingredient prose, never an actual product

"Recommend a deep conditioner for 4c hair" → a paragraph about shea butter,
marshmallow root, ceramides, peptide treatments — no product name, brand, or
`product` block, despite that block type existing in the system prompt.
Confirms Candace's own feedback: recommendations aren't grounded in a real
product catalog.

### 5. Visual/media requests get text, not the media block that exists for exactly this

"Show me what box braids look like?" → a text description of parting
patterns. The system prompt defines a `hairstyle_card` block explicitly for
"protective hairstyle inspiration ... box braids ..." — it wasn't used.

### 6. High-intent actions don't produce an actual action

"How do I book a consultation?" → prose explaining two options exist, ending
in "Would you like me to drop a link?" — a rhetorical question, no link, no
button, no navigation, despite `buildConsultationCardBlock` and a real
`BookVirtualAppointment` screen already existing in the codebase.

### 7. A tool call gets narrated instead of executed, and the original request is silently dropped

"Show my hair goals" → *"(Note: I'm pulling those up for you—one moment
while I connect to your hair journey system!)"* — then the reply moves on to
an unrelated question and the goals are never shown. The user had to ask a
different question (hair diary) to get any real data back, and even then it
came out as manual prose bullets duplicating a real `journal_entry` card
rendered directly underneath it — the same information shown twice, once as
fake-card-shaped text and once as an actual card.

### 8. Formulaic, repeated open lines

"It's great to connect with you" / "It's great to catch up with you" opens
nearly every reply verbatim. Reads as templated rather than responsive.

### 9. Confirmed-real, not a bug: this test account's hair profile actually is empty

"What is my hair profile?" → "a fresh blank canvas." This is consistent with
the Finding-3 fix already shipped earlier in this thread (WordPress profile
now force-injected) — if this account genuinely never completed the HairAI
questionnaire, an honest "we don't have this yet" is correct behavior, not a
bug. Worth a live re-check against an account known to have a completed
profile to confirm the earlier fix actually surfaces it now.

### Proposed priority order (for discussion, nothing started)

1. **#1 (fake routine-card heuristic)** — highest severity, most
   reproducible, actively presents wrong information as actionable.
2. **#2 (raw markdown leak)** — small, mechanical, no design decision needed.
3. **#3 (trend over-injection)** — real conversation-quality issue, needs a
   design decision on when trend context should apply at all.
4. **#7 (tool-call narration / dropped requests)** — same reliability class
   already flagged for journal-entry writes (TASK_HJ_025); likely needs the
   same fix direction (bypass conversational tool-calling for read-only
   "show me my X" requests, matching the direct-REST pattern already used
   for journal entries and the timeline screen).
5. **#4/#5/#6 (missing product/media/action grounding)** — larger scope,
   likely depends on real product-catalog and consultation-booking data
   being wired in, not just prompt changes.

Not proposing to start building any of this without Winston's and
Antigravity's sign-off on the priority order above — this section is
findings + a proposed order, not a commitment.
