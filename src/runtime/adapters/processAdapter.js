const { spawn } = require('child_process');
const path = require('path');
const BaseAdapter = require('./baseAdapter');
const RuntimeSession = require('../session');

class ProcessAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('process', options);
    this.sessions = new Map(); // agentName -> { session: RuntimeSession, process: ChildProcess }
    this.baseDir = options.baseDir || path.resolve(__dirname, '../../..');
  }

  /**
   * Start a real OS child process worker for an agent
   */
  async start(agentName, options = {}) {
    const clean = agentName.toLowerCase().trim();
    const existing = this.sessions.get(clean);
    if (existing && existing.session.isAlive()) {
      return {
        success: true,
        already_running: true,
        session: existing.session.toJSON()
      };
    }

    const command = options.command || process.execPath; // node
    const defaultArgs = [
      path.resolve(this.baseDir, 'bin/myaos.js'),
      'worker',
      '--agent',
      clean
    ];
    const args = options.args || defaultArgs;
    const cwd = options.cwd || this.baseDir;

    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      env: {
        ...process.env,
        MYAOS_AGENT: clean,
        MYAOS_RUNTIME_TYPE: 'process'
      }
    });

    const session = new RuntimeSession({
      agent_id: clean,
      pid: child.pid,
      parent_pid: process.pid,
      cwd,
      runtime_type: 'process',
      status: 'STARTING'
    });

    this.sessions.set(clean, { session, process: child });

    child.stdout.on('data', (data) => {
      // Stream logs if debug enabled
    });

    child.stderr.on('data', (data) => {
      // Stream errors if debug enabled
    });

    child.on('error', (err) => {
      session.status = 'ERROR';
      session.error = err.message;
    });

    child.on('exit', (code, signal) => {
      session.status = 'TERMINATED';
      session.exitCode = code;
      session.exitSignal = signal;
      this.sessions.delete(clean);
    });

    // Give process a moment to initialize and transition to REGISTERED
    session.status = 'REGISTERED';

    return {
      success: true,
      session: session.toJSON(),
      child
    };
  }

  /**
   * Stop an agent's process
   */
  async stop(agentName, options = {}) {
    const clean = agentName.toLowerCase().trim();
    const entry = this.sessions.get(clean);
    if (!entry) {
      return { success: true, not_running: true };
    }

    const { session, process: child } = entry;
    if (!session.isAlive()) {
      this.sessions.delete(clean);
      return { success: true, already_stopped: true };
    }

    const signal = options.signal || 'SIGTERM';
    try {
      child.kill(signal);
    } catch (e) {}

    session.status = 'TERMINATED';
    this.sessions.delete(clean);

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
    let entry = this.sessions.get(clean);

    // If not running, start it
    if (!entry || !entry.session.isAlive()) {
      const startResult = await this.start(clean);
      if (!startResult.success) {
        return {
          success: false,
          status: 'WAKE_FAILED',
          reason: startResult.reason || 'Failed to start OS process'
        };
      }
      entry = this.sessions.get(clean);
    }

    entry.session.status = 'ACTIVE';
    entry.session.touch();

    // Signal process if alive
    try {
      entry.process.kill('SIGUSR2');
    } catch (e) {
      // Ignored if process handles signals differently
    }

    return {
      success: true,
      status: 'AGENT_ACTIVE',
      session: entry.session.toJSON()
    };
  }

  /**
   * Put agent process to sleep
   */
  async sleep(agentName, reason = 'IDLE') {
    const clean = agentName.toLowerCase().trim();
    const entry = this.sessions.get(clean);
    if (entry && entry.session.isAlive()) {
      entry.session.status = 'SLEEPING';
      entry.session.touch();
    }
    return {
      success: true,
      agent: clean,
      status: 'SLEEPING'
    };
  }

  /**
   * Observe machine status for an agent
   */
  async status(agentName) {
    const clean = agentName.toLowerCase().trim();
    const entry = this.sessions.get(clean);
    if (!entry) {
      return { status: 'NOT_OBSERVED', session: null, evidence_class: 'OBSERVED' };
    }

    const isAlive = entry.session.isAlive();
    if (!isAlive) {
      this.sessions.delete(clean);
      return { status: 'TERMINATED', session: null, evidence_class: 'OBSERVED' };
    }

    return {
      status: entry.session.status,
      session: entry.session.toJSON(),
      evidence_class: 'OBSERVED'
    };
  }

  /**
   * Observe all active child processes
   */
  async observe() {
    const active = [];
    for (const [name, entry] of this.sessions.entries()) {
      if (entry.session.isAlive()) {
        active.push(entry.session.toJSON());
      } else {
        this.sessions.delete(name);
      }
    }
    return { ok: true, sessions: active };
  }
}

module.exports = ProcessAdapter;
