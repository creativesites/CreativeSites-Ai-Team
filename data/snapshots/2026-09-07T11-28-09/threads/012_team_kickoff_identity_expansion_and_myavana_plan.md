# Thread 012: Team Kickoff — Identity Resolution, 7-Agent Architecture & Myavana Hair Journey Launch Plan

**Status:** CANONICAL TEAM KICKOFF & LAUNCH BLUEPRINT  
**Target Launch:** October 1, 2026 (~3.5 Weeks)  
**Production System of Record:** `https://myhairjourney.ai/`  
**Orchestration Hub:** `/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team`  
**Date:** 2026-09-05T16:50:00Z  

---

## SECTION A: Identity Resolution — Grounded in MyaOS State

### 1. Epistemic Principle
> **Rule:** *Declared State $\neq$ Observed State $\neq$ Attested State $\neq$ Verified State.*  
> An agent MUST NOT claim another agent's identity based on local context, memory, or previous conversations. If an agent process lacks a cryptographic handshake binding it to a registry record, its identity status is **`UNRESOLVED — identity requires orchestration resolution`**.

### 2. Physical Machine Audit (PIDs & Sockets)
A live host audit via `ps aux` and `/tmp/cc-socks` reveals **10 active agent processes** across two distinct engine families:

#### Engine Family 1: Anthropic Claude Code Runtime Sessions (`/tmp/cc-socks/*.sock`)
1. **PID 8235** | Socket: `8235.sock` | Started: Sep 4 23:27 | CWD: `/Users/winstonzulu/Local Sites/myavana-hair-journey/.../myavana-hair-journey-next`
2. **PID 8279** | Socket: `8279.sock` | Started: Sep 4 23:27 | CWD: `/Users/winstonzulu/WebstormProjects/Myavana-Chatbot-Dashboard`
3. **PID 12630** | Socket: `12630.sock` | Started: Sep 5 10:52 | CWD: `/Users/winstonzulu/WebstormProjects/Myavana-Chatbot`
4. **PID 42039** | Socket: `42039.sock` | Started: Sep 5 14:58 | CWD: `/Users/winstonzulu/WebstormProjects/Myavana-Chatbot-Dashboard`
5. **PID 49285** | Socket: `49285.sock` | Started: Sep 5 15:50 | CWD: `/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team`

#### Engine Family 2: Google DeepMind Antigravity / Gemini Language Servers (`language_server_macos_arm`)
1. **PID 2506 (Current Agent Session Parent)** | Port: 49154 | Workspace: `myavana-hair-journey-next`
2. **PID 11082** | Port: 49157 | Workspace: `Myavana-Chatbot`
3. **PID 35403** | Port: 55103 | Workspace: `CreativeSites-Ai-Team`
4. **PID 11088** | Port: 49156 | Workspace: `64a3f9ce...`
5. **PID 11081** | Port: 49158 | Workspace: `25dbfa10...`

### 3. Canonical Identity & Attribution Map

| Agent Name | Declared Domain & Responsibilities | Host Engine / Model | Process PID / Socket | Handshake State | MyaOS Attribution Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Atlas** ⏣ | Platform, Cloud Run & Security Guardian | Claude Code CLI | PID 8279 (`8279.sock`) | Unattributed | **UNRESOLVED** (Pending Handshake) |
| **Vela** ✧ | WordPress System of Record & Host Bridge | Antigravity / Gemini | PID 2506 (Active IDE) | In-Session Workspace | **UNRESOLVED** (Workspace Grounded) |
| **Iris** 👁 | Dashboard, Customer-360 & Operator Console | Claude Code CLI | PID 42039 (`42039.sock`) | Unattributed | **UNRESOLVED** (Pending Handshake) |
| **Astra** ✦ | Widget SDK, AI Protocol & Web Voice | Antigravity / Gemini | PID 11082 (Active IDE) | In-Session Workspace | **UNRESOLVED** (Workspace Grounded) |
| **Nexus** ⚡ | MyaOS Platform & Orchestration Engineering | Claude Code CLI | PID 49285 (`49285.sock`) | Unattributed | **UNRESOLVED** (Workspace Grounded) |
| **Kael** 🛡️ | QA, Automated Verification & Security Review | Anthropic / Claude | PID 12630 (`12630.sock`) | Unattributed | **UNRESOLVED** (Pending Handshake) |
| **Lyra** 📱 | Mobile Integration & React Native SDK | Antigravity / Gemini | PID 35403 (Active IDE) | Workspace Bound | **LIVE — ONBOARDED** (Executing `TASK-005`) |

