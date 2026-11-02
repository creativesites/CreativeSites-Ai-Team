# MyaOS Design Studio: product brief

**Status:** Product direction agreed in Thread 044; implementation target pending runtime adoption gate
**Date:** 2026-11-03
**Owners:** Winston (product decisions), Tessera (design direction), Codex (workflow contract)
**Related:** [Thread 044 discussion](../threads/044_design_studio_and_desktop_polish.md), [Tessera’s opening position and Codex’s reply](../threads/044_tessera_design_studio_and_app_polish.md), [Design Studio vision/audit](../threads/026_myaos_design_studio_vision_and_audit.md), [workflow implementation plan](MYAOS_WORKFLOW_IMPLEMENTATION_PLAN.md), [v2 workflow engine spec](MYAOS_V2_WORKFLOW_ENGINE_SPEC.md)

## Outcome

A user can create a design for a feature, page, screen flow, or app—or recreate an existing project UI—then iterate on a visual artifact and approve an exact version. The approved version becomes a durable build contract. The build workflow routes the work, shows progress and failures, and verifies the result against the agreed criteria. The artifact remains accessible from Design Studio, its project, and the sessions/jobs that contributed to it.

Design is not a mockup trapped in one chat, and approval is not a direct agent wake. The design artifact is durable; sessions provide conversation context, projects provide source context, and jobs implement approved versions.

## Product principles

1. **One artifact across entry points.** “Create design” and “Design from project” create the same durable artifact type. A user may create, attach to, or reopen it from a project, session, job, or Design Studio. A new request creates a new artifact unless the user explicitly selects an existing one.
2. **Scope can grow.** A design can cover one feature, one page, multiple screens in a flow, or several flows in an app. The initial experience can keep this as an outline rather than requiring an infinite canvas or complex flow editor.
3. **Versions are immutable contracts.** Each saved version records its canonical content and hash, scope, viewport(s), token snapshot and provenance, project/source revision and fidelity label, and producer/provider/session/run. Editing after approval creates a new version; it never changes an existing job’s contract.
4. **Approval starts the build workflow.** Approval records the exact version, approver, time, and decisions. It creates or attaches a durable job and criteria. It does not mean the implementation is verified.
5. **Routine work continues without extra human clicks.** After design approval, policy routes eligible low-risk work to a qualified builder and an independent verifier. If a planner/runtime/agent is unavailable, the job remains visibly queued or blocked with a retry/next step. Extra human approval is reserved for explicitly configured high-risk, ambiguous, or release decisions.
6. **Show evidence honestly.** Distinguish observed project facts, inferred style, generic fallback, owner approval, agent acknowledgement, and independent verification. Never label approval as verification or display a capability/success badge without evidence.
7. **Keep existing work recoverable.** Save, version, retry, cancellation, dispatch acknowledgement, and failure details must survive navigation and app restarts.

## Main user flow

### Start a design

- **Create from brief:** enter a new feature/page/flow/app request without a project, then link a project later if needed.
- **Design from project:** select a project and source revision; scan its UI and styles; label the result as a live render, source-grounded reconstruction, or approximation.
- **From a session:** create a new artifact or explicitly choose an existing artifact to continue. Persist the session↔artifact/run relationship so the design can be reopened from both sides.

### Iterate

The user sees the current design, its outline, and the conversation/composer together. They can ask for a change, select an element, leave a comment, fork a variant, compare versions, and roll back. Each durable change creates a version and preserves the originating prompt/producer context. A generated approximation must be labelled as such.

### Review and approve

One short approval sheet (not a wizard) shows:

- the selected version and its hash, with its screen previews at intended sizes;
- one outcome sentence and at least one criterion per screen;
- unresolved questions and source/fidelity warnings;
- token provenance, requiring acknowledgement when fallback tokens are used;
- the builder policy/assignment, with no hard-coded agent default and an optional user override.

If a planner is unavailable, do not invent criteria silently: show the unavailable state and allow the user to supply the minimum criteria. High-risk or unclassified work follows the configured review gate. A new design version requires a new approval.

### Build and verify

The job references the immutable approved version ID/hash, criteria, assets/tokens, project/source revision, and decisions. The router selects an eligible builder according to explicit capability and risk policy. Dispatch is recorded as queued, acknowledged, failed, or blocked; a swallowed wake error is not success. A builder cannot verify its own work.

For the first verification slice, capture the built screen at the approved viewport and attach criterion-level evidence next to the approved version. A side-by-side comparison is evidence for an independent verifier; it is not by itself proof of interactions, data correctness, or all responsive behavior. Use automated visual diff later as a signal, not the only pass/fail gate. Routine low-risk work completes on independent evidence without an additional human sign-off; configured high-risk/release gates may require one.

## Design page structure

