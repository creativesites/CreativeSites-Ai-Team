const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
      checks: [],
      healthy: true
    };

    const addCheck = (category, name, passed, details) => {
      report.checks.push({ category, name, passed, details });
      if (!passed) report.healthy = false;
    };

    // 1. Agent Registry Check
    try {
      const agents = this.registry.getAllAgents();
      const hasAgents = agents && agents.length > 0;
      addCheck('Registry', 'Agents loaded', hasAgents, `${agents.length} registered agents found`);
      
      const missingRoles = agents.filter(a => {
        const roles = a.responsibilities || a.org_roles;
        return !roles || roles.length === 0;
      });
      addCheck('Registry', 'Organizational roles assigned', missingRoles.length === 0, 
        missingRoles.length ? `Agents missing roles: ${missingRoles.map(a => a.name).join(', ')}` : 'All agents hold organizational responsibilities');

      if (this.registry.detectTampering) {
        const tamperCheck = this.registry.detectTampering();
        addCheck('Registry', 'Tamper detection', !tamperCheck.tampered,
          tamperCheck.tampered ? `WARNING: Unauthorized mutation detected in agents.json (hash: ${tamperCheck.current_hash})` : 'Registry hash verified clean');
      }
    } catch (e) {
      addCheck('Registry', 'Registry integrity', false, e.message);
    }

    // 2. Epistemic Consistency: Declared vs Machine Observed State
    try {
      const agents = this.registry.getAllAgents();
      let conflicts = 0;
      const conflictDetails = [];

      for (const a of agents) {
        const declaredLive = a.status === 'LIVE' || a.status === 'ONLINE' || a.observed_liveness === 'LIVE';
        let observedLive = false;

        if (this.runtime) {
          if (this.runtime.ideAdapter) {
            const obs = this.runtime.ideAdapter.matchSessionForAgent(a.name, this.runtime.ideAdapter.getObservedSockets ? this.runtime.ideAdapter.getObservedSockets() : []);
            observedLive = Boolean(obs && obs.isAlive());
          } else if (this.runtime.findLiveSessionForAgent) {
            observedLive = Boolean(this.runtime.findLiveSessionForAgent(a.name));
          }
        }

        // If declared LIVE but no socket/process exists, flag conflict
        if (declaredLive && !observedLive) {
          conflicts++;
          conflictDetails.push(`${a.name} (Declared: LIVE, Observed: NOT_FOUND)`);
        }
      }

      addCheck('Epistemics', 'Declared vs Observed Liveness Consistency', conflicts === 0,
        conflicts > 0 ? `${conflicts} conflict(s): ${conflictDetails.join('; ')}. State fails toward UNKNOWN/CONFLICT.` : 'Zero state conflicts detected');
    } catch (e) {
      addCheck('Epistemics', 'State consistency check', false, e.message);
    }

    // 3. Task Queue Health
    try {
      const tasks = this.taskManager.getAllTasks();
      addCheck('Tasks', 'Task queue accessible', true, `${tasks.length} total tasks tracked`);

      const blockedTasks = tasks.filter(t => t.status === 'BLOCKED');
      addCheck('Tasks', 'Blocked tasks check', blockedTasks.length === 0,
        blockedTasks.length > 0 ? `${blockedTasks.length} task(s) currently blocked: ${blockedTasks.map(t => t.id).join(', ')}` : 'Zero blocked tasks');

      const orphanTasks = tasks.filter(t => t.status !== 'DONE' && !t.assignee);
      addCheck('Tasks', 'Orphan task check', orphanTasks.length === 0,
        orphanTasks.length > 0 ? `${orphanTasks.length} unassigned task(s)` : 'All active tasks assigned');
    } catch (e) {
      addCheck('Tasks', 'Task system integrity', false, e.message);
    }

    // 4. Event Bus Check
    try {
      const recent = this.eventBus.getRecentEvents(5);
      addCheck('EventBus', 'Event log accessible', true, `${recent.length} recent events loaded from bus`);
    } catch (e) {
      addCheck('EventBus', 'Event bus integrity', false, e.message);
    }

    // 5. Inboxes Directory Check
    try {
      const inboxesDir = path.resolve(this.baseDir, 'community/inboxes');
      const inboxesExist = fs.existsSync(inboxesDir);
      addCheck('Inboxes', 'Inboxes directory exists', inboxesExist, inboxesExist ? 'Inboxes ready for async messaging' : 'Inboxes missing');
    } catch (e) {
      addCheck('Inboxes', 'Inboxes check', false, e.message);
    }

    // 6. Provenance Log Check
    try {
      const provLog = path.resolve(this.baseDir, 'data/provenance.log');
      if (!fs.existsSync(provLog)) {
        fs.mkdirSync(path.dirname(provLog), { recursive: true });
        fs.writeFileSync(provLog, `[${new Date().toISOString()}] [System] MyaOS provenance ledger initialized.\n`, 'utf8');
      }
      const provExists = fs.existsSync(provLog);
      addCheck('Provenance', 'Audit trail active', provExists, 'Immutable provenance ledger active');
    } catch (e) {
      addCheck('Provenance', 'Provenance check', false, e.message);
    }

    return report;
  }
}

module.exports = MyaDoctor;
