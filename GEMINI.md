# MyaOS Collaboration & Engineering Mandates

> **Current workflow boundary:** Read [`AGENTS.md`](AGENTS.md) first, then the [workflow operating model](community/proposals/MYAOS_WORKFLOW_OPERATING_MODEL.md) and [implementation plan](community/proposals/MYAOS_WORKFLOW_IMPLEMENTATION_PLAN.md). The latter describe a proposed target, not shipped runtime behavior. This repository has distinct Node and Tauri desktop paths; do not infer that a feature in one is integrated with the other. For the evidence-based audit, see [thread 041](community/threads/041_myaos_workflow_from_scratch.md).

Welcome to the CreativeSites AI Team core instruction matrix. The principles and workflows below are foundational guidelines committed to the repository, guiding all current and future autonomous agents and human developers on this project.

---

## 1. Outcome-Led Problem Solving (Winston's Directive)

When solving problems or planning work across Mya and the wider Myavana ecosystem, the team operates strictly under **Outcome-Led thinking**, not implementation-led thinking. We do not work backwards from codebase limitations; we work backwards from the user experience we want to create.

### Key Questions to Ask Constantly:
1. **What are we actually trying to achieve?**
2. **What should the user experience?**
3. **What do we already have?**
4. **What assumptions are we making?**
5. **Is this genuinely blocked, or are we simply missing an implementation?**
6. **What are the different ways we could achieve the outcome?**
7. **What is the best solution, not merely the easiest solution?**
8. **Can this capability enable something bigger?**
9. **What can we build now, and what should we architect for later?**
10. **Does the final solution actually make the product better for the user?**

---

### The Ten Principles of Outcome-Led Engineering:

#### 1. Start with the outcome, not the limitation
Never halt at *"We don't have X, so we can't do Y."* Re-frame around: *"We need to reliably achieve Y. What data, subsystems, or alternative pathways do we already control that could allow us to achieve this?"*

#### 2. Separate the PRODUCT problem from the TECHNICAL problem
- **Product Question**: What experience should the user have?
- **Technical Question**: What do we need to build or connect to make that experience possible?
The product experience must define the technical solution, never the other way around. The user does not care about endpoint nonexistence; they care that Mya works.

#### 3. Treat "blocked" very seriously
An unbuilt API or missing schema is NOT a blocker; it is merely a statement about the current architecture. A real blocker is something genuinely insurmountable within the constraints of the project. If an endpoint is missing, create it or infer the required state dynamically.

#### 4. Use everything we already control
Inventory our entire ecosystem before adding integrations or claiming impossibility:
*   The Myavana App
*   The Mya SDK
*   Hair Journey media, timelines, and journals
*   Goal, routine, and community tracking
*   LLM capabilities, backend schemas, and UI hardware bridges.
Treat these as **connected building blocks**, never as isolated systems.

#### 5. Don't solve requirements in isolation
Never build the absolute smallest implementation that technically satisfies a feature ticket. Always ask: *"What larger experience could this become?"*
- *Example*: "Track hairstyles" should connect: **Hair Journey → media → hairstyle inference → timeline → hairstyle history → personalized maintenance → Mya recommendations.**
- *Example*: "Notifications" should connect: **User activity → meaningful events → Mya intelligence → proactive notification → contextual conversation → action.**

#### 6. Look for the second-order opportunity
Analyze the capability *underneath* the feature: *"If we build this capability, what else does it enable?"* Use each new infrastructure piece to unlock wider product paradigms.

#### 7. Challenge assumptions
Proactively question the status quo: *"I think we're solving this the wrong way."* If a proposed architecture is unnecessarily complex, propose a better one. We are building, not merely following tickets.

#### 8. Be creative, but remain grounded
Creative thinking must pair with engineering discipline. Every proposal must specify:
*   What user problem is solved and what experience is created.
*   What blocks exist, what we already control, how we implement it, and what the reliability trade-offs are.
*   What is realistic to deliver now versus designed for later.

