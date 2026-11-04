#!/usr/bin/env node
'use strict';
/**
 * Knowledge & Intelligence RPC bridge.
 *   echo '{"method":"overview","params":{}}' | node bin/ki-rpc.js
 * Reads one JSON request from stdin, writes {ok,result|error} to stdout. Used by the Tauri desktop
 * (command `myaos_knowledge_call`) so Node remains the single implementation of all KI rules.
 * Config via env: KI_USER, KI_ROLE, KI_ORG, KI_DB_PATH, MYAOS_DB_PATH (read-only work database).
 */
const path = require('path');
const { createKnowledgeSystem } = require('../src/knowledge');
const { handle, safe } = require('../src/knowledge/rpc');
const { SqliteWorkPort, StaticWorkPort } = require('../src/knowledge/work/port');

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let ki;
  try {
    const req = JSON.parse(raw || '{}');
    const baseDir = path.resolve(__dirname, '..');
    const runtimeDb = process.env.MYAOS_DB_PATH || path.join(baseDir, 'data', 'myaos.db');
    const work = require('fs').existsSync(runtimeDb) ? new SqliteWorkPort(runtimeDb) : new StaticWorkPort();
    ki = createKnowledgeSystem({ baseDir, work, dbPath: process.env.KI_DB_PATH || undefined });
    const result = await handle(ki, req);
    process.stdout.write(JSON.stringify({ ok: true, result: safe(result) }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: { code: e.code || 'ERROR', message: e.message, details: e.details } }));
    process.exitCode = 0; // the envelope carries the error; a non-zero exit would hide the code from the caller
  } finally { if (ki) ki.close(); }
}
main();
