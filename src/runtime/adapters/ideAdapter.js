const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BaseAdapter = require('./baseAdapter');
const RuntimeSession = require('../session');
const { EXECUTION_CLASSES, ATTRIBUTION_STATES } = require('../session');

class IdeAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('ide', options);
    this.sockDir = options.sockDir || '/tmp/cc-socks';
    this.boundSessions = new Map(); // socket -> agent_id (only when explicitly bound)
  }

  /**
   * Bind a specific socket to an agent identity when trustworthy evidence/handshake is supplied
   */
  bindSession(socketName, agentId) {
    this.boundSessions.set(socketName, agentId.toLowerCase().trim());
  }

  /**
   * Directly observe the machine's IDE domain sockets and processes.
   *
   * STRICT INVARIANT:
   * Do not infer agent identity from CWD, socket name, or assumptions.
   * If identity cannot be proven with trustworthy binding, report:
   * IDENTITY: UNATTRIBUTED
   */
  async observe(agentName = null) {
    if (!fs.existsSync(this.sockDir)) {
      return { ok: true, sessions: [], unattributed_count: 0, attributed_count: 0 };
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

        // Check if an explicit binding exists for this socket
        const boundAgent = this.boundSessions.get(f) || null;

        const sessionObj = new RuntimeSession({
          runtime_id: `rt_ide_${pid || f}_${stat.mtimeMs}`,
          agent_id: boundAgent || null,
          pid,
          cwd,
          runtime_type: 'ide',
          execution_class: EXECUTION_CLASSES.REAL_IDE_SESSION,
          session_id: f,
          status: isProcessAlive ? 'ACTIVE' : 'TERMINATED',
          attribution_state: boundAgent ? ATTRIBUTION_STATES.ATTRIBUTED : ATTRIBUTION_STATES.UNATTRIBUTED
        });

        sessions.push(sessionObj.toJSON());
      }

      const unattributed = sessions.filter(s => !s.attributed);
      const attributed = sessions.filter(s => s.attributed);

      if (agentName) {
        const clean = agentName.toLowerCase().trim();
        const matched = sessions.find(s => s.agent_id === clean);
        return {
          ok: true,
          sessions,
          unattributed_count: unattributed.length,
          attributed_count: attributed.length,
          matched_session: matched || null
        };
      }

      return {
        ok: true,
        sessions,
        unattributed_count: unattributed.length,
        attributed_count: attributed.length
      };
    } catch (err) {
      return { ok: false, reason: err.message, sessions: [] };
    }
  }

  async status(agentName) {
    if (!agentName) {
      return { status: 'UNKNOWN', reason: 'agentName required' };
    }

    const observation = await this.observe(agentName);
    if (!observation.ok) {
      return { status: 'UNKNOWN', reason: observation.reason };
    }

    if (observation.matched_session && observation.matched_session.machine_alive) {
      return {
        status: 'ACTIVE',
        identity: observation.matched_session.agent_id,
        session: observation.matched_session,
        evidence_class: 'OBSERVED'
      };
    }

    // Check if sockets exist but are unattributed
    if (observation.unattributed_count > 0) {
      return {
        status: 'NOT_ATTRIBUTED',
        note: `${observation.unattributed_count} live IDE session(s) observed, but identity is UNATTRIBUTED (no trustworthy handshake binding).`,
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
      live_session: status.session || null,
      identity_resolution: status.status === 'ACTIVE' ? 'VERIFIED' : 'UNATTRIBUTED'
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
    return { delivered: false, reason: 'IDE adapter relies on inbox files or host communication' };
  }

  async start(agentName) {
    return { success: false, reason: 'Interactive IDE sessions cannot be started programmatically without an IDE host process.' };
  }

  async stop(agentName) {
    return { success: false, reason: 'Interactive IDE sessions must be closed by the IDE host.' };
  }
}

module.exports = IdeAdapter;
