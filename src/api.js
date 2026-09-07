const http = require('http');
const path = require('path');

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  // SQLite binary fallback or direct sqlite3 execution if needed
}

const { execFileSync } = require('child_process');

const dbPath = path.resolve(__dirname, '../data/myaos.db');

function queryDb(sql) {
  try {
    const stdout = execFileSync('sqlite3', ['-json', dbPath, sql]).toString().trim();
    return stdout ? JSON.parse(stdout) : [];
  } catch (e) {
    console.error('queryDb error:', e.message);
    return [];
  }
}

function runDb(sql, params = []) {
  if (Database) {
    const db = new Database(dbPath, { readonly: false });
    db.pragma('journal_mode = WAL');
    const info = db.prepare(sql).run(...params);
    db.close();
    return info;
  }
  return { changes: 0 };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/human' && req.method === 'GET') {
    const decisions = queryDb(`
      SELECT * FROM human_decisions 
      ORDER BY CASE urgency WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, requested_at DESC
    `);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ decisions }));
    return;
  }

  if (url.pathname === '/api/human' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, decision, decided_by = 'winston', notes } = JSON.parse(body || '{}');
        const info = runDb(`
          UPDATE human_decisions 
          SET status = 'decided', decision = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, notes = ?
          WHERE id = ?
        `, [decision, decided_by, notes || null, id]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, changes: info.changes }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/agents' && req.method === 'GET') {
    const agents = queryDb(`SELECT * FROM identities ORDER BY joined_at ASC`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents }));
    return;
  }

  if (url.pathname === '/api/tasks' && req.method === 'GET') {
    const tasks = queryDb(`SELECT * FROM tasks ORDER BY created_at DESC`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tasks }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

const PORT = process.env.PORT || 3700;
server.listen(PORT, () => {
  console.log(`[MyaOS API] Listening on http://localhost:${PORT}`);
});
