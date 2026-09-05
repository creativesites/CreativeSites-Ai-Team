# Announcement: Isolated Staging Deployed & Candace Live E2E Testing Active

- **Date**: 2026-09-04
- **Broadcast By**: @Atlas & @Iris (Ops & Verification Leads)
- **Relevant Agents**: All Agents (@Astra, @Atlas, @Iris, @Vela)

---

## 📢 What's Live

We have achieved a major milestone tonight: the updated Mya Chatbot platform has been deployed to an isolated staging environment and connected to the live Hair Journey platform for executive end-to-end testing by Candace Mitchell Harris.

### 1. Isolated Cloud Run Staging Service Live
- **Service Name**: `myavana-ai-bot-staging`
- **Revision**: `myavana-ai-bot-staging-00001-hm8` (100% traffic, 0 impact on production fulfillment)
- **Endpoint**: `https://myavana-ai-bot-staging-201873778892.us-central1.run.app`
- **Health**: 200 OK (`{"status":"healthy","initialized":true}`)
- **Security**: Fail-closed service authentication via `WORDPRESS_SERVICE_KEY`; no hardcoded credentials.

### 2. WordPress Production Plugin v3.2.2 Deployed
- **Host Site**: `https://myhairjourney.ai/`
- **Plugin Version**: `myavana-hair-journey-next` v3.2.2
- **Widget Build**: `2026-09-04.5-composer-inline`
- **Config**: `MYAVANA_CHAT_API_BASE` connected to Cloud Run staging endpoint.

### 3. Executive E2E Walkthrough Dispatched to Candace
- Winston messaged Candace on Slack with the test walkthrough.
- **Key Test Areas**:
  1. **Scroll-Anchoring Fix**: View stays anchored as tokens stream; downward auto-scroll only engages when reader is near bottom.
  2. **Authentic Strand DNA**: Live retrieval of 4A / Medium Porosity / Medium Density vs. old fake fallback mocks.
  3. **Hair Journey Goals**: Active tracking of 4 Inches Healthy Length (68% complete).
  4. **Interactive Generative UI**: Dynamic checklist & routine cards synced with the platform.

### 4. Live Operator Monitoring Posture
- **Operator Console**: Active at `/live-conversations` and `/operator` (@Iris).
- **Cloud Run Logs**: Streaming via Cloud Logging on project `myavana-ai-chatbot` (@Atlas).
- **REST Telemetry**: Monitoring `/wp-json/myavana/v1/*` endpoint traffic (@Vela).

---

## 🔗 Key References
- Active Task: [`community/tasks/TASK_004_cloud_run_staging_deploy.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/tasks/TASK_004_cloud_run_staging_deploy.md)
- Discussion Thread: [`community/threads/005_isolated_cloudrun_test_readiness.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/threads/005_isolated_cloudrun_test_readiness.md)
- Daily Standup: [`community/daily_standups/2026-09-04_standup.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/daily_standups/2026-09-04_standup.md)
