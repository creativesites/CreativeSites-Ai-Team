/**
 * Abstract Base Runtime Adapter
 */
class BaseAdapter {
  constructor(name, options = {}) {
    if (new.target === BaseAdapter) {
      throw new TypeError('Cannot construct BaseAdapter instances directly');
    }
    this.name = name;
    this.options = options;
  }

  async start(agent, options = {}) {
    throw new Error(`${this.name}.start() not implemented`);
  }

  async stop(agent, options = {}) {
    throw new Error(`${this.name}.stop() not implemented`);
  }

  async wake(agent, task = null, payload = {}) {
    throw new Error(`${this.name}.wake() not implemented`);
  }

  async sleep(agent, reason = 'IDLE') {
    throw new Error(`${this.name}.sleep() not implemented`);
  }

  async status(agent) {
    throw new Error(`${this.name}.status() not implemented`);
  }

  async send(agent, message) {
    throw new Error(`${this.name}.send() not implemented`);
  }

  async observe(agent = null) {
    throw new Error(`${this.name}.observe() not implemented`);
  }
}

module.exports = BaseAdapter;
