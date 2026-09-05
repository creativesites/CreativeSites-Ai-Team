const fs = require('fs');
const path = require('path');

class EventBus {
  constructor(eventsFilePath) {
    this.eventsFilePath = eventsFilePath || path.resolve(__dirname, '../community/events.ndjson');
    this.listeners = new Map();
    this.ensureFileExists();
  }

  ensureFileExists() {
    const dir = path.dirname(this.eventsFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.eventsFilePath)) {
      fs.writeFileSync(this.eventsFilePath, '', 'utf8');
    }
  }

  emit(type, sender, payload = {}) {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      type,
      sender,
      payload
    };

    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.eventsFilePath, line, 'utf8');

    // Notify local in-memory listeners if any
    const handlers = this.listeners.get(type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error(`[EventBus] Handler error for ${type}:`, err);
      }
    }

    // Also trigger '*' wildcard listeners
    const wildcards = this.listeners.get('*') || [];
    for (const handler of wildcards) {
      try {
        handler(event);
      } catch (err) {
        console.error(`[EventBus] Wildcard error for ${type}:`, err);
      }
    }

    return event;
  }

  on(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  getRecentEvents(limit = 20) {
    if (!fs.existsSync(this.eventsFilePath)) return [];
    const content = fs.readFileSync(this.eventsFilePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const parsed = lines.map(line => {
      try { return JSON.parse(line); } catch (e) { return null; }
    }).filter(Boolean);
    return parsed.slice(-limit);
  }

  getEventsByType(type) {
    if (!fs.existsSync(this.eventsFilePath)) return [];
    const content = fs.readFileSync(this.eventsFilePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines
      .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
      .filter(e => e && e.type === type);
  }
}

module.exports = EventBus;
