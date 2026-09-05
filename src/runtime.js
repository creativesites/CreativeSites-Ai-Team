const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const SOCK_DIR = '/tmp/cc-socks';

class RuntimeController {
  constructor(registry, inboxManager, eventBus, options = {}) {
    this.registry = registry;
    this.inboxManager = inboxManager;
    this.eventBus = eventBus;
    this.sockDir = options.sockDir || SOCK_DIR;
    this.activeWorkers = new Map();
  }

  /**
   * Machine-observe active runtime sessions via Unix domain sockets.
   * Returns { ok: boolean, sessions: Array } or { ok: false, reason: string }
   */
  observedSessions() {
    try {
      if (!fs.existsSync(this.sockDir)) {
        return { ok: true, sessions: [] };
      }
      const files = fs.readdirSync(this.sockDir).filter(f => f.endsWith('.sock'));
      const sessions = files.map(f => {
        const fullPath = path.join(this.sockDir, f);
        const stat = fs.statSync(fullPath);
        const pidMatch = f.match(/^(\d+)\.sock$/);
        const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
        let cwd = null;

        if (pid) {
          try {
            // Machine-inspect working directory of the PID
            const out = execSync(`lsof -a -d cwd -p ${pid} -Fn 2>/dev/null`, { encoding: 'utf8' });
            const match = out.match(/n(.*)/);
            if (match) cwd = match[1].trim();
          } catch (e) {
            cwd = null; // Process may have exited or permissions restricted
          }
        }

        return {
          socket: f,
          path: fullPath,
          pid,
          cwd,
          mtime: stat.mtime
        };
      });

      return { ok: true, sessions };
    } catch (err) {
      return { ok: false, reason: err.message, sessions: [] };
    }
  }

  /**
   * Map an agent to an observed live session based on repository working directory
   */
  findLiveSessionForAgent(agentName) {
    const probe = this.observedSessions();
    if (!probe.ok || probe.sessions.length === 0) return null;

    const clean = agentName.toLowerCase().trim();
    const repoHints = {
      'atlas': 'Myavana-Chatbot',
      'iris': 'Myavana-Chatbot-Dashboard',
      'vela': 'myavana-hair-journey',
      'astra': 'packages/widget'
    };

    const hint = repoHints[clean];
    if (!hint) return null;

    return probe.sessions.find(s => s.cwd && s.cwd.toLowerCase().includes(hint.toLowerCase())) || null;
  }

  /**
   * Wake an agent. Enforces the strict distinction:
   * WAKE_REQUESTED != AGENT_ACTIVE.
   * Never reports an agent as WORKING merely because a token was dropped.
   */
  wakeAgent(agentName, wakeReason = 'MANUAL_TRIGGER', payload = {}) {
    const agent = this.registry ? this.registry.getAgent(agentName) : null;
    if (!agent && this.registry) {
      throw new Error(`Cannot wake unknown agent: ${agentName}`);
    }

    const resolvedName = agent ? (agent.name || agent.identity?.name) : agentName;
    const liveSession = this.findLiveSessionForAgent(resolvedName);
    const hasLiveSession = Boolean(liveSession);

    // 1. Queue wake token durably in inbox
    let wakeTokenFile = null;
    if (this.inboxManager) {
      const { dir } = this.inboxManager.getAgentInboxDir(resolvedName);
      wakeTokenFile = path.join(dir, '.wake_signal');
      const signalData = {
        timestamp: new Date().toISOString(),
        reason: wakeReason,
        target_agent: resolvedName,
        live_session_observed: hasLiveSession,
        session_pid: liveSession ? liveSession.pid : null,
        payload
      };
      fs.writeFileSync(wakeTokenFile, JSON.stringify(signalData, null, 2), 'utf8');
    }

    // 2. Determine truthful status: WAKE_REQUESTED (never WORKING unless confirmed)
    const newStatus = hasLiveSession ? 'WAKE_REQUESTED_LIVE' : 'WAKE_REQUESTED_OFFLINE';

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
      success: true,
      agent: resolvedName,
      status: newStatus,
      live_session_observed: hasLiveSession,
      session: liveSession,
      wake_signal_path: wakeTokenFile
    };
  }

  putAgentToSleep(agentName, reason = 'IDLE') {
    const agent = this.registry ? this.registry.getAgent(agentName) : null;
    const resolvedName = agent ? (agent.name || agent.identity?.name) : agentName;

    if (this.registry) {
      this.registry.updateAgentStatus(resolvedName, 'SLEEPING');
    }

    if (this.inboxManager) {
      const { dir } = this.inboxManager.getAgentInboxDir(resolvedName);
      const wakeTokenFile = path.join(dir, '.wake_signal');
      if (fs.existsSync(wakeTokenFile)) {
        try { fs.unlinkSync(wakeTokenFile); } catch (e) {}
      }
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

  spawnAgentWorker(agentName, command, args = [], options = {}) {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });

    const runtimeId = `rt_proc_${child.pid}_${Date.now()}`;

    this.activeWorkers.set(agentName, {
      runtime_id: runtimeId,
      pid: child.pid,
      process: child,
      started_at: new Date().toISOString()
    });

    if (this.eventBus) {
      this.eventBus.emit('runtime.started', 'RuntimeController', {
        agent: agentName,
        runtime_id: runtimeId,
        pid: child.pid
      });
    }

    child.on('exit', (code) => {
      this.activeWorkers.delete(agentName);
      this.putAgentToSleep(agentName, `PROCESS_EXIT_${code}`);
    });

    return {
      child,
      runtime_id: runtimeId,
      pid: child.pid
    };
  }
}

module.exports = RuntimeController;
