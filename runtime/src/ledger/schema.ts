/** Workforce time ledger (programme plan K6, WP9). Registered as a store migration. */
export const LEDGER_SQL = `
  CREATE TABLE IF NOT EXISTS activity_intervals (
    id TEXT PRIMARY KEY,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('human','agent')),
    identity_id TEXT NOT NULL,
    session_id TEXT,
    turn_id TEXT,
    job_id TEXT,
    task_id TEXT,
    project_id TEXT,
    engagement_id TEXT,
    category TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_ms INTEGER,
    source TEXT NOT NULL CHECK (source IN ('timer','manual','turn','adjustment','import')),
    billable_status TEXT NOT NULL DEFAULT 'unclassified' CHECK (billable_status IN ('unclassified','billable','non_billable')),
    supports_interval_id TEXT,
    adjusts_interval_id TEXT,
    closed_by TEXT,
    note TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS activity_turn ON activity_intervals(session_id, turn_id) WHERE turn_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS activity_time ON activity_intervals(started_at);
  CREATE INDEX IF NOT EXISTS activity_identity ON activity_intervals(identity_id, started_at);
  -- At most one running timer per human.
  CREATE UNIQUE INDEX IF NOT EXISTS activity_open_timer ON activity_intervals(identity_id) WHERE source = 'timer' AND ended_at IS NULL;

  CREATE TABLE IF NOT EXISTS engagements (
    id TEXT PRIMARY KEY,
    client TEXT NOT NULL,
    role TEXT,
    hourly_rate_minor INTEGER,
    currency TEXT,
    min_weekly_hours REAL,
    max_weekly_hours REAL,
    start_date TEXT,
    end_date TEXT,
    external_time_system TEXT,
    external_task_system TEXT,
    pay_schedule TEXT NOT NULL DEFAULT 'unknown',
    allow_agent_billing INTEGER NOT NULL DEFAULT 0,
    ai_account_id TEXT,
    confidential INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'local_file',
    updated_at TEXT NOT NULL
  );
`;

/** Timesheets (WP9 9.6): a snapshot of an engagement week, approved by the owner, exported with a reconciliation hash. */
export const TIMESHEETS_SQL = `
  CREATE TABLE IF NOT EXISTS timesheets (
    id TEXT PRIMARY KEY,
    engagement_id TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','approved','superseded')),
    totals TEXT NOT NULL,
    interval_ids TEXT NOT NULL,
    export_hash TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    approved_by TEXT,
    approved_at TEXT,
    UNIQUE (engagement_id, period_start, revision)
  );
`;
