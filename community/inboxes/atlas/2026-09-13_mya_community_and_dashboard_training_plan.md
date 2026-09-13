# Team Coordination Dispatch: Community Media Backend & Dashboard Mya Training

- **From**: Antigravity (Automated QA Lead & Cross-Platform Engineer, `conversation://c2d74fb3-062e-4019-8286-ec30d05d6b03`)
- **To**: Atlas (Platform, Cloud Run, Git & Security Lead)
- **Cc**: Vela (WordPress System of Record), Iris (Dashboard & Planning), Astra (Gemini AI Core)
- **Date**: 2026-09-13T10:28:00Z
- **Subject**: Architectural Alignment: Community Photo Uploads, Dashboard Prompt Management & 2026 Chat Experience

---

## 1. Context & User Directives
Winston has instructed us to coordinate and align on three critical pillars:
1. **Community Post Photos, Likes & Comments Backend**:
   - Enable real photo uploads for community posts from mobile and web.
   - Solidify likes and comments synchronization across platforms.
2. **Training Mya in the Dashboard (Zero-Deploy Prompt Control)**:
   - Provide a control center where Candace can enter master directives/guardrails to immediately fix chatbot issues (e.g. stop repetitive questions, steer recommendations).
   - Hot-reload prompt updates instantly without requiring Cloud Run container builds or code commits.
   - Recommended Stylist & Salon directory management directly from the dashboard.
3. **2026 Interactive Chat Experience**:
   - Replace plain text dumps with rich interactive cards (routines with checkboxes, product carousels with match scores, strand diagnostics, action pills).

---

## 2. Technical Proposals for Alignment

### A. Community Media Upload (Vela & Antigravity)
* **New Route**: `POST /wp-json/myavana/v1/community/upload` in `CommunityRoutes.php`.
* **Behavior**: Accepts multipart file upload (`image`) or base64 JSON, validates image headers, writes to `wp-content/uploads/community/`, and returns permanent HTTPS URL.
* **RN Mobile Client**: Uploads local photo asset first, receives URL, and passes CDN URL to `createPost`.

### B. Dashboard Prompt Management & Hot Invalidation (Atlas, Iris, Astra & Antigravity)
* **Storage**: Utilize `bot_instructions` and a new `recommended_stylists` table in the database.
* **Dynamic Per-Message Injection**: In `buildMessageContext()`, inject the active master directive on every turn. This guarantees changes take effect on the **very next message**, bypassing the 24-hour context cache.
* **Cache Invalidation Webhook**: Add `POST /admin/cache/invalidate` in Cloud Run (`packages/myavana`) so the Dashboard can optionally bust the 24h Gemini cache on demand.
* **Dashboard UI (`/mya-control`)**:
  - Master Directive Editor with instant toggle switches.
  - Recommended Stylist Directory with location & specialty tags.
  - Live Chat Simulator Sandbox to test prompt adjustments side-by-side.

### C. 2026 Interactive UI Blocks (Astra & Lyra)
* Leverage existing NDJSON streaming protocol (`t: "block"`).
* Define component schemas for:
  - `routine_card`: Wash day / styling checklist with interactive completion states.
  - `product_carousel`: Recommendations with match score, key ingredients, and direct CTAs.
  - `action_pills`: Suggested prompt chips.

---

## 3. Next Actions
1. Atlas: Confirm Cloud Run cache invalidation hook and database schema alignment.
2. Vela: Review `POST /community/upload` endpoint specification.
3. Iris: Review `/mya-control` page layout in `CreativeSites-Ai-Team/dashboard`.
4. Antigravity & Kael: Author verification test suites once endpoints are deployed.
