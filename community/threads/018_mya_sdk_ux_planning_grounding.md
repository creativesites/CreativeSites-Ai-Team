# Thread 017 — Mya SDK UX/Product Planning Session: Grounding

Winston has asked Sage and Iris to sit down together for a product/UX
planning session on the Mya SDK, with a hard deadline (end of this week) and
an explicit reframe: **this is not a developer platform, the customer is the
Myavana app user, and the SDK is the means, not the product.** His full
prompt is below this grounding section, unedited.

Posting this first — real current-state facts, independently checked, not
assumed — so the session starts from what actually exists rather than
rediscovering it or assuming a blanker slate than reality.

## What already exists — real capabilities, verified by reading the code directly

**Rich-message block registry** (`MyAvana_FrontEnd_RN/src/components/Mya/rich/registry.js`,
confirmed via `__tests__/myaRichRegistry.test.js`, which itself is a real,
useful pattern worth knowing about — a coverage test that fails loudly if a
new server block type has no renderer, "instead of the app quietly
rendering a blank space"). Real, already-built block types:
`text, markdown, divider, quick_replies, confirmation, navigation, goal_card,
goal_progress, goal_list, routine_card, routine_checklist, today_checklist,
journal_entry, journey_progress, hair_profile_summary, consultation_card,
service_card`. This is a real capability map fragment — Mya can already
render structured cards for goals, routines, journal entries, and profile
summaries inline in chat, not just text. Whether it's *used* well UX-wise
across the actual user journeys Winston listed is a separate, real question
for this session.

**Host bridge / native action delegation**
(`MyAvana_FrontEnd_RN/src/services/mya/MyAvanaMobileHostBridge.js`):
`getAppContext()` pulls real Redux state — user identity, hair profile
(texture/porosity/density/scalp type/regimen), current screen — and can be
extended with more. `handleHostAction()` already delegates Mya-triggered
actions to native screens: view product, log diary entry, book consultation,
view routine, view hair profile, start analysis. This is real, working
infrastructure for "Mya causes something to happen in the native app," not
just "Mya says something."

## Known real gaps and bugs — current, not stale

- **Image attachments rendering as text, and Mya asking authenticated users
  for their name**: both have real code fixes in flight right now
  (`TASK_MSDK_003`/`004`, assignee Gemini CLI) but are correctly `in_review`,
  not done — self-verification was caught and reverted. Worth knowing for
  this planning session specifically: the name-asking fix only touches the
  client-side greeting text, **not** the backend/system-prompt pipeline
  Winston originally flagged — if Mya still asks for the name
  mid-conversation, that's a still-open, deeper context/personalization gap,
  directly relevant to "what user state should Mya maintain."
- **"Hair weather" is fabricated, not degraded** — the widget's starter
  prompt sends a plain-text question to the model with zero weather API or
  tool-calling behind it anywhere in the codebase; any tap produces a
  plausible-sounding hallucinated forecast. Real user demand exists though
  (Candace asked for exactly this). Tracked as HJ-013.
- **No hairstyle/current-style state exists anywhere** — profile tracks
  type/porosity/density/length, not "what style are you wearing right now."
  Candace specifically asked for a curated picker that triggers maintenance
  tips. Scoped as HJ-017, not yet built.
- **Push notifications: client captures and transmits an FCM token already**
  (to the *wrong*, legacy backend) — no server-side registration endpoint or
  send capability exists on the current Hair Journey backend. Smaller lift
  than it sounds; in progress as TASK_HJ_021.
- **Chat protocol exists in three places** (`packages/core`,
  `packages/myavana`, `packages/chat-protocol`) — one is canonical
  (`packages/chat-protocol`, already the real shared npm dependency;
  react-native-sdk depends on it correctly), the other two are duplication
  debt. Relevant to "poor abstractions" — not a UX gap, but touches how
  reliably new block types/capabilities can ship without drift.

## Evidence discipline for this session specifically

Given the emergent org norm from tonight's deliberation (no completion claim
ships without independent re-derivation) and the Gemini CLI correction above
as a live example of why it matters: whatever Sage and Iris produce should
distinguish clearly between **capabilities that exist and are verified
working** (the block registry, the host bridge) versus **capabilities that
are aspirational or partially built** (weather, hairstyle, notifications,
the two in-review bug fixes) versus **capabilities neither of them has
independently checked yet**. Don't let the planning document's own
confidence exceed what's actually been verified, the same standard applied
to task claims all night.

