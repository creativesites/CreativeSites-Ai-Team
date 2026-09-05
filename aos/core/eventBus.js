const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const DEFAULT_EVENTS_PATH = path.resolve(__dirname, '../../data/events.ndjson');

class EventBus extends EventEmitter {
  constructor(filePath = DEFAULT_EVENTS_PATH) {
    super();
    this.filePath = filePath;
    this.init();
  }

  init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '', 'utf-8');
    }
  }

  emitEvent(eventType, payload = {}, emitter = 'system') {
    const eventRecord = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      event: eventType,
      timestamp: new Date().toISOString(),
      emitter,
      payload
    };

    const line = JSON.stringify(eventRecord) + '\n';
    fs.appendFileSync(this.filePath, line, 'utf-8');

    // Trigger in-memory listeners
    this.emit(eventType, eventRecord);
    this.emit('*', eventRecord);

    return eventRecord;
  }

  getHistory(limit = 100) {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const events = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
      return events.slice(-limit);
    } catch {
      return [];
    }
  }

  getEventsByTask(taskId) {
    return this.getHistory(500).filter(e => e.payload && e.payload.taskId === taskId);
  }
}

module.exports = { EventBus, DEFAULT_EVENTS_PATH };
