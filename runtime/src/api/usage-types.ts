// Wire types for subscription AI usage tracking (programme plan K6/K9).
// Type-only: the desktop imports this file. Keep in step with ../usage/*.ts.
// Percentages are read by a person from /usage ('actual'); attributions to tasks
// and per-task-type medians are always 'estimated'. No token caps or prices exist.

export type AiProvider = 'anthropic' | 'google';
export type AiLimitModel = 'claude_5h_weekly_pct' | 'gemini_app_5h_weekly_pct' | 'gemini_cli_requests_per_day';
export type UsageMeasurement = 'actual' | 'estimated';

export interface AiLimitSnapshot {
  id: string;
  accountId: string;
  capturedAt: string;
  sessionPct: number | null;
  sessionResetsAt: string | null;
  weeklyPct: number | null;
  weeklyResetsAt: string | null;
  requestsToday: number | null;
  source: 'manual' | 'cli_capture' | 'runtime_count';
  measurement: UsageMeasurement;
  note: string | null;
}

export interface AiAccount {
  id: string;
  provider: AiProvider;
  plan: string;
  label: string;
  ownerScope: string;
  limitModel: AiLimitModel;
  dailyRequestQuota: number | null;
  adapterAccountId: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface AiAccountWithSnapshot extends AiAccount {
  latestSnapshot: AiLimitSnapshot | null;
}

export interface CreateAiAccountInput {
  provider: AiProvider;
  plan: string;
  label: string;
  ownerScope?: string;
  limitModel: AiLimitModel;
  dailyRequestQuota?: number | null;
  adapterAccountId?: string | null;
}

export interface AiSnapshotInput {
  capturedAt?: string;
  sessionPct?: number | null;
  sessionResetsAt?: string | null;
  weeklyPct?: number | null;
  weeklyResetsAt?: string | null;
  requestsToday?: number | null;
  note?: string | null;
}

export interface UsageAlertRecord {
  id: string;
  accountId: string;
  windowResetsAt: string;
  weeklyPct: number;
  elapsedFraction: number;
  createdAt: string;
  acknowledgedAt: string | null;
}

export interface UsageBreakdownRow {
  key: string | null;
  attributedWeeklyPct: number;
  tasks: number;
  measurement: 'estimated';
}

export interface AccountWeeklyUsage {
  account: AiAccount;
  snapshot: AiLimitSnapshot | null;
  weeklyMeasurement: UsageMeasurement | null;
  weeklyPct: number | null;
  weeklyResetsAt: string | null;
  elapsedFraction: number | null;
  /** (weekly_pct / 100) / elapsed fraction. Above 1 means ahead of an even burn. */
  pace: number | null;
  stale: boolean;
  topAgents: UsageBreakdownRow[];
  topTaskTypes: UsageBreakdownRow[];
  alerts: UsageAlertRecord[];
}

export interface UsageEstimateRow {
  taskType: string | null;
  modelId: string | null;
  agentId: string | null;
  medianWeeklyPct: number;
  n: number;
  measurement: 'estimated';
}
