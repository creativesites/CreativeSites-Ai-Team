import { queryDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const incidents = queryDb(`
      SELECT i.*, t.title as task_title
      FROM incidents i
      LEFT JOIN tasks t ON i.related_task_id = t.id
      ORDER BY CASE i.severity WHEN 'P0' THEN 1 WHEN 'P1' THEN 2 WHEN 'P2' THEN 3 ELSE 4 END, i.opened_at DESC
    `);
    return NextResponse.json({ incidents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
