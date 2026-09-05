const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { initMyaOS, EVIDENCE_CLASSES } = require('../src');
const RuntimeSession = require('../src/runtime/session');

test('Adversarial 1: False Roster Rejection -> Rejects unauthorized or unverified agent lookups', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_adv_1_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const phantomAgent = myaos.registry.getAgent('FabricatedPhantom');
  assert.equal(phantomAgent, null);

  // Attempting to route a task requiring capabilities only a phantom has must fail safely
  const task = myaos.taskManager.createTask({
    id: 'TASK_GHOST',
    title: 'Task for Ghost',
    required_capabilities: ['telepathy', 'quantum-magic']
  });

  assert.throws(() => {
    myaos.taskManager.routeTaskByCapabilities(task.id);
  }, /No available agent found matching capabilities/);
});

test('Adversarial 2: Forged Provenance Rejection -> Unrecognized evidence class defaults to UNKNOWN', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_adv_2_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const record = myaos.provenance.record({
    actor: 'UntrustedActor',
    operation: 'FAKE_CLAIM',
    evidence_class: 'FORGED_SUPER_TRUE_CLAIM', // Invalid class
    evidence: { quote: 'Trust me, I am Atlas' }
  });

  assert.equal(record.evidence_class, EVIDENCE_CLASSES.UNKNOWN);
});

test('Adversarial 3 & 4: Stale Census & Socket Mismatch -> Fails toward UNKNOWN / CONFLICT', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_adv_3_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const fakeSockDir = path.join(tmpDir, 'empty_socks');
  fs.mkdirSync(fakeSockDir, { recursive: true });

  const myaos = initMyaOS({ baseDir: tmpDir, sockDir: fakeSockDir });
  
  // Register an agent with declared status LIVE (from a stale census)
  myaos.registry.registerAgent({
    id: 'stale_agent',
    name: 'StaleAgent',
    status: 'LIVE',
    observed_liveness: 'LIVE'
  });

  // Doctor diagnosis must detect declared vs observed conflict
  const diag = myaos.doctor.runDiagnostics();
  const epistemicCheck = diag.checks.find(c => c.category === 'Epistemics');
  assert.ok(epistemicCheck);
  assert.equal(epistemicCheck.passed, false);
  assert.match(epistemicCheck.details, /conflict/i);
});

test('Adversarial 5 & 6: Unexpected Registry Mutation -> Tamper detection via SHA-256 hash mismatch', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_adv_5_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  myaos.registry.registerAgent({ id: 'agent_one', name: 'AgentOne' });

  // Initial state is clean
  assert.equal(myaos.registry.detectTampering().tampered, false);

  // Directly tamper with community/agents.json on disk bypassing registry methods
  const rawPath = path.join(tmpDir, 'community/agents.json');
  fs.appendFileSync(rawPath, '/* unauthorized external write */', 'utf8');

  // Tamper detection triggers
  const tamperResult = myaos.registry.detectTampering();
  assert.equal(tamperResult.tampered, true);
  assert.notEqual(tamperResult.previous_hash, tamperResult.current_hash);
});

test('Adversarial 7: Duplicate CWD Detection -> Distinct agents cannot be identified by CWD alone', async (t) => {
  const session1 = new RuntimeSession({
    agent_id: 'atlas',
    pid: process.pid,
    cwd: '/same/repo/path',
    runtime_type: 'process'
  });

  const session2 = new RuntimeSession({
    agent_id: 'astra',
    pid: process.pid,
    cwd: '/same/repo/path',
    runtime_type: 'process'
  });

  // Identity and runtime_id must remain distinct despite sharing cwd
  assert.notEqual(session1.runtime_id, session2.runtime_id);
  assert.notEqual(session1.agent_id, session2.agent_id);
  assert.equal(session1.cwd, session2.cwd);
});

test('Adversarial 8: PID Reuse / Stale Session Detection -> Dead PID reports isAlive = false', async (t) => {
  // Use a PID that does not exist on the machine (e.g. 9999999)
  const deadSession = new RuntimeSession({
    agent_id: 'kael',
    pid: 9999999,
    cwd: process.cwd(),
    runtime_type: 'process'
  });

  assert.equal(deadSession.isAlive(), false);
  assert.equal(deadSession.toJSON().machine_alive, false);
});

