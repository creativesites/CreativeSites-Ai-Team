const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { initMyaOS, EVIDENCE_CLASSES } = require('../src');
const ProofBundleEngine = require('../src/chain/proofBundle');
const RuntimeSession = require('../src/runtime/session');

test('Failure Experiment 1: Runtime fails to start (invalid binary/command) -> Reports WAKE_FAILED', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_fail_1_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  // Overwrite command with a nonexistent path
  const res = await myaos.runtime.processAdapter.start('broken_agent', {
    command: '/path/to/nonexistent/node_binary_xyz_123'
  });

  assert.ok(res.child);
  // Child emits error and session marks ERROR
  await new Promise(resolve => setTimeout(resolve, 50));
  const status = await myaos.runtime.processAdapter.status('broken_agent');
  assert.ok(status.status === 'ERROR' || status.status === 'TERMINATED' || status.status === 'NOT_OBSERVED');
  assert.notEqual(status.status, 'ACTIVE');
});

test('Failure Experiment 2: Runtime starts but never registers -> Handshake verification fails', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_fail_2_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const fakeRuntimeId = 'rt_never_registers_' + Date.now();
  
  // Registration never completed
  const isReg = myaos.runtime.handshakeManager.isRegistered(fakeRuntimeId);
  assert.equal(isReg, false);

  const session = myaos.runtime.handshakeManager.getVerifiedSession(fakeRuntimeId);
  assert.equal(session, null);
});

test('Failure Experiment 3: Runtime registers with wrong identity (forged token) -> REJECTED', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_fail_3_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const runtimeId = 'rt_auth_test_' + Date.now();
  const legitimateToken = myaos.runtime.handshakeManager.issueToken({
    runtime_id: runtimeId,
    agent_id: 'Atlas'
  });

  // Attempt to register with forged token
  const forgedResult = myaos.runtime.registerRuntime({
    runtime_id: runtimeId,
    agent_id: 'Atlas',
    handshake_token: 'forged_bad_token_12345',
    pid: process.pid
  });

  assert.equal(forgedResult.success, false);
  assert.match(forgedResult.reason, /HANDSHAKE_TOKEN_MISMATCH/);

  // Attempt to register with wrong agent identity
  const identityMismatchResult = myaos.runtime.registerRuntime({
    runtime_id: runtimeId,
    agent_id: 'ImposterAgent',
    handshake_token: legitimateToken,
    pid: process.pid
  });

  assert.equal(identityMismatchResult.success, false);
  assert.match(identityMismatchResult.reason, /IDENTITY_MISMATCH/);
});

test('Failure Experiment 4: PID dies during task -> Machine status transitions to TERMINATED / Dead', async (t) => {
  const session = new RuntimeSession({
    agent_id: 'transient_worker',
    pid: 9999999, // Dead PID
    status: 'ACTIVE'
  });

  assert.equal(session.isAlive(), false);
  assert.equal(session.toJSON().machine_alive, false);
});

test('Failure Experiment 5: Task claims completion but artifact is missing on disk -> Fails verification', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_fail_5_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const task = myaos.taskManager.createTask({
    id: 'TASK_MISSING_PROOF',
    title: 'Phantom Artifact Task'
  });

  myaos.taskManager.completeTask(task.id, 'ClaimingWorker', ['missing_proof_file.json']);

  const evidence = myaos.verifier.verifyTaskArtifacts(task.id, 'Verifier', {
    requiredFiles: ['missing_proof_file.json'],
    cwd: tmpDir
  });

  assert.equal(evidence.status, 'FAILED');
  assert.equal(evidence.resolution, 'RESOLVED_FAIL');
  assert.equal(evidence.passed, false);
  assert.match(evidence.reason, /MISSING_ARTIFACTS/);
});

test('Failure Experiment 6: Artifact content changes (hash mismatch) -> Proof bundle verification detects tampering', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_fail_6_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const proofEngine = new ProofBundleEngine(tmpDir);
  const testFile = path.join(tmpDir, 'legit_artifact.txt');
  fs.writeFileSync(testFile, 'Original authentic content', 'utf8');

  const bundleRes = proofEngine.createBundle({
    taskId: 'TASK_TAMPER_TEST',
    taskTitle: 'Tamper Detection',
    creator: 'Orchestrator',
    workerAgent: 'WorkerA',
    workerRuntime: 'rt_123',
    workerPid: process.pid,
    claimedAt: new Date().toISOString(),
    artifacts: [testFile],
    completedAt: new Date().toISOString(),
    verifierAgent: 'VerifierB',
    verifierRuntime: 'rt_456',
    verifierPid: process.pid,
    verificationCommand: 'echo ok',
    verificationExitCode: 0,
    verifiedAt: new Date().toISOString()
  });

  // Verify before tampering
  const cleanCheck = proofEngine.verifyBundle(bundleRes.bundle_path);
  assert.equal(cleanCheck.verified, true);

  // Alter artifact file on disk
  fs.appendFileSync(testFile, '\nMalicious unauthorized edit', 'utf8');

  // Verify after tampering
  const tamperedCheck = proofEngine.verifyBundle(bundleRes.bundle_path);
  assert.equal(tamperedCheck.verified, false);
  assert.match(tamperedCheck.reason, /ARTIFACT_TAMPERED/);
});

