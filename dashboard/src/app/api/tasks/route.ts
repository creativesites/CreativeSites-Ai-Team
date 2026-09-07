import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = getDb();
    const tasks = db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`).all();
    db.close();
    return NextResponse.json({ tasks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
