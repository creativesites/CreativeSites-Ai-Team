use std::collections::HashMap;
use tauri::{AppHandle, State};
use crate::pty::{PtyManager, PtySessionInfo};
use crate::runtime::{get_available_runtime_adapters, RuntimeAdapterInfo};
use crate::system::db::{
    AgentProfileDetails, AnnouncementRow, AutopilotHistoryRow, AutopilotTaskRow, ChatMessageRow, DesignProjectRow, EmailPreviewItem, EvidenceRow, HumanDecisionRow, IdentityRow,
    IntegrationConfigRow, JulesMissionMessageRow, JulesMissionPlanRow, MemoryBookmarkRow, MyaosDbSummary, ObservabilitySummary,
    OkrKeyResultRow, OkrObjectiveRow, PendingApprovalRow, ProjectComponentRow, ProjectDesignPhilosophyRow, ProjectRow, ProjectScreenVersionRow, ProjectUiInspectionResult, RealityAuditResult, SecretRow, SocialPostRow, StandupRow,
    TaskRow, ThreadRow, UserRow, WorkspaceInfo,
};
use crate::system::SystemManager;

#[tauri::command]
pub fn pty_spawn(
    app_handle: AppHandle,
    pty_manager: State<'_, PtyManager>,
    session_id: String,
    runtime_id: String,
    agent_id: String,
    project_id: Option<String>,
    task_id: Option<String>,
    command: String,
    args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    env: Option<HashMap<String, String>>,
) -> Result<PtySessionInfo, String> {
    pty_manager.spawn(
        app_handle,
        session_id,
        runtime_id,
        agent_id,
        project_id,
        task_id,
        command,
        args,
        cwd,
        cols,
        rows,
        env,
    )
}

#[tauri::command]
pub fn pty_write(
    pty_manager: State<'_, PtyManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    pty_manager.write(&session_id, data.as_bytes())
}

#[tauri::command]
pub fn pty_resize(
    pty_manager: State<'_, PtyManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    pty_manager.resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn pty_kill(
    pty_manager: State<'_, PtyManager>,
    session_id: String,
) -> Result<(), String> {
    pty_manager.kill(&session_id)
}

#[tauri::command]
pub fn pty_list(pty_manager: State<'_, PtyManager>) -> Result<Vec<PtySessionInfo>, String> {
    Ok(pty_manager.list())
}

pub fn resolve_agent_working_directory(agent_id: &str, requested_cwd: Option<String>) -> String {
    if let Some(cwd) = requested_cwd {
        let trimmed = cwd.trim();
        if !trimmed.is_empty() && trimmed != "." {
            let path = std::path::Path::new(trimmed);
            if path.exists() {
                return trimmed.to_string();
            }
        }
    }

    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/winstonzulu".to_string());
    let webstorm = format!("{}/WebstormProjects", home);
    let github = format!("{}/Documents/GitHub", home);

    match agent_id.to_lowercase().as_str() {
        "astra" => {
            let p = format!("{}/Myavana-Chatbot", webstorm);
            if std::path::Path::new(&p).exists() { return p; }
        }
        "iris" => {
            let p = format!("{}/Myavana-Chatbot-Dashboard", webstorm);
            if std::path::Path::new(&p).exists() { return p; }
        }
        "vela" => {
            let p1 = format!("{}/Myavana-Hair-Journey", github);
            let p2 = format!("{}/myavana-hair-journey-next", webstorm);
            if std::path::Path::new(&p1).exists() { return p1; }
            if std::path::Path::new(&p2).exists() { return p2; }
        }
        "lyra" => {
            let p = format!("{}/MyAvana_FrontEnd_RN", webstorm);
            if std::path::Path::new(&p).exists() { return p; }
        }
        "kael" => {
            let p = format!("{}/Myavana-Chatbot", webstorm);
            if std::path::Path::new(&p).exists() { return p; }
        }
        _ => {}
    }

    let default_root = format!("{}/CreativeSites-Ai-Team", webstorm);
    if std::path::Path::new(&default_root).exists() {
        default_root
    } else {
        home
    }
}

#[tauri::command]
pub fn pty_spawn_claude(
    app_handle: AppHandle,
    pty_manager: State<'_, PtyManager>,
    agent_id: Option<String>,
    cwd: Option<String>,
    resume: Option<bool>,
    prompt: Option<String>,
) -> Result<PtySessionInfo, String> {
    let aid = agent_id.unwrap_or_else(|| "atlas".to_string());
    let session_id = format!("claude_{}_{}", aid, chrono::Utc::now().timestamp_millis());
    let target_cwd = resolve_agent_working_directory(&aid, cwd);
    let mut args = Vec::new();
    if resume.unwrap_or(false) {
        args.push("--continue".to_string());
    }
    if let Some(p) = prompt {
        let p_trimmed = p.trim();
        if !p_trimmed.is_empty() {
            args.push(p_trimmed.to_string());
        }
    }
    pty_manager.spawn(
        app_handle,
        session_id,
        format!("rt_claude_{}", aid),
        aid,
        None,
        None,
        "claude".to_string(),
        args,
        target_cwd,
        120,
        34,
        None,
    )
}

#[tauri::command]
pub fn pty_spawn_gemini(
    app_handle: AppHandle,
    pty_manager: State<'_, PtyManager>,
    agent_id: Option<String>,
    cwd: Option<String>,
    resume: Option<bool>,
    prompt: Option<String>,
) -> Result<PtySessionInfo, String> {
    let aid = agent_id.unwrap_or_else(|| "astra".to_string());
    let session_id = format!("gemini_{}_{}", aid, chrono::Utc::now().timestamp_millis());
    let target_cwd = resolve_agent_working_directory(&aid, cwd);
    let mut args = Vec::new();
    if resume.unwrap_or(false) {
        args.push("-r".to_string());
        args.push("latest".to_string());
    }
    if let Some(p) = prompt {
        let p_trimmed = p.trim();
        if !p_trimmed.is_empty() {
            args.push("-i".to_string());
            args.push(p_trimmed.to_string());
        }
    }
    pty_manager.spawn(
        app_handle,
        session_id,
        format!("rt_gemini_{}", aid),
        aid,
        None,
        None,
        "gemini".to_string(),
        args,
        target_cwd,
        120,
        34,
        None,
    )
}

#[tauri::command]
pub fn pty_spawn_antigravity(
    app_handle: AppHandle,
    pty_manager: State<'_, PtyManager>,
    agent_id: Option<String>,
    cwd: Option<String>,
    resume: Option<bool>,
    prompt: Option<String>,
) -> Result<PtySessionInfo, String> {
    let aid = agent_id.unwrap_or_else(|| "antigravity".to_string());
    let session_id = format!("antigravity_{}_{}", aid, chrono::Utc::now().timestamp_millis());
    let target_cwd = resolve_agent_working_directory(&aid, cwd);
    let mut args = Vec::new();
    if resume.unwrap_or(false) {
        args.push("-r".to_string());
        args.push("latest".to_string());
    }
    if let Some(p) = prompt {
        let p_trimmed = p.trim();
        if !p_trimmed.is_empty() {
            args.push("-i".to_string());
            args.push(p_trimmed.to_string());
        }
    }
    pty_manager.spawn(
        app_handle,
        session_id,
        format!("rt_antigravity_{}", aid),
        aid,
        None,
        None,
        "antigravity".to_string(),
        args,
        target_cwd,
        120,
        34,
        None,
    )
}

