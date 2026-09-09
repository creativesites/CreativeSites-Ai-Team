use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeCapability {
    pub interactive: bool,
    pub headless: bool,
    pub supports_pty: bool,
    pub supports_resume: bool,
    pub supports_tool_use: bool,
    pub supports_computer_use: bool,
    pub supports_background_execution: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeAdapterInfo {
    pub runtime_type: String,
    pub display_name: String,
    pub command: String,
    pub default_args: Vec<String>,
    pub capabilities: RuntimeCapability,
}

pub fn get_available_runtime_adapters() -> Vec<RuntimeAdapterInfo> {
    vec![
        RuntimeAdapterInfo {
            runtime_type: "claude_code".to_string(),
            display_name: "Claude Code CLI".to_string(),
            command: "claude".to_string(),
            default_args: vec![],
            capabilities: RuntimeCapability {
                interactive: true,
                headless: false,
                supports_pty: true,
                supports_resume: true,
                supports_tool_use: true,
                supports_computer_use: true,
                supports_background_execution: true,
            },
        },
        RuntimeAdapterInfo {
            runtime_type: "codex".to_string(),
            display_name: "Codex CLI".to_string(),
            command: "codex".to_string(),
            default_args: vec![],
            capabilities: RuntimeCapability {
                interactive: true,
                headless: false,
                supports_pty: true,
                supports_resume: true,
                supports_tool_use: true,
                supports_computer_use: false,
                supports_background_execution: true,
            },
        },
        RuntimeAdapterInfo {
            runtime_type: "gemini_cli".to_string(),
            display_name: "Gemini CLI".to_string(),
            command: "gemini".to_string(),
            default_args: vec![],
            capabilities: RuntimeCapability {
                interactive: true,
                headless: false,
                supports_pty: true,
                supports_resume: false,
                supports_tool_use: true,
                supports_computer_use: false,
                supports_background_execution: true,
            },
        },
        RuntimeAdapterInfo {
            runtime_type: "antigravity".to_string(),
            display_name: "Antigravity Agent Console".to_string(),
            command: "antigravity".to_string(),
            default_args: vec![],
            capabilities: RuntimeCapability {
                interactive: true,
                headless: false,
                supports_pty: true,
                supports_resume: true,
                supports_tool_use: true,
                supports_computer_use: true,
                supports_background_execution: true,
            },
        },
        RuntimeAdapterInfo {
            runtime_type: "myaos_cli".to_string(),
            display_name: "MyaOS Substrate CLI".to_string(),
            command: "node".to_string(),
            default_args: vec!["bin/myaos.js".to_string(), "status".to_string()],
            capabilities: RuntimeCapability {
                interactive: true,
                headless: true,
                supports_pty: true,
                supports_resume: true,
                supports_tool_use: false,
                supports_computer_use: false,
                supports_background_execution: true,
            },
        },
        RuntimeAdapterInfo {
            runtime_type: "shell".to_string(),
            display_name: "System Shell (Zsh/Bash)".to_string(),
            command: if cfg!(target_os = "windows") { "powershell.exe".to_string() } else { "zsh".to_string() },
            default_args: vec![],
            capabilities: RuntimeCapability {
                interactive: true,
                headless: false,
                supports_pty: true,
                supports_resume: false,
                supports_tool_use: false,
                supports_computer_use: false,
                supports_background_execution: true,
            },
        },
    ]
}
