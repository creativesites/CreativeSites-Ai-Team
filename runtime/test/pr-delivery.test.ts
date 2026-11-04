// WP5 5.3: delivering a job as a draft pull request. A local bare repo stands in for GitHub and a
// fake `gh` records its arguments and prints a URL, so no network is used.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-pr-'));
const workRoot = path.join(dir, 'work');
const repoDir = path.join(workRoot, 'repo');
const remoteDir = path.join(dir, 'remote.git');
const binDir = path.join(dir, 'bin');
const ghLog = path.join(dir, 'gh-args.json');
const fixture = new URL('./fixtures/fake-acp-agent.mjs', import.meta.url).pathname;
const oldPath = process.env.PATH;
let rt: RunningRuntime;
let roomId = '';

const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, { method, headers: { Authorization: `Bearer ${rt.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};
const waitFor = async <T>(fn: () => Promise<T | null>, ms = 30_000): Promise<T> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('timed out');
};

before(async () => {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'gh'), `#!/usr/bin/env node\nrequire('fs').writeFileSync(${JSON.stringify(ghLog)}, JSON.stringify(process.argv.slice(2)));\nconsole.log('https://github.com/example/repo/pull/42');\n`, { mode: 0o755 });
  process.env.PATH = `${binDir}${path.delimiter}${oldPath}`;
  execFileSync('git', ['init', '--quiet', '--bare', remoteDir]);
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# repo\n');
  execFileSync('git', ['init', '--quiet', '-b', 'main', repoDir]);
  execFileSync('git', ['-C', repoDir, 'add', '.']);
  execFileSync('git', ['-C', repoDir, '-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '--quiet', '-m', 'init']);
  execFileSync('git', ['-C', repoDir, 'remote', 'add', 'origin', remoteDir]);
  rt = await startRuntime({ dbPath: path.join(dir, 'runtime.db'), workspaceRoots: [workRoot], worktreeRoot: path.join(dir, 'worktrees'), artifactsDir: path.join(dir, 'artifacts'), teamRepo: null });
  await call('POST', '/v1/import/identities', { owner: { id: 'winston', name: 'Winston' }, identities: [{ id: 'atlas', name: 'Atlas' }] });
  rt.repo.updateIdentity('atlas', { adapterId: 'fake' });
  await call('POST', '/v1/adapters/fake', { command: process.execPath, args: [fixture], enabled: true });
  const attached = await call('POST', '/v1/projects/attach', { path: repoDir, name: 'PR Project' });
  roomId = (await call('POST', '/v1/rooms', { name: 'pr-room', projectId: attached.json.project.id })).json.id;
});

after(async () => {
  process.env.PATH = oldPath;
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ship with strategy pr pushes the job branch and records the draft PR as evidence', async () => {
  const job = (await call('POST', '/v1/jobs', { roomId, title: 'Add created file', brief: 'Create a file', createdBy: 'winston', criteria: ['File exists'] })).json;
  const s = await call('POST', `/v1/jobs/${job.id}/sessions`, { agentId: 'atlas', adapterId: 'fake', prompt: 'create a file' });
  assert.equal(s.status, 202);
  await waitFor(async () => ((await call('GET', `/v1/sessions/${s.json.id}`)).json.state === 'idle' ? true : null));

  const shipped = await call('POST', `/v1/jobs/${job.id}/ship`, { strategy: 'pr', actorId: 'winston' });
  assert.equal(shipped.status, 200, JSON.stringify(shipped.json));
  assert.equal(shipped.json.prUrl, 'https://github.com/example/repo/pull/42');
  assert.equal(shipped.json.job.shipStatus, 'pr_opened');
  assert.match(shipped.json.evidence.summary, /Pull request opened: https:\/\/github.com\/example\/repo\/pull\/42/);

  const branches = execFileSync('git', ['--git-dir', remoteDir, 'branch', '--list'], { encoding: 'utf8' });
  assert.match(branches, new RegExp(`myaos/job-${job.number}`), 'job branch pushed to the remote');
  const args = JSON.parse(fs.readFileSync(ghLog, 'utf8')) as string[];
  assert.deepEqual(args.slice(0, 3), ['pr', 'create', '--draft']);
  assert.ok(args.includes('--head') && args[args.indexOf('--head') + 1] === `myaos/job-${job.number}`);
  assert.ok(!fs.existsSync(path.join(repoDir, 'created.txt')), 'a PR delivery does not merge into the base branch');
});
