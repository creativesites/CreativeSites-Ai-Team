use std::collections::HashMap;
use tauri::{AppHandle, State};
use crate::pty::{PtyManager, PtySessionInfo};
use crate::runtime::{get_available_runtime_adapters, RuntimeAdapterInfo};
use crate::system::db::{IdentityRow, MyaosDbSummary};
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
