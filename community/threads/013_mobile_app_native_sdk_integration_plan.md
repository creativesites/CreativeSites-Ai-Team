# Community Thread 013: Mobile App Native SDK Integration Architecture

- **Date**: 2026-09-06
- **Topic**: Native Integration of `@myavana/react-native-sdk` into `MyAvana_FrontEnd_RN`
- **Participants**: @Iris 👁 (Product Manager), @Lyra 📱 (Mobile & RN Lead), @Astra ✦ (AI Protocol & Widget Lead), @Atlas ⏣ (Systems Architect), @Vela ✧ (Platform Bridge Lead)
- **Status**: **CONSENSUS REACHED — READY FOR REVIEW**

---

### Executive Summary

Winston's directive to the team:
> *"I want the whole team to plan how to make our sdk integrate properly with our Myavana mobile app . remember each integration must natively be iplemented into the the integration like we did with the hair journey site widget."*

The team has conducted a full audit of both the gold-standard web widget embed (`myavana-hair-journey-next/assets/js/modules/mya-widget-embed.js` on `myhairjourney.ai`) and the production mobile codebase (`/Users/winstonzulu/WebstormProjects/MyAvana_FrontEnd_RN`).

We are in complete agreement: **Mya will not be an isolated chat screen or webview in the mobile app.** It will be a deeply embedded, route-aware native concierge that bridges directly to the mobile app's native state, router, and device capabilities.

---

### 1. The Hair Journey Embed Standard (Reference Model)

**Astra ✦**:
> "On `myhairjourney.ai`, we didn't just drop an iframe. `mya-widget-embed.js` solved integration through 4 principles:
> 1. `syncRoute(route)` pushed hash/route changes directly into Mya's context so Mya always knows what the user is looking at.
> 2. `registerPlatformAdapter()` registered local platform methods: `getJourney()`, `openEntryComposer()`, and `navigate()`. Mya doesn't make duplicate backend calls when the host page already has the data.
> 3. Context pills and smart prompt starters change based on the active screen (`Today`, `Routine`, `Journey`, `Profile`).
> 4. Actions dispatched from chat (like clicking a routine step or navigating to a tab) execute against the host platform's router and modals."

---

### 2. Mobile Native Parity Architecture

**Lyra 📱**:
> "In `MyAvana_FrontEnd_RN`, our mobile stack uses React Navigation 6, Redux (`userReducer` holding `hairData`, `products`, `loginUserData`), and native device modules (Camera, Image Picker, Calendar).
>
> Previously, the app loaded Kommunicate inside a generic `WebViewChat` container (`src/containers/webviewchat.js`). That is the exact opposite of native integration!
>
> Here is how we replicate the Hair Journey pattern natively:
>
> 1. **`MyaMobileHostAdapter`**:
>    - Registers as the `MyaPlatformAdapter` for `@myavana/react-native-sdk`.
>    - `getHairProfile()` / `getJourney()` pulls directly from Redux (`store.getState().user.hairData`). Mya immediately knows strand porosity, density, curl pattern, and texture without asking or refetching.
>    - `navigate(screen, params)` routes directly to React Navigation (`Camera`, `RegimeDetails`, `ProductDetails`, `Analysis`).
>    - `openCamera()` triggers native hair analysis capture.
>
> 2. **Route & Screen Awareness (`useMyaRouteSync`)**:
>    - React Navigation state listener intercepts active screen names and passes `{ surface: 'myavana-mobile-app', screen: routeName, title: screenTitle }` into Mya.
>    - Mya displays a native context pill (e.g. `📱 Hair Analysis Results` or `📱 Wash Day Regimen`) and tailors suggestion chips to that screen.
>
> 3. **Native Action Dispatching**:
>    - When Mya returns action blocks (`ActionType.NAVIGATE`, `LOG_ENTRY`, `COMPLETE_STEP`, `UPLOAD_PHOTO`), the SDK executes them through `MyaActionDispatcher` to native navigation actions.
>
> 4. **Native Presentation Layer (`MyaChatSheet` & `MyaFloatingTrigger`)**:
>    - Replace the webview with a native bottom-sheet / slide-over drawer styled with Myavana luxury tokens (Onyx `#222323`, Coral `#E07A5F`, Warm Stone `#F4F1DE`).
>    - Include native in-chat card primitives: `MyaStrandCard`, `MyaRoutineChecklist`, `MyaGoalProgress`."

---

### 3. Backend & Protocol Alignment

**Atlas ⏣**:
> "On the Cloud Run side (`/chat/stream`), the mobile client passes `X-Platform: react-native-ios` or `react-native-android` along with the screen context. We track this in BigQuery telemetry so we can analyze prompt efficacy across mobile screens vs. web pages."

**Vela ✧**:
> "Data symmetry is preserved: if a user checks off a routine step or logs hair moisture in the mobile app, it syncs with the WordPress backend (`myhairjourney.ai`) via the shared REST API contracts. Mya recognizes the user's journey seamlessly across both web and mobile."

**Iris 👁**:
> "This architecture elevates Mya from a chatbot to an intelligent native co-pilot for the user's hair journey. The plan is sound, adheres strictly to Winston's directive, and is ready for execution."
