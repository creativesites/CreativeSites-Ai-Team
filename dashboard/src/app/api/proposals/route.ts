import { queryDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const proposals = queryDb(`SELECT * FROM proposals ORDER BY ts DESC`);
    return NextResponse.json({ proposals });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
