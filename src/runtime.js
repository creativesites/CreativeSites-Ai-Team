const fs = require('fs');
const path = require('path');
const IdeAdapter = require('./runtime/adapters/ideAdapter');
const ProcessAdapter = require('./runtime/adapters/processAdapter');
const TmuxAdapter = require('./runtime/adapters/tmuxAdapter');
const RuntimeHandshakeManager = require('./runtime/handshake');
const { EVIDENCE_CLASSES } = require('./provenance');
const { RUNTIME_LABELS } = require('./runtime/session');

class RuntimeController {
  constructor(registry, inboxManager, eventBus, options = {}) {
    this.registry = registry;
    this.inboxManager = inboxManager;
    this.eventBus = eventBus;
    this.baseDir = options.baseDir || path.resolve(__dirname, '..');
    this.provenance = options.provenance || null;

    // Initialize Handshake Manager
    this.handshakeManager = new RuntimeHandshakeManager(this.baseDir);

    // Initialize adapters
    this.ideAdapter = new IdeAdapter({ sockDir: options.sockDir || '/tmp/cc-socks' });
    this.processAdapter = new ProcessAdapter({ baseDir: this.baseDir, handshakeManager: this.handshakeManager });
    this.tmuxAdapter = new TmuxAdapter();

    this.adapters = {
      ide: this.ideAdapter,
      process: this.processAdapter,
      tmux: this.tmuxAdapter
    };

    this.registeredSessions = new Map(); // runtime_id -> session
  }

  /**
   * Complete runtime registration handshake
   */
  registerRuntime({ runtime_id, agent_id, handshake_token, pid, parent_pid, cwd }) {
    const verification = this.handshakeManager.verifyAndRegister({
      runtime_id,
      agent_id,
      handshake_token,
      pid,
      parent_pid,
      cwd
    });

    if (!verification.success) {
      if (this.provenance) {
        this.provenance.record({
          actor: agent_id || 'Unknown',
          operation: 'RUNTIME_REGISTRATION_FAILED',
          runtime_id,
          reason: verification.reason,
          evidence_class: EVIDENCE_CLASSES.UNKNOWN,
          evidence: { runtime_id, pid, reason: verification.reason }
        });
      }
      return verification;
    }

    const session = verification.session;
    this.registeredSessions.set(runtime_id, session);

    if (this.provenance) {
      this.provenance.record({
        actor: session.agent_id,
        operation: 'RUNTIME_REGISTERED',
        runtime_id,
        reason: 'Runtime successfully completed cryptographic handshake and OS process verification',
        evidence_class: EVIDENCE_CLASSES.OBSERVED,
        evidence: session
      });
    }

    if (this.eventBus) {
      this.eventBus.emit('session.registered', 'RuntimeController', session);
    }

    return {
      success: true,
      session
    };
  }

  /**
   * Helper for tests or manual registration
   */
  registerSession(sessionData) {
    const runtimeId = sessionData.runtime_id || `rt_${sessionData.agent_id}_${Date.now()}`;
    const session = {
      runtime_id: runtimeId,
      agent_id: sessionData.agent_id,
      pid: sessionData.pid || process.pid,
      parent_pid: sessionData.parent_pid || process.ppid,
      cwd: sessionData.cwd || process.cwd(),
      runtime_type: sessionData.runtime_type || 'process',
      runtime_label: sessionData.runtime_label || RUNTIME_LABELS.REAL_PROCESS,
      status: 'REGISTERED',
      registered_at: new Date().toISOString()
    };
    this.registeredSessions.set(runtimeId, session);
    return session;
  }

  getSession(runtimeIdOrAgent) {
    if (this.registeredSessions.has(runtimeIdOrAgent)) {
      return this.registeredSessions.get(runtimeIdOrAgent);
    }
    const clean = runtimeIdOrAgent.toLowerCase().trim();
    for (const s of this.registeredSessions.values()) {
      if (s.agent_id && s.agent_id.toLowerCase() === clean) {
        return s;
      }
    }
    return null;
  }

  /**
   * Observe machine state for an agent or all agents across all adapters
   */
  async observe(agentName = null) {
    const ideObservation = await this.ideAdapter.observe(agentName);
    const processObservation = await this.processAdapter.observe();
    const tmuxObservation = await this.tmuxAdapter.observe(agentName);

    return {
      timestamp: new Date().toISOString(),
      agent: agentName,
      adapters: {
        ide: ideObservation,
        process: processObservation,
        tmux: tmuxObservation
      },
      registered_runtimes: Array.from(this.registeredSessions.values())
    };
  }

