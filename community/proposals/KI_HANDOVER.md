# KI Handover — Organisational Knowledge & Work Intelligence Layer

**Date:** 2026-11-04 · **Branch:** `ccr-c3616319-s6ogcc` · Design: [`KI_DESIGN.md`](KI_DESIGN.md) · Assessment: [`KI-00`](KI-00_ARCHITECTURE_ASSESSMENT.md) · ADRs: [`adr/`](adr/) · Escalation: [thread 045](../threads/045_knowledge_intelligence_layer_store_escalation.md)

## 1. Architecture summary
Self-contained subsystem in `src/knowledge/` (Node ≥ 22, `node:sqlite`, no new dependencies). Reads projects/tasks/verification through a read-only `WorkPort`; owns only `ki_` tables (sidecar DB `data/ki/knowledge.db`, git-ignored). **The V2 runtime referenced by planning docs is not in this repo**, so KI is bound to what exists (`data/myaos.db`) and is rebindable by writing one port (ADR-KI-001).

## 2. Implemented capabilities (all exercised by tests)
* **Documents:** immutable originals (content-addressed), hash dedup (same document and cross-document), versions with atomic promotion, lifecycle pipeline, failure visibility/retry/reprocess, archive/restore, owner-only controlled deletion with retention + legal hold, links to project/task/job/workflow. Formats: txt, md, csv/tsv, code/config, html, vtt/srt, docx, xlsx, pptx, pdf (pdftotext, else best-effort native), images (tesseract if installed).
* **Knowledge:** 10 types; authority ladder; proposals vs accepted vs verified; decisions with rationale/alternatives/supersession; conflict detection, preservation, authorised resolution; provenance to doc/version/section/char range/quote; review/expiry flags; staleness when the source document changes.
* **Commitments:** register with provenance, rule-based extraction (multi-outcome split, relative deadline parsing, ambiguity flagged, hedging/injection filtered), confirmation workflow, many-to-many task links, evidence-gated fulfilment, derived overdue, history.
* **Retrieval:** FTS5 + semantic + RRF, authority/status/recency ranking, filters, permission/classification/quarantine filtering, citations and explanations, index rebuild, provider swap.
* **Context assembly:** budgeted, tiered, skill-aware (hash-pinned), persisted packages, staleness with impact threshold + single Orchestrator notification, refresh with diff, usage reporting, rendered prompt with evidence envelopes.
* **Work intelligence:** project/organisation intelligence, risks, change feed, daily/project/agent/pre-task briefings, weekly review (funnel requested→accepted→assigned→in progress→reported-done→verified), delivery report. Every line carries evidence refs.
* **Security/governance:** roles/permissions, org/project/ACL/classification boundaries, hash-chained audit with tamper detection, secrets redaction, prompt-injection quarantine, safe file handling, schema-validated tools.
* **Agent tools:** 41 `ki.*` tools (`ki.tools.manifest(principal)` lists those a role may call; `ki.tools.invoke(principal, name, input)`).
* **Desktop:** *Knowledge & Intelligence* (Developer mode → sidebar): Overview, Document Library, Knowledge Explorer, Commitments & Actions, Project Intelligence, Sources & People, Knowledge Settings.
* **CLI/ops:** `node bin/myaos.js knowledge <health|worker|rebuild-index|weekly-review|search …>`, `npm run test:knowledge`, `npm run ki:weekly-review`.

## 3. Database changes
One migration (`ki_core`, v1): 24 tables plus FTS5 virtual table `ki_fts`. No change to `data/myaos.db` or any existing table. Backup-before-upgrade built in.

