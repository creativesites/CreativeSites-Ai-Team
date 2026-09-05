const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { initMyaOS } = require('../src');

test('End-to-End Vertical Slice: Registration -> Capability Routing -> Execution -> Handoff -> Review -> Verification', async (t) => {
  const tmpDir = path.resolve(__dirname, '../tmp_test_env_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  });

  const myaos = initMyaOS({ baseDir: tmpDir });

  // 1. Register agents
  const agentDev = myaos.registry.registerAgent({
    id: 'agent-dev',
    name: 'Lyra',
    symbol: '📱',
    primary_domain: 'Mobile SDK',
    capabilities: ['react-native', 'mobile-audio', 'ndjson'],
    org_roles: ['Mobile Integration Guardian']
  });

  const agentVerifier = myaos.registry.registerAgent({
    id: 'agent-qa',
    name: 'Kael',
    symbol: '🛡️',
    primary_domain: 'QA & Verification',
    capabilities: ['jest', 'evidence-verification'],
    org_roles: ['Lead Verifier']
  });

  assert.equal(agentDev.name, 'Lyra');
  assert.equal(agentVerifier.name, 'Kael');

  // 2. Create task with required capabilities (unassigned)
  const task = myaos.taskManager.createTask({
    id: 'TASK_TEST_001',
    title: 'Scaffold React Native Client Transport',
    description: 'Implement headless NDJSON streaming parser for mobile',
    required_capabilities: ['react-native', 'ndjson'],
    priority: 'HIGH'
  });

  // Task was auto-routed by Orchestrator upon creation based on capabilities!
  assert.equal(task.assignee, 'Lyra');

  // Verify inbox received task assignment notification
  const unreadLyra = myaos.inboxes.getUnreadMessages('Lyra');
  assert.ok(unreadLyra.length >= 1);
  assert.match(unreadLyra[0].content, /TASK_TEST_001/);

  // 4. Lyra wakes and starts work
  myaos.runtime.wakeAgent('Lyra', 'TASK_DISPATCH');
  const agentAfterWake = myaos.registry.getAgent('Lyra');
  assert.equal(agentAfterWake.status, 'WORKING');

  myaos.taskManager.startTask(task.id, 'Lyra');
  assert.equal(myaos.taskManager.getTask(task.id).status, 'IN_PROGRESS');

  // 5. Lyra completes work, creates mock artifact, emits completion
  const artifactFile = path.join(tmpDir, 'clientTransport.js');
  fs.writeFileSync(artifactFile, '// React Native Transport Implementation\nmodule.exports = {};', 'utf8');

  myaos.taskManager.completeTask(task.id, 'Lyra', [artifactFile]);
  assert.equal(myaos.taskManager.getTask(task.id).status, 'VERIFICATION');

  // 6. Verification Engine runs checks (Verifier: Kael)
  const evidence = myaos.verifier.verifyTaskArtifacts(task.id, 'Kael', {
    requiredFiles: [artifactFile],
    testCommand: 'node -e "process.exit(0)"',
    cwd: tmpDir
  });

  assert.equal(evidence.passed, true);
  assert.equal(evidence.exit_code, 0);
  assert.equal(myaos.taskManager.getTask(task.id).status, 'DONE');

  // 7. Verify events were recorded on the event bus
  const events = myaos.eventBus.getRecentEvents(50);
  const eventTypes = events.map(e => e.type);
  assert.ok(eventTypes.includes('agent.registered'));
  assert.ok(eventTypes.includes('task.created'));
  assert.ok(eventTypes.includes('task.started'));
  assert.ok(eventTypes.includes('task.completed'));
  assert.ok(eventTypes.includes('verification.passed'));
});