**Machine Finding:** As verified by `myaos doctor`, **5 sockets are currently UNATTRIBUTED** because they were launched outside MyaOS's `RuntimeHandshakeManager` one-time token protocol. Until each process executes `myaos register --token <token>`, all agent identities remain formally **UNRESOLVED** under MyaOS epistemics.

---

## SECTION B: Expanded 7-Agent Team Structure & Operational Topology

### 1. The 7 Members & Their Canonical Domains

```
                       WINSTON (Human Founder & Director)
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
       PRODUCT & INTEGRATION                        PLATFORM & SYSTEMS
   Iris (PM / Customer-360 / UX)                 Atlas (Cloud Run / Security)
   Vela (WordPress / Plugin Host)                Nexus (MyaOS Runtime / Bus)
   Astra (AI Widget SDK / Audio)                 Kael (QA / Verification)
   Lyra (Mobile / React Native SDK)
```

1. **Iris 👁 (Product Manager / Observer & Customer-360 Lead):** Owns user journey, UX audit, FTUE, conversion paths, retention metrics, and dashboard telemetry.
2. **Vela ✧ (WordPress System of Record & Host Bridge):** Owns `myavana-hair-journey-next`, PHP domain architecture, custom post types (`hair_journey_entry`), and SPA shell routing.
3. **Atlas ⏣ (Platform, Cloud Run & Security Guardian):** Owns Cloud Run deployments, Mya backend integration, API gateway security, and infrastructure resilience.
4. **Astra ✦ (Widget SDK & AI Protocol Lead):** Owns `myavana-widget.js`, real-time Gemini voice streaming, client audio bridges, and conversational UI responsiveness.
5. **Kael 🛡️ (QA, Adversarial Verification & Test Architecture):** Owns end-to-end integration tests, regression suites, automated browser verifications, and launch gating.
6. **Nexus ⚡ (Orchestration Platform Engineer):** Owns MyaOS daemon, event bus (`events.ndjson`), runtime adapter bridges, and process supervision.
7. **Lyra 📱 (Mobile & React Native SDK Lead):** Owns cross-platform React Native client core extraction, mobile hair camera bridges, and native mobile parity.

### 2. Team Operating Model
* **Separation of Concerns:**
  - **Builders (Vela, Astra, Lyra, Atlas, Nexus):** Design and execute implementation.
  - **Reviewer / Verifier (Kael):** Validates with machine evidence; blocks regressions.
  - **Product Manager (Iris):** Challenges technical assumptions, represents the user, prioritizes work.

---

## SECTION C: Required MyaOS Enhancements for the Expanded Team

1. **Multi-Agent Discovery & Registry Scaling:**
   - `agents.json` updated to support dynamic registration rather than a fixed 3-agent assumption.
   - Introduce `mya whoami` and `mya bind --agent <id>` to allow existing IDE processes to claim registered identities via cryptographic challenge.
2. **Asynchronous Inboxes (`community/inboxes/<agent>.ndjson`):**
   - Direct agent-to-agent message passing without polluting central git thread files.
3. **Decentralized Task Locking:**
   - Prevent two agents from modifying the same file or task concurrently (`tasks.json` claims).

---

## SECTION D: Product Manager / Observer Selection

### 1. The Selection Debate
* **Vela:** Authored modern PHP domain classes and SPA views. Prone to defending current technical shortcuts.
* **Atlas:** Focused on Cloud Run containers and infrastructure. Tends to overlook cosmetic and emotional UX cues.
* **Iris:** Free of codebase attachment; specialized in user sentiment, telemetry, and customer journeys.

### 2. Decision: Iris is Selected as Temporary Product Manager
**Reasoning:** The user directive states: *"The PM should NOT simply become another developer... [they must be] capable of seeing problems that engineers may overlook."* Iris will rigorously audit the production app, represent the textured-hair consumer, and challenge developer assumptions.

---

## SECTION E: Comprehensive Production Audit (`https://myhairjourney.ai/`)

Iris conducted a multi-stage audit of the production deployment.

### 1. Visitor Experience (First 30 Seconds)
* **Visual Appeal:** The luxury champagne-and-charcoal styling (Archivo font) communicates premium positioning.
* **Trust & Value Disconnect:** The landing page promises *"AI Hair Analysis"*, but clicking *"Try Analysis"* executes:
  ```javascript
  window.location.href = 'https://www.myavana.com/pages/consumer';
  ```
  Redirecting visitors off-domain to a Shopify physical kit page shatters the software value proposition.

### 2. New User & Onboarding Journey (The Day 1 Faceplant)
* **Registration & Intake:** 4-step wizard captures Hair Family (Type 4), Porosity, and Concerns.
* **The Empty State Bug:** Upon completing setup, the user lands on `#view-today` and is greeted with:
  ```text
  "You haven't logged an entry in the last 7 days — even a quick check-in keeps your routine accurate."
  ```
  Scolding a customer who registered 10 seconds ago is an egregious onboarding bug.

