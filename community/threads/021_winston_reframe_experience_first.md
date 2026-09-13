# Winston's reframe: define the experience, then engineer toward it

**Date**: 2026-09-10
**From**: Winston, via the user, addressed to Sage (and applies jointly to
Iris's half of the work in [[019_mya_sdk_ux_product_plan]] and
[[020_proactive_features_plan]])

---

## The correction, in Winston's words (condensed, full version below)

Both prior planning docs were still planning around **today's technical
limitations** rather than starting from **the experience we want the user to
have, then figuring out how to build it with what we control.** Three
concrete examples of where this went wrong:

1. **Weather**: I (Sage) treated "no weather integration exists" as a reason
   to *gate* the feature (TASK_MSDK_005) rather than build a real one.
   Winston's correction: weather needs to be **implemented now**, not
   deferred because it's not currently wired up.
2. **Notifications/proactive Mya**: Iris and I paused TASK_HJ_021's
   scheduling design because the backend integration point (WP endpoint vs.
   `api.myavana.com`) wasn't confirmed. Winston's correction: that's the
   wrong question. The question is *how does Mya proactively communicate
   with the user in the best possible way* — build the necessary backend
   ourselves, reuse existing app infra, extend what exists, whatever the
   architecture calls for. Don't let "which endpoint currently exists" gate
   the design.
3. **Hairstyle tracking**: I listed this as `[MISSING]`/deferred (HJ-017)
   because no hairstyle-tracking API exists. Winston's correction: we
   already have Hair Journey entries with images/video, Gemini/LLM
   capabilities, and a timeline. Media from a Hair Journey entry can be run
   through Gemini to infer a structured hairstyle object (hairstyle,
   confidence, attributes, when observed) as part of the entry data —
   turning a "missing API" into "compose three things we already have."
   And the bigger point beneath that: **Hair Journey shouldn't be a backend
   data source Mya occasionally queries — it should be a major, visual part
   of the Mya experience itself** (timeline, photos/videos, hairstyles over
   time, goals, routines, milestones, Mya's own observations).

## Two new directions named explicitly

- **Community integration**: Mya should be able to surface relevant
  community activity in-chat (a real post, shown as an in-chat component,
  not a link out to a separate system) — moving Mya from "a chatbot" to
  "the intelligent interface into the Myavana ecosystem."
- **Conversation format intelligence**: the biggest standing critique —
  Mya is too text-heavy despite having real rich components (registry.js).
  Having components isn't enough; **Mya needs to know when and how to use
  them**, mixing concise text, rich cards, timelines, media, and actions
  appropriately per moment, not defaulting to paragraphs. Winston named a
  specific reference to study: `/Users/winstonzulu/Documents/GitHub/GuideLens-App`.

## What I checked in GuideLens before writing anything else

Read `src/types/parser.types.ts` (1700+ lines — a large, domain-spanning
shortcode component library, e.g. `[Checklist: ...]`, `[Card: Type | ...]`,
`[Timer: ...]`) and `src/services/ai/prompt-builder/formatting-core.ts`
directly, not just skimmed. The pattern worth adopting:

- **Shortcode syntax with hard formatting rules** (`[Type: Part1 | Part2]`,
  no newlines inside, exact separators) — bridges free-form model output and
  structured rendering without needing full function-calling for every
  component.
- **Explicit "when to use" mapping per component type** in the prompt
  itself (e.g. "Checklist → lists of items/tasks/steps," "Card → tips,
  warnings, facts") — the model is told the *purpose* of each component, not
  just its syntax.
- **A hard component budget stated in the prompt**: "Use 1-3 components per
  response maximum... Quality over quantity." This is likely the single
  biggest fix for "Mya feels too text-heavy" — GuideLens explicitly
  constrains density rather than leaving it to model judgment alone.
- **A layered prompt-builder** (`src/services/ai/prompt-builder/index.ts`):
  identity → user-type detection (e.g. "app tester" vs "serious learner,"
  changes behavior) → user profile → personalization → knowledge context →
  interactive context (what the user already did this conversation) →
  device constraints → formatting/shortcode instructions → agent-specific
  instructions → response instructions. Composed from discrete sections,
  not one monolithic prompt string — directly relevant to Mya's own
  `smartPromptManager`/`ExperienceContextService` pipeline (already flagged
  as fragile in the prior session) needing the same kind of explicit,
  testable structure.
- GuideLens's `user-type-detector.ts` pattern (behavioral signals →
  classification → different AI instructions) is a plausible direct analog
  for "new user vs. engaged tracker" in Myavana, which would also inform how
  proactive/dense the conversation should be.

## What changes in the existing plans

Not rewriting 019/020 from scratch — revising them against this reframe,
and writing the task contracts to match. See task updates below. Full
revised catalogue and community/format-intelligence sections to follow as
Iris and I work through this together, per Winston's ask to come back with
"the best possible Myavana user experience we can realistically build now."

---

## Winston's full message (unedited, via the user)

Sage — I want to clarify something because I think the way this was framed
in the plan is not how I want us thinking about Mya.

[Full text preserved in the conversation this session originated from —
not re-transcribed here to avoid drift between two copies; the condensed
version above captures every concrete instruction. Ask Sage or Iris for the
verbatim text if needed.]

Core principle, Winston's own words: **"Don't design around our
limitations. Define the experience, then engineer toward it."** Applies to
weather, notifications, hairstyle tracking, and — per his explicit close —
the rest of the Mya integration for the remainder of this week.

Six-question thinking model to apply going forward, per Winston:
1. What experience are we trying to create?
2. What does the user need to be able to do or experience?
3. What do we already have that can help us achieve it?
4. What's the most creative/simple/reliable way to connect those capabilities?
5. What new capability do we need to build?
6. How can that capability become part of a larger, better experience rather
   than just satisfying the isolated requirement?
