// Wire shapes for the WP11 screens. The runtime returns some of these as raw store rows
// (snake_case), so they are declared here rather than imported from the runtime.

export interface TimeInterval {
  id: string;
  actor_kind: 'human' | 'agent';
  identity_id: string;
  session_id: string | null;
  job_id: string | null;
  task_id: string | null;
  engagement_id: string | null;
  category: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  source: 'timer' | 'manual' | 'turn' | 'adjustment' | 'import';
  billable_status: 'unclassified' | 'billable' | 'non_billable';
  supports_interval_id: string | null;
  adjusts_interval_id: string | null;
  note: string | null;
}

export interface EngagementTerms {
  minWeeklyHours: number | null;
  maxWeeklyHours: number | null;
  remainingToMin: number | null;
  remainingToMax: number | null;
  estimatedBillableValueMinor: number | null;
  currency: string | null;
  paySchedule: string;
  agentHoursBillable: boolean;
}

export interface TimeSummary {
  from: string;
  to: string;
  humanHours: number;
  billableHumanHours: number;
  nonBillableHumanHours: number;
  agentHours: number;
  agentElapsedHours: number;
  agentHoursByIdentity: Record<string, number>;
  combinedHours: number;
  measurement: 'actual';
  engagement?: EngagementTerms & { id: string };
}

export interface Engagement {
  id: string;
  client: string;
  role: string | null;
  pay_schedule: string;
  currency: string | null;
  confidential: number;
}

export interface Timesheet {
  id: string;
  engagement_id: string;
  period_start: string;
  period_end: string;
  revision: number;
  state: 'draft' | 'submitted' | 'approved' | 'superseded';
  totals: Record<string, unknown> | string;
  interval_ids: string[] | string;
  export_hash: string;
  approved_by: string | null;
  approved_at: string | null;
}

export interface SkillSummary {
  id: string;
  name: string;
  version: string;
  contentHash: string;
  path: string;
  description: string;
  triggers: string[];
  workflows: string[];
  roles: string[];
  loadedAt: string;
}

export interface SkillDetail extends SkillSummary {
  body: string;
}

export interface SkillList {
  root: string | null;
  skills: SkillSummary[];
}

export interface CreateSkillPayload {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  owner?: string | null;
  triggers?: string[];
  workflows?: string[];
  roles?: string[];
  inputs?: string[];
  outputs?: string[];
  relatedSkills?: string[];
  body?: string;
  rawContent?: string;
}

export interface KnowledgeDocument {
  id: string;
  filename: string;
  title: string;
  category: string;
  classification: string;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number;
  contentHash: string;
  authorId: string;
  projectId: string | null;
  summary: string | null;
  extractedText: string | null;
  createdAt: string;
  updatedAt: string;
  content?: string;
}

export interface KnowledgeList {
  documents: KnowledgeDocument[];
  root: string;
}

export interface UploadKnowledgePayload {
  filename: string;
  content?: string;
  base64?: string;
  title?: string;
  category?: string;
  classification?: string;
  projectId?: string;
  authorId?: string;
}

export interface StandupFacts {
  tasksCompleted: { taskId: string; title: string; status: string; jobId: string | null }[];
  evidence: { id: string; kind: string; class: string; summary: string }[];
  blockersOpened: { id: string; summary: string }[];
  blockersResolved: { id: string; summary: string }[];
  jobStageChanges: { jobId: string; from: string | null; to: string | null }[];
  sessionsFailed: { sessionId: string; error: string | null }[];
}

export interface StandupReportAgent {
  agentId: string;
  name: string;
  status: 'reported' | 'no_update' | 'absent';
  reason: string | null;
  facts: StandupFacts;
  reported: { done: string; next: string; blockers: string[]; label: string } | null;
  discrepancies: string[];
}

export interface StandupReport {
  date: string;
  since: string;
  generatedAt: string;
  teamId: string;
  agents: StandupReportAgent[];
  teamFacts: StandupFacts;
  summary: { reported: number; noUpdate: number; absent: number; discrepancies: number; blockersReported: number };
}

export interface LatestStandup {
  id: number;
  date: string;
  ts: string;
  report: StandupReport | null;
  markdown: string | null;
  filePath: string | null;
}

export interface ScheduleRunRow {
  id: string;
  scheduleId: string;
  dueAt: string;
  ranAt: string;
  status: string;
  delayMs: number;
  detail: string | null;
}

export interface TimelineItem {
  at: string;
  kind: string;
  source: string;
  actor: string | null;
  summary: string;
  ref: string | null;
}

export interface ModelRegistryRow {
  provider: string;
  modelId: string;
  contextWindow: number | null;
  notes: string;
  updatedAt: string;
}
