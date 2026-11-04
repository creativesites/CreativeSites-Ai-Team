# KI — Organisational Knowledge & Work Intelligence: Design

**Status:** Implemented in `src/knowledge/` (see [Handover](KI_HANDOVER.md) for what is verified). Assessment: [`KI-00`](KI-00_ARCHITECTURE_ASSESSMENT.md). ADRs: [`adr/`](adr/).

## 1. Principles → mechanisms

| Principle | Mechanism |
|---|---|
| One source of truth per entity | `WorkPort` (read-only) for projects/tasks/agents/verification; KI stores only `ki_` entities and soft task ids |
| Provenance for every important fact | `ki_sources` (immutable originals, DB triggers), `source_ref_json` with doc/version/chunk/offset/quote, hash-chained `ki_audit` |
| Evidence ≠ interpretation | `evidenceType` (`original_evidence` / `extracted_information` / `ai_interpretation` / `human_stated`), `verification_class` (the existing DECLARED→VERIFIED vocabulary) |
| Commitments ≠ tasks | `ki_commitment_tasks` many-to-many; task status always read live; fulfilment gate |
| Context relevant, bounded, traceable | `ContextAssembler`: tiers + token budget + persisted package/items with fingerprints |
| Retrieval respects permissions | `checkRead` applied before anything is returned; derived records inherit source classification |
| Conflicts never silently discarded | `ki_conflicts`; both records kept; resolution by `knowledge.resolve` holder with rationale |
| Provider agnostic | `EmbeddingProvider`, `KnowledgeExtractor`, `CommitmentExtractor`, `StorageBackend`, `WorkPort` interfaces |
| Local-first, cloud-ready | SQLite/FTS5 + filesystem now; same SQL shapes map to Postgres (`tsvector`, `pgvector`); `StorageBackend` → S3/GCS |

## 2. Data model (`ki_` tables, migration 1)

```
ki_documents ──< ki_document_versions ──< ki_chunks ──(ki_fts, ki_embeddings)
     │  └──< ki_document_links (project|task|job|workflow|conversation)      ki_doc_text (extracted text per version)
ki_sources (immutable evidence) <── ki_knowledge ──< ki_knowledge_relations
                                         │  └── ki_decisions (1:1 with a decision-type record)
                                         └──< ki_conflicts (a_id, b_id)
ki_sources <── ki_commitments ──< ki_commitment_tasks (soft task_id)
                    ├──< ki_commitment_evidence     └──< ki_commitment_history
ki_context_packages ──< ki_context_items            ki_reports (persisted weekly reviews)
ki_jobs (durable queue)  ki_events (change feed)  ki_audit (append-only hash chain)  ki_settings  ki_schema_migrations
```

* **Ownership:** every row has `org_id`; most have `project_id` (soft). **Deletion:** nothing is hard-deleted except via `DocumentRepository.delete` (owner, archived-first, no legal hold/retention) which leaves a tombstone and audit; sources are redacted not deleted; audit is append-only (triggers).
* **Immutability enforced by the database:** `ki_sources` original text/hash, `ki_document_versions` content hash/storage key/size, `ki_audit`.
* **Indexes/uniques:** content hash per document, lineage per org+project, source message identity per platform/workspace/channel, one active job per (type, entity), unique extracted commitment per source.
* **Migrations:** versioned, additive, SHA-256 checksummed; a pre-upgrade `VACUUM INTO` backup is taken when upgrading a non-empty DB.

## 3. Services and boundaries

`DocumentRepository` · `SearchService`/`SearchIndex` · `KnowledgeService` (+conflicts, decisions, extraction) · `SourceService` (+adapters) · `CommitmentService` (+extractor, deadlines) · `WorkIntelligence` · `Briefings` · `ContextAssembler` (+`SkillLoader`) · `JobQueue`/`Worker` · `ToolRegistry` · `rpc`. Each takes a `principal` as first argument and never reads identity from input.

### Lifecycles
* **Document version:** `received → stored → extracting → extracted → indexing → indexed → available`, plus `failed` (visible, retryable), `reprocessing`, `superseded`, `archived`. A version becomes *current* only at `available`, atomically; failure leaves the prior version current.
* **Knowledge:** `proposed → accepted → verified`; `disputed` (open conflict), `superseded`, `archived`. Authority ladder 0 inference · 1 informal/extracted · 2 documented · 3 approved · 4 verified · 5 mandated. Only `knowledge.approve` holders who did not author the record can raise authority; `mandated` is owner-only; `verified` needs OBSERVED/VERIFIED evidence from a non-author.
* **Commitment:** `detected → needs_confirmation → accepted → assigned → in_progress → fulfilled`; also `rejected, cancelled, blocked, superseded`. **`overdue` is derived** (deadline passed while active), not stored, so the real state is never overwritten (ADR-KI-004). `fulfilled` is reachable only via `fulfil()`.

