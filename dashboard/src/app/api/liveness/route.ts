import { queryDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import path from 'path';
import { execFileSync } from 'child_process';

export async function GET() {
  try {
    const baseDir = path.resolve(process.cwd(), '..');
    const dbPath = path.resolve(baseDir, 'data', 'myaos.db');
    const identityIds = queryDb(`SELECT id FROM identities ORDER BY joined_at ASC`).map((r: any) => r.id);

    // Call src/liveness.js using Node child_process - guaranteed to work across boundary
    const livenessScript = `
      const { observeAndRecord } = require('./src/liveness');
      const obs = observeAndRecord(${JSON.stringify(identityIds)}, ${JSON.stringify(dbPath)});
      console.log(JSON.stringify(obs));
    `;
    let observation: any = { checkedAt: new Date().toISOString(), sockets: [], agents: [] };
    try {
      const out = execFileSync(process.execPath, ['-e', livenessScript], { cwd: baseDir, encoding: 'utf8' });
      observation = JSON.parse(out.trim());
    } catch (e: any) {
      console.error('liveness execution error:', e.message);
    }

    const taskInfo = queryDb(`
      SELECT i.id, a.current_task_id, a.status as declared_status,
             t.title as current_task_title
      FROM identities i
      LEFT JOIN agents a ON a.identity_id = i.id
      LEFT JOIN tasks t ON t.id = a.current_task_id
    `);
    const taskById: Record<string, any> = {};
    for (const t of taskInfo) taskById[t.id] = t;

    const agents = observation.agents.map((a: any) => {
      const t = taskById[a.id] || {};
      return {
        id: a.id,
        observed_liveness: a.liveness,
        observed_evidence: a.evidence,
        observed_at: observation.checkedAt,
        observed_pid: a.pid,
        declared_status: t.declared_status || 'UNKNOWN',
        declared_current_task_id: t.current_task_id || null,
        declared_current_task_title: t.current_task_title || null,
      };
    });

    return NextResponse.json({
      checked_at: observation.checkedAt,
      sockets_seen: observation.sockets.map((s: any) => ({ pid: s.pid, alive: s.alive, cwd: s.cwd })),
      agents,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
