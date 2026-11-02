# Thread 027 — MyaOS Design Studio Phase 1: wire Normal Mode to the real, already-built faithful-recreation pipeline

**Author**: Claude Code (with Winston)
**Status**: PROPOSAL — planning document, no code written yet
**Date**: 2026-09-15
**Related Files / Specs**:
- Companion doc: [[026_myaos_design_studio_vision_and_audit]] (read first — this plan only makes sense against that audit)

---

## Objective, in one line

By the end of Phase 1: open Normal Mode → Design → pick **Myavana-Chatbot-Dashboard**
→ pick a real screen (e.g. "Products" or "Campaigns") → see MyaOS's actual
recreation of that screen, grounded in the real source it scanned → click an
element, ask Muse to change it, watch it iterate → hand off to build a real
tracked task. No fake tokens, no fake accessibility score, no orphaned
`currentWorkspace` prop.

This is deliberately **not** a rewrite. Per [[026_myaos_design_studio_vision_and_audit]]
§3, the hard engineering already exists in `DesignStudioView.tsx` and the
Rust backend. Phase 1 is a wiring and pruning project, not a build project.

---

## Why Myavana-Chatbot-Dashboard first

From the audit: it's a Next.js app with `src/app` (17+ real routes),
`src/components`, and `src/app/globals.css` — exactly the shape
`myaos_inspect_workspace_ui_structure` already scans for, with zero backend
changes needed. `MyAvana_FrontEnd_RN` needs a different (approximated)
rendering strategy since it's React Native, and `myavana-test-fulfillment`
has no UI at all. Starting with the dashboard gets a true "faithful
recreation" — not an approximation — as the very first demo, which is what
"immediate ROI" requires: the first thing Winston sees has to actually be
the real UI, not a caveat.

---

## Phase 1 scope, broken into shippable steps

### Step 1 — Give Design Studio a project picker (currently doesn't exist)

-start with myavana hair journey site from here:
/Users/winstonzulu/Local Sites/myavana-hair-journey/app/public/wp-content/plugins/myavana-hair-journey-next

-the designer can even use the project assests like css and js to save on tokens and also for more faithful representations.

- Add a project selector to `DesignStudioNormalView`'s header, replacing the
  fake `SAMPLE_DIRECTIONS` picker as the primary control (directions become
  secondary/optional once a real design system is extracted — see Step 2).
- Initial list: hardcode the 3 UI-bearing Myavana repos with their real
  absolute paths (`Myavana-Chatbot-Dashboard`, `Myavana-Chatbot` →
  `packages/widget`, `MyAvana_FrontEnd_RN`) rather than blocking on the
  `registered_workspaces` question raised in the audit (open decision #1).
  This is an explicit, visible stopgap — a `TODO` comment pointing at
  [[026_myaos_design_studio_vision_and_audit]] §5, not a silent hack.
- Selecting a project actually sets the workspace path used for scanning —
  finally giving the dead `currentWorkspace` prop (or a Design-Studio-local
  equivalent) a real purpose.

### Step 2 — Replace the fake design-system extractor with the real scanner

- Delete the hardcoded return in `extractDesignSystemFromWorkspace` (or
  retire the function outright — see below).
- On project selection, call `myaos_inspect_workspace_ui_structure` (already
  exists, already works) to get real routes/screens/components/style tokens.
- Persist the result via the already-existing
  `myaos_save_project_design_philosophy` / `myaos_save_project_component`
  commands instead of only holding it in React state, so a second visit to
  the same project doesn't re-scan from scratch. (The DB tables and commands
  for this already exist — Step 2 is calling them, not building them.)
- Surface real extracted values in the "Design System" panel: actual
  filenames found, actual color/font values pulled from `globals.css` /
  `tailwind.config.*`, not the three fictional palettes.

### Step 3 — Swap the generator: generic → faithful

