use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtySessionInfo {
    pub session_id: String,
    pub runtime_id: String,
    pub agent_id: String,
    pub project_id: Option<String>,
    pub task_id: Option<String>,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    pub is_alive: bool,
    pub created_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PtyOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PtyExitPayload {
    pub session_id: String,
    pub exit_code: Option<u32>,
}

struct InnerSession {
    pub info: PtySessionInfo,
    pub writer: Box<dyn Write + Send>,
    pub pty_pair: PtyPair,
}

#[derive(Clone, Default)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, InnerSession>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn(
        &self,
        app_handle: AppHandle,
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
        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let mut cmd = CommandBuilder::new(&command);
        cmd.args(&args);
        cmd.cwd(&cwd);

        if let Some(env_map) = env {
            for (k, v) in env_map {
                cmd.env(k, v);
            }
        }

        let _child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command '{}': {}", command, e))?;

        let reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

        let info = PtySessionInfo {
            session_id: session_id.clone(),
            runtime_id,
            agent_id,
            project_id,
            task_id,
            command,
            args,
            cwd,
            cols,
            rows,
            is_alive: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let inner = InnerSession {
            info: info.clone(),
            writer,
            pty_pair,
        };

        self.sessions.lock().insert(session_id.clone(), inner);

        // Spawn stdout/stderr reader thread
        let session_id_clone = session_id.clone();
        let sessions_map = self.sessions.clone();

        thread::spawn(move || {
            let mut reader = reader;
            let mut buffer = [0u8; 4096];

            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break, // EOF / Process exited
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                        let _ = app_handle.emit(
                            "pty_output",
                            PtyOutputPayload {
                                session_id: session_id_clone.clone(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }

            // Mark session as dead
            if let Some(s) = sessions_map.lock().get_mut(&session_id_clone) {
                s.info.is_alive = false;
            }

            let _ = app_handle.emit(
                "pty_exit",
                PtyExitPayload {
                    session_id: session_id_clone,
                    exit_code: Some(0),
                },
            );
        });

        Ok(info)
    }

    pub fn write(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let mut lock = self.sessions.lock();
        if let Some(session) = lock.get_mut(session_id) {
            session
                .writer
                .write_all(data)
                .map_err(|e| format!("Failed to write to PTY: {}", e))?;
            session
                .writer
                .flush()
                .map_err(|e| format!("Failed to flush PTY: {}", e))?;
            Ok(())
        } else {
            Err(format!("Session '{}' not found", session_id))
        }
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let mut lock = self.sessions.lock();
        if let Some(session) = lock.get_mut(session_id) {
            session
                .pty_pair
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Failed to resize PTY: {}", e))?;
            session.info.cols = cols;
            session.info.rows = rows;
            Ok(())
        } else {
            Err(format!("Session '{}' not found", session_id))
        }
    }

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let mut lock = self.sessions.lock();
        if let Some(mut session) = lock.remove(session_id) {
            session.info.is_alive = false;
            Ok(())
        } else {
            Err(format!("Session '{}' not found", session_id))
        }
    }

    pub fn list(&self) -> Vec<PtySessionInfo> {
        let lock = self.sessions.lock();
        lock.values().map(|s| s.info.clone()).collect()
    }
}
