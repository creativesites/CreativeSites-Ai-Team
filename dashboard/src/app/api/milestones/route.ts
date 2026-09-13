import { queryDb, runDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    let query = `SELECT * FROM milestones`;
    if (projectId) {
      query += ` WHERE project_id = '${projectId}'`;
    }
    query += ` ORDER BY due_at ASC`;

    const milestones = queryDb(query);
    return NextResponse.json({ milestones });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create_milestone') {
      const { id, project_id, title, description = '', due_at = null } = body;
      if (!id || !project_id || !title) {
        return NextResponse.json({ error: 'id, project_id, and title are required' }, { status: 400 });
      }

      runDb(`
        INSERT INTO milestones (id, project_id, title, description, status, due_at, created_at)
        VALUES (
          '${id}',
          '${project_id}',
          '${title.replace(/'/g, "''")}',
          '${description.replace(/'/g, "''")}',
          'pending',
          ${due_at ? `'${due_at}'` : 'NULL'},
          datetime('now')
        )
      `);

      runDb(`
        INSERT INTO events (type, sender, payload, ts)
        VALUES ('milestone.created', 'Winston', '{"project_id":"${project_id}","milestone_id":"${id}","title":"${title.replace(/"/g, '\\"')}"}', datetime('now'))
      `);

      return NextResponse.json({ success: true });
    }

    if (action === 'update_status') {
      const { milestone_id, status } = body;
      if (!milestone_id || !status) {
        return NextResponse.json({ error: 'milestone_id and status are required' }, { status: 400 });
      }

      const completedAtSql = status === 'completed' ? ", completed_at = datetime('now')" : ", completed_at = NULL";

      runDb(`
        UPDATE milestones 
        SET status = '${status}' ${completedAtSql}
        WHERE id = '${milestone_id}'
      `);

      runDb(`
        INSERT INTO events (type, sender, payload, ts)
        VALUES ('milestone.status_changed', 'Winston', '{"milestone_id":"${milestone_id}","status":"${status}"}', datetime('now'))
      `);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
