# Thread 045 — Knowledge & Intelligence layer: foundational question for the Orchestrator / Planning Council

**From:** KI technical owner · **Date:** 2026-11-04 · **Type:** escalation (decision requested, work is not blocked)

**Facts (verified):** `runtime/` and `apps/desktop` — described as canonical V2 in `MYAOS_V2_WORKFLOW_*` — do not exist in this repository (`git ls-tree -r origin/main`, `git log --all -- runtime apps`: empty). Only the Node runtime (`src/`), `data/myaos.db`, and the Tauri `desktop/` exist.

**What I did instead of guessing:** built KI against a read-only `WorkPort` (ADR-KI-001) with a sidecar DB (ADR-KI-002). Nothing in V2 was changed.

**Decisions requested**
1. Which store is canonical for projects/tasks/verification today: `data/myaos.db` or the (unavailable) V2 `runtime.db`? Provide the V2 `WorkPort` implementation (≈7 read methods) when V2 lands in this repo.
2. Should KI's tables move into the canonical DB (config change) or stay in a sidecar?
3. Who owns the `knowledge.approve` / `knowledge.resolve` roles for humans (`owner`, `approver` today)? Agents are never granted them.
4. Real embedding provider: which model/endpoint (local vs remote), given data-classification policy?
5. Real Slack connector: authorised workspaces/channels (adapter requires an explicit allow-list).

**Interim assumption (reversible):** work state is read from `data/myaos.db`; KI sidecar at `data/ki/`.
