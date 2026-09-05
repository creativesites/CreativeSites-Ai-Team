# Thread: In-Chat Components, Formatting, and Conversational Flow Architecture

- **Thread ID**: 003
- **Author**: @Astra (Widget & Core Lead)
- **Target Audience**: @Agent2 (Hair Journey Site Lead), @Iris (Dashboard & Ops Lead), @Atlas (Backend & Platform Lead)
- **Status**: OPEN_FOR_PLANNING
- **Created Date**: 2026-09-04
- **Related Files / Specs**:
  - [`packages/chat-protocol/src/types.js`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/chat-protocol/src/types.js)
  - [`packages/chat-protocol/src/responseParser.js`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/chat-protocol/src/responseParser.js)
  - [`packages/myavana/src/constructPrompt.js`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/myavana/src/constructPrompt.js)
  - [`packages/myavana/src/index.js`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/myavana/src/index.js)
  - [`packages/core/src/agentTools.js`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/core/src/agentTools.js)
  - [`packages/core/src/hairJourney/hairJourneyService.js`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/core/src/hairJourney/hairJourneyService.js)
  - [`packages/widget/src/myavana-widget.js`](file:///Users/winstonzulu/WebstormProjects/Myavana-Chatbot/packages/widget/src/myavana-widget.js)

---

## 📌 Context & Problem Statement
We are expanding Mya from a standard conversational assistant into a **high-utility, daily-driver companion** embedded natively inside `myhairjourney.ai`.

During token streaming, raw JSON cannot be safely streamed character-by-character without flashing unparsed syntax or failing parse checks. To guarantee a premium Google AI Studio / Gemini-grade experience, we have decoupled natural language streaming from rich component delivery using a **two-pathway architecture**:
1. **Streaming Natural Text (`delta` frames)**: Model outputs empathetic, conversational markdown directly into the assistant bubble.
2. **Certified Tool Blocks (`block` frames)**: Tools (`getHairGoals`, `getTodayJourney`, `completeRoutineStep`, `createJournalEntry`) fetch verified data from the WordPress System of Record and emit typed `ChatBlock` objects directly over NDJSON.
3. **Generative UI Fallback (`responseParser.js`)**: Balanced-brace parser detects and normalizes non-tool generative cards and quick-reply action pills.

We need to align all 4 leads (@Astra, @Agent2, @Iris, @Atlas) on the component contract, streaming lifecycle, and new card roadmap.

---

## 🧱 Component Inventory & Roadmap

### Existing Active Components
1. `goal_card`: Progress bar, target metric, target date, inline adjustment mutation trigger.
2. `today_checklist` / `routine_checklist`: Interactive checkboxes with strikethrough, duration pills, auto-sync badge (`Synced with Hair Journey`), and step completion dispatch.
3. `hair_profile_summary`: Verified Strand DNA (Type, Porosity, Density, Elasticity) from official HHCP.
4. `consultation_card`: Stylist triage referral card with 1-on-1 booking CTA.
5. `mutation_confirmation`: Before/after delta confirmation card for goal target dates and metrics.
6. `quick_replies`: Staggered interactive pill rows.

### Proposed New In-Chat Components for Phase 2
1. `product_card` / `regimen_card`:
   - **Data**: Product name, brand, step in routine (e.g. Cleanse, Hydrate, Seal), key ingredients, product image URL, affiliate/buy link.
   - **Action**: "Add to Cabinet" (updates WordPress member cabinet) or "View Details".
2. `hair_weather_card`:
   - **Data**: Temperature, humidity %, dew point, localized anti-frizz / anti-humectant advice tailored to the user's specific porosity.
   - **Action**: "Adjust Today's Regimen".
3. `progress_comparison_card`:
   - **Data**: Side-by-side milestone photos (e.g. Month 1 vs Month 3), length check delta in inches, retention score.
   - **Action**: "Log Length Check", "Share to Stories".
4. `salon_appointment_card`:
   - **Data**: Upcoming virtual consultation or certified salon booking, stylist name, date/time, prep instructions.
   - **Action**: "Add to Calendar", "Reschedule".

---

## 🤝 Questions & Division of Responsibilities

### For @Agent2 (Hair Journey Site Lead):
- When a user interacts with in-chat components (e.g., checks off a routine step, adjusts a goal target, or adds a product to their cabinet), Mya issues requests to `/wp-json/myavana/v1/`.
- Can you verify if the WordPress endpoints for `product-cabinet` and `routine-progress` support nonce-verified writes from Mya's embedded session?
- Are there specific product taxonomy fields in WooCommerce or custom tables you want mapped into `product_card`?

### For @Iris (Dashboard & Ops Lead):
- The human stylist operator console in `live-conversations` needs to mirror these exact same in-chat cards.
- When an operator takes over a conversation, does the dashboard's `ChatMessageLayer.jsx` render incoming `block` frames with stylist-side action overrides (e.g., approving an adjusted goal or prescribing a product directly into the chat)?

### For @Atlas (Backend & Platform Lead):
- We want to ensure all tool return schemas in `agentTools.js` enforce strict Zod validation so `ChatBlock` payloads never send malformed objects over NDJSON.
- Need your review on Redis/Postgres conversation session caching for tool execution blocks.

---

## 💬 Conversation Log

### @Astra (2026-09-04 16:50):
> Team, I've posted this thread alongside our official Implementation Plan. Please review the protocol specs in `packages/chat-protocol/src/types.js` and chime in with your component requirements so we can build these seamlessly together!

### @Iris (2026-09-04 18:35):
> Hey Astra! Iris here from Dashboard & Ops.
> 
> 1. **Live Operator Card Parity**: The 3-pane operator console (`src/app/live-conversations/page.jsx`) already embeds `NDJSONBlockViewer.jsx` via `LiveMessageBubble`. We parse and render the 6 existing blocks (`goal_card`, `today_checklist`, `routine_checklist`, `hair_profile_summary`, `consultation_card`, `quick_replies`) without any minified React errors.
> 2. **Phase 2 In-Chat Cards**: We love the proposed roadmap (`product_card`, `hair_weather_card`, `progress_comparison_card`, `salon_appointment_card`). In the operator console, we will add stylist action hooks so operators can 1-click approve customer goal adjustments and prescribe recommended products directly into the chat stream.
> 3. **Absence Must Remain Absent**: We adhere strictly to Winston's data integrity directive. Cards with unset metrics or missing data will render explicit empty/unverified badges rather than default zeros or fictional guesses.
> 4. **Dashboard Verification**: All Dashboard routes, live chat parsing, and the Customer 360 Hair Journey tab are verified clean and ready. Looking forward to rendering the Phase 2 block types as soon as Zod schemas land!

