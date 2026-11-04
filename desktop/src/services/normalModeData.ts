import { Coworker, ConnectedTool, Skill } from '../types/normalMode';
import { agentWorkspace } from './appConfig';

export const DEFAULT_COWORKERS: Coworker[] = [
  {
    id: 'muse',
    name: 'Muse',
    title: 'Design & Prototyping Specialist',
    description: 'Turns concepts into live interactive prototypes, visual user flows, and brand design systems.',
    avatar: '/app-icon.png',
    monogram: 'MU',
    color: 'bg-fuchsia-600',
    status: 'unknown',
    capabilities: ['UI/UX Prototyping', 'Interactive Canvas', 'Brand Systems', 'Accessibility Audits'],
    get defaultWorkspace() {
      return agentWorkspace('muse');
    },
  },
  {
    id: 'astra',
    name: 'Astra',
    title: 'Product & AI Specialist',
    description: 'Turns ideas into product experiences, AI workflows, and polished interface design.',
    avatar: '/app-icon.png',
    monogram: 'AS',
    color: 'bg-violet-500',
    status: 'unknown',
    capabilities: ['UI & Web Design', 'AI Stream Protocols', 'Gemini & Claude Models', 'Feature Specs'],
    get defaultWorkspace() {
      return agentWorkspace('astra');
    },
  },
  {
    id: 'iris',
    name: 'Iris',
    title: 'Operations & Insights',
    description: 'Monitors analytics, customer information, telemetries, and turns data into clear decisions.',
    avatar: '/app-icon.png',
    monogram: 'IR',
    color: 'bg-blue-500',
    status: 'unknown',
    capabilities: ['Telemetry & Analytics', 'Customer 360', 'System Audits', 'Data Synthesis'],
    get defaultWorkspace() {
      return agentWorkspace('iris');
    },
  },
  {
    id: 'vela',
    name: 'Vela',
    title: 'Web & Content Specialist',
    description: 'Manages websites, WordPress publishing, content bridges, and digital storefronts.',
    avatar: '/app-icon.png',
    monogram: 'VE',
    color: 'bg-emerald-500',
    status: 'unknown',
    capabilities: ['WordPress & Next.js', 'Content Publishing', 'Site Inspections', 'SEO & Copy'],
    get defaultWorkspace() {
      return agentWorkspace('vela');
    },
  },
  {
    id: 'kael',
    name: 'Kael',
    title: 'Quality & Verification',
    description: 'Tests work, inspects machine proofs, executes regression suites, and catches bugs before release.',
    avatar: '/app-icon.png',
    monogram: 'KL',
    color: 'bg-rose-500',
    status: 'unknown',
    capabilities: ['Automated QA', 'Evidence Audits', 'Git Diff Checks', 'Regression Testing'],
    get defaultWorkspace() {
      return agentWorkspace('kael');
    },
  },
  {
    id: 'atlas',
    name: 'Atlas',
    title: 'Project & Delivery Lead',
    description: 'Coordinates multi-coworker jobs, manages release handoffs, and ensures goals are achieved on schedule.',
    avatar: '/app-icon.png',
    monogram: 'AT',
    color: 'bg-slate-700',
    status: 'unknown',
    capabilities: ['Job Coordination', 'Cross-Repo Dispatch', 'Release Readiness', 'Security Gates'],
    get defaultWorkspace() {
      return agentWorkspace('atlas');
    },
  },
];

export const DEFAULT_CONNECTED_TOOLS: ConnectedTool[] = [
  {
    id: 'google_workspace',
    name: 'Google Workspace',
    category: 'Workspace',
    status: 'unchecked',
    iconName: 'Mail',
    description: 'Gmail, Drive documents, and Calendar schedules.',
    usedByCoworkers: ['Iris', 'Atlas'],
    permissions: { read: true, write: true, execute: false, delete: false },
  },
  {
    id: 'web_search',
    name: 'Web & Live Browser',
    category: 'Browser',
    status: 'unchecked',
    iconName: 'Globe',
    description: 'Real-time search, website scraping, and Playwright browser QA.',
    usedByCoworkers: ['Vela', 'Kael', 'Astra', 'Muse'],
    permissions: { read: true, write: false, execute: true, delete: false },
  },
  {
    id: 'local_files',
    name: 'Local Repos & Workspace',
    category: 'Code',
    status: 'unchecked',
    iconName: 'Folder',
    description: 'Desktop files, git repositories, and project assets.',
    usedByCoworkers: ['Astra', 'Vela', 'Iris', 'Kael', 'Atlas', 'Muse'],
    permissions: { read: true, write: true, execute: true, delete: false },
  },
  {
    id: 'wordpress',
    name: 'WordPress CMS',
    category: 'CMS',
    status: 'unchecked',
    iconName: 'Layout',
    description: 'Myavana Hair Journey WordPress platform REST APIs.',
    usedByCoworkers: ['Vela'],
    permissions: { read: true, write: true, execute: false, delete: false },
  },
  {
    id: 'slack',
    name: 'Slack Team Hub',
    category: 'Communication',
    status: 'unchecked',
    iconName: 'MessageSquare',
    description: 'Team alerts and automated channel updates.',
    usedByCoworkers: ['Iris', 'Atlas'],
    permissions: { read: true, write: true, execute: false, delete: false },
  },
  {
    id: 'sqlite_substrate',
    name: 'SQLite Substrate DB',
    category: 'Database',
    status: 'unchecked',
    iconName: 'Database',
    description: 'Local WAL-mode SQLite state engine at data/myaos.db.',
    usedByCoworkers: ['Atlas', 'Kael', 'Iris'],
    permissions: { read: true, write: true, execute: true, delete: false },
  },
];

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'sk_inbox_digest',
    title: 'Executive Inbox Summarizer',
    description: 'Scans incoming emails, extracts action items, and presents a 2-minute summary.',
    coworkerId: 'iris',
    templatePrompt: 'Summarize today\'s important emails into an executive brief.',
    category: 'Operations',
    toolsRequired: ['Google Workspace'],
  },
  {
    id: 'sk_web_health',
    title: 'Website Health & Uptime Monitor',
    description: 'Checks site response, SSL validity, and runs e2e Playwright smoke checks.',
    coworkerId: 'kael',
    templatePrompt: 'Check my website for anything broken and verify uptime.',
    category: 'Quality',
    toolsRequired: ['Web Search', 'Local Files'],
  },
  {
    id: 'sk_landing_page',
    title: 'UI Landing Page Generator',
    description: 'Decomposes landing page requirements into polished HTML/CSS React components.',
    coworkerId: 'muse',
    templatePrompt: 'Build a modern landing page concept with hero section and feature cards.',
    category: 'Design & Code',
    toolsRequired: ['Local Files'],
  },
];
