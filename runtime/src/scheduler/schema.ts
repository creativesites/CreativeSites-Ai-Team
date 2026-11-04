/**
 * Migration v17 (WP6): named, timezone-aware schedules, the per-slot run ledger and the stand-up
 * pipeline's tables. Additive only; registered in migrations.ts.
 */
export const SCHEDULER_SQL = `
  ALTER TABLE agent_schedules ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
  ALTER TABLE agent_schedules ADD COLUMN name TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS agent_schedules_name ON agent_schedules(name) WHERE name IS NOT NULL;

  -- One row per due slot of a schedule. UNIQUE(schedule_id, due_at) is what makes a slot run once, across restarts.
  CREATE TABLE IF NOT EXISTS schedule_runs (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL,
    due_at TEXT NOT NULL,
    ran_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ran','caught_up','skipped','failed')),
    delay_ms INTEGER NOT NULL DEFAULT 0,
    detail TEXT,
    UNIQUE (schedule_id, due_at)
  );
  CREATE INDEX IF NOT EXISTS schedule_runs_schedule ON schedule_runs(schedule_id, due_at DESC);

  -- Stand-ups: the V2 pipeline is one report per team per date. Rows from earlier producers (import,
  -- manual POST) keep a team_id of their own so they never collide with it.
  ALTER TABLE standups ADD COLUMN team_id TEXT NOT NULL DEFAULT 'default';
  UPDATE standups SET team_id = 'legacy-' || id;
  CREATE UNIQUE INDEX IF NOT EXISTS standups_team_date ON standups(team_id, standup_date);

  CREATE TABLE IF NOT EXISTS standup_runs (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    standup_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('collecting','completed')),
    requested_at TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    since TEXT NOT NULL,
    completed_at TEXT,
    agents TEXT NOT NULL DEFAULT '[]',
    standup_id INTEGER,
    UNIQUE (team_id, standup_date)
  );

  CREATE TABLE IF NOT EXISTS standup_replies (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    done TEXT NOT NULL DEFAULT '',
    next TEXT NOT NULL DEFAULT '',
    blockers TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'tool',
    created_at TEXT NOT NULL,
    UNIQUE (run_id, agent_id)
  );
`;
