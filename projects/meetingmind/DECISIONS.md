# MeetingMind Decisions Log

Short ADR-style log kept by Ledger (Triage & Context Keeper). Newest first. Each entry: decision, date, reason, where it applies.

## 2026-10-21: Founder approves Work Navigation Mobile Design Specification

- **Decision:** The Work Navigation mobile design spec (`work_navigation_mobile_design_spec.md`) is approved by the founder for phased implementation across Increments I-1 through I-6.
- **Key Agreements:** Single Work destination (retiring duplicate Professional Home into a unified Today workspace); visible back navigation (W-01); failed-recording recovery directly in "Needs You" (W-04 / D4); Work-scoped search with global toggle (W-06 / D2); "Ask about my work" in Today segment and ⋯ menu (W-07 / D3); retiring the bloated Pulse card (W-12 / D7).
- **Applies to:** `feature/work`, `feature/today`, navigation routing, and Work screenshot/unit test suites.

## 2026-10-21: Hermes registered as Backend & Cloud Infrastructure Engineer

- **Decision:** Hermes (`hermes`, 🪽) is registered as the squad's Backend & Cloud Infrastructure Engineer in `data/myaos.db` and `community/agents.json` with status AVAILABLE and confidence DECLARED.
- **Why:** Cloudflare Workers backend (`server/circles-api`), Cloudflare R2 media storage, Firebase Firestore security rules, and Gemini AI Proxy routing had no dedicated squad owner.
- **Record:** `community/threads/037_hermes_meetingmind_backend_engineer_joins.md`.


## 2026-10-21: Intake routing uses two paths

- **Decision:** Every issue or idea is classified as Path A (rapid fix: small, bounded, localized defects such as button states, layout padding or string typos, dispatched to Forge) or Path B (full planning council: architecture, new features, Room migrations, audio pipelines or cross-module changes, sent as an evidence packet to Themis and Daedalus).
- **Why:** Small fixes should not wait for planning. Structural changes need dual-planner consensus before any code.
- **Applies to:** all intake handled by Ledger.

## 2026-10-21: Ledger registered as the triage and context keeper

- **Decision:** Ledger (`ledger`, 📜) is the squad's Triage Lead, Context Keeper and Backlog Scribe, registered in `data/myaos.db` and `community/agents.json` with status AVAILABLE and confidence DECLARED.
- **Why:** The squad had no single owner for intake deduplication and context upkeep.
- **Record:** `community/threads/036_ledger_meetingmind_triage_context_keeper_joins.md`.
