import { queryDb } from '@/lib/db';
import { execFileSync } from 'child_process';
import path from 'path';
import { NextResponse } from 'next/server';

const deployFleetDbPath = '/Users/winstonzulu/Documents/GitHub/DeployFleet-Team/tam-db/tam.db';

function queryDeployFleet(sql: string) {
  try {
    const stdout = execFileSync('sqlite3', ['-json', deployFleetDbPath, sql]).toString().trim();
    return stdout ? JSON.parse(stdout) : [];
  } catch (e: any) {
    console.error('queryDeployFleet error:', e.message);
    return [];
  }
}

export async function GET() {
  try {
    // 1. CreativeSites Org State
    const creativeSitesAgents = queryDb(`SELECT id, display_name, symbol, lane, observed_liveness, confidence_provenance FROM identities ORDER BY joined_at ASC`);
    const creativeSitesTasks = queryDb(`SELECT id, title, status, priority, assignee_id FROM tasks ORDER BY created_at DESC`);
    
    // 2. DeployFleet Org State
    const deployFleetAgents = queryDeployFleet(`SELECT id, role_id, display_name, lane, engine, model_tier, status FROM agents`);
    const deployFleetTasks = queryDeployFleet(`SELECT id, title, status, priority, assignee FROM tasks`);

    // 3. Bridge Health & Inter-Team Stats
    const bridgeStatus = {
      connected: deployFleetAgents.length > 0,
      deployFleetDbPath,
      creativeSites: {
        agent_count: creativeSitesAgents.length,
        task_count: creativeSitesTasks.length,
        open_tasks: creativeSitesTasks.filter((t: any) => t.status !== 'done').length
      },
      deployFleet: {
        agent_count: deployFleetAgents.length,
        task_count: deployFleetTasks.length,
        open_tasks: deployFleetTasks.filter((t: any) => t.status !== 'DONE').length
      }
    };

    return NextResponse.json({
      bridgeStatus,
      creativeSites: { agents: creativeSitesAgents, tasks: creativeSitesTasks },
      deployFleet: { agents: deployFleetAgents, tasks: deployFleetTasks }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
