const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { initMyaOS, EVIDENCE_CLASSES } = require('../src');

test('Autonomous Chain Proof: Real OS Process Worker, Cryptographic Handshake, Artifact Hashing, Independent Verification, and Proof Bundle', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_chain_proof_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
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

  // 2. Create upstream task and downstream dependent task
  const task1 = myaos.taskManager.createTask({
    id: 'TASK_AUTONOMOUS_001',
    title: 'Autonomous System Execution Proof',
    required_capabilities: ['platform']
  });

  const task2 = myaos.taskManager.createTask({
    id: 'TASK_AUTONOMOUS_002',
    title: 'Downstream Telemetry Ingestion',
    required_capabilities: ['dashboard'],
    dependencies: [task1.id]
  });

  myaos.taskManager.assignTask(task1.id, 'Atlas');
  myaos.taskManager.assignTask(task2.id, 'Iris');
  task2.status = 'BLOCKED';
  myaos.taskManager.save();

  assert.equal(myaos.taskManager.getTask(task2.id).status, 'BLOCKED');

  // 3. Issue cryptographic handshake token for Atlas
  const workerRuntimeId = `rt_proc_atlas_${Date.now()}`;
  const handshakeToken = myaos.runtime.handshakeManager.issueToken({
    runtime_id: workerRuntimeId,
    agent_id: 'Atlas',
    runtime_type: 'REAL_PROCESS'
  });

  assert.ok(handshakeToken, 'Cryptographic handshake token must be issued');

  // 4. Launch real OS child process worker for Atlas
  const binPath = path.resolve(__dirname, '../bin/myaos.js');
  const claimedAt = new Date().toISOString();

  const workerRun = spawnSync(process.execPath, [
    binPath,
    'worker',
    '--agent',
    'Atlas',
    '--task',
    task1.id,
    '--runtime-id',
    workerRuntimeId,
    '--handshake-token',
    handshakeToken
  ], {
    cwd: tmpDir,
    encoding: 'utf8',
    env: { ...process.env, MYAOS_BASE_DIR: tmpDir }
  });

  assert.equal(workerRun.status, 0, `Worker failed: ${workerRun.stderr || workerRun.stdout}`);
  assert.match(workerRun.stdout, /Started real process worker for @Atlas/);
  assert.match(workerRun.stdout, /Claiming and executing task TASK_AUTONOMOUS_001/);

  // 5. Verify machine artifact existence & hash
  const artifactPath = path.join(tmpDir, 'data/artifacts/task_autonomous_001_proof.json');
  assert.ok(fs.existsSync(artifactPath), 'Artifact must physically exist on disk');
  const artifactContent = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  assert.equal(artifactContent.task_id, task1.id);
  assert.equal(artifactContent.worker, 'Atlas');
  assert.ok(artifactContent.pid > 0, 'Real process PID must be present in artifact');

  const completedAt = new Date().toISOString();

  // Reload task state after worker completion
  myaos.taskManager.data = myaos.taskManager.load();
  const taskAfterWork = myaos.taskManager.getTask(task1.id);
  assert.equal(taskAfterWork.status, 'VERIFICATION');

  // 6. Independent Verifier (Kael) executes machine verification
  const verifierRuntimeId = `rt_proc_kael_${Date.now()}`;
  const verifierPid = process.pid;

  const verifCommand = `node -e "const d = require('${artifactPath}'); if (d.status !== 'SUCCESS' || !d.pid) process.exit(1);"`;
  const evidence = myaos.verifier.verifyTaskArtifacts(task1.id, 'Kael', {
    requiredFiles: [artifactPath],
    testCommand: verifCommand,
    cwd: tmpDir
  });

  assert.equal(evidence.status, 'VERIFIED');
  assert.equal(evidence.passed, true);
  assert.equal(evidence.resolution, 'RESOLVED_PASS');
  assert.equal(evidence.exit_code, 0);
  assert.equal(evidence.evidenceClass, EVIDENCE_CLASSES.VERIFIED);

  const verifiedAt = new Date().toISOString();

  // 7. Generate full cryptographic Proof Bundle
  const bundleResult = myaos.proofBundle.createBundle({
    taskId: task1.id,
    taskTitle: task1.title,
    creator: task1.creator,
    workerAgent: 'Atlas',
    workerRuntime: workerRuntimeId,
    workerPid: artifactContent.pid,
    claimedAt,
    artifacts: [artifactPath],
    completedAt,
    verifierAgent: 'Kael',
    verifierRuntime: verifierRuntimeId,
    verifierPid,
    verificationCommand: verifCommand,
    verificationExitCode: evidence.exit_code,
    verificationOutput: evidence.command_output,
    verifiedAt,
    downstreamTaskId: task2.id
  });

  assert.ok(bundleResult.bundle_path);
  assert.ok(fs.existsSync(bundleResult.bundle_path));

  // 8. Independently verify the generated Proof Bundle from disk
  const bundleVerification = myaos.proofBundle.verifyBundle(bundleResult.bundle_path);
  assert.equal(bundleVerification.verified, true);
  assert.equal(bundleVerification.task_id, task1.id);
  assert.equal(bundleVerification.worker, 'Atlas');
  assert.equal(bundleVerification.verifier, 'Kael');

  // 9. Downstream handoff: trigger unblocking
  myaos.eventBus.emit('verification.passed', 'Kael', { taskId: task1.id });
  myaos.taskManager.data = myaos.taskManager.load();
  const finalTask2 = myaos.taskManager.getTask(task2.id);
  assert.equal(finalTask2.status, 'TODO', 'Downstream task must unblock upon verification');

  // 10. Verify immutable provenance audit trail
  const recentProvenance = myaos.provenance.getRecentRecords(10);
  assert.ok(recentProvenance.length >= 2);
  const verifyProv = recentProvenance.find(p => p.operation === 'TASK_VERIFICATION');
  assert.ok(verifyProv);
  assert.equal(verifyProv.actor, 'Kael');
  assert.equal(verifyProv.evidence_class, EVIDENCE_CLASSES.VERIFIED);
});
