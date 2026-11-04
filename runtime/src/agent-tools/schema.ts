/**
 * Tables owned by the agent action interface (programme plan K4). Registered as a
 * store migration in migrations.ts; kept here so the module documents its own data.
 */
export const AGENT_TOOLS_SQL = `
  CREATE TABLE IF NOT EXISTS session_tokens (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    identity_id TEXT NOT NULL,
    session_id TEXT,
    job_id TEXT,
    task_id TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS session_tokens_session ON session_tokens(session_id);

  CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    token_id TEXT,
    identity_id TEXT,
    session_id TEXT,
    job_id TEXT,
    task_id TEXT,
    tool TEXT NOT NULL,
    args TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ok','rejected','error')),
    error TEXT,
    result TEXT,
    idempotency_key TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tool_calls_session ON tool_calls(session_id, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS tool_calls_idem ON tool_calls(identity_id, tool, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND status = 'ok';

  CREATE TABLE IF NOT EXISTS blockers (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    task_id TEXT,
    raised_by TEXT NOT NULL,
    summary TEXT NOT NULL,
    needs TEXT,
    severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('low','normal','high')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
    resolved_by TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS blockers_open ON blockers(status, created_at);
`;
