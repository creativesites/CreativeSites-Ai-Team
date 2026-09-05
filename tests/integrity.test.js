const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { initMyaOS } = require('../src');

test('Adversarial Test 1: Empty Evidence Rejection -> Fails toward UNKNOWN/UNRESOLVED', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_integrity_1_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const task = myaos.taskManager.createTask({
    id: 'TASK_TEST_EMPTY',
    title: 'Claimed Completion With Zero Evidence',
    required_capabilities: ['security']
  });

  myaos.taskManager.completeTask(task.id, 'ClaimingAgent', []);
  const evidence = myaos.verifier.verifyTaskArtifacts(task.id, 'Verifier', {
    requiredFiles: [],
    testCommand: null,
    cwd: tmpDir
  });

  assert.equal(evidence.status, 'UNKNOWN');
  assert.equal(evidence.resolution, 'UNRESOLVED');
  assert.equal(evidence.passed, false);
  assert.equal(myaos.taskManager.getTask(task.id).status, 'UNRESOLVED');
});

test('Adversarial Test 2: Wake Token Alone Does NOT Yield ACTIVE', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_integrity_2_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  // Use a non-existent socket dir so no live session is detected
  const fakeSockDir = path.join(tmpDir, 'empty_socks');
  fs.mkdirSync(fakeSockDir, { recursive: true });

  const myaos = initMyaOS({ baseDir: tmpDir });
  myaos.runtime.sockDir = fakeSockDir;

  myaos.registry.registerAgent({
    id: 'lyra',
    name: 'Lyra',
    capabilities: ['mobile']
  });

  // Wake agent when no runtime session exists
  const wakeResult = myaos.runtime.wakeAgent('Lyra', 'TASK_DISPATCH');

  // Must report WAKE_REQUESTED_OFFLINE, NOT ACTIVE or WORKING!
  assert.equal(wakeResult.status, 'WAKE_REQUESTED_OFFLINE');
  assert.equal(wakeResult.live_session_observed, false);
  assert.equal(wakeResult.session, null);
});

test('Adversarial Test 3: Failed Command Execution -> Fails toward RESOLVED_FAIL / BLOCKED', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_integrity_3_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const task = myaos.taskManager.createTask({
    id: 'TASK_TEST_FAIL',
    title: 'Failing Command Execution',
    required_capabilities: ['core']
  });

  myaos.taskManager.completeTask(task.id, 'Worker', []);
  const evidence = myaos.verifier.verifyTaskArtifacts(task.id, 'Verifier', {
    testCommand: 'node -e "console.error(\'Error: Simulated failure\'); process.exit(2)"',
    cwd: tmpDir
  });

  assert.equal(evidence.status, 'FAILED');
  assert.equal(evidence.resolution, 'RESOLVED_FAIL');
  assert.equal(evidence.passed, false);
  assert.equal(evidence.exit_code, 2);
  assert.equal(myaos.taskManager.getTask(task.id).status, 'BLOCKED');
});

test('Adversarial Test 4: Missing Required Artifact Files -> Fails verification', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_integrity_4_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const task = myaos.taskManager.createTask({
    id: 'TASK_TEST_MISSING_FILES',
    title: 'Claimed Artifact Not On Disk',
    required_capabilities: ['core']
  });

  myaos.taskManager.completeTask(task.id, 'Worker', ['nonexistent_artifact.js']);
  const evidence = myaos.verifier.verifyTaskArtifacts(task.id, 'Verifier', {
    requiredFiles: ['nonexistent_artifact.js'],
    cwd: tmpDir
  });

  assert.equal(evidence.status, 'FAILED');
  assert.equal(evidence.passed, false);
  assert.ok(evidence.missing_files.includes('nonexistent_artifact.js'));
  assert.equal(myaos.taskManager.getTask(task.id).status, 'BLOCKED');
});
