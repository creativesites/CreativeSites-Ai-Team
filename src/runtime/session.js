const path = require('path');

class RuntimeSession {
  constructor({
    runtime_id = null,
    agent_id,
    pid = null,
    parent_pid = null,
    cwd = process.cwd(),
    started_at = new Date().toISOString(),
    last_seen = new Date().toISOString(),
    runtime_type = 'process',
    session_id = null,
    status = 'STARTING'
  }) {
    if (!agent_id) throw new Error('RuntimeSession requires agent_id');
    this.runtime_id = runtime_id || `rt_${runtime_type}_${agent_id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.agent_id = agent_id.toLowerCase().trim();
    this.pid = pid ? parseInt(pid, 10) : null;
    this.parent_pid = parent_pid ? parseInt(parent_pid, 10) : null;
    this.cwd = cwd;
    this.started_at = started_at;
    this.last_seen = last_seen;
    this.runtime_type = runtime_type; // 'ide' | 'process' | 'tmux' | 'headless'
    this.session_id = session_id;
    this.status = status; // 'STARTING' | 'REGISTERED' | 'ACTIVE' | 'SLEEPING' | 'TERMINATED'
  }

  /**
   * Machine-verify whether the process is genuinely running
   */
  isAlive() {
    if (!this.pid) {
      // If there's no PID, we cannot machine-observe via process table
      return false;
    }
    try {
      // Sending signal 0 tests whether the process exists and can receive signals
      process.kill(this.pid, 0);
      return true;
    } catch (e) {
      // ESRCH means process does not exist
      return false;
    }
  }

  touch() {
    this.last_seen = new Date().toISOString();
  }

  toJSON() {
    return {
      runtime_id: this.runtime_id,
      agent_id: this.agent_id,
      pid: this.pid,
      parent_pid: this.parent_pid,
      cwd: this.cwd,
      started_at: this.started_at,
      last_seen: this.last_seen,
      runtime_type: this.runtime_type,
      session_id: this.session_id,
      status: this.status,
      machine_alive: this.isAlive()
    };
  }
}

module.exports = RuntimeSession;
