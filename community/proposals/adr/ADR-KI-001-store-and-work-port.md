# ADR-KI-001 — KI reads work state through a `WorkPort`; the canonical store is not decided here

**Status:** Accepted for KI; **escalated** to Orchestrator / Planning Council (thread 045). **Date:** 2026-11-04
**Context.** V2 docs name `runtime.db` canonical, but `runtime/` is absent from this repository (KI-00 §1). `AGENTS.md` says treat `data/myaos.db`, `community/tasks/`, Node files and desktop SQLite as separate.
**Decision.** KI never stores projects/tasks/agents/verification. It calls a 7-method read-only `WorkPort`. Shipped ports: `SqliteWorkPort` (`data/schema.sql` shape), `JsonTaskWorkPort` (`community/tasks.json`), `StaticWorkPort` (tests). A V2 port is the only thing needed to bind KI to `runtime.db`.
**Consequences.** + No second source of truth, reversible. − Task ids are soft references; a task deleted upstream shows as `missing` in commitments rather than failing referentially. Verification semantics (independent, observed evidence) live in the port and must be preserved by any new port.
**Finding while building it.** Against the real `data/myaos.db`, completed tasks are reported *not verified* when the evidence verifier equals the assignee (e.g. verifier `synapse` on a done task) — the port refuses to count self-verification, consistent with `src/verifier.js`.
