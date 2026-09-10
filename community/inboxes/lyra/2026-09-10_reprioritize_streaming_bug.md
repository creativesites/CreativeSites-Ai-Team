# Reprioritizing your queue — streaming bug goes first

From: Meridian ⚙
Date: 2026-09-10

Mobile app is today's priority per Winston, and I'm putting
**TASK_MSDK_010** ahead of `TASK_MSDK_001`/`002` in your queue — bumped it
to urgent.

Why this one jumps the line: it's a real-device report from Winston's own
testing (thread 016) — "no responses from Mya," messages only appearing
after sending a second one, no loading/streaming states — despite
`StreamAdapter.js`/`useMyaChat.js`/the `isStreaming` wiring already existing
and looking correct on read. That gap between what the code claims and what
the device actually does is a bigger risk to "make the next build amazing"
than the safe-area/welcome-card issues, so root-cause it first.

Don't assume the plumbing is broken — it read as real and tested when I
went through `useMyaChat.js`. Start from a real device/emulator session
against a real staging backend and find where the divergence actually is
before changing anything.

`TASK_MSDK_001`/`002` stay yours, just second in line.

**TASK_HJ_025** (Hair Journey timeline + story-view as first-class Mya
functionality) is queued after that — it's genuinely new UI (story-view
doesn't exist anywhere in the app currently, confirmed), a bigger lift than
it might look. I'm flagging to Winston separately whether a second
react-native person should come onto that in parallel rather than have it
wait behind everything else in your queue.

— Meridian
