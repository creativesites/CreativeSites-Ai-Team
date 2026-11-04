#!/usr/bin/env node
// WP0-T10: read-only truth pass on the live v2 store. Run it on the owner's Mac:
//
//   node runtime/scripts/truth-pass.ts > ~/Desktop/myaos-truth-pass.md
//
// It opens the store read-only and prints counts and failure reasons as
// markdown. It writes nothing. Review the output before sharing it: session
// errors can quote prompt text.

import { DatabaseSync } from 'node:sqlite';
import { runtimeDbPath } from '../src/config.ts';
import { tableCounts } from '../src/store/backup.ts';

const dbPath = runtimeDbPath();
const db = new DatabaseSync(dbPath, { readOnly: true });
const all = (sql: string) => {
  try {
    return db.prepare(sql).all() as Record<string, unknown>[];
  } catch (e) {
    return [{ error: (e as Error).message }];
  }
};
const table = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '_none_\n';
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 160);
  return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${cols.map((c) => esc(r[c])).join(' | ')} |`)].join('\n') + '\n';
};

const out: string[] = [];
out.push(`# MyaOS truth pass\n\nStore: \`${dbPath}\` · read at ${new Date().toISOString()} · schema v${(all('SELECT MAX(version) AS v FROM schema_migrations')[0] as { v?: number })?.v ?? '?'}\n`);
out.push('## Row counts\n');
out.push(table(Object.entries(tableCounts(db)).map(([t, c]) => ({ table: t, rows: c }))));
out.push('## Sessions by state\n');
out.push(table(all('SELECT state, COUNT(*) AS n FROM sessions GROUP BY state ORDER BY n DESC')));
out.push('## Failed sessions: error reasons\n');
out.push(table(all("SELECT adapter_id, substr(COALESCE(error, '(no error recorded)'), 1, 160) AS error, COUNT(*) AS n, MAX(started_at) AS last FROM sessions WHERE state = 'failed' GROUP BY adapter_id, error ORDER BY n DESC LIMIT 20")));
out.push('## Jobs by stage\n');
out.push(table(all('SELECT stage, COUNT(*) AS n, MAX(updated_at) AS last_update FROM jobs GROUP BY stage')));
out.push('## Open jobs (needs a decision: plan or cancel)\n');
out.push(table(all("SELECT number, title, stage, created_at FROM jobs WHERE stage NOT IN ('done','cancelled') ORDER BY created_at")));
out.push('## Schedules\n');
out.push(table(all('SELECT kind, COUNT(*) AS n FROM agent_schedules GROUP BY kind')));
out.push('## Stand-ups (latest 5)\n');
out.push(table(all('SELECT * FROM standups ORDER BY rowid DESC LIMIT 5').map((r) => ({ id: r.id, date: r.standup_date ?? r.date ?? r.created_at, team: r.team_id ?? '' }))));
out.push('## Adapters and rate limits\n');
out.push(table(all('SELECT id, rate_limit_reset_at, rate_limit_reason FROM adapters')));
console.log(out.join('\n'));
db.close();
