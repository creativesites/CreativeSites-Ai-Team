const fs = require('fs');
const path = require('path');

class InboxManager {
  constructor(baseInboxesDir, eventBus) {
    this.baseDir = baseInboxesDir || path.resolve(__dirname, '../community/inboxes');
    this.eventBus = eventBus;
    this.ensureInboxesExist();
  }

  ensureInboxesExist() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  getAgentInboxDir(agentName) {
    const cleanName = agentName.toLowerCase().replace(/[@✦✧⏣👁🛡️📱⚡]/g, '').trim();
    const dir = path.join(this.baseDir, cleanName);
    const archiveDir = path.join(dir, 'archive');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    return { dir, archiveDir };
  }

  send({ from, to, type = 'TASK_NOTIFICATION', subject, body, priority = 'NORMAL', relatedTask = null }) {
    const { dir } = this.getAgentInboxDir(to);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = (subject || 'message').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
    const filename = `${timestamp}_${slug}.md`;
    const filePath = path.join(dir, filename);

    const content = `---
id: msg_${Date.now()}
from: "${from}"
to: "${to}"
type: "${type}"
priority: "${priority}"
related_task: ${relatedTask ? `"${relatedTask}"` : 'null'}
created_at: "${new Date().toISOString()}"
---

# ${subject}

${body}
`;

    fs.writeFileSync(filePath, content, 'utf8');

    if (this.eventBus) {
      this.eventBus.emit('message.sent', from, {
        to,
        type,
        priority,
        subject,
        relatedTask,
        file: filename
      });
    }

    return { filename, filePath };
  }

  getUnreadMessages(agentName) {
    const { dir } = this.getAgentInboxDir(agentName);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('.'));
    
    return files.map(file => {
      const fullPath = path.join(dir, file);
      const raw = fs.readFileSync(fullPath, 'utf8');
      return {
        file,
        path: fullPath,
        content: raw
      };
    });
  }

  archive(agentName, filename) {
    const { dir, archiveDir } = this.getAgentInboxDir(agentName);
    const src = path.join(dir, filename);
    const dest = path.join(archiveDir, filename);
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
      return true;
    }
    return false;
  }
}

module.exports = InboxManager;
