import { queryDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const events = queryDb(`SELECT * FROM events ORDER BY timestamp DESC LIMIT 30`);
    const provenance = queryDb(`SELECT * FROM provenance_log ORDER BY timestamp DESC LIMIT 30`);
    const messages = queryDb(`SELECT * FROM messages ORDER BY timestamp DESC LIMIT 30`);
    return NextResponse.json({ events, provenance, messages });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
