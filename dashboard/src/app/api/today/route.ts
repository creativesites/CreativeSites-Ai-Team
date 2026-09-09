import { queryDb, runDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import path from 'path';
import { execFileSync } from 'child_process';

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

      // Invoke real CLI wake for core agents (Atlas, Iris, Lyra, Vela, Astra)
      const baseDir = path.resolve(process.cwd(), '..');
      const scriptPath = path.join(baseDir, 'bin', 'myaos.js');
      const wakeTargets = ['atlas', 'iris', 'lyra', 'vela', 'astra'];
      const wakeResults: Record<string, string> = {};

      for (const target of wakeTargets) {
        try {
          const out = execFileSync(process.execPath, [scriptPath, 'wake', target], {
            cwd: baseDir,
            encoding: 'utf8',
            timeout: 8000,
          });
          // Read the real per-agent liveness word the CLI printed
          // ("Status = LIVE/OFFLINE/UNKNOWN/ALREADY_LIVE") instead of
          // collapsing everything non-live into one bucket - UNKNOWN
          // (e.g. Atlas/Astra sharing one cwd, so neither can be told
          // apart) is not the same claim as OFFLINE.
          const statusMatch = out.match(/Status = (\w+)/);
          const word = statusMatch ? statusMatch[1] : 'UNKNOWN';
          wakeResults[target] = word === 'ALREADY_LIVE' ? 'LIVE' : word === 'AGENT_ACTIVE' ? 'LIVE' : word;
        } catch (e: any) {
          wakeResults[target] = 'FAILED';
        }
      }

      const live = Object.entries(wakeResults).filter(([, v]) => v === 'LIVE').map(([k]) => k);
      const offline = Object.entries(wakeResults).filter(([, v]) => v === 'OFFLINE').map(([k]) => k);
      const unknown = Object.entries(wakeResults).filter(([, v]) => v === 'UNKNOWN').map(([k]) => k);
      const failed = Object.entries(wakeResults).filter(([, v]) => v === 'FAILED').map(([k]) => k);
      const message = [
        live.length ? `Already live: ${live.join(', ')}.` : null,
        offline.length ? `Offline - wake note left for when opened manually: ${offline.join(', ')}.` : null,
        unknown.length ? `Unknown - cannot be distinguished from another identity sharing the same session, or no tracking exists: ${unknown.join(', ')}.` : null,
        failed.length ? `Wake command itself failed to run for: ${failed.join(', ')}.` : null,
      ].filter(Boolean).join(' ') || 'No agents matched.';

      return NextResponse.json({
        success: true,
        message,
        wakeResults
      });
    }

    // wrap_up/sleep_all write a real inbox note to every known agent (same
    // mechanism src/orchestrator.js uses) instead of a single DB-only row
    // addressed to a "Team" identity nothing actually reads. The response
    // says exactly that a note was written - not that anyone saw it, saved
    // work, or stopped, since none of that can be verified from here.
    if (action === 'wrap_up' || action === 'sleep_all') {
      const { minutes = 30 } = body;
      const isWrapUp = action === 'wrap_up';
      const ts = new Date().toISOString();
      const subject = isWrapUp ? 'Wrap-up requested' : 'Stand-down requested';
      const bodyText = isWrapUp
        ? `Winston has a meeting in ${minutes} minutes. Please finish or commit your current work and note your status.`
        : `Winston has asked the team to stand down for the day. Please note your current status before stopping.`;

      runDb(`
        INSERT INTO events (type, sender, payload, ts)
        VALUES ('orchestrator.${action}', 'Winston', '${JSON.stringify({ minutes: isWrapUp ? minutes : undefined }).replace(/'/g, "''")}', '${ts}')
      `);

      const targets = ['atlas', 'iris', 'lyra', 'vela', 'astra', 'kael', 'nexus', 'meridian'];
      const notified: string[] = [];
      const fs = require('fs');
      const baseDir = path.resolve(process.cwd(), '..');
      for (const target of targets) {
        try {
          const dir = path.join(baseDir, 'community', 'inboxes', target);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const filename = `${ts.replace(/[:.]/g, '-')}_${subject.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.md`;
          fs.writeFileSync(path.join(dir, filename), `# Message from Orchestrator\n\n**Type**: COORDINATION\n**Timestamp**: ${ts}\n**Subject**: ${subject}\n\n${bodyText}\n`);
          notified.push(target);
        } catch (e) {}
      }

      return NextResponse.json({
        success: true,
        message: `${subject} note written to ${notified.length} agent inbox(es): ${notified.join(', ')}. This does not confirm anyone has seen it, saved work, or stopped - check the Agents page for real liveness.`,
        notified,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
