use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityRow {
    pub id: String,
    pub display_name: String,
    pub symbol: Option<String>,
    pub primary_domain: Option<String>,
    pub lane: Option<String>,
    pub observed_liveness: Option<String>,
    pub is_active: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRow {
    pub id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub assignee_id: Option<String>,
    pub priority: Option<String>,
    pub status: Option<String>,
    pub repo: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRow {
    pub id: i64,
    pub ts: String,
    pub event_type: String,
    pub sender: Option<String>,
    pub task_id: Option<String>,
    pub payload: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MyaosDbSummary {
    pub total_identities: i64,
    pub live_identities: i64,
    pub open_tasks: i64,
    pub total_events: i64,
    pub recent_tasks: Vec<TaskRow>,
    pub recent_events: Vec<EventRow>,
}

pub struct DbBridge {
    db_path: String,
}

impl DbBridge {
    pub fn new<P: AsRef<Path>>(path: P) -> Self {
        Self {
            db_path: path.as_ref().to_string_lossy().to_string(),
        }
    }

    fn connect(&self) -> Result<Connection> {
        Connection::open(&self.db_path)
    }

    pub fn get_summary(&self) -> Result<MyaosDbSummary, String> {
        let conn = self.connect().map_err(|e| format!("Failed to open SQLite DB: {}", e))?;

        let total_identities: i64 = conn
            .query_row("SELECT COUNT(*) FROM identities WHERE is_active = 1", [], |r| r.get(0))
            .unwrap_or(0);

        let live_identities: i64 = conn
            .query_row("SELECT COUNT(*) FROM identities WHERE observed_liveness = 'LIVE'", [], |r| r.get(0))
            .unwrap_or(0);

        let open_tasks: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks WHERE status IN ('open','claimed','in_progress')", [], |r| r.get(0))
            .unwrap_or(0);

        let total_events: i64 = conn
            .query_row("SELECT COUNT(*) FROM events", [], |r| r.get(0))
            .unwrap_or(0);

        let mut task_stmt = conn
            .prepare("SELECT id, project_id, title, description, assignee_id, priority, status, repo, created_at FROM tasks ORDER BY created_at DESC LIMIT 20")
            .map_err(|e| e.to_string())?;

        let recent_tasks = task_stmt
            .query_map([], |row| {
                Ok(TaskRow {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    assignee_id: row.get(4)?,
                    priority: row.get(5)?,
                    status: row.get(6)?,
                    repo: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let mut event_stmt = conn
            .prepare("SELECT id, ts, type, sender, task_id, payload FROM events ORDER BY id DESC LIMIT 30")
            .map_err(|e| e.to_string())?;

        let recent_events = event_stmt
            .query_map([], |row| {
                Ok(EventRow {
                    id: row.get(0)?,
                    ts: row.get(1)?,
                    event_type: row.get(2)?,
                    sender: row.get(3)?,
                    task_id: row.get(4)?,
                    payload: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(MyaosDbSummary {
            total_identities,
            live_identities,
            open_tasks,
            total_events,
            recent_tasks,
            recent_events,
        })
    }

    pub fn get_identities(&self) -> Result<Vec<IdentityRow>, String> {
        let conn = self.connect().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, display_name, symbol, primary_domain, lane, observed_liveness, is_active FROM identities WHERE is_active = 1")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(IdentityRow {
                    id: row.get(0)?,
                    display_name: row.get(1)?,
                    symbol: row.get(2)?,
                    primary_domain: row.get(3)?,
                    lane: row.get(4)?,
                    observed_liveness: row.get(5)?,
                    is_active: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }
}
