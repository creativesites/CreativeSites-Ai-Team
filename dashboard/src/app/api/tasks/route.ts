import { queryDb, runDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (taskId) {
      const task = queryDb(`SELECT * FROM tasks WHERE id = '${taskId}'`)[0];
      const notes = queryDb(`SELECT * FROM task_notes WHERE task_id = '${taskId}' ORDER BY ts ASC`);
      const evidence = queryDb(`SELECT * FROM evidence WHERE task_id = '${taskId}' ORDER BY created_at DESC`);
      const relatedMessages = queryDb(`SELECT * FROM messages WHERE related_task_id = '${taskId}' ORDER BY ts ASC`);
      const relatedEvents = queryDb(`SELECT * FROM events WHERE task_id = '${taskId}' ORDER BY ts ASC`);
      return NextResponse.json({ task, notes, evidence, relatedMessages, relatedEvents });
    }

    const tasks = queryDb(`
      SELECT t.*, i.display_name as assignee_name, i.symbol as assignee_symbol
      FROM tasks t
      LEFT JOIN identities i ON t.assignee_id = i.id
      ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, t.created_at DESC
    `);
    const agents = queryDb(`SELECT id, display_name, symbol FROM identities ORDER BY joined_at ASC`);

    return NextResponse.json({ tasks, agents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create_task') {
      const { id, title, description = '', creator = 'Winston', assignee_id = null, priority = 'high' } = body;
      if (!id || !title) {
        return NextResponse.json({ error: 'id and title are required' }, { status: 400 });
      }
      runDb(`
        INSERT INTO tasks (id, title, description, creator, assignee_id, priority, status, created_at, updated_at)
        VALUES ('${id}', '${title.replace(/'/g, "''")}', '${description.replace(/'/g, "''")}', '${creator}', ${assignee_id ? `'${assignee_id}'` : 'NULL'}, '${priority}', 'open', datetime('now'), datetime('now'))
      `);
      runDb(`
        INSERT INTO events (type, sender, task_id, payload, ts)
        VALUES ('task.created', '${creator}', '${id}', '{"title":"${title.replace(/"/g, '\\"')}"}', datetime('now'))
      `);
      return NextResponse.json({ success: true });
    }

    if (action === 'update_status') {
      const { task_id, status } = body;
      runDb(`
        UPDATE tasks SET status = '${status}', updated_at = datetime('now') WHERE id = '${task_id}'
      `);
      runDb(`
        INSERT INTO events (type, sender, task_id, payload, ts)
        VALUES ('task.status_changed', 'Winston', '${task_id}', '{"status":"${status}"}', datetime('now'))
      `);
      return NextResponse.json({ success: true });
    }

    if (action === 'assign_task') {
      const { task_id, assignee_id } = body;
      runDb(`
        UPDATE tasks SET assignee_id = '${assignee_id}', updated_at = datetime('now') WHERE id = '${task_id}'
      `);
      runDb(`
        INSERT INTO events (type, sender, task_id, payload, ts)
        VALUES ('task.assigned', 'Winston', '${task_id}', '{"assignee":"${assignee_id}"}', datetime('now'))
      `);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