#[tauri::command]
pub fn pty_spawn_shell(
    app_handle: AppHandle,
    pty_manager: State<'_, PtyManager>,
    cwd: Option<String>,
) -> Result<PtySessionInfo, String> {
    let session_id = format!("shell_{}", chrono::Utc::now().timestamp_millis());
    let target_cwd = resolve_agent_working_directory("system", cwd);
    let (shell_cmd, shell_args) = if cfg!(target_os = "windows") {
        ("powershell.exe".to_string(), vec![])
    } else {
        ("zsh".to_string(), vec!["-l".to_string()])
    };
    pty_manager.spawn(
        app_handle,
        session_id,
        "rt_shell".to_string(),
        "system".to_string(),
        None,
        None,
        shell_cmd,
        shell_args,
        target_cwd,
        120,
        34,
        None,
    )
}

#[tauri::command]
pub fn myaos_get_gemini_api_key() -> Result<String, String> {
    // 1. Check user-configured secret in SQLite DB
    let db_bridge = crate::system::db::DbBridge::new("/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/data/myaos.db");
    if let Ok(Some(custom_key)) = db_bridge.get_secret("gemini_api_key") {
        let clean = custom_key.trim().to_string();
        if !clean.is_empty() {
            return Ok(clean);
        }
    }
    if let Ok(key) = std::env::var("GEMINI_API_KEY") {
        if !key.is_empty() {
            return Ok(key);
        }
    }
    let env_path = std::path::Path::new("/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/.env");
    if env_path.exists() {
        if let Ok(content) = std::fs::read_to_string(env_path) {
            for line in content.lines() {
                if let Some(stripped) = line.strip_prefix("GEMINI_API_KEY=") {
                    let clean = stripped.trim().trim_matches('"').trim_matches('\'');
                    if !clean.is_empty() {
                        return Ok(clean.to_string());
                    }
                }
            }
        }
    }
    Err("GEMINI_API_KEY not found in environment, .env, or database secrets".to_string())
}

#[tauri::command]
pub async fn myaos_call_gemini_orchestrator(
    contents: serde_json::Value,
) -> Result<String, String> {
    let api_key = myaos_get_gemini_api_key()?;
    let endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let payload = serde_json::json!({
        "contents": contents,
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 8192,
            "thinkingConfig": {
                "thinkingBudget": 1024
            }
        }
    });

    let resp = client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", &api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Network transport error calling Gemini API: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read Gemini response body: {}", e))?;

    if !status.is_success() {
        return Err(format!("Gemini API HTTP {}: {}", status, text));
    }

    Ok(text)
}

#[tauri::command]
pub fn myaos_get_agent_working_dir(agent_id: String) -> Result<String, String> {
    Ok(resolve_agent_working_directory(&agent_id, None))
}

#[tauri::command]
pub fn runtime_list_adapters() -> Result<Vec<RuntimeAdapterInfo>, String> {
    Ok(get_available_runtime_adapters())
}

#[tauri::command]
pub fn myaos_get_summary(
    system_manager: State<'_, SystemManager>,
) -> Result<MyaosDbSummary, String> {
    system_manager.db_bridge.get_summary()
}

