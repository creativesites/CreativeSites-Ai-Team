const { exec, spawn } = require('node:child_process');

class WakeController {
  constructor({ registry, taskStore, eventBus, inboxSystem }) {
    this.registry = registry;
    this.taskStore = taskStore;
    this.eventBus = eventBus;
    this.inboxSystem = inboxSystem;
  }

  wakeAgent(agentName, { reason = 'TASK_ASSIGNED', taskId = null, payload = {}, execute = false } = {}) {
    const agent = this.registry.getAgent(agentName);
    if (!agent) throw new Error(`Cannot wake unregistered agent: ${agentName}`);

    // Update status to WAKING then WORKING
    this.registry.updateStatus(agentName, 'WORKING', taskId);

    // Deposit message in agent inbox
    this.inboxSystem.sendMessage({
      from: 'AOS_RUNTIME',
      to: agentName,
      type: 'WAKE_DISPATCH',
      priority: 'HIGH',
      taskId,
      subject: `Wake Request: ${reason}`,
      content: `Agent ${agentName} awakened for task ${taskId || 'general'}. Reason: ${reason}`
    });

    // Emit event
    const event = this.eventBus.emitEvent('agent.woke', {
      agent: agentName,
      reason,
      taskId,
      previousStatus: agent.status,
      timestamp: new Date().toISOString()
    }, 'WakeController');

    let executionResult = null;
    if (execute && agent.wakeCommand) {
      executionResult = this.triggerTerminalCommand(agent.wakeCommand);
    }

    return {
      success: true,
      agent: agentName,
      status: 'WORKING',
      reason,
      taskId,
      event,
      executionResult
    };
  }

  sleepAgent(agentName, reason = 'WORK_COMPLETED') {
    const agent = this.registry.getAgent(agentName);
    if (!agent) throw new Error(`Cannot sleep unregistered agent: ${agentName}`);

    this.registry.updateStatus(agentName, 'SLEEPING', null);

    const event = this.eventBus.emitEvent('agent.sleeping', {
      agent: agentName,
      reason,
      timestamp: new Date().toISOString()
    }, 'WakeController');

    return {
      success: true,
      agent: agentName,
      status: 'SLEEPING',
      reason,
      event
    };
  }

  triggerTerminalCommand(commandString) {
    return new Promise((resolve) => {
      exec(commandString, (error, stdout, stderr) => {
        resolve({
          command: commandString,
          exitCode: error ? (error.code || 1) : 0,
          stdout: stdout ? stdout.trim() : '',
          stderr: stderr ? stderr.trim() : ''
        });
      });
    });
  }
}

module.exports = { WakeController };
