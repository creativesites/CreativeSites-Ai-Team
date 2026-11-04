//! Machine-specific settings, read from `~/.myaos/config.json` (or `$MYAOS_CONFIG`).
//!
//! Nothing here may fall back to one person's home directory. When a value is
//! not configured, the team repo is found by walking up from the current
//! directory to the folder that holds `community/agents.json`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspaceEntry {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MyaosConfig {
    pub team_repo: Option<String>,
    pub db_path: Option<String>,
    pub workspaces: Vec<WorkspaceEntry>,
    pub agent_workspaces: HashMap<String, String>,
    pub clone_parent_dir: Option<String>,
    pub new_project_parent_dir: Option<String>,
}

/// What the frontend receives: every path already resolved, `None` when unknown.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedConfig {
    pub config_path: Option<String>,
    pub config_found: bool,
    pub team_repo: Option<String>,
    pub db_path: Option<String>,
    pub home: Option<String>,
    pub workspaces: Vec<WorkspaceEntry>,
    pub agent_workspaces: HashMap<String, String>,
    pub clone_parent_dir: Option<String>,
    pub new_project_parent_dir: Option<String>,
}

static CONFIG: OnceLock<MyaosConfig> = OnceLock::new();

pub fn config() -> &'static MyaosConfig {
    CONFIG.get_or_init(MyaosConfig::load)
}

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").filter(|h| !h.is_empty()).map(PathBuf::from)
}

pub fn config_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("MYAOS_CONFIG") {
        if !p.trim().is_empty() {
            return Some(expand_home(&p));
        }
    }
    home_dir().map(|h| h.join(".myaos").join("config.json"))
}

/// Expands a leading `~/` to the home directory.
pub fn expand_home(p: &str) -> PathBuf {
    if let Some(rest) = p.strip_prefix("~/") {
        if let Some(home) = home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(p)
}

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var(name)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(|v| expand_home(&v))
}

fn find_team_repo_from(start: &Path) -> Option<PathBuf> {
    start
        .ancestors()
        .find(|dir| dir.join("community").join("agents.json").exists())
        .map(Path::to_path_buf)
}

impl MyaosConfig {
    pub fn load() -> Self {
        let Some(path) = config_path() else {
            return Self::default();
        };
        match std::fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text).unwrap_or_else(|e| {
                eprintln!("[MyaOS] Ignoring unreadable config {}: {}", path.display(), e);
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    /// `$MYAOS_TEAM_REPO` (or the older `$MYAOS_WORKSPACE_ROOT`), then config,
    /// then the nearest folder above the current directory or the executable
    /// that holds `community/agents.json`.
    pub fn resolve_team_repo(&self) -> Option<PathBuf> {
        if let Some(p) = env_path("MYAOS_TEAM_REPO").or_else(|| env_path("MYAOS_WORKSPACE_ROOT")) {
            return Some(p);
        }
        if let Some(p) = self.team_repo.as_deref().map(expand_home) {
            return Some(p);
        }
        let from_cwd = std::env::current_dir().ok().and_then(|d| find_team_repo_from(&d));
        from_cwd.or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().and_then(find_team_repo_from))
        })
    }

    /// `$MYAOS_DB_PATH`, then config, then `<team repo>/data/myaos.db`.
    pub fn resolve_db_path(&self) -> Option<PathBuf> {
        env_path("MYAOS_DB_PATH")
            .or_else(|| self.db_path.as_deref().map(expand_home))
            .or_else(|| self.resolve_team_repo().map(|r| r.join("data").join("myaos.db")))
    }

    pub fn agent_workspace(&self, agent_id: &str) -> Option<String> {
        self.agent_workspaces
            .get(&agent_id.to_lowercase())
            .map(|p| expand_home(p).to_string_lossy().to_string())
    }

    pub fn resolved(&self) -> ResolvedConfig {
        let path = config_path();
        let s = |p: PathBuf| p.to_string_lossy().to_string();
        ResolvedConfig {
            config_found: path.as_ref().map(|p| p.exists()).unwrap_or(false),
            config_path: path.map(s),
            team_repo: self.resolve_team_repo().map(s),
            db_path: self.resolve_db_path().map(s),
            home: home_dir().map(s),
            workspaces: self
                .workspaces
                .iter()
                .map(|w| WorkspaceEntry { path: s(expand_home(&w.path)), ..w.clone() })
                .collect(),
            agent_workspaces: self
                .agent_workspaces
                .iter()
                .map(|(k, v)| (k.to_lowercase(), s(expand_home(v))))
                .collect(),
            clone_parent_dir: self.clone_parent_dir.as_deref().map(|p| s(expand_home(p))),
            new_project_parent_dir: self.new_project_parent_dir.as_deref().map(|p| s(expand_home(p))),
        }
    }
}
