#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { initMyaOS } = require('../src');
const { observeAndRecord } = require('../src/liveness');

const baseDir = process.env.MYAOS_BASE_DIR || (fs.existsSync(path.resolve(process.cwd(), 'community')) ? process.cwd() : path.resolve(__dirname, '..'));
const myaos = initMyaOS({ baseDir });
const [,, command, ...args] = process.argv;

function printHeader() {
  console.log('\n======================================================');
  console.log('   MYAVANA AGENT OPERATING SYSTEM (MyaOS) v1.0.0');
  console.log('======================================================');
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      flags[key] = val;
    }
  }
  return flags;
}

/**
 * The v2 runtime (runtime/), read through its local API: the same records the
 * new desktop app shows. Says plainly when it is not running.
 */
async function printRuntimeV2() {
  const os = require('os');
  const file = process.env.MYAOS_RUNTIME_FILE || path.join(process.env.MYAOS_HOME || path.join(os.homedir(), '.myaos'), 'runtime.json');
  console.log('\n🧭 RUNTIME v2 (runtime/, read through its API)');
  console.log('------------------------------------------------------');
  let info;
  try {
    info = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    console.log(`Not running (no ${file}). Start it with: npm start --prefix runtime`);
    return;
  }
  try {
    const get = async (route) => {
      const res = await fetch(`${info.url}${route}`, { headers: { Authorization: `Bearer ${info.token}` }, signal: AbortSignal.timeout(2000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${route}`);
      return res.json();
    };
    const health = await get('/health');
    const s = await get('/v1/summary');
    console.log(`Running at ${info.url} (pid ${health.pid}, v${health.version}, schema ${health.schemaVersion})`);
    console.log(`Coworkers ${s.identities} · Rooms ${s.rooms} · Open jobs ${s.openJobs} · Waiting on you ${s.pendingApprovals} · Live sessions ${s.liveSessions}`);
  } catch (e) {
    console.log(`Not reachable at ${info.url}: ${e.message}. The info file may be left from a runtime that stopped.`);
  }
}

async function main() {
  switch (command) {
    case 'status': {
      printHeader();
      const agents = myaos.registry.getAllAgents();
      console.log('\n👥 AGENTS');
      console.log('------------------------------------------------------');
      for (const a of agents) {
        const name = (a.identity && a.identity.name) || a.name || 'Unknown';
        const liveness = a.observed_liveness || a.status || 'UNKNOWN';
        const statusIcon = liveness === 'ONLINE' || liveness === 'LIVE' || liveness === 'ACTIVE' || liveness === 'WORKING' ? '🟢' : liveness === 'OFFLINE' ? '💤' : liveness === 'NOT_OBSERVED' ? '⚠️' : '📐';
        const domain = (a.identity && (a.identity.primary_domain || a.identity.claimed_domain)) || a.primary_domain || 'Unspecified';
        const provenance = a.confidence_provenance || 'UNVERIFIED';
        console.log(`${statusIcon} ${name.padEnd(10)} [${liveness.padEnd(14)}] Domain: ${domain}`);
        console.log(`   ├─ Provenance: ${provenance}`);
        if (a.runtime_session_identity) {
          console.log(`   ├─ Session: ${a.runtime_session_identity}`);
        }
        if (a.declared_responsibilities && a.declared_responsibilities.length) {
          console.log(`   └─ Declared Roles: ${a.declared_responsibilities.join(', ')}`);
        }
      }

      console.log('\n🔍 MACHINE-OBSERVED RUNTIME INSTANCES');
      console.log('------------------------------------------------------');
      try {
        const obs = await myaos.runtime.observe();
        const ideSessions = (obs && obs.adapters && obs.adapters.ide && obs.adapters.ide.sessions) || [];
        if (ideSessions.length === 0) {
          console.log('No active machine sockets or processes observed.');
        } else {
          for (const s of ideSessions) {
            const socketName = s.session_id || s.socket || 'unnamed';
            const attribution = (s.agent_id && s.agent_id !== 'unattributed' && s.agent_id !== 'UNATTRIBUTED') ? `@${s.agent_id}` : 'UNATTRIBUTED';
            const aliveMark = s.isAlive || s.machine_alive ? '🟢' : '❌';
            console.log(`${aliveMark} PID ${String(s.pid || '?').padEnd(6)} [Socket: ${socketName.padEnd(12)}] Identity: ${attribution.padEnd(14)} CWD: ${s.cwd || 'unknown'}`);
          }
        }
      } catch (e) {
        console.log(`Probe note: ${e.message}`);
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
      await printRuntimeV2();
      console.log('\n');
      break;
    }

    case 'observe': {
      printHeader();
      console.log('\n🔍 MACHINE-OBSERVED RUNTIME INSTANCES');
      console.log('------------------------------------------------------');
      const observation = await myaos.runtime.observe();
      console.log(JSON.stringify(observation, null, 2));
      console.log('\n');
      break;
    }

    case 'doctor': {
      printHeader();
      console.log('\n🩺 Running organization health diagnostics...\n');
      const report = await myaos.doctor.runDiagnostics();
      
      console.log('Operational Dimensions:');
      console.log('------------------------------------------------------');
      console.log(`Infrastructure:               ${report.dimensions.infrastructure || 'UNKNOWN'}`);
      console.log(`Registry Integrity:           ${report.dimensions.registry || 'UNKNOWN'}`);
      console.log(`Runtime Observation:          ${report.dimensions.runtime_observation || 'UNKNOWN'}`);
      console.log(`Identity Resolution:          ${report.dimensions.identity_resolution || 'UNKNOWN'}`);
      console.log(`Verification Coverage:        ${report.dimensions.verification_coverage || 'UNKNOWN'}`);
      console.log(`Autonomous Runtime Coverage:  ${report.dimensions.autonomous_runtime_coverage || 'UNKNOWN'}`);
      console.log('------------------------------------------------------');
      console.log(`Overall Health:               ${report.overall_status}`);
      if (report.summary) console.log(`Summary:                      ${report.summary}`);
      console.log('\nDetailed Checks:');
      for (const check of report.checks) {
        const mark = check.status === 'PASS' ? '✅' : (check.status === 'WARN' ? '⚠️' : '❌');
        console.log(`${mark} [${check.dimension}] ${check.name}: ${check.details}`);
      }
      console.log('\n');
      break;
    }

    case 'wake': {
      const agentName = args[0];
      if (!agentName) {
        console.error('Usage: myaos wake <agent>');
        process.exit(1);
      }
      const dbPath = require('../src/paths').dbPath(baseDir);
      const clean = agentName.toLowerCase().trim();

      // Durable, real observation first (writes to identities+runtimes in
      // the DB) - this is what previously never happened, so `wake` always
      // fell back to a broken in-memory check that starts empty on every
      // fresh CLI process and reported OFFLINE regardless of ground truth.
      let observed = null;
      try {
        observed = observeAndRecord([clean], dbPath).agents[0];
      } catch (e) {
        console.log(`   ⚠ Durable liveness observation failed (${e.message}) - falling back to legacy check only.`);
      }

      if (observed && observed.liveness === 'LIVE') {
        console.log(`[MyaOS] Wake result for @${agentName}: Status = ALREADY_LIVE (observed, not caused by this command)`);
        console.log(`   └─ Evidence: ${observed.evidence}`);
        console.log(`   └─ Note: A .wake note was still written to the inbox so the agent sees why it was pinged, but this session was already running independently of this wake call - there is currently no way to inject a message into a live IDE session from the CLI.`);
        if (myaos.registry) { try { myaos.registry.updateAgentStatus(agentName, 'AVAILABLE'); } catch (e) {} }
      } else if (observed) {
        console.log(`[MyaOS] Wake result for @${agentName}: Status = ${observed.liveness} (observed just now)`);
        console.log(`   └─ Evidence: ${observed.evidence}`);
      }

      const result = await myaos.runtime.wakeAgent(agentName, 'CLI_WAKE_COMMAND');
      if (!observed) {
        console.log(`[MyaOS] Wake result for @${result.agent || agentName}: Status = ${result.status}`);
      }
      if (result.reason) console.log(`   └─ Note: ${result.reason}`);
      break;
    }

    case 'sleep': {
      const agentName = args[0];
      if (!agentName) {
        console.error('Usage: myaos sleep <agent>');
        process.exit(1);
      }
      const result = await myaos.runtime.sleepAgent(agentName, 'CLI_SLEEP_COMMAND');
      console.log(`[MyaOS] Put agent @${result.agent || agentName} to sleep. Status: ${result.status}`);
      break;
    }

    case 'worker': {
      const flags = parseFlags(args);
      const agentName = flags.agent || process.env.MYAOS_AGENT_NAME || 'anonymous';
      const taskId = flags.task || process.env.MYAOS_TASK_ID || null;
      const runtimeId = flags['runtime-id'] || process.env.MYAOS_RUNTIME_ID || null;
      const handshakeToken = flags['handshake-token'] || process.env.MYAOS_HANDSHAKE_TOKEN || null;
      const pid = process.pid;

      console.log(`[MyaOS Worker] Started real process worker for @${agentName} (PID: ${pid}, CWD: ${process.cwd()})`);

      // Complete handshake registration if cryptographic token was supplied
      if (runtimeId && handshakeToken && myaos.runtime && myaos.runtime.registerRuntime) {
        const reg = myaos.runtime.registerRuntime({
          runtime_id: runtimeId,
          agent_id: agentName,
          handshake_token: handshakeToken,
          pid,
          parent_pid: process.ppid,
          cwd: process.cwd()
        });
        if (!reg.success) {
          console.error(`[MyaOS Worker Fatal] Handshake registration rejected: ${reg.reason}`);
          process.exit(1);
        }
      } else if (myaos.runtime && myaos.runtime.registerSession) {
        myaos.runtime.registerSession({
          agent_id: agentName,
          pid,
          parent_pid: process.ppid,
          cwd: process.cwd(),
          runtime_type: 'process'
        });
      }

      if (taskId) {
        // This worker has no agent behind it, so it cannot do a task's work.
        // It used to write a SUCCESS proof file and complete the task anyway;
        // it now refuses and leaves the task untouched.
        console.error(`[MyaOS Worker] Refusing task ${taskId}: the process worker cannot execute task work. ` +
          'Run the task in an agent session instead. The task was not claimed or completed.');
        process.exit(2);
      } else {
        // Long-lived worker mode: wait for SIGTERM or SIGINT
        console.log(`[MyaOS Worker] Idle listening mode. Press Ctrl+C to exit.`);
        process.on('SIGTERM', () => {
          console.log(`[MyaOS Worker] Received SIGTERM. Shutting down.`);
          process.exit(0);
        });
        process.on('SIGINT', () => {
          console.log(`[MyaOS Worker] Received SIGINT. Shutting down.`);
          process.exit(0);
        });
        // Keep alive for 5 seconds or until signaled
        setTimeout(() => {
          process.exit(0);
        }, 5000);
      }
      break;
    }

    case 'verify': {
      const taskId = args[0];
      const flags = parseFlags(args.slice(1));
      const verifier = flags.verifier || 'Kael';

      if (!taskId) {
        console.error('Usage: myaos verify <taskId> [--verifier <name>]');
        process.exit(1);
      }

      const task = myaos.taskManager.getTask(taskId);
      if (!task) {
        console.error(`Task ${taskId} not found.`);
        process.exit(1);
      }

      console.log(`[MyaOS Verifier] Running verification on ${taskId} by @${verifier}...`);
      const evidence = myaos.verifier.verifyTaskArtifacts(taskId, verifier, {
        requiredFiles: task.artifacts || []
      });

      console.log(`[MyaOS Verifier] Result: ${evidence.status} (${evidence.resolution}) - ${evidence.reason}`);
      break;
    }

    case 'test': {
      printHeader();
      console.log('\n🧪 Running MyaOS Verification Test Suite & Recording Provenance...\n');
      const TestVerificationRecorder = require('../src/testRecorder');
      const recorder = new TestVerificationRecorder(baseDir);
      const testCmd = args[0] || 'node --test tests/*.test.js';
      const record = recorder.runAndRecord(testCmd);
      console.log(`Commit SHA:     ${record.commit_sha}`);
      console.log(`Working Tree:   ${record.git_working_tree_clean ? 'CLEAN' : `${record.git_uncommitted_changes_count} modified/untracked files`}`);
      console.log(`Test Command:   ${record.test_command}`);
      console.log(`Results:        ${record.metrics.passed}/${record.metrics.total} passed (${record.metrics.failed} failed)`);
      console.log(`Exit Code:      ${record.exit_code}`);
      console.log(`Record Saved:   ${recorder.outputFile}\n`);
      process.exit(record.exit_code);
    }

    case 'proof-bundle': {
      printHeader();
      const taskId = args[0];
      if (!taskId) {
        console.error('Usage: myaos proof-bundle <taskId>');
        process.exit(1);
      }
      const bundlePath = path.resolve(baseDir, `data/proof_bundles/proof_bundle_${taskId.toLowerCase()}.json`);
      if (!fs.existsSync(bundlePath)) {
        console.error(`[MyaOS ProofBundle] No proof bundle found for task ${taskId} at ${bundlePath}`);
        process.exit(1);
      }
      console.log(`\n📦 PROOF BUNDLE VERIFICATION: ${taskId}`);
      console.log('------------------------------------------------------');
      const verifyResult = myaos.proofBundle.verifyBundle(bundlePath);
      const rawBundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
      console.log(`Bundle ID:     ${rawBundle.bundle_id}`);
      console.log(`Bundle Hash:   ${rawBundle.bundle_hash}`);
      console.log(`Worker:        @${verifyResult.worker || rawBundle.transitions.find(t=>t.stage==='TASK_ASSIGNED')?.target_agent}`);
      console.log(`Verifier:      @${verifyResult.verifier || rawBundle.transitions.find(t=>t.stage==='INDEPENDENT_VERIFICATION')?.verifier_agent}`);
      console.log(`Verification:  ${verifyResult.verified ? '✅ VERIFIED' : '❌ FAILED'}`);
      if (!verifyResult.verified) {
        console.log(`Reason:        ${verifyResult.reason}`);
      }
      console.log('\nTransitions:');
      for (const t of rawBundle.transitions) {
        console.log(`  • [${t.stage}] by @${t.actor || t.verifier_agent} at ${t.timestamp}`);
      }
      console.log('\n');
      break;
    }

    default: {
      printHeader();
      console.log('\nUsage: myaos <command> [options]');
      console.log('Commands:');
      console.log('  status                         Display agent status, task queue, and live events');
      console.log('  observe                        Machine-observe runtime sockets, processes, and identity');
      console.log('  doctor                         Run system health diagnostics');
      console.log('  test [cmd]                     Run test suite and record machine verification proof');
      console.log('  proof-bundle <taskId>          Inspect and verify cryptographic proof bundle');
      console.log('  wake <agent>                   Request wake transition for an agent');
      console.log('  sleep <agent>                  Put an agent to sleep (SLEEPING state)');
      console.log('  worker --agent <name> [--task] Register a process session (cannot execute tasks)');
      console.log('  verify <taskId>                Run independent verification on task artifacts');
      console.log('  orchestrator                   Run an autonomous coordination cycle\n');
    }
  }
}


main().catch(err => {
  console.error('[MyaOS Fatal Error]:', err.message);
  process.exit(1);
});
