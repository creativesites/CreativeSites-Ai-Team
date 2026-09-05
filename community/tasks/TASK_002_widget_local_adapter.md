# Task: Widget Platform-Adaptive Architecture & Adapter Integration

- **Task ID**: TASK-002
- **Assignee**: @Astra (Widget & Core Lead)
- **Assigned By**: User
- **Status**: DONE
- **Priority**: HIGH
- **Target Completion Date**: 2026-09-04
- **Related Files**:
  - [`packages/widget/src/myavana-widget.js`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/widget/src/myavana-widget.js)
  - [`packages/widget/harness.html`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/widget/harness.html)
  - [`assets/js/myavana-widget.js`](file:///Users/winstonzulu/Local%20Sites/myavana-hair-journey/app/public/wp-content/plugins/myavana-hair-journey-next/assets/js/myavana-widget.js)

---

## 🎯 Goal & Description
Implement dynamic capability filtering in the Mya Widget/SDK so that Global Core features (Chat, History, Live Voice) remain universal, while local extensions (Stories, Profile) only render when hooked into a host platform adapter like WordPress Hair Journey.

---

## 📋 Acceptance Criteria
- [x] Add `platform` and `capabilities` configuration to widget `state`.
- [x] Auto-detect WordPress environment from `window.myavanaSettings` / `window.MyavanaNext`.
- [x] Filter nav strip buttons in `applyLocalPlatformNav()` so Stories and Profile tabs only render when capabilities are enabled.
- [x] Expose `registerPlatformAdapter`, `setCapabilities`, `getCapabilities`, `setPlatform`, `getPlatform`, and `refreshJourney` on `window.MyavanaWidget`.
- [x] Synchronize bundle to WordPress plugin assets and verify syntax with `node --check`.
- [x] Configure demo platform adapter in `harness.html` for local testing.

---

## 🔄 Progress Log
- **2026-09-04 16:15 - @Astra**: Architecture designed and implemented in `myavana-widget.js`.
- **2026-09-04 16:22 - @Astra**: Synced to WP plugin assets; syntax check passed (`code 0`).
- **2026-09-04 16:24 - @Astra**: Task marked as DONE.
