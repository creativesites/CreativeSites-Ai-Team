'use strict';
/**
 * Versioned, additive-only migrations for the KI subsystem (`ki_` prefix).
 * Rules: never edit an applied migration (checksums are verified); never drop
 * or rewrite user data; destructive changes need a new migration plus backup.
 */
const fs = require('fs');
const { sha256 } = require('./util');

const M1 = `
CREATE TABLE ki_schema_migrations (
  version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL
);

-- Tamper-evident audit trail (hash chained). Rows are never updated or deleted.
CREATE TABLE ki_audit (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL, actor_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_role TEXT,
  action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, org_id TEXT, project_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'ok', detail_json TEXT, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE INDEX idx_ki_audit_entity ON ki_audit(entity_type, entity_id);
CREATE INDEX idx_ki_audit_action ON ki_audit(action, ts);
CREATE TRIGGER ki_audit_no_update BEFORE UPDATE ON ki_audit BEGIN SELECT RAISE(ABORT,'ki_audit is append-only'); END;
CREATE TRIGGER ki_audit_no_delete BEFORE DELETE ON ki_audit BEGIN SELECT RAISE(ABORT,'ki_audit is append-only'); END;

-- Change feed: what changed, for change intelligence, briefings and staleness.
CREATE TABLE ki_events (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL, type TEXT NOT NULL, entity_type TEXT, entity_id TEXT,
  org_id TEXT NOT NULL, project_id TEXT, importance TEXT NOT NULL DEFAULT 'normal',
  summary TEXT NOT NULL, payload_json TEXT
);
CREATE INDEX idx_ki_events_project_ts ON ki_events(project_id, ts);
CREATE INDEX idx_ki_events_type_ts ON ki_events(type, ts);

-- Captured evidence: communications, user instructions, agent reports, workflow events.
-- The text column is original evidence and is immutable (redaction is the only permitted change).
CREATE TABLE ki_sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('message','user_instruction','agent_report','workflow_event','document','conversation','external_reference')),
  platform TEXT NOT NULL, workspace TEXT, channel TEXT, message_id TEXT, thread_id TEXT,
  author_id TEXT, author_name TEXT, original_ts TEXT, original_url TEXT,
  text TEXT NOT NULL, text_hash TEXT NOT NULL,
  trust TEXT NOT NULL DEFAULT 'untrusted' CHECK (trust IN ('untrusted','attested','trusted')),
  org_id TEXT NOT NULL, project_id TEXT, classification TEXT NOT NULL DEFAULT 'internal', acl_json TEXT,
  captured_at TEXT NOT NULL, captured_by TEXT NOT NULL, redacted_at TEXT, redaction_reason TEXT
);
CREATE UNIQUE INDEX uq_ki_sources_msg ON ki_sources(platform, IFNULL(workspace,''), IFNULL(channel,''), message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_ki_sources_project ON ki_sources(project_id, captured_at);
CREATE INDEX idx_ki_sources_author ON ki_sources(author_id);
CREATE TRIGGER ki_sources_immutable BEFORE UPDATE ON ki_sources
WHEN OLD.redacted_at IS NOT NULL OR NEW.text_hash IS NOT OLD.text_hash OR NEW.kind IS NOT OLD.kind OR NEW.platform IS NOT OLD.platform
  OR NEW.author_id IS NOT OLD.author_id OR NEW.original_ts IS NOT OLD.original_ts OR NEW.message_id IS NOT OLD.message_id
  OR NEW.captured_at IS NOT OLD.captured_at OR (NEW.text IS NOT OLD.text AND NEW.redacted_at IS NULL)
BEGIN SELECT RAISE(ABORT,'ki_sources original evidence is immutable'); END;
CREATE TRIGGER ki_sources_no_delete BEFORE DELETE ON ki_sources BEGIN SELECT RAISE(ABORT,'ki_sources cannot be deleted; redact instead'); END;

CREATE TABLE ki_documents (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, project_id TEXT,
  display_name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general', description TEXT,
  classification TEXT NOT NULL DEFAULT 'internal', acl_json TEXT,
  source_id TEXT REFERENCES ki_sources(id), source_kind TEXT NOT NULL DEFAULT 'upload'
    CHECK (source_kind IN ('upload','integration','generated','import','conversation')),
  author_id TEXT, author_type TEXT, origin_json TEXT,
  lineage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  current_version_id TEXT, retention_until TEXT, legal_hold INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT, deleted_at TEXT, delete_reason TEXT
);
CREATE UNIQUE INDEX uq_ki_documents_lineage ON ki_documents(org_id, IFNULL(project_id,''), lineage_key) WHERE status <> 'deleted';
CREATE INDEX idx_ki_documents_project ON ki_documents(project_id, status);
CREATE INDEX idx_ki_documents_category ON ki_documents(category);

CREATE TABLE ki_document_versions (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES ki_documents(id),
  version_no INTEGER NOT NULL, original_filename TEXT NOT NULL, mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL, content_hash TEXT NOT NULL, storage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN
    ('received','stored','extracting','extracted','indexing','indexed','available','failed','reprocessing','superseded','archived')),
  is_current INTEGER NOT NULL DEFAULT 0,
  supersedes_version_id TEXT, superseded_by_version_id TEXT,
  extractor TEXT, extractor_version TEXT, extraction_quality TEXT, extraction_error TEXT, text_hash TEXT, text_length INTEGER,
  index_error TEXT, index_model TEXT, chunk_count INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL, stored_at TEXT, extracted_at TEXT, indexed_at TEXT, available_at TEXT,
  created_by TEXT NOT NULL, change_note TEXT,
  UNIQUE (document_id, version_no), UNIQUE (document_id, content_hash)
);
CREATE INDEX idx_ki_versions_status ON ki_document_versions(status);
CREATE INDEX idx_ki_versions_hash ON ki_document_versions(content_hash);
CREATE TRIGGER ki_versions_immutable BEFORE UPDATE ON ki_document_versions
WHEN NEW.content_hash IS NOT OLD.content_hash OR NEW.storage_key IS NOT OLD.storage_key OR NEW.size_bytes IS NOT OLD.size_bytes OR NEW.version_no IS NOT OLD.version_no
BEGIN SELECT RAISE(ABORT,'document version content is immutable; create a new version'); END;

CREATE TABLE ki_document_links (
  document_id TEXT NOT NULL REFERENCES ki_documents(id),
  link_type TEXT NOT NULL CHECK (link_type IN ('project','task','job','workflow','conversation','agent')),
  target_id TEXT NOT NULL, relation TEXT NOT NULL DEFAULT 'attached', linked_by TEXT NOT NULL, linked_at TEXT NOT NULL,
  PRIMARY KEY (document_id, link_type, target_id)
);
CREATE INDEX idx_ki_dl_target ON ki_document_links(link_type, target_id);

CREATE TABLE ki_doc_text (version_id TEXT PRIMARY KEY REFERENCES ki_document_versions(id), text TEXT NOT NULL);

CREATE TABLE ki_chunks (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES ki_documents(id),
  version_id TEXT NOT NULL REFERENCES ki_document_versions(id),
  ordinal INTEGER NOT NULL, section_path TEXT, heading TEXT,
  char_start INTEGER NOT NULL, char_end INTEGER NOT NULL,
  text TEXT NOT NULL, text_hash TEXT NOT NULL, token_estimate INTEGER NOT NULL,
  injection_score REAL NOT NULL DEFAULT 0, injection_flags TEXT, has_secret INTEGER NOT NULL DEFAULT 0,
  UNIQUE (version_id, ordinal)
);
CREATE INDEX idx_ki_chunks_doc ON ki_chunks(document_id, version_id);

CREATE TABLE ki_embeddings (
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, model_id TEXT NOT NULL, model_version TEXT NOT NULL,
  dim INTEGER NOT NULL, vector BLOB NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id, model_id)
);
CREATE INDEX idx_ki_embeddings_model ON ki_embeddings(model_id, model_version);

CREATE VIRTUAL TABLE ki_fts USING fts5(
  entity_type UNINDEXED, entity_id UNINDEXED, title, body, tokenize = 'porter unicode61'
);

CREATE TABLE ki_knowledge (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('fact','decision','requirement','instruction','policy','lesson','preference','assumption','hypothesis','reference')),
  title TEXT NOT NULL, content TEXT NOT NULL, subject_key TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','verified','disputed','superseded','archived')),
  authority INTEGER NOT NULL DEFAULT 0 CHECK (authority BETWEEN 0 AND 5),
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  verification_class TEXT NOT NULL DEFAULT 'DECLARED' CHECK (verification_class IN ('DECLARED','ATTESTED','OBSERVED','VERIFIED','UNKNOWN')),
  org_id TEXT NOT NULL, project_id TEXT, entity_ref TEXT,
  classification TEXT NOT NULL DEFAULT 'internal', acl_json TEXT,
  source_id TEXT REFERENCES ki_sources(id), source_ref_json TEXT,
  derived_by TEXT NOT NULL DEFAULT 'human' CHECK (derived_by IN ('human','agent','extractor','import')),
  author_id TEXT NOT NULL, author_type TEXT NOT NULL,
  captured_at TEXT NOT NULL, effective_at TEXT, review_at TEXT, expires_at TEXT,
  supersedes_id TEXT, superseded_by_id TEXT,
  approved_by TEXT, approved_at TEXT, content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_ki_knowledge_scope ON ki_knowledge(org_id, project_id, type, status);
CREATE INDEX idx_ki_knowledge_subject ON ki_knowledge(org_id, IFNULL(project_id,''), subject_key);
CREATE INDEX idx_ki_knowledge_source ON ki_knowledge(source_id);

CREATE TABLE ki_knowledge_relations (
  id TEXT PRIMARY KEY, from_id TEXT NOT NULL REFERENCES ki_knowledge(id),
  to_type TEXT NOT NULL, to_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('supports','derived_from','related','contradicts','supersedes','implements','depends_on','evidenced_by')),
  created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (from_id, to_type, to_id, relation)
);
CREATE INDEX idx_ki_rel_to ON ki_knowledge_relations(to_type, to_id);

CREATE TABLE ki_conflicts (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, project_id TEXT,
  a_id TEXT NOT NULL REFERENCES ki_knowledge(id), b_id TEXT NOT NULL REFERENCES ki_knowledge(id),
  kind TEXT NOT NULL CHECK (kind IN ('explicit','potential','reported')),
  reason TEXT NOT NULL, score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  detected_at TEXT NOT NULL, detected_by TEXT NOT NULL,
  resolution TEXT CHECK (resolution IN ('prefer_a','prefer_b','both_valid','merge')),
  winner_id TEXT, resolved_by TEXT, resolved_at TEXT, resolution_note TEXT,
  UNIQUE (a_id, b_id)
);
CREATE INDEX idx_ki_conflicts_status ON ki_conflicts(org_id, status);

CREATE TABLE ki_decisions (
  id TEXT PRIMARY KEY, knowledge_id TEXT NOT NULL UNIQUE REFERENCES ki_knowledge(id),
  org_id TEXT NOT NULL, project_id TEXT, title TEXT NOT NULL, context TEXT, rationale TEXT NOT NULL,
  alternatives_json TEXT, consequences TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','superseded')),
  proposed_by TEXT NOT NULL, proposed_at TEXT NOT NULL, decided_by TEXT, decided_at TEXT, decision_note TEXT,
  supersedes_decision_id TEXT
);

CREATE TABLE ki_commitments (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('request','instruction','action_item','promise','agreement','deliverable','question','deadline','follow_up','dependency','blocker','feedback','decision_needed')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected','needs_confirmation','accepted','assigned','in_progress','fulfilled','rejected','cancelled','blocked','superseded')),
  blocked_from TEXT, blocked_reason TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  confidence REAL NOT NULL DEFAULT 0.5,
  confirmation TEXT NOT NULL DEFAULT 'unconfirmed' CHECK (confirmation IN ('unconfirmed','confirmed','rejected')),
  confirmed_by TEXT, confirmed_at TEXT,
  source_id TEXT REFERENCES ki_sources(id), source_platform TEXT, source_author TEXT, source_ref_json TEXT,
  captured_at TEXT NOT NULL, requester TEXT,
  responsible_id TEXT, responsible_type TEXT,
  org_id TEXT NOT NULL, project_id TEXT, classification TEXT NOT NULL DEFAULT 'internal', acl_json TEXT,
  deadline_at TEXT, deadline_text TEXT, deadline_confidence REAL, deadline_needs_clarification INTEGER NOT NULL DEFAULT 0,
  acceptance_criteria_json TEXT, resolution_notes TEXT,
  extracted_by TEXT, superseded_by_id TEXT,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, fulfilled_at TEXT
);
CREATE INDEX idx_ki_commitments_scope ON ki_commitments(org_id, project_id, status);
CREATE INDEX idx_ki_commitments_deadline ON ki_commitments(deadline_at) WHERE deadline_at IS NOT NULL;
CREATE INDEX idx_ki_commitments_resp ON ki_commitments(responsible_id, status);
CREATE UNIQUE INDEX uq_ki_commitments_extract ON ki_commitments(source_id, description) WHERE source_id IS NOT NULL;

-- Commitments are NOT tasks: many-to-many by design. task_id is a soft reference into the work system.
CREATE TABLE ki_commitment_tasks (
  commitment_id TEXT NOT NULL REFERENCES ki_commitments(id), task_id TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'satisfied_by' CHECK (relation IN ('generated','satisfied_by')),
  linked_by TEXT NOT NULL, linked_at TEXT NOT NULL, PRIMARY KEY (commitment_id, task_id)
);
CREATE INDEX idx_ki_ct_task ON ki_commitment_tasks(task_id);

CREATE TABLE ki_commitment_evidence (
  id TEXT PRIMARY KEY, commitment_id TEXT NOT NULL REFERENCES ki_commitments(id), task_id TEXT,
  evidence_class TEXT NOT NULL CHECK (evidence_class IN ('DECLARED','ATTESTED','OBSERVED','VERIFIED','UNKNOWN')),
  summary TEXT NOT NULL, ref_json TEXT,
  submitted_by TEXT NOT NULL, submitted_by_type TEXT NOT NULL, created_at TEXT NOT NULL,
  verified_by TEXT, verified_at TEXT, verification_note TEXT
);
CREATE INDEX idx_ki_ce_commitment ON ki_commitment_evidence(commitment_id);

CREATE TABLE ki_commitment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, commitment_id TEXT NOT NULL REFERENCES ki_commitments(id),
  from_status TEXT, to_status TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT, ts TEXT NOT NULL
);
CREATE INDEX idx_ki_ch_commitment ON ki_commitment_history(commitment_id, ts);

-- Durable job queue for extraction / indexing / embedding (idempotent, leased, retryable).
CREATE TABLE ki_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('process_version','reindex','embed','extract_knowledge')),
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after TEXT NOT NULL, lease_until TEXT, locked_by TEXT, last_error TEXT, payload_json TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_ki_jobs_active ON ki_jobs(type, entity_type, entity_id) WHERE status IN ('queued','running');
CREATE INDEX idx_ki_jobs_pick ON ki_jobs(status, run_after);

CREATE TABLE ki_context_packages (
  id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, task_id TEXT, project_id TEXT, org_id TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'task', query TEXT, budget_tokens INTEGER NOT NULL, token_estimate INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','stale','superseded')),
  previous_package_id TEXT, assembled_at TEXT NOT NULL, assembled_by TEXT NOT NULL,
  params_json TEXT, warnings_json TEXT, excluded_json TEXT, skills_json TEXT,
  fingerprint TEXT NOT NULL, usage_json TEXT, stale_reasons_json TEXT, stale_notified_at TEXT
);
CREATE INDEX idx_ki_cp_task ON ki_context_packages(task_id, status);
CREATE INDEX idx_ki_cp_agent ON ki_context_packages(agent_id, assembled_at);

CREATE TABLE ki_context_items (
  id TEXT PRIMARY KEY, package_id TEXT NOT NULL REFERENCES ki_context_packages(id),
  ordinal INTEGER NOT NULL, item_type TEXT NOT NULL, ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, ref_fingerprint TEXT,
  title TEXT, excerpt TEXT NOT NULL, authority INTEGER, source_ts TEXT, score REAL, rationale TEXT,
  token_estimate INTEGER NOT NULL, trust TEXT NOT NULL DEFAULT 'evidence', flags_json TEXT
);
CREATE INDEX idx_ki_ci_package ON ki_context_items(package_id, ordinal);

CREATE TABLE ki_reports (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
  org_id TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  generated_at TEXT NOT NULL, generated_by TEXT NOT NULL, body_json TEXT NOT NULL, fingerprint TEXT NOT NULL,
  UNIQUE (kind, scope_type, scope_id, period_start, period_end)
);

CREATE TABLE ki_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
`;

