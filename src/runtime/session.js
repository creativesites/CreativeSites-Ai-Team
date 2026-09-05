const path = require('path');

const EXECUTION_CLASSES = {
  SIMULATED: 'SIMULATED',
  REAL_PROCESS: 'REAL_PROCESS',
  REAL_IDE_SESSION: 'REAL_IDE_SESSION',
  REAL_TMUX_SESSION: 'REAL_TMUX_SESSION'
};

const ATTRIBUTION_STATES = {
  ATTRIBUTED: 'ATTRIBUTED',
  UNATTRIBUTED: 'UNATTRIBUTED'
};

class RuntimeSession {
  constructor({
    runtime_id = null,
    agent_id = null,
    pid = null,
    parent_pid = null,
    cwd = process.cwd(),
    started_at = new Date().toISOString(),
    last_seen = new Date().toISOString(),
    runtime_type = 'process',
    session_id = null,
    status = 'STARTING',
    execution_class = EXECUTION_CLASSES.REAL_PROCESS,
    attribution_state = null
  }) {
    this.runtime_id = runtime_id || `rt_${runtime_type}_${agent_id || 'unattributed'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.agent_id = agent_id ? agent_id.toLowerCase().trim() : null;
    this.pid = pid ? parseInt(pid, 10) : null;
    this.parent_pid = parent_pid ? parseInt(parent_pid, 10) : null;
    this.cwd = cwd;
    this.started_at = started_at;
    this.last_seen = last_seen;
    this.runtime_type = runtime_type; // 'ide' | 'process' | 'tmux' | 'headless'
    this.session_id = session_id;
    this.status = status; // 'STARTING' | 'REGISTERED' | 'ACTIVE' | 'SLEEPING' | 'TERMINATED'
    this.execution_class = execution_class || arguments[0].runtime_label || EXECUTION_CLASSES.REAL_PROCESS;
    this.runtime_label = this.execution_class;
    this.attribution_state = attribution_state || (this.agent_id ? ATTRIBUTION_STATES.ATTRIBUTED : ATTRIBUTION_STATES.UNATTRIBUTED);
    this.attributed = this.attribution_state === ATTRIBUTION_STATES.ATTRIBUTED;
  }

  /**
   * Machine-verify whether the process is genuinely running
   */
  isAlive() {
    if (!this.pid) return false;
    try {
      // Sending signal 0 tests whether process exists and is alive
      process.kill(this.pid, 0);
      return true;
    } catch (e) {
      return false;
    }
  }

  touch() {
    this.last_seen = new Date().toISOString();
  }

  isAttributed() {
    return this.attribution_state === ATTRIBUTION_STATES.ATTRIBUTED && Boolean(this.agent_id);
  }

  toJSON() {
    return {
      runtime_id: this.runtime_id,
      agent_id: this.agent_id,
      attributed: this.attributed,
      pid: this.pid,
      parent_pid: this.parent_pid,
      cwd: this.cwd,
      started_at: this.started_at,
      last_seen: this.last_seen,
      runtime_type: this.runtime_type,
      session_id: this.session_id,
      status: this.status,
      execution_class: this.execution_class,
      runtime_label: this.execution_class,
      attribution_state: this.attribution_state,
      machine_alive: this.isAlive()
    };
  }
}

module.exports = RuntimeSession;
module.exports.EXECUTION_CLASSES = EXECUTION_CLASSES;
module.exports.RUNTIME_LABELS = EXECUTION_CLASSES;
module.exports.ATTRIBUTION_STATES = ATTRIBUTION_STATES;

