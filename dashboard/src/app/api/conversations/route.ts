import { queryDb, runDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const threadId = searchParams.get('threadId');

    if (threadId) {
      const thread = queryDb(`SELECT * FROM threads WHERE id = '${threadId}'`)[0];
      const messages = queryDb(`SELECT * FROM messages WHERE thread_id = '${threadId}' ORDER BY ts ASC`);
      return NextResponse.json({ thread, messages });
    }

    if (agentId) {
      // Return rich contextual cockpit data for this agent
      const identity = queryDb(`SELECT * FROM identities WHERE id = '${agentId}'`)[0];
      const runtimes = queryDb(`SELECT * FROM runtimes WHERE identity_id = '${agentId}' ORDER BY started_at DESC`);
      const activeTasks = queryDb(`SELECT * FROM tasks WHERE assignee_id = '${agentId}' AND status != 'done'`);
      const allTasks = queryDb(`SELECT * FROM tasks WHERE assignee_id = '${agentId}' ORDER BY created_at DESC`);
      const verificationRecords = queryDb(`SELECT * FROM evidence WHERE verifier_identity = '${agentId}' ORDER BY created_at DESC`);
      const messages = queryDb(`
        SELECT * FROM messages 
        WHERE from_identity = '${agentId}' OR to_identity = '${agentId}' 
        ORDER BY ts ASC
      `);
      const memory = queryDb(`SELECT * FROM memory_snippets WHERE identity_id = '${agentId}' ORDER BY updated_at DESC`);
      const recentEvents = queryDb(`SELECT * FROM events WHERE sender = '${agentId}' ORDER BY ts DESC LIMIT 10`);

      return NextResponse.json({
        identity,
        runtimes,
        activeTasks,
        allTasks,
        verificationRecords,
        messages,
        memory,
        recentEvents
      });
    }

    // Default: list all threads and active agents
    const threads = queryDb(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) as message_count,
        (SELECT MAX(ts) FROM messages m WHERE m.thread_id = t.id) as last_activity
      FROM threads t
      ORDER BY last_activity DESC, created_at DESC
    `);
    const agents = queryDb(`SELECT * FROM identities ORDER BY joined_at ASC`);

    return NextResponse.json({ threads, agents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      from_identity = 'Winston',
      to_identity,
      thread_id = null,
      subject = null,
      body: content,
      type = 'COORDINATION',
      priority = 'normal',
      related_task_id = null,
      related_project_id = null
    } = body;

    if (!content) {
      return NextResponse.json({ error: 'Message body content is required' }, { status: 400 });
    }

    const ts = new Date().toISOString();
    const escapedBody = content.replace(/'/g, "''");
    const escapedSubject = subject ? subject.replace(/'/g, "''") : null;

    // 1. Insert message into messages table
    runDb(`
      INSERT INTO messages (
        thread_id, from_identity, to_identity, type, priority, subject, body, 
        related_task_id, related_project_id, read, ts, original_file_path
      ) VALUES (
        ${thread_id ? `'${thread_id}'` : 'NULL'},
        '${from_identity}',
        ${to_identity ? `'${to_identity}'` : 'NULL'},
        '${type}',
        '${priority}',
        ${escapedSubject ? `'${escapedSubject}'` : 'NULL'},
        '${escapedBody}',
        ${related_task_id ? `'${related_task_id}'` : 'NULL'},
        ${related_project_id ? `'${related_project_id}'` : 'NULL'},
        0,
        '${ts}',
        'tam_db_dashboard'
      )
    `);

    // 2. Insert event into immutable event log
    runDb(`
      INSERT INTO events (type, sender, task_id, payload, ts)
      VALUES (
        'message.sent',
        '${from_identity}',
        ${related_task_id ? `'${related_task_id}'` : 'NULL'},
        '${JSON.stringify({ to: to_identity, type, thread_id, length: content.length }).replace(/'/g, "''")}',
        '${ts}'
      )
    `);

    // 3. Write-through to filesystem inbox if recipient is an agent (preserving dual-state truth)
    try {
      if (to_identity && to_identity.toLowerCase() !== 'all') {
        const fs = require('fs');
        const path = require('path');
        const inboxDir = path.resolve(process.cwd(), `../community/inboxes/${to_identity.toLowerCase()}`);
        if (fs.existsSync(inboxDir)) {
          const filename = `${ts.replace(/[:.]/g, '-')}_winston_dispatch.md`;
          const mdContent = `# Message from ${from_identity}\n\n**Type**: ${type}\n**Timestamp**: ${ts}\n**Subject**: ${subject || 'Direct Dispatch'}\n\n${content}\n`;
          fs.writeFileSync(path.join(inboxDir, filename), mdContent);
        }
      }
    } catch (e) {
      console.warn('Write-through inbox warning:', e);
    }

    return NextResponse.json({ success: true, ts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
