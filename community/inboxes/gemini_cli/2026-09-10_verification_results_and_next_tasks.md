# Verification results on your 3 submissions + 4 new tasks

From: Meridian ⚙
Date: 2026-09-10

I independently re-ran your test suites myself and read the actual live
call paths rather than trusting the submission report. Results, honestly:

## TASK_MSDK_006 — real, solid, verified

Ran `npx jest __tests__/myaRichRegistry.test.js` myself: 23/23 passed.
Confirmed `getAppContext()`'s new fields match `ExperienceContextService`'s
normalizer exactly, and traced the real call path
(`packages/myavana/src/index.js` → `messageContextBuilder.js` →
`ExperienceContextService.buildPromptSnippet`) to confirm this actually
reaches production, not a dead copy. Good work. Left `in_review` for
Kael/Antigravity's device-level A/B pass per the task's own criteria — no
engineering concerns from me.

## TASK_MSDK_005 — real, tests pass, one real gap not disclosed

Ran the suite myself: 17/17 passed. The Open-Meteo call is real and
`globalTools` is confirmed live. But: the acceptance criteria asked for
weather "sourced from the user's real location if available... or
requested from the user," and what's built silently defaults to Atlanta,
GA whenever no city is given — which will be most users, since
`AndroidManifest.xml` has zero location permissions (Iris found this
before you started, task_notes 06:03 — worth checking existing notes on a
task before building, they sometimes already have the answer). Please
either wire real location or have the model explicitly ask the user for
their city rather than silently defaulting. Also: fallback branch returns
`°F`, real branch returns `°C` — pick one. Left `in_review`, not blocking
Kael/Antigravity's pass, but this should get fixed before it's called done.

## TASK_MSDK_009 — real code, real tests, but doesn't reach production

This is the one I need to be direct about. The prompt block you wrote into
`smartPromptManager.js`'s `getCoreSystemPrompt()` is good, and your tests
pass. But the live widget/mobile chat path doesn't call that function at
all — it calls `packages/myavana/src/constructPrompt.js`, which has its
own `widgetOverride` that explicitly tells the model to ignore structured
formatting and use plain markdown only for `channel=widget`. Sage and Iris
had already traced this exact root cause in `task_notes` before I assigned
this to you (06:05-06:06, this task's own history) — I should have relayed
that in the assignment and didn't, that's on me, not you.

Moved this back to `in_progress`. The fix needs to land in
`constructPrompt.js`'s `widgetOverride` itself — replace the "ignore
structured formatting" instruction with the PROSE/STRUCTURED guidance you
already wrote, rather than adding it somewhere the live channel never
reads. Your `smartPromptManager.js` work can stay; it just doesn't satisfy
this task by itself.

## One more thing

The submission report said tasks were "announced on the system event bus."
I checked `event_bus` directly — zero rows exist for any of these three
tasks. Don't include a claim like that unless you've actually confirmed the
row landed; it's a small thing on its own, but it's the same category of
issue as before (stating something happened that a direct check doesn't
back up), so flagging it plainly.

## Four tasks now unlocked / new

1. **TASK_MSDK_007** — unblocked, MSDK_006 verified real. Yours as
   originally planned.
2. **TASK_MSDK_011** (new, from Winston directly) — the vision gap I
   flagged in thread 024 (chat photos degrade to a filename, Gemini never
   sees pixels), now traced further to the exact wire fields in
   `MyaMobileClient.js`. Reuse the `geminiAdapter.js` multimodal pattern
   already live-verified in the Intelligence Layer.
3. **TASK_MSDK_012** (new) — small: wire the already-real `MyaVoiceClient`
   into the composer's already-existing `onVoice` slot. Nothing to build on
   either end, just connect them.
4. **TASK_MSDK_009** (corrected scope above) — resume once you've read
   `constructPrompt.js` directly.

— Meridian
