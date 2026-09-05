const fs = require('fs');
const path = require('path');
const HeadlessCliAdapter = require('./headlessAdapter');
const TmuxAdapter = require('./tmuxAdapter');
const InteractiveIdeAdapter = require('./interactiveIdeAdapter');

/**
 * Runtime Manager for MyaOS
 * Orchestrates multi-state autonomous wake lifecycles and runtime adapters.
 *
 * Enforces the strict transition invariant:
 * WAKE_REQUESTED -> RUNTIME_STARTING -> RUNTIME_STARTED -> SESSION_REGISTERED -> AGENT_ACTIVE
 *
 * Never reports an agent ACTIVE merely because a wake token exists.
 */
class RuntimeManager {
  constructor(registry, inboxes, eventBus, options = {}) {
    this.registry = registry;
    this.inboxes = inboxes;
    this.eventBus = eventBus;
    this.options = options;

    this.adapters = {
      'headless-cli': new HeadlessCliAdapter(options),
      'tmux': new TmuxAdapter(options),
      'interactive-ide': new InteractiveIdeAdapter(options)
    };

    this.defaultAdapter = options.defaultAdapter || 'headless-cli';
    this.agentAdapters = new Map([
      ['Atlas', 'interactive-ide'],
      ['Vela', 'interactive-ide'],
      ['Iris', 'interactive-ide'],
      ['Kael', 'headless-cli'],
      ['Lyra', 'headless-cli'],
      ['Nexus', 'headless-cli'],
      ['Astra', 'interactive-ide']
    ]);

    this.registeredSessions = new Map();
  }

  getAdapterForAgent(agentName) {
    const name = String(agentName).trim();
    const adapterKey = this.agentAdapters.get(name) || this.defaultAdapter;
    return this.adapters[adapterKey] || this.adapters[this.defaultAdapter];
  }

  /**
   * Observe machine liveness and running process identity
   */
  async observeAgent(agentName) {
    const adapter = this.getAdapterForAgent(agentName);
    const agent = this.registry ? this.registry.getAgent(agentName) : { name: agentName };
    return adapter.observe(agent);
  }

  /**
   * Register an actively connected session with machine-observed identity
   */
  registerSession(sessionData) {
    const runtimeId = sessionData.runtime_id || `rt_${sessionData.agent_id}_${Date.now()}`;
    const entry = {
      runtime_id: runtimeId,
      agent_id: sessionData.agent_id,
      pid: sessionData.pid || process.pid,
      parent_pid: sessionData.parent_pid || process.ppid,
      cwd: sessionData.cwd || process.cwd(),
      started_at: sessionData.started_at || new Date().toISOString(),
      last_seen: new Date().toISOString(),
      runtime_type: sessionData.runtime_type || 'unknown',
      session_id: sessionData.session_id || null
    };

    this.registeredSessions.set(sessionData.agent_id, entry);

    if (this.eventBus) {
      this.eventBus.emit('session.registered', 'RuntimeManager', entry);
    }

    return entry;
  }

  getSession(agentName) {
    return this.registeredSessions.get(agentName) || null;
  }

  /**
   * Execute the multi-stage wake lifecycle with provenance
   */
  async wakeAgent(agentName, wakeReasonOrTask = 'MANUAL_WAKE', provenanceOrPayload = {}) {
    const agent = this.registry ? this.registry.getAgent(agentName) : { name: agentName };
    if (!agent && this.registry) {
      throw new Error(`Cannot wake unknown agent: ${agentName}`);
    }

    const resolvedName = agent ? (agent.name || agent.identity?.name) : agentName;
    const adapter = this.getAdapterForAgent(resolvedName);

    const isTaskObj = typeof wakeReasonOrTask === 'object' && wakeReasonOrTask !== null;
    const task = isTaskObj ? wakeReasonOrTask : (provenanceOrPayload.taskId ? { id: provenanceOrPayload.taskId } : null);
    const reason = typeof wakeReasonOrTask === 'string' ? wakeReasonOrTask : (provenanceOrPayload.reason || 'TASK_DISPATCH');

    const auditStamp = {
      actor: provenanceOrPayload.actor || 'system',
      agent: resolvedName,
      timestamp: new Date().toISOString(),
      task_id: task ? task.id : null,
      adapter: adapter.name,
      reason
    };

    // Stage 1: WAKE_REQUESTED
    if (this.eventBus) {
      this.eventBus.emit('agent.wake_requested', 'RuntimeManager', auditStamp);
    }

    // Write durable .wake token in inbox
    if (this.inboxes) {
      const { dir } = this.inboxes.getAgentInboxDir(resolvedName);
      const tokenFile = path.join(dir, '.wake');
      fs.writeFileSync(tokenFile, JSON.stringify(auditStamp, null, 2), 'utf8');
    }

    // Stage 2: RUNTIME_STARTING
    if (this.eventBus) {
      this.eventBus.emit('runtime.starting', 'RuntimeManager', {
        agent: resolvedName,
        adapter: adapter.name
      });
    }

    // Stage 3: Attempt start via adapter
    const startResult = await adapter.wake(agent, task, auditStamp);

    if (startResult.status === 'WAKE_FAILED') {
      const failedRecord = {
        agent: resolvedName,
        status: 'WAKE_FAILED',
        reason: startResult.reason,
        audit: auditStamp
      };
      if (this.eventBus) {
        this.eventBus.emit('runtime.wake_failed', 'RuntimeManager', failedRecord);
      }
      return failedRecord;
    }

    // Stage 4: RUNTIME_STARTED confirmed
    if (this.eventBus) {
      this.eventBus.emit('runtime.started', 'RuntimeManager', {
        agent: resolvedName,
        runtime_id: startResult.runtime_id,
        pid: startResult.pid
      });
    }

    // Stage 5: SESSION_REGISTERED
    const session = this.registerSession({
      runtime_id: startResult.runtime_id,
      agent_id: resolvedName,
      pid: startResult.pid,
      cwd: process.cwd(),
      runtime_type: adapter.name
    });

    // Stage 6: AGENT_ACTIVE
    if (this.registry) {
      this.registry.updateAgentStatus(resolvedName, 'WORKING', task ? task.id : null);
    }

    if (this.eventBus) {
      this.eventBus.emit('agent.active', 'RuntimeManager', {
        agent: resolvedName,
        session
      });
    }

    return {
      agent: resolvedName,
      status: 'AGENT_ACTIVE',
      adapter: adapter.name,
      runtime_id: session.runtime_id,
      pid: session.pid,
      session
    };
  }

  async sleepAgent(agentName, reason = 'WORK_FINISHED') {
    const agent = this.registry ? this.registry.getAgent(agentName) : { name: agentName };
    const resolvedName = agent ? (agent.name || agent.identity?.name) : agentName;
    const adapter = this.getAdapterForAgent(resolvedName);

    await adapter.sleep(agent, reason);
    this.registeredSessions.delete(resolvedName);

    if (this.registry) {
      this.registry.updateAgentStatus(resolvedName, 'SLEEPING', null);
    }

    if (this.inboxes) {
      const { dir } = this.inboxes.getAgentInboxDir(resolvedName);
      const tokenFile = path.join(dir, '.wake');
      if (fs.existsSync(tokenFile)) {
        try { fs.unlinkSync(tokenFile); } catch (e) {}
      }
    }

    if (this.eventBus) {
      this.eventBus.emit('agent.sleeping', 'RuntimeManager', {
        agent: resolvedName,
        reason
      });
    }

    return {
      agent: resolvedName,
      status: 'SLEEPING'
    };
  }
}

module.exports = RuntimeManager;
