-- ============================================================
-- MYAOS DATABASE SCHEMA v3.0
-- CreativeSites Organizational Upgrade — Meridian ◈
-- 2026-09-07
-- ============================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  home_repo TEXT,
  bridge_partner_id TEXT REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS identities (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  symbol TEXT,
  primary_domain TEXT,
  team_id TEXT REFERENCES teams(id),
  lane TEXT CHECK (lane IN ('gtm','engineering','bridge','infrastructure')),
  declared_capabilities TEXT NOT NULL DEFAULT '[]',
  declared_responsibilities TEXT NOT NULL DEFAULT '[]',
  declared_repository_ownership TEXT DEFAULT '[]',
  confidence_provenance TEXT DEFAULT 'DECLARED' CHECK (confidence_provenance IN ('DECLARED','ATTESTED','OBSERVED','VERIFIED_OBSERVED','UNVERIFIED_DECLARATION','UNKNOWN')),
  evidence_source TEXT,
  observed_liveness TEXT DEFAULT 'UNKNOWN' CHECK (observed_liveness IN ('LIVE','OFFLINE','UNKNOWN')),
  last_observed_time TEXT,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS runtimes (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL REFERENCES identities(id),
  engine TEXT NOT NULL,
  runtime_type TEXT,
  model_tier TEXT DEFAULT 'unknown' CHECK (model_tier IN ('cheap','mid','top','unknown')),
  pid INTEGER,
  socket_path TEXT,
  cwd TEXT,
  handshake_token TEXT,
  handshake_verified INTEGER DEFAULT 0,
  observed_liveness TEXT DEFAULT 'UNKNOWN' CHECK (observed_liveness IN ('LIVE','OFFLINE','UNKNOWN')),
  status TEXT DEFAULT 'SLEEPING' CHECK (status IN ('AVAILABLE','WORKING','SLEEPING','REVIEWING','WAKE_REQUESTED','UNKNOWN')),
  wake_command TEXT,
  last_seen TEXT,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  terminated_at TEXT
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL REFERENCES identities(id),
  current_runtime_id TEXT REFERENCES runtimes(id),
  dynamic_role INTEGER NOT NULL DEFAULT 1,
  inbox_path TEXT,
  current_task_id TEXT,
  status TEXT DEFAULT 'SLEEPING' CHECK (status IN ('AVAILABLE','WORKING','SLEEPING','REVIEWING','WAKE_REQUESTED','WAKE_REQUESTED_OFFLINE','UNKNOWN')),
  last_seen TEXT,
  UNIQUE(identity_id)
);

CREATE TABLE IF NOT EXISTS capabilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS agent_capabilities (
  identity_id TEXT NOT NULL REFERENCES identities(id),
  capability_id TEXT NOT NULL REFERENCES capabilities(id),
  evidence_class TEXT DEFAULT 'DECLARED' CHECK (evidence_class IN ('DECLARED','ATTESTED','OBSERVED','VERIFIED','UNKNOWN')),
  PRIMARY KEY (identity_id, capability_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  objectives TEXT DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('planning','active','paused','completed','cancelled')),
  owner_identity_ids TEXT DEFAULT '[]',
  human_owner TEXT DEFAULT 'Winston',
  repo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  due_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  milestone_id TEXT REFERENCES milestones(id),
  title TEXT NOT NULL,
  description TEXT,
  creator TEXT,
  assignee_id TEXT REFERENCES identities(id),
  required_capabilities TEXT NOT NULL DEFAULT '[]',
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','claimed','in_progress','blocked','in_review','done','failed','unresolved')),
  dependencies TEXT DEFAULT '[]',
  acceptance_criteria TEXT DEFAULT '[]',
  repo TEXT,
  artifacts TEXT DEFAULT '[]',
  original_source TEXT,
  original_file_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  author_identity TEXT,
  note_type TEXT DEFAULT 'update',
  content TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  verifier_identity TEXT NOT NULL,
  verifier_runtime_id TEXT REFERENCES runtimes(id),
  evidence_class TEXT NOT NULL CHECK (evidence_class IN ('DECLARED','ATTESTED','OBSERVED','VERIFIED','UNKNOWN')),
  passed INTEGER NOT NULL DEFAULT 0,
  details TEXT,
  exit_code INTEGER,
  verified_files TEXT DEFAULT '[]',
  missing_files TEXT DEFAULT '[]',
  command_output TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  type TEXT NOT NULL,
  sender TEXT,
  sender_runtime_id TEXT REFERENCES runtimes(id),
  task_id TEXT REFERENCES tasks(id),
  payload TEXT
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author_identities TEXT DEFAULT '[]',
  target_identities TEXT DEFAULT '[]',
  status TEXT DEFAULT 'open' CHECK (status IN ('open','resolved','archived')),
  related_task_id TEXT REFERENCES tasks(id),
  related_project_id TEXT REFERENCES projects(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  original_file_path TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT REFERENCES threads(id),
  from_identity TEXT,
  to_identity TEXT,
  to_team TEXT,
  type TEXT NOT NULL CHECK (type IN ('COORDINATION','TASK_ASSIGNMENT','VERIFICATION_REQUEST','ESCALATION','APPROVAL_REQUEST','BLOCKER','BRIDGE_REQUEST','SOCIAL','STANDUP','SYSTEM','HUMAN_REPLY')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  subject TEXT,
  body TEXT,
  related_task_id TEXT REFERENCES tasks(id),
  related_project_id TEXT REFERENCES projects(id),
  read INTEGER DEFAULT 0,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  sender_runtime_id TEXT REFERENCES runtimes(id),
  original_file_path TEXT
);

CREATE TABLE IF NOT EXISTS standups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  standup_date TEXT NOT NULL,
  facilitator TEXT,
  present_identities TEXT DEFAULT '[]',
  absent_identities TEXT DEFAULT '[]',
  content TEXT,
  parsed_updates TEXT DEFAULT '{}',
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  original_file_path TEXT
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author_identity TEXT,
  content TEXT,
  audience TEXT DEFAULT 'all',
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  original_file_path TEXT
);

CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author_identity TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','open','accepted','rejected','superseded')),
  content TEXT,
  votes TEXT DEFAULT '{}',
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  original_file_path TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('P0','P1','P2','P3')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  related_task_id TEXT REFERENCES tasks(id),
  timeline TEXT DEFAULT '[]',
  resolution TEXT,
  learning TEXT,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  original_file_path TEXT
);

CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  author_identity TEXT,
  content TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  original_file_path TEXT
);

