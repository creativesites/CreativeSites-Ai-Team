mod commands;
mod pty;
mod runtime;
mod system;

use commands::*;
use pty::PtyManager;
use std::path::PathBuf;
use system::SystemManager;

fn main() {
    env_logger::init();

    let exe_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let root_db = exe_dir.join("../data/myaos.db");
    let fallback_db = exe_dir.join("data/myaos.db");
    let db_path = if root_db.exists() {
        root_db.to_string_lossy().to_string()
    } else {
        fallback_db.to_string_lossy().to_string()
    };

    tauri::Builder::default()
        .manage(PtyManager::new())
        .manage(SystemManager::new(&db_path))
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            pty_list,
            runtime_list_adapters,
            myaos_get_summary,
            myaos_get_identities,
            system_enable_sleep_prevention,
            system_disable_sleep_prevention,
            system_is_sleep_prevented
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
