# Thread 013: Native Mobile App Architecture & SDK Integration Plan

**Status:** CANONICAL ARCHITECTURAL BLUEPRINT & SPRINT ROADMAP  
**Target Application:** `MyAvana_FrontEnd_RN` (`/Users/winstonzulu/WebstormProjects/MyAvana_FrontEnd_RN`)  
**Target SDK:** `@myavana/react-native-sdk` (`/Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/react-native-sdk`)  
**Authors:** Iris (Product Manager), Lyra (Mobile SDK Architect), Astra (AI Protocol & Voice Lead), Atlas (Platform & Cloud Run Guardian), Vela (Host Bridge & System of Record), Kael (Lead Verifier)  
**Date:** 2026-09-06  

---

## 1. Executive Summary & Design Philosophy

Winston's directive is unambiguous:
> *"I want the whole team to plan how to make our SDK integrate properly with our Myavana mobile app. Remember each integration must natively be implemented into the integration like we did with the hair journey site widget."*

### What We Did With the Hair Journey Site Widget (The Gold Standard)
On the web platform (`https://myhairjourney.ai`), Mya is **not** an isolated, third-party iframe floating blindly over a website. It is an ambient intelligence layer deeply unified with the host:
1. **Screen & Route Awareness:** Mya continuously listens to route changes (`#today`, `#journey`, `#routine`, `#profile`) and automatically adapts its conversational tone and context suggestions to the active screen.
2. **Local Platform Bridge:** Stories, Profile, Goals, and Strand Snapshots are served directly from the host application's authenticated REST APIs. Mya renders them in-line because the host registers local providers.
3. **Bi-Directional Action Execution:** When Mya recommends checking off a wash routine, adding a goal, or logging a photo, tapping the card does not reload the page—it calls native host methods and updates the SPA store.

### The Problem With the Legacy Mobile App (`MyAvana_FrontEnd_RN`)
Codebase inspection of `MyAvana_FrontEnd_RN` reveals that the legacy chat integration was an emergency shortcut:
- `src/containers/webviewchat.js` loads `https://widget.kommunicate.io/chat?appId=...` inside a `react-native-webview`.
- It suffers from 12-second load timeouts, white flashes, keyboard overlay glitches, fake User-Agent injection (`SAFARI_UA`), and zero bidirectional awareness of what the user is doing in the app.
- When a user asks about their hair type on the legacy chat screen, the bot has no access to the user's local Redux store or camera.

### The Solution: 100% Native Mobile Integration
We will completely excise the legacy `WebView` and embed `@myavana/react-native-sdk` directly into `MyAvana_FrontEnd_RN` using native React Native components, Redux state injection, React Navigation route tracking, and native device hardware bridges (Microphone, Speaker, Camera).

---

## 2. Architecture & Integration Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MYAVANA MOBILE APP (React Native)                    │
│                                                                        │
│   ┌───────────────────────────┐      ┌─────────────────────────────┐   │
│   │    React Navigation       │      │      Redux Store (User,     │   │
│   │  (Dashboard, HairProfile, │      │     Strand DNA, Regimens)   │   │
│   │   HairDiary, Camera...)   │      └──────────────┬──────────────┘   │
│   └─────────────┬─────────────┘                     │                  │
│                 │ (Route changes)                   │ (User Profile)   │
│                 ▼                                   ▼                  │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │           MyaMobileBridge (Native Host Adapter)                │   │
│   │  - syncRoute(currentScreen)                                    │   │
│   │  - getAuthenticatedContext()                                   │   │
│   │  - handleAppAction(actionPayload)                              │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────▼────────────────────────────────┐   │
│   │                 @myavana/react-native-sdk                      │   │
│   │                                                                │   │
│   │  ┌────────────────────────┐       ┌─────────────────────────┐  │   │
│   │  │   MyaMobileClient      │       │     useMyaChat Hook     │  │   │
│   │  │ (NDJSON Streaming,     │       │ (Reactive Messages,     │  │   │
│   │  │  Offline AsyncStorage) │       │  Streaming Deltas)      │  │   │
│   │  └───────────┬────────────┘       └────────────┬────────────┘  │   │
│   │              │                                 │               │   │
│   │  ┌───────────▼─────────────────────────────────▼────────────┐  │   │
│   │  │           Themeable Native UI Components                 │  │   │
│   │  │   <MyaChatScreen />         <MyaFloatingDrawer />        │  │   │
│   │  │   <MyaStrandCard />         <MyaRoutineChecklist />      │  │   │
│   │  └──────────────────────────────────────────────────────────┘  │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │
                  HTTPS / WSS Secure Cloud Run Wire
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │             Mya Cloud Run Gateway Service              │
       │       - Streaming NDJSON Chat (`/chat/stream`)         │
       │       - Gemini Live Audio WebSocket (`/voice/stream`)  │
       │       - Customer-360 Telemetry (`{ platform: 'rn' }`)  │
       └────────────────────────────────────────────────────────┘