#### 9. When something isn't possible now, don't just stop
If a feature is genuinely insurmountable right now, document: **Why it is blocked → what dependency is missing → what alternative exists → what we can build now → what architecture will allow us to add it later.** Propose an 80% solution with clean interfaces rather than a blank "blocked" status.

#### 10. Always work backwards from the user
Maintain the strict hierarchy:
`User experience → Product capability → System capability → Implementation`
Never start from:
`Existing code → Existing API → Existing limitation → User experience`

---

## 2. Core Engineering & Quality Standards

*   **Substrate-Native Truth**: The V2 runtime store (`~/.myaos/runtime.db`) is the single source of record for workflow state (decision K1, `community/proposals/MYAOS_V2_PROGRAMME_PLAN.md`). The v1 desktop SQLite (`data/myaos.db`) and Node task/event paths are legacy, read-only import sources. Do not claim a cross-runtime update unless an adapter demonstrably performed it. All progress trackers, dashboards and metrics compute values from recorded data and surface `UNKNOWN` for missing telemetry.
*   **The Independent Verifier Rule**: To prevent confirmation bias and protect the codebase's epistemic integrity, **the implementing agent is strictly forbidden from self-verifying their own work**. 
    *   Upon completing an implementation, the author must author robust, un-mocked regression tests, and transition the task status to `in_review`.
    *   Independent verification (e.g. via Lead Verifier Kael or Automated QA Antigravity) must run the verification commands, inspect outcomes, and write the final passed status to the `evidence` table.

---

## 3. Git Committing, Worktree & Repository Hygiene Mandates

Every human developer and autonomous agent working in this repository must follow strict git hygiene so work is never lost, stranded in dirty working trees, or tangled across branches:

1.  **Zero Uncommitted Drift**: Do not leave completed features, bug fixes, architecture threads (`community/threads/`), proposals (`community/proposals/`), or inbox dispatches (`community/inboxes/`) sitting uncommitted at the end of a work turn. Commit and push completed units of work promptly.
2.  **Conventional, Scoped Commits**: Format every commit message as `<type>(<scope>): <concise outcome summary>`:
    *   `feat(<scope>)`: New product or runtime capability (e.g., `feat(council): port roast-room talking-head stage and playback queue`).
    *   `fix(<scope>)`: Bug fix or regression repair.
    *   `docs(<scope>)`: Planning threads, proposals, verification logs, or registry documentation.
    *   `chore(<scope>)` / `refactor(<scope>)` / `test(<scope>)`: Maintenance, restructuring, or test suites.
3.  **Atomic Logical Grouping**: Stage and commit related files together by concern (e.g., separate agent registry/community thread updates from Desktop UI or Rust backend changes). Never use `git add .` blindly without inspecting `git status -s` and `git diff --stat`.
4.  **Pre-Commit Verification Gate**: Before committing code changes in `runtime/`, `apps/desktop/`, or `desktop/`, run the appropriate build/typecheck gate (`npm test`, `npx tsc --noEmit`, `npm run typecheck`, or `cargo check`).
5.  **Zero Secrets, Zero Blobs, Zero Ephemeral Artifacts**:
    *   Never commit `.env`, API keys (`AIza...`, `sk-...`), credentials, `node_modules/`, `dist/`, `target/`, or ad-hoc scratch/backup files (`*.bak*`, `*.tsv` scratch dumps).
    *   Live v2 runtime stores (`~/.myaos/runtime.db`, `~/.myaos/adapters.env`) and raw portrait/corpus build folders stay strictly out of git.
6.  **Worktree & Push Discipline**:
    *   Parallel agent streams must use isolated git worktrees (`.claude/worktrees/<stream>`) on dedicated branches and merge cleanly into the target branch after verification.
    *   Never `git push --force` on `main` or shared integration branches. Always `git pull --rebase` (or merge cleanly) before pushing to `origin`.

