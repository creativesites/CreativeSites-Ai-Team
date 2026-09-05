const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BaseAdapter = require('./baseAdapter');
const RuntimeSession = require('../session');

class IdeAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('ide', options);
    this.sockDir = options.sockDir || '/tmp/cc-socks';
  }

  getObservedSockets() {
    if (!fs.existsSync(this.sockDir)) return [];
    try {
      const files = fs.readdirSync(this.sockDir).filter(f => f.endsWith('.sock'));
      const sessions = [];
      for (const f of files) {
        const fullPath = path.join(this.sockDir, f);
        const pidMatch = f.match(/^(\d+)\.sock$/);
        const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
        let cwd = null;
        if (pid) {
          try {
            const out = execSync(`lsof -a -d cwd -p ${pid} -Fn 2>/dev/null`, { encoding: 'utf8' });
            const match = out.match(/n(.*)/);
            if (match) cwd = match[1].trim();
          } catch (e) {}
        }
        let isProcessAlive = false;
        if (pid) {
          try {
            process.kill(pid, 0);
            isProcessAlive = true;
          } catch (e) {}
        }
        sessions.push({ socket: f, path: fullPath, pid, cwd, isAlive: isProcessAlive });
      }
      return sessions;
    } catch (e) {
      return [];
    }
  }

  /**
   * Directly observe the machine's IDE domain sockets and processes
   */
  async observe(agentName = null) {
    if (!fs.existsSync(this.sockDir)) {
      return { ok: true, sessions: [], observed_agents: [] };
    }

    try {
      const files = fs.readdirSync(this.sockDir).filter(f => f.endsWith('.sock'));
      const sessions = [];

      for (const f of files) {
        const fullPath = path.join(this.sockDir, f);
        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch (e) {
          continue;
        }

        const pidMatch = f.match(/^(\d+)\.sock$/);
        const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
        let cwd = null;

        if (pid) {
          try {
            const out = execSync(`lsof -a -d cwd -p ${pid} -Fn 2>/dev/null`, { encoding: 'utf8' });
            const match = out.match(/n(.*)/);
            if (match) cwd = match[1].trim();
          } catch (e) {
            cwd = null;
          }
        }

        // Test machine liveness of PID
        let isProcessAlive = false;
        if (pid) {
          try {
            process.kill(pid, 0);
            isProcessAlive = true;
          } catch (e) {
            isProcessAlive = false;
          }
        }

        sessions.push({
          socket: f,
          path: fullPath,
          pid,
          cwd,
          mtime: stat.mtime,
          isAlive: isProcessAlive
        });
      }

      if (agentName) {
        const matched = this.matchSessionForAgent(agentName, sessions);
        return { ok: true, sessions, matched_session: matched };
      }

      return { ok: true, sessions };
    } catch (err) {
      return { ok: false, reason: err.message, sessions: [] };
    }
  }

  /**
   * Helper: Map known project working directories to agent identities,
   * but explicitly annotate as ATTESTED/INFERRED from directory, not verified identity.
   */
  matchSessionForAgent(agentName, sessions) {
    const clean = agentName.toLowerCase().trim();
    const repoHints = {
      'atlas': 'myavana-chatbot',
      'iris': 'myavana-chatbot-dashboard',
      'vela': 'myavana-hair-journey',
      'astra': 'packages/widget',
      'nexus': 'creativesites-ai-team'
    };

    const hint = repoHints[clean];
    if (!hint) return null;

    const matched = sessions.find(s => s.cwd && s.cwd.toLowerCase().includes(hint) && s.isAlive);
    if (!matched) return null;

    return new RuntimeSession({
      agent_id: clean,
      pid: matched.pid,
      cwd: matched.cwd,
      runtime_type: 'ide',
      session_id: matched.socket,
      status: 'ACTIVE'
    });
  }

  async status(agentName) {
    const observation = await this.observe(agentName);
    if (!observation.ok) {
      return { status: 'UNKNOWN', reason: observation.reason };
    }
    if (observation.matched_session && observation.matched_session.isAlive()) {
      return {
        status: 'ACTIVE',
        session: observation.matched_session.toJSON(),
        evidence_class: 'OBSERVED'
      };
    }
    return {
      status: 'NOT_OBSERVED',
      session: null,
      evidence_class: 'OBSERVED'
    };
  }

  async wake(agentName, task = null, payload = {}) {
    const status = await this.status(agentName);
    return {
      success: status.status === 'ACTIVE',
      agent: agentName,
      status: status.status === 'ACTIVE' ? 'WAKE_NOTIFIED' : 'WAKE_REQUESTED_OFFLINE',
      live_session: status.session
    };
  }

  async sleep(agentName, reason = 'IDLE') {
    return {
      success: true,
      agent: agentName,
      status: 'SLEEPING'
    };
  }

  async send(agentName, message) {
    return { delivered: false, reason: 'IDE adapter relies on inbox files for delivery' };
  }

  async start(agentName) {
    return { success: false, reason: 'Interactive IDE sessions cannot be started programmatically without an IDE process.' };
  }

  async stop(agentName) {
    return { success: false, reason: 'Interactive IDE sessions must be closed by the IDE host.' };
  }
}

module.exports = IdeAdapter;