### Fulfilment gate
Linked tasks: every one must be `WorkPort.getVerification(...).verified` (task done + passed OBSERVED/VERIFIED evidence from someone other than the assignee). No linked tasks: ≥1 independently verified commitment evidence covering every acceptance criterion. Agents' own evidence is stored `DECLARED`. The responsible party cannot fulfil or verify their own commitment.

### Retrieval
FTS5 (bm25, title-weighted) + semantic (cosine over stored vectors) → Reciprocal Rank Fusion → × authority × status × recency. Filters (project, category, author, source, dates, type, status) and permission/currency/quarantine filtering run before ranking output. Results carry `explain` and a typed `citation`. Brute-force vector scan is deliberate at local scale; pgvector/HNSW is the hosted path (ADR-KI-003).

### Context assembly
T0 constraints + task; T1 authoritative policy/instruction + relevant accepted requirements/decisions; T2 task-linked commitments, document excerpts, skills (selected, hash-pinned); T3 lessons, high-impact recent changes, people. Persisted with per-item rationale, authority, fingerprint; excluded items and warnings recorded. Staleness compares fingerprints and relevant new events; only impact ≥ threshold notifies the Orchestrator (once).

### Security
Untrusted content: injection scoring per chunk (quarantined from agent search/context by default, still visible to humans, flagged), secrets redacted from indexes/sources and the document auto-restricted, evidence envelope on all document text, fixed system-constraint preamble first. Tool inputs are schema-validated with `additionalProperties:false` (no field exists for authority/role/classification escalation). Denied reads look like "not found" and are audited.

## 4. Event flows
1. **Upload:** `ingest` → store bytes → version `stored` → job `process_version` → extract → chunk → FTS → embeddings → promote → job `extract_knowledge` → *proposed* knowledge with source refs → events.
2. **Message:** `sources.capture` (immutable) → `commitments.extractFromSource` → `needs_confirmation` → `confirm` → `assign`/`linkTask` → tasks run in the work system → independent verification there → `fulfil`.
3. **Task start:** `context.assemble` → package → agent works → `reportUsage` → later `checkStale`/`refresh`.
4. **Week end:** `scripts/ki-weekly-review.js` (idempotent per ISO week) or on-demand.

## 5. Work packages

Parallelism: **KI-01 first (owns the schema)**; then {02,05,07,08} in parallel; {03,04} after 02; 06 after 05; 09 after 05/07 + WorkPort; 10 after 04,05,07; 11 after all services; 12 after 11's RPC; 13 after 09; 14 after 02/08; 15 continuous. Schema, `WorkPort`, `access.js` and shared UI primitives have a single owner (lead) – other packages request changes through the lead.

| Pkg | Objective | Deps | Deliverables / interfaces | Acceptance (tests) | Status |
|---|---|---|---|---|---|
| KI-00 | Inspect & design | – | Assessment, this doc, ADRs | Reviewed; escalation thread 045 | Done |
| KI-01 | Schema & migrations | 00 | `core/migrations.js`, `db.js` | `engineering.test` migrations/constraints | Done |
| KI-02 | Storage & versioning | 01 | `LocalFileStore`, `DocumentRepository` | A: dup, versions, immutability, retention/delete | Done |
| KI-03 | Ingestion/extraction | 02 | extractors (text, md, csv, code, html, vtt, docx, xlsx, pptx, pdf, OCR hook), chunker, queue | A: formats, failure/retry, concurrency | Done (OCR/PDF need host tools for full fidelity) |
| KI-04 | FTS + semantic | 03 | `SearchIndex`, `SearchService`, `EmbeddingProvider` | A: NL search; index recovery; relevance corpus | Done (hashing embedder default) |
| KI-05 | Knowledge records | 01 | `KnowledgeService`, extraction | A, D, authority tests | Done |
| KI-06 | Decisions/authority/conflicts | 05 | decisions, conflicts | D | Done (heuristic detector) |
| KI-07 | Commitments | 01 | `CommitmentService`, extractor, deadlines | B | Done |
| KI-08 | Provenance | 01 | `SourceService`, audit chain | B (immutable), F (audit) | Done |
| KI-09 | Work intelligence | 05,07 | `WorkIntelligence`, `WorkPort` | E, real-DB smoke | Done |
| KI-10 | Context assembly | 04,05,07 | `ContextAssembler`, `SkillLoader` | C | Done |
| KI-11 | Tools & permissions | all | `ToolRegistry` (41 `ki.*` tools) | F tools | Done |
| KI-12 | Desktop UI | 11 | 7-tab view + Tauri bridge | tsc + UI contract + RPC e2e | Done (Rust unbuilt here) |
| KI-13 | Weekly review/briefings | 09 | `Briefings`, script | E | Done |
| KI-14 | Integrations | 02,08 | Slack payload adapter, folder import, threads import | F scope tests | Done (no live Slack connector) |
| KI-15 | Test/sec/obs/docs | – | 31+ tests, health(), docs | `npm run test:knowledge` | Done |
