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

-- NOTE: an earlier agent_capabilities definition lived here
-- (identity_id/capability_id keyed off the `capabilities` lookup table above).
-- Confirmed unused by any code, and `capabilities` stayed empty (0 rows).
-- Removed to resolve a duplicate CREATE TABLE IF NOT EXISTS conflict with the
-- richer capability_name/proficiency_level shape defined in the Phase 2
-- section below, which is the one actually populated and used.

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

-- ============================================================
-- PHASE 2: MODEL ROUTING & EVENT-DRIVEN ORCHESTRATION
-- Model registry, agent capabilities, task routing, escalation
-- ============================================================

CREATE TABLE IF NOT EXISTS model_registry (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL, -- Claude, Gemini, DeepSeek, etc.
  model_id TEXT NOT NULL UNIQUE,
  display_name TEXT,

  -- Capabilities
  capabilities TEXT DEFAULT '[]', -- JSON array: coding, reasoning, vision, etc.
  context_tokens INT,
  tool_support INTEGER DEFAULT 0,
  computer_use INTEGER DEFAULT 0,
  vision INTEGER DEFAULT 0,

  -- Performance & cost
  speed_tier TEXT CHECK (speed_tier IN ('fastest','fast','medium','slow','slowest')),
  capability_tier TEXT CHECK (capability_tier IN ('cheap','mid','high','top')),
  estimated_cost_per_mtok REAL, -- $ per million tokens
  latency_p50_ms INT,
  latency_p95_ms INT,

  -- Availability
  availability TEXT DEFAULT 'available' CHECK (availability IN ('available','degraded','unavailable')),
  rate_limit_rps INT,

  -- Organizational knowledge
  best_for TEXT, -- comma-separated task types it excels at
  avoid_for TEXT, -- comma-separated task types it struggles with
  notes TEXT,

  last_checked TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_capabilities (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL REFERENCES identities(id),
  capability_name TEXT NOT NULL, -- coding, architecture, security, design, etc.
  proficiency_level TEXT CHECK (proficiency_level IN ('basic','intermediate','advanced','expert')),
  evidence_class TEXT DEFAULT 'DECLARED' CHECK (evidence_class IN ('DECLARED','ATTESTED','OBSERVED','VERIFIED')),
  verified_by TEXT REFERENCES identities(id),
  verified_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(identity_id, capability_name)
);

CREATE TABLE IF NOT EXISTS task_routing_rules (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL, -- code_generation, architecture, security_review, etc.
  required_capabilities TEXT DEFAULT '[]', -- JSON array
  effort_level TEXT CHECK (effort_level IN ('LOW','MEDIUM','HIGH','MAXIMUM')),
  preferred_model_tier TEXT CHECK (preferred_model_tier IN ('cheap','mid','high','top')),
  preferred_agents TEXT DEFAULT '[]', -- JSON array of agent IDs
  allow_escalation INTEGER DEFAULT 1,
  max_retries INT DEFAULT 3,
  timeout_seconds INT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_selection_history (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  task_type TEXT,
  required_capabilities TEXT,
  effort_level TEXT,
  
  -- Selection process
  candidates TEXT, -- JSON: [{model_id, reason, cost, estimated_success}]
  selected_model TEXT,
  selected_reason TEXT,
  
  -- Outcome
  success INTEGER, -- 1 = passed, 0 = failed
  tokens_used INT,
  cost_usd REAL,
  escalated_to TEXT, -- if escalated, which model
  
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('task_created','task_claimed','task_started','task_blocked','task_completed','task_failed','task_escalated','verification_passed','verification_failed')),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  
  -- Event details
  triggered_by TEXT, -- agent or system
  previous_status TEXT,
  new_status TEXT,
  
  -- Context
  model_used TEXT REFERENCES model_registry(id),
  agent_id TEXT REFERENCES identities(id),
  reason TEXT,
  payload TEXT, -- JSON: additional context
  
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_performance (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES model_registry(id),
  task_type TEXT,
  
  -- Metrics
  attempts INT DEFAULT 0,
  successes INT DEFAULT 0,
  failures INT DEFAULT 0,
  escalations INT DEFAULT 0,
  avg_tokens_per_task INT,
  avg_cost_per_task REAL,
  avg_latency_ms INT,
  
  -- Historical
  last_used TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  UNIQUE(model_id, task_type)
);

CREATE TABLE IF NOT EXISTS escalation_chains (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  step INT NOT NULL, -- 1, 2, 3, etc.
  model_id TEXT NOT NULL REFERENCES model_registry(id),
  max_attempts INT DEFAULT 1,
  reason TEXT, -- why escalate to this model
  UNIQUE (task_type, step)
);

-- Indexes for Phase 2
CREATE INDEX IF NOT EXISTS idx_model_registry_provider ON model_registry(provider);
CREATE INDEX IF NOT EXISTS idx_model_registry_availability ON model_registry(availability);
CREATE INDEX IF NOT EXISTS idx_model_registry_capability_tier ON model_registry(capability_tier);
CREATE INDEX IF NOT EXISTS idx_agent_capabilities_identity ON agent_capabilities(identity_id);
CREATE INDEX IF NOT EXISTS idx_agent_capabilities_proficiency ON agent_capabilities(proficiency_level);
CREATE INDEX IF NOT EXISTS idx_task_routing_type ON task_routing_rules(task_type);
CREATE INDEX IF NOT EXISTS idx_model_selection_task ON model_selection_history(task_id);
CREATE INDEX IF NOT EXISTS idx_model_selection_model ON model_selection_history(selected_model);
CREATE INDEX IF NOT EXISTS idx_task_events_type ON task_events(event_type);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_model ON task_events(model_used);
CREATE INDEX IF NOT EXISTS idx_model_performance_model ON model_performance(model_id);
CREATE INDEX IF NOT EXISTS idx_model_performance_type ON model_performance(task_type);

-- ============================================================
-- PHASE 3: EVENT BUS & AUTONOMOUS ORCHESTRATION
-- Event-driven task flow, dependency tracking, human escalation
-- ============================================================

CREATE TABLE IF NOT EXISTS task_workflow (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id),

  -- Current state
  current_state TEXT NOT NULL DEFAULT 'ready' CHECK (current_state IN ('ready','queued','assigned','in_progress','blocked','verification','completed','failed','escalated','human_decision')),

  -- Assignment
  assigned_agent_id TEXT REFERENCES identities(id),
  assigned_model_id TEXT REFERENCES model_registry(id),
  assignment_time TEXT,
  assignment_reason TEXT,

  -- Execution
  started_at TEXT,
  attempt_count INT DEFAULT 0,
  current_model_attempt INT DEFAULT 0,
  estimated_completion_time TEXT,

  -- Blocking/dependencies
  blocked_by_tasks TEXT DEFAULT '[]', -- JSON array of task IDs blocking this
  blocks_tasks TEXT DEFAULT '[]', -- JSON array of task IDs waiting for this

  -- Escalation
  escalation_chain_position INT, -- which step in escalation chain
  max_escalation_steps INT,
  escalated_at TEXT,

  -- Human decision required
  human_decision_required INTEGER DEFAULT 0,
  human_decision_reason TEXT,
  human_decision_deadline TEXT,
  decided_by TEXT,
  decision_note TEXT,

  -- Outcome
  outcome TEXT CHECK (outcome IN ('success','failure','partial','unknown')),
  outcome_reason TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_bus (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'task_created','task_queued','task_assigned','task_claimed',
    'task_started','task_in_progress','task_blocked','task_unblocked',
    'model_selected','model_escalated','attempt_started','attempt_completed',
    'verification_started','verification_passed','verification_failed',
    'human_escalation_needed','human_decision_made',
    'task_completed','task_failed','task_retry'
  )),

  task_id TEXT NOT NULL REFERENCES tasks(id),
  agent_id TEXT REFERENCES identities(id),
  model_id TEXT REFERENCES model_registry(id),

  -- Event details
  previous_state TEXT,
  new_state TEXT,
  reason TEXT,
  payload TEXT, -- JSON: arbitrary event data

  -- Timing
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT, -- when orchestrator processed this event
  processed_by TEXT -- which system processed it

);