```

---

## 3. The 5 Pillars of Native Mobile Parity

### Pillar 1: Screen Awareness (`useMyaScreenContext`)
Just as `syncRoute()` updates Mya on the web, the mobile SDK will listen to React Navigation state:
```typescript
// Mobile Bridge: Auto-inject active screen into Mya's context
export function useMyaScreenContext(navigation: NavigationProp<any>) {
  const currentRoute = navigation.getCurrentRoute()?.name;
  
  useEffect(() => {
    if (currentRoute) {
      MyaMobileClient.getInstance().updateExperienceContext({
        activeScreen: currentRoute, // e.g. "HairProfile", "HairDiary", "Regimens"
        screenContext: getScreenContextDetails(currentRoute),
      });
    }
  }, [currentRoute]);
}
```
* **On `HairProfile` Screen:** Mya proactively offers: *"I see your porosity is High and curl pattern is 4B. Want me to recommend deep conditioning regimens?"*
* **On `HairDiary` Screen:** Mya suggests: *"Ready to log today's moisture level or take a length check photo?"*
* **On `DigitalHairAIResults` Screen:** Mya breaks down the computer-vision strand analysis in conversational detail.

### Pillar 2: Redux & Identity State Bridge
Instead of passing name and phone as unverified query parameters in a WebView URL, the mobile app passes its verified Redux state directly into the SDK:
```typescript
const user = useSelector((state: RootState) => state.auth.user);
const strandProfile = useSelector((state: RootState) => state.hairProfile.data);

<MyaProvider
  apiBase={Config.MYAVANA_CHAT_API_BASE}
  user={{
    id: user.id,
    name: user.firstName,
    email: user.email,
    token: user.authToken,
  }}
  hairProfile={{
    hairType: strandProfile.texture,
    porosity: strandProfile.porosity,
    elasticity: strandProfile.elasticity,
    goals: strandProfile.goals,
  }}
>
```

### Pillar 3: Bi-Directional Native Action Dispatcher
When Mya generates an actionable suggestion, tapping it directly controls the native React Native app:
* **Product Recommendation:** Tapping "View Product" triggers `navigation.navigate("recommendProductDetail", { productId: item.id })`.
* **Regimen Recommendation:** Tapping "Start Wash Day Routine" navigates to `regimeDetails`.
* **Strand Scan / Photo Log:** Tapping "Snap Length Check" opens the native camera screen `Camera` with camera overlay guides.
* **Consultation Booking:** Tapping "Talk to a Stylist" opens `BookVirtualAppointment`.

### Pillar 4: Native Live Voice Bridge (Gemini Live Audio)
* **Web:** Uses browser Web Audio API (`AudioContext`).
* **Mobile App:** Uses native PCM streaming via `react-native-live-audio-stream` / `expo-av`.
* **Zero UI Interruption:** User can speak to Mya in hands-free voice mode while scrolling through their hair diary or product list.

### Pillar 5: Offline Resilience & AsyncStorage Caching
* Real-time conversation threads, draft responses, and hair profile blueprints are cached using React Native `@react-native-async-storage/async-storage`.
* If a user loses connection in a salon or subway, messages queue gracefully with an offline indicator and automatically sync upon reconnection.

---

## 4. Workstream Allocations & Team Responsibilities

```
                                  LEADERSHIP
                        Iris 👁 (PM & UX Alignment)
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
   MOBILE CORE                  AI PROTOCOL & BACKEND         VERIFICATION
  Lyra 📱 (RN SDK)               Astra ✦ (Audio / Protocol)    Kael 🛡️ (QA)
  Vela ✧ (Host Bridge)           Atlas ⏣ (Cloud Run Gateway)