- Replace `generateHtmlDesignWithGemini` calls in `DesignStudioNormalView`
  with the faithful-reconstruction function family already built in
  `geminiOrchestrator.ts` (the one that grounds generation in
  `ProjectUiScanData` and already force-injects the click-to-select
  inspector). This is the single highest-leverage change in Phase 1 — it's
  the difference between "AI guesses a design" and "AI recreates *your*
  design."
- Keep `generateHtmlDesignWithGemini` around as the fallback path for the
  "start from nothing" / no-project-selected case (still useful, per
  [[026_myaos_design_studio_vision_and_audit]] §2 point 1) rather than
  deleting it.

### Step 4 — Real screen list instead of two hardcoded sample screens

- Once a project is scanned, populate the screen tabs from
  `scanData.screens` / `scanData.routes` (real filenames like
  `products/page.tsx`, `campaigns/page.tsx`) instead of the hardcoded
  "01 Hero & Platform Overview" / "02 Coworkers Roster" MyaOS-themed samples,
  which are irrelevant once a real project is selected.
- Persist generated screens via `myaos_save_project_screen_version` (exists)
  so versions survive a restart.

### Step 5 — Remove fabricated UI

- Delete the static "Accessibility: 96/100 (Passed) · Verified by Kael" bar.
  Per [[026_myaos_design_studio_vision_and_audit]] §2 point 5, real
  accessibility scoring is out of scope for Phase 1 — a fake passing score
  is actively misleading and should not ship, not even temporarily.
- Confirm the "Build with MyaOS" handoff (already fixed today to carry real
  HTML instead of just a title) is exercised against a Phase-1 faithful
  screen end to end, and that `myaos_dispatch_design_update_task` — the
  real, already-built task/branch creator — is used for this handoff
  instead of (or alongside) the generic `handleStartNormalJob` PTY spawn,
  since it already produces a properly branched, trackable task tied to the
  actual project and screen version.

### Explicitly out of scope for Phase 1

Everything in [[026_myaos_design_studio_vision_and_audit]] §4: multi-screen
flows, board/infinite canvas, presentation mode, "explore 3 directions,"
Kael verification, design-system import from GitHub, React-native-canvas
rendering. Each is a real future direction, not a Phase 1 dependency.

---

## Concrete "done" criteria

Phase 1 ships when all of these are true, checked by actually running the
app (not just compiling):

- [ ] Design Studio shows a project picker with at least the 3 UI-bearing
      Myavana repos, and selecting one changes what gets scanned/generated.
- [ ] Selecting Myavana-Chatbot-Dashboard and a real route (e.g. Products)
      produces an iframe preview that visibly matches that route's actual
      layout/copy/components — not a generic SaaS template.
- [ ] The "Design System" panel shows values that came from that project's
      actual `globals.css`/component files, verifiable by spot-checking one
      color or font against the source file.
- [ ] Clicking an element in the canvas pins a real selector (via the
      already-fixed `CANVAS_ELEMENT_SELECTED` inspector) and a chat
      instruction referencing "this button" actually targets that element.
- [ ] Re-opening the same project/screen after restarting the app shows the
      previously generated version, not a re-generated/blank one (proves
      persistence is wired, not just in-memory state).
- [ ] The fake accessibility badge is gone.
- [ ] "Build with MyaOS" on a Phase-1-generated screen creates a real,
      inspectable task row (via `myaos_dispatch_design_update_task` or
      equivalent) with the actual generated HTML as its spec, not just a
      title string.

---

## Sequencing note

Steps 1–3 should land together (a project picker with no real extraction
behind it, or extraction with no faithful generation behind it, are both
half-features that would just move the "looks real, isn't" problem rather
than fix it — the exact failure mode this whole effort is correcting for).
Steps 4–5 can follow immediately after in the same work session.

No timeline estimate is given here since it depends on who picks this up;
this doc defines the *shape* and *order* of the work, not the schedule.
