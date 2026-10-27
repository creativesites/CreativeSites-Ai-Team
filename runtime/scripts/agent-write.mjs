#!/usr/bin/env node
// A supported write path for CLI/legacy agents: posts a message + Claimed
// evidence for a job through the runtime API. Use this instead of editing
// data/myaos.db directly.
//
//   node runtime/scripts/agent-write.mjs message --job JOB-142 --from atlas --body "Progress note"
//   node runtime/scripts/agent-write.mjs evidence --job JOB-142 --from kael \
//     --summary "Reviewed the diff" --kind review
//   node runtime/scripts/agent-write.mjs status

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const command = args[0] ?? 'status';
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const infoPath = process.env.MYAOS_RUNTIME_FILE ?? path.join(process.env.HOME ?? '', '.myaos', 'runtime.json');
let info;
try {
  info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
} catch {
  console.error(`No running runtime (${infoPath} missing). Start the MyaOS app first.`);
  process.exit(1);
}

const call = async (method, route, body) => {
  const res = await fetch(`${info.url}${route}`, {
    method,
    headers: { Authorization: `Bearer ${info.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status}: ${json?.error ?? 'unknown'}`);
  return json;
};

const jobArg = flag('job');
const from = (flag('from') ?? 'agent').replace(/^@/, '').toLowerCase();
const body = flag('body') ?? '';
const summary = flag('summary') ?? body.split('\n')[0] ?? '';
const kind = flag('kind') ?? 'message';

async function resolveJob() {
  if (!jobArg) throw new Error('--job is required (job id or JOB-<number>)');
  const jobs = await call('GET', '/v1/jobs?limit=1000');
  const asNumber = /^(?:JOB[-_ ]?)?(\d+)$/i.exec(jobArg);
  const job = jobs.find((j) => j.id === jobArg) ?? (asNumber ? jobs.find((j) => j.number === Number(asNumber[1])) : null);
  if (!job) throw new Error(`No job found for ${jobArg}`);
  return job;
}

try {
  if (command === 'status') {
    const summaryBody = await call('GET', '/v1/summary');
    console.log(JSON.stringify(summaryBody, null, 2));
  } else if (command === 'message' || command === 'evidence') {
    if (!body && command === 'message') throw new Error('--body is required for message');
    if (!summary) throw new Error('--summary or --body is required');
    const job = await resolveJob();
    if (command === 'message') {
      const message = await call('POST', `/v1/rooms/${job.roomId}/messages`, { authorId: from, authorKind: 'agent', body, jobId: job.id });
      console.log(`message ${message.id} posted to ${job.roomId}`);
    }
    const evidence = await call('POST', `/v1/jobs/${job.id}/evidence`, {
      kind,
      class: 'DECLARED',
      summary,
      payload: { source: 'agent-write', author: from, body },
      recordedBy: from,
      recordedByKind: 'agent',
    });
    console.log(`evidence ${evidence.id} recorded (Claimed) for JOB-${job.number}`);
  } else {
    console.error('commands: status | message | evidence');
    process.exit(1);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
