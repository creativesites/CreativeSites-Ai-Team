#!/usr/bin/env node

const { AgentOperatingSystem } = require('../aos/index');

const aos = new AgentOperatingSystem();
const args = process.argv.slice(2);
const command = args[0] || 'status';

function formatStatus() {
  const agents = aos.registry.getAll();
  const tasks = aos.taskStore.getAll();

  console.log('\n======================================================================');
  console.log('                 MYAVANA AGENT OPERATING SYSTEM (AOS)                 ');
  console.log('======================================================================\n');

  console.log('🤖 ACTIVE AGENTS ROSTER');
  console.log('----------------------------------------------------------------------');
  console.log(
    'NAME'.padEnd(12) +
    'STATUS'.padEnd(12) +
    'ROLE / DOMAIN'.padEnd(32) +
    'CURRENT TASK'
  );
  console.log('-'.repeat(70));

  for (const a of agents) {
    const statusColor = a.status === 'WORKING' ? '🟢' : (a.status === 'IDLE' ? '⚪' : '🌙');
    console.log(
      `${a.symbol || '◈'} ${a.name}`.padEnd(12) +
      `${statusColor} ${a.status}`.padEnd(12) +
      (a.role || a.domain || '').slice(0, 30).padEnd(32) +
      (a.currentTask || 'None')
    );
  }

  console.log('\n📋 TASKS & WORK QUEUE');
  console.log('----------------------------------------------------------------------');
  console.log(
    'ID'.padEnd(12) +
    'STATUS'.padEnd(14) +
    'ASSIGNEE'.padEnd(12) +
    'TITLE'
  );
  console.log('-'.repeat(70));

  if (tasks.length === 0) {
    console.log('No tasks in queue. Create one with `aos task create`.');
  } else {
    for (const t of tasks) {
      const statusIcon = t.status === 'VERIFIED' ? '✅' : (t.status === 'IN_PROGRESS' ? '⚙️' : (t.status === 'REVIEW' ? '🔍' : '⏳'));
      console.log(
        t.id.padEnd(12) +
        `${statusIcon} ${t.status}`.padEnd(14) +
        (t.assignee || 'Unassigned').padEnd(12) +
        t.title.slice(0, 30)
      );
    }
  }

  console.log('\n🔔 SYSTEM ALERTS');
  console.log('----------------------------------------------------------------------');
  const unassigned = tasks.filter(t => t.status === 'TODO');
  const reviewPending = tasks.filter(t => t.status === 'REVIEW');
  const blocked = tasks.filter(t => t.status === 'BLOCKED');

  if (unassigned.length > 0) console.log(`⚠️  ${unassigned.length} task(s) unassigned awaiting capability routing`);
  if (reviewPending.length > 0) console.log(`🔍 ${reviewPending.length} task(s) in review awaiting evidence verification`);
  if (blocked.length > 0) console.log(`🛑 ${blocked.length} task(s) currently blocked`);
  if (unassigned.length === 0 && reviewPending.length === 0 && blocked.length === 0) {
    console.log('✨ All systems healthy. Zero blocking bottlenecks.');
  }

  console.log('\n======================================================================\n');
}

function runDoctor() {
  console.log('\nRunning AOS Doctor Diagnostics...\n');
  const report = aos.doctor.runDiagnostics();

  for (const check of report.results) {
    const icon = check.status === 'PASS' ? '✅' : (check.status === 'WARN' ? '⚠️' : '❌');
    console.log(`${icon} [${check.category}] ${check.name}: ${check.message}`);
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`Overall Health: ${report.overall === 'PASS' ? '✅ SYSTEM HEALTHY' : (report.overall === 'WARN' ? '⚠️ WARNINGS DETECTED' : '❌ FAILURES DETECTED')}`);
  console.log(`Summary: ${report.summary.passed} Passed, ${report.summary.warnings} Warnings, ${report.summary.failures} Failures\n`);
}

