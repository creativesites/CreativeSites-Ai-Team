const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_COMMUNITY_PATH = path.resolve(__dirname, '../../community');

class InboxSystem {
  constructor(communityRoot = DEFAULT_COMMUNITY_PATH) {
    this.inboxRoot = path.join(communityRoot, 'inboxes');
    this.init();
  }

  init() {
    if (!fs.existsSync(this.inboxRoot)) {
      fs.mkdirSync(this.inboxRoot, { recursive: true });
    }
  }

  getAgentInboxPath(agentName) {
    const dir = path.join(this.inboxRoot, agentName.toLowerCase());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const archiveDir = path.join(dir, 'archive');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    return dir;
  }

  sendMessage({
    from,
    to,
    type = 'TASK_NOTIFICATION',
    priority = 'MEDIUM',
    taskId = null,
    subject,
    content = ''
  }) {
    const agentDir = this.getAgentInboxPath(to);
    const id = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toISOString();
    const cleanSubject = (subject || type).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}_${cleanSubject}.json`;
    const filePath = path.join(agentDir, filename);

    const messageRecord = {
      id,
      from,
      to,
      type,
      priority,
      taskId,
      subject: subject || type,
      content,
      timestamp,
      read: false
    };

    fs.writeFileSync(filePath, JSON.stringify(messageRecord, null, 2), 'utf-8');
    return { ...messageRecord, filePath };
  }

  getUnreadMessages(agentName) {
    const agentDir = this.getAgentInboxPath(agentName);
    const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.json') && !f.startsWith('.'));

    const messages = [];
    for (const file of files) {
      const fullPath = path.join(agentDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        if (!data.read) {
          messages.push({ ...data, _file: file, _path: fullPath });
        }
      } catch {
        // Skip unparseable files
      }
    }

    return messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  markProcessed(agentName, messageId) {
    const agentDir = this.getAgentInboxPath(agentName);
    const archiveDir = path.join(agentDir, 'archive');
    const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const fullPath = path.join(agentDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        if (data.id === messageId) {
          data.read = true;
          data.processedAt = new Date().toISOString();
          const archivePath = path.join(archiveDir, file);
          fs.writeFileSync(archivePath, JSON.stringify(data, null, 2), 'utf-8');
          fs.unlinkSync(fullPath);
          return true;
        }
      } catch {
        // Skip
      }
    }
    return false;
  }
}

module.exports = { InboxSystem, DEFAULT_COMMUNITY_PATH };
