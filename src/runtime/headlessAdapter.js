const { spawn } = require('child_process');
const path = require('path');
const BaseRuntimeAdapter = require('./baseAdapter');

/**
 * Headless CLI Worker Runtime Adapter
 * Spawns an autonomous node child process to execute tasks on demand.
 */
class HeadlessCliAdapter extends BaseRuntimeAdapter {
  constructor(options = {}) {
    super('headless-cli', options);
    this.activeWorkers = new Map();
  }

  async start(agent) {
    return this.observe(agent);
  }

  async stop(agent) {
    const worker = this.activeWorkers.get(agent.name || agent.id);
    if (worker && worker.child) {
      try {
        worker.child.kill('SIGTERM');
      } catch (e) {}
      this.activeWorkers.delete(agent.name || agent.id);
    }
    return { stopped: true };
  }

  async wake(agent, task, provenance = {}) {
    const agentName = agent.name || agent.identity?.name || agent.id;
    const runtimeId = `rt_cli_${agentName}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    
    // Command to execute real task script or worker loop
    const scriptPath = path.resolve(__dirname, '../../bin/myaos.js');
    const child = spawn(process.execPath, [scriptPath, 'worker', '--agent', agentName, '--task', task ? task.id : ''], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MYAOS_AGENT_NAME: agentName,
        MYAOS_TASK_ID: task ? task.id : '',
        MYAOS_RUNTIME_ID: runtimeId
      },
      detached: false
    });

    const sessionInfo = {
      runtime_id: runtimeId,
      agent_id: agentName,
      pid: child.pid,
      parent_pid: process.pid,
      cwd: process.cwd(),
      started_at: new Date().toISOString(),
      runtime_type: 'headless-cli',
      child
    };

    this.activeWorkers.set(agentName, sessionInfo);

    return {
      runtime_id: runtimeId,
      pid: child.pid,
      status: 'RUNTIME_STARTED',
      adapter: this.name,
      session: sessionInfo
    };
  }

  async sleep(agent, reason = 'WORK_FINISHED') {
    return this.stop(agent);
  }

  async status(agent) {
    const agentName = agent.name || agent.identity?.name || agent.id;
    const worker = this.activeWorkers.get(agentName);
    if (!worker) return { status: 'OFFLINE', observed: false };
    return {
      status: 'RUNNING',
      observed: true,
      runtime_id: worker.runtime_id,
      pid: worker.pid
    };
  }

  async send(agent, message) {
    const agentName = agent.name || agent.identity?.name || agent.id;
    const worker = this.activeWorkers.get(agentName);
    if (worker && worker.child && worker.child.stdin.writable) {
      worker.child.stdin.write(JSON.stringify(message) + '\n');
      return { delivered: true, transport: 'pipe' };
    }
    return { delivered: false, reason: 'WORKER_PIPE_CLOSED' };
  }

  async observe(agent) {
    return this.status(agent);
  }
}

module.exports = HeadlessCliAdapter;
