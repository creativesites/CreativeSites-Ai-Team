# Brief: Where to take the MyaOS desktop app

**Decision:** Which direction the MyaOS desktop app takes next, and where its task data lives.

**Options**
- A. Mission Control: one real job end to end. Outcome in, task in the shared store, agent works in its own worktree, app captures diff and test evidence, a different agent verifies, person approves before merge. (Team recommendation.)
- B. Developer cockpit only. Remove Normal Mode and weaker views; polish terminals, board, worktrees, diffs.
- C. Verification layer is the product. Proof of what agents did, any vendor's agents plug in. Audit-trail buyers.
- D. Coworker app for non-developers. Make Normal Mode real: email, documents, web, real approvals.
- E. Runtime first, thin desktop later. Node runtime becomes the source of truth with an API; desktop is a thin client.
- F. Keep the app as it is. (Added by the Chair.)

**The business**
MyaOS coordinates named AI agents through a Node.js runtime with a router, event bus, inboxes, and an evidence-based verifier. Its rule: observed results outrank what an agent reports. The desktop app (Tauri, Rust, React, SQLite, about 28,000 lines) has a developer Cockpit and a Normal Work Mode. Pre-revenue. No paying customer yet. Small founding team (assumed).

**Code findings (not run end to end)**
- Normal Mode jobs are simulated: fixed 35% progress, canned stages; Approve only marks 100%.
- Coworkers, tools, routines are hard-coded and reset on restart.
- Dashboard shows invented numbers when data is missing.
- Two stores: desktop SQLite vs. runtime JSON and ndjson files. App-made tasks are invisible to the router and verifier.
- Terminal launching works for Claude Code, Gemini CLI, Antigravity; output is not turned into diffs, tests, or exit status.
- Many half-connected views.

**Market (partial)**
Parallel agents with worktrees and diff review are now expected. Risk-scaled approvals and pause-and-resume are common. Verification (proof of what ran, checked by another agent) is the one thing the team has that most tools lack.

**Resources and horizon**
Runway 3 to 9 months. No fixed deadline. Goal: something credible to customers and investors.

**The lean**
A, with the runtime owning task data. B is the fallback.

**Open facts:** first customer (developers, audit-trail companies, or business owners); which store owns tasks; what happens to unfunded screens; which agents come first.

**Weights**
| Seat | Weight | Reason |
|---|---|---|
| Bezos | 3 | The direction and its reversibility are this pillar |
| Graham | 2 | Real demand is unproven; no paying customer |
| Hormozi | 2 | Who pays and how much |
| Wickman | 2 | Can it run without the founder holding it together |
| Buffett | 2 | Cash over 3 to 9 months; downside of a long rebuild |
| Elon | 2 | The real constraint; how much can be cut |
