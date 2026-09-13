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

fn get_login_shell_path() -> String {
    use std::process::Command;
    if cfg!(target_os = "windows") {
        return std::env::var("PATH").unwrap_or_default();
    }
    
    // Attempt to run zsh as an interactive login shell to grab the complete PATH
    let output = Command::new("zsh")
        .args(["-il", "-c", "echo $PATH"])
        .output();
        
    let mut path_str = if let Ok(out) = output {
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    } else {
        String::new()
    };

    if path_str.is_empty() {
        let output_bash = Command::new("bash")
            .args(["-l", "-c", "echo $PATH"])
            .output();
        if let Ok(out) = output_bash {
            path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
    }

    if path_str.is_empty() {
        path_str = std::env::var("PATH").unwrap_or_default();
    }

    // Ensure critical user and package manager paths are present on macOS
    if let Ok(home) = std::env::var("HOME") {
        let extra_dirs = [
            format!("{}/.local/bin", home),
            format!("{}/.nvm/versions/node/v24.15.0/bin", home),
            format!("{}/.cargo/bin", home),
            "/opt/homebrew/bin".to_string(),
            "/opt/homebrew/sbin".to_string(),
            "/usr/local/bin".to_string(),
        ];
        for dir in extra_dirs {
            if !path_str.contains(&dir) && std::path::Path::new(&dir).exists() {
                path_str = format!("{}:{}", dir, path_str);
            }
        }
    }

    path_str
}

fn resolve_command_path(command: &str, login_path: &str) -> String {
    use std::path::Path;
    
    // If the command is already an absolute path and exists, use it directly
    if Path::new(command).is_absolute() && Path::new(command).exists() {
        return command.to_string();
    }

    // Direct fast-path check for well-known agent CLIs on macOS
    if let Ok(home) = std::env::var("HOME") {
        match command {
            "claude" => {
                let local_claude = Path::new(&home).join(".local/bin/claude");
                if local_claude.exists() {
                    return local_claude.to_string_lossy().to_string();
                }
            }
            "gemini" => {
                let nvm_gemini = Path::new(&home).join(".nvm/versions/node/v24.15.0/bin/gemini");
                if nvm_gemini.exists() {
                    return nvm_gemini.to_string_lossy().to_string();
                }
            }
            "antigravity" | "agy" => {
                let local_antigravity = Path::new(&home).join(".local/bin/antigravity");
                if local_antigravity.exists() {
                    return local_antigravity.to_string_lossy().to_string();
                }
                let local_agy = Path::new(&home).join(".local/bin/agy");
                if local_agy.exists() {
                    return local_agy.to_string_lossy().to_string();
                }
                let nvm_gemini = Path::new(&home).join(".nvm/versions/node/v24.15.0/bin/gemini");
                if nvm_gemini.exists() {
                    return nvm_gemini.to_string_lossy().to_string();
                }
            }
            "zsh" => {
                if Path::new("/bin/zsh").exists() {
                    return "/bin/zsh".to_string();
                }
            }
            _ => {}
        }
    }
    
    // Search in the login path directories
    for dir in login_path.split(':') {
        if dir.is_empty() {
            continue;
        }
        let full_path = Path::new(dir).join(command);
        if full_path.exists() && full_path.is_file() {
            return full_path.to_string_lossy().to_string();
        }
    }
    
    // Fallback to original command name
    command.to_string()
}

#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, InnerSession>>>,
    workspace_root: String,
}

impl PtyManager {
    pub fn new(workspace_root: String) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            workspace_root,
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

        let resolved_cwd = if cwd == "." || cwd.is_empty() {
            self.workspace_root.clone()
        } else {
            cwd
        };

        let login_path = get_login_shell_path();
        let resolved_command = resolve_command_path(&command, &login_path);

        println!("[PTY] Spawning session '{}' with command '{}' ({:?}) in '{}'", session_id, resolved_command, args, resolved_cwd);

        let mut cmd = CommandBuilder::new(&resolved_command);
        cmd.args(&args);
        cmd.cwd(&resolved_cwd);

        // Inject full terminal and user environment so interactive CLIs (Claude Code, Gemini) work
        cmd.env("PATH", &login_path);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("LANG", "en_US.UTF-8");
        cmd.env("LC_ALL", "en_US.UTF-8");
        cmd.env("FORCE_COLOR", "1");

        if let Ok(home) = std::env::var("HOME") {
            cmd.env("HOME", &home);
        }
        if let Ok(user) = std::env::var("USER") {
            cmd.env("USER", &user);
        }
        if let Ok(shell) = std::env::var("SHELL") {
            cmd.env("SHELL", &shell);
        } else {
            cmd.env("SHELL", "/bin/zsh");
        }

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
            cwd: resolved_cwd,
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