## 4. Reference
* **Services:** see `src/knowledge/index.js` (`createKnowledgeSystem({baseDir, dbPath, work, embeddingProvider, notifier, agentDirectory, skillsDir})`).
* **Principals** come from the host: `makePrincipal({id, role, orgId, projectIds, clearance})`. Roles: owner, approver, orchestrator, planner, engineer, verifier, viewer, system. Humans with `owner`/`approver` are the only authority granters.
* **Desktop bridge:** Tauri command `myaos_knowledge_call` → `bin/ki-rpc.js`. Env: `KI_USER`, `KI_ROLE` (default `owner`), `KI_ORG` (default `creativesites`), `KI_DB_PATH`, `MYAOS_DB_PATH`, `MYAOS_WORKSPACE_ROOT`.
* **Scheduling:** weekly review via the same external cron that runs `scripts/generate_daily_standup.mjs`: `0 14 * * 5 node scripts/ki-weekly-review.js` (Fri 16:00 CAT). Idempotent per ISO week. Background worker: `ki.worker.start()` in a long-lived process, or `myaos knowledge worker` from cron (the RPC upload path processes inline).

## 5. Verification (what was actually run)
| Check | Result |
|---|---|
| `node --test tests/knowledge/*.test.js` | **27/27 pass** — scenarios A–F, authority rules, migrations, constraints, jobs/retry/lease recovery, 2-worker concurrency (24 docs, each processed once), background loop, relevance corpus, real-DB smoke, RPC e2e (spawned process), UI contract |
| `npx tsc --noEmit` (desktop) | exit 0 (baseline also 0) |
| Existing `node --test tests/*.test.js` | 31/34 pass **before and after** this work (3 pre-existing failures; unrelated) |
| `rustfmt` parse of changed Rust | parses; **not compiled** (no crates available offline) |

Defects found by the tests and fixed during the work: extractor missed greeting-prefixed requests; stop-words made FTS return irrelevant documents; fulfilment copied the *assignee's own* task evidence as if independent; proposals leaked into agent context via the change feed; `fulfilled` transition missing from the state table.

## 6. Known limitations (stated plainly)
1. **Semantic search is not neural.** Default embedder is hashing-based; synonyms are not understood. Interface + tests ready for a real model (ADR-KI-003).
2. **Extraction is heuristic** (knowledge and commitments). Expect misses and false positives; that is why everything lands as a proposal/needs-confirmation. No LLM extractor is wired.
3. **Conflict detection is heuristic** (negation/number/choice/replacement cues); it flags, humans decide. Subtle contradictions will be missed.
4. **PDF/OCR fidelity** depends on `pdftotext` / `tesseract` on the host; otherwise text-layer PDFs are best-effort and scans fail visibly (retryable). Audio/video: transcripts only (no ASR).
5. **Rust bridge uncompiled; desktop UI not exercised in a running Tauri app** (type-checked and contract-tested only). No screenshots taken.
6. **No live Slack/email connector**: adapters accept payloads with an allow-list; connecting a real workspace needs authorisation (thread 045).
7. **Unit of tenancy is `orgId` text**; there is no user directory in KI. Roles/projects are supplied by the host runtime.
8. **Timezone:** deadlines are UTC end-of-day unless `tzOffsetMinutes` is configured.
9. **Single-writer SQLite**: safe for multiple local processes (tested), not a multi-node deployment; use the Postgres path (ADR-KI-002) for hosted.
10. Search is a brute-force vector scan; fine at local scale only.

## 7. Outstanding work / next steps
1. Decide the canonical store and supply the V2 `WorkPort` (thread 045); then point `dbPath` at it if desired.
2. Plug a real embedding model and an LLM-backed `KnowledgeExtractor`/`CommitmentExtractor`; re-run relevance tests with a larger labelled corpus.
3. Wire `ContextAssembler` into the Orchestrator's dispatch (call `ki.context.assemble` per task; add the `ki.*` manifest to agent prompts via the V2 MCP/tool server) and route `notifier` to `InboxManager.send`.
4. Compile and run the Tauri app; screenshot-verify each tab; add a long-lived worker/localhost service if per-call latency matters.
5. Real connectors (Slack, email) with scoped OAuth; retention policy UI; per-document ACL editor in the UI (backend `setAccess` exists).
6. Independent verification of KI by someone other than its author (the project rule): suggested Kael/Sentinel — run `npm run test:knowledge` and try to break the Scenario F cases.
