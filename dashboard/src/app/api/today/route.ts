import { queryDb, runDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Gather all operational data for the narrative
    const agents = queryDb(`SELECT * FROM identities ORDER BY joined_at ASC`);
    const openTasks = queryDb(`SELECT * FROM tasks WHERE status != 'done' ORDER BY created_at DESC`);
    const doneTasks = queryDb(`SELECT * FROM tasks WHERE status = 'done' ORDER BY updated_at DESC`);
    const pendingDecisions = queryDb(`SELECT * FROM human_decisions WHERE status = 'pending'`);
    const recentMessages = queryDb(`SELECT * FROM messages ORDER BY ts DESC LIMIT 8`);
    const recentEvents = queryDb(`SELECT * FROM events ORDER BY ts DESC LIMIT 15`);
    const recentLearnings = queryDb(`SELECT * FROM memory_snippets ORDER BY updated_at DESC LIMIT 5`);

    // 2. Synthesize the narrative briefing
    const liveAgents = agents.filter((a: any) => a.observed_liveness === 'LIVE').map((a: any) => a.display_name);
    const offlineAgents = agents.filter((a: any) => a.observed_liveness !== 'LIVE').map((a: any) => a.display_name);

    const narrative = `Good morning Winston. Here is the operational synthesis for today (${todayStr}):

### Current Operational State
- **Active Team Roster**: ${agents.length} registered agents. Currently **${liveAgents.length} agents are LIVE** (${liveAgents.join(', ') || 'None'}) and ${offlineAgents.length} are in sleep state (${offlineAgents.join(', ')}).
- **Task Pipeline**: We have **${openTasks.length} open/in-progress tasks** requiring attention, while **${doneTasks.length} tasks** have passed machine verification and are closed.
- **Human Authorizations**: There are currently **${pendingDecisions.length} pending decisions** awaiting your signoff.

### Key Active Work Streams
${openTasks.slice(0, 4).map((t: any) => `- **[${t.id}] ${t.title}** (Priority: \`${t.priority}\`, Assignee: @${t.assignee_id || 'Unassigned'})`).join('\n')}

### Recommended Next Steps for Orchestrator
1. Wake up **@Atlas** (Platform & Security) and **@Lyra** (Mobile SDK) to continue integration on \`TASK_005\` and \`TASK_007\`.
2. Inspect unassigned tasks and route them according to agent declared capabilities.
3. Review the DeployFleet bridge health to ensure cross-database synchronization is nominal.`;

    return NextResponse.json({
      date: todayStr,
      narrative,
      stats: {
        total_agents: agents.length,
        live_agents: liveAgents.length,
        open_tasks: openTasks.length,
        done_tasks: doneTasks.length,
        pending_decisions: pendingDecisions.length,
      },
      openTasks,
      doneTasks,
      recentMessages,
      recentEvents,
      recentLearnings,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'wake_all') {
      // Record wake_all directive event
      const ts = new Date().toISOString();
      runDb(`
        INSERT INTO events (type, sender, payload, ts)
        VALUES ('orchestrator.wake_all', 'Winston', '{"action":"wake_all_agents"}', '${ts}')
      `);
      runDb(`
        INSERT INTO messages (from_identity, to_identity, type, priority, subject, body, read, ts, original_file_path)
        VALUES ('Winston', 'Team', 'COORDINATION', 'urgent', 'Morning Wake All Directive', 'All agents awake: orchestrator running morning synthesis and routing active tasks.', 0, '${ts}', 'tam_db_dashboard')
      `);
      return NextResponse.json({ success: true, message: 'All agents notified to wake and orchestrator cycle triggered.' });
    }

    if (action === 'wrap_up') {
      const { minutes = 30 } = body;
      const ts = new Date().toISOString();
      runDb(`
        INSERT INTO events (type, sender, payload, ts)
        VALUES ('orchestrator.wrap_up', 'Winston', '{"minutes":${minutes}}', '${ts}')
      `);
      runDb(`
        INSERT INTO messages (from_identity, to_identity, type, priority, subject, body, read, ts, original_file_path)
        VALUES ('Winston', 'Team', 'COORDINATION', 'high', 'Wrap Up Directive', 'Team notice: Please wrap up in-progress commits and document task state. Winston has a meeting in ${minutes} minutes.', 0, '${ts}', 'tam_db_dashboard')
      `);
      return NextResponse.json({ success: true, message: `Wrap-up broadcast sent: Meeting in ${minutes} minutes.` });
    }

    if (action === 'sleep_all') {
      const ts = new Date().toISOString();
      runDb(`
        INSERT INTO events (type, sender, payload, ts)
        VALUES ('orchestrator.sleep_all', 'Winston', '{"action":"sleep_all_agents"}', '${ts}')
      `);
      runDb(`
        INSERT INTO messages (from_identity, to_identity, type, priority, subject, body, read, ts, original_file_path)
        VALUES ('Winston', 'Team', 'COORDINATION', 'normal', 'Team Sleep Directive', 'Stand down for the day. State preserved in TAM database.', 0, '${ts}', 'tam_db_dashboard')
      `);
      return NextResponse.json({ success: true, message: 'Sleep broadcast sent. All agents standing down.' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
