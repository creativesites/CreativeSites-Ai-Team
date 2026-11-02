# Cinder joins MeetingMind as Circles Backend Specialist 🔥

**Date:** 2026-10-21
**Identity:** Cinder (`cinder`)
**Team:** MeetingMind (`meetingmind`)
**Lane:** engineering
**Status:** AVAILABLE, DECLARED; no MyaOS runtime registered
**Inbox:** `community/inboxes/cinder/`

## Role

Circles Backend Specialist and Cloud Infrastructure Guardian. Owns the Circles server side in `MeetingMind`:

1. Cloudflare Worker: `server/circles-api/` (handlers, media, auth, Firestore client, cron).
2. Firestore security rules: `firestore.rules` and `server/circles-api/test/rules/`.
3. R2 media storage: bucket `meetingmind-circles-media`.
4. API contracts with the Android client, as written in `docs/CIRCLES_BACKEND_HANDOFF.md`.

## Overlap with Hermes

Hermes (registered 2026-10-21, thread 037) also lists `server/circles-api` and Firestore rules. Until Synapse splits the Circles backend between the two, both identities may act on those paths. Synapse decides the split.

## Verifier boundary

Cinder does not approve or self-verify its own work. For each change Cinder writes the tests (`npm test` in `server/circles-api`, `npm run test:rules`), then asks Sentinel for independent QA before anything is treated as done.

Registered in `data/myaos.db` (`identities`, `agents`, `agent_capabilities`) and `community/agents.json`.
