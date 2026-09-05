const { spawn } = require('child_process');
const path = require('path');
const BaseAdapter = require('./baseAdapter');
const RuntimeSession = require('../session');
const { EXECUTION_CLASSES, ATTRIBUTION_STATES } = require('../session');
const HandshakeManager = require('../handshake');

class ProcessAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('process', options);
    this.sessions = new Map(); // runtime_id -> { session: RuntimeSession, process: ChildProcess }
    this.agentSessions = new Map(); // agent_id -> runtime_id
    this.baseDir = options.baseDir || path.resolve(__dirname, '../../..');
    this.handshakeManager = options.handshakeManager || new HandshakeManager();
  }

  /**
   * Start a real OS child process worker for an agent with handshake tokens
   */
  async start(agentName, options = {}) {
    const clean = agentName.toLowerCase().trim();
    const existingRuntimeId = this.agentSessions.get(clean);
    if (existingRuntimeId) {
      const existing = this.sessions.get(existingRuntimeId);
      if (existing && existing.session.isAlive()) {
        return {
          success: true,
          already_running: true,
          session: existing.session.toJSON()
        };
      }
    }

    let runtimeId = `rt_proc_${clean}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let handshakeToken = null;

    if (this.handshakeManager) {
      const pending = this.handshakeManager.createPendingRegistration(clean, 'process');
      runtimeId = pending.runtime_id;
      handshakeToken = pending.token;
    }

    const command = options.command || process.execPath;
    const defaultArgs = [
      path.resolve(this.baseDir, 'bin/myaos.js'),
      'worker',
      '--agent',
      clean,
      '--runtime-id',
      runtimeId
    ];

    if (handshakeToken) {
      defaultArgs.push('--handshake-token', handshakeToken);
    }

    if (options.taskId) {
      defaultArgs.push('--task', options.taskId);
    }

    const args = options.args || defaultArgs;
    const cwd = options.cwd || this.baseDir;

    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      env: {
        ...process.env,
        MYAOS_AGENT_NAME: clean,
        MYAOS_RUNTIME_ID: runtimeId,
        MYAOS_HANDSHAKE_TOKEN: handshakeToken || '',
        MYAOS_RUNTIME_TYPE: 'process',
        MYAOS_BASE_DIR: this.baseDir
      }
    });

    const session = new RuntimeSession({
      runtime_id: runtimeId,
      agent_id: clean,
      pid: child.pid,
      parent_pid: process.pid,
      cwd,
      runtime_type: 'process',
      execution_class: EXECUTION_CLASSES.REAL_PROCESS,
      status: 'STARTING',
      attribution_state: ATTRIBUTION_STATES.ATTRIBUTED
    });

    this.sessions.set(runtimeId, { session, process: child });
    this.agentSessions.set(clean, runtimeId);

    // If handshakeManager is present, auto-register the newly verified child PID
    if (this.handshakeManager && handshakeToken) {
      const regResult = this.handshakeManager.verifyAndRegister({
        runtime_id: runtimeId,
        agent_id: clean,
        token: handshakeToken,
        pid: child.pid,
        parent_pid: process.pid,
        cwd
      });
      if (regResult.success) {
        session.status = 'REGISTERED';
      }
    }

    child.on('error', (err) => {
      session.status = 'ERROR';
      session.error = err.message;
    });

    child.on('exit', (code, signal) => {
      session.status = 'TERMINATED';
      session.exitCode = code;
      session.exitSignal = signal;
      this.sessions.delete(runtimeId);
      if (this.agentSessions.get(clean) === runtimeId) {
        this.agentSessions.delete(clean);
      }
    });

    return {
      success: true,
      runtime_id: runtimeId,
      handshake_token: handshakeToken,
      session: session.toJSON(),
      child
    };
  }

  /**
   * Stop an agent's process
   */
  async stop(agentName, options = {}) {
    const clean = agentName.toLowerCase().trim();
    const runtimeId = this.agentSessions.get(clean);
    if (!runtimeId) {
      return { success: true, not_running: true };
    }

    const entry = this.sessions.get(runtimeId);
    if (!entry) {
      this.agentSessions.delete(clean);
      return { success: true, not_running: true };
    }

    const { session, process: child } = entry;
    if (!session.isAlive()) {
      this.sessions.delete(runtimeId);
      this.agentSessions.delete(clean);
      return { success: true, already_stopped: true };
    }

    const signal = options.signal || 'SIGTERM';
    try {
      child.kill(signal);
    } catch (e) {}

    session.status = 'TERMINATED';
    this.sessions.delete(runtimeId);
    this.agentSessions.delete(clean);

    return {
      success: true,
      stopped_pid: session.pid
    };
  }

  /**
   * Wake the agent process
   */
  async wake(agentName, task = null, payload = {}) {
    const clean = agentName.toLowerCase().trim();
    let runtimeId = this.agentSessions.get(clean);
    let entry = runtimeId ? this.sessions.get(runtimeId) : null;

    if (!entry || !entry.session.isAlive()) {
      const startResult = await this.start(clean, { taskId: task ? task.id : null });
      if (!startResult.success) {
        return {
          success: false,
          status: 'WAKE_FAILED',
          reason: startResult.reason || 'Failed to start OS process'
        };
      }
      runtimeId = startResult.runtime_id;
      entry = this.sessions.get(runtimeId);
    }

    entry.session.status = 'ACTIVE';
    entry.session.touch();

    try {
      entry.process.kill('SIGUSR2');
    } catch (e) {}

    return {
      success: true,
      status: 'AGENT_ACTIVE',
      session: entry.session.toJSON()
    };
  }

  async sleep(agentName, reason = 'IDLE') {
    const clean = agentName.toLowerCase().trim();
    const runtimeId = this.agentSessions.get(clean);
    if (runtimeId) {
      const entry = this.sessions.get(runtimeId);
      if (entry && entry.session.isAlive()) {
        entry.session.status = 'SLEEPING';
        entry.session.touch();
      }
    }
    return {
      success: true,
      agent: clean,
      status: 'SLEEPING'
    };
  }

  async status(agentName) {
    const clean = agentName.toLowerCase().trim();
    const runtimeId = this.agentSessions.get(clean);
    if (!runtimeId) {
      return { status: 'NOT_OBSERVED', session: null, evidence_class: 'OBSERVED' };
    }

    const entry = this.sessions.get(runtimeId);
    if (!entry) {
      this.agentSessions.delete(clean);
      return { status: 'NOT_OBSERVED', session: null, evidence_class: 'OBSERVED' };
    }

    const isAlive = entry.session.isAlive();
    if (!isAlive) {
      this.sessions.delete(runtimeId);
      this.agentSessions.delete(clean);
      return { status: 'TERMINATED', session: null, evidence_class: 'OBSERVED' };
    }

    return {
      status: entry.session.status,
      session: entry.session.toJSON(),
      evidence_class: 'OBSERVED'
    };
  }

  async observe() {
    const active = [];
    for (const [id, entry] of this.sessions.entries()) {
      if (entry.session.isAlive()) {
        active.push(entry.session.toJSON());
      } else {
        this.sessions.delete(id);
      }
    }
    return { ok: true, sessions: active };
  }
}

module.exports = ProcessAdapter;