CREATE TABLE IF NOT EXISTS dependency_graph (
  id TEXT PRIMARY KEY,
  dependent_task_id TEXT NOT NULL REFERENCES tasks(id),
  blocking_task_id TEXT NOT NULL REFERENCES tasks(id),
  dependency_type TEXT CHECK (dependency_type IN ('must_complete','must_pass','must_not_fail')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (dependent_task_id, blocking_task_id)
);

CREATE TABLE IF NOT EXISTS escalation_decisions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  from_model_id TEXT REFERENCES model_registry(id),
  to_model_id TEXT REFERENCES model_registry(id),
  attempt_count INT,
  failure_reason TEXT,
  escalation_reason TEXT,
  escalated_at TEXT NOT NULL DEFAULT (datetime('now')),
  triggered_by TEXT -- agent or system
);

CREATE TABLE IF NOT EXISTS human_escalations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  escalation_reason TEXT NOT NULL,
  escalation_type TEXT CHECK (escalation_type IN ('model_exhausted','ambiguous_failure','decision_required','timeout','policy_violation')),
  escalated_by TEXT, -- agent or system
  escalated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- Decision
  human_assigned_to TEXT,
  decision_status TEXT DEFAULT 'pending' CHECK (decision_status IN ('pending','approved','rejected','delegated','deferred')),
  decision_note TEXT,
  decided_at TEXT,
  decided_by TEXT REFERENCES identities(id),
  
  -- Outcome
  resolution TEXT
);

