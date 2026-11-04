# ADR-KI-002 — KI tables live in a git-ignored sidecar SQLite file by default

**Status:** Accepted. **Context.** `data/myaos.db` is a git-tracked binary; writing to it dirties the repo and mixes concerns. **Decision.** Default `data/ki/knowledge.db` (ignored), `ki_` prefix, additive migrations, WAL. `dbPath` may point at any SQLite file, including a runtime DB, with no code change. **Consequences.** + Safe to run anywhere; − cross-DB joins happen in code (via ports), not SQL. Postgres path: same tables, `tsvector` for FTS, `pgvector` for embeddings, `JSONB` for `*_json`.