  /**
   * Get machine-observed status of an agent
   */
  async status(agentName) {
    if (!agentName) throw new Error('Agent name required for status()');
    const clean = agentName.toLowerCase().trim();

    // 1. Check process adapter (real child processes)
    const procStatus = await this.processAdapter.status(clean);
    if (procStatus.status === 'ACTIVE' || procStatus.status === 'REGISTERED' || procStatus.status === 'SLEEPING') {
      return {
        agent: clean,
        status: procStatus.status,
        adapter: 'process',
        session: procStatus.session,
        evidence_class: EVIDENCE_CLASSES.OBSERVED
      };
    }

    // 2. Check IDE adapter (interactive sockets)
    const ideStatus = await this.ideAdapter.status(clean);
    if (ideStatus.status === 'ACTIVE') {
      return {
        agent: clean,
        status: 'ACTIVE',
        adapter: 'ide',
        session: ideStatus.session,
        evidence_class: EVIDENCE_CLASSES.OBSERVED
      };
    } else if (ideStatus.status === 'NOT_ATTRIBUTED') {
      return {
        agent: clean,
        status: 'UNATTRIBUTED',
        adapter: 'ide',
        note: ideStatus.note,
        evidence_class: EVIDENCE_CLASSES.OBSERVED
      };
    }

    return {
      agent: clean,
      status: 'OFFLINE',
      adapter: null,
      session: null,
      evidence_class: EVIDENCE_CLASSES.OBSERVED
    };
  }

  /**
   * Start an agent runtime
   */
  async start(agentName, options = {}) {
    const clean = agentName.toLowerCase().trim();
    return await this.processAdapter.start(clean, options);
  }

  /**
   * Stop an agent runtime
   */
  async stop(agentName, options = {}) {
    const clean = agentName.toLowerCase().trim();
    return await this.processAdapter.stop(clean, options);
  }

  /**
   * Wake an agent according to the strict lifecycle:
   * WAKE_REQUESTED -> RUNTIME_STARTING -> RUNTIME_STARTED -> SESSION_REGISTERED -> AGENT_ACTIVE
   */
  async wake(agentName, task = null, payload = {}) {
    const clean = agentName.toLowerCase().trim();
    const agent = this.registry ? this.registry.getAgent(clean) : null;
    const resolvedName = agent ? (agent.name || agent.identity?.name || clean) : clean;

    // Stage 1: WAKE_REQUESTED
    if (this.eventBus) {
      this.eventBus.emit('agent.wake_requested', 'RuntimeController', {
        agent: resolvedName,
        task,
        payload
      });
    }

    let wakeTokenFile = null;
    if (this.inboxManager) {
      try {
        const { dir } = this.inboxManager.getAgentInboxDir(resolvedName);
        wakeTokenFile = path.join(dir, '.wake_signal');
        fs.writeFileSync(wakeTokenFile, JSON.stringify({
          timestamp: new Date().toISOString(),
          target_agent: resolvedName,
          task,
          payload
        }, null, 2), 'utf8');
      } catch (e) {}
    }

    // Stage 2: Check current observed status
    const currentObserved = await this.status(resolvedName);
    if (currentObserved.status === 'ACTIVE') {
      if (this.registry) {
        try { this.registry.updateAgentStatus(resolvedName, 'WORKING'); } catch (e) {}
      }
      return {
        success: true,
        agent: resolvedName,
        status: 'AGENT_ACTIVE',
        adapter: currentObserved.adapter,
        session: currentObserved.session,
        wake_signal_path: wakeTokenFile
      };
    }

    // Stage 3 & 4: Spawn process if requested
    if (payload.autoSpawn) {
      const startResult = await this.processAdapter.start(resolvedName, { taskId: task ? task.id : null });
      if (startResult.success) {
        if (this.registry) {
          try { this.registry.updateAgentStatus(resolvedName, 'WORKING'); } catch (e) {}
        }
        return {
          success: true,
          agent: resolvedName,
          status: 'AGENT_ACTIVE',
          adapter: 'process',
          session: startResult.session,
          wake_signal_path: wakeTokenFile
        };
      }
    }

    // If no active session confirmed, report truthfully
    if (this.registry) {
      try { this.registry.updateAgentStatus(resolvedName, 'WAKE_REQUESTED'); } catch (e) {}
    }

    return {
      success: false,
      agent: resolvedName,
      status: 'WAKE_REQUESTED_OFFLINE',
      live_session_observed: false,
      session: null,
      wake_signal_path: wakeTokenFile,
      reason: 'Wake token created, but no active machine runtime or socket was observed.'
    };
  }

