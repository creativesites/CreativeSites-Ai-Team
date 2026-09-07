import { queryDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const standups = queryDb(`SELECT * FROM standups ORDER BY standup_date DESC, ts DESC`);
    return NextResponse.json({ standups });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