- **Focus view (default):** one active screen/frame, a left scope outline for feature → flows → screens, a clear chat/composer, and visible run state. Optimize this for focused editing and laptop widths.
- **Board view (secondary):** retain the existing canvas for spatial comparison, variants, and lineage. Both views edit the same artifact and versions.
- **Inspector:** collapsible right panel on wide windows and a drawer/tab at narrower widths. Show versions, comments/notes, source and token provenance, producer session/run, approval, linked job, and verification evidence.
- **Run panel:** show provider/agent, queued/running/waiting/blocked/failed state, files/frames produced, current step, cancellation/retry, and a plain-language next action.
- **Preview:** viewport controls, direct element selection, version comparison and rollback. Keep saved/unsaved, stale-source, and preview-failure state visible.

## Generator policy

Winston’s recorded preference in Thread 026 §2.4 is **Gemini API by default**, with agent-session generation selectable. Keep both behind one generation interface, record provider/model per version, and make quota/auth/provider failures recoverable. Do not present fallback design tokens as project identity: label each token group as extracted from a named file, inferred, or generic MyaOS default. Allow the user to edit and approve the token set.

## App-wide polish priorities

### P0 — Trust and workflow integrity

- Remove false success/accessibility/readiness claims and misuse of evidence tones for decorative feature badges.
- Remove hard-coded assignee defaults and pre-checked dispatch controls. Use explicit routing policy; allow user override.
- Make approval, dispatch acknowledgement, build completion, and verification visibly distinct.
- Add build/version identity so the user can tell which installed application/runtime they are using.

### P1 — Recoverability and continuity

- Link project, artifact, session, job, and approval so each can reopen the same work.
- Make saves and versions durable; use idempotent retry; preserve prompt, selection, and prior evidence after failures.
- Show background work and next actor/action; keep unavailable work queued and retryable rather than pretending it started.

### P2 — Clarity and access

- Replace developer-facing labels and unexplained zero counts with plain language and contextual actions.
- Give each major screen intentional empty, loading, and error states with an actionable next step.
- Ensure keyboard/focus behavior, responsive inspector layout, and accessible labels for canvas controls.

## Staged delivery

### Stage 0 — Runtime adoption gate

Choose one implementation line before schema or UI changes. Review and launch the v2 app against its intended runtime store; validate migrations/backups, a real request→artifact→job path, and version compatibility. If v2 is selected, continue in `runtime/` + `apps/desktop`; if not, map the same product contract to the selected line. Do not build competing artifact/job models in v1 and v2.

### Stage 1 — One vertical artifact loop

For one project and one screen: create from the Design page, reopen from an existing session, persist source revision and session association, save version N, iterate to N+1, then approve an immutable version. Approval creates or attaches a durable job with explicit criteria and a queued task referencing the hash. Prove unavailable-builder behavior stays visible and retryable. No generalized flow tree or fan-out is required yet.

### Stage 2 — Independent verification and recovery

Capture the built screen at the approved viewport, attach criterion-level evidence from a verifier other than the builder, and return the job’s status/evidence to the artifact. Exercise stale approvals after editing, duplicate/retry behavior, provider failure, and recovery after app restart. Keep verification separate from owner approval.

### Stage 3 — Broaden scope and polish

Add flow/app outlines, side-by-side variant review, responsive focus/board layouts, artifact entry points across projects/jobs/sessions, and prioritized P1/P2 polish. Keep live React/RN rendering, multi-agent design fan-out, prototype playback, and automated pixel-diff gates deferred until the first vertical loop is reliable.

## Acceptance criteria for the first vertical loop

1. Creating a design from a project and reopening it from a session reaches the same explicit artifact; a new request never silently reuses an unrelated board.
2. Iteration creates a new immutable version while retaining prior content, prompt/producer metadata, token provenance, and source/fidelity details.
3. Approval records an append-only decision against one version ID and content hash. Later edits do not make the earlier approval appear current or mutate the job contract.
4. Approval creates/attaches a durable job with at least one criterion per screen and links the exact design version/hash. Approval is not recorded as verification.
5. The runtime routes routine eligible work without a hard-coded builder; absent/unavailable agents leave a visible queued/blocked state with a retry path.
6. A non-builder attaches a reproducible viewport capture and criterion-level evidence. The ordinary low-risk path completes without a second human sign-off.
7. The artifact, job, and session links remain navigable after leaving the page and reopening the app.

## Decisions and dependencies

- **Agreed product behavior:** focus view default plus existing Board view; collapsible inspector; one-sheet approval; version/hash-pinned job; explicit token/source fidelity; no hard-coded builder; independent verification; routine low-risk automation after design approval.
- **Recorded owner decision:** Gemini API is the default generator, with agent sessions selectable (Thread 026 §2.4).
- **Open architecture decision:** which runtime branch is canonical. This brief is branch-neutral until Stage 0 is completed.
- **Deferred:** infinite-canvas expansion, React/RN-native rendering, multi-agent direction fan-out, automated visual-diff pass/fail, prototype play mode.

