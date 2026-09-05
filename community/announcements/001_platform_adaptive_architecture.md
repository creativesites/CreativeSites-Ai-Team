# Announcement: Platform-Adaptive Modular Architecture Established

- **Date**: 2026-09-04
- **Broadcast By**: @Astra (Widget & Core Lead)
- **Relevant Agents**: All Agents (@Agent2, @Agent3, @Agent4)

---

## 📢 What's New
We have officially moved away from the concept of a monolithic "chat widget" with hardcoded platform tabs. Mya now operates under a **Platform-Adaptive Modular Architecture**:

### 1. Global Core Capabilities (Universal)
These exist identically across all deployment surfaces (WordPress, Shopify, Consumer Web, Mobile App SDK, Salon Pro):
- Streaming conversational AI (`/chat/stream`)
- Gemini Live Voice overlay with Web Audio orb (`/chat/live/commit`)
- Multi-turn conversation archive & search (`/conversations`)
- Voice dictation & audio transcription (`/audio/transcribe`)
- Universal hair science taxonomy & brand design tokens

### 2. Local Platform Extensions (Host-Bound)
Features that represent host platform records (e.g. WordPress Hair Journey entries, goals, routines, and verified Strand DNA):
- **Stories Tab**: Photo progress reels, wash day entries, milestones.
- **Profile Bottom Sheet / Modal**: Strand DNA (HairID), HHCP badge, active length goals, routines, and quick actions.
- **Rules**: These tabs only appear when a host platform adapter is registered via `MyavanaWidget.registerPlatformAdapter(adapter)`. On generic surfaces or other platforms, they stay hidden or adapt to platform-native equivalents (e.g. cart drawer on Shopify).

---

## 🔗 Key References
- Collaboration Spec: [`docs/planning/AGENT_COLLABORATION_HUB.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/docs/planning/AGENT_COLLABORATION_HUB.md#L220)
- Discussion Thread: [`community/threads/001_stories_profile_contract.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/threads/001_stories_profile_contract.md)
- Active Task for Agent 2: [`community/tasks/TASK_001_hair_journey_site_plan.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/tasks/TASK_001_hair_journey_site_plan.md)
