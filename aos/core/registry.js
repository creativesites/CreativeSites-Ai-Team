const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, '../../data/agents.json');

const INITIAL_AGENTS = [
  {
    name: 'Atlas',
    symbol: '⏣',
    domain: 'Platform, Cloud Run, Git & Security',
    role: 'Interim Coordinator & Security Guardian',
    capabilities: ['backend', 'cloud-run', 'docker', 'security', 'database', 'git', 'coordination', 'release-gating'],
    status: 'IDLE',
    runtime: 'node-cli',
    wakeCommand: 'node bin/aos.js wake Atlas',
    ownedRepos: ['Myavana-Chatbot', 'CreativeSites-Ai-Team'],
    inboxPath: 'community/inboxes/atlas',
    lastSeen: new Date().toISOString(),
    currentTask: null
  },
  {
    name: 'Astra',
    symbol: '✦',
    domain: 'Widget SDK, AI Streaming & Audio',
    role: 'Protocol Steward & UI Architect',
    capabilities: ['frontend', 'streaming', 'audio', 'ai-genai', 'protocols', 'ui-components', 'mentoring'],
    status: 'IDLE',
    runtime: 'node-cli',
    wakeCommand: 'node bin/aos.js wake Astra',
    ownedRepos: ['Myavana-Chatbot'],
    inboxPath: 'community/inboxes/astra',
    lastSeen: new Date().toISOString(),
    currentTask: null
  },
  {
    name: 'Vela',
    symbol: '✧',
    domain: 'WordPress Plugin & Host Bridge',
    role: 'Integration & Honesty Guardian',
    capabilities: ['wordpress', 'php', 'rest-api', 'security', 'host-bridge', 'anti-fake-data', 'verification'],
    status: 'IDLE',
    runtime: 'node-cli',
    wakeCommand: 'node bin/aos.js wake Vela',
    ownedRepos: ['myavana-hair-journey-next', 'Myavana-Chatbot'],
    inboxPath: 'community/inboxes/vela',
    lastSeen: new Date().toISOString(),
    currentTask: null
  },
  {
    name: 'Iris',
    symbol: '👁',
    domain: 'Dashboard, Operator Console & Telemetry',
    role: 'System Observer & Telemetry Lead',
    capabilities: ['dashboard', 'nextjs', 'react', 'telemetry', 'accessibility', 'verification', 'observability'],
    status: 'IDLE',
    runtime: 'node-cli',
    wakeCommand: 'node bin/aos.js wake Iris',
    ownedRepos: ['Myavana-Chatbot-Dashboard'],
    inboxPath: 'community/inboxes/iris',
    lastSeen: new Date().toISOString(),
    currentTask: null
  }
];

class AgentRegistry {
  constructor(filePath = DEFAULT_REGISTRY_PATH) {
    this.filePath = filePath;
    this.init();
  }

  init() {
    if (!fs.existsSync(this.filePath)) {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(INITIAL_AGENTS, null, 2), 'utf-8');
    }
  }

  getAll() {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return INITIAL_AGENTS;
    }
  }

  save(agents) {
    fs.writeFileSync(this.filePath, JSON.stringify(agents, null, 2), 'utf-8');
  }

  getAgent(name) {
    const agents = this.getAll();
    return agents.find(a => a.name.toLowerCase() === name.toLowerCase()) || null;
  }

  registerAgent(agentData) {
    const agents = this.getAll();
    const existingIndex = agents.findIndex(a => a.name.toLowerCase() === agentData.name.toLowerCase());
    
    const record = {
      name: agentData.name,
      symbol: agentData.symbol || '◈',
      domain: agentData.domain || 'Generalist',
      role: agentData.role || 'Contributor',
      capabilities: Array.isArray(agentData.capabilities) ? agentData.capabilities : [],
      status: agentData.status || 'IDLE',
      runtime: agentData.runtime || 'terminal-shell',
      wakeCommand: agentData.wakeCommand || `node bin/aos.js wake ${agentData.name}`,
      ownedRepos: Array.isArray(agentData.ownedRepos) ? agentData.ownedRepos : [],
      inboxPath: agentData.inboxPath || `community/inboxes/${agentData.name.toLowerCase()}`,
      lastSeen: new Date().toISOString(),
      currentTask: agentData.currentTask || null
    };

    if (existingIndex >= 0) {
      agents[existingIndex] = { ...agents[existingIndex], ...record, lastSeen: new Date().toISOString() };
    } else {
      agents.push(record);
    }

    this.save(agents);
    return record;
  }

  updateStatus(name, status, currentTask = null) {
    const agents = this.getAll();
    const agent = agents.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (!agent) throw new Error(`Agent not found in registry: ${name}`);

    agent.status = status;
    agent.lastSeen = new Date().toISOString();
    if (currentTask !== undefined) {
      agent.currentTask = currentTask;
    }
    this.save(agents);
    return agent;
  }

  findAgentsByCapabilities(requiredCapabilities = []) {
    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      return this.getAll();
    }

    const agents = this.getAll();
    return agents
      .map(agent => {
        const matches = requiredCapabilities.filter(c => agent.capabilities.includes(c));
        const score = matches.length / requiredCapabilities.length;
        return { agent, score, matchedCapabilities: matches };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }
}

module.exports = { AgentRegistry, DEFAULT_REGISTRY_PATH, INITIAL_AGENTS };
