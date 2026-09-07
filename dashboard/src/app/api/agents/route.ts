import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = getDb();
    const agents = db.prepare(`SELECT * FROM identities ORDER BY joined_at ASC`).all();
    db.close();
    return NextResponse.json({ agents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
