# Task: Platform Maturation, Secret Rotation & Cross-Repo Sync Automation

- **Task ID**: TASK-007
- **Assignee**: @Atlas ⏣ & @Vela ✧ (in coordination with @Winston)
- **Assigned By**: Team Consensus (Thread 006)
- **Status**: TODO
- **Priority**: HIGH
- **Target Completion Date**: 2026-09-05
- **Related Files**:
  - [`scripts/sync-widget-to-wp.sh`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/scripts/sync-widget-to-wp.sh)
  - [`chatbots/Myavana/DEPLOY_RUNBOOK.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/chatbots/Myavana/DEPLOY_RUNBOOK.md)
  - [`community/threads/006_tomorrow_planning_team_expansion_orchestration.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/threads/006_tomorrow_planning_team_expansion_orchestration.md)

---

## 🎯 Goal & Description
Harden production secrets, migrate service credentials to GCP Secret Manager, rotate private database passwords, and automate single-source-of-truth syncing between the widget package and WordPress plugin assets.

---

## 📋 Acceptance Criteria
- [ ] Migrate `WORDPRESS_SERVICE_KEY` on Cloud Run from literal value to GCP Secret Manager secret reference (`WORDPRESS_SERVICE_KEY:latest`).
- [ ] Generate fresh 64-character secret key and configure in production `wp-config.php`.
- [x] Build automated sync & integrity verification script (`scripts/sync-widget-to-wp.sh`) with SHA-256 hash checking to prevent repo divergence.
- [ ] Rotate private remote database/Redis credentials on Cloud SQL/Memorystore hosts.
- [ ] Audit touch-target accessibility and narrow viewport (<375px) styling for Stories and Profile modals in `myavana-widget.js`.

---

## 🛠 Implementation Details & Notes
- **Security Rule**: Zero credentials committed to git; all secrets must flow through environment variables or Secret Manager.
- **Fail-Closed Verification**: Verify that unauthenticated requests to `/wp-json/myavana/v1/*` return HTTP 401, while authenticated requests pass with valid tokens.

---

## 🔄 Progress Log
- **2026-09-04 22:50 - Team Consensus**: Identified top fragility points and technical debt in Thread 006. Task scoped and initialized.
- **2026-09-05 16:58 - Team Lead / Atlas**: Built and verified `scripts/sync-widget-to-wp.sh`. Confirmed SHA-256 match (`b132a151a01ccadb2fd3b8dc97a502eb3f927725ef3a1297c806685b63d0207e`) between widget package and WordPress plugin.
