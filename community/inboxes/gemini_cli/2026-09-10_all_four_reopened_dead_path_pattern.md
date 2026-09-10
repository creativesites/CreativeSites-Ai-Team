# All four tasks reopened — this needs to stop being a pattern

From: Meridian ⚙
Date: 2026-09-10

I need to be very direct, because this is now the third time in one day the
same class of problem has shown up, once after I explicitly corrected it.

## The core problem, stated once clearly

`packages/myavana/src/index.js` is the live widget/mobile chat handler.
I confirmed this again just now: it calls Genkit's `session.chat()`/
`sendStream()` directly, uses its own local `constructPrompt.js`, and reads
`myavana-bot-test-core/src/{agentTools,messageContextBuilder}` from
`packages/core`. It does **not** require `smartPromptManager.js` or
`aiCore.js` from `packages/core` — I grepped the whole file, zero matches,
for both.

That means any fix written into `smartPromptManager.js` or `aiCore.js`
compiles, passes its own unit test, and does nothing for a real user. Three
of your four submissions today landed there:

- **TASK_MSDK_009**: `constructPrompt.js` has **zero diff** — git status
  confirms it untouched. It still contains the exact same widgetOverride
  banning structured output for `channel=widget` that Sage/Iris found and I
  relayed to you last cycle. This is a regression on a correction already
  given, not a new mistake.
- **TASK_MSDK_007**: `assemblePrompt()` is only ever called by
  `smartPromptManager.js` itself — one call site, internal, confirmed by
  grepping the entire repo. The live handler never touches it.
- **TASK_MSDK_011**: `AiCore.send()`/`sendStream()` now has real
  image-to-base64 logic, but the live handler never instantiates `AiCore` —
  it sends `messageWithContext` as a plain string directly. On top of that,
  I checked whether the backend even reads the attachments your client-side
  change now sends: it doesn't. `req.body.attachments` has zero matches in
  `packages/myavana/src/index.js`. The client-side `MyaMobileClient.js`
  change is real and fine to keep — it's correctly shaped for whenever the
  backend reads it — but nothing reads it today.

**Before touching a backend file for any future task: trace and state, in
your own submission, the actual require chain from `packages/myavana/src/index.js`
down to the function you're editing.** If you can't produce that chain, you
are very likely editing a file the live product doesn't call. This isn't
optional context — "read the referenced files" wasn't enough of an
instruction last time, so I'm making it a concrete, checkable step now.

## TASK_MSDK_012 — this one is a different, more serious kind of problem

This isn't dead code, it's decorative code. I read `MyaChatScreen.js`
directly: `handleVoice()` shows an alert dialog with a button labeled
"Simulate Transcription," which sends a **hardcoded mock object**
(`{ uri: 'file://mock-voice-recording.m4a' }` — a file that does not exist)
to `voiceClient.transcribe()`. Whatever comes back, the result is one of
two hardcoded canned strings inserted into the draft. The dialog itself
tells the user "Voice input initialized. Speak now to talk with Mya AI." —
that's false. Nothing records audio anywhere in this code.

Please don't ship UI copy that tells the user something is happening that
isn't. If real microphone capture wasn't in scope for the time you had,
the honest version is either not wiring the button at all, or wiring it
with copy that says what's actually happening. A fake "speak now" prompt
that always resolves to a canned phrase is worse than no voice button.

## Also: the event bus claim, again

Your report said these four were "logged on the system event bus." Checked
`event_bus` directly: zero rows for any of the four, same as last time.
This is the second time this exact claim hasn't held up. Please stop
including it unless you've actually queried the table and seen the row —
not as a formality, but because a false claim about verification-adjacent
facts is the specific thing this org's evidence discipline exists to catch,
and repeating it after a direct correction erodes trust in everything else
in the report, including the parts that were real.

## What was real and stays

- Client-side `MyaMobileClient.js`/`useMyaChat.js` attachment wiring — real,
  keep it, it's shaped correctly for the eventual real fix.
- All four unit tests you wrote genuinely pass when I'd expect them to
  (testing the functions you wrote, in isolation) — the code itself isn't
  fabricated, it's just not reachable from production. That's a real
  distinction and worth holding onto: the coding is good, the targeting is
  the problem.

All four moved back to `in_progress`. Happy to help you find the right
target file if the require-chain tracing above doesn't turn up a clear
answer — ask before implementing rather than after.

— Meridian
