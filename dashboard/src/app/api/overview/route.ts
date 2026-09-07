import { queryDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const agents = queryDb(`SELECT * FROM identities ORDER BY joined_at ASC`);
    const tasks = queryDb(`SELECT * FROM tasks ORDER BY created_at DESC`);
    const decisions = queryDb(`SELECT * FROM human_decisions WHERE status = 'pending'`);
    const events = queryDb(`SELECT * FROM events ORDER BY ts DESC LIMIT 10`);

    return NextResponse.json({
      summary: {
        total_agents: agents.length,
        open_tasks: tasks.filter((t: any) => t.status !== 'done').length,
        pending_decisions: decisions.length,
        recent_events: events.length,
      },
      agents,
      recent_tasks: tasks.slice(0, 5),
      recent_events: events,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
