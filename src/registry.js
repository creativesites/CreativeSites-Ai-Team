const fs = require('fs');
const path = require('path');

class AgentRegistry {
  constructor(registryPath, eventBus) {
    this.registryPath = registryPath || path.resolve(__dirname, '../community/agents.json');
    this.eventBus = eventBus;
    this.data = this.load();
  }

  load() {
    if (!fs.existsSync(this.registryPath)) {
      const defaultState = {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        agents: []
      };
      this.save(defaultState);
      return defaultState;
    }
    const raw = fs.readFileSync(this.registryPath, 'utf8');
    return JSON.parse(raw);
  }

  save(data = this.data) {
    data.updated_at = new Date().toISOString();
    fs.writeFileSync(this.registryPath, JSON.stringify(data, null, 2), 'utf8');
    this.data = data;
  }

  getAllAgents() {
    return this.data.agents;
  }

  getAgent(idOrName) {
    const term = idOrName.toLowerCase().replace(/[@✦✧⏣👁🛡️📱⚡]/g, '').trim();
    return this.data.agents.find(a => 
      a.id.toLowerCase() === term || 
      a.name.toLowerCase() === term
    );
  }

  registerAgent(agentData) {
    const existingIndex = this.data.agents.findIndex(a => 
      a.id === agentData.id || 
      a.name.toLowerCase() === agentData.name.toLowerCase()
    );

    const record = {
      id: agentData.id || `agent-${this.data.agents.length + 1}`,
      name: agentData.name,
      symbol: agentData.symbol || '🤖',
      status: agentData.status || 'AVAILABLE',
      primary_domain: agentData.primary_domain || 'Generalist',
      org_roles: agentData.org_roles || ['Contributor'],
      capabilities: agentData.capabilities || [],
      repositories: agentData.repositories || [],
      owned_paths: agentData.owned_paths || [],
      current_task: agentData.current_task || null,
      last_seen: new Date().toISOString(),
      wake_adapter: agentData.wake_adapter || {
        type: "inbox_file",
        target: `community/inboxes/${agentData.name.toLowerCase()}/`
      }
    };

    if (existingIndex >= 0) {
      this.data.agents[existingIndex] = { ...this.data.agents[existingIndex], ...record };
    } else {
      this.data.agents.push(record);
    }

    this.save();
    if (this.eventBus) {
      this.eventBus.emit('agent.registered', record.name, { agent: record });
    }
    return record;
  }

  updateAgentStatus(idOrName, status, currentTask = undefined) {
    const agent = this.getAgent(idOrName);
    if (!agent) {
      throw new Error(`Agent not found: ${idOrName}`);
    }

    const previousStatus = agent.status;
    agent.status = status;
    agent.last_seen = new Date().toISOString();
    if (currentTask !== undefined) {
      agent.current_task = currentTask;
    }

    this.save();
    if (this.eventBus) {
      this.eventBus.emit('agent.state_changed', agent.name, {
        agent: agent.name,
        previousStatus,
        status,
        currentTask: agent.current_task
      });
    }
    return agent;
  }

  findAgentsByCapabilities(requiredCapabilities = []) {
    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      return this.data.agents;
    }

    const scored = this.data.agents.map(agent => {
      const matched = requiredCapabilities.filter(req => 
        agent.capabilities.includes(req.toLowerCase())
      );
      const score = matched.length / requiredCapabilities.length;
      return { agent, score, matched };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }
}

module.exports = AgentRegistry;