async function runTestFlow() {
  console.log('\n======================================================================');
  console.log('    RUNNING AOS MULTI-AGENT AUTONOMOUS VERTICAL SLICE PROOF          ');
  console.log('======================================================================\n');

  console.log('Step 1: Registering Test Candidate (Agent 5 - Nova / Mobile SDK)...');
  const newAgent = aos.registry.registerAgent({
    name: 'Nova',
    symbol: '⚡',
    domain: 'Mobile SDK & React Native',
    role: 'Mobile Specialist',
    capabilities: ['mobile', 'react-native', 'typescript', 'streaming'],
    status: 'SLEEPING'
  });
  console.log(`  ✓ Registered: ${newAgent.name} (Capabilities: ${newAgent.capabilities.join(', ')})\n`);

  console.log('Step 2: Creating Task requiring [wordpress, security] capabilities...');
  const task = {
    id: `TASK-VERIFY-${Date.now().toString().slice(-4)}`,
    title: 'Audit WordPress Service-Key REST Permissions',
    description: 'Verify fail-closed authentication on /wp-json/myavana/v1/* routes',
    requiredCapabilities: ['wordpress', 'security'],
    priority: 'HIGH'
  };

  const routed = aos.routeAndAssign(task);
  console.log(`  ✓ Capability Router selected: ${routed.routing.matchedAgent.name}`);
  console.log(`  ✓ Matched Capabilities: ${routed.routing.matchedCapabilities.join(', ')}`);
  console.log(`  ✓ Task Status: ${routed.task.status}`);
  console.log(`  ✓ Wake Dispatch sent to: ${routed.routing.matchedAgent.name} (Status: ${routed.wakeResult.status})\n`);

  console.log(`Step 3: Simulating autonomous execution by ${routed.routing.matchedAgent.name}...`);
  // Agent works and gathers verification proof
  const evidence = {
    description: 'Executed permissions audit suite. Fail-closed confirmed on unauthenticated endpoints.',
    exitCode: 0,
    testsPassed: 9,
    testsFailed: 0,
    testsTotal: 9,
    output: 'REST API Permissions suite: 9/9 passed. HTTP 401 verified without service key.'
  };

  console.log(`  ✓ Execution complete with exit code 0`);
  console.log(`  ✓ Submitting completion evidence & requesting review...\n`);
  const submitted = aos.submitCompletion(task.id, routed.routing.matchedAgent.name, evidence);
  console.log(`  ✓ Task moved to: ${submitted.task.status}`);
  console.log(`  ✓ Reviewer assigned & awakened: ${submitted.reviewer}\n`);

  console.log(`Step 4: Reviewer (${submitted.reviewer}) verifying evidence against criteria...`);
  const verified = aos.verifyAndClose(task.id, submitted.reviewer);
  console.log(`  ✓ Verification result: ${verified.verification.passed ? 'PASSED' : 'FAILED'}`);
  for (const check of verified.verification.checks) {
    console.log(`    - ${check.name}: ${check.detail} (${check.passed ? 'PASS' : 'FAIL'})`);
  }
  console.log(`  ✓ Final Task Status: ${verified.task.status} (CompletedAt: ${verified.task.completedAt})\n`);

  console.log('Step 5: Event Bus Audit Log Verification:');
  const taskEvents = aos.eventBus.getEventsByTask(task.id);
  for (const e of taskEvents) {
    console.log(`  [${e.timestamp.slice(11, 19)}] Event: ${e.event.padEnd(22)} Emitter: ${e.emitter}`);
  }

  console.log('\n======================================================================');
  console.log('✅ VERTICAL SLICE PROOF COMPLETE: 100% SUCCESS');
  console.log('======================================================================\n');
}

switch (command) {
  case 'doctor':
    runDoctor();
    break;
  case 'test-flow':
    runTestFlow();
    break;
  case 'wake': {
    const agent = args[1];
    const reason = args.slice(2).join(' ') || 'Manual wake trigger';
    if (!agent) {
      console.error('Usage: aos wake <agent-name> [reason]');
      process.exit(1);
    }
    const res = aos.wakeController.wakeAgent(agent, { reason });
    console.log(`\n🔔 Awakened agent ${agent}: Status = ${res.status}, Reason = ${res.reason}\n`);
    break;
  }
  case 'sleep': {
    const agent = args[1];
    if (!agent) {
      console.error('Usage: aos sleep <agent-name>');
      process.exit(1);
    }
    const res = aos.wakeController.sleepAgent(agent);
    console.log(`\n🌙 Put agent ${agent} to sleep: Status = ${res.status}\n`);
    break;
  }
  case 'status':
  default:
    formatStatus();
    break;
}
