/**
 * Base Runtime Adapter Interface for MyaOS
 * Standardizes execution adapters across interactive IDE, headless CLI, and tmux environments.
 */
class BaseRuntimeAdapter {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
  }

  async start(agent) {
    throw new Error(`start() not implemented in ${this.name}`);
  }

  async stop(agent) {
    throw new Error(`stop() not implemented in ${this.name}`);
  }

  async wake(agent, task, provenance = {}) {
    throw new Error(`wake() not implemented in ${this.name}`);
  }

  async sleep(agent, reason) {
    throw new Error(`sleep() not implemented in ${this.name}`);
  }

  async status(agent) {
    throw new Error(`status() not implemented in ${this.name}`);
  }

  async send(agent, message) {
    throw new Error(`send() not implemented in ${this.name}`);
  }

  async observe(agent) {
    throw new Error(`observe() not implemented in ${this.name}`);
  }
}

module.exports = BaseRuntimeAdapter;