CREATE TABLE IF NOT EXISTS human_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES tasks(id),
  project_id TEXT REFERENCES projects(id),
  decision_type TEXT NOT NULL CHECK (decision_type IN ('APPROVAL','ESCALATION','BLOCKER','CLARIFICATION','PRODUCTION_DEPLOY','EXTERNAL_COMMS')),
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','urgent')),
  description TEXT NOT NULL,
  requested_by TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','deferred')),
  decided_by TEXT DEFAULT 'Winston',
  decision_note TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS token_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id TEXT NOT NULL REFERENCES identities(id),
  runtime_id TEXT REFERENCES runtimes(id),
  task_id TEXT REFERENCES tasks(id),
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memory_snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id TEXT NOT NULL REFERENCES identities(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  evidence_class TEXT DEFAULT 'DECLARED',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(identity_id, key)
);

CREATE TABLE IF NOT EXISTS provenance_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT NOT NULL,
  agent TEXT,
  operation TEXT NOT NULL,
  runtime_id TEXT,
  source TEXT DEFAULT 'myaos',
  reason TEXT,
  evidence_class TEXT DEFAULT 'UNKNOWN' CHECK (evidence_class IN ('DECLARED','ATTESTED','OBSERVED','VERIFIED','UNKNOWN')),
  evidence TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('client','prospect','vendor','employer','peer','partner','other')),
  organization TEXT,
  email TEXT,
  phone TEXT,
  relationship_status TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  channel TEXT,
  subject TEXT,
  status TEXT DEFAULT 'open',
  project_id TEXT REFERENCES projects(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  metric_type TEXT NOT NULL CHECK (metric_type IN ('task_auto_routed','wake_requested','wake_observed','wake_failed','verification_autonomous','verification_human_needed','human_intervention','dependency_auto_resolved','blocker_created','bridge_requested','bridge_fulfilled')),
  identity_id TEXT REFERENCES identities(id),
  task_id TEXT REFERENCES tasks(id),
  outcome TEXT CHECK (outcome IN ('success','failure','partial','unknown')),
  details TEXT
);

