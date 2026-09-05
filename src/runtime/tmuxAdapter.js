const { execSync } = require('child_process');
const BaseRuntimeAdapter = require('./baseAdapter');

/**
 * Tmux Terminal Runtime Adapter
 * Communicates with named tmux sessions (e.g. myaos:lyra) to dispatch work directly into terminals.
 */
class TmuxAdapter extends BaseRuntimeAdapter {
  constructor(options = {}) {
    super('tmux', options);
    this.sessionPrefix = options.sessionPrefix || 'myaos';
  }

  isTmuxAvailable() {
    try {
      execSync('which tmux', { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }

  getTargetSession(agentName) {
    return `${this.sessionPrefix}:${agentName.toLowerCase()}`;
  }

  hasSession(agentName) {
    if (!this.isTmuxAvailable()) return false;
    try {
      const target = this.getTargetSession(agentName);
      execSync(`tmux has-session -t ${target} 2>/dev/null`, { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }

  async start(agent) {
    const agentName = agent.name || agent.identity?.name || agent.id;
    if (!this.isTmuxAvailable()) throw new Error('tmux is not installed or available in PATH');
    
    const target = this.getTargetSession(agentName);
    if (!this.hasSession(agentName)) {
      execSync(`tmux new-session -d -s ${this.sessionPrefix} -n ${agentName.toLowerCase()}`, { stdio: 'ignore' });
    }
    return { session: target, status: 'RUNNING' };
  }

  async stop(agent) {
    const agentName = agent.name || agent.identity?.name || agent.id;
    if (!this.isTmuxAvailable()) return { stopped: false, reason: 'NO_TMUX' };
    try {
      const target = this.getTargetSession(agentName);
      execSync(`tmux kill-window -t ${target} 2>/dev/null`, { stdio: 'ignore' });
      return { stopped: true };
    } catch (e) {
      return { stopped: false, error: e.message };
    }
  }

  async wake(agent, task, provenance = {}) {
    const agentName = agent.name || agent.identity?.name || agent.id;
    if (!this.isTmuxAvailable()) {
      return {
        status: 'WAKE_FAILED',
        reason: 'TMUX_NOT_INSTALLED'
      };
    }

    const target = this.getTargetSession(agentName);
    const hasTarget = this.hasSession(agentName);

    if (!hasTarget) {
      return {
        status: 'WAKE_FAILED',
        reason: `TMUX_SESSION_NOT_FOUND: ${target}. Agent must be initialized in tmux first.`
      };
    }

    const taskId = task ? task.id : '';
    const cmd = `myaos work --task ${taskId}`;
    execSync(`tmux send-keys -t ${target} "${cmd}" Enter`, { stdio: 'ignore' });

    return {
      status: 'RUNTIME_STARTED',
      adapter: this.name,
      session: target,
      commandSent: cmd
    };
  }

  async sleep(agent, reason = 'SLEEP_REQUESTED') {
    const agentName = agent.name || agent.identity?.name || agent.id;
    if (this.hasSession(agentName)) {
      const target = this.getTargetSession(agentName);
      execSync(`tmux send-keys -t ${target} "myaos sleep" Enter`, { stdio: 'ignore' });
    }
    return { status: 'SLEEPING' };
  }

  async status(agent) {
    const agentName = agent.name || agent.identity?.name || agent.id;
    const exists = this.hasSession(agentName);
    return {
      status: exists ? 'ONLINE' : 'OFFLINE',
      observed: exists,
      adapter: this.name
    };
  }

  async send(agent, message) {
    const agentName = agent.name || agent.identity?.name || agent.id;
    if (!this.hasSession(agentName)) return { delivered: false, reason: 'SESSION_OFFLINE' };
    const target = this.getTargetSession(agentName);
    const safeContent = JSON.stringify(message.content || message).replace(/"/g, '\\"');
    execSync(`tmux send-keys -t ${target} "# MSG: ${safeContent}" Enter`, { stdio: 'ignore' });
    return { delivered: true, transport: 'tmux_keys' };
  }

  async observe(agent) {
    return this.status(agent);
  }
}

module.exports = TmuxAdapter;
