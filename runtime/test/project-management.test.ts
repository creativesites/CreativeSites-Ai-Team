import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startRuntime, type RunningRuntime } from '../src/app.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myaos-proj-'));
let rt: RunningRuntime;

const call = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${rt.url}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${rt.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
};

before(async () => {
  rt = await startRuntime({
    dbPath: path.join(dir, 'runtime.db'),
    allowedOrigins: ['http://localhost:1430'],
  });
});

after(async () => {
  await rt.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('1. project management: create, query, filter and update sprint project tasks', async () => {
  // Create project
  const projRes = await call('POST', '/v1/projects', {
    name: 'DeployFleet Mission Control',
    description: 'Autonomous deployment orchestration across AWS, GCP and Fly.io',
  });
  assert.equal(projRes.status, 201);
  const projId = projRes.json.id;

  // Create task 1 (open)
  const task1 = await call('POST', '/v1/project-tasks', {
    projectId: projId,
    title: 'Implement Health Probes for Docker Swarm',
    description: 'Ensure automated rollback if 3 consecutive health checks fail',
    assigneeId: 'astra',
    priority: 'high',
    status: 'open',
  });
  assert.equal(task1.status, 201);
  assert.equal(task1.json.title, 'Implement Health Probes for Docker Swarm');
  assert.equal(task1.json.status, 'open');
  assert.equal(task1.json.priority, 'high');
  assert.equal(task1.json.assigneeId, 'astra');

  // Create task 2 (in_progress)
  const task2 = await call('POST', '/v1/project-tasks', {
    projectId: projId,
    title: 'Migrate Redis Cluster to TLS',
    assigneeId: 'atlas',
    priority: 'urgent',
    status: 'in_progress',
  });
  assert.equal(task2.status, 201);

  // List all tasks
  const listAll = await call('GET', '/v1/project-tasks');
  assert.equal(listAll.status, 200);
  assert.ok(listAll.json.length >= 2);

  // Filter by projectId
  const listByProj = await call('GET', `/v1/project-tasks?projectId=${projId}`);
  assert.equal(listByProj.status, 200);
  assert.equal(listByProj.json.length, 2);

  // Filter by status
  const listOpen = await call('GET', `/v1/project-tasks?projectId=${projId}&status=open`);
  assert.equal(listOpen.status, 200);
  assert.equal(listOpen.json.length, 1);
  assert.equal(listOpen.json[0].id, task1.json.id);

  // Filter by assignee
  const listAstra = await call('GET', `/v1/project-tasks?assigneeId=astra`);
  assert.equal(listAstra.status, 200);
  assert.ok(listAstra.json.some((t: any) => t.id === task1.json.id));

  // Update status from open to in_review
  const updated = await call('PATCH', `/v1/project-tasks/${task1.json.id}`, {
    status: 'in_review',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.status, 'in_review');

  // Verify get single task
  const single = await call('GET', `/v1/project-tasks/${task1.json.id}`);
  assert.equal(single.status, 200);
  assert.equal(single.json.status, 'in_review');

  // Complete task 1
  await call('PATCH', `/v1/project-tasks/${task1.json.id}`, { status: 'done' });

  // Verify project task counts
  const projs = await call('GET', '/v1/projects');
  const foundProj = projs.json.find((p: any) => p.id === projId);
  assert.ok(foundProj);
  assert.equal(foundProj.taskCount, 2);
  assert.equal(foundProj.doneTaskCount, 1);

  // Delete task 2
  const del = await call('DELETE', `/v1/project-tasks/${task2.json.id}`);
  assert.equal(del.status, 204);

  const afterDel = await call('GET', `/v1/project-tasks/${task2.json.id}`);
  assert.equal(afterDel.status, 404);
});

test('2. strategic okrs: verify objectives, key results and progress update', async () => {
  const okrs = await call('GET', '/v1/okrs');
  assert.equal(okrs.status, 200);
  assert.ok(Array.isArray(okrs.json.objectives));
  assert.ok(Array.isArray(okrs.json.keyResults));

  // Create an objective
  const obj = await call('POST', '/v1/okrs/objectives', {
    title: 'Achieve Sub-second AI Response Pipeline',
    quarter: 'Q4-2026',
    status: 'on_track',
  });
  assert.equal(obj.status, 200);
  assert.ok(obj.json.id);

  // Create a key result
  const kr = await call('POST', '/v1/okrs/key-results', {
    objective_id: obj.json.id,
    title: 'P95 latency under 800ms across all endpoints',
    metric_type: 'numeric',
    target_value: 800,
    current_value: 1200,
    unit: 'ms',
  });
  assert.equal(kr.status, 200);
  assert.ok(kr.json.id);

  // Update progress
  const progressUpdate = await call('POST', `/v1/okrs/key-results/${kr.json.id}/progress`, {
    current_value: 750,
  });
  assert.equal(progressUpdate.status, 200);
  assert.equal(progressUpdate.json.keyResult.current_value, 750);
});