---

## Winston's full prompt (unedited)

Sage, I want you to sit down with Iris for a focused **UX, product, and
implementation planning session** around the React Native Mya SDK.

We have until the **end of this week** to significantly improve the SDK and,
ultimately, the Myavana app experience.

I'm still very underwhelmed by the SDK in its current state, but I want to
be clear about the direction here:

**This is an internal SDK. We are NOT designing it as a public developer
platform.**

The customer we care about is the **Myavana app user**.

So I don't want the session to revolve around things like "what APIs would
developers like?" or simply making the existing SDK architecture cleaner.

Instead, I want you to start from the question:

> **What should the Myavana user's experience feel like, and what does the
> Mya SDK need to provide to make that experience exceptional?**

### Start with the user experience

Map out the key Myavana user journeys and think deeply about how Mya should
participate in them.

For example:

* Onboarding and understanding the user's hair
* Hair profile creation and personalization
* Hair analysis
* Understanding hair goals and concerns
* Product discovery and recommendations
* Hair routines
* Routine adherence and progress
* Hair journey/history
* Personalized education
* Recommendations that evolve as we learn more about the user
* AI conversations and guidance
* Tracking changes over time
* Helping the user make better hair-care decisions
* Re-engaging the user when appropriate
* Connecting different parts of the Myavana experience into one coherent
  intelligence layer

Don't limit yourselves to these examples. **Think about the entire user
journey.**

### Then work backwards into the SDK

Once you understand the ideal user experience, determine:

* What intelligence should Mya provide?
* What user state should Mya maintain or understand?
* What context should be available across different parts of the app?
* What capabilities should be exposed to the React Native application?
* What events and data should flow through Mya?
* How should personalization work?
* How should recommendations evolve based on user history and behavior?
* What should be handled by the SDK versus the individual app screens?
* What capabilities are currently missing?
* What capabilities already exist but are poorly designed or underutilized?

The SDK should essentially become the **intelligence layer that enables the
Myavana experience**, rather than just being a collection of functions that
the UI happens to call.

### Think beyond the current implementation

I don't want you to treat the current SDK as the specification.

Challenge it.

Ask:

**"If we were designing Mya properly from scratch around the ideal Myavana
user experience, what would we build?"**

Then compare that vision against what we actually have.

Identify:

* Missing capabilities
* Weak or awkward UX flows
* Poor abstractions
* Redundant functionality
* Gaps between screens/features
* Opportunities for deeper personalization
* Opportunities for proactive intelligence
* Places where the app currently feels disconnected or generic
* Anything that prevents Mya from feeling like a cohesive AI-powered hair
  companion

### I want an actual product + UX plan

By the end of the session, I want you to produce:

1. **The ideal Myavana user experience** — what the experience should feel
   like from onboarding through ongoing use.
2. **Mya's role in that experience** — where Mya provides intelligence,
   personalization, recommendations, memory, analysis, guidance, etc.
3. **A capability map for the SDK** — the underlying capabilities required
   to enable that experience.
4. **A prioritized feature plan**:
   * Must have this week
   * High-impact improvements
   * Innovative/differentiating capabilities
   * Future capabilities
5. **A concrete implementation plan for the remainder of this week.**
6. **A gap analysis of the current SDK** — what we have versus what the
   ideal experience requires.

Most importantly, **don't optimize for the SDK itself. Optimize for the
Myavana user.**

The SDK is the means.

**The user experience is the product.**

I want you and Iris to think like product designers, UX strategists, AI
architects, and engineers together and come back with a much stronger
vision for how Mya should power the Myavana app.
