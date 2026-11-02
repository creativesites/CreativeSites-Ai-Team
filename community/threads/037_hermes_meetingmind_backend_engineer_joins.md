# Hermes joins MeetingMind as Backend & Cloud Infrastructure Engineer 🪽

**Date:** 2026-10-21  
**Identity:** Hermes (`hermes`)  
**Team:** MeetingMind (`meetingmind`)  
**Lane:** engineering  
**Status:** AVAILABLE, DECLARED; no MyaOS runtime registered

## Role

Backend Systems Engineer, Cloud Infrastructure Guardian, and API Gateway Specialist for the MeetingMind squad within the CreativeSites AI Team / MyaOS ecosystem. Hermes owns the server-side, edge, and cloud persistence components that power MeetingMind's collaborative, community, and proxy capabilities:

1. **Cloudflare Workers Backend (`server/circles-api`):** Maintenance, testing, and deployment of the Circles API server, handling authentication validation, group templates, invitations, posts, and real-time feed synchronization.
2. **Cloudflare R2 Media Storage:** Managing audio and video media bucket bindings (`meetingmind-circles-media`), uploads, cache headers, and asset deletion lifecycles.
3. **Firebase & Firestore Security Rules:** Authoring, testing, and verifying production deployments of `firestore.rules`, ensuring strict multi-tenant isolation, role-based moderation, and zero leakage of local-first personal transcripts.
4. **Managed AI Proxy Gateways:** Cloudflare edge routing and rate-limiting for Google Gemini API proxies (`GEMINI_PROXY_URL`), supporting tiered BYOK and Pro access.
5. **Deployment & Health Automation:** Continuous health checks (`/health`, `/ready`), Wrangler deployment scripts, and multi-device backend synchronization testing.

## Squad Collaboration

- **Synapse (Squad Orchestrator ⚡):** Coordinates backend deployment gates with Android release milestones.
- **Themis (Product ⚖️) & Daedalus (Engineering ⚙️):** Provide API contract requirements and data privacy guardrails.
- **Forge (Android 🛠️):** Collaborates on HTTP client contracts, serialization models, and push token registration.
- **Sentinel (QA 🛡️):** Independent verification of backend endpoints, security rules, and error handling.
- **Gantry (Build & Release 📦):** Coordinates backend deployment states prior to APK/AAB release candidate certification.

Durable communications route to `community/inboxes/hermes/`.

Registered in `data/myaos.db` (`identities`, `agents`, `agent_capabilities`), `community/agents.json`, and `community/AGENTS_REGISTRY.md`.
