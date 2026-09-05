const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class MyaDoctor {
  constructor({ registry, taskManager, inboxManager, eventBus, baseDir }) {
    this.registry = registry;
    this.taskManager = taskManager;
    this.inboxManager = inboxManager;
    this.eventBus = eventBus;
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
      
      const missingRoles = agents.filter(a => !a.org_roles || a.org_roles.length === 0);
      addCheck('Registry', 'Organizational roles assigned', missingRoles.length === 0, 
        missingRoles.length ? `Agents missing roles: ${missingRoles.map(a => a.name).join(', ')}` : 'All agents hold organizational responsibilities');
    } catch (e) {
      addCheck('Registry', 'Registry integrity', false, e.message);
    }

    // 2. Task Queue Health
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

    // 3. Event Bus Check
    try {
      const recent = this.eventBus.getRecentEvents(5);
      addCheck('EventBus', 'Event log accessible', true, `${recent.length} recent events loaded from bus`);
    } catch (e) {
      addCheck('EventBus', 'Event bus integrity', false, e.message);
    }

    // 4. Git Cleanliness Check
    try {
      const gitStatus = execSync('git status --porcelain', { cwd: this.baseDir, encoding: 'utf8' }).trim();
      const isClean = gitStatus.length === 0;
      addCheck('Git', 'Working directory clean', isClean, isClean ? 'Git repository is clean' : `Uncommitted changes detected in repo`);
    } catch (e) {
      addCheck('Git', 'Git repository check', false, `Git check failed: ${e.message}`);
    }

    // 5. Inboxes Directory Check
    try {
      const inboxesDir = path.resolve(this.baseDir, 'community/inboxes');
      const inboxesExist = fs.existsSync(inboxesDir);
      addCheck('Inboxes', 'Inboxes directory exists', inboxesExist, inboxesExist ? 'Inboxes ready for async messaging' : 'Inboxes missing');
    } catch (e) {
      addCheck('Inboxes', 'Inboxes check', false, e.message);
    }

    return report;
  }
}

module.exports = MyaDoctor;
