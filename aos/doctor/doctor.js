const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

class Doctor {
  constructor({ registry, taskStore, eventBus, inboxSystem }) {
    this.registry = registry;
    this.taskStore = taskStore;
    this.eventBus = eventBus;
    this.inboxSystem = inboxSystem;
  }

  runDiagnostics() {
    const results = [];

    // Check 1: Runtime environment
    const nodeVersion = process.version;
    const isNodeOk = parseInt(nodeVersion.slice(1), 10) >= 18;
    results.push({
      category: 'Runtime Environment',
      name: 'Node.js Version',
      status: isNodeOk ? 'PASS' : 'WARN',
      message: `${nodeVersion} detected (v18+ recommended)`
    });

    // Check 2: Agent Registry
    try {
      const agents = this.registry.getAll();
      if (!Array.isArray(agents) || agents.length === 0) {
        results.push({
          category: 'Agent Registry',
          name: 'Registry Population',
          status: 'FAIL',
          message: 'Registry is empty or invalid'
        });
      } else {
        const invalid = agents.filter(a => !a.name || !Array.isArray(a.capabilities) || a.capabilities.length === 0);
        results.push({
          category: 'Agent Registry',
          name: 'Registered Agents',
          status: invalid.length === 0 ? 'PASS' : 'WARN',
          message: `${agents.length} agents registered (${agents.map(a => a.name).join(', ')})`
        });
      }
    } catch (e) {
      results.push({
        category: 'Agent Registry',
        name: 'Registry Load',
        status: 'FAIL',
        message: e.message
      });
    }

    // Check 3: Agent Inboxes
    try {
      const agents = this.registry.getAll();
      const missingInboxes = [];
      for (const agent of agents) {
        const dir = this.inboxSystem.getAgentInboxPath(agent.name);
        if (!fs.existsSync(dir)) missingInboxes.push(agent.name);
      }
      results.push({
        category: 'Communication',
        name: 'Agent Inboxes',
        status: missingInboxes.length === 0 ? 'PASS' : 'FAIL',
        message: missingInboxes.length === 0 ? 'All agent inboxes verified' : `Missing inboxes for: ${missingInboxes.join(', ')}`
      });
    } catch (e) {
      results.push({
        category: 'Communication',
        name: 'Inboxes Check',
        status: 'FAIL',
        message: e.message
      });
    }

    // Check 4: Task Queue & Orphan Check
    try {
      const tasks = this.taskStore.getAll();
      const agents = this.registry.getAll().map(a => a.name.toLowerCase());
      const orphans = tasks.filter(t => t.assignee && !agents.includes(t.assignee.toLowerCase()));
      const blocked = tasks.filter(t => t.status === 'BLOCKED');

      results.push({
        category: 'Task Queue',
        name: 'Task Inventory',
        status: orphans.length === 0 ? 'PASS' : 'WARN',
        message: `${tasks.length} total tasks (${tasks.filter(t => t.status === 'VERIFIED').length} verified, ${blocked.length} blocked, ${orphans.length} orphaned)`
      });
    } catch (e) {
      results.push({
        category: 'Task Queue',
        name: 'Task Store Load',
        status: 'FAIL',
        message: e.message
      });
    }

    // Check 5: Event Bus
    try {
      const events = this.eventBus.getHistory(10);
      results.push({
        category: 'Event Bus',
        name: 'Append-only Event Log',
        status: 'PASS',
        message: `Event log active (${events.length} recent events parsed)`
      });
    } catch (e) {
      results.push({
        category: 'Event Bus',
        name: 'Event Bus Integrity',
        status: 'FAIL',
        message: e.message
      });
    }

    // Check 6: Git Repository Awareness
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      results.push({
        category: 'Version Control',
        name: 'Git State',
        status: 'PASS',
        message: `Branch: ${branch}`
      });
    } catch (e) {
      results.push({
        category: 'Version Control',
        name: 'Git Check',
        status: 'WARN',
        message: 'Not inside an active git working tree or git not in PATH'
      });
    }

    const hasFailures = results.some(r => r.status === 'FAIL');
    const hasWarnings = results.some(r => r.status === 'WARN');
    const overall = hasFailures ? 'FAIL' : (hasWarnings ? 'WARN' : 'PASS');

    return {
      overall,
      results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'PASS').length,
        warnings: results.filter(r => r.status === 'WARN').length,
        failures: results.filter(r => r.status === 'FAIL').length
      }
    };
  }
}

module.exports = { Doctor };
