# KI-00 — Architecture Assessment: Organisational Knowledge & Work Intelligence Layer

**Package:** KI-00 · **Date:** 2026-11-04 · **Branch:** `ccr-c3616319-s6ogcc`
**Status:** Assessment of the repository *as it exists*, written before any KI code.
**Companion:** [`KI_DESIGN.md`](KI_DESIGN.md) (data model, services, work packages), [`ADR-KI-001`…`005`](adr/)

## 1. The most important finding: "V2" is not in this checkout

The V2 planning documents (`MYAOS_V2_WORKFLOW_AUDIT.md`, `…ENGINE_SPEC.md`, `…IMPLEMENTATION_PLAN.md`) describe a TypeScript runtime at `runtime/` with a store at `~/.myaos/runtime.db`, and a UI at `apps/desktop`. Neither `runtime/` nor `apps/desktop/` exists on this branch, on `origin/main`, or anywhere in git history (`git ls-tree -r origin/main`, `git log --all -- runtime apps` both empty). Those documents are written from the owner's machine and call the V2 runtime the canonical store, but the code is not here.

What *is* here:

| Path | What it is | Data store |
|---|---|---|
| `src/`, `bin/myaos.js` | Node (CommonJS) "v1" runtime: registry, tasks, inboxes, verifier, provenance, event bus, orchestrator, intelligence layer | `community/*.json`, `community/inboxes/`, `data/provenance.log`, and **`data/myaos.db`** (SQLite, schema in `data/schema.sql`) |
| `desktop/` | Tauri 2 + React 19 + Tailwind desktop. Data over Tauri IPC (`invoke`) to Rust (`rusqlite`) and PTY | reads `data/myaos.db` |
| `community/` | Threads, skills, tasks, agent registry, proposals | markdown / JSON |

`AGENTS.md` already tells us to treat `data/myaos.db`, `community/tasks/`, Node runtime files and desktop SQLite as **separate** stores.

**Consequence for this package.** I cannot "extend the V2 runtime's migrations" because they are not available to extend. Writing code against files I cannot see would be fiction. The honest path is:

1. Build KI as a self-contained subsystem with its own versioned, additive migrations (`ki_` table prefix) and a **typed `WorkPort`** through which it reads projects, tasks, agents and verification evidence. KI never copies or owns those entities.
2. Ship one concrete `WorkPort` for what exists (`data/myaos.db` shape and the Node `TaskManager`), and document the ~8-method contract a V2 port must implement.
3. Record the store question as ADR-KI-001 and raise it to the Orchestrator / Planning Council (thread 045). Moving KI into `runtime.db` is a configuration change (`dbPath`) plus a V2 `WorkPort`, not a rewrite. That is the reversible choice that does not pre-empt a foundational decision.

## 2. What can be reused

| Need | Existing asset | How KI uses it |
|---|---|---|
| Evidence vocabulary | `DECLARED / ATTESTED / OBSERVED / VERIFIED / UNKNOWN` in `src/provenance.js`, `evidence` table, `facts.evidence_class` | KI reuses the same five classes for knowledge verification and commitment evidence. No new vocabulary. |
| Independent verification rule | `src/verifier.js` rejects self-verification; `GEMINI.md` says missing telemetry is `UNKNOWN` | Commitment fulfilment requires non-self, runtime-observed evidence. |
| Projects, tasks, agents | `projects`, `tasks`, `identities`, `evidence`, `human_decisions` in `data/schema.sql`; `community/agents.json` | Read through `WorkPort`. Not duplicated. |
| Skill documents | `community/skills/<id>/SKILL.md` (contract in `community/skills/README.md`) | Context Assembly reads these files directly and pins the content hash in each package. Skills stay separate from knowledge. |
| Event / inbox plumbing | `src/events.js` (NDJSON bus), `src/inboxes.js` | Optional `notifier` port: stale-context alerts go to the Orchestrator inbox. |
| Provenance logging | `src/provenance.js` (append-only NDJSON) | Complemented, not replaced: KI keeps a **hash-chained audit table** in its own DB (queryable, tamper-evident) and can mirror entries to `ProvenanceEngine`. |
| DB capability | Node 22 `node:sqlite` with SQLite 3.53, **FTS5 available** (verified); `data/schema.sql` applies cleanly | No native modules, no new dependency. |
| Desktop conventions | `NavigationSidebar` view enum, `*View.tsx` files, `invoke()` IPC, Tailwind + lucide, light zinc/indigo styling (see `OKRIntelligenceView.tsx`) | New `KnowledgeIntelligenceView` follows these. |
| Existing knowledge seed | `facts` table (Phase 1), `src/intelligence/contextManager.js` (tier 0–3 packages; tier 3 explicitly "no data source") | KI's Context Assembly is the tier-3 data source; `facts` are importable as `fact` knowledge records (adapter, not a copy of truth, see §4). |

## 3. What needs extending

* **Context assembly.** `contextManager.js` ranks `facts` by keyword overlap and says so honestly. KI supersedes the selection logic with hybrid retrieval, authority ranking, permissions and a token budget, and keeps the same "tiered, additive" idea. `buildContextPackage` is left untouched and callable.
* **Evidence vocabulary on knowledge.** `facts` has no authority, supersession-by-decision, conflict records or provenance to a source message. KI adds those on its own table rather than altering `facts`.
* **Desktop navigation.** One new `DevViewType` (`knowledge`) and one `App.tsx` branch.