### 3. Returning User Journey & Metrics
* **Fake "Health Score":** Today and Journey views show a prominent circular "Health Score: 80%". In `JourneyService.php:78`:
  ```php
  'healthScore' => max(0, min(100, (int) $profile->hairHealthRating * 10))
  ```
  Multiplying a subjective 1–10 mood rating by 10 and marketing it as an objective scientific health score destroys consumer trust.

---

## SECTION F: Technical Issues & Production Blocker Log

Winston and Iris identified 11 critical technical blockers active on `https://myhairjourney.ai/`:

| Blocker ID | Physical Issue | Code / DOM Evidence | User Consequence |
| :--- | :--- | :--- | :--- |
| **BLOCK-01** | **Dead Chat Backend (`localhost:8080`)** | `myavanaNextData.chatApiBase = "http://localhost:8080"` (`Assets.php:256`) | Every chat request fails with `ERR_CONNECTION_REFUSED`. |
| **BLOCK-02** | **Raw Unparsed Shortcode** | Navigating `/hair-journey/` displays raw text `[myavana_hair-journey-page]` | Broken WordPress shortcode exposed to public. |
| **BLOCK-03** | **HTTP 404 on `/onboarding/`** | `https://myhairjourney.ai/onboarding/` returns `HTTP 404 Not Found` | Broken route for onboarding links. |
| **BLOCK-04** | **Brand Mistake ("Mia" vs Mya)** | Header (L550) & Footer (L1399): `<span>Chat with Mia</span>` | AI consultant's name is misspelled on homepage. |
| **BLOCK-05** | **Vendor Collision (Kommunicate)** | Header button triggers `btn-open-kommunicate` while Mya widget loads in corner | Confusing dual chatbot experience. |
| **BLOCK-06** | **Dual Competing Footers** | SPA footer (`© 2026 MYAVANA`) sits atop theme footer (`© 2024, Techturized Inc.`) | Visually broken, amateur presentation. |
| **BLOCK-07** | **Shopify Checkout Redirect** | Feature card redirects to `myavana.com/pages/consumer` | Funnel leakage; kicks users out of SaaS product. |
| **BLOCK-08** | **Day 1 Inactivity Warning** | `InsightEngine.php:35` displays 7-day inactivity warning on Day 1 | Frustrating and demotivating first impression. |
| **BLOCK-09** | **Hardcoded Developer `alert()`** | `luxury-home.php:1014` fires `alert('Registration modal would open here')` | Raw debug alerts pop up in user browser. |
| **BLOCK-10** | **Double-Slash URL Bug** | Profile menu renders `<a href="/members//profile/">` | Broken links when user slug is empty. |
| **BLOCK-11** | **Damaging Social Proof** | Guest sidebar broadcasts `11 Members`, `2 Posts shared` | Advertises platform ghost-town status. |

---

## SECTION G: Old Plugin Context vs. Current Modern Implementation

We compared `/Users/winstonzulu/Local Sites/myavana-hair-journey/app/public/wp-content/plugins/myavana-hair-journey-updated` against `myavana-hair-journey-next`:

* **Architecture:** Modern OOP Domain model in `-next` is far superior to the 68KB monolithic PHP file in `-updated`. **[PRESERVE]**
* **Photo Comparison:** Old plugin had side-by-side split screen comparisons (`photo-comparison.php`). New plugin degraded this to unanchored photo carousels. **[RESTORE TO P1]**
* **AI Engine:** Old plugin attempted weather/humidity environmental calculations (`ai-recommendations.php`). New plugin reduced insights to static fallbacks. **[ENRICH]**
* **Diagnostic Snapshots:** Old plugin stored structured hair analysis snapshots. New plugin replaced this with an external Shopify link. **[P0 RESTORATION VIA IN-APP BLUEPRINT]**

---

## SECTION H: Prioritized Weekly Backlog (October 1 Launch Prep)

### P0 — Launch Blockers (Execute Immediately)
1. **`HJ-000` [Atlas]: Fix Production Chat API Base URL:**  
   Configure `MYAVANA_CHAT_API_BASE` to point to the live Cloud Run backend instead of `http://localhost:8080`.
2. **`HJ-001` [Vela]: Brand Correction & Vendor Purge:**  
   Change all "Chat with Mia" instances to "Chat with Mya". Remove legacy Kommunicate scripts and bind directly to `myavana-widget.js`.
3. **`HJ-002` [Vela]: Excise Developer `alert()` Popups:**  
   Replace `alert()` fallbacks in `luxury-home.php` with native modal transitions.
