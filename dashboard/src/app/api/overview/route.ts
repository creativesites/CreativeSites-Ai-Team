import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = getDb();
    const agents = db.prepare(`SELECT * FROM identities ORDER BY joined_at ASC`).all();
    const tasks = db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`).all();
    const decisions = db.prepare(`SELECT * FROM human_decisions WHERE status = 'pending'`).all();
    const events = db.prepare(`SELECT * FROM events ORDER BY timestamp DESC LIMIT 10`).all();
    db.close();

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
