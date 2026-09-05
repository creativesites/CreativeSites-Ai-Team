const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EVIDENCE_CLASSES } = require('./provenance');

class AgentRegistry {
  constructor(registryPath, eventBus, options = {}) {
    this.registryPath = registryPath || path.resolve(__dirname, '../community/agents.json');
    this.eventBus = eventBus;
    this.provenance = options.provenance || null;
    this.data = this.load();
    this.lastKnownHash = this.computeHash();
  }

  computeHash() {
    if (!fs.existsSync(this.registryPath)) return null;
    const content = fs.readFileSync(this.registryPath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  detectTampering() {
    const currentHash = this.computeHash();
    if (this.lastKnownHash && currentHash && this.lastKnownHash !== currentHash) {
      return {
        tampered: true,
        previous_hash: this.lastKnownHash,
        current_hash: currentHash,
        detected_at: new Date().toISOString()
      };
    }
    return { tampered: false, hash: currentHash };
  }

  normalizeAgent(rawAgent) {
    if (!rawAgent) return null;
    const id = (rawAgent.identity && rawAgent.identity.id) || rawAgent.id;
    const name = (rawAgent.identity && rawAgent.identity.name) || rawAgent.name;
    const symbol = (rawAgent.identity && rawAgent.identity.symbol) || rawAgent.symbol || '🤖';
    const primaryDomain = (rawAgent.identity && (rawAgent.identity.primary_domain || rawAgent.identity.claimed_domain)) || rawAgent.primary_domain || 'Generalist';
    const capabilities = rawAgent.declared_capabilities || rawAgent.capabilities || [];
    const responsibilities = rawAgent.declared_responsibilities || rawAgent.org_roles || [];
    const status = rawAgent.observed_liveness || rawAgent.status || 'UNKNOWN';

    return {
      ...rawAgent,
      id,
      name,
      symbol,
      primary_domain: primaryDomain,
      capabilities,
      responsibilities,
      status
    };
  }

  load() {
    if (!fs.existsSync(this.registryPath)) {
      const defaultState = {
        version: "2.0.0",
        updated_at: new Date().toISOString(),
        agents: []
      };
      this.save(defaultState);
      return defaultState;
    }
    const raw = fs.readFileSync(this.registryPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed;
  }

  save(data = this.data) {
    data.updated_at = new Date().toISOString();
    fs.writeFileSync(this.registryPath, JSON.stringify(data, null, 2), 'utf8');
    this.data = data;
    this.lastKnownHash = this.computeHash();
  }

  getAllAgents() {
    return (this.data.agents || []).map(a => this.normalizeAgent(a));
  }

  getAgent(idOrName) {
    if (!idOrName) return null;
    const term = idOrName.toLowerCase().replace(/[@✦✧⏣👁🛡️📱⚡]/g, '').trim();
    const found = (this.data.agents || []).find(a => {
      const aId = (a.identity && a.identity.id) || a.id;
      const aName = (a.identity && a.identity.name) || a.name;
      return (aId && aId.toLowerCase() === term) || (aName && aName.toLowerCase() === term);
    });
    return this.normalizeAgent(found);
  }

  registerAgent(agentData) {
    const term = (agentData.id || agentData.name || '').toLowerCase();
    const existingIndex = (this.data.agents || []).findIndex(a => {
      const aId = (a.identity && a.identity.id) || a.id;
      const aName = (a.identity && a.identity.name) || a.name;
      return (aId && aId.toLowerCase() === term) || (aName && aName.toLowerCase() === term);
    });

    const record = {
      id: agentData.id || `agent-${(this.data.agents || []).length + 1}`,
      name: agentData.name,
      symbol: agentData.symbol || '🤖',
      status: agentData.status || 'AVAILABLE',
      primary_domain: agentData.primary_domain || 'Generalist',
      org_roles: agentData.org_roles || agentData.responsibilities || ['Contributor'],
      capabilities: agentData.capabilities || agentData.declared_capabilities || [],
      repositories: agentData.repositories || [],
      owned_paths: agentData.owned_paths || [],
      current_task: agentData.current_task || null,
      last_seen: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      this.data.agents[existingIndex] = { ...this.data.agents[existingIndex], ...record };
    } else {
      if (!this.data.agents) this.data.agents = [];
      this.data.agents.push(record);
    }

    this.save();

    if (this.provenance) {
      this.provenance.record({
        actor: 'AgentRegistry',
        agent: record.name,
        operation: 'REGISTER_AGENT',
        reason: 'Agent registered in canonical agents.json',
        evidence_class: EVIDENCE_CLASSES.DECLARED,
        evidence: record
      });
    }

    if (this.eventBus) {
      this.eventBus.emit('agent.registered', record.name, { agent: record });
    }
    return this.normalizeAgent(record);
  }

  updateAgentStatus(idOrName, status, currentTask = undefined) {
    if (!idOrName) throw new Error('Agent id/name required');
    const term = idOrName.toLowerCase().replace(/[@✦✧⏣👁🛡️📱⚡]/g, '').trim();
    const agent = (this.data.agents || []).find(a => {
      const aId = (a.identity && a.identity.id) || a.id;
      const aName = (a.identity && a.identity.name) || a.name;
      return (aId && aId.toLowerCase() === term) || (aName && aName.toLowerCase() === term);
    });

    if (!agent) {
      throw new Error(`Agent not found: ${idOrName}`);
    }

    const previousStatus = agent.status || agent.observed_liveness;
    agent.status = status;
    agent.last_seen = new Date().toISOString();
    if (currentTask !== undefined) {
      agent.current_task = currentTask;
    }

    this.save();

    if (this.provenance) {
      this.provenance.record({
        actor: 'AgentRegistry',
        agent: (agent.identity && agent.identity.name) || agent.name,
        operation: 'UPDATE_STATUS',
        reason: `Status transition: ${previousStatus} -> ${status}`,
        evidence_class: EVIDENCE_CLASSES.DECLARED,
        evidence: { previousStatus, status, currentTask }
      });
    }

    const norm = this.normalizeAgent(agent);
    if (this.eventBus) {
      this.eventBus.emit('agent.state_changed', norm.name, {
        agent: norm.name,
        previousStatus,
        status,
        currentTask: agent.current_task
      });
    }
    return norm;
  }

  findAgentsByCapabilities(requiredCapabilities = []) {
    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      return this.getAllAgents();
    }

    const scored = this.getAllAgents().map(agent => {
      const agentCaps = (agent.capabilities || []).map(c => c.toLowerCase());
      const matched = requiredCapabilities.filter(req => 
        agentCaps.includes(req.toLowerCase())
      );
      const score = matched.length / requiredCapabilities.length;
      return { agent, score, matched };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Generate a read-only markdown view of the canonical registry.
   * Does NOT overwrite files unexpectedly or claim automatic background synchronization.
   */
  generateMarkdownView() {
    const agents = this.getAllAgents();
    let md = `# AGENTS REGISTRY (Read-Only Representation)\n\n`;
    md += `> **Source of Truth**: \`community/agents.json\`\n`;
    md += `> Generated: ${new Date().toISOString()}\n\n`;
    md += `| Symbol | Name | Domain | Declared Roles | Capabilities | Observed Status |\n`;
    md += `|:---:|:---|:---|:---|:---|:---:|\n`;

    for (const a of agents) {
      const symbol = a.symbol || '🤖';
      const name = a.name;
      const domain = a.primary_domain || 'General';
      const roles = (a.responsibilities || []).join(', ');
      const caps = (a.capabilities || []).slice(0, 3).join(', ') + ((a.capabilities || []).length > 3 ? '...' : '');
      const status = a.status || 'UNKNOWN';
      md += `| ${symbol} | **${name}** | ${domain} | ${roles} | ${caps} | \`${status}\` |\n`;
    }

    md += `\n---\n*This table is a generated view of canonical identity in \`agents.json\`.*`;
    return md;
  }
}

module.exports = AgentRegistry;
