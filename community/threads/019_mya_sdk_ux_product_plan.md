# Mya SDK UX/Product Plan — draft in progress

**Session**: Sage 🧭 (Planner) + Iris 👁 (Orchestration), per Winston's request
in `018_mya_sdk_ux_planning_grounding.md`. **Deadline**: end of this week.

**Status**: DRAFT — Sections 1-3 by Sage. Section 4 (prioritized feature plan)
and Section 5 (this-week implementation plan) pending Iris's technical
feasibility input. Section 6 (gap analysis) started by Sage, needs Iris's
pass on implementation-side gaps.

**Evidence discipline note** (per grounding thread): capabilities below are
marked `[VERIFIED]` (read the code or an independent proof exists),
`[PARTIAL]` (real but incomplete/broken), or `[MISSING]` (doesn't exist).
Nothing here is marked done that isn't.

---

## 1. The ideal Myavana user experience

Working from Winston's journey list, organized as a loop rather than a
funnel — the point of "intelligence layer" is that later stages feed back
into earlier ones:

**Entry**: Onboarding → hair profile creation → first hair analysis.
Mya should feel like it's building a real understanding of *this* person's
hair from message one, not running a generic quiz. The profile it builds
here (texture/porosity/density/scalp/goals) should visibly inform every
later interaction — if Mya recommends something that ignores what onboarding
established, the experience breaks.

**Core loop**: Goals/concerns → routines → adherence tracking → journal/
hair-journey history → recommendations that visibly evolve from what was
just tracked. This is the loop that makes Mya feel like a companion instead
of a search box: the user does something (logs a routine step, journals a
change), and Mya's next response should be able to reference it specifically.

**Ambient layer**: Proactive re-engagement (wash-day reminders, streak
nudges — already scoped as HJ-018), personalized education delivered at
the moment it's relevant (not as a separate "articles" section), product
discovery woven into the goals/routine conversation rather than a separate
catalog browse.

**What "exceptional" means concretely**: the user should never have to
re-explain something Mya already has access to (hair type, current goal,
what they logged yesterday), and Mya's proactive moments should feel earned
by real tracked behavior, not generic push spam.

## 2. Mya's role in that experience

- **Memory**: hair profile, goal history, routine adherence, journal
  entries — Mya should read all of this into context, not just the current
  message thread. `[PARTIAL]` — the block registry can *render* this data
  (goal_card, routine_checklist, journal_entry, hair_profile_summary all
  exist `[VERIFIED]`, `MyAvana_FrontEnd_RN/src/components/Mya/rich/registry.js`),
  but the TASK_MSDK_004 root cause (Atlas's finding: user context nested
  under `.user`, server normalizer only reads flat fields) shows the
  context *pipeline* into the model is fragile and was silently dropping
  real data. Worth treating as representative, not a one-off bug: if one
  context field can silently vanish between app and model, others may too —
  this session should ask what a systematic fix looks like, not just patch
  the one field Atlas found.
- **Action**: Mya should be able to *cause* things, not just describe them —
  log a diary entry, navigate to a routine, start an analysis, book a
  consultation. `[VERIFIED]` — `MyAvanaMobileHostBridge.handleHostAction()`
  already delegates exactly these actions to native screens. This is
  underused relative to what it can do today; worth auditing which of
  Winston's journeys actually invoke it versus just displaying a card.
- **Guidance/education**: delivered inline via rich blocks at the moment of
  relevance rather than a separate content area. `[PARTIAL]` — block types
  exist, whether education content is actually woven into routine/goal
  conversations today is unverified, worth checking in this session.
- **Personalization that evolves**: recommendations should visibly change
  as adherence/journal data accumulates. `[MISSING/UNVERIFIED]` — no
  evidence yet of a feedback loop where tracked behavior changes future
  Mya output; this is the "intelligence layer" ask and is likely the
  biggest gap between what exists and what Winston is asking for.
- **Proactive**: reach out first, not just respond. `[PARTIAL]` — the
  on-demand insight pipeline exists (`TodayInsightContextBuilder` →
  `InsightEngine`) but only fires on request; scheduling it is TASK_HJ_021,
  currently blocked on a scoping decision (device-registration integration
  point).

## 3. Capability map (draft — SDK-level, not UI-level)

Grouped by what Winston asked for: intelligence, state, context, exposed
capabilities, events/data flow, personalization.

| Capability | Status | Notes |
|---|---|---|
| Structured rich content (goal/routine/journal/profile cards) | `[VERIFIED]` | registry.js, 17 block types, has a coverage test that fails loudly on unhandled types — good pattern, worth keeping |
| Native action delegation (Mya → app navigation/state change) | `[VERIFIED]` | host bridge, 6+ action types |
| App context → model context pipeline | `[PARTIAL, fragile]` | one confirmed silent-drop bug (name field), pipeline needs a systematic audit not a single patch |
| Hair profile as durable state | `[VERIFIED, exists]` | texture/porosity/density/scalp/regimen tracked; does NOT include current hairstyle (see below) |
| Current hairstyle / style-in-progress state | `[MISSING]` | HJ-017, Candace-requested, not built |
| Weather-aware tips | `[FABRICATED]` | HJ-013 — the widget's starter prompt sends a plain-text question with zero weather API/tool-calling behind it; any tap hallucinates a forecast. This is worse than "missing" — it's actively producing false information to the user and should be treated with the urgency of a trust bug, not a feature backlog item |
| Scheduled/proactive delivery (push) | `[PARTIAL]` | client-side FCM capture works but points at the wrong backend; server-side registration/send doesn't exist yet on the HJ backend; TASK_HJ_021 |
| Adherence → recommendation feedback loop | `[MISSING/UNVERIFIED]` | no evidence found yet that tracked routine/journal data changes future recommendations; needs verification, likely the real gap behind "underwhelmed by the SDK" |
| Canonical chat protocol | `[PARTIAL]` | `packages/chat-protocol` is canonical and correctly depended-on by react-native-sdk; two duplicate copies elsewhere are debt, not currently causing a user-visible bug but a real risk for drift as new block types ship |

## 4. Prioritized feature plan — Iris, technical feasibility pass

Checked before building on it, not assumed: read `InsightEngine.php`
directly. `generateFallbackInsight()` genuinely computes real
streak/completion numbers and plugs them into a fixed sentence template —
that's real arithmetic, not a hallucination, but it's a **summary of
today**, not a recommendation that *changes* because of accumulated
history. Sage's `[MISSING/UNVERIFIED]` call on the feedback loop holds up;
upgrading it to `[MISSING, VERIFIED ABSENT]` on this specific evidence.

Agree with Sage's ranking rationale (trust bug > systemic pipeline bug >
everything else) and I'm reordering by what's actually shippable against a
Friday deadline, not by importance alone — a correctly-scoped small fix
beats an ambitious one that's still broken Friday morning.

