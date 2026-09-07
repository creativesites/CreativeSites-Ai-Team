import { queryDb, runDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 1. Live Agents with Runtime Status & Active Tasks
    const agents = queryDb(`
      SELECT 
        i.*,
        a.status as agent_status,
        a.current_task_id,
        r.engine as runtime_engine,
        r.socket_path,
        r.observed_liveness as runtime_liveness,
        (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = i.id AND t.status != 'done') as active_task_count,
        (SELECT t.title FROM tasks t WHERE t.assignee_id = i.id AND t.status != 'done' ORDER BY t.created_at DESC LIMIT 1) as current_task_title
      FROM identities i
      LEFT JOIN agents a ON a.identity_id = i.id
      LEFT JOIN runtimes r ON a.current_runtime_id = r.id
      ORDER BY 
        CASE i.observed_liveness WHEN 'LIVE' THEN 1 WHEN 'OFFLINE' THEN 2 ELSE 3 END,
        i.joined_at ASC
    `);

    // 2. Real-Time Immutable Event Stream (What is actually happening right now)
    const recentEvents = queryDb(`
      SELECT e.*, t.title as task_title
      FROM events e
      LEFT JOIN tasks t ON e.task_id = t.id
      ORDER BY e.ts DESC
      LIMIT 30
    `);

    // 3. Active Tasks with Full Details
    const activeTasks = queryDb(`
      SELECT t.*, i.display_name as assignee_name, i.symbol as assignee_symbol
      FROM tasks t
      LEFT JOIN identities i ON t.assignee_id = i.id
      ORDER BY 
        CASE t.status WHEN 'in_progress' THEN 1 WHEN 'open' THEN 2 WHEN 'blocked' THEN 3 ELSE 4 END,
        CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        t.created_at DESC
    `);

    // 4. Pending Human Decisions Requiring Winston's Action
    const pendingDecisions = queryDb(`
      SELECT * FROM human_decisions 
      ORDER BY CASE urgency WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, requested_at DESC
    `);

    // 5. Active Coordination Threads
    const threads = queryDb(`
      SELECT t.*,
        (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) as message_count,
        (SELECT MAX(ts) FROM messages m WHERE m.thread_id = t.id) as last_activity
      FROM threads t
      ORDER BY last_activity DESC, created_at DESC
      LIMIT 10
    `);

    // 6. Recent Direct Communications
    const recentMessages = queryDb(`
      SELECT m.*, t.title as thread_title
      FROM messages m
      LEFT JOIN threads t ON m.thread_id = t.id
      ORDER BY m.ts DESC
      LIMIT 15
    `);

    // 7. Provenance & Contradiction Alerts
    const contradictions = queryDb(`
      SELECT * FROM provenance_log 
      WHERE reason LIKE '%contradiction%' OR operation = 'CONTRADICTION_PRESERVED' OR actor = 'migration_agent'
      ORDER BY ts DESC
    `);

    // 8. System Pulse Counts
    const pulse = {
      total_agents: agents.length,
      live_agents: agents.filter((a: any) => a.observed_liveness === 'LIVE').length,
      open_tasks: activeTasks.filter((t: any) => t.status !== 'done').length,
      in_progress_tasks: activeTasks.filter((t: any) => t.status === 'in_progress' || t.status === 'IN_PROGRESS').length,
      pending_approvals: pendingDecisions.filter((d: any) => d.status === 'pending').length,
      total_events: queryDb(`SELECT COUNT(*) as count FROM events`)[0]?.count || 0,
      total_messages: queryDb(`SELECT COUNT(*) as count FROM messages`)[0]?.count || 0,
    };

    return NextResponse.json({
      pulse,
      agents,
      recentEvents,
      activeTasks,
      pendingDecisions,
      threads,
      recentMessages,
      contradictions
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
