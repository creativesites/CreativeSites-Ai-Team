# Task: Isolated Cloud Run Deployment & Candace End-to-End Verification

- **Task ID**: TASK-004
- **Assignee**: [@Astra ✦, @Atlas ⏣, @Vela ✧, @Iris 👁]
- **Assigned By**: Team Consensus (Thread 005)
- **Status**: CANDACE_TESTING_ACTIVE
- **Priority**: URGENT
- **Target Completion Date**: 2026-09-04
- **Related Files**:
  - [wordPressHairJourneyProvider.js](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/core/src/hairJourney/wordPressHairJourneyProvider.js)
  - [hairJourneyService.js](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/core/src/hairJourney/hairJourneyService.js)
  - [Dockerfile](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/Dockerfile)
  - [005_cloudrun_isolated_deploy_and_candace_e2e.md](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/threads/005_cloudrun_isolated_deploy_and_candace_e2e.md)

---

## 🎯 Goal & Description
Safely deploy an isolated Cloud Run staging service (`myavana-ai-bot-mya-test`), connect the Mya widget on WordPress to it, and conduct Candace's first authentic end-to-end verification test without fabricated fallbacks.

---

## 📋 Acceptance Criteria & Workstreams

### Workstream 1: Purge Fabricated Fallbacks (Astra ✦)
- [x] In `WordPressHairJourneyProvider`, eliminate all hardcoded fallback returns (no fake 4C/Coily, no fake 4-inch goal, no fake wash day routine).
- [x] If `_request()` fails or the backend is unreachable, throw or return `{ available: false, error: ... }`.
- [x] Ensure AI tools (`getProfile`, `getTodayData`, `getGoals`, `getRoutines`) return an explicit unavailable status when WP is unreachable.
- [x] Update unit tests in `hairJourneyService.test.js` to verify honest unavailable handling (9/9 passed).

### Workstream 2: Cloud Run Monorepo Dockerfile (Atlas ⏣)
- [x] Author a modern root `Dockerfile` that packages `packages/core`, `chat-protocol`, and `packages/myavana`.
- [x] Support production environment variables: `PORT=8080`, `NODE_ENV=production`, `WORDPRESS_API_BASE`, `WORDPRESS_SERVICE_KEY`, `GENKIT_API_KEY`, etc.
- [x] Create `scripts/deploy-staging.sh` with fail-closed security for `WORDPRESS_SERVICE_KEY`.

### Workstream 3: WordPress Public Reachability & Admin Setting (Vela ✧)
- [x] Target confirmed by Winston: `https://myhairjourney.ai` (public, HTTP/2 200 OK via Cloudflare).
- [x] Plugin `Assets.php` and `mya-widget-embed.js` support `MYAVANA_CHAT_API_BASE` and `myavana_next_chat_api_base`.
- [x] Winston deployed updated plugin (v3.2.2) with widget build `2026-09-04.5-composer-inline` to `https://myhairjourney.ai` and verified fail-closed `Permissions.php`.

### Workstream 4: Candace E2E Test Protocol & Telemetry (Iris 👁 & Vela ✧)
- [x] Ground-truth test script drafted matching seeded data in `scripts/seed-candace-demo.php`:
  - Profile: 4A, Medium Porosity, Medium Density, 10.5"
  - Goals: 4 Inches Healthy Length (68% progress, target 14.5" by 2026-12-15)
- [x] Live Gemini 2.5 Flash quota verified with tool calling on GCP project key.
- [x] Winston dispatched Slack test instructions to Candace covering scroll fix, live streaming, Hair Journey profile sync, and interactive cards.
- [ ] Monitor live session in Operator Console (`/live-conversations`) as Candace tests.

---

## 🔄 Progress Log
- **2026-09-04 20:23 - @Vela**: Opened Thread 005 identifying P0 network and silent fallback blockers.
- **2026-09-04 20:25 - Team Consensus**: Unanimous vote to gate Cloud Run deployment until Gate 1 (elimination of fake fallbacks + network tunnel) is complete.
- **2026-09-04 20:26 - @Astra & @Atlas**: Began Workstreams 1 & 2 immediately.
- **2026-09-04 20:30 - @Astra**: Purged all 9 fabricated fallbacks from `WordPressHairJourneyProvider` and `hairJourneyService`. Ran jest suite: 9/9 tests passed.
- **2026-09-04 20:33 - @Atlas**: Built root `Dockerfile`, `.dockerignore`, and `scripts/deploy-staging.sh`.
- **2026-09-04 20:41 - @Winston**: Confirmed test target is live public site: `https://myhairjourney.ai`.
- **2026-09-04 20:50 - @Atlas**: Verified live Gemini project key (`AIzaSyBL...`) with tool-calling `getProfile` (200 OK). Network and quota blockers fully cleared.
- **2026-09-04 21:38 - @Winston**: Logged into `gcloud` as `winston@cvmworldwide.com` with active project `myavana-ai-chatbot`.
- **2026-09-04 21:50 - @Atlas & @Astra**: Cloud Run staging service `myavana-ai-bot-staging` successfully deployed in `us-central1`. Service URL: `https://myavana-ai-bot-staging-201873778892.us-central1.run.app`. Live healthcheck verified (`{"status":"healthy","uptime":...,"initialized":true}`).
- **2026-09-04 22:00 - @Astra & @Iris**: Resolved `chat-protocol` npm breakout. Self-bundled `chatProtocol` into `packages/myavana` and `packages/core`. Replaced relative breakout imports with local bundled imports.
- **2026-09-04 22:15 - @Atlas**: Restored strict exact pins (`"myavana-bot-test-core": "2.4.0"`, `"myavana-ai-bot-test": "2.0.0"`). Eradicated all `^` carets to eliminate drift risk.
- **2026-09-04 22:20 - @Iris**: Ran Master Verification Suite (Phases 0-3), Streaming NDJSON tests, and core unit test suites (23/23 tests green).
- **2026-09-04 22:25 - @Winston**: Deployed plugin v3.2.2 to `https://myhairjourney.ai/` and messaged Candace on Slack with the end-to-end testing script. Status: **CANDACE_TESTING_ACTIVE**.

