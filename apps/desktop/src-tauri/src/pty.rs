use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSessionInfo {
    pub session_id: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    pub is_alive: bool,
}

#[allow(dead_code)]
pub type PtySessionInfo = TerminalSessionInfo;

#[derive(Clone, Serialize, Deserialize)]
pub struct TerminalOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[allow(dead_code)]
pub type PtyOutputPayload = TerminalOutputPayload;

#[derive(Clone, Serialize, Deserialize)]
pub struct TerminalExitPayload {
    pub session_id: String,
    pub exit_code: Option<u32>,
}

#[allow(dead_code)]
pub type PtyExitPayload = TerminalExitPayload;

struct InnerSession {
    pub info: TerminalSessionInfo,
    pub writer: Box<dyn Write + Send>,
    pub pty_pair: PtyPair,
}

/// Discovers the login shell PATH by executing an interactive login shell.
/// Ensures standard directories on macOS/Linux are present without hard-coding
/// user-specific paths.
fn get_login_shell_path() -> String {
    if cfg!(target_os = "windows") {
        return std::env::var("PATH").unwrap_or_default();
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if Path::new("/bin/zsh").exists() {
            "/bin/zsh".to_string()
        } else {
            "/bin/bash".to_string()
        }
    });

    let output = std::process::Command::new(&shell)
        .args(["-lc", "echo $PATH"])
        .output();

    let mut path_str = if let Ok(out) = output {
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    } else {
        String::new()
    };

    if path_str.is_empty() {
        if let Ok(out) = std::process::Command::new("/bin/bash").args(["-l", "-c", "echo $PATH"]).output() {
            path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
    }

    if path_str.is_empty() {
        path_str = std::env::var("PATH").unwrap_or_default();
    }

    let mut extra_dirs = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        extra_dirs.push(format!("{}/.local/bin", home));
        extra_dirs.push(format!("{}/.cargo/bin", home));

        // Scan dynamically for installed Node versions under NVM if present
        let nvm_versions_dir = Path::new(&home).join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(nvm_versions_dir) {
            for entry in entries.flatten() {
                let bin_dir = entry.path().join("bin");
                if bin_dir.exists() {
                    extra_dirs.push(bin_dir.to_string_lossy().to_string());
                }
            }
        }
    }

    extra_dirs.push("/opt/homebrew/bin".to_string());
    extra_dirs.push("/opt/homebrew/sbin".to_string());
    extra_dirs.push("/usr/local/bin".to_string());
    extra_dirs.push("/usr/bin".to_string());
    extra_dirs.push("/bin".to_string());
    extra_dirs.push("/usr/sbin".to_string());
    extra_dirs.push("/sbin".to_string());

    for dir in extra_dirs {
        if !path_str.contains(&dir) && Path::new(&dir).exists() {
            path_str = format!("{}:{}", dir, path_str);
        }
    }

    path_str
}

fn resolve_command_path(command: &str, login_path: &str) -> String {
    if Path::new(command).is_absolute() && Path::new(command).exists() {
        return command.to_string();
    }

    if let Ok(home) = std::env::var("HOME") {
        let local_bin = Path::new(&home).join(".local/bin").join(command);
        if local_bin.exists() {
            return local_bin.to_string_lossy().to_string();
        }
        let cargo_bin = Path::new(&home).join(".cargo/bin").join(command);
        if cargo_bin.exists() {
            return cargo_bin.to_string_lossy().to_string();
        }
    }

    for dir in login_path.split(':') {
        if dir.is_empty() {
            continue;
        }
        let full_path = Path::new(dir).join(command);
        if full_path.exists() && full_path.is_file() {
            return full_path.to_string_lossy().to_string();
        }
    }

    command.to_string()
}

fn detect_login_shell() -> (String, Vec<String>) {
    if cfg!(target_os = "windows") {
        ("powershell.exe".to_string(), vec![])
    } else {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| {
            if Path::new("/bin/zsh").exists() {
                "/bin/zsh".to_string()
            } else {
                "/bin/bash".to_string()
            }
        });
        (shell, vec!["-l".to_string()])
    }
}

