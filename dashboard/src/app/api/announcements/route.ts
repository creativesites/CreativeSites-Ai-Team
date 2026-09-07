import { queryDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const announcements = queryDb(`SELECT * FROM announcements ORDER BY ts DESC`);
    return NextResponse.json({ announcements });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
