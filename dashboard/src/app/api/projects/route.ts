import { queryDb, runDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('id');

    // Fetch individual project with deep metrics
    if (projectId) {
      const projectRow = queryDb(`SELECT * FROM projects WHERE id = '${projectId}'`)[0];
      if (!projectRow) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      // Parse JSON arrays safely
      projectRow.objectives = JSON.parse(projectRow.objectives || '[]');
      projectRow.owner_identity_ids = JSON.parse(projectRow.owner_identity_ids || '[]');

      // Fetch milestones for this project
      const milestones = queryDb(`
        SELECT m.*,
          (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id = m.id) as total_tasks,
          (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id = m.id AND t.status = 'done') as completed_tasks
        FROM milestones m 
        WHERE m.project_id = '${projectId}'
        ORDER BY m.due_at ASC
      `);

      // Fetch all tasks for this project with assignee identities
      const tasks = queryDb(`
        SELECT t.*, i.display_name as assignee_name, i.symbol as assignee_symbol
        FROM tasks t
        LEFT JOIN identities i ON t.assignee_id = i.id
        WHERE t.project_id = '${projectId}'
        ORDER BY 
          CASE t.status WHEN 'in_progress' THEN 1 WHEN 'open' THEN 2 WHEN 'blocked' THEN 3 ELSE 4 END,
          CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          t.created_at DESC
      `);

      // Gather evidence and verification records for tasks in this project
      const evidence = queryDb(`
        SELECT e.*, t.title as task_title
        FROM evidence e
        JOIN tasks t ON e.task_id = t.id
        WHERE t.project_id = '${projectId}'
        ORDER BY e.created_at DESC
      `);

      // Gather related communication threads and direct messages
      const messages = queryDb(`
        SELECT m.*, t.title as thread_title
        FROM messages m
        LEFT JOIN threads t ON m.thread_id = t.id
        WHERE m.related_project_id = '${projectId}' OR m.related_task_id IN (SELECT id FROM tasks WHERE project_id = '${projectId}')
        ORDER BY m.ts DESC
        LIMIT 20
      `);

      // Fetch human decisions escalated for this project
      const decisions = queryDb(`
        SELECT * FROM human_decisions 
        WHERE project_id = '${projectId}' OR task_id IN (SELECT id FROM tasks WHERE project_id = '${projectId}')
        ORDER BY requested_at DESC
      `);

      // Calculate health states dynamically and truthfully
      let health = 'ON TRACK';
      const blockedTasks = tasks.filter((t: any) => t.status === 'blocked');
      const failedTasks = tasks.filter((t: any) => t.status === 'failed' || t.status === 'unresolved');
      const pendingApprovalCount = decisions.filter((d: any) => d.status === 'pending').length;

      if (blockedTasks.length > 0 || pendingApprovalCount > 0) {
        health = 'BLOCKED';
      } else if (failedTasks.length > 0) {
        health = 'AT RISK';
      } else if (tasks.length === 0) {
        health = 'UNKNOWN';
      }

      // Progress Metrics
      const totalTasksCount = tasks.length;
      const completedTasksCount = tasks.filter((t: any) => t.status === 'done').length;
      const verifiedTasksCount = tasks.filter((t: any) => t.status === 'done' || t.status === 'in_review').length; // technically passed verifier or accepted

      const taskCompletionRate = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;
      const verificationProgressRate = totalTasksCount > 0 ? Math.round((verifiedTasksCount / totalTasksCount) * 100) : 0;

      return NextResponse.json({
        project: projectRow,
        milestones,
        tasks,
        evidence,
        messages,
        decisions,
        metrics: {
          total_tasks: totalTasksCount,
          completed_tasks: completedTasksCount,
          verified_tasks: verifiedTasksCount,
          blocked_tasks: blockedTasks.length,
          failed_tasks: failedTasks.length,
          pending_decisions: pendingApprovalCount,
          task_completion_rate: taskCompletionRate,
          verification_progress_rate: verificationProgressRate,
          health
        }
      });
    }

    // List all projects with aggregate metrics
    const projectsList = queryDb(`SELECT * FROM projects ORDER BY created_at ASC`);
    const enrichedProjects = projectsList.map((p: any) => {
      p.objectives = JSON.parse(p.objectives || '[]');
      p.owner_identity_ids = JSON.parse(p.owner_identity_ids || '[]');

      const projTasks = queryDb(`SELECT status, priority FROM tasks WHERE project_id = '${p.id}'`);
      const totalTasks = projTasks.length;
      const completedTasks = projTasks.filter((t: any) => t.status === 'done').length;
      const blockedTasks = projTasks.filter((t: any) => t.status === 'blocked').length;

      let health = 'ON TRACK';
      if (blockedTasks > 0) {
        health = 'BLOCKED';
      } else if (totalTasks === 0) {
        health = 'UNKNOWN';
      }

      const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        ...p,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        task_completion_rate: taskCompletionRate,
        health
      };
    });

    return NextResponse.json({ projects: enrichedProjects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create_project') {
      const { id, title, description, objectives = [], owner_identity_ids = [], repo = null } = body;
      if (!id || !title) {
        return NextResponse.json({ error: 'id and title are required' }, { status: 400 });
      }

      runDb(`
        INSERT INTO projects (id, title, description, objectives, status, owner_identity_ids, repo, created_at, updated_at)
        VALUES (
          '${id}',
          '${title.replace(/'/g, "''")}',
          '${description ? description.replace(/'/g, "''") : ''}',
          '${JSON.stringify(objectives).replace(/'/g, "''")}',
          'active',
          '${JSON.stringify(owner_identity_ids).replace(/'/g, "''")}',
          ${repo ? `'${repo}'` : 'NULL'},
          datetime('now'),
          datetime('now')
        )
      `);

      // Record state change on event bus
      runDb(`
        INSERT INTO events (type, sender, payload, ts)
        VALUES ('project.created', 'Winston', '{"project_id":"${id}","title":"${title.replace(/"/g, '\\"')}"}', datetime('now'))
      `);

      return NextResponse.json({ success: true });
    }

    if (action === 'update_status') {
      const { project_id, status } = body;
      if (!project_id || !status) {
        return NextResponse.json({ error: 'project_id and status are required' }, { status: 400 });
      }

      runDb(`
        UPDATE projects SET status = '${status}', updated_at = datetime('now') WHERE id = '${project_id}'
      `);

      runDb(`
        INSERT INTO events (type, sender, payload, ts)
        VALUES ('project.status_changed', 'Winston', '{"project_id":"${project_id}","status":"${status}"}', datetime('now'))
      `);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