fn resolve_cwd(requested_cwd: Option<String>) -> String {
    if let Some(cwd) = requested_cwd {
        let trimmed = cwd.trim();
        if !trimmed.is_empty() && trimmed != "." {
            let p = Path::new(trimmed);
            if p.exists() {
                if let Ok(canon) = std::fs::canonicalize(p) {
                    return canon.to_string_lossy().to_string();
                }
                return trimmed.to_string();
            }
        }
    }

    if let Ok(current) = std::env::current_dir() {
        return current.to_string_lossy().to_string();
    }
    if let Ok(home) = std::env::var("HOME") {
        return home;
    }
    "/".to_string()
}

#[derive(Clone, Default)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, InnerSession>>>,
}

impl TerminalManager {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn(
        &self,
        app_handle: AppHandle,
        session_id: String,
        command: String,
        args: Vec<String>,
        cwd: Option<String>,
        cols: u16,
        rows: u16,
        env: Option<HashMap<String, String>>,
    ) -> Result<TerminalSessionInfo, String> {
        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let resolved_cwd = resolve_cwd(cwd);
        let login_path = get_login_shell_path();
        let resolved_command = resolve_command_path(&command, &login_path);

        let mut cmd = CommandBuilder::new(&resolved_command);
        cmd.args(&args);
        cmd.cwd(&resolved_cwd);

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
            .map_err(|e| format!("Failed to spawn command '{}': {}", resolved_command, e))?;

        let reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

        let info = TerminalSessionInfo {
            session_id: session_id.clone(),
            command: resolved_command,
            args,
            cwd: resolved_cwd,
            cols,
            rows,
            is_alive: true,
        };

        let inner = InnerSession {
            info: info.clone(),
            writer,
            pty_pair,
        };

        self.sessions
            .lock()
            .map_err(|_| "PTY session lock poisoned".to_string())?
            .insert(session_id.clone(), inner);

        // Spawn stdout/stderr reader thread
        let app_handle_clone = app_handle.clone();
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
                        let _ = app_handle_clone.emit(
                            "pty_output",
                            TerminalOutputPayload {
                                session_id: session_id_clone.clone(),
                                data: data.clone(),
                            },
                        );
                        let _ = app_handle_clone.emit(
                            "terminal_output",
                            TerminalOutputPayload {
                                session_id: session_id_clone.clone(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }

            if let Ok(mut lock) = sessions_map.lock() {
                if let Some(s) = lock.get_mut(&session_id_clone) {
                    s.info.is_alive = false;
                }
            }

            let _ = app_handle_clone.emit(
                "pty_exit",
                TerminalExitPayload {
                    session_id: session_id_clone.clone(),
                    exit_code: Some(0),
                },
            );
            let _ = app_handle_clone.emit(
                "terminal_exit",
                TerminalExitPayload {
                    session_id: session_id_clone,
                    exit_code: Some(0),
                },
            );
        });

        Ok(info)
    }

    pub fn write(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let mut lock = self
            .sessions
            .lock()
            .map_err(|_| "PTY session lock poisoned".to_string())?;
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
        let mut lock = self
            .sessions
            .lock()
            .map_err(|_| "PTY session lock poisoned".to_string())?;
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
        let mut lock = self
            .sessions
            .lock()
            .map_err(|_| "PTY session lock poisoned".to_string())?;
        if let Some(mut session) = lock.remove(session_id) {
            session.info.is_alive = false;
            Ok(())
        } else {
            Err(format!("Session '{}' not found", session_id))
        }
    }

    pub fn list(&self) -> Vec<TerminalSessionInfo> {
        if let Ok(lock) = self.sessions.lock() {
            lock.values().map(|s| s.info.clone()).collect()
        } else {
            Vec::new()
        }
    }
}

// ---- Tauri command handlers ----

