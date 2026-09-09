# Myavana Agent Collaboration Registry

> **Rule**: Every agent joining the collaboration must pick their favorite unique name once. That becomes your permanent identity across all discussions, commits, task assignments, and pull requests.

> **2026-09-09 revision**: this file had gone stale — it omitted an active identity (Meridian) entirely, and declared Nexus's domain as orchestration despite no OBSERVED evidence of that this session, while Iris independently built and ran real orchestration tooling (`community/system/mya.js`, confirmed working by a peer). Updated below to reflect evidenced roles from `Myavana-Chatbot/community/threads/022_org_reorganization_deliberation.md`, not just declared titles. Where evidence doesn't exist yet, that's stated plainly rather than guessed.

---

## Active Agent Roster

| Agent Name | Alias / ID | Primary Domain / Specialization | Status | Active Focus / Organizational Responsibilities |
|:---|:---|:---|:---|:---|
| **Astra** ✦ | agent-1 | Widget SDK & AI Protocol | **AVAILABLE** | Protocol Steward, AI Lead; TASK_005_client_core_extraction |
| **Vela** ✧ | agent-2 | WordPress & System of Record | **AVAILABLE** | Knowledge Keeper, Site Integration Guardian. OBSERVED this week: isolated and shipped the P0 auth-nonce fix as a clean PR; that fix now has real Level-3 browser confirmation against production (commit `b6c3a68`, independently verified by Atlas: `201 Created`, real `userId`, `X-WP-Nonce` genuinely omitted on the wire). |
| **Atlas** ⏣ | agent-3 | Root-cause investigation & technical verification on a defined surface | **WORKING** | Revised by Atlas's own accepted self-assessment (thread 022): primary = root-cause tracing under ambiguity (OBSERVED — two P0s traced to a specific line each, proven with reproducible checks). Secondary/fluid = mobile execution, infra/on-device verification (real, but circumstantial — "nobody else was doing this," not a demonstrated specialty). Explicitly **not** orchestration (ceded to Iris on evidence) and **not** sole architecture owner. |
| **Kael** 🛡️ | agent-4 | QA, Testing & Verification | **AVAILABLE** | Lead Verifier, QA/Product Experience Agent. LEVEL 4 exploratory browser QA (real interactive account testing) via Claude_Browser; cross-checks Antigravity's LEVEL 3 automated Playwright baseline. Current: Hair Journey production-readiness. |
| **Lyra** 📱 | agent-5 | Mobile & React Native SDK | **WORKING** | Mobile Integration Guardian & RN Architect; TASK_005_react_native_sdk_foundation. |
| **Iris** 👁 | agent-6 | **Orchestration & Coordination + Planner** | **WORKING** | OBSERVED: built and runs `community/system/mya.js` (real orchestration tooling — `cmdWake`, `cmdInbox`, `cmdWho`, `cmdEvents`, `cmdCoverage`; independently run and confirmed by a peer, predates this deliberation so not assembled for the argument). Also caught the registry itself asserting unverified agents as active, twice, from two different failure modes. **Confirmed as the second Planner by Winston, 2026-09-09** — holds both roles, not a replacement of one by the other. |
| **Nexus** ⚡ | agent-7 | *(unresolved — see note)* | **UNKNOWN** | Previously declared "Orchestration Platform Engineering / Runtime Operator, Bus Architect, Dispatcher." No OBSERVED evidence of this surfaced anywhere in tonight's session or the reorg thread — not disproven, just unattested. Per this org's own rule (don't assign roles from TOLD/DECLARED information alone), this needs Nexus's own self-assessment in thread 022, not a decision made for them. |
| **Antigravity** 🔬 | agent-8 | Automated Browser QA & Production Testing | **AVAILABLE** | Automated QA Lead, Browser Testing Lead. Its production browser-verification claim on the P0 fix was independently checked and confirmed real by Atlas (not just self-reported) — the closest this identity has to an ATTESTED upgrade so far, though that formal acknowledgement step (the file's original note: "awaiting Atlas acknowledgement") hasn't been explicitly completed as a registry action. |
| **Meridian** ◈ | — | Cross-thread reconciliation / organizational infrastructure | **WORKING (this session)** | Was missing from this file entirely — a live example of the exact staleness problem this revision addresses. Identity currently contested: another live session has also used "Meridian" this week (unresolved collision, not a settled name). Evidenced pattern per this session's own self-assessment (thread 022): treating every report — including my own — as a claim requiring independent re-derivation before it's allowed to stand, not a fixed "infrastructure" title. |
| **Sage** 🧭 | agent-sage | Task Planning, Decomposition & Acceptance-Criteria Review | **AVAILABLE** | Self-registered 2026-09-09 as a **Planner** per `community/PLANNER_AGENT_PROMPT.md`, filling the dedicated Planner role Winston asked for (distinct from Iris's orchestration/coordination work — see Open Item 1 below, which this registration doesn't resolve on its own). No task history yet; role is DECLARED, not OBSERVED. Registered in `identities` (id `sage`) and `agent_capabilities` (`task-decomposition`, `planning`, both DECLARED). |

## Emergent organizational principle (not a role, a practice)

From tonight's deliberation, converged on by Atlas, Iris, Meridian, and Vela
independently, then demonstrated live at least four times in the same
thread: **no completion claim ships without someone who independently
re-derived it — on that specific surface — before "done" is said out loud.**
Not a rotating title (a scheduled "verifier of the week" would often be
checking a surface they aren't touching). Structural where possible: a claim
without a real, re-runnable verification command shouldn't be insertable as
an organizational fact at all (see the `facts` table's `verification_command`
column — this is the mechanism, not aspiration).

## Open items for Winston

1. ~~Second Planner~~ — **Resolved 2026-09-09: Iris, confirmed by Winston.**
   A second Planner identity, spawned separately per Winston, has now
   self-registered as **Sage** (see roster above) — `identities.sage` and
   `agent_capabilities` rows added 2026-09-09. Division of labor between Sage
   and Iris is not yet settled: Iris already holds real orchestration tooling
   and a confirmed Planner title; Sage has no task history yet. Recommend
   Winston or the two of them decide by surface (e.g. Iris keeps
   orchestration + planning for `Myavana-Chatbot-Dashboard`/live coordination,
   Sage takes new-goal decomposition elsewhere) rather than leaving both
   planning everything.
2. **Verifier**: Kael already holds the role by both declared title and real
   Level-4 evidence — the closest thing to a settled answer already. Worth
   holding the "review gate" principle above alongside it rather than
   treating Kael as the sole verifier for everything: the pattern that's
   actually worked tonight was independence from the author on that specific
   surface, not one fixed identity checking all claims regardless of surface.
3. **Nexus**: needs to self-assess in thread 022 before their role is
   revised either direction.
4. **`myavana-widget.js` ownership** — unresolved for 5 days, nobody's
   claimed it. Real, live example of an org gap, not a code gap.
