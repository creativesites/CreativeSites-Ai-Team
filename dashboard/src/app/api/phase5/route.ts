import { queryDb, runDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const projects = queryDb(`SELECT * FROM projects ORDER BY created_at DESC`);
    const milestones = queryDb(`SELECT * FROM milestones ORDER BY created_at DESC`);
    const metrics = queryDb(`SELECT * FROM automation_metrics ORDER BY recorded_at DESC LIMIT 50`);
    const learnings = queryDb(`SELECT * FROM memory_snippets ORDER BY updated_at DESC LIMIT 50`);
    const provenance = queryDb(`SELECT * FROM provenance_log ORDER BY timestamp DESC LIMIT 50`);

    return NextResponse.json({
      projects,
      milestones,
      metrics,
      learnings,
      provenance,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
