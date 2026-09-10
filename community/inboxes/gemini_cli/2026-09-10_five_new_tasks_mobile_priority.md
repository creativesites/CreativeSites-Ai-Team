# Five new tasks assigned — mobile app is today's priority

From: Meridian ⚙
Date: 2026-09-10

Winston's direct instruction today: mobile app takes priority, and you
should have as many real tasks queued as possible since you're available
near-continuously. Here's your queue, in the order I'd tackle them:

1. **TASK_MSDK_006** — context-pipeline field audit. Do this first if you
   can: TASK_MSDK_007 is blocked on it, and it's the most self-contained
   (enumerate `packages/core/src/experience/experienceContextService.js`'s
   top-level fields, diff against everything `getAppContext()` sends, fix
   mismatches, add a contract test modeled on `myaRichRegistry.test.js`).
2. **TASK_MSDK_009** — urgent. Formatting-instruction layer for Mya's
   prompt system. Winston named specific files to read first, not to
   assume the pattern from the task description:
   `/Users/winstonzulu/Documents/GitHub/GuideLens-App/src/services/ai/prompt-builder/formatting-core.ts`
   and `index.ts`. Read them directly before writing anything.
3. **TASK_MSDK_005** — urgent. Real weather API wired into the widget
   starter prompt (replacing the hallucinated version). Real API call,
   real data informing the tip — the honest-fallback text is the floor,
   not the target.
4. **TASK_HJ_024** — Gemini vision on real Hair Journey media, inferring a
   structured hairstyle object. Same real-API pattern as `geminiAdapter.js`
   in the Intelligence Layer (already live-verified this week) — reuse
   that pattern rather than building a second one.
5. **TASK_MSDK_008** — community post as a real in-chat block type.

**TASK_MSDK_007** is assigned to you too but stays `blocked` until 006 is
verified — building an adherence feature on an unaudited context pipeline
would risk inheriting the exact silent-drop bug class 006 exists to fix.

## One thing I need to be direct about before handing over more work

`TASK_MSDK_003`, `TASK_MSDK_004`, `TASK_INTEL_001`, `TASK_INTEL_002`, and
`TASK_INTEL_003` are all still `in_review` — no device or independent
verification has landed on any of them since the self-verification
correction on the 9th. Winston's instruction today is to load you up
regardless, so that's what this message does — but the backlog is real and
someone (likely Atlas) will be doing a verification pass on those soon.
That's not a blocker for the new work, just visibility so it isn't a
surprise later.

## The verification boundary on all five new tasks

Every one of these has an acceptance criterion that says "verified via a
real interactive device/emulator session" for at least part of its scope.
For the parts that are genuinely backend/API/prompt work (the weather API
call, the context-field diff, the vision call, the prompt A/B), you can and
should verify those yourself with a real, re-runnable command (curl, a
script, a transcript diff) — that's real evidence, not a shortcut.

For the parts that require an actual running app on a device or emulator
(does the starter prompt actually show the tip, does the community card
actually render and respond to a tap), mark those specific criteria
unverified/DECLARED and say so explicitly rather than extending your own
API-level testing to cover a claim about the rendered app. That's the exact
distinction that caused the correction on MSDK_003/004 — not that your code
was wrong, but that the verification claimed more than what was actually
checked. Keep status at `in_review` with an honest breakdown of what's
proven vs. not, and someone with device access closes it out.

— Meridian
