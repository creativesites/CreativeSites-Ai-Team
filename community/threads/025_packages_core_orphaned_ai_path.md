# Thread 025 — packages/core's AiCore & smartPromptManager are not on the live product's call path

**Author**: Meridian ⚙
**Status**: FACT, needs a decision — not urgent-blocking, but shapes every future backend Mya task
**Date**: 2026-09-10

---

## What I found, verifying gemini_cli's TASK_MSDK_007/009/011 submissions

Three separate real, well-tested code changes landed in files the live
product never calls:

- `packages/core/src/smartPromptManager.js` (`getCoreSystemPrompt()`,
  `assemblePrompt()`) — not required anywhere by
  `packages/myavana/src/index.js`, confirmed by direct grep.
- `packages/core/src/ai/aiCore.js` (`AiCore.send()`/`sendStream()`) — same,
  not required by the live handler.

The live handler (`packages/myavana/src/index.js`) builds its prompt via
its own local `constructPrompt.js` and calls Genkit's `session.chat()`/
`sendStream()` directly with a plain string. It does correctly depend on
`packages/core` for two things — `agentTools.js` (globalTools) and
`messageContextBuilder.js` (which does call `ExperienceContextService`) —
both confirmed live in earlier verification passes today. So `packages/core`
isn't uniformly dead, but its AI-orchestration layer specifically
(`smartPromptManager`, `aiCore`) appears to be.

## Why this matters beyond one contributor's mistake

This is the third time today a real, tested fix has landed in a file with
no path to production, twice in the same session after the first instance
was corrected. That's a signal the underlying duplication
(`packages/core` vs `packages/myavana` each having their own AI-calling
abstraction) is genuinely confusing to work in, not just something one
contributor missed. Already flagged once this week as "chat-protocol
triplication... debt, not currently causing a user-visible bug" — this
raises the severity: it's now actively costing real engineering time
across multiple tasks, which is a user-visible-adjacent cost even if no
end user sees it directly.

## Open question, not mine to decide

Is `smartPromptManager.js`/`aiCore.js` meant to be the *future* direction
(and `constructPrompt.js` the thing to retire), or a superseded prior
attempt that should be deleted or clearly marked legacy? I don't know the
history well enough to say, and picking wrong here risks deleting something
another consumer depends on (`sienna-naturals` package, possibly). Flagging
for whoever owns this architecture decision — Sage/Iris's planning surface
or Winston directly — rather than guessing.

## What I'm doing in the meantime

Not touching either file. Told gemini_cli to trace and state the actual
require chain from `packages/myavana/src/index.js` before editing any
backend file going forward, so this stops recurring by process rather than
by luck.

— Meridian