CREATE TABLE IF NOT EXISTS attempt_log (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  attempt_number INT NOT NULL,
  model_id TEXT NOT NULL REFERENCES model_registry(id),
  agent_id TEXT REFERENCES identities(id),
  
  -- Execution
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INT,
  
  -- Resource usage
  tokens_input INT,
  tokens_output INT,
  tokens_cached INT,
  cost_usd REAL,
  
  -- Outcome
  success INTEGER,
  exit_code INT,
  error_message TEXT,
  
  -- What happened
  escalation_triggered INTEGER DEFAULT 0,
  UNIQUE (task_id, attempt_number)
);

-- Task state transitions (audit trail)
CREATE TABLE IF NOT EXISTS state_transitions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  from_state TEXT,
  to_state TEXT,
  triggered_by TEXT, -- agent or event type
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT
);

-- Indexes for Phase 3
CREATE INDEX IF NOT EXISTS idx_task_workflow_state ON task_workflow(current_state);
CREATE INDEX IF NOT EXISTS idx_task_workflow_agent ON task_workflow(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_task_workflow_model ON task_workflow(assigned_model_id);
CREATE INDEX IF NOT EXISTS idx_event_bus_type ON event_bus(event_type);
CREATE INDEX IF NOT EXISTS idx_event_bus_task ON event_bus(task_id);
CREATE INDEX IF NOT EXISTS idx_event_bus_agent ON event_bus(agent_id);
CREATE INDEX IF NOT EXISTS idx_event_bus_created ON event_bus(created_at);
CREATE INDEX IF NOT EXISTS idx_dependency_blocking ON dependency_graph(blocking_task_id);
CREATE INDEX IF NOT EXISTS idx_dependency_dependent ON dependency_graph(dependent_task_id);
CREATE INDEX IF NOT EXISTS idx_escalation_task ON escalation_decisions(task_id);
CREATE INDEX IF NOT EXISTS idx_human_escalation_status ON human_escalations(decision_status);
CREATE INDEX IF NOT EXISTS idx_attempt_log_task ON attempt_log(task_id);
CREATE INDEX IF NOT EXISTS idx_state_transitions_task ON state_transitions(task_id);