#[tauri::command]
pub fn terminal_spawn(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<TerminalSessionInfo, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let session_id = format!("term_{}", now);
    let (shell_cmd, shell_args) = detect_login_shell();
    manager.spawn(
        app,
        session_id,
        shell_cmd,
        shell_args,
        cwd,
        cols.unwrap_or(120),
        rows.unwrap_or(34),
        None,
    )
}

#[tauri::command]
pub fn terminal_write(
    manager: State<'_, TerminalManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    manager.write(&session_id, data.as_bytes())
}

#[tauri::command]
pub fn terminal_resize(
    manager: State<'_, TerminalManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    manager.resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn terminal_kill(
    manager: State<'_, TerminalManager>,
    session_id: String,
) -> Result<(), String> {
    manager.kill(&session_id)
}

#[tauri::command]
pub fn terminal_list(
    manager: State<'_, TerminalManager>,
) -> Result<Vec<TerminalSessionInfo>, String> {
    Ok(manager.list())
}

// Aliases for v1 compatibility
#[tauri::command]
pub fn pty_spawn_shell(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    cwd: Option<String>,
) -> Result<TerminalSessionInfo, String> {
    terminal_spawn(app, manager, cwd, None, None)
}

#[tauri::command]
pub fn pty_write(
    manager: State<'_, TerminalManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    manager.write(&session_id, data.as_bytes())
}

#[tauri::command]
pub fn pty_resize(
    manager: State<'_, TerminalManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    manager.resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn pty_kill(
    manager: State<'_, TerminalManager>,
    session_id: String,
) -> Result<(), String> {
    manager.kill(&session_id)
}

#[tauri::command]
pub fn pty_list(
    manager: State<'_, TerminalManager>,
) -> Result<Vec<TerminalSessionInfo>, String> {
    Ok(manager.list())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_login_shell_path_discovery() {
        let path = get_login_shell_path();
        assert!(!path.is_empty(), "Login shell PATH must not be empty");
        assert!(path.contains("/bin") || path.contains("usr"));
    }

    #[test]
    fn test_detect_login_shell() {
        let (shell, args) = detect_login_shell();
        assert!(!shell.is_empty(), "Shell command must not be empty");
        if !cfg!(target_os = "windows") {
            assert_eq!(args, vec!["-l".to_string()]);
        }
    }

    #[test]
    fn test_resolve_cwd() {
        let cwd = resolve_cwd(None);
        assert!(!cwd.is_empty(), "CWD must resolve to a valid path");
        assert!(Path::new(&cwd).exists(), "Resolved CWD must exist on disk");
    }

    #[test]
    fn test_pty_spawn_and_lifecycle() {
        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("openpty must succeed");

        let (shell, args) = detect_login_shell();
        let mut cmd = CommandBuilder::new(&shell);
        cmd.args(&args);
        cmd.env("PATH", &get_login_shell_path());
        cmd.env("TERM", "xterm-256color");

        let _child = pty_pair.slave.spawn_command(cmd).expect("spawn command must succeed");
        let mut reader = pty_pair.master.try_clone_reader().expect("reader clone must succeed");
        let mut writer = pty_pair.master.take_writer().expect("take writer must succeed");

        // Write echo ok and exit
        writer.write_all(b"echo ok\nexit\n").expect("write must succeed");
        writer.flush().expect("flush must succeed");

        // Read output
        let mut output = String::new();
        let mut buffer = [0u8; 1024];
        let start = std::time::Instant::now();
        while start.elapsed().as_secs() < 5 {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    output.push_str(&String::from_utf8_lossy(&buffer[..n]));
                    if output.contains("ok") {
                        break;
                    }
                }
                Err(_) => break,
            }
        }

        assert!(output.contains("ok"), "Terminal output must contain 'ok', got: {}", output);

        // Test resize
        pty_pair.master.resize(PtySize {
            rows: 40,
            cols: 100,
            pixel_width: 0,
            pixel_height: 0,
        }).expect("resize must succeed");
    }
}

