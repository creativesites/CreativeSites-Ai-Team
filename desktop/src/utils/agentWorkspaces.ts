import { agentWorkspace, shortPath } from '../services/appConfig';

export interface AgentDirectoryInfo {
  id: string;
  name: string;
  symbol: string;
  domain: string;
  defaultWorkspace: string;
  shortPath: string;
  recommendedEngine: 'claude' | 'gemini' | 'antigravity' | 'shell';
}

// Repo paths are read from config each time, so they follow ~/.myaos/config.json.
const agent = (base: Omit<AgentDirectoryInfo, 'defaultWorkspace' | 'shortPath'>): AgentDirectoryInfo => ({
  ...base,
  get defaultWorkspace() {
    return agentWorkspace(base.id);
  },
  get shortPath() {
    return shortPath(agentWorkspace(base.id));
  },
});

export const AGENT_DIRECTORY_MAP: Record<string, AgentDirectoryInfo> = {
  astra: agent({
    id: 'astra',
    name: 'Astra',
    symbol: 'AS',
    domain: 'Widget SDK & AI Protocol',
    recommendedEngine: 'gemini',
  }),
  iris: agent({
    id: 'iris',
    name: 'Iris',
    symbol: 'IR',
    domain: 'Observer & Telemetry Lead',
    recommendedEngine: 'gemini',
  }),
  vela: agent({
    id: 'vela',
    name: 'Vela',
    symbol: 'VE',
    domain: 'WordPress System of Record & Host Bridge',
    recommendedEngine: 'claude',
  }),
  lyra: agent({
    id: 'lyra',
    name: 'Lyra',
    symbol: 'LY',
    domain: 'Mobile Integration & React Native SDK',
    recommendedEngine: 'gemini',
  }),
  kael: agent({
    id: 'kael',
    name: 'Kael',
    symbol: 'KL',
    domain: 'QA & Independent Machine Proofs',
    recommendedEngine: 'claude',
  }),
  atlas: agent({
    id: 'atlas',
    name: 'Atlas',
    symbol: 'AT',
    domain: 'Interim Coordinator & Security Guardian',
    recommendedEngine: 'claude',
  }),
  nexus: agent({
    id: 'nexus',
    name: 'Nexus',
    symbol: 'NX',
    domain: 'Platform Runtime Engineering',
    recommendedEngine: 'claude',
  }),
  antigravity: agent({
    id: 'antigravity',
    name: 'Antigravity',
    symbol: 'AG',
    domain: 'Automated Browser QA & Production Smoke Testing',
    recommendedEngine: 'antigravity',
  }),
};

export const getAgentDirectoryInfo = (agentId: string = 'atlas'): AgentDirectoryInfo => {
  const key = agentId.toLowerCase();
  return AGENT_DIRECTORY_MAP[key] || AGENT_DIRECTORY_MAP.atlas;
};