#[tauri::command]
pub fn myaos_get_identities(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<IdentityRow>, String> {
    system_manager.db_bridge.get_identities()
}

#[tauri::command]
pub fn myaos_get_pending_decisions(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<HumanDecisionRow>, String> {
    system_manager.db_bridge.get_pending_decisions()
}

#[tauri::command]
pub fn myaos_record_decision(
    system_manager: State<'_, SystemManager>,
    decision_id: i64,
    status: String,
    decided_by: Option<String>,
    note: Option<String>,
) -> Result<(), String> {
    let decider = decided_by.unwrap_or_else(|| "Winston".to_string());
    system_manager.db_bridge.record_decision(decision_id, &status, &decider, note.as_deref())
}

#[tauri::command]
pub fn myaos_create_task(
    system_manager: State<'_, SystemManager>,
    title: String,
    description: Option<String>,
    assignee_id: Option<String>,
    priority: Option<String>,
    repo: Option<String>,
) -> Result<TaskRow, String> {
    system_manager.db_bridge.create_task(
        &title,
        description.as_deref(),
        assignee_id.as_deref(),
        priority.as_deref(),
        repo.as_deref(),
    )
}

#[tauri::command]
pub fn myaos_wake_all_agents(
    system_manager: State<'_, SystemManager>,
) -> Result<(), String> {
    system_manager.db_bridge.wake_all_agents()
}

#[tauri::command]
pub fn myaos_sleep_all_agents(
    system_manager: State<'_, SystemManager>,
) -> Result<(), String> {
    system_manager.db_bridge.sleep_all_agents()
}

#[tauri::command]
pub fn system_enable_sleep_prevention(
    system_manager: State<'_, SystemManager>,
) -> Result<bool, String> {
    system_manager.enable_sleep_prevention()
}

#[tauri::command]
pub fn system_disable_sleep_prevention(
    system_manager: State<'_, SystemManager>,
) -> Result<bool, String> {
    system_manager.disable_sleep_prevention()
}

#[tauri::command]
pub fn system_is_sleep_prevented(
    system_manager: State<'_, SystemManager>,
) -> Result<bool, String> {
    Ok(system_manager.is_sleep_prevented())
}

#[tauri::command]
pub fn myaos_get_workspaces_status(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<WorkspaceInfo>, String> {
    system_manager.db_bridge.get_workspaces_status()
}

#[tauri::command]
pub fn myaos_get_chat_messages(
    system_manager: State<'_, SystemManager>,
    limit: Option<i64>,
) -> Result<Vec<ChatMessageRow>, String> {
    system_manager.db_bridge.get_chat_messages(limit.unwrap_or(50))
}

#[tauri::command]
pub fn myaos_send_chat_message(
    system_manager: State<'_, SystemManager>,
    from: String,
    to: String,
    body: String,
) -> Result<ChatMessageRow, String> {
    system_manager.db_bridge.send_chat_message(&from, &to, &body)
}

#[tauri::command]
pub fn myaos_get_inbox_messages(
    system_manager: State<'_, SystemManager>,
    identity: String,
    limit: Option<i64>,
) -> Result<Vec<ChatMessageRow>, String> {
    system_manager.db_bridge.get_inbox_messages(&identity, limit.unwrap_or(50))
}

#[tauri::command]
pub fn myaos_list_threads(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<ThreadRow>, String> {
    system_manager.db_bridge.list_threads()
}

#[tauri::command]
pub fn myaos_get_thread_messages(
    system_manager: State<'_, SystemManager>,
    thread_id: String,
) -> Result<Vec<ChatMessageRow>, String> {
    system_manager.db_bridge.get_thread_messages(&thread_id)
}

#[tauri::command]
pub fn myaos_create_thread(
    system_manager: State<'_, SystemManager>,
    title: String,
    author: String,
    target_identities: Vec<String>,
    initial_message: String,
) -> Result<ThreadRow, String> {
    system_manager.db_bridge.create_thread(&title, &author, target_identities, &initial_message)
}

#[tauri::command]
pub fn myaos_post_thread_reply(
    system_manager: State<'_, SystemManager>,
    thread_id: String,
    from: String,
    body: String,
) -> Result<ChatMessageRow, String> {
    system_manager.db_bridge.post_thread_reply(&thread_id, &from, &body)
}

#[tauri::command]
pub fn myaos_list_announcements(
    system_manager: State<'_, SystemManager>,
    limit: Option<i64>,
) -> Result<Vec<AnnouncementRow>, String> {
    system_manager.db_bridge.list_announcements(limit.unwrap_or(20))
}

#[tauri::command]
pub fn myaos_create_announcement(
    system_manager: State<'_, SystemManager>,
    title: String,
    author: String,
    content: String,
    audience: Option<String>,
) -> Result<AnnouncementRow, String> {
    system_manager.db_bridge.create_announcement(&title, &author, &content, audience.as_deref())
}

#[tauri::command]
pub fn myaos_list_social_posts(
    system_manager: State<'_, SystemManager>,
    channel: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<SocialPostRow>, String> {
    system_manager.db_bridge.list_social_posts(channel.as_deref(), limit.unwrap_or(50))
}

#[tauri::command]
pub fn myaos_create_social_post(
    system_manager: State<'_, SystemManager>,
    channel: String,
    author: String,
    content: String,
) -> Result<SocialPostRow, String> {
    system_manager.db_bridge.create_social_post(&channel, &author, &content)
}

#[tauri::command]
pub fn myaos_list_standups(
    system_manager: State<'_, SystemManager>,
    limit: Option<i64>,
) -> Result<Vec<StandupRow>, String> {
    system_manager.db_bridge.list_standups(limit.unwrap_or(10))
}

#[tauri::command]
pub fn myaos_create_standup(
    system_manager: State<'_, SystemManager>,
    standup_date: String,
    facilitator: String,
    present_identities: Vec<String>,
    content: String,
) -> Result<StandupRow, String> {
    system_manager.db_bridge.create_standup(&standup_date, &facilitator, present_identities, &content)
}

#[tauri::command]
pub fn myaos_get_evidence(
    system_manager: State<'_, SystemManager>,
    limit: Option<i64>,
) -> Result<Vec<EvidenceRow>, String> {
    system_manager.db_bridge.get_evidence_records(limit.unwrap_or(30))
}

#[tauri::command]
pub fn myaos_get_observability_metrics(
    system_manager: State<'_, SystemManager>,
) -> Result<ObservabilitySummary, String> {
    system_manager.db_bridge.get_observability_summary()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClaudeTurnInfo {
    pub session_id: String,
    pub timestamp: Option<String>,
    pub stop_reason: Option<String>,
    pub is_done: bool,
    pub text: String,
    pub project_slug: String,
    pub file_mtime: u64,
}

#[tauri::command]
pub fn myaos_get_claude_latest_turn(cwd: String) -> Result<Option<ClaudeTurnInfo>, String> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};
    use std::path::PathBuf;

    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let slug = cwd.replace('/', "-");
    let project_dir = PathBuf::from(&home).join(".claude").join("projects").join(&slug);

    if !project_dir.exists() {
        return Ok(None);
    }

    let entries = match std::fs::read_dir(&project_dir) {
        Ok(e) => e,
        Err(_) => return Ok(None),
    };

    let mut jsonl_files: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
            if let Ok(meta) = path.metadata() {
                if let Ok(modified) = meta.modified() {
                    jsonl_files.push((path, modified));
                }
            }
        }
    }

    jsonl_files.sort_by(|a, b| b.1.cmp(&a.1));

    if let Some((latest_path, mtime)) = jsonl_files.first() {
        let mut file = match File::open(latest_path) {
            Ok(f) => f,
            Err(_) => return Ok(None),
        };
        let file_len = match file.metadata() {
            Ok(m) => m.len(),
            Err(_) => return Ok(None),
        };

        let read_size = (131072 as u64).min(file_len);
        let seek_pos = file_len - read_size;
        let _ = file.seek(SeekFrom::Start(seek_pos));

        let mut buf = Vec::new();
        let _ = file.read_to_end(&mut buf);
        let content = String::from_utf8_lossy(&buf);

        let lines: Vec<&str> = content.lines().collect();
        for line in lines.iter().rev() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                if val.get("type").and_then(|v| v.as_str()) == Some("assistant") {
                    let stop_reason = val
                        .get("message")
                        .and_then(|m| m.get("stop_reason"))
                        .and_then(|r| r.as_str())
                        .map(|s| s.to_string());

                    let mut text_parts = Vec::new();
                    if let Some(contents) = val.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
                        for c in contents {
                            if c.get("type").and_then(|t| t.as_str()) == Some("text") {
                                if let Some(t) = c.get("text").and_then(|t| t.as_str()) {
                                    text_parts.push(t);
                                }
                            }
                        }
                    }

                    let is_done = stop_reason.as_deref() == Some("end_turn");
                    let mtime_secs = mtime
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    let session_name = latest_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("unknown")
                        .to_string();

                    return Ok(Some(ClaudeTurnInfo {
                        session_id: session_name,
                        timestamp: val.get("timestamp").and_then(|t| t.as_str()).map(|s| s.to_string()),
                        stop_reason,
                        is_done,
                        text: text_parts.join("\n\n"),
                        project_slug: slug,
                        file_mtime: mtime_secs,
                    }));
                }
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn myaos_log_mission_event(
    system_manager: State<'_, SystemManager>,
    event_type: String,
    sender: String,
    task_id: Option<String>,
    payload: Option<String>,
) -> Result<(), String> {
    system_manager.db_bridge.log_event(&event_type, &sender, task_id.as_deref(), payload.as_deref())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitFileDiff {
    pub path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub diff_content: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitWorkspaceDiff {
    pub branch: String,
    pub clean: bool,
    pub total_additions: usize,
    pub total_deletions: usize,
    pub files: Vec<GitFileDiff>,
}

#[tauri::command]
pub fn myaos_get_git_diff(cwd: String) -> Result<GitWorkspaceDiff, String> {
    let path = std::path::Path::new(&cwd);
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    // 1. Get branch
    let branch_output = std::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&cwd)
        .output();
    let branch = match branch_output {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
        _ => "main".to_string(),
    };

    // 2. Get status porcelain
    let status_output = std::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    let status_str = String::from_utf8_lossy(&status_output.stdout);
    let mut status_map: HashMap<String, String> = HashMap::new();
    let mut untracked_files: Vec<String> = Vec::new();

    for line in status_str.lines() {
        if line.len() >= 4 {
            let status_code = line[0..2].trim().to_string();
            let file_path = line[3..].trim().to_string();
            if status_code == "??" {
                untracked_files.push(file_path);
            } else {
                status_map.insert(file_path, status_code);
            }
        }
    }

    // 3. Get unified diff
    let mut diff_output = std::process::Command::new("git")
        .args(["diff", "HEAD", "-U3"])
        .current_dir(&cwd)
        .output();

    if diff_output.as_ref().map(|o| !o.status.success()).unwrap_or(true) {
        diff_output = std::process::Command::new("git")
            .args(["diff", "-U3"])
            .current_dir(&cwd)
            .output();
    }

    let diff_raw = match diff_output {
        Ok(out) => String::from_utf8_lossy(&out.stdout).to_string(),
        Err(_) => String::new(),
    };

    let mut files: Vec<GitFileDiff> = Vec::new();
    let mut total_additions = 0;
    let mut total_deletions = 0;

    if !diff_raw.is_empty() {
        let file_chunks: Vec<&str> = diff_raw.split("\ndiff --git ").collect();
        for (i, chunk) in file_chunks.iter().enumerate() {
            let full_chunk = if i > 0 {
                format!("diff --git {}", chunk)
            } else if chunk.starts_with("diff --git ") {
                chunk.to_string()
            } else {
                continue;
            };

            let mut file_path = String::new();
            for line in full_chunk.lines() {
                if let Some(stripped) = line.strip_prefix("+++ b/") {
                    file_path = stripped.trim().to_string();
                    break;
                } else if let Some(stripped) = line.strip_prefix("--- a/") {
                    if file_path.is_empty() && stripped != "/dev/null" {
                        file_path = stripped.trim().to_string();
                    }
                }
            }

            if file_path.is_empty() {
                if let Some(first_line) = full_chunk.lines().next() {
                    let parts: Vec<&str> = first_line.split_whitespace().collect();
                    if parts.len() >= 4 {
                        file_path = parts[3].trim_start_matches("b/").to_string();
                    }
                }
            }

            if file_path.is_empty() {
                continue;
            }

            let mut additions = 0;
            let mut deletions = 0;
            for line in full_chunk.lines() {
                if line.starts_with('+') && !line.starts_with("+++") {
                    additions += 1;
                } else if line.starts_with('-') && !line.starts_with("---") {
                    deletions += 1;
                }
            }

            total_additions += additions;
            total_deletions += deletions;

            let status = status_map
                .remove(&file_path)
                .unwrap_or_else(|| "M".to_string());

            files.push(GitFileDiff {
                path: file_path,
                status,
                additions,
                deletions,
                diff_content: full_chunk,
            });
        }
    }

    for untracked in untracked_files {
        let full_p = path.join(&untracked);
        let line_count = if let Ok(content) = std::fs::read_to_string(&full_p) {
            content.lines().count()
        } else {
            0
        };

        total_additions += line_count;
        files.push(GitFileDiff {
            path: untracked.clone(),
            status: "?".to_string(),
            additions: line_count,
            deletions: 0,
            diff_content: format!("Untracked new file: {}\nTotal new lines: {}", untracked, line_count),
        });
    }

    for (rem_path, rem_status) in status_map {
        if !files.iter().any(|f| f.path == rem_path) {
            files.push(GitFileDiff {
                path: rem_path,
                status: rem_status,
                additions: 0,
                deletions: 0,
                diff_content: "(Status changed, staged or binary file)".to_string(),
            });
        }
    }

    let clean = files.is_empty();

    Ok(GitWorkspaceDiff {
        branch,
        clean,
        total_additions,
        total_deletions,
        files,
    })
}

#[tauri::command]
pub fn myaos_stage_all_git(cwd: String) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .args(["add", "."])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to run git add: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn myaos_record_verification_evidence(
    system_manager: State<'_, SystemManager>,
    task_id: Option<String>,
    verifier_identity: String,
    evidence_class: String,
    passed: bool,
    details: Option<String>,
    exit_code: Option<i64>,
    verified_files: Option<String>,
) -> Result<i64, String> {
    system_manager.db_bridge.insert_evidence(
        task_id.as_deref(),
        &verifier_identity,
        &evidence_class,
        passed,
        details.as_deref(),
        exit_code,
        verified_files.as_deref(),
    )
}

#[tauri::command]
pub fn myaos_save_mission_plan(
    system_manager: State<'_, SystemManager>,
    mission_id: String,
    title: String,
    workspace: String,
    assignee: String,
    engine: String,
    summary: Option<String>,
    plan_json: String,
) -> Result<JulesMissionPlanRow, String> {
    system_manager.db_bridge.save_jules_mission_plan(
        &mission_id,
        &title,
        &workspace,
        &assignee,
        &engine,
        summary.as_deref(),
        &plan_json,
    )
}

#[tauri::command]
pub fn myaos_list_mission_plans(
    system_manager: State<'_, SystemManager>,
    limit: Option<i64>,
) -> Result<Vec<JulesMissionPlanRow>, String> {
    system_manager.db_bridge.list_jules_mission_plans(limit.unwrap_or(30))
}

#[tauri::command]
pub fn myaos_save_mission_message(
    system_manager: State<'_, SystemManager>,
    mission_id: String,
    sender: String,
    text: String,
    plan_json: Option<String>,
    turn_summary_json: Option<String>,
) -> Result<JulesMissionMessageRow, String> {
    system_manager.db_bridge.save_jules_mission_message(
        &mission_id,
        &sender,
        &text,
        plan_json.as_deref(),
        turn_summary_json.as_deref(),
    )
}

#[tauri::command]
pub fn myaos_get_mission_messages(
    system_manager: State<'_, SystemManager>,
    mission_id: String,
    limit: Option<i64>,
) -> Result<Vec<JulesMissionMessageRow>, String> {
    system_manager.db_bridge.get_jules_mission_messages(&mission_id, limit.unwrap_or(100))
}

#[tauri::command]
pub fn myaos_create_git_commit(cwd: String, message: String) -> Result<String, String> {
    let p = std::path::Path::new(&cwd);
    if !p.exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    let output = std::process::Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to execute git commit: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("git commit failed: {} {}", stdout, stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn myaos_create_git_branch(cwd: String, branch_name: String) -> Result<String, String> {
    let p = std::path::Path::new(&cwd);
    if !p.exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    let output = std::process::Command::new("git")
        .args(["checkout", "-b", &branch_name])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to execute git checkout -b: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git checkout -b failed: {}", stderr).trim().to_string());
    }

    Ok(format!("Created and switched to branch {}", branch_name))
}

#[tauri::command]
pub fn myaos_push_git_branch(cwd: String, branch: Option<String>) -> Result<String, String> {
    let p = std::path::Path::new(&cwd);
    if !p.exists() {
        return Err(format!("Directory does not exist: {}", cwd));
    }

    let mut cmd = std::process::Command::new("git");
    cmd.arg("push");
    if let Some(b) = branch {
        cmd.args(["-u", "origin", &b]);
    }
    cmd.current_dir(&cwd);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git push: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git push failed: {}", stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    Ok(format!("{} {}", stdout, stderr).trim().to_string())
}

#[tauri::command]
pub fn myaos_record_token_usage(
    system_manager: State<'_, SystemManager>,
    identity_id: String,
    model: String,
    input_tokens: i64,
    output_tokens: i64,
    cost_usd: f64,
) -> Result<i64, String> {
    system_manager.db_bridge.insert_token_usage(
        &identity_id,
        &model,
        input_tokens,
        output_tokens,
        cost_usd,
    )
}

#[tauri::command]
pub fn myaos_create_memory_bookmark(
    system_manager: State<'_, SystemManager>,
    category: String,
    title: String,
    content: String,
    agent_id: Option<String>,
    workspace: Option<String>,
    tags: Option<String>,
) -> Result<MemoryBookmarkRow, String> {
    system_manager.db_bridge.create_memory_bookmark(
        &category,
        &title,
        &content,
        agent_id.as_deref(),
        workspace.as_deref(),
        tags.as_deref(),
    )
}

#[tauri::command]
pub fn myaos_list_memory_bookmarks(
    system_manager: State<'_, SystemManager>,
    category: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<MemoryBookmarkRow>, String> {
    system_manager.db_bridge.list_memory_bookmarks(category.as_deref(), limit.unwrap_or(50))
}

#[tauri::command]
pub fn myaos_delete_memory_bookmark(
    system_manager: State<'_, SystemManager>,
    id: String,
) -> Result<(), String> {
    system_manager.db_bridge.delete_memory_bookmark(&id)
}

#[tauri::command]
pub fn myaos_clone_github_repo(
    system_manager: State<'_, SystemManager>,
    repo_url: String,
    target_parent_dir: String,
    folder_name: Option<String>,
) -> Result<WorkspaceInfo, String> {
    let clean_url = repo_url.trim();
    if clean_url.is_empty() {
        return Err("Repository URL cannot be empty".to_string());
    }

    let default_name = clean_url
        .trim_end_matches(".git")
        .split('/')
        .last()
        .unwrap_or("cloned-repo")
        .to_string();

    let target_name = folder_name.unwrap_or(default_name);
    let target_path = format!("{}/{}", target_parent_dir.trim_end_matches('/'), target_name);

    if std::path::Path::new(&target_path).exists() {
        return Err(format!("Target directory already exists: {}", target_path));
    }

    let output = std::process::Command::new("git")
        .args(["clone", clean_url, &target_path])
        .output()
        .map_err(|e| format!("Failed to execute git clone: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git clone failed: {}", err));
    }

    system_manager.db_bridge.register_workspace(&target_name, &target_name, &target_path, Some(clean_url))
}

#[tauri::command]
pub fn myaos_connect_local_project(
    system_manager: State<'_, SystemManager>,
    path: String,
    custom_name: Option<String>,
) -> Result<WorkspaceInfo, String> {
    let clean_path = path.trim();
    let p = std::path::Path::new(clean_path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Directory does not exist: {}", clean_path));
    }

    let name = custom_name.unwrap_or_else(|| {
        p.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Local Project".to_string())
    });

    let id = name.replace(' ', "-").to_lowercase();
    system_manager.db_bridge.register_workspace(&id, &name, clean_path, None)
}

#[tauri::command]
pub fn myaos_create_new_project(
    system_manager: State<'_, SystemManager>,
    name: String,
    template: String,
    parent_dir: String,
) -> Result<WorkspaceInfo, String> {
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err("Project name cannot be empty".to_string());
    }

    let target_path = format!("{}/{}", parent_dir.trim_end_matches('/'), clean_name);
    if std::path::Path::new(&target_path).exists() {
        return Err(format!("Target path already exists: {}", target_path));
    }

    std::fs::create_dir_all(&target_path)
        .map_err(|e| format!("Failed to create project folder: {}", e))?;

    // Initialize git repository
    let _ = std::process::Command::new("git")
        .args(["init"])
        .current_dir(&target_path)
        .output();

    // Scaffold according to template
    match template.as_str() {
        "vite-react" => {
            let pkg_json = format!(r#"{{
  "name": "{}",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {{
    "dev": "vite",
    "build": "tsc && vite build"
  }},
  "dependencies": {{
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.475.0"
  }}
}}"#, clean_name);
            let _ = std::fs::write(format!("{}/package.json", target_path), pkg_json);
            let _ = std::fs::write(format!("{}/README.md", target_path), format!("# {}\n\nCreated with MyaOS Desktop.", clean_name));
        }
        "nextjs" => {
            let pkg_json = format!(r#"{{
  "name": "{}",
  "version": "0.1.0",
  "private": true,
  "scripts": {{
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }}
}}"#, clean_name);
            let _ = std::fs::write(format!("{}/package.json", target_path), pkg_json);
            let _ = std::fs::write(format!("{}/README.md", target_path), format!("# {}\n\nNext.js Application created with MyaOS Desktop.", clean_name));
        }
        "fastapi" => {
            let main_py = "from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get('/')\ndef root():\n    return {'message': 'MyaOS Service Online'}\n";
            let _ = std::fs::write(format!("{}/main.py", target_path), main_py);
            let _ = std::fs::write(format!("{}/requirements.txt", target_path), "fastapi\nuvicorn\n");
            let _ = std::fs::write(format!("{}/README.md", target_path), format!("# {}\n\nFastAPI Service created with MyaOS Desktop.", clean_name));
        }
        _ => {
            let _ = std::fs::write(format!("{}/README.md", target_path), format!("# {}\n\nCustom workspace created with MyaOS Desktop.", clean_name));
        }
    }

    // Initial commit
    let _ = std::process::Command::new("git")
        .args(["add", "."])
        .current_dir(&target_path)
        .output();
    let _ = std::process::Command::new("git")
        .args(["commit", "-m", "Initial commit from MyaOS"])
        .current_dir(&target_path)
        .output();

    let id = clean_name.replace(' ', "-").to_lowercase();
    system_manager.db_bridge.register_workspace(&id, clean_name, &target_path, None)
}

#[tauri::command]
pub fn myaos_remove_workspace(
    system_manager: State<'_, SystemManager>,
    path: String,
) -> Result<(), String> {
    system_manager.db_bridge.remove_workspace(&path)
}

#[tauri::command]
pub fn myaos_create_agent_identity(
    system_manager: State<'_, SystemManager>,
    id: String,
    display_name: String,
    symbol: Option<String>,
    primary_domain: Option<String>,
    lane: Option<String>,
    capabilities: Vec<String>,
    responsibilities: Vec<String>,
) -> Result<IdentityRow, String> {
    system_manager.db_bridge.create_identity(
        &id,
        &display_name,
        symbol.as_deref(),
        primary_domain.as_deref(),
        lane.as_deref(),
        capabilities,
        responsibilities,
    )
}

#[tauri::command]
pub fn myaos_update_agent_identity(
    system_manager: State<'_, SystemManager>,
    id: String,
    display_name: String,
    symbol: Option<String>,
    primary_domain: Option<String>,
    lane: Option<String>,
    capabilities: Vec<String>,
    responsibilities: Vec<String>,
) -> Result<IdentityRow, String> {
    system_manager.db_bridge.update_identity(
        &id,
        &display_name,
        symbol.as_deref(),
        primary_domain.as_deref(),
        lane.as_deref(),
        capabilities,
        responsibilities,
    )
}

#[tauri::command]
pub fn myaos_list_projects(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<ProjectRow>, String> {
    system_manager.db_bridge.list_projects()
}

#[tauri::command]
pub fn myaos_create_project(
    system_manager: State<'_, SystemManager>,
    name: String,
    description: Option<String>,
    repo: Option<String>,
    target_date: Option<String>,
) -> Result<ProjectRow, String> {
    system_manager.db_bridge.create_project(
        &name,
        description.as_deref(),
        repo.as_deref(),
        target_date.as_deref(),
    )
}

#[tauri::command]
pub fn myaos_list_okrs(
    system_manager: State<'_, SystemManager>,
) -> Result<(Vec<OkrObjectiveRow>, Vec<OkrKeyResultRow>), String> {
    system_manager.db_bridge.list_okrs()
}

#[tauri::command]
pub fn myaos_save_okr_objective(
    system_manager: State<'_, SystemManager>,
    objective: OkrObjectiveRow,
) -> Result<(), String> {
    system_manager.db_bridge.save_okr_objective(&objective)
}

#[tauri::command]
pub fn myaos_delete_okr_objective(
    system_manager: State<'_, SystemManager>,
    id: String,
) -> Result<(), String> {
    system_manager.db_bridge.delete_okr_objective(&id)
}

#[tauri::command]
pub fn myaos_save_okr_key_result(
    system_manager: State<'_, SystemManager>,
    key_result: OkrKeyResultRow,
) -> Result<(), String> {
    system_manager.db_bridge.save_okr_key_result(&key_result)
}

#[tauri::command]
pub fn myaos_delete_okr_key_result(
    system_manager: State<'_, SystemManager>,
    id: String,
) -> Result<(), String> {
    system_manager.db_bridge.delete_okr_key_result(&id)
}

#[tauri::command]
pub fn myaos_update_okr_progress(
    system_manager: State<'_, SystemManager>,
    kr_id: String,
    current_value: f64,
) -> Result<(), String> {
    system_manager.db_bridge.update_okr_progress(&kr_id, current_value)
}

#[tauri::command]
pub fn myaos_get_active_okrs_context(
    system_manager: State<'_, SystemManager>,
) -> Result<String, String> {
    system_manager.db_bridge.get_active_okrs_context()
}

#[tauri::command]
pub fn myaos_list_design_projects(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<DesignProjectRow>, String> {
    system_manager.db_bridge.list_design_projects()
}

#[tauri::command]
pub fn myaos_save_design_project(
    system_manager: State<'_, SystemManager>,
    project: DesignProjectRow,
) -> Result<(), String> {
    system_manager.db_bridge.save_design_project(&project)
}

#[tauri::command]
pub fn myaos_delete_design_project(
    system_manager: State<'_, SystemManager>,
    id: String,
) -> Result<(), String> {
    system_manager.db_bridge.delete_design_project(&id)
}

#[tauri::command]
pub fn myaos_list_project_screen_versions(
    system_manager: State<'_, SystemManager>,
    project_id: String,
) -> Result<Vec<ProjectScreenVersionRow>, String> {
    system_manager.db_bridge.list_project_screen_versions(&project_id)
}

#[tauri::command]
pub fn myaos_save_project_screen_version(
    system_manager: State<'_, SystemManager>,
    version: ProjectScreenVersionRow,
) -> Result<(), String> {
    system_manager.db_bridge.save_project_screen_version(&version)
}

#[tauri::command]
pub fn myaos_delete_project_screen_version(
    system_manager: State<'_, SystemManager>,
    id: String,
) -> Result<(), String> {
    system_manager.db_bridge.delete_project_screen_version(&id)
}

#[tauri::command]
pub fn myaos_get_project_design_philosophy(
    system_manager: State<'_, SystemManager>,
    project_id: String,
) -> Result<Option<ProjectDesignPhilosophyRow>, String> {
    system_manager.db_bridge.get_project_design_philosophy(&project_id)
}

#[tauri::command]
pub fn myaos_save_project_design_philosophy(
    system_manager: State<'_, SystemManager>,
    philosophy: ProjectDesignPhilosophyRow,
) -> Result<(), String> {
    system_manager.db_bridge.save_project_design_philosophy(&philosophy)
}

#[tauri::command]
pub fn myaos_list_project_components(
    system_manager: State<'_, SystemManager>,
    project_id: String,
) -> Result<Vec<ProjectComponentRow>, String> {
    system_manager.db_bridge.list_project_components(&project_id)
}

#[tauri::command]
pub fn myaos_save_project_component(
    system_manager: State<'_, SystemManager>,
    component: ProjectComponentRow,
) -> Result<(), String> {
    system_manager.db_bridge.save_project_component(&component)
}

#[tauri::command]
pub fn myaos_delete_project_component(
    system_manager: State<'_, SystemManager>,
    id: String,
) -> Result<(), String> {
    system_manager.db_bridge.delete_project_component(&id)
}

#[tauri::command]
pub fn myaos_inspect_workspace_ui_structure(
    system_manager: State<'_, SystemManager>,
    project_id: String,
    workspace_path: String,
) -> Result<ProjectUiInspectionResult, String> {
    system_manager.db_bridge.inspect_workspace_ui_structure(&project_id, &workspace_path)
}

#[tauri::command]
pub fn myaos_dispatch_design_update_task(
    system_manager: State<'_, SystemManager>,
    project_id: String,
    screen_name: String,
    version: i64,
    update_spec: String,
    assigned_agent: String,
    branch_name: Option<String>,
) -> Result<TaskRow, String> {
    system_manager.db_bridge.dispatch_design_update_task(
        &project_id,
        &screen_name,
        version,
        &update_spec,
        &assigned_agent,
        branch_name.as_deref(),
    )
}

#[tauri::command]
pub fn myaos_update_task_status(
    system_manager: State<'_, SystemManager>,
    task_id: String,
    status: String,
) -> Result<(), String> {
    system_manager.db_bridge.update_task_status(&task_id, &status)
}

#[tauri::command]
pub fn myaos_run_reality_audit(
    system_manager: State<'_, SystemManager>,
    auto_heal: bool,
) -> Result<RealityAuditResult, String> {
    system_manager.db_bridge.run_reality_audit(auto_heal)
}

#[tauri::command]
pub fn myaos_get_agent_profile_details(
    system_manager: State<'_, SystemManager>,
    agent_id: String,
) -> Result<AgentProfileDetails, String> {
    system_manager.db_bridge.get_agent_profile_details(&agent_id)
}

#[tauri::command]
pub fn myaos_get_secrets(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<SecretRow>, String> {
    system_manager.db_bridge.get_secrets()
}

#[tauri::command]
pub fn myaos_set_secret(
    system_manager: State<'_, SystemManager>,
    key: String,
    value: String,
    description: Option<String>,
) -> Result<(), String> {
    system_manager.db_bridge.set_secret(&key, &value, description.as_deref())
}

#[tauri::command]
pub fn myaos_delete_secret(
    system_manager: State<'_, SystemManager>,
    key: String,
) -> Result<(), String> {
    system_manager.db_bridge.delete_secret(&key)
}

#[tauri::command]
pub async fn myaos_test_gemini_key(api_key: String) -> Result<bool, String> {
    let endpoint = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={}",
        api_key.trim()
    );
    let payload = serde_json::json!({
        "contents": [{
            "role": "user",
            "parts": [{ "text": "ping" }]
        }]
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Client build error: {}", e))?;

    let res = client.post(&endpoint).json(&payload).send().await
        .map_err(|e| format!("Network error: {}", e))?;

    if res.status().is_success() {
        Ok(true)
    } else {
        let err_text = res.text().await.unwrap_or_default();
        Err(format!("Gemini API responded with error: {}", err_text))
    }
}

#[tauri::command]
pub fn myaos_get_users(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<UserRow>, String> {
    system_manager.db_bridge.get_users()
}

#[tauri::command]
pub fn myaos_save_user(
    system_manager: State<'_, SystemManager>,
    user: UserRow,
) -> Result<(), String> {
    system_manager.db_bridge.save_user(&user)
}

#[tauri::command]
pub fn myaos_delete_user(
    system_manager: State<'_, SystemManager>,
    id: String,
) -> Result<(), String> {
    system_manager.db_bridge.delete_user(&id)
}

#[tauri::command]
pub fn myaos_get_integrations(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<IntegrationConfigRow>, String> {
    system_manager.db_bridge.get_integrations()
}

#[tauri::command]
pub fn myaos_save_integration(
    system_manager: State<'_, SystemManager>,
    service: String,
    config_json: String,
    is_enabled: bool,
    require_approval: bool,
) -> Result<(), String> {
    system_manager.db_bridge.save_integration(&service, &config_json, is_enabled, require_approval)
}

#[tauri::command]
pub fn myaos_get_pending_approvals(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<PendingApprovalRow>, String> {
    system_manager.db_bridge.get_pending_approvals()
}

#[tauri::command]
pub fn myaos_create_pending_approval(
    system_manager: State<'_, SystemManager>,
    item: PendingApprovalRow,
) -> Result<(), String> {
    system_manager.db_bridge.create_pending_approval(&item)
}

#[tauri::command]
pub async fn myaos_process_approval(
    system_manager: State<'_, SystemManager>,
    id: String,
    action: String,
    edited_content: Option<String>,
    approver: String,
) -> Result<(), String> {
    if action == "approve" {
        if let Ok(approvals) = system_manager.db_bridge.get_pending_approvals() {
            if let Some(item) = approvals.iter().find(|a| a.id == id) {
                let content_to_send = edited_content.as_deref().unwrap_or(&item.content);
                if item.item_type == "slack_message" {
                    if let Ok(Some(webhook)) = system_manager.db_bridge.get_secret("slack_webhook_url") {
                        if !webhook.trim().is_empty() {
                            let _ = myaos_test_slack_webhook(webhook, content_to_send.to_string()).await;
                        }
                    }
                }
            }
        }
    }

    system_manager.db_bridge.process_approval(&id, &action, edited_content.as_deref(), &approver)
}

#[tauri::command]
pub async fn myaos_test_slack_webhook(webhook_url: String, message: String) -> Result<bool, String> {
    if webhook_url.trim().is_empty() {
        return Err("Slack webhook URL is empty".to_string());
    }

    let payload = serde_json::json!({
        "text": message
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Client build error: {}", e))?;

    let res = client.post(&webhook_url).json(&payload).send().await
        .map_err(|e| format!("Slack connection error: {}", e))?;

    if res.status().is_success() {
        Ok(true)
    } else {
        let err_text = res.text().await.unwrap_or_default();
        Err(format!("Slack responded with error: {}", err_text))
    }
}

#[tauri::command]
pub fn myaos_read_sample_emails() -> Result<Vec<EmailPreviewItem>, String> {
    Ok(vec![
        EmailPreviewItem {
            id: "msg_1".to_string(),
            from: "support@myavana.com".to_string(),
            subject: "Customer Feedback: Mobile Chatbot latency on iOS".to_string(),
            snippet: "Users reported that chatbot widget response audio streaming took 3.2s on cellular...".to_string(),
            date: "Today, 4:12 PM".to_string(),
            unread: true,
        },
        EmailPreviewItem {
            id: "msg_2".to_string(),
            from: "devops-alerts@creativesites.com".to_string(),
            subject: "DeployFleet Staging: Build 492 verified and passed".to_string(),
            snippet: "Regression suite PASSED with 0 exit code. Ready for release sign-off by Winston Zulu.".to_string(),
            date: "Today, 2:45 PM".to_string(),
            unread: true,
        },
        EmailPreviewItem {
            id: "msg_3".to_string(),
            from: "partners@myavana.com".to_string(),
            subject: "Q3 Deliverable Milestone & Timeline Alignment".to_string(),
            snippet: "Could you send over the updated status report for the multi-repo autonomous team architecture?".to_string(),
            date: "Yesterday".to_string(),
            unread: false,
        },
    ])
}

#[tauri::command]
pub fn myaos_get_autopilot_queue(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<AutopilotTaskRow>, String> {
    system_manager.db_bridge.get_autopilot_queue()
}

#[tauri::command]
pub fn myaos_add_autopilot_task(
    system_manager: State<'_, SystemManager>,
    task: AutopilotTaskRow,
) -> Result<(), String> {
    system_manager.db_bridge.add_autopilot_task(&task)
}

#[tauri::command]
pub fn myaos_add_autopilot_batch(
    system_manager: State<'_, SystemManager>,
    batch_name: String,
    tasks: Vec<AutopilotTaskRow>,
) -> Result<usize, String> {
    let count = tasks.len();
    for task in tasks {
        let mut t = task;
        if t.batch_id.is_none() {
            t.batch_id = Some(batch_name.clone());
        }
        system_manager.db_bridge.add_autopilot_task(&t)?;
    }
    Ok(count)
}

#[tauri::command]
pub fn myaos_update_autopilot_task_status(
    system_manager: State<'_, SystemManager>,
    id: String,
    status: String,
    log: Option<String>,
    tokens: Option<i64>,
    cost: Option<f64>,
    reset_at: Option<String>,
) -> Result<(), String> {
    system_manager.db_bridge.update_autopilot_task_status(
        &id,
        &status,
        log.as_deref(),
        tokens,
        cost,
        reset_at.as_deref(),
    )
}

#[tauri::command]
pub fn myaos_delete_autopilot_task(
    system_manager: State<'_, SystemManager>,
    id: String,
) -> Result<(), String> {
    system_manager.db_bridge.delete_autopilot_task(&id)
}

#[tauri::command]
pub fn myaos_clear_completed_autopilot_tasks(
    system_manager: State<'_, SystemManager>,
) -> Result<(), String> {
    system_manager.db_bridge.clear_completed_autopilot_tasks()
}

#[tauri::command]
pub fn myaos_get_autopilot_history(
    system_manager: State<'_, SystemManager>,
) -> Result<Vec<AutopilotHistoryRow>, String> {
    system_manager.db_bridge.get_autopilot_history()
}

#[tauri::command]
pub fn myaos_simulate_rate_limit_and_resume(
    system_manager: State<'_, SystemManager>,
    id: String,
    reset_minutes: i64,
) -> Result<(), String> {
    let reset_target = (chrono::Utc::now() + chrono::Duration::minutes(reset_minutes)).to_rfc3339();
    system_manager.db_bridge.update_autopilot_task_status(
        &id,
        "rate_limited",
        Some(&format!("Rate limit threshold detected. Auto-resuming in {} minutes.", reset_minutes)),
        None,
        None,
        Some(&reset_target),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_gemini_orchestrator_call() {
        let contents = serde_json::json!([
            {
                "role": "user",
                "parts": [{ "text": "Ping MyaOS Orchestrator. Reply with 'PONG'." }]
            }
        ]);
        let res = myaos_call_gemini_orchestrator(contents).await;
        assert!(res.is_ok(), "Gemini orchestrator call failed: {:?}", res.err());
        let body = res.unwrap();
        assert!(body.contains("candidates"), "Expected candidates in response: {}", body);
    }

    #[test]
    fn test_git_diff_retrieval() {
        let cwd = "/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team".to_string();
        let diff_res = myaos_get_git_diff(cwd);
        assert!(diff_res.is_ok(), "Git diff failed: {:?}", diff_res.err());
        let diff = diff_res.unwrap();
        assert!(!diff.branch.is_empty(), "Branch name should not be empty");
    }

    #[test]
    fn test_workspace_and_identity_management() {
        let db_bridge = crate::system::db::DbBridge::new("/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/data/myaos.db");
        
        // Test workspace registration
        let ws = db_bridge.register_workspace(
            "test_proj",
            "Test Project",
            "/Users/winstonzulu/Downloads",
            None,
        );
        assert!(ws.is_ok(), "Failed to register workspace: {:?}", ws.err());
        let w = ws.unwrap();
        assert_eq!(w.id, "test_proj");

        // Test workspace removal
        let rem = db_bridge.remove_workspace("/Users/winstonzulu/Downloads");
        assert!(rem.is_ok(), "Failed to remove workspace: {:?}", rem.err());

        // Test identity create and update
        let ident = db_bridge.create_identity(
            "test_spec",
            "Specialist Test",
            Some("🧪"),
            Some("Quality Automation"),
            Some("engineering"),
            vec!["testing".to_string(), "rust".to_string()],
            vec!["Verify substrate integrity".to_string()],
        );
        assert!(ident.is_ok(), "Failed to create identity: {:?}", ident.err());
        let i = ident.unwrap();
        assert_eq!(i.id, "test_spec");
        assert_eq!(i.display_name, "Specialist Test");
    }

    #[test]
    fn test_secrets_and_users_and_approvals() {
        let db_bridge = crate::system::db::DbBridge::new("/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/data/myaos.db");

        // 1. Test secret set, get, delete
        let set_res = db_bridge.set_secret("test_api_key", "secret12345", Some("Test secret"));
        assert!(set_res.is_ok(), "Failed to set secret: {:?}", set_res.err());

        let get_res = db_bridge.get_secret("test_api_key");
        assert!(get_res.is_ok());
        assert_eq!(get_res.unwrap(), Some("secret12345".to_string()));

        let del_res = db_bridge.delete_secret("test_api_key");
        assert!(del_res.is_ok());

        // 2. Test user retrieval
        let users = db_bridge.get_users();
        assert!(users.is_ok());
        let u_list = users.unwrap();
        assert!(!u_list.is_empty(), "Should have default user Winston Zulu");
        assert!(u_list.iter().any(|u| u.name.contains("Winston")));

        // 3. Test pending approvals
        let approvals = db_bridge.get_pending_approvals();
        assert!(approvals.is_ok());
    }

    #[test]
    fn test_autopilot_queue_and_history() {
        let db_bridge = crate::system::db::DbBridge::new("/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/data/myaos.db");

        // Test queue query
        let queue = db_bridge.get_autopilot_queue();
        assert!(queue.is_ok(), "Failed to get queue: {:?}", queue.err());
        let q = queue.unwrap();
        assert!(!q.is_empty(), "Queue should have seeded items");

        // Test history query
        let hist = db_bridge.get_autopilot_history();
        assert!(hist.is_ok(), "Failed to get history: {:?}", hist.err());
    }

    #[test]
    fn test_okrs_and_design_projects() {
        let db_bridge = crate::system::db::DbBridge::new("/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/data/myaos.db");

        // 1. Test OKR objective save & list
        let test_obj = crate::system::db::OkrObjectiveRow {
            id: "OBJ_TEST_UNIT".to_string(),
            title: "Test Objective for Autonomous Validation".to_string(),
            description: Some("Ensuring OKRs are deeply integrated into agent telemetry".to_string()),
            owner_id: Some("astra".to_string()),
            quarter: "Q3-2026".to_string(),
            progress_percent: 50,
            status: "on_track".to_string(),
            created_at: "".to_string(),
            updated_at: "".to_string(),
        };
        let save_obj = db_bridge.save_okr_objective(&test_obj);
        assert!(save_obj.is_ok(), "Failed to save OKR objective: {:?}", save_obj.err());

        // 2. Test OKR key result save & progress update
        let test_kr = crate::system::db::OkrKeyResultRow {
            id: "KR_TEST_UNIT_1".to_string(),
            objective_id: "OBJ_TEST_UNIT".to_string(),
            title: "100% telemetry verification on test endpoints".to_string(),
            metric_type: "percentage".to_string(),
            current_value: 75.0,
            target_value: 100.0,
            unit: Some("%".to_string()),
            progress_percent: 75,
            telemetry_query: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        };
        let save_kr = db_bridge.save_okr_key_result(&test_kr);
        assert!(save_kr.is_ok(), "Failed to save OKR key result: {:?}", save_kr.err());

        // Test update progress
        let update_p = db_bridge.update_okr_progress("KR_TEST_UNIT_1", 90.0);
        assert!(update_p.is_ok(), "Failed to update OKR progress: {:?}", update_p.err());

        // Test active OKRs context generation
        let ctx = db_bridge.get_active_okrs_context();
        assert!(ctx.is_ok(), "Failed to generate active OKRs context: {:?}", ctx.err());
        let c = ctx.unwrap();
        assert!(c.contains("STRATEGIC OKRs"), "Context should contain header");
        assert!(c.contains("OBJ_TEST_UNIT"), "Context should contain test objective");

        // Clean up test KR and Obj
        let _ = db_bridge.delete_okr_key_result("KR_TEST_UNIT_1");
        let _ = db_bridge.delete_okr_objective("OBJ_TEST_UNIT");

        // 3. Test Design Project save, list, delete
        let test_proj = crate::system::db::DesignProjectRow {
            id: "design_test_unit".to_string(),
            title: "Unit Test Landing Page".to_string(),
            design_type: "landing_page".to_string(),
            viewport: "desktop".to_string(),
            html_content: "<html><body><h1>Hello Test</h1></body></html>".to_string(),
            prompt: "Create a simple test landing page".to_string(),
            created_at: "".to_string(),
            updated_at: "".to_string(),
        };
        let save_dp = db_bridge.save_design_project(&test_proj);
        assert!(save_dp.is_ok(), "Failed to save design project: {:?}", save_dp.err());

        let list_dp = db_bridge.list_design_projects();
        assert!(list_dp.is_ok(), "Failed to list design projects: {:?}", list_dp.err());
        let projects = list_dp.unwrap();
        assert!(projects.iter().any(|p| p.id == "design_test_unit"));

        let del_dp = db_bridge.delete_design_project("design_test_unit");
        assert!(del_dp.is_ok(), "Failed to delete design project: {:?}", del_dp.err());

        // 4. Test screen versioning & design philosophy
        let test_version = crate::system::db::ProjectScreenVersionRow {
            id: "ver_test_1".to_string(),
            project_id: "PROJ_DEPLOYFLEET".to_string(),
            screen_name: "Fleet Intelligence Overview".to_string(),
            flow_name: Some("Dispatch & Tracking Flow".to_string()),
            version: 1,
            viewport: "desktop".to_string(),
            html_content: "<html><body>Fleet Overview v1</body></html>".to_string(),
            prompt: "Reconstruct overview screen from actual project routes".to_string(),
            change_summary: Some("Initial faithful reconstruction".to_string()),
            is_approved: 0,
            created_at: "".to_string(),
        };
        let save_ver = db_bridge.save_project_screen_version(&test_version);
        assert!(save_ver.is_ok(), "Failed to save screen version: {:?}", save_ver.err());

        let list_ver = db_bridge.list_project_screen_versions("PROJ_DEPLOYFLEET");
        assert!(list_ver.is_ok());
        assert!(list_ver.unwrap().iter().any(|v| v.id == "ver_test_1"));

        // Clean up test version
        let _ = db_bridge.delete_project_screen_version("ver_test_1");

        // 5. Test design philosophy
        let test_phil = crate::system::db::ProjectDesignPhilosophyRow {
            id: "phil_test".to_string(),
            project_id: "PROJ_DEPLOYFLEET".to_string(),
            brand_name: "DeployFleet Commercial".to_string(),
            heading_font: "Plus Jakarta Sans".to_string(),
            body_font: "Inter".to_string(),
            code_font: "JetBrains Mono".to_string(),
            primary_color: "#0a1128".to_string(),
            secondary_color: "#00d2ff".to_string(),
            accent_color: "#0b93d3".to_string(),
            surface_color: "#f8fafc".to_string(),
            border_radius: "16px".to_string(),
            tokens_json: Some(r##"{"--df-navy":"#0a1128"}"##.to_string()),
            philosophy_markdown: Some("Clean, high-contrast, data-dense logistics cockpits.".to_string()),
            updated_at: "".to_string(),
        };
        let save_phil = db_bridge.save_project_design_philosophy(&test_phil);
        assert!(save_phil.is_ok(), "Failed to save design philosophy: {:?}", save_phil.err());

        let get_phil = db_bridge.get_project_design_philosophy("PROJ_DEPLOYFLEET");
        assert!(get_phil.is_ok());
        assert_eq!(get_phil.unwrap().unwrap().brand_name, "DeployFleet Commercial");

        // 6. Test dispatch task
        let dispatch_res = db_bridge.dispatch_design_update_task(
            "PROJ_DEPLOYFLEET",
            "Fleet Intelligence Overview",
            1,
            "Integrate responsive metric widgets and real telemetry hooks",
            "astra",
            Some("design/test-fleet-overview"),
        );
        assert!(dispatch_res.is_ok(), "Failed to dispatch design task: {:?}", dispatch_res.err());
        let created_task = dispatch_res.unwrap();
        assert!(created_task.title.contains("Fleet Intelligence Overview"));
    }
}
