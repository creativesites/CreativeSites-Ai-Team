# Thread 026 — MyaOS Design Studio: target experience + a code-grounded audit of what's real today

**Author**: Claude Code (with Winston)
**Status**: PROPOSAL — planning document, precedes any implementation
**Date**: 2026-09-15
**Related Files / Specs**:
- [desktop/src/views/normal/DesignStudioNormalView.tsx](../../desktop/src/views/normal/DesignStudioNormalView.tsx)
- [desktop/src/views/DesignStudioView.tsx](../../desktop/src/views/DesignStudioView.tsx)
- [desktop/src/services/geminiOrchestrator.ts](../../desktop/src/services/geminiOrchestrator.ts)
- [desktop/src/services/designSystemExtractor.ts](../../desktop/src/services/designSystemExtractor.ts)
- [desktop/src-tauri/src/commands/mod.rs](../../desktop/src-tauri/src/commands/mod.rs)
- Companion doc: [[027_myaos_design_studio_phase1_plan]]

---

## Why two documents

This one answers "what are we building and why." [[027_myaos_design_studio_phase1_plan]]
answers "what do we build first, in what order, and how do we know it worked."
Splitting them keeps the ambitious target state from drowning the immediate,
shippable next step — which Winston was explicit about: **immediate ROI,
starting with faithful recreation of the actual Myavana projects.**

---

## 1. The outcome, stated plainly

Applying [[023_outcome_led_engineering_manifesto]]: the product question first.

> **A person working on a real Myavana project opens MyaOS, points it at that
> project, and within one conversation turn is looking at a live, faithful
> recreation of that project's actual UI — not a generic AI mockup — which
> they can then iterate on by chatting, clicking elements, and pinning
> comments, and eventually hand back to a coworker to implement for real.**

Everything in Winston's 29-point vision (Claude-Design-style chat+canvas,
multi-screen flows, design-system extraction, accessibility QA, prototype
play mode, handoff-to-build) is in service of that one sentence. The vision
doc is right that the *interaction model* to borrow is chat-left/canvas-right
with direct manipulation, comments, and design-system grounding. Where this
doc diverges from the vision doc is in what it claims about the starting
point — see §3.

---

## 2. Non-negotiable product decisions (settling ambiguity now, not later)

These are the calls from the 29-point vision that materially change
architecture, so they need to be decided before Phase 1 work starts rather
than discovered mid-build:

1. **Project-grounded, not idea-grounded, is the default mode.** The vision
   doc's "Create → describe what you want" flow (Claude-Design-style,
   starting from a blank idea) is real and worth having, but it is **not**
   what Winston asked for first. The primary entry point is: *pick a real
   project → see its real UI → iterate on it.* Freeform "design me a landing
   page from nothing" stays as a secondary mode, already half-built in
   `DesignStudioNormalView`.
2. **The canvas renders real HTML/CSS/JS in an iframe, not React.** This
   matches what's already built (both Studio views) and what Tailwind-CDN +
   vanilla-JS generation can produce reliably today. A true React-component
   canvas (compiling and hot-reloading actual project components inside the
   studio) is a distinct, much harder capability — noted as a later
   architecture option in [[027_myaos_design_studio_phase1_plan]], not
   assumed here.
3. **Mobile (React Native) projects are out of scope for the visual canvas
   at first.** `MyAvana_FrontEnd_RN` cannot be rendered faithfully in an
   iframe — RN has no DOM. Faithful recreation for that project means
   generating an HTML approximation styled to match its actual screens
   (colors, spacing, component shapes extracted from its `.tsx` source),
   not literally running the app. This is still useful and still "faithful"
   in the sense that matters (visual fidelity for iteration), but it's a
   different guarantee than for the two web projects and should be labeled
   as such in the UI. -lets go for HTML approximation styled to match
4. **One coworker persona owns this surface: Muse.** The vision doc's
   architecture diagram (Muse orchestrating Astra/Vela/Kael) is adopted.
   Muse is already referenced as "Design & Prototyping Specialist" in the
   Normal Mode coworker roster and in `DesignStudioNormalView`'s header —
   it's currently cosmetic (a label), not an actual routing decision. Phase
   1 makes it real: design generation calls are attributed to Muse, and the
   existing "Build with MyaOS" handoff (fixed today, see git history) routes
   through Muse → Astra. -can also be the gemini api (actually mostly, as agent may be on a session limit etc...we want api that is always realiable to be an option...so user chooses but api is default)
