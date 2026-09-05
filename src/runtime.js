const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class RuntimeController {
  constructor(registry, inboxManager, eventBus) {
    this.registry = registry;
    this.inboxManager = inboxManager;
    this.eventBus = eventBus;
    this.activeWorkers = new Map();
  }

  wakeAgent(agentName, wakeReason = 'MANUAL_TRIGGER', payload = {}) {
    const agent = this.registry.getAgent(agentName);
    if (!agent) throw new Error(`Cannot wake unknown agent: ${agentName}`);

    // Update status to WAKING then WORKING
    this.registry.updateAgentStatus(agent.name, 'WORKING');

    // Strategy 1: Drop a wake token in the agent's inbox
    const { dir } = this.inboxManager.getAgentInboxDir(agent.name);
    const wakeTokenFile = path.join(dir, '.wake_signal');
    const signalData = {
      timestamp: new Date().toISOString(),
      reason: wakeReason,
      payload
    };
    fs.writeFileSync(wakeTokenFile, JSON.stringify(signalData, null, 2), 'utf8');

    // Strategy 2: Emit the agent.waking event
    if (this.eventBus) {
      this.eventBus.emit('agent.waking', 'RuntimeController', {
        agent: agent.name,
        reason: wakeReason,
        payload
      });
    }

    return {
      success: true,
      agent: agent.name,
      status: 'WORKING',
      wake_signal_path: wakeTokenFile
    };
  }

  putAgentToSleep(agentName, reason = 'IDLE') {
    const agent = this.registry.getAgent(agentName);
    if (!agent) throw new Error(`Unknown agent: ${agentName}`);

    this.registry.updateAgentStatus(agent.name, 'SLEEPING');

    const { dir } = this.inboxManager.getAgentInboxDir(agent.name);
    const wakeTokenFile = path.join(dir, '.wake_signal');
    if (fs.existsSync(wakeTokenFile)) {
      try { fs.unlinkSync(wakeTokenFile); } catch (e) {}
    }

    if (this.eventBus) {
      this.eventBus.emit('agent.sleeping', 'RuntimeController', {
        agent: agent.name,
        reason
      });
    }

    return {
      success: true,
      agent: agent.name,
      status: 'SLEEPING'
    };
  }

  spawnAgentWorker(agentName, command, args = [], options = {}) {
    const agent = this.registry.getAgent(agentName);
    if (!agent) throw new Error(`Cannot spawn worker for unknown agent: ${agentName}`);

    this.wakeAgent(agent.name, 'PROCESS_SPAWN');

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });

    this.activeWorkers.set(agent.name, {
      pid: child.pid,
      process: child,
      started_at: new Date().toISOString()
    });

    child.on('exit', (code) => {
      this.activeWorkers.delete(agent.name);
      this.putAgentToSleep(agent.name, `PROCESS_EXIT_${code}`);
    });

    return child;
  }
}

module.exports = RuntimeController;
