export interface AgentDirectoryInfo {
  id: string;
  name: string;
  symbol: string;
  domain: string;
  defaultWorkspace: string;
  shortPath: string;
  recommendedEngine: 'claude' | 'gemini' | 'antigravity' | 'shell';
}

export const AGENT_DIRECTORY_MAP: Record<string, AgentDirectoryInfo> = {
  astra: {
    id: 'astra',
    name: 'Astra',
    symbol: 'AS',
    domain: 'Widget SDK & AI Protocol',
    defaultWorkspace: '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot',
    shortPath: 'WebstormProjects/Myavana-Chatbot',
    recommendedEngine: 'gemini',
  },
  iris: {
    id: 'iris',
    name: 'Iris',
    symbol: 'IR',
    domain: 'Observer & Telemetry Lead',
    defaultWorkspace: '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot-Dashboard',
    shortPath: 'WebstormProjects/Myavana-Chatbot-Dashboard',
    recommendedEngine: 'gemini',
  },
  vela: {
    id: 'vela',
    name: 'Vela',
    symbol: 'VE',
    domain: 'WordPress System of Record & Host Bridge',
    defaultWorkspace: '/Users/winstonzulu/Documents/GitHub/Myavana-Hair-Journey',
    shortPath: 'GitHub/Myavana-Hair-Journey',
    recommendedEngine: 'claude',
  },
  lyra: {
    id: 'lyra',
    name: 'Lyra',
    symbol: 'LY',
    domain: 'Mobile Integration & React Native SDK',
    defaultWorkspace: '/Users/winstonzulu/WebstormProjects/MyAvana_FrontEnd_RN',
    shortPath: 'WebstormProjects/MyAvana_FrontEnd_RN',
    recommendedEngine: 'gemini',
  },
  kael: {
    id: 'kael',
    name: 'Kael',
    symbol: 'KL',
    domain: 'QA & Independent Machine Proofs',
    defaultWorkspace: '/Users/winstonzulu/WebstormProjects/Myavana-Chatbot',
    shortPath: 'WebstormProjects/Myavana-Chatbot',
    recommendedEngine: 'claude',
  },
  atlas: {
    id: 'atlas',
    name: 'Atlas',
    symbol: 'AT',
    domain: 'Interim Coordinator & Security Guardian',
    defaultWorkspace: '/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team',
    shortPath: 'WebstormProjects/CreativeSites-Ai-Team',
    recommendedEngine: 'claude',
  },
  nexus: {
    id: 'nexus',
    name: 'Nexus',
    symbol: 'NX',
    domain: 'Platform Runtime Engineering',
    defaultWorkspace: '/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team',
    shortPath: 'WebstormProjects/CreativeSites-Ai-Team',
    recommendedEngine: 'claude',
  },
  antigravity: {
    id: 'antigravity',
    name: 'Antigravity',
    symbol: 'AG',
    domain: 'Automated Browser QA & Production Smoke Testing',
    defaultWorkspace: '/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team',
    shortPath: 'WebstormProjects/CreativeSites-Ai-Team',
    recommendedEngine: 'antigravity',
  },
};

export const getAgentDirectoryInfo = (agentId: string = 'atlas'): AgentDirectoryInfo => {
  const key = agentId.toLowerCase();
  return AGENT_DIRECTORY_MAP[key] || AGENT_DIRECTORY_MAP.atlas;
};