```

### 1. Lyra 📱 (Mobile Integration Guardian & RN Architect)
- **Ownership:** `packages/react-native-sdk` and `MyAvana_FrontEnd_RN/src/containers/MyaChatScreen.js`.
- **Tasks:**
  - Build `<MyaChatScreen />` to drop into `src/routes/Navigations.js` replacing `WebViewChat`.
  - Build `<MyaFloatingDrawer />` bottom sheet component for ambient chat across the app.
  - Implement the `handleAppAction` bridge linking Mya cards to React Navigation screens.

### 2. Astra ✦ (AI Protocol & Web Voice Lead)
- **Ownership:** WebSocket Live Audio streaming protocol and typed message schemas.
- **Tasks:**
  - Define the low-latency mobile PCM audio framing standard (16kHz, 16-bit mono PCM).
  - Ensure protocol parity between web voice (`myavana-widget.js`) and mobile voice (`StreamAdapter.ts`).

### 3. Atlas ⏣ (Cloud Run & Platform Guardian)
- **Ownership:** Cloud Run mobile gateway configuration and security.
- **Tasks:**
  - Configure the production Cloud Run URL and CORS/WebSocket ingress for mobile apps.
  - Implement mobile session attribution validation (`X-Myavana-Platform: react-native-ios | react-native-android`).

### 4. Vela ✧ (Host Bridge & System of Record)
- **Ownership:** Synchronizing WordPress REST API endpoints with mobile data models.
- **Tasks:**
  - Verify that strand data, daily checklists, and journal entries created via mobile Mya correctly persist into WordPress CPT `hair_journey_entry` and `myavana_profiles`.

### 5. Iris 👁 (Product Manager & Observer)
- **Ownership:** Mobile user journey, conversational ergonomics, and Customer-360 visibility.
- **Tasks:**
  - Ensure the mobile chat experience feels like a luxury personal hair coach.
  - Validate that mobile conversations appear in real-time on the Customer-360 Operator Console.

### 6. Kael 🛡️ (Lead Verifier & QA)
- **Ownership:** Automated test suites, mobile regression testing, and device matrix verification.
- **Tasks:**
  - Implement Jest integration tests simulating mobile network drops, token refreshes, and app action dispatches.
  - Test on both iOS Simulator (iPhone 15 Pro) and Android Emulator.

---

## 5. Prioritized Sprint Backlog (RN-XXX)

| Task ID | Component & Title | Assignee | Scope & Deliverable | Priority |
| :--- | :--- | :--- | :--- | :--- |
| **RN-001** | **`MyAvana_FrontEnd_RN` Dependency Link** | Lyra | Link `@myavana/react-native-sdk` as local monorepo/yarn package in `package.json`. | **P0** |
| **RN-002** | **Replace `WebViewChat` with `<MyaChatScreen />`** | Lyra | Excise `webviewchat.js` from `src/routes/Navigations.js`; register native `MyaChatScreen`. | **P0** |
| **RN-003** | **Redux User Profile Bridge** | Lyra / Vela | Connect Redux `user` & `hairProfile` state into `MyaMobileClient` initialization. | **P0** |
| **RN-004** | **Screen Context Awareness** | Lyra | Add React Navigation listener syncing active route (`Dashboard`, `HairDiary`, etc.) to Mya. | **P0** |
| **RN-005** | **Native App Action Dispatcher** | Lyra | Map Mya card actions to native navigation (`recommendProductDetail`, `Camera`, `regimeDetails`). | **P0** |
| **RN-006** | **Cloud Run Gateway & Auth Header Handshake** | Atlas | Connect mobile SDK to live Cloud Run service with bearer tokens and platform telemetry. | **P0** |
| **RN-007** | **Purge Legacy Kommunicate Native Pods** | Lyra / Atlas | Remove `react-native-kommunicate-chat` from iOS `Podfile` and Android `build.gradle`. | **P1** |
| **RN-008** | **Native Audio Streaming Bridge** | Astra / Lyra | Implement native PCM audio recording/playback module for Gemini Live Voice on mobile. | **P1** |
| **RN-009** | **Ambient `<MyaFloatingDrawer />`** | Lyra / Iris | Add global bottom-sheet drawer triggerable from any screen via floating concierge badge. | **P1** |
| **RN-010** | **Offline AsyncStorage Sync** | Lyra | Cache message threads and pending drafts locally; auto-sync when network returns. | **P1** |
| **RN-011** | **End-to-End iOS/Android Verification Suite** | Kael | Run automated simulator test suite validating chat streaming, screen sync, and action dispatches. | **P0** |

---

## 6. Execution Steps & Verification Protocol

### Step 1: Clean Monorepo Link
In `/Users/winstonzulu/WebstormProjects/MyAvana_FrontEnd_RN`:
Add local workspace reference in `package.json`:
```json
"dependencies": {
  "@myavana/react-native-sdk": "file:../Myavana-Chatbot/packages/react-native-sdk"
}
```

### Step 2: Native Screen Replacement
Update `src/routes/Navigations.js`:
```diff
- import WebViewChatScreen from "../containers/webviewchat";
+ import MyaChatScreen from "../containers/MyaChatScreen";

- <Stack.Screen name="WebViewChat" component={WebViewChatScreen} />
+ <Stack.Screen name="MyaChat" component={MyaChatScreen} />
+ <Stack.Screen name="WebViewChat" component={MyaChatScreen} /> {/* Backward compat alias */}
```

### Step 3: Verification on Live Simulators
1. **Launch Test:** Run `npm run ios` or `npm run android`.
2. **Dashboard Concierge Tap:** Tap "Instant Chat" on Dashboard $\to$ Opens instant native `<MyaChatScreen />` in $<100\text{ms}$ with zero webview loading spinner.
3. **Context Verification:** Mya begins conversation aware of the user's name, curl pattern (4A/4B), and current screen.
4. **Action Tap:** Mya renders a recommended product card $\to$ User taps "View Product" $\to$ Mobile app immediately transitions to native `recommendProductDetail` screen.
5. **Console Telemetry:** Operator console confirms session received from `{ platform: 'react-native-ios' }`.

---

*Approved by Team Consensus:*  
**Iris 👁 (PM)** | **Lyra 📱 (Mobile Lead)** | **Astra ✦ (AI Lead)** | **Atlas ⏣ (Platform)** | **Vela ✧ (Host Bridge)** | **Kael 🛡️ (QA)**