test('Failure Experiment 7: Downstream runtime unavailable -> Task remains blocked/unresolved safely', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_fail_7_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const task = myaos.taskManager.createTask({
    id: 'TASK_DOWNSTREAM_UNAVAIL',
    title: 'Awaiting unavailable agent',
    required_capabilities: ['nonexistent_specialty']
  });

  assert.throws(() => {
    myaos.taskManager.routeTaskByCapabilities(task.id);
  }, /No available agent found matching capabilities/);
});

test('Failure Experiment 8: Independent Verifier unavailable -> Verification fails toward UNRESOLVED', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_fail_8_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const task = myaos.taskManager.createTask({
    id: 'TASK_NO_VERIFIER',
    title: 'Verifier unassigned'
  });

  myaos.taskManager.completeTask(task.id, 'WorkerA', []);

  // When no test command and no files are provided (verifier absent)
  const evidence = myaos.verifier.verifyTaskArtifacts(task.id, 'MissingVerifier', {
    requiredFiles: [],
    testCommand: null,
    cwd: tmpDir
  });

  assert.equal(evidence.status, 'UNKNOWN');
  assert.equal(evidence.resolution, 'UNRESOLVED');
  assert.equal(evidence.passed, false);
  assert.equal(myaos.taskManager.getTask(task.id).status, 'UNRESOLVED');
});

test('Failure Experiment 9: Verifier attempts self-verification -> REJECTED', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_fail_9_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const task = myaos.taskManager.createTask({
    id: 'TASK_SELF_CHECK',
    title: 'Self-verification attempt'
  });

  myaos.taskManager.completeTask(task.id, 'SelfVerifier', []);

  const evidence = myaos.verifier.verifyTaskArtifacts(task.id, 'SelfVerifier', {
    testCommand: 'node -e "process.exit(0)"',
    cwd: tmpDir
  });

  assert.equal(evidence.status, 'UNKNOWN');
  assert.equal(evidence.resolution, 'UNRESOLVED');
  assert.match(evidence.reason, /SELF_VERIFICATION_REJECTED/);
});

test('Failure Experiment 10: Duplicate event delivery (idempotency check)', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_fail_10_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const task = myaos.taskManager.createTask({
    id: 'TASK_IDEMPOTENT',
    title: 'Idempotency test'
  });

  // Assign task first time
  myaos.taskManager.assignTask(task.id, 'Atlas');
  const firstStatus = myaos.taskManager.getTask(task.id).status;

  // Re-assigning or delivering duplicate assignment does not corrupt state
  myaos.taskManager.assignTask(task.id, 'Atlas');
  const secondStatus = myaos.taskManager.getTask(task.id).status;

  assert.equal(firstStatus, secondStatus);
});

test('Failure Experiment 11: Stale runtime registration purged when PID dies', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_fail_11_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const deadPid = 9999998;
  const runtimeId = 'rt_stale_' + Date.now();

  const token = myaos.runtime.handshakeManager.issueToken({
    runtime_id: runtimeId,
    agent_id: 'StaleWorker'
  });

  // Attempting to register dead PID must fail
  const regRes = myaos.runtime.handshakeManager.verifyAndRegister({
    runtime_id: runtimeId,
    agent_id: 'StaleWorker',
    handshake_token: token,
    pid: deadPid
  });

  assert.equal(regRes.success, false);
  assert.match(regRes.reason, /PROCESS_NOT_FOUND/);
});

test('Failure Experiment 12: Stale / Expired Handshake Token -> Expiry check fails registration', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_fail_12_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const runtimeId = 'rt_expired_' + Date.now();

  // Issue token with 1 millisecond TTL
  const token = myaos.runtime.handshakeManager.issueToken({
    runtime_id: runtimeId,
    agent_id: 'FastWorker',
    ttlMs: 1
  });

  // Wait 10ms so it expires
  await new Promise(resolve => setTimeout(resolve, 10));

  const regRes = myaos.runtime.registerRuntime({
    runtime_id: runtimeId,
    agent_id: 'FastWorker',
    handshake_token: token,
    pid: process.pid
  });

  assert.equal(regRes.success, false);
  assert.match(regRes.reason, /HANDSHAKE_TOKEN_EXPIRED/);
});
