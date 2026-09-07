import { queryDb, runDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agent_id = searchParams.get('agent_id');

    let sql = `SELECT * FROM messages ORDER BY timestamp ASC`;
    if (agent_id) {
      sql = `SELECT * FROM messages WHERE sender_id = '${agent_id}' OR recipient_id = '${agent_id}' ORDER BY timestamp ASC`;
    }

    const messages = queryDb(sql);
    return NextResponse.json({ messages });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { recipient_id, content, sender_id = 'winston' } = body;

    if (!recipient_id || !content) {
      return NextResponse.json({ error: 'recipient_id and content are required' }, { status: 400 });
    }

    const msgId = `msg_${Date.now()}`;
    const timestamp = new Date().toISOString();

    const success = runDb(`
      INSERT INTO messages (id, thread_id, sender_id, recipient_id, content, timestamp, is_read)
      VALUES ('${msgId}', 'human_chat_${recipient_id}', '${sender_id}', '${recipient_id}', '${content.replace(/'/g, "''")}', '${timestamp}', 0)
    `);

    // Emit event for real-time bus
    runDb(`
      INSERT INTO events (id, type, source, payload, timestamp)
      VALUES ('evt_${Date.now()}', 'message.sent', 'human_dashboard', '${JSON.stringify({ msgId, sender_id, recipient_id, content })}', '${timestamp}')
    `);

    return NextResponse.json({ success, message: { id: msgId, sender_id, recipient_id, content, timestamp } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