## 4. What is missing (the work)

Document store with versions and lifecycle; extraction; chunking; FTS + semantic retrieval; knowledge records with authority and conflicts; commitments register; source/provenance capture; permission engine; audit chain; background job queue; context packages; briefings and weekly review; agent tool surface; desktop screens; integrations. No existing code does any of these (no `documents`, `commitments`, `chunks`, embeddings, or ACL anywhere in `data/schema.sql`).

## 5. What must not be duplicated

| Entity | Source of truth | KI holds |
|---|---|---|
| Project, milestone | `projects`, `milestones` | Only `project_id` text references, validated through `WorkPort` at write time |
| Task, task status, task evidence | `tasks`, `evidence` (or V2 equivalents) | `ki_commitment_tasks` link rows (`task_id`, link kind). Task *status* is always read live, never cached |
| Agent / person identity | `identities`, `agents`, `agents.json` | The acting principal's id string. "People" in Sources & People is derived from authors/owners observed in KI records, not a roster |
| Delivery / verification state | task `evidence` rows | Read via `WorkPort.getVerification(taskId)` |
| Communications | inboxes, threads, Slack | A **captured, immutable copy of the excerpt** with a pointer back to origin. KI is not the system of record for the conversation, only for the fact that it was captured and what was derived |

Foreign keys to entities KI does not own are deliberately **soft** (text ids, checked by the port), because SQLite cannot enforce them across files and they may live in a different DB tomorrow.

## 6. Architectural conflicts and how they are resolved

| # | Conflict | Resolution |
|---|---|---|
| C1 | V2 docs name `runtime.db` canonical; code absent | Port-based design + ADR-KI-001 + escalation thread. No unreviewed foundational change. |
| C2 | `data/myaos.db` is a **git-tracked binary**; writing KI tables into it dirties the repo on every run | Default KI DB is a git-ignored sidecar `data/ki/knowledge.db`. `dbPath` may point at the runtime DB (tables are prefixed and additive). ADR-KI-002. |
| C3 | Repo code shells out to the `sqlite3` CLI or `better-sqlite3` (neither installed here) | KI uses `node:sqlite` only; no shell-out, no native build. Node 22 required (already the environment). Experimental-API warning is suppressed in the KI entry point only. |
| C4 | Desktop reads data via Rust `rusqlite` commands | Duplicating KI domain logic in Rust would create two implementations. The desktop calls one generic Tauri command that invokes the Node KI RPC (`bin/ki-rpc.js`). Node stays the single domain authority. ADR-KI-005. |
| C5 | Three overlapping stores for tasks (`community/tasks.json`, `tasks` table, desktop SQLite) | KI binds to one `WorkPort` at a time, chosen in config; never merges them. |
| C6 | `facts` is an existing knowledge table | Left intact. Facts can be *imported* as read-only `reference` records with `source = facts:<id>`; KI does not write back. |
| C7 | Existing proposals claim features (skill loader, planner router) that are not implemented | KI's skill loader is real but minimal (read + select + hash) and is documented as such. |

## 7. Recommended implementation boundaries

```
src/knowledge/
  core/        db, migrations, ids, errors, clock, audit, access (principals, ACL), security (injection, secrets)
  documents/   storage, extractors, chunker, repository, ingestion pipeline
  retrieval/   embeddings (provider interface), index, hybrid search
  knowledge/   records, authority, conflicts, decisions, extraction
  commitments/ register, state machine, extractor, evidence
  sources/     captured communications, adapters
  work/        WorkPort interface + adapters, work intelligence, briefings, weekly review
  context/     skills loader, context assembler, staleness
  jobs/        durable queue + worker
  tools/       agent-facing tool registry (schema-validated, permission-checked)
  index.js     composition root
bin/ki-rpc.js  JSON-in/JSON-out bridge for desktop and CLI
desktop/src/views/KnowledgeIntelligenceView.tsx
```

Each folder depends only on `core/` and on the *interfaces* of its neighbours. `work/` is the only folder that reads task/project state. `tools/` is the only folder that agents reach.

## 8. Risks I am accepting, stated plainly

* **Semantic search is a replaceable baseline.** There is no embedding model wired anywhere in this repo (confirmed by `contextManager.js`). The default provider is a local deterministic feature-hashing embedder (lexical-semantic: token + character n-gram hashing). It supports re-indexing, versioned model metadata and provider swap, and it is **labelled as such**; it is not a neural embedding. Remote/local-model providers implement the same interface.
* **Extraction of commitments and knowledge is rule-based by default.** An LLM extractor can be plugged into the same interface. Everything extracted is *proposed*, never accepted; confidence and `needs_confirmation` carry the uncertainty.
* **PDF / OCR depend on host tools** (`pdftotext`, `tesseract`) with a best-effort native fallback for text-layer PDFs. When unavailable the document lands in a visible, retryable `extraction_failed` state with the reason.
* **The Tauri/Rust bridge cannot be compiled in this environment**; it is small and flagged as unverified in the handover. The TypeScript UI is type-checked.
