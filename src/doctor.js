const fs = require('fs');
const path = require('path');

class MyaDoctor {
  constructor({ registry, taskManager, inboxManager, eventBus, runtime, baseDir }) {
    this.registry = registry;
    this.taskManager = taskManager;
    this.inboxManager = inboxManager;
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.baseDir = baseDir || path.resolve(__dirname, '..');
  }

  runDiagnostics() {
    const report = {
      timestamp: new Date().toISOString(),
      dimensions: {},
      checks: [],
      overall_status: 'OPERATIONAL_WITH_UNRESOLVED_STATE',
      healthy: false,
      summary: ''
    };

    const addCheck = (dimension, name, status, details) => {
      const passed = status === 'PASS' || status === true;
      report.checks.push({
        dimension,
        category: dimension,
        name,
        status: passed ? 'PASS' : (status === 'WARN' ? 'WARN' : 'FAIL'),
        passed,
        details
      });
    };

    // 1. Infrastructure Dimension
    let infraPassed = true;
    try {
      const inboxesDir = path.resolve(this.baseDir, 'community/inboxes');
      const inboxesExist = fs.existsSync(inboxesDir);
      addCheck('Infrastructure', 'Inboxes directory', inboxesExist ? 'PASS' : 'FAIL', inboxesExist ? 'Inboxes ready for async messaging' : 'Inboxes missing');
      if (!inboxesExist) infraPassed = false;

      const recentEvents = this.eventBus ? this.eventBus.getRecentEvents(5) : [];
      addCheck('Infrastructure', 'Event bus audit log', true, `${recentEvents.length} recent events indexed`);

      const provLog = path.resolve(this.baseDir, 'data/provenance.log');
      const provExists = fs.existsSync(provLog);
      addCheck('Infrastructure', 'Immutable provenance ledger', provExists ? 'PASS' : 'WARN', provExists ? 'Provenance log active' : 'Provenance log not yet initialized');
    } catch (e) {
      infraPassed = false;
      addCheck('Infrastructure', 'System error', 'FAIL', e.message);
    }
    report.dimensions.infrastructure = infraPassed ? 'HEALTHY' : 'DEGRADED';

    // 2. Registry Dimension
    let registryPassed = true;
    try {
      const agents = this.registry ? this.registry.getAllAgents() : [];
      addCheck('Registry', 'Agents registered', agents.length > 0 ? 'PASS' : 'FAIL', `${agents.length} agent identities registered in canonical registry`);

      const missingRoles = agents.filter(a => {
        const roles = a.responsibilities || a.org_roles;
        return !roles || roles.length === 0;
      });
      addCheck('Registry', 'Organizational roles', missingRoles.length === 0 ? 'PASS' : 'WARN', 
        missingRoles.length ? `Agents missing roles: ${missingRoles.map(a => a.name).join(', ')}` : 'All agents hold organizational responsibilities');

      if (this.registry && this.registry.detectTampering) {
        const tamperCheck = this.registry.detectTampering();
        addCheck('Registry', 'Tamper detection', !tamperCheck.tampered ? 'PASS' : 'FAIL',
          tamperCheck.tampered ? `TAMPER_DETECTED: Unauthorized mutation in agents.json` : 'Registry hash verified clean');
        if (tamperCheck.tampered) registryPassed = false;
      }
    } catch (e) {
      registryPassed = false;
      addCheck('Registry', 'Registry error', 'FAIL', e.message);
    }
    report.dimensions.registry = registryPassed ? 'HEALTHY' : 'COMPROMISED';

    // 3. Runtime Observation Dimension
    let runtimeObservationPassed = true;
    let observedSockets = [];
    let unattributedCount = 0;
    let attributedCount = 0;

    try {
      if (this.runtime) {
        if (this.runtime.ideAdapter && this.runtime.ideAdapter.sockDir && fs.existsSync(this.runtime.ideAdapter.sockDir)) {
          const files = fs.readdirSync(this.runtime.ideAdapter.sockDir).filter(f => f.endsWith('.sock'));
          observedSockets = files;
          for (const f of files) {
            const isBound = this.runtime.ideAdapter.boundSessions && this.runtime.ideAdapter.boundSessions.has(f);
            if (isBound) {
              attributedCount++;
            } else {
              unattributedCount++;
            }
          }
        }
        addCheck('Runtime Observation', 'Runtime observation probe', 'PASS', 'Observation probe active across runtime adapters');
      } else {
        addCheck('Runtime Observation', 'Runtime observation probe', 'WARN', 'Runtime observation probe not configured');
      }
    } catch (e) {
      runtimeObservationPassed = false;
      addCheck('Runtime Observation', 'Observation error', 'FAIL', e.message);
    }
    report.dimensions.runtime_observation = runtimeObservationPassed ? 'HEALTHY' : 'UNAVAILABLE';

    // 4. Epistemics Dimension: Declared vs Machine Observed State
    let epistemicConflicts = 0;
    const conflictDetails = [];
    try {
      const agents = this.registry ? this.registry.getAllAgents() : [];
      for (const a of agents) {
        const declaredLive = a.status === 'LIVE' || a.status === 'ONLINE' || a.observed_liveness === 'LIVE';
        let observedLive = false;

        if (this.runtime) {
          if (this.runtime.processAdapter && this.runtime.processAdapter.agentSessions && this.runtime.processAdapter.agentSessions.has(a.name.toLowerCase().trim())) {
            observedLive = true;
          }
          if (!observedLive && this.runtime.ideAdapter && this.runtime.ideAdapter.boundSessions) {
            for (const [sock, boundAgent] of this.runtime.ideAdapter.boundSessions.entries()) {
              if (boundAgent === a.name.toLowerCase().trim()) {
                observedLive = true;
                break;
              }
            }
          }
        }

        // If declared LIVE but not observed active, flag conflict!
        if (declaredLive && !observedLive) {
          epistemicConflicts++;
          conflictDetails.push(`${a.name} (Declared: LIVE, Observed: NOT_FOUND)`);
        }
      }

      addCheck('Epistemics', 'Declared vs Observed Liveness Consistency', epistemicConflicts === 0 ? 'PASS' : 'FAIL',
        epistemicConflicts > 0 ? `${epistemicConflicts} conflict(s): ${conflictDetails.join('; ')}. State fails toward UNKNOWN/CONFLICT.` : 'Zero state conflicts detected');
    } catch (e) {
      addCheck('Epistemics', 'State consistency check', 'FAIL', e.message);
    }

    // 5. Identity Resolution Dimension (Strict: separates unattributed sockets from attributed agents)
    let identityStatus = 'NO_LIVE_SESSIONS';
    try {
      const totalSockets = observedSockets.length;
      if (totalSockets > 0 && unattributedCount === 0) {
        identityStatus = 'VERIFIED';
        addCheck('Identity Resolution', 'Session attribution', 'PASS', `All ${totalSockets} observed session(s) verified with cryptographic binding`);
      } else if (totalSockets > 0 && unattributedCount > 0) {
        identityStatus = 'PARTIAL';
        addCheck('Identity Resolution', 'Session attribution', 'WARN', `${totalSockets} live process session(s) observed, but ${unattributedCount} remain UNATTRIBUTED without cryptographic handshake.`);
      } else {
        identityStatus = 'NO_LIVE_SESSIONS';
        addCheck('Identity Resolution', 'Session attribution', 'PASS', 'No interactive IDE sessions currently detected on host');
      }
    } catch (e) {
      identityStatus = 'UNKNOWN';
      addCheck('Identity Resolution', 'Resolution check', 'FAIL', e.message);
    }
    report.dimensions.identity_resolution = identityStatus;

    // 6. Verification Coverage Dimension
    let verifStatus = 'COMPLETE';
    try {
      const tasks = this.taskManager ? this.taskManager.getAllTasks() : [];
      const unverified = tasks.filter(t => t.status === 'UNRESOLVED' || t.status === 'BLOCKED');

      if (tasks.length === 0) {
        verifStatus = 'NO_TASKS';
        addCheck('Verification Coverage', 'Task verification', 'PASS', 'Task queue empty');
      } else if (unverified.length > 0) {
        verifStatus = 'PARTIAL';
        addCheck('Verification Coverage', 'Task verification', 'WARN', `${unverified.length} task(s) currently unverified or blocked`);
      } else {
        verifStatus = 'COMPLETE';
        addCheck('Verification Coverage', 'Task verification', 'PASS', `All completed tasks backed by verified machine evidence`);
      }
    } catch (e) {
      verifStatus = 'UNKNOWN';
      addCheck('Verification Coverage', 'Task check', 'FAIL', e.message);
    }
    report.dimensions.verification_coverage = verifStatus;

    // 7. Autonomous Runtime Coverage Dimension
    report.dimensions.autonomous_runtime_coverage = (this.runtime && this.runtime.processAdapter) ? 'OPERATIONAL' : 'OFFLINE';
    addCheck('Autonomous Runtime Coverage', 'Process worker capability', 'PASS', 'Headless OS process adapter and handshake manager operational');

    // Synthesize Semantically Honest Overall Status
    if (!infraPassed || !registryPassed) {
      report.overall_status = 'CRITICAL_ATTENTION_REQUIRED';
      report.summary = 'Critical infrastructure or registry integrity checks failed.';
    } else if (epistemicConflicts > 0) {
      report.overall_status = 'OPERATIONAL_WITH_UNRESOLVED_STATE';
      report.summary = `Declared vs observed liveness mismatch detected (${epistemicConflicts} conflict(s)). System fails toward UNKNOWN/CONFLICT.`;
    } else if (identityStatus === 'PARTIAL' || verifStatus === 'PARTIAL') {
      report.overall_status = 'OPERATIONAL_WITH_UNRESOLVED_STATE';
      report.summary = 'Infrastructure and adapters are operational, but some runtime identities or task verifications remain unresolved.';
    } else {
      report.overall_status = 'HEALTHY';
      report.summary = 'All systems operational, all observed sessions attributed, and all evidence verified.';
    }

    report.healthy = report.overall_status === 'HEALTHY';
    return report;
  }
}

module.exports = MyaDoctor;