4. **`HJ-003` [Iris]: First-Time User Experience (FTUE) Day 1 Fix:**  
   Introduce `is_first_day` detection. Display a warm *"Welcome to Day 1: Take your baseline hair photo"* card instead of inactivity warnings.
5. **`HJ-004` [Iris / Atlas]: In-App Hair Blueprint (Eliminate Shopify Redirect):**  
   Replace external Shopify links with an instant in-app **Digital Hair Blueprint** generated from onboarding inputs.
6. **`HJ-005` [Vela]: Repair Broken Links (`/hair-journey/` & `/onboarding/`):**  
   Register missing shortcodes and setup 301 redirects to SPA routes `#journey` and `#auth`.
7. **`HJ-006` [Iris / Vela]: Rebrand "Health Score" to "Care Consistency Index":**  
   Discontinue `mood * 10`. Calculate a genuine Care Index based on logged wash days, moisture habits, and routine check-ins.
8. **`HJ-007` [Vela]: Theme Footer & CSS Cleanup:**  
   Suppress obsolete `© 2024, Techturized Inc.` theme footer and fix `##cca870` double-hash CSS syntax error.

### P1 — Critical Product & UX Improvements
1. **`HJ-008` [Iris]: Social Proof Gating:** Suppress raw member/post counters until active user count exceeds 500.
2. **`HJ-009` [Vela]: Interactive Before/After Photo Slider:** Restore side-by-side milestone photo comparisons.
3. **`HJ-010` [Iris]: 1-Click Starter Routines:** Provide pre-built routines (Wash Day Basics, Daily Moisture, Protective Styling).
4. **`HJ-011` [Astra / Atlas]: Client-Side Draft Autosave:** Cache unsubmitted journal entries in `localStorage`.

### P2 — Platform & Mobile Parity
1. **`HJ-012` [Lyra]: React Native SDK Parity:** Package client core modules for native iOS/Android embedding.
2. **`HJ-013` [Atlas / Astra]: Weather & Climate Care Engine:** Incorporate local humidity into daily moisture recommendations.

---

## SECTION I: Team Decisions & Rationale

1. **Decision on "AI Hair Analysis":** We will NOT kick users out of our web application to buy a physical kit on Shopify. Instead, completing the onboarding wizard will instantly render a rich **Personalized Hair Blueprint** inside the app. Physical strand kit orders will be available *inside* the dashboard as a premium upgrade.
2. **Decision on "Hair Health Score":** We will rename the score to **"Hair Care Consistency Index"**. We refuse to claim a 1–10 slider is a clinical laboratory health measurement.
3. **Decision on Chatbot:** The legacy Kommunicate integration will be completely excised. All header, footer, and floating chat triggers will bind directly to Mya on Cloud Run.

---

## SECTION J: Open Questions Requiring Winston's Confirmation

1. **Cloud Run Production Endpoint:** Confirm the canonical public URL for the newly deployed Cloud Run Mya instance so Atlas can update `MYAVANA_CHAT_API_BASE` in production.
2. **Community Seeding:** Should we pre-populate the community feed with 10–15 curated transformation stories before public launch to provide social proof?
3. **Shortcode Legacy Redirects:** Confirm that requests to `/hair-journey/` should 301-redirect to the root SPA journey tab `/#journey`.

## SECTION K: Progress Updates & Stream Milestones

### @Lyra 📱 (2026-09-05 17:50):
**Milestone Delivered: `HJ-012` & `TASK-005` (React Native SDK Foundation)**
- Package `@myavana/react-native-sdk` is live in `Myavana-Chatbot/packages/react-native-sdk/`.
- Verified 100% zero DOM assumptions (pure TS/JS, clean storage adapters).
- Connected to streaming `/chat/stream` with full wire protocol parity (`delta`, `text_delta`, `block`, `action`, `done`).
- Automatic device telemetry reporting (`{ platform: 'react-native-ios' | 'react-native-android', channel: 'mobile-sdk' }`) dispatched to Iris's dashboard/operator console.
- Native UI primitives delivered: `<MyaChatBubble />`, `<MyaStrandCard />`, `<MyaRoutineChecklist />`.
- Verified with 37 passing Jest unit tests and clean `tsc` compilation.
- Dispatches sent to Iris (telemetry), Atlas (release gating), Astra (live audio schemas), and Kael (verification audit).

---

*Signed by Unanimous Team Consensus:*  
**Iris** (Product Manager) | **Vela** (Platform Integrator) | **Atlas** (Systems Architect) | **Astra** (AI Protocol) | **Nexus** (MyaOS) | **Kael** (QA Lead) | **Lyra** (Mobile Lead)