CREATE TABLE IF NOT EXISTS migration_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phase INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  source_path TEXT,
  target_table TEXT NOT NULL,
  rows_migrated INTEGER DEFAULT 0,
  contradictions_found INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','complete','failed')),
  notes TEXT,
  migrated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- PHASE 1: ORGANIZATIONAL KNOWLEDGE LAYER
-- Facts, Claims, Handoffs — verified organizational knowledge
-- ============================================================

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  claim TEXT NOT NULL,
  category TEXT, -- architecture, codebase, deployment, protocol, etc.
  repository TEXT, -- which repo (myavana-hair-journey-next, Myavana-Chatbot, etc.)
  file_path VARCHAR(500), -- optional, for file-specific facts
  line_range VARCHAR(20), -- optional, e.g. "42-58"

  -- Verification
  evidence_class TEXT DEFAULT 'OBSERVED' CHECK (evidence_class IN ('DECLARED','ATTESTED','OBSERVED','VERIFIED','UNKNOWN')),
  evidence TEXT, -- the command/result that supports the claim
  verification_command VARCHAR(500), -- the command to re-verify

  verified_by TEXT REFERENCES identities(id),
  verified_at TEXT NOT NULL,

  -- Freshness
  freshness_days INT DEFAULT 7,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','stale','contradicted','superseded')),
  expires_at TEXT,

  -- Relations
  related_facts TEXT DEFAULT '[]', -- JSON array of fact IDs
  related_task_id TEXT REFERENCES tasks(id),
  tags TEXT DEFAULT '[]', -- JSON array of tags

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_claims (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),

  claim TEXT NOT NULL,
  acceptance_criteria TEXT DEFAULT '[]', -- JSON array

  status TEXT DEFAULT 'unverified' CHECK (status IN ('unverified','verified','failed','superseded')),
  evidence_id INTEGER REFERENCES evidence(id),

  verified_by TEXT REFERENCES identities(id),
  verified_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,

  from_agent TEXT NOT NULL REFERENCES identities(id),
  to_agent TEXT NOT NULL REFERENCES identities(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),

  -- What changed
  files_changed TEXT DEFAULT '[]', -- JSON array
  claim_ids TEXT DEFAULT '[]', -- JSON array of task_claims IDs
  fact_ids TEXT DEFAULT '[]', -- JSON array of fact IDs

  -- Context for recipient
  known_limitations TEXT,
  next_steps TEXT,

  status TEXT DEFAULT 'ready' CHECK (status IN ('ready','received','in_progress','complete')),
  received_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_events_task ON events(task_id);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_identity);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);
CREATE INDEX IF NOT EXISTS idx_token_ledger_identity ON token_ledger(identity_id);
CREATE INDEX IF NOT EXISTS idx_provenance_ts ON provenance_log(ts);
CREATE INDEX IF NOT EXISTS idx_human_decisions_status ON human_decisions(status);
CREATE INDEX IF NOT EXISTS idx_human_decisions_urgency ON human_decisions(urgency);
CREATE INDEX IF NOT EXISTS idx_automation_metrics_ts ON automation_metrics(ts);
CREATE INDEX IF NOT EXISTS idx_automation_metrics_type ON automation_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_identities_team ON identities(team_id);
CREATE INDEX IF NOT EXISTS idx_runtimes_identity ON runtimes(identity_id);
CREATE INDEX IF NOT EXISTS idx_standups_date ON standups(standup_date);
CREATE INDEX IF NOT EXISTS idx_facts_status ON facts(status);
CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
CREATE INDEX IF NOT EXISTS idx_facts_repository ON facts(repository);
CREATE INDEX IF NOT EXISTS idx_facts_expires ON facts(expires_at);
CREATE INDEX IF NOT EXISTS idx_task_claims_task ON task_claims(task_id);
CREATE INDEX IF NOT EXISTS idx_task_claims_status ON task_claims(status);
CREATE INDEX IF NOT EXISTS idx_handoffs_from ON handoffs(from_agent);
CREATE INDEX IF NOT EXISTS idx_handoffs_to ON handoffs(to_agent);
CREATE INDEX IF NOT EXISTS idx_handoffs_task ON handoffs(task_id);
