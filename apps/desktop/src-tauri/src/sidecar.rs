//! Finds the MyaOS runtime, starting it when none is running.
//!
//! The runtime publishes its address and token in `~/.myaos/runtime.json`
//! (or `$MYAOS_RUNTIME_FILE`). One runtime serves the whole machine: if a
//! healthy one is already up (started by hand, the CLI, or another window)
//! the app connects to it instead of starting a second.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConnection {
    pub url: String,
    pub token: String,
}

#[derive(Deserialize)]
struct RuntimeInfo {
    url: String,
    port: u16,
    token: String,
}

/// The runtime this app started, if it started one. Stopped when the app exits.
#[derive(Default)]
pub struct Sidecar(pub Mutex<Option<Child>>);

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").filter(|h| !h.is_empty()).map(PathBuf::from)
}

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var(name).ok().filter(|v| !v.trim().is_empty()).map(PathBuf::from)
}

fn myaos_home() -> Option<PathBuf> {
    env_path("MYAOS_HOME").or_else(|| home().map(|h| h.join(".myaos")))
}

fn info_path() -> Option<PathBuf> {
    env_path("MYAOS_RUNTIME_FILE").or_else(|| myaos_home().map(|h| h.join("runtime.json")))
}

/// The runtime's source folder. `$MYAOS_RUNTIME_DIR` wins; otherwise checks
/// the macOS app bundle Resources directory (for standalone packaged builds),
/// and falls back to the development repository folder.
fn runtime_dir() -> PathBuf {
    if let Some(p) = env_path("MYAOS_RUNTIME_DIR") {
        return p;
    }

    // 1. Check macOS app bundle Resources directory
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let bundle_resources = exe_dir.join("../Resources");
            let candidates = [
                bundle_resources.join("runtime"),
                bundle_resources.clone(),
                bundle_resources.join("_up_/_up_/_up_/runtime"),
            ];
            for candidate in candidates {
                if candidate.join("src").join("main.ts").exists() {
                    return candidate;
                }
            }
        }
    }

    // 2. Fallback to repository manifest relative path (dev mode)
    let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../runtime");
    if dev_dir.join("src").join("main.ts").exists() {
        return dev_dir;
    }

    // 3. Fallback to current working directory relatives
    for candidate in [PathBuf::from("runtime"), PathBuf::from("../runtime")] {
        if candidate.join("src").join("main.ts").exists() {
            return candidate;
        }
    }

    dev_dir
}

/// Apps opened from Finder get a bare PATH, so look where Node is usually installed.
fn find_node() -> Option<PathBuf> {
    if let Some(p) = env_path("MYAOS_NODE") {
        return Some(p);
    }
    if let Ok(out) = Command::new("/bin/zsh").args(["-lc", "command -v node"]).output() {
        let found = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if out.status.success() && !found.is_empty() {
            return Some(PathBuf::from(found));
        }
    }
    ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
}

/// A bare HTTP GET of /health; true only for a 200 answer.
fn healthy(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(2000)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(3000)));
    let req = format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut head = [0u8; 16];
    matches!(stream.read(&mut head), Ok(n) if n >= 12 && head[..n].starts_with(b"HTTP/1.1 200"))
}

fn read_live_runtime() -> Option<RuntimeConnection> {
    let text = std::fs::read_to_string(info_path()?).ok()?;
    let info: RuntimeInfo = serde_json::from_str(&text).ok()?;
    healthy(info.port).then(|| RuntimeConnection { url: info.url, token: info.token })
}

fn start(sidecar: &Sidecar) -> Result<(), String> {
    let mut guard = sidecar.0.lock().map_err(|_| "runtime lock poisoned".to_string())?;
    if let Some(child) = guard.as_mut() {
        if child.try_wait().map(|s| s.is_none()).unwrap_or(false) {
            return Ok(()); // already starting
        }
    }
    let node = find_node().ok_or("Node.js 24 or newer was not found. Install it, or set MYAOS_NODE to its path.")?;
    let dir = runtime_dir();
    let entry = dir.join("src").join("main.ts");
    if !entry.exists() {
        return Err(format!("Runtime not found at {}. Set MYAOS_RUNTIME_DIR to the runtime folder.", dir.display()));
    }
    let log_dir = myaos_home().ok_or("HOME is not set")?.join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log = std::fs::File::create(log_dir.join("runtime.log")).map_err(|e| e.to_string())?;
    let log_err = log.try_clone().map_err(|e| e.to_string())?;

    // The webview's origin while developing; packaged builds use tauri:// origins the runtime already allows.
    let origins = if cfg!(debug_assertions) {
        "http://127.0.0.1:1430,http://localhost:1430"
    } else {
        ""
    };

    let child = Command::new(node)
        .arg(&entry)
        .current_dir(&dir)
        .env("MYAOS_PARENT_PID", std::process::id().to_string())
        .env("MYAOS_RUNTIME_ORIGINS", origins)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err))
        .spawn()
        .map_err(|e| format!("Could not start the runtime: {e}"))?;
    *guard = Some(child);
    Ok(())
}

/// Connects to the running runtime, starting it first if needed.
pub fn connect(sidecar: &Sidecar) -> Result<RuntimeConnection, String> {
    if let Some(c) = read_live_runtime() {
        return Ok(c);
    }
    start(sidecar)?;
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(250));
        if let Some(c) = read_live_runtime() {
            return Ok(c);
        }
        if let Ok(mut guard) = sidecar.0.lock() {
            if let Some(status) = guard.as_mut().and_then(|c| c.try_wait().ok().flatten()) {
                *guard = None;
                let log = myaos_home().map(|h| h.join("logs/runtime.log").display().to_string()).unwrap_or_default();
                return Err(format!("The runtime exited during start-up ({status}). See {log}."));
            }
        }
    }
    Err("The runtime did not come up within 10 seconds.".to_string())
}

/// Stops the runtime this app started. A runtime started elsewhere is left running.
pub fn stop(sidecar: &Sidecar) {
    if let Ok(mut guard) = sidecar.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_runtime_dir_resolution() {
        let dir = runtime_dir();
        assert!(
            dir.join("src").join("main.ts").exists(),
            "Expected runtime src/main.ts to exist at {}",
            dir.display()
        );
    }

    #[test]
    fn test_runtime_dir_env_override() {
        let custom = std::env::temp_dir().join("custom-runtime");
        std::env::set_var("MYAOS_RUNTIME_DIR", &custom);
        let resolved = runtime_dir();
        assert_eq!(resolved, custom);
        std::env::remove_var("MYAOS_RUNTIME_DIR");
    }

    #[test]
    fn test_find_node() {
        let node = find_node();
        assert!(node.is_some(), "Node binary should be detectable on system");
    }
}