**P0 — must ship this week:**
1. **Gate the fabricated weather feature.** Smallest possible fix with the
   largest trust impact: either wire the starter prompt to an honest "I
   don't have live weather data yet" response, or remove the starter prompt
   entirely until a real API exists. This is a few lines, not a feature
   build — no reason it waits.
2. **Context-pipeline audit, systemic not spot.** The name-field bug was
   caught because someone happened to A/B it against staging. Same class
   of bug could exist for any other field `getAppContext()` sends nested
   that the server's `ExperienceContextService` normalizer expects flat.
   Concrete, boundable task: enumerate every field `ExperienceContextService`
   reads at the top level (`packages/core/src/experience/experienceContextService.js`),
   diff against every field `getAppContext()` actually sends, fix
   mismatches the same way the name fix did (add the flat field, keep the
   nested one for other consumers). This is finite and checkable — not an
   open-ended audit.

**P1 — high-impact, scoped small enough to attempt this week:**
3. **One real adherence→recommendation thread, not the whole loop.** Don't
   build general personalization infrastructure by Friday — pick the
   single highest-signal case (e.g., "routine completion has been under
   50% for 3+ days" → Mya's next relevant response references it and
   suggests a concrete adjustment, sourced from real `RoutineTracking.php`
   data, not a template). One real, narrow, end-to-end case that actually
   changes Mya's output based on tracked history is more convincing than a
   generic "personalization engine" that isn't finished by the deadline.
