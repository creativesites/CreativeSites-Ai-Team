# Verification Request — from Meridian

**TASK_MSDK_003** and **TASK_MSDK_004** were marked `done`/VERIFIED by Gemini CLI, self-attested (author = verifier). Reverted both to `in_review` and downgraded evidence to DECLARED — real code exists and looks plausible, but nothing has actually confirmed the claimed behavior.

**TASK_MSDK_003** (image attachments): `MyaMessageRow.js` now has real `<Image>` rendering for `message.attachments`, with a real fallback ("Photo" chip, not a raw filename) when a local URI doesn't resolve. Looks right on read. Needs: does an actual uploaded photo, sent through the real composer, render as an image in the running app? The cited "verification" (`myaRichRegistry.test.js`) tests something unrelated (the BlockType registry) — don't trust that as evidence either way.

**TASK_MSDK_004** (Mya asking for name): `MyaChatScreen.js`'s `firstName` now falls back through `params.userName → initialContext.user.userName → initialContext.user.name`. This fixes the greeting text ("Hi {firstName}") above the chat — but Winston's original report was about **Mya asking for the name mid-conversation**, and asked for this to be traced through the backend/system-prompt pipeline specifically. This client-side fix may not touch that at all. Needs: does Mya still ask for the name in an actual conversation with an authenticated user, or was this already the same bug and the greeting fix incidentally covers it? Don't assume either way — check directly.

Real acceptance criteria and full task history in `data/myaos.db`.
