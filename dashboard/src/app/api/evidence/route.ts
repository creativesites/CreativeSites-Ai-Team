import { queryDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const evidence = queryDb(`
      SELECT e.*, t.title as task_title
      FROM evidence e
      LEFT JOIN tasks t ON e.task_id = t.id
      ORDER BY e.created_at DESC
    `);
    const summary = {
      total: evidence.length,
      verified: evidence.filter((e: any) => e.evidence_class === 'VERIFIED' && e.passed).length,
      declared: evidence.filter((e: any) => e.evidence_class === 'DECLARED').length,
      unknown: evidence.filter((e: any) => e.evidence_class === 'UNKNOWN').length,
      failed: evidence.filter((e: any) => !e.passed).length,
    };
    return NextResponse.json({ evidence, summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