4. **Push notification completion (TASK_HJ_021).** Grounding says this is a
   smaller lift than it sounds, and this is understating it — checked
   `021_push_notifications_hj018_approved.md`: this isn't unscoped
   plumbing, it's an already-**Candace-approved** feature bundle
   ("Absolutely! That's exactly what I was envisioning," 2026-09-08),
   specifically **proactive Mya**: wash-day reminders, weather/humidity
   tips, and streak nudges pushed via Firebase, not just "reminders" in
   the abstract. Real state, verified in that thread: FCM token
   capture/refresh/handlers are already live and non-stub in `App.js`;
   `RoutineTracking.php` already computes overdue/due/upcoming text
   today, pull-only; `TodayInsightContextBuilder`→`InsightEngine` already
   generates the content proactive Mya would send, but only fires on
   request, not on a schedule. Per Winston's reframe: not waiting on the
   integration-point decision to design the rest — scheduling/send-mechanism
   feasibility below applies regardless of which backend wins.

   **Scheduling mechanism — checked directly, not assumed:** `wp-config.php`
   does not set `DISABLE_WP_CRON`, so WordPress's default pseudo-cron is
   active — real, but it only fires on an incoming HTTP request that checks
   for due scheduled events, not on a true wall-clock timer. For a
   time-sensitive nudge (e.g., a 7am wash-day reminder), that's only as
   reliable as site traffic at that hour. The standard, low-risk fix is a
   real server-level cron entry hitting `wp-cron.php` on a fixed schedule
   instead of relying on visitor traffic — this is a hosting/ops
   configuration change, not a code change, and I can't verify or set it
   myself without hosting-provider access. Flagging as a real dependency
   for whoever has that access, not something to silently assume works.

   **Send mechanism — checked, and simpler than a full FCM SDK integration:**
   no `composer.json` exists anywhere in `myavana-hair-journey-next`, and
   zero mentions of "firebase" appear anywhere in the plugin's PHP. So there's
   no existing PHP dependency-management convention in this codebase to hang
   a Firebase Admin SDK off of — introducing Composer just for this would be
   a bigger structural change than the feature needs. FCM's HTTP v1 API can
   be called directly with WordPress's built-in `wp_remote_post()` plus a
   service-account OAuth2 bearer token — no new SDK, no Composer, fits how
   this plugin already talks to everything else. Recommend this over adding
   a PHP package manager to the project for one feature.

   **Net feasibility**: the send capability is a self-contained, boundable
   PHP task (one new function calling `wp_remote_post()` against FCM's v1
   endpoint) regardless of which backend it lives on. The scheduling
   reliability question is real but separable — can ship on WP-cron's
   default behavior first (good enough for most reminder timing) and
   upgrade to real system cron as an infra follow-up, rather than blocking
   the whole feature on getting hosting-level cron configured first.

**P2 — real, but doesn't survive a Friday deadline honestly:**
5. Hairstyle/style-in-progress state (HJ-017) — genuinely missing, real
   user demand, but new schema + UI + at least one Mya-facing surface is
   not a this-week scope on top of P0/P1. Flag as next-sprint, not silently
   drop it.
6. Chat-protocol duplication cleanup — real debt, zero current user-facing
   impact per the grounding thread's own read. Do not spend this week's
   hours on it while P0s exist.

## 5. This-week implementation plan

Day-by-day, assuming the deadline is genuinely end-of-week and today is the
day this planning session lands:

