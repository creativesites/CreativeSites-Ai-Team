export type RiskLevel = 'safe' | 'moderate' | 'consequential' | 'dangerous';
export type JobStatus = 'planning' | 'awaiting_approval' | 'working' | 'paused' | 'completed' | 'failed';

export interface Coworker {
  id: string; // e.g. 'astra', 'iris', 'vela', 'kael', 'atlas', 'muse'
  name: string; // e.g. 'Astra'
  title: string; // e.g. 'Product & AI Specialist'
  description: string;
  avatar: string;
  monogram: string;
  color: string;
  status: 'available' | 'working' | 'sleeping';
  currentJobTitle?: string;
  capabilities: string[];
  defaultWorkspace: string;
}

export interface ConnectedTool {
  id: string; // e.g. 'google_workspace', 'web_search', 'local_files', 'wordpress', 'slack', 'github', 'sqlite'
  name: string;
  category: 'Workspace' | 'Browser' | 'Code' | 'Database' | 'CMS' | 'Communication';
  status: 'connected' | 'disconnected' | 'requires_auth';
  iconName: string;
  description: string;
  usedByCoworkers: string[];
  permissions: {
    read: boolean;
    write: boolean;
    execute: boolean;
    delete: boolean;
  };
}

export interface Artifact {
  id: string;
  jobId: string;
  type: 'report' | 'health_audit' | 'content_draft' | 'design_concept' | 'code_diff' | 'executive_summary';
  title: string;
  subtitle?: string;
  summary: string;
  content: string;
  metrics?: { label: string; value: string | number; change?: string; positive?: boolean }[];
  sources?: string[];
  previewUrl?: string;
  actions?: { label: string; action: string; primary?: boolean }[];
  createdAt: string;
}

export interface Approval {
  id: string;
  jobId: string;
  jobTitle: string;
  coworkerId: string;
  coworkerName: string;
  riskLevel: RiskLevel;
  actionSummary: string;
  details: string;
  target: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
}

export interface JobStep {
  id: string;
  stepNumber: number;
  label: string;
  detail?: string;
  status: 'pending' | 'working' | 'completed' | 'failed';
  timestamp?: string;
}

export interface Job {
  id: string;
  title: string;
  userPrompt: string;
  status: JobStatus;
  progressPercentage: number;
  assignedCoworkers: string[]; // coworker IDs
  targetWorkspace: string;
  connectedToolsUsed: string[];
  stages: JobStep[];
  humanizedLog: string[];
  technicalLogs: string[];
  artifacts: Artifact[];
  pendingApproval?: Approval;
  evidencePassed?: boolean;
  verificationDetails?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Routine {
  id: string;
  title: string;
  skillId: string;
  coworkerId: string;
  schedule: string; // e.g. "Every morning at 9:00 AM", "Every 2 hours"
  enabled: boolean;
  lastRunTime?: string;
  lastRunStatus?: 'success' | 'failed';
  nextRunTime?: string;
  prompt: string;
}

export interface Skill {
  id: string;
  title: string;
  description: string;
  coworkerId: string;
  templatePrompt: string;
  category: string;
  toolsRequired: string[];
}

export interface ActivityItem {
  id: string;
  jobId?: string;
  type: 'job_completed' | 'job_started' | 'approval_needed' | 'routine_ran' | 'issue_found';
  title: string;
  description: string;
  coworkerId?: string;
  timestamp: string;
  status?: 'success' | 'warning' | 'info' | 'error';
}

// --- MyaOS Normal Mode Design Studio Architecture ---
export interface DesignDirection {
  id: string;
  name: string; // e.g., 'Editorial & Warm', 'SaaS Minimalist', 'High-Contrast Dark'
  description: string;
  primaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
}

export interface DesignComment {
  id: string;
  screenId: string;
  selector: string;
  text: string;
  author: string;
  xPercentage: number;
  yPercentage: number;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface DesignScreen {
  id: string;
  projectId: string;
  name: string; // e.g. '01 Landing Hero', '02 Checkout Flow'
  htmlContent: string;
  versionNumber: number;
  comments: DesignComment[];
  createdAt: string;
}

export interface DesignFlow {
  id: string;
  name: string; // e.g. 'Customer Onboarding Flow'
  screenIds: string[];
}

export interface DesignSystemToken {
  category: 'Colors' | 'Typography' | 'Components' | 'Spacing';
  name: string;
  value: string;
}

export interface DesignProject {
  id: string;
  title: string;
  description: string;
  workspaceCwd: string;
  selectedDirection?: DesignDirection;
  screens: DesignScreen[];
  activeScreenId: string;
  flows: DesignFlow[];
  extractedTokens: DesignSystemToken[];
  accessibilityScore?: number;
  createdAt: string;
  updatedAt: string;
}
