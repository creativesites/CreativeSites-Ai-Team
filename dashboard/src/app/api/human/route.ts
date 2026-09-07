import { queryDb, runDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const decisions = queryDb(`
      SELECT * FROM human_decisions 
      ORDER BY CASE urgency WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, requested_at DESC
    `);
    return NextResponse.json({ decisions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, decision, decided_by = 'winston', notes } = body;

    if (!id || !decision) {
      return NextResponse.json({ error: 'id and decision are required' }, { status: 400 });
    }

    const success = runDb(`
      UPDATE human_decisions 
      SET status = 'decided', decision = '${decision}', decided_by = '${decided_by}', decided_at = CURRENT_TIMESTAMP, notes = ${notes ? `'${notes}'` : 'NULL'}
      WHERE id = '${id}'
    `);

    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