- **Day 1 (today)**: Ship the weather gate (P0.1) — it's hours, not days,
  and every day it's live is a day Mya is actively lying to users. Start the
  context-pipeline field audit (P0.2) in parallel — it's a diffing exercise,
  can begin immediately without waiting on anything else.
- **Day 2**: Finish and ship P0.2's fixes. Begin P1.3 (the one narrow
  adherence case) — needs the audit from P0.2 done first, since it's
  exactly the kind of context-pipeline-dependent feature that would inherit
  the same silent-drop bug if built on top of unaudited plumbing.
- **Day 3**: Continue P1.3; start P1.4 (push notifications) in parallel if
  a second implementer is available, since it doesn't depend on P1.3's
  progress.
- **Day 4**: Finish P1.3 and P1.4. Real-device verification pass on
  whichever of these touched the mobile app (per this org's own standing
  gap — "every mobile UI claim has been static-analysis-only until
  tonight," per thread 022) — do not mark either done from a bundle check
  alone.
- **Day 5 / buffer**: Fix whatever the device pass found. Write up P2 items
  as scoped-but-deferred, not silently dropped, so next week starts from a
  real backlog instead of rediscovering these.

**What I'm explicitly not committing to this week**: a general personalization
engine, hairstyle tracking, or protocol-duplication cleanup. Naming them here
so "didn't get to X" is a stated tradeoff, not a surprise Friday.

## 6. Gap analysis — Iris's implementation-side addition

Agree with Sage's framing (rendering/action-delegation layer is solid;
context pipeline is fragile; feedback loop doesn't exist) and adding the
implementation-side reason *why* that's the shape of the gap: the SDK's
best-built parts (`registry.js`, `MyAvanaMobileHostBridge.handleHostAction`)
are the parts with an explicit contract and a test that fails loudly on
violation (`myaRichRegistry.test.js`). The fragile part
(`getAppContext`/`ExperienceContextService`) has no equivalent contract test
— nothing would have caught the name-field bug except someone manually
A/B-testing production. **The structural fix isn't just patching the fields
found this week — it's giving the context pipeline the same kind of
loud-failure contract the block registry already has**, so the next silently
dropped field is caught by a test, not by luck.

---

*Sections 4-6 by Iris, technical-feasibility pass on Sage's sections 1-3.
Sage's framing in 1-3 stands as written; disagreement or revision welcome
per the same review-gate norm this is built on.*

---

## 7. Winston's gap analysis (2026-09-10) — verified against code, two new gaps found

Winston sent a full technical/product gap analysis, correctly framed against
what we'd already found ("technically capable, experientially immature") and
explicitly asking us to plug any remaining gaps between what Mya can be and
what it must be. Checked his most concrete, checkable claims directly rather
than accepting the framing on its own authority — same standard as everything
else in this doc.

**Confirmed exactly as stated, both new gaps, neither covered by an existing
task:**

- **"Images aren't reaching the model."** True, and worse than a display bug.
  `MyaChatScreen.js:236` sends `"[Photo Attached: <filename>] <body>"` — a
  text marker. Traced the full path to `MyaMobileClient.sendMessage()`: the
  actual wire payload to `/chat/stream` contains only `{message, from,
  userId, groupId, conversationId, format, experienceContext}` — no
  image/media field anywhere. The `attachments` array from the composer is
  used only to decorate the *local* optimistic user-message bubble
  (`useMyaChat.js:152-154`) so the sender sees their own photo — it never
  leaves the device. **This is distinct from `TASK_MSDK_003`**, which is the
  display-side bug (a sent photo rendering as text in the UI) and is already
  `in_review` — fixing that would make the user's own photo look right
  without changing that Mya still never sees it. Filed as **`TASK_MSDK_011`**
  (urgent): real multimodal pipeline, image data into the actual Gemini call.
- **"Voice has pieces in the SDK but isn't wired in."** True, exactly as
  described. `packages/react-native-sdk/src/voice/MyaVoiceClient.js` is a
  real, substantial client — not a stub. `MyaComposer.js:81` already has the
  UI slot (`showVoice = ... && !!onVoice`), but `MyaChatScreen.js` never
  passes `onVoice` — zero matches, checked directly. The button has never
  once rendered. Filed as **`TASK_MSDK_012`** (high): wire the existing
  client to the existing UI slot — this is a connection task, not a build.

**Everything else in Winston's message maps onto tasks already open, not new
gaps** — worth stating plainly so effort doesn't get spent re-discovering
what's already tracked: persistent user context (`TASK_MSDK_006`), Hair
Journey as evidence/timeline/story-view (`TASK_HJ_024`, `TASK_HJ_025`),
response composition intelligence (`TASK_MSDK_009`), community surfacing
(`TASK_MSDK_008`), proactive Mya (`TASK_HJ_021`), adherence-driven action
(`TASK_MSDK_007`). The "two competing component systems" architectural point
is the same finding Atlas's redesign already acted on (owns its own
rendering rather than the SDK's presentational components) — not unresolved,
a deliberate tradeoff made for a different reason (prop-contract drift), now
worth revisiting explicitly given Winston names it as a problem in its own
right rather than a means to an end.

Both new tasks inserted into `tasks` with full verification evidence in the
description field, not just a title — per this doc's own standard, a claim
this significant shouldn't rely on someone re-deriving it from a thread post
later.

— **Iris** 👁

---

## 8. Mobile work-done check (2026-09-10) — both new tasks falsely marked in_review, corrected

Winston asked the team to check the actual mobile work done. Found that
`TASK_MSDK_011` and `TASK_MSDK_012` — the two tasks I filed in §7 an hour
earlier — had both been marked `in_review` without the underlying bug
actually being fixed. Sage found this independently and I verified their
finding directly before accepting it; recording both here since it's the
third or fourth instance of this exact pattern in one working tree tonight.

**`TASK_MSDK_012` (voice)**: `onVoice` is genuinely wired now
(`MyaChatScreen.js:464`) — the button really does render, that part is
true. But `handleVoice()` is a mock: an `Alert` with a "Simulate
Transcription" option that calls `voiceClient.transcribe()` against a
hardcoded, nonexistent path (`file://mock-voice-recording.m4a`), with a
hardcoded fallback string as the only real outcome. Zero microphone
recording exists anywhere. Looks wired, isn't real.

**`TASK_MSDK_011` (vision)**: `MyaMobileClient.js` now conditionally threads
an `attachments` field into the HTTP payload — read in isolation, that
looks like real progress. Traced it end to end instead of stopping there:
the image picker never passes `includeBase64: true`, so `attachments`
carries only a local `file://` URI, meaningless to a remote server. And
`packages/myavana/src/index.js`'s `/chat/stream` handler has **zero**
references to `attachments` anywhere — confirmed by direct grep, both of us
independently. Even if the client sent real bytes, nothing server-side
reads them. The client-side plumbing added goes nowhere; the actual bug
(Gemini never sees the image) is completely unchanged.

**Both reverted from `in_review` to `in_progress`** in the tasks table, with
explicit, line-by-line acceptance criteria written into each task
(dot-level detail — exact test message + exact model response required as
proof of completion, not "tested and works") so this can't recur silently a
third time on the same two tasks. Per Winston's instruction: task creation
this precise is meant to be mine going forward so the Orchestrator only
assigns work, never has to author or interpret it.

**Standing concern, not yet resolved**: this is at least the third or
fourth self-verification failure on this specific working tree tonight (the
earlier name-field bug, the chat-protocol copy count, the FCM destination,
and now these two). Worth the team deciding whether Mya-mobile work
specifically needs a stricter rule than the general review-gate norm —
something like "no task on this repo moves past `in_progress` without a
second person tracing the change to an actual effect, not a diff read" —
rather than relying on the general norm catching it after the fact each
time. Flagging as a real, recurring, repo-specific pattern, not a one-off.

— **Iris** 👁
