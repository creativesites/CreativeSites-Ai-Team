const fs = require('fs');
const path = require('path');
const IdeAdapter = require('./runtime/adapters/ideAdapter');
const ProcessAdapter = require('./runtime/adapters/processAdapter');
const TmuxAdapter = require('./runtime/adapters/tmuxAdapter');
const { EVIDENCE_CLASSES } = require('./provenance');

class RuntimeController {
  constructor(registry, inboxManager, eventBus, options = {}) {
    this.registry = registry;
    this.inboxManager = inboxManager;
    this.eventBus = eventBus;
    this.baseDir = options.baseDir || path.resolve(__dirname, '..');
    this.provenance = options.provenance || null;

    // Initialize adapters
    this.ideAdapter = new IdeAdapter({ sockDir: options.sockDir || '/tmp/cc-socks' });
    this.processAdapter = new ProcessAdapter({ baseDir: this.baseDir });
    this.tmuxAdapter = new TmuxAdapter();

    this.adapters = {
      ide: this.ideAdapter,
      process: this.processAdapter,
      tmux: this.tmuxAdapter
    };
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
      }
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
   *
   * Invariant: Dropping a wake token is NOT proof an agent is ACTIVE.
   */
  async wake(agentName, task = null, payload = {}) {
    const clean = agentName.toLowerCase().trim();
    const agent = this.registry ? this.registry.getAgent(clean) : null;
    const resolvedName = agent ? (agent.name || agent.identity?.name || clean) : clean;

    // Step 1: WAKE_REQUESTED
    if (this.eventBus) {
      this.eventBus.emit('agent.wake_requested', 'RuntimeController', {
        agent: resolvedName,
        task,
        payload
      });
    }

    // Queue wake token in inbox (durable message, not proof of liveness)
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

    // Step 2 & 3: Check for existing live runtime session
    const currentObserved = await this.status(resolvedName);
    if (currentObserved.status === 'ACTIVE') {
      // Agent already has an active machine session!
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

    // If options allow auto-spawning a process worker:
    if (payload.autoSpawn) {
      const startResult = await this.processAdapter.start(resolvedName);
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

    // If no active session and not spawned, do NOT claim ACTIVE!
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

  /**
   * Put agent to sleep
   */
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
   * Synchronous / backward-compatible aliases for existing calls
   */
  wakeAgent(agentName, wakeReason = 'MANUAL_TRIGGER', payload = {}) {
    const agent = this.registry ? this.registry.getAgent(agentName) : null;
    if (!agent && this.registry) {
      throw new Error(`Cannot wake unknown agent: ${agentName}`);
    }
    const resolvedName = agent ? (agent.name || agent.identity?.name || agentName) : agentName;

    // Check IDE sockets synchronously
    let liveSession = null;
    try {
      const sockDir = this.ideAdapter.sockDir;
      if (fs.existsSync(sockDir)) {
        const files = fs.readdirSync(sockDir).filter(f => f.endsWith('.sock'));
        if (files.length > 0) {
          liveSession = this.ideAdapter.matchSessionForAgent(resolvedName, files.map(f => {
            const pidMatch = f.match(/^(\d+)\.sock$/);
            return {
              socket: f,
              pid: pidMatch ? parseInt(pidMatch[1], 10) : null,
              cwd: process.cwd(),
              isAlive: true
            };
          }));
        }
      }
    } catch (e) {}

    let wakeTokenFile = null;
    if (this.inboxManager) {
      const { dir } = this.inboxManager.getAgentInboxDir(resolvedName);
      wakeTokenFile = path.join(dir, '.wake_signal');
      fs.writeFileSync(wakeTokenFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        reason: wakeReason,
        target_agent: resolvedName,
        payload
      }, null, 2), 'utf8');
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
        session: liveSession,
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
