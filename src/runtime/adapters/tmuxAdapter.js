const { execSync } = require('child_process');
const BaseAdapter = require('./baseAdapter');

class TmuxAdapter extends BaseAdapter {
  constructor(options = {}) {
    super('tmux', options);
    this.hasTmux = this.checkTmuxAvailability();
  }

  checkTmuxAvailability() {
    try {
      execSync('which tmux', { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }

  async observe(agentName = null) {
    if (!this.hasTmux) {
      return { ok: true, available: false, sessions: [] };
    }

    try {
      const output = execSync('tmux list-sessions -F "#{session_name}:#{session_attached}:#{session_windows}"', { encoding: 'utf8' }).trim();
      const lines = output.split('\n').filter(l => l.length > 0);
      const sessions = lines.map(line => {
        const [name, attached, windows] = line.split(':');
        return {
          session_name: name,
          attached: attached === '1',
          windows: parseInt(windows, 10)
        };
      });

      return { ok: true, available: true, sessions };
    } catch (err) {
      // Exit code 1 usually means no tmux server running
      return { ok: true, available: true, sessions: [] };
    }
  }

  async status(agentName) {
    const obs = await this.observe();
    if (!obs.ok || !obs.available) {
      return { status: 'UNAVAILABLE', evidence_class: 'OBSERVED' };
    }
    const clean = agentName.toLowerCase();
    const found = obs.sessions.find(s => s.session_name.toLowerCase().includes(clean));
    return {
      status: found ? 'ACTIVE' : 'NOT_OBSERVED',
      session: found || null,
      evidence_class: 'OBSERVED'
    };
  }

  async wake(agentName, task = null, payload = {}) {
    return {
      success: false,
      reason: 'Tmux wake not configured; fallback to process or ide adapter'
    };
  }

  async sleep(agentName) {
    return { success: true };
  }
}

module.exports = TmuxAdapter;