5. **Verification (Kael) is a Phase 2+ capability, not Phase 1.** Accessibility
   scoring, responsive QA, and interaction testing are valuable but they are
   new capability, not "fixing what's broken." The Phase 1 plan explicitly
   excludes them so the first ship stays small. `DesignStudioNormalView`
   currently shows a hardcoded "Accessibility: 96/100 (Passed)" badge that
   is pure fiction — it doesn't run any check. That gets removed in Phase 1,
   not replaced with a real one yet, because a fake passing badge is worse
   than no badge.

---

## 3. Reality audit: what the codebase can already do vs. what only exists as UI chrome

This is the part outcome-led thinking calls for explicitly: before planning
new work, separate "we don't have this" from "we have this and it's just not
wired up." I read every file in the design path before writing this. Findings:

### Already real and reusable

| Capability | Where | Evidence |
|---|---|---|
| Real filesystem UI scan of a project (routes/screens/components + up to 4000 chars of real source per file, plus `globals.css`/`tailwind.config.*`) | `myaos_inspect_workspace_ui_structure` → `DbBridge::inspect_workspace_ui_structure` in [db.rs:2612](../../desktop/src-tauri/src/system/db.rs#L2612) | Walks `src/app`, `src/pages`, `src/views`, `src/screens`, `src/components`, `src` up to depth 3, reads real file contents. Not a stub. |
| Prompt pipeline that grounds generation in that real scanned source and injects a working click-to-select inspector script | `generateFaithfulProjectScreen`-family functions in [geminiOrchestrator.ts:940-1200](../../desktop/src/services/geminiOrchestrator.ts) | Builds the system prompt directly from `scanData.routes`/`filesContext`/`scanData.styleTokens`; has a real post-generation fallback that force-injects the `CANVAS_ELEMENT_SELECTED` inspector if the model omits it. |
| DB persistence for per-project design philosophy, component inventory, and versioned screens | `project_design_philosophy`, `project_components`, `project_screen_versions` tables + matching Tauri commands (`myaos_get/save_project_design_philosophy`, `myaos_list/save/delete_project_component`, `myaos_list/save/delete_project_screen_version`) | Full CRUD exists, wired into `DesignStudioView.tsx` (the dev-mode cockpit). |
| Real task dispatch from an approved design to an actual tracked, branched implementation task | `myaos_dispatch_design_update_task` → `dispatch_design_update_task` in [db.rs:2706](../../desktop/src-tauri/src/system/db.rs#L2706) | Creates a real row in `tasks` with a real branch name (`design/{screen}-v{version}`), validates `project_id`/`assignee_id` against real foreign tables. |
| Click-to-pin element inspector, comment-on-element data model | `DesignComment` type, `CANVAS_ELEMENT_SELECTED` postMessage contract | Real once the inspector script is actually present in the HTML (was missing in Normal Mode until today's fix — see git log). |
| Four real Myavana project repos on disk, one of which (`Myavana-Chatbot-Dashboard`) is a perfect match for the existing scanner's target directories | Filesystem: `~/WebstormProjects/Myavana-Chatbot-Dashboard` | Next.js app, `src/app` with 17+ real routes (settings, products, ai-models, campaigns, cost-analytics, etc.), `src/components`, `src/app/globals.css`, Tailwind-based. This is the scanner's exact intended shape. | 

### UI chrome with no real capability behind it (the actual gap)

| What it looks like | What it actually does | Where |
|---|---|---|
| "Active Design System Tokens" banner, `SAMPLE_DIRECTIONS` picker (SaaS Minimalist / Editorial Warm / High-Contrast Cyber) | Three hardcoded style presets, unrelated to any real project. Selecting a "direction" never reads a project's actual brand. | [DesignStudioNormalView.tsx:48-76](../../desktop/src/views/normal/DesignStudioNormalView.tsx#L48) |
| `extractDesignSystemFromWorkspace(workspaceCwd)` | Ignores its `workspaceCwd` argument entirely and returns the same 10 hardcoded tokens (`#4f46e5`, Inter, etc.) for every project. | [designSystemExtractor.ts](../../desktop/src/services/designSystemExtractor.ts) — this is the single clearest piece of evidence that "faithful per-project design" doesn't exist yet in Normal Mode. |
| "Accessibility: 96/100 (Passed) · WCAG AA Contrast Verified by Kael" | A static string. No check runs. Kael is not invoked. | [DesignStudioNormalView.tsx:755-760](../../desktop/src/views/normal/DesignStudioNormalView.tsx#L755) |
| `currentWorkspace` prop passed into `DesignStudioNormalView` | Accepted but never read anywhere in the component. There is no project picker in Normal Mode at all — `currentWorkspace` defaults to the MyaOS repo itself (`App.tsx:78`) and Design Studio never asks which project you mean. | [App.tsx:78](../../desktop/src/App.tsx#L78), [DesignStudioNormalView.tsx](../../desktop/src/views/normal/DesignStudioNormalView.tsx) |
| Generation calls in `DesignStudioNormalView` | Use `generateHtmlDesignWithGemini`, the **generic** freeform generator — not the faithful-reconstruction pipeline that already exists and already works. The sophisticated, project-grounded generator only exists in the old dev-mode `DesignStudioView`, which normal users never see. | Confirmed by direct comparison of the two views' imports. |
| `registered_workspaces` table | Exists, has the right shape (`name`, `path`, `git_url`), is empty. None of the four real Myavana repos are registered. | `sqlite3 data/myaos.db` |

### The one-sentence version of the gap

**The hard part — real filesystem scanning, real source-grounded generation,
real click-to-select, real versioned persistence, real task handoff — is
already built.** It's just sitting behind the *wrong front door* (the
developer-mode cockpit) and disconnected from a project picker. Normal Mode
users get a *different, weaker, non-project-aware* generator wearing the
same visual chrome (fonts, colors, "design system" labels) as decoration.

This reframes the whole vision doc's ambition level: most of the "we should
build X" items in Winston's message are really "we should **wire up** X,"
which is a much faster path to the "immediate ROI" he asked for.

---

## 4. What we are NOT doing in the near term (explicitly, so it doesn't get re-litigated)

- No React-component-native canvas (compiling real `.tsx` files live). iframe
  + generated HTML/Tailwind stays the rendering model.
- No multi-agent "explore 3 directions" fan-out generation yet — three
  parallel Gemini calls at ~15-30s each is a real latency/cost cost that
  needs its own UX (progressive reveal, cancellation) before it's worth
  building. Tracked as a Phase 3+ idea, not scoped now.
- No infinite-canvas/board mode, no presentation/play mode, no Git-style
  branch/commit UI for designs. All real ideas, all deferred until the
  single-screen, single-project loop is solid and used daily.
- No new coworkers or org changes. Muse already exists as a label; Phase 1
  makes the label true for one code path, nothing more.

---

## 5. Open decisions for Winston (not resolving these here)

1. Should the four Myavana repos be registered into `registered_workspaces`
   / `projects` now (so Design Studio has something real to list), or does
   project registration deserve its own short design pass first? Phase 1
   plan assumes a minimal hardcoded list of the 3 UI-bearing repos to avoid
   blocking on this, but it's worth confirming that's acceptable as a
   stopgap.
2. `Myavana-Chatbot` (the monorepo) has UI in `packages/widget` specifically,
   not at the repo root — should project scanning support pointing at a
   sub-path inside a monorepo, or do we register `packages/widget` as its
   own project? This affects the scanner's `workspace_path` contract. - its actually the wp site for hair journey managed by this important plugin project...a core myavana project../Users/winstonzulu/Local Sites/myavana-hair-journey/app/public/wp-content/plugins/myavana-hair-journey-next
3. Confirm `Myavana-Chatbot-Dashboard` as the Phase 1 pilot project (see
   audit above — it's the strongest structural match). If there's a
   different project Winston wants faithfully recreated first, Phase 1
   should target that instead.
