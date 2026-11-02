# Mira’s Circles Planning Review — Safety First, Two Distinct Verticals

**Date:** 2026-10-22  
**Team:** MeetingMind (`meetingmind`)  
**Role:** Independent planner and challenge reviewer  
**Input:** Founder’s Circles brief and attached source audit. This is a planning review, not an implementation approval.

## Recommendation

Keep the supplied direction, with one sequencing and scope correction: make Work meeting-share safety the first delivery gate, then approve the detailed product/design contract before substantial UI work. The proposed phases correctly identify privacy and the shared-shell principle, but their P0 work needs to be narrow, testable, and completed before expanding Work sharing. Treat the reported media and card failures as reproduction questions, not greenfield feature requests.

## Priority order

### C0 — Protect Work content and make outcomes truthful

Before extending the current meeting-share flow:

- Enforce the actual `WorkPrivacy` policy at every share entry point and again immediately before send. Exclude private, confidential, and keep-on-device material according to the product policy; offer only Work Circles as destinations.
- Show an item-level preview with the selected destination, content, source meeting, and audience before publishing. Make the server-side sharing boundary clear at the point of confirmation.
- Persist per-item results. A retry must reuse an idempotency key or equivalent stable operation identity so already-posted items are not duplicated. Keep failed items available for retry and never announce success for failed posts.
- Add negative tests for each privacy mode and destination type, plus partial failure and retry tests. QA should independently attempt confidential/private content through every reachable share path.

**Exit condition:** no ineligible item can be published; successful items remain successful exactly once; failed items remain recoverable; UI success matches server results. If any policy case is ambiguous, hold that case from sharing pending a founder decision.

### C1 — Approve the product architecture and mobile design

Preserve the useful cover/member header and shared Feed/Chat/Members shell. Redesign the Home information hierarchy below the header. Work should have a distinct Overview inside the existing shell, not a duplicate Circle navigation system.

Before implementation, approve light/dark mobile screens and state designs for Faith Home, Work Overview, composer, comments, events, chat/media, card handoff, devotional share, decision/action detail, and the Work meeting-share preview. Include empty, loading, offline, permission-denied, sending, retry, and accessibility/keyboard states. Keep shared visual primitives common, while domain copy, post contracts, templates, reactions, permissions, and primary actions remain separate.

**Exit condition:** one reviewed specification states each vertical’s information hierarchy, user actions, and state behavior. The attached concept is a direction, not yet a complete build-ready design.

### C2 — Fix shared quality defects and verify transport

Implement only after the C1 approval. First triage the visible avatar failures by following member identity and avatar URL from API/model through each surface; use initials as a safe fallback and never resolve an anonymous post to a real person. Replace fixed verse colors with theme tokens and verify contrast in dark/light modes. Unify accessible composer/comment inputs and their sending/error/retry states.

For photos, videos, PDFs, and cards, reproduce on the selected shipping build and supported device/provider combinations. Trace picker MIME, upload ticket, object upload, message/post persistence, and rendering. Existing upload and card-return paths mean the work is reliability/polish unless reproduction shows a missing capability.

Events should improve discovery, date/time/location, RSVP, and reminder comprehension while preserving working server behavior. Avoid combining a transport rewrite with a visual redesign unless the diagnosis requires it.

### C3 — Add Faith devotional sharing as a domain contract

Define a versioned devotional payload before Android and Worker implementation: devotional source ID, title, selected passage/reference and translation, exact user-approved excerpt or snapshot, and an explicit open-source/deep-link behavior. The user reviews the excerpt before sharing. Do not include private journal/prayer context implicitly.

Specify create, parse, render, open, edit, attachment, reaction, moderation, membership/role, and old-client fallback behavior for devotional and every existing post type. Coordinate Android model, API validation, persistence/parser, and UI compatibility as one increment.

### C4 — Build the Work Circles workflow

Start with an overview that answers four questions: what changed since the last meeting, what needs a decision, who owns the next commitment, and where is the source meeting. Use Updates, Chat, and People within the existing shell. Work items should link to their source meeting/project, carry owner/status/due date when relevant, preserve decision history, and distinguish confirmation from supersession.

Keep the initial scope to continuity and team execution. Do not add CRM records or recreate a general task/project manager. Reuse the existing Work templates and vocabulary where they fit; define typed Work payloads/API contracts before expanding the mixed post enum or storing structured data in body strings. Validate external/client audience and notification rules explicitly.

### C5 — Add optional routines after core use is reliable

Consider shared reading/reflection in Faith and concise weekly Work recaps only after the core flows work. Prompts must be opt-in or dismissible, respect quiet hours, avoid streak loss/shame, and point to a concrete useful action. Measure participation without collecting private content.

## Challenge points and unresolved decisions

1. “Redesign from scratch” should not imply replacing useful cover/member context or the existing common shell. The problem is the information hierarchy and interaction quality beneath it.
2. The source audit says media sends and card return already exist, but users report failures. Treat this as a reproducibility gap: first record app version, account/role, provider MIME, network, API response, and resulting object/message state.
3. The Circle cap is 50 per the 2026-10-22 founder decision recorded in Synapse’s inbox. Confirm this policy is represented consistently in client validation and Worker responses; do not change the cap during UX work.
4. Confirm the Circle sharing disclosure and external/client membership policy before the meeting-share confirmation design is finalized.
5. Confirm whether older clients must render an unsupported devotional as a safe text fallback or suppress it with a clear update prompt; do not silently drop the post.

## Ownership proposal

- **Themis + Mira:** product boundary, Faith/Work behavior matrix, approval-ready mobile design.
- **Daedalus + Cinder/Hermes:** privacy/idempotency/API and typed payload contracts; resolve backend ownership overlap before dispatch.
- **Forge:** bounded Android increments after approved contracts; keep Faith and Work UI paths distinct.
- **Sentinel:** independent privacy, compatibility, transport and two-person device walkthroughs; do not implement the changes being verified.
- **Ledger:** track acceptance evidence and unresolved founder decisions.
- **Synapse:** sequence one active implementation stream at a time and select the shipping build for reproduction.

This is a proposed plan for council review. No implementation work is authorized by this review itself.