test('Adversarial 9: Agent Unavailable Detection -> Returns safe error if agent missing', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_adv_9_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  
  assert.throws(() => {
    myaos.runtime.wakeAgent('CompletelyNonexistentAgent');
  }, /Cannot wake unknown agent/);
});

test('Adversarial 10: Wake Requested But Runtime Never Starts -> Reports WAKE_REQUESTED_OFFLINE, never ACTIVE', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_adv_10_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const fakeSockDir = path.join(tmpDir, 'empty_socks');
  fs.mkdirSync(fakeSockDir, { recursive: true });

  const myaos = initMyaOS({ baseDir: tmpDir, sockDir: fakeSockDir });
  myaos.registry.registerAgent({ id: 'lyra', name: 'Lyra', capabilities: ['mobile'] });

  const wakeResult = myaos.runtime.wakeAgent('Lyra', 'TASK_TRIGGER');
  assert.equal(wakeResult.status, 'WAKE_REQUESTED_OFFLINE');
  assert.equal(wakeResult.success, false);
  assert.equal(wakeResult.live_session_observed, false);

  const registeredAgent = myaos.registry.getAgent('Lyra');
  assert.notEqual(registeredAgent.status, 'WORKING');
  assert.notEqual(registeredAgent.status, 'ACTIVE');
});

test('Adversarial 11 & 12: Epistemic Invariant ERROR ≠ FALSE -> Test tool crash yields UNKNOWN/UNRESOLVED', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_adv_11_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const task = myaos.taskManager.createTask({
    id: 'TASK_TOOL_CRASH',
    title: 'Tool crash test'
  });

  myaos.taskManager.completeTask(task.id, 'ClaimingWorker', []);

  // Use a command that triggers an execution/binary error (nonexistent binary)
  const evidence = myaos.verifier.verifyTaskArtifacts(task.id, 'IndependentVerifier', {
    testCommand: '/nonexistent/bin/that_does_not_exist_xyz',
    cwd: tmpDir
  });

  // Must NOT claim test failed assertions; must recognize execution error and fail toward UNKNOWN
  assert.equal(evidence.status, 'UNKNOWN');
  assert.equal(evidence.resolution, 'UNRESOLVED');
  assert.equal(evidence.passed, false);
  assert.equal(myaos.taskManager.getTask(task.id).status, 'UNRESOLVED');
});

test('Adversarial 13: Agent Reports WORKING But Machine Cannot Observe Runtime -> Observed status is OFFLINE', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_adv_13_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const fakeSockDir = path.join(tmpDir, 'empty_socks');
  fs.mkdirSync(fakeSockDir, { recursive: true });

  const myaos = initMyaOS({ baseDir: tmpDir, sockDir: fakeSockDir });
  myaos.registry.registerAgent({
    id: 'nexus',
    name: 'Nexus',
    status: 'WORKING' // Agent declared WORKING in file
  });

  // Machine observation must report reality (OFFLINE), not the self-report
  const observed = await myaos.runtime.status('Nexus');
  assert.equal(observed.status, 'OFFLINE');
  assert.equal(observed.session, null);
  assert.equal(observed.evidence_class, EVIDENCE_CLASSES.OBSERVED);
});

test('Adversarial 14: Claimant Cannot Act As Independent Verifier -> Rejects self-verification', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_adv_14_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} });

  const myaos = initMyaOS({ baseDir: tmpDir });
  const task = myaos.taskManager.createTask({
    id: 'TASK_SELF_VERIFY',
    title: 'Self-verification attempt'
  });

  myaos.taskManager.completeTask(task.id, 'Kael', []);

  // Kael attempts to verify their own task completion!
  const evidence = myaos.verifier.verifyTaskArtifacts(task.id, 'Kael', {
    testCommand: 'node -e "process.exit(0)"',
    cwd: tmpDir
  });

  // Self-verification must be rejected
  assert.equal(evidence.status, 'UNKNOWN');
  assert.equal(evidence.resolution, 'UNRESOLVED');
  assert.equal(evidence.passed, false);
  assert.match(evidence.reason, /SELF_VERIFICATION_REJECTED/);
  assert.equal(myaos.taskManager.getTask(task.id).status, 'UNRESOLVED');
});
