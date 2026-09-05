#!/usr/bin/env node

const path = require('path');
const { initMyaOS } = require('../src');

const myaos = initMyaOS({ baseDir: path.resolve(__dirname, '..') });
const [,, command, ...args] = process.argv;

function printHeader() {
  console.log('\n======================================================');
  console.log('   MYAVANA AGENT OPERATING SYSTEM (MyaOS) v1.0.0');
  console.log('======================================================');
}

switch (command) {
  case 'status': {
    printHeader();
    const agents = myaos.registry.getAllAgents();
    console.log('\n👥 AGENTS');
    console.log('------------------------------------------------------');
    for (const a of agents) {
      const statusIcon = a.status === 'WORKING' ? '🟢' : a.status === 'AVAILABLE' ? '🟡' : '💤';
      console.log(`${statusIcon} ${a.name.padEnd(10)} [${a.status.padEnd(9)}] Domain: ${a.primary_domain}`);
      if (a.current_task) console.log(`   └─ Task: ${a.current_task}`);
    }

    const tasks = myaos.taskManager.getAllTasks();
    console.log('\n📋 TASKS');
    console.log('------------------------------------------------------');
    if (tasks.length === 0) {
      console.log('No tasks in queue.');
    } else {
      for (const t of tasks) {
        console.log(`[${t.status.padEnd(12)}] ${t.id} - ${t.title} (Assignee: @${t.assignee || 'Unassigned'})`);
      }
    }

    const recentEvents = myaos.eventBus.getRecentEvents(5);
    console.log('\n⚡ RECENT EVENTS');
    console.log('------------------------------------------------------');
    for (const e of recentEvents) {
      console.log(`[${e.timestamp.slice(11, 19)}] ${e.type.padEnd(20)} from @${e.sender}`);
    }
    console.log('\n');
    break;
  }

  case 'doctor': {
    printHeader();
    console.log('\nRunning organization health diagnostics...\n');
    const report = myaos.doctor.runDiagnostics();
    for (const check of report.checks) {
      const mark = check.passed ? '✅' : '❌';
      console.log(`${mark} [${check.category}] ${check.name}: ${check.details}`);
    }
    console.log(`\nOverall Health: ${report.healthy ? 'HEALTHY (Ready for operations)' : 'ATTENTION REQUIRED'}\n`);
    break;
  }

  case 'wake': {
    const agentName = args[0];
    if (!agentName) {
      console.error('Usage: myaos wake <agent>');
      process.exit(1);
    }
    const result = myaos.runtime.wakeAgent(agentName, 'CLI_WAKE_COMMAND');
    console.log(`[MyaOS] Woke agent @${result.agent}. Status: ${result.status}`);
    break;
  }

  case 'sleep': {
    const agentName = args[0];
    if (!agentName) {
      console.error('Usage: myaos sleep <agent>');
      process.exit(1);
    }
    const result = myaos.runtime.putAgentToSleep(agentName, 'CLI_SLEEP_COMMAND');
    console.log(`[MyaOS] Put agent @${result.agent} to sleep. Status: ${result.status}`);
    break;
  }

  case 'orchestrator': {
    printHeader();
    myaos.orchestrator.processCycle();
    break;
  }

  default: {
    printHeader();
    console.log('\nUsage: myaos <command>');
    console.log('Commands:');
    console.log('  status          Display agent status, task queue, and live events');
    console.log('  doctor          Run system health diagnostics');
    console.log('  wake <agent>    Wake an agent into WORKING state');
    console.log('  sleep <agent>   Put an agent to sleep (SLEEPING state)');
    console.log('  orchestrator    Run an autonomous coordination cycle\n');
  }
}
