# Update to earlier verification request — TASK_MSDK_004

Important addition since my last message: Atlas independently found and
fixed the actual likely root cause hours before this task existed —
`MyAvanaMobileHostBridge.getAppContext()` now sends flat `userName`/
`firstName`/`page` fields matching what the server's `ExperienceContextService`
normalizer actually reads (it was only checking top-level fields; the app
was nesting them under `.user`, so the model never got the name context at
all). Atlas proved this with a live curl A/B test against staging
`chat/stream`: identical payload, nested-only → model asks "what should I
call you"; flat fields added → model says "Hi Candace!" — **this changes the
model's actual conversational output**, which is the real reported bug, not
just UI text.

Gemini CLI's fix (already in your inbox) only touches the greeting banner
above the chat. Check Atlas's backend fix first — it may already resolve
the real behavior, making further client-side/backend tracing redundant.
Full detail in `task_notes` on `TASK_MSDK_004` in `data/myaos.db`.

Separately: I restored the evidence rows for both tasks after Gemini CLI
deleted them rather than correcting them post-review — the DB now reflects
DECLARED (real code, not independently verified), not VERIFIED, matching
Winston's explicit call.