  async sleep(agentName, reason = 'IDLE') {
    const clean = agentName.toLowerCase().trim();
    await this.processAdapter.sleep(clean, reason);

    if (this.inboxManager) {
      try {
        const { dir } = this.inboxManager.getAgentInboxDir(clean);
        const wakeTokenFile = path.join(dir, '.wake_signal');
        if (fs.existsSync(wakeTokenFile)) fs.unlinkSync(wakeTokenFile);
      } catch (e) {}
    }

    if (this.registry) {
      try { this.registry.updateAgentStatus(clean, 'SLEEPING'); } catch (e) {}
    }

    if (this.eventBus) {
      this.eventBus.emit('agent.sleeping', 'RuntimeController', {
        agent: clean,
        reason
      });
    }

    return {
      success: true,
      agent: clean,
      status: 'SLEEPING'
    };
  }

  /**
   * Synchronous / backward-compatible aliases
   */
  wakeAgent(agentName, wakeReason = 'MANUAL_TRIGGER', payload = {}) {
    const agent = this.registry ? this.registry.getAgent(agentName) : null;
    if (!agent && this.registry) {
      throw new Error(`Cannot wake unknown agent: ${agentName}`);
    }
    const resolvedName = agent ? (agent.name || agent.identity?.name || agentName) : agentName;

    let liveSession = null;
    try {
      // Direct check of process adapter sessions
      const clean = resolvedName.toLowerCase().trim();
      const runtimeId = this.processAdapter.agentSessions.get(clean);
      if (runtimeId) {
        const entry = this.processAdapter.sessions.get(runtimeId);
        if (entry && entry.session.isAlive()) {
          liveSession = entry.session;
        }
      }
    } catch (e) {}

    let wakeTokenFile = null;
    if (this.inboxManager) {
      try {
        const { dir } = this.inboxManager.getAgentInboxDir(resolvedName);
        wakeTokenFile = path.join(dir, '.wake_signal');
        fs.writeFileSync(wakeTokenFile, JSON.stringify({
          timestamp: new Date().toISOString(),
          reason: wakeReason,
          target_agent: resolvedName,
          payload
        }, null, 2), 'utf8');
      } catch (e) {}
    }

    const hasLiveSession = Boolean(liveSession);
    const reportedStatus = hasLiveSession ? 'WORKING' : 'WAKE_REQUESTED_OFFLINE';

    if (this.registry) {
      try {
        this.registry.updateAgentStatus(resolvedName, reportedStatus);
      } catch (e) {}
    }

    if (this.eventBus) {
      this.eventBus.emit('agent.wake_requested', 'RuntimeController', {
        agent: resolvedName,
        reason: wakeReason,
        live_session: hasLiveSession,
        session: liveSession ? liveSession.toJSON() : null,
        payload
      });
    }

    return {
      success: hasLiveSession,
      agent: resolvedName,
      status: reportedStatus,
      live_session_observed: hasLiveSession,
      session: liveSession ? liveSession.toJSON() : null,
      wake_signal_path: wakeTokenFile
    };
  }

  putAgentToSleep(agentName, reason = 'IDLE') {
    const agent = this.registry ? this.registry.getAgent(agentName) : null;
    const resolvedName = agent ? (agent.name || agent.identity?.name || agentName) : agentName;

    if (this.registry) {
      try { this.registry.updateAgentStatus(resolvedName, 'SLEEPING'); } catch (e) {}
    }

    if (this.inboxManager) {
      try {
        const { dir } = this.inboxManager.getAgentInboxDir(resolvedName);
        const wakeTokenFile = path.join(dir, '.wake_signal');
        if (fs.existsSync(wakeTokenFile)) fs.unlinkSync(wakeTokenFile);
      } catch (e) {}
    }

    if (this.eventBus) {
      this.eventBus.emit('agent.sleeping', 'RuntimeController', {
        agent: resolvedName,
        reason
      });
    }

    return {
      success: true,
      agent: resolvedName,
      status: 'SLEEPING'
    };
  }
}

module.exports = RuntimeController;
