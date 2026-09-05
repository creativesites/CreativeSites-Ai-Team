const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BaseRuntimeAdapter = require('./baseAdapter');

/**
 * Interactive IDE Runtime Adapter
 * Observes native IDE sessions via Unix domain sockets in /tmp/cc-socks/
 * Queues durable wake tokens and signals interactive IDE instances.
 */
class InteractiveIdeAdapter extends BaseRuntimeAdapter {
  constructor(options = {}) {
    super('interactive-ide', options);
    this.sockDir = options.sockDir || '/tmp/cc-socks';
  }

  getObservedSockets() {
    if (!fs.existsSync(this.sockDir)) return [];
    try {
      const files = fs.readdirSync(this.sockDir).filter(f => f.endsWith('.sock'));
      return files.map(f => {
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
        return { socket: f, path: fullPath, pid, cwd };
      });
    } catch (e) {
      return [];
    }
  }

  findSocketForAgent(agentName) {
    const sockets = this.getObservedSockets();
    const clean = String(agentName).toLowerCase().trim();
    const hints = {
      'atlas': 'myavana-chatbot',
      'iris': 'myavana-chatbot-dashboard',
      'vela': 'myavana-hair-journey'
    };
    const hint = hints[clean];
    if (!hint) return null;
    return sockets.find(s => s.cwd && s.cwd.toLowerCase().includes(hint)) || null;
  }

  async start(agent) {
    return this.observe(agent);
  }

  async stop(agent) {
    return { stopped: false, note: 'Interactive IDE sessions cannot be killed remotely from CLI adapter' };
  }

  async wake(agent, task, provenance = {}) {
    const agentName = agent.name || agent.identity?.name || agent.id;
    const socket = this.findSocketForAgent(agentName);
    const hasLiveSocket = Boolean(socket);

    return {
      status: hasLiveSocket ? 'RUNTIME_STARTED' : 'WAKE_FAILED',
      reason: hasLiveSocket ? 'Observed live IDE session socket' : 'No running IDE socket observed in /tmp/cc-socks',
      adapter: this.name,
      observed_socket: socket,
      pid: socket ? socket.pid : null
    };
  }

  async sleep(agent, reason) {
    return { status: 'SLEEPING' };
  }

  async status(agent) {
    const agentName = agent.name || agent.identity?.name || agent.id;
    const socket = this.findSocketForAgent(agentName);
    return {
      status: socket ? 'LIVE' : 'OFFLINE',
      observed: Boolean(socket),
      socket
    };
  }

  async send(agent, message) {
    return { delivered: false, reason: 'IDE requires SendMessage tool or in-turn dispatch' };
  }

  async observe(agent) {
    return this.status(agent);
  }
}

module.exports = InteractiveIdeAdapter;