const MIGRATIONS = [{ version: 1, name: 'ki_core', sql: M1 }];

function applyMigrations(db, { clock, backupDir } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS ki_schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const applied = new Map(db.all('SELECT * FROM ki_schema_migrations').map((r) => [r.version, r]));
  for (const m of MIGRATIONS) {
    const a = applied.get(m.version);
    if (a && a.checksum !== sha256(m.sql)) {
      throw new Error(`KI migration ${m.version} (${m.name}) was modified after being applied; refusing to continue`);
    }
  }
  const pending = MIGRATIONS.filter((m) => !applied.has(m.version));
  if (!pending.length) return { applied: [], backup: null };
  let backup = null;
  if (applied.size > 0 && db.file !== ':memory:' && backupDir) {
    backup = db.backupTo(require('path').join(backupDir, `knowledge.pre-v${pending[0].version}.${Date.now()}.bak`));
  }
  const done = [];
  for (const m of pending) {
    db.tx(() => {
      // Version 1 creates the migrations table itself; skip the duplicate create inside the SQL.
      const sql = m.version === 1 ? m.sql.replace(/CREATE TABLE ki_schema_migrations \([\s\S]*?\);\n/, '') : m.sql;
      db.exec(sql);
      db.run('INSERT INTO ki_schema_migrations(version,name,checksum,applied_at) VALUES (?,?,?,?)',
        [m.version, m.name, sha256(m.sql), (clock ? clock.iso() : new Date().toISOString())]);
    });
    done.push(m.version);
  }
  return { applied: done, backup };
}

module.exports = { MIGRATIONS, applyMigrations, SCHEMA_VERSION: MIGRATIONS[MIGRATIONS.length - 1].version };
