const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { initMyaOS, EVIDENCE_CLASSES } = require('../src');

test('Autonomous Chain Proof: Real OS Processes, Actual Artifacts, Independent Verification, and Downstream Handoff', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_chain_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });

  // 1. Register agents
  myaos.registry.registerAgent({
    id: 'atlas',
    name: 'Atlas',
    capabilities: ['platform', 'core']
  });

  myaos.registry.registerAgent({
    id: 'kael',
    name: 'Kael',
    capabilities: ['qa', 'verification']
  });

  myaos.registry.registerAgent({
    id: 'iris',
    name: 'Iris',
    capabilities: ['dashboard', 'telemetry']
  });

  // 2. Create upstream and downstream tasks
  const task1 = myaos.taskManager.createTask({
    id: 'TASK_CHAIN_001',
    title: 'Produce Machine Artifact Proof',
    required_capabilities: ['platform'],
    dependencies: []
  });

  const task2 = myaos.taskManager.createTask({
    id: 'TASK_CHAIN_002',
    title: 'Downstream Consumer Task',
    required_capabilities: ['dashboard'],
    dependencies: ['TASK_CHAIN_001']
  });

  // Route task1 to Atlas, task2 to Iris
  myaos.taskManager.assignTask(task1.id, 'Atlas');
  myaos.taskManager.assignTask(task2.id, 'Iris');
  // Mark task2 as BLOCKED awaiting task1
  task2.status = 'BLOCKED';
  myaos.taskManager.save();

  assert.equal(myaos.taskManager.getTask(task2.id).status, 'BLOCKED');

  // 3. Spawn REAL OS process worker for Agent A (Atlas)
  const binPath = path.resolve(__dirname, '../bin/myaos.js');
  const artifactDir = path.join(tmpDir, 'data/artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const proofFile = path.join(artifactDir, 'task_chain_001_proof.json');

  const workerRun = spawnSync(process.execPath, [
    binPath,
    'worker',
    '--agent',
    'Atlas',
    '--task',
    task1.id
  ], {
    cwd: tmpDir,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: path.resolve(__dirname, '../node_modules') }
  });

  // Confirm worker executed as a real process and exited with 0
  assert.equal(workerRun.status, 0, `Worker failed: ${workerRun.stderr || workerRun.stdout}`);
  assert.match(workerRun.stdout, /Started real process worker for @Atlas/);
  assert.match(workerRun.stdout, /Generated artifact at/);

  // 4. Verify machine evidence of worker output
  assert.ok(fs.existsSync(proofFile), 'Proof artifact must physically exist on disk');
  const artifactContent = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
  assert.equal(artifactContent.task_id, task1.id);
  assert.equal(artifactContent.worker, 'Atlas');
  assert.ok(artifactContent.pid > 0, 'Real process PID must be recorded');

  // Reload task state after worker completion
  myaos.taskManager.data = myaos.taskManager.load();
  const taskAfterWork = myaos.taskManager.getTask(task1.id);
  assert.equal(taskAfterWork.status, 'VERIFICATION');

  // 5. Verifier Agent (Kael) executes independent machine verification
  // Runs an independent test verifying JSON structure and validity
  const verificationResult = myaos.verifier.verifyTaskArtifacts(task1.id, 'Kael', {
    requiredFiles: [proofFile],
    testCommand: `node -e "const data = require('${proofFile}'); if (!data.pid || data.status !== 'SUCCESS') process.exit(1);"`,
    cwd: tmpDir
  });

  assert.equal(verificationResult.status, 'VERIFIED');
  assert.equal(verificationResult.passed, true);
  assert.equal(verificationResult.resolution, 'RESOLVED_PASS');
  assert.equal(verificationResult.exit_code, 0);
  assert.equal(verificationResult.evidenceClass, EVIDENCE_CLASSES.VERIFIED);

  // 6. Confirm task1 is marked DONE
  const finalTask1 = myaos.taskManager.getTask(task1.id);
  assert.equal(finalTask1.status, 'DONE');
  assert.ok(finalTask1.verification_evidence);
  assert.equal(finalTask1.verification_evidence.verified_by, 'Kael');

  // 7. Trigger orchestrator or verify downstream task unblocking
  myaos.eventBus.emit('verification.passed', 'Kael', { taskId: task1.id });

  const finalTask2 = myaos.taskManager.getTask(task2.id);
  assert.equal(finalTask2.status, 'TODO', 'Downstream task must automatically unblock to TODO');

  // 8. Verify immutable provenance audit trail
  const recentProvenance = myaos.provenance.getRecentRecords(10);
  assert.ok(recentProvenance.length >= 3);
  const verifyProv = recentProvenance.find(p => p.operation === 'TASK_VERIFICATION');
  assert.ok(verifyProv);
  assert.equal(verifyProv.actor, 'Kael');
  assert.equal(verifyProv.evidence_class, EVIDENCE_CLASSES.VERIFIED);
});
