#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! MyaOS Desktop v2. The Rust side owns the window, starts the runtime and,
//! in later phases, user terminals and OS integration. It reads no app data
//! itself: the UI gets everything from the runtime's local API.

mod sidecar;

use sidecar::{RuntimeConnection, Sidecar};
use tauri::{Manager, RunEvent};

#[tauri::command]
async fn runtime_connection(app: tauri::AppHandle) -> Result<RuntimeConnection, String> {
    // Starting the runtime can take a few seconds; keep it off the UI thread.
    tauri::async_runtime::spawn_blocking(move || sidecar::connect(&app.state::<Sidecar>()))
        .await
        .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .manage(Sidecar::default())
        .invoke_handler(tauri::generate_handler![runtime_connection])
        .build(tauri::generate_context!())
        .expect("error while building MyaOS")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                sidecar::stop(&app.state::<Sidecar>());
            }
        });
}
