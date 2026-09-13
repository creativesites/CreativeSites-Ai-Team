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

    // Detect workspace root path
    let workspace_root = if let Ok(env_root) = std::env::var("MYAOS_WORKSPACE_ROOT") {
        env_root
    } else {
        let hardcoded_root = PathBuf::from("/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team");
        if hardcoded_root.exists() {
            hardcoded_root.to_string_lossy().to_string()
        } else {
            exe_dir.to_string_lossy().to_string()
        }
    };

    // Detect database path
    let db_path = if let Ok(env_db) = std::env::var("MYAOS_DB_PATH") {
        env_db
    } else {
        let hardcoded_db = PathBuf::from("/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/data/myaos.db");
        if hardcoded_db.exists() {
            hardcoded_db.to_string_lossy().to_string()
        } else {
            let root_db = exe_dir.join("../data/myaos.db");
            let fallback_db = exe_dir.join("data/myaos.db");
            if root_db.exists() {
                root_db.to_string_lossy().to_string()
            } else {
                fallback_db.to_string_lossy().to_string()
            }
        }
    };

    println!("[MyaOS Desktop] Using database path: {}", db_path);
    println!("[MyaOS Desktop] Using workspace root: {}", workspace_root);

    tauri::Builder::default()
        .manage(PtyManager::new(workspace_root))
        .manage(SystemManager::new(&db_path))
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            pty_list,
            pty_spawn_claude,
            pty_spawn_gemini,
            pty_spawn_antigravity,
            pty_spawn_shell,
            runtime_list_adapters,
            myaos_get_summary,
            myaos_get_identities,
            myaos_get_pending_decisions,
            myaos_record_decision,
            myaos_create_task,
            myaos_wake_all_agents,
            myaos_sleep_all_agents,
            system_enable_sleep_prevention,
            system_disable_sleep_prevention,
            system_is_sleep_prevented,
            myaos_get_workspaces_status,
            myaos_get_chat_messages,
            myaos_send_chat_message,
            myaos_get_evidence,
            myaos_get_observability_metrics,
            myaos_get_gemini_api_key,
            myaos_get_agent_working_dir,
            myaos_get_claude_latest_turn,
            myaos_log_mission_event,
            myaos_call_gemini_orchestrator,
            myaos_get_git_diff,
            myaos_stage_all_git,
            myaos_record_verification_evidence,
            myaos_save_mission_plan,
            myaos_list_mission_plans,
            myaos_save_mission_message,
            myaos_get_mission_messages,
            myaos_create_git_commit,
            myaos_create_git_branch,
            myaos_push_git_branch,
            myaos_record_token_usage,
            myaos_create_memory_bookmark,
            myaos_list_memory_bookmarks,
            myaos_delete_memory_bookmark,
            myaos_clone_github_repo,
            myaos_connect_local_project,
            myaos_create_new_project,
            myaos_remove_workspace,
            myaos_create_agent_identity,
            myaos_update_agent_identity,
            myaos_list_projects,
            myaos_create_project,
            myaos_list_okrs,
            myaos_save_okr_objective,
            myaos_delete_okr_objective,
            myaos_save_okr_key_result,
            myaos_delete_okr_key_result,
            myaos_update_okr_progress,
            myaos_get_active_okrs_context,
            myaos_list_design_projects,
            myaos_save_design_project,
            myaos_delete_design_project,
            myaos_list_project_screen_versions,
            myaos_save_project_screen_version,
            myaos_delete_project_screen_version,
            myaos_get_project_design_philosophy,
            myaos_save_project_design_philosophy,
            myaos_list_project_components,
            myaos_save_project_component,
            myaos_delete_project_component,
            myaos_inspect_workspace_ui_structure,
            myaos_dispatch_design_update_task,
            myaos_update_task_status,
            myaos_run_reality_audit,
            myaos_get_agent_profile_details,
            myaos_get_inbox_messages,
            myaos_list_threads,
            myaos_get_thread_messages,
            myaos_create_thread,
            myaos_post_thread_reply,
            myaos_list_announcements,
            myaos_create_announcement,
            myaos_list_social_posts,
            myaos_create_social_post,
            myaos_list_standups,
            myaos_create_standup,
            myaos_get_secrets,
            myaos_set_secret,
            myaos_delete_secret,
            myaos_test_gemini_key,
            myaos_get_users,
            myaos_save_user,
            myaos_delete_user,
            myaos_get_integrations,
            myaos_save_integration,
            myaos_get_pending_approvals,
            myaos_create_pending_approval,
            myaos_process_approval,
            myaos_test_slack_webhook,
            myaos_read_sample_emails,
            myaos_get_autopilot_queue,
            myaos_add_autopilot_task,
            myaos_add_autopilot_batch,
            myaos_update_autopilot_task_status,
            myaos_delete_autopilot_task,
            myaos_clear_completed_autopilot_tasks,
            myaos_get_autopilot_history,
            myaos_simulate_rate_limit_and_resume
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
