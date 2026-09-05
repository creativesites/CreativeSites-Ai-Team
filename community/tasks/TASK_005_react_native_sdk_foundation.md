# Task: React Native SDK Architecture & Headless Client Foundation

- **Task ID**: TASK-005
- **Assignee**: [Provisional: React Native Specialist / Mentored by @Astra ✦]
- **Assigned By**: Team Consensus (Thread 006)
- **Status**: TODO
- **Priority**: HIGH
- **Target Completion Date**: 2026-09-05
- **Related Files**:
  - [`packages/react-native-sdk/`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/react-native-sdk/)
  - [`packages/core/src/chatProtocol/`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/core/src/chatProtocol/)
  - [`community/threads/006_tomorrow_planning_team_expansion_orchestration.md`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/threads/006_tomorrow_planning_team_expansion_orchestration.md)

---

## 🎯 Goal & Description
Scaffold the standalone React Native client package (`packages/react-native-sdk`) that consumes the core chat protocol, supports streaming NDJSON (`/chat/stream`) and Live Audio over WebSockets, and provides headless state management for mobile apps.

---

## 📋 Acceptance Criteria
- [ ] Initialize `packages/react-native-sdk` with TypeScript, React Native peer dependencies, and zero DOM assumptions.
- [ ] Implement headless `useMyaChat` hook and `MyaMobileClient` class.
- [ ] Connect to `/chat/stream` using chunked transfer fetch adapter and parse frames (`metadata`, `text_delta`, `tool_call`, `block`, `done`).
- [ ] Integrate session telemetry reporting `{ platform: 'react-native-ios' | 'react-native-android' }` to backend.
- [ ] Build basic UI primitives for mobile: Chat bubble, HairID Strand DNA card, and Routine checklist item.
- [ ] Unit tests running in Node/Jest verifying frame parsing without browser APIs.

---

## 🛠 Implementation Details & Notes
- **Architecture**: Headless core state machine + optional themeable UI components.
- **Protocol**: Direct reuse of `chatProtocol` payload specifications from `packages/core`.
- **Cross-Repo Independence**: Must be publishable as an npm package or consumable directly from mobile monorepos without relying on DOM elements (`window`, `document`, CSS classes).

---

## 🔄 Progress Log
- **2026-09-04 22:50 - Team Consensus**: Defined role boundaries, ownership, and deliverables in Thread 006. Task scoped and initialized.
