// Rule-based triage (WP2 task 2.3). Pure and deterministic: it must work with no agent online.
// The Orchestrator may override the result through an explicit override (recorded on the job).

export type Workflow = 'quick' | 'feature' | 'strategic' | 'incident';
export type Urgency = 'low' | 'normal' | 'high' | 'critical';
export type Impact = 'low' | 'medium' | 'high';
export type TriageRisk = 'low' | 'medium' | 'high' | 'critical';

export const WORKFLOWS: Workflow[] = ['quick', 'feature', 'strategic', 'incident'];

export interface TriageResult {
  workflow: Workflow;
  urgency: Urgency;
  impact: Impact;
  risk: TriageRisk;
  reason: string;
  /** Who decided: the rule engine, or the name of the overriding actor. */
  by: string;
  override: boolean;
}

export interface TriageOverride {
  workflow: Workflow;
  reason: string;
  by: string;
}

const CRITICAL_INCIDENT = /\b(down|outage|outages|production|prod|security|breach|breached|data loss|leak|leaked)\b/i;
const INCIDENT = new RegExp(`${CRITICAL_INCIDENT.source}|\\b(urgent|urgently|incident|emergency|hotfix|sev ?[12])\\b`, 'i');
const STRATEGIC =
  /\b(new product|platform|architecture|rearchitect|re-architect|from scratch|greenfield|migrate (the )?(whole|entire)|organi[sz]ation(al)? change)\b/i;
const QUICK_STRONG = /\b(typo|typos|bump|rename|renames|tweak|one-line|one line|copy change|small|minor|trivial|quick)\b/i;
const FEATURE = /\b(feature|features|add|adds|design|improve|improvement|implement|build|create|support|introduce)\b/i;
const QUICK_WEAK = /\b(fix|fixes|bug|patch|update|cleanup|clean up|lint|format)\b/i;

const firstMatch = (re: RegExp, text: string): string => (text.match(re)?.[0] ?? '').toLowerCase();

/** Classify a raw request. Order matters: incident, strategic, quick (strong), feature, quick (weak), default. */
export function triage(rawText: string): TriageResult {
  const text = rawText ?? '';
  const done = (
    workflow: Workflow,
    urgency: Urgency,
    impact: Impact,
    risk: TriageRisk,
    reason: string
  ): TriageResult => ({ workflow, urgency, impact, risk, reason, by: 'rules', override: false });

  if (INCIDENT.test(text)) {
    const kw = firstMatch(INCIDENT, text);
    const critical = CRITICAL_INCIDENT.test(text);
    return done('incident', critical ? 'critical' : 'high', 'high', critical ? 'high' : 'medium', `incident keyword "${kw}"`);
  }
  if (STRATEGIC.test(text) || /\bbuild (an? |the )?.{1,60}\bfrom scratch\b/i.test(text)) {
    return done('strategic', 'normal', 'high', 'medium', `strategic keyword "${firstMatch(STRATEGIC, text) || 'from scratch'}"`);
  }
  if (QUICK_STRONG.test(text)) {
    return done('quick', 'low', 'low', 'low', `quick keyword "${firstMatch(QUICK_STRONG, text)}"`);
  }
  if (FEATURE.test(text)) {
    return done('feature', 'normal', 'medium', 'low', `feature keyword "${firstMatch(FEATURE, text)}"`);
  }
  if (QUICK_WEAK.test(text)) {
    return done('quick', 'normal', 'low', 'low', `quick keyword "${firstMatch(QUICK_WEAK, text)}"`);
  }
  return done('feature', 'normal', 'medium', 'low', 'default');
}

/** Apply an Orchestrator override: the workflow and reason are replaced; urgency, impact and risk keep the rule values. */
export function applyOverride(base: TriageResult, override: TriageOverride): TriageResult {
  if (!WORKFLOWS.includes(override.workflow)) throw new Error(`unknown workflow ${override.workflow}`);
  const reason = String(override.reason ?? '').trim();
  const by = String(override.by ?? '').trim();
  if (!reason || !by) throw new Error('an override needs a reason and an actor (by)');
  return {
    ...base,
    workflow: override.workflow,
    reason: `override by ${by}: ${reason} (rules said ${base.workflow}: ${base.reason})`,
    by,
    override: true,
  };
}
