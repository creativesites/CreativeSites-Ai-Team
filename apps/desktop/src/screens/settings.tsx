import * as React from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cpu,
  FileText,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import type {
  AdapterInfo,
  ApprovalPolicy,
  BridgeStatus,
  Budget,
  CreateBudgetInput,
  CreatePolicyInput,
  Identity,
  Project,
  Risk,
  Settings,
  UpdatePolicyInput,
} from '@runtime/types';
import { Avatar, OwnerAvatar } from '@/components/app/avatar';
import { EmptyState, SectionTitle, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { useRuntime, useRuntimeData, type Loadable } from '@/lib/runtime-context';
import { href } from '@/lib/route';
import { cn } from '@/lib/utils';

export interface SettingsScreenProps {
  settings?: Settings;
  identities?: Identity[];
  budgets?: Budget[];
  policies?: ApprovalPolicy[];
  adapters?: AdapterInfo[];
  projects?: Project[];
  bridgeStatus?: BridgeStatus;
  onUpdateSettings?: (patch: Settings) => Promise<void>;
  onCreateBudget?: (input: CreateBudgetInput) => Promise<void>;
  onCreatePolicy?: (input: CreatePolicyInput) => Promise<void>;
  onUpdatePolicy?: (id: string, input: UpdatePolicyInput) => Promise<void>;
  onDeletePolicy?: (id: string) => Promise<void>;
}

const list = <T,>(l: Loadable<T[]>): T[] => (l.status === 'ready' ? l.data : []);

function formatCents(cents?: number | null): string {
  if (cents == null || isNaN(cents)) return '0.00';
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(val: string): number {
  const num = parseFloat(val.replace(/[^0-9.]/g, ''));
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

function riskTone(risk: Risk): 'quiet' | 'observed' | 'needs-you' | 'risk' {
  switch (risk) {
    case 'low':
      return 'quiet';
    case 'medium':
      return 'observed';
    case 'high':
      return 'needs-you';
    case 'critical':
      return 'risk';
  }
}

function authBadge(auth?: AdapterInfo['auth']): {
  tone: 'observed' | 'verified' | 'needs-you' | 'claimed' | 'risk' | 'quiet';
  label: string;
} {
  switch (auth?.state) {
    case 'ready':
      return { tone: 'verified', label: 'Ready' };
    case 'configured':
      return { tone: 'observed', label: 'Configured' };
    case 'needs_login':
      return { tone: 'needs-you', label: 'Needs login' };
    case 'missing_binary':
      return { tone: 'claimed', label: 'Not installed' };
    case 'unsupported':
      return { tone: 'risk', label: 'Unsupported' };
    default:
      return { tone: 'quiet', label: 'Unknown' };
  }
}

const inputClass =
  'glass-panel h-8.5 rounded-md px-2.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-foreground/40';

export function SettingsScreen(props: SettingsScreenProps) {
  const { client, state: connectionState, revision } = useRuntime();

  // Load from runtime data if not in props
  const runtimeSettings = useRuntimeData((c) => c.settings());
  const runtimeIdentities = useRuntimeData((c) => c.identities());
  const runtimeBudgets = useRuntimeData((c) => c.budgets());
  const runtimePolicies = useRuntimeData((c) => c.policies());
  const runtimeAdapters = useRuntimeData((c) => c.adapters());
  const runtimeProjects = useRuntimeData((c) => c.projects());
  const runtimeBridgeStatus = useRuntimeData((c) => c.bridgeStatus());

  const settings = props.settings ?? (runtimeSettings.status === 'ready' ? runtimeSettings.data : {});
  const identities = props.identities ?? list(runtimeIdentities);
  const budgets = props.budgets ?? list(runtimeBudgets);
  const policies = props.policies ?? list(runtimePolicies);
  const adapters = props.adapters ?? list(runtimeAdapters);
  const projects = props.projects ?? list(runtimeProjects);
  const bridgeStatus =
    props.bridgeStatus ?? (runtimeBridgeStatus.status === 'ready' ? runtimeBridgeStatus.data : undefined);

  const isOffline = connectionState.status !== 'connected';

  // Handlers
  const handleUpdateSettings = async (patch: Settings) => {
    if (props.onUpdateSettings) {
      await props.onUpdateSettings(patch);
    } else if (client) {
      await client.updateSettings(patch);
    }
  };

  const handleCreateBudget = async (input: CreateBudgetInput) => {
    if (props.onCreateBudget) {
      await props.onCreateBudget(input);
    } else if (client) {
      await client.createBudget(input);
    }
  };

  const handleCreatePolicy = async (input: CreatePolicyInput) => {
    if (props.onCreatePolicy) {
      await props.onCreatePolicy(input);
    } else if (client) {
      await client.createPolicy(input);
    }
  };

  const handleUpdatePolicy = async (id: string, input: UpdatePolicyInput) => {
    if (props.onUpdatePolicy) {
      await props.onUpdatePolicy(id, input);
    } else if (client) {
      await client.updatePolicy(id, input);
    }
  };

  const handleDeletePolicy = async (id: string) => {
    if (props.onDeletePolicy) {
      await props.onDeletePolicy(id);
    } else if (client) {
      await client.deletePolicy(id);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-2">
      <header className="flex flex-col leading-tight">
        <span className="text-xs text-muted-foreground">App Configuration</span>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      </header>

      {/* 1. Owner Identity */}
      <OwnerIdentitySection
        settings={settings}
        identities={identities}
        isOffline={isOffline}
        onUpdateSettings={handleUpdateSettings}
      />

      {/* 2. Budgets & Spending Ceilings */}
      <BudgetsSection
        settings={settings}
        budgets={budgets}
        projects={projects}
        isOffline={isOffline}
        onUpdateSettings={handleUpdateSettings}
        onCreateBudget={handleCreateBudget}
      />

      {/* 3. Approval Policies */}
      <ApprovalPoliciesSection
        policies={policies}
        projects={projects}
        identities={identities}
        ownerId={typeof settings.ownerId === 'string' ? settings.ownerId : 'winston'}
        isOffline={isOffline}
        onCreatePolicy={handleCreatePolicy}
        onUpdatePolicy={handleUpdatePolicy}
        onDeletePolicy={handleDeletePolicy}
      />

      {/* 4. AI Engines & Agent Runtimes */}
      <AiEnginesSection
        adapters={adapters}
        settings={settings}
        identities={identities}
        isOffline={isOffline}
        onUpdateSettings={handleUpdateSettings}
        revision={revision}
      />

      {/* 5. Team Bridge */}
      <TeamBridgeSection
        settings={settings}
        bridgeStatus={bridgeStatus}
        isOffline={isOffline}
        onUpdateSettings={handleUpdateSettings}
      />

      {/* 6. Runtime Health moved to its own screen (WP11) */}
      <section aria-label="Moved screens" className="bg-card flex flex-col gap-2 rounded-xl p-5 text-sm">
        <SectionTitle>Moved</SectionTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Runtime health and adapter readiness now live in <a className="underline" href={href({ name: 'health' })}>Runtime &amp; Health</a>. AI usage lives in{' '}
          <a className="underline" href={href({ name: 'ai' })}>AI Resources &amp; Usage</a>.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- 1. Owner Identity Section

function OwnerIdentitySection({
  settings,
  identities,
  isOffline,
  onUpdateSettings,
}: {
  settings: Settings;
  identities: Identity[];
  isOffline: boolean;
  onUpdateSettings: (patch: Settings) => Promise<void>;
}) {
  const currentOwnerId =
    (typeof settings.ownerId === 'string' && settings.ownerId) ||
    identities.find((i) => i.isOwner)?.id ||
    'winston';

  const ownerIdentity = identities.find((i) => i.id === currentOwnerId);
  const [selectedId, setSelectedId] = React.useState(currentOwnerId);
  const [saving, setSaving] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedId(currentOwnerId);
  }, [currentOwnerId]);

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      await onUpdateSettings({ ownerId: selectedId });
      setStatusMsg('Saved');
      setTimeout(() => setStatusMsg(null), 2500);
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Owner identity" className="bg-card flex flex-col gap-4 rounded-xl p-5 shadow-sm">
      <SectionTitle aside="Human owner record">Owner Identity</SectionTitle>
      <p className="text-xs leading-relaxed text-muted-foreground">
        The owner is a real identity record. Consequential actions (merges, deploys, production writes, spends exceeding
        budgets) require owner approval. The owner identity is auditable across all events.
      </p>

      <div className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-xl p-4">
        <div className="flex items-center gap-3.5">
          <OwnerAvatar name={ownerIdentity?.name ?? currentOwnerId} size={42} />
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{ownerIdentity?.name ?? currentOwnerId}</span>
              <span className="font-mono text-xs text-muted-foreground">({currentOwnerId})</span>
              <Tag tone="verified">Owner</Tag>
            </div>
            <span className="text-xs text-muted-foreground">
              {ownerIdentity?.role ?? 'Owner / Founder'} · approves high & critical risk
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={isOffline || identities.length === 0}
            className={inputClass}
          >
            {identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.id}){i.isOwner ? ' · owner' : ''}
              </option>
            ))}
          </select>
          {selectedId !== currentOwnerId && (
            <button
              type="button"
              disabled={saving || isOffline}
              onClick={handleSave}
              className={buttonVariants({ variant: 'default', size: 'xs' })}
            >
              {saving ? 'Saving…' : 'Set as Owner'}
            </button>
          )}
          {statusMsg && <span className="text-xs text-verified">{statusMsg}</span>}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 2. Budgets Section

function BudgetsSection({
  settings,
  budgets,
  projects,
  isOffline,
  onUpdateSettings,
  onCreateBudget,
}: {
  settings: Settings;
  budgets: Budget[];
  projects: Project[];
  isOffline: boolean;
  onUpdateSettings: (patch: Settings) => Promise<void>;
  onCreateBudget: (input: CreateBudgetInput) => Promise<void>;
}) {
  const [defaultJobDollars, setDefaultJobDollars] = React.useState(
    formatCents(typeof settings.defaultBudgetCents === 'number' ? settings.defaultBudgetCents : 5000)
  );
  const [defaultMonthDollars, setDefaultMonthDollars] = React.useState(
    formatCents(typeof settings.defaultMonthlyBudgetCents === 'number' ? settings.defaultMonthlyBudgetCents : 20000)
  );
  const [savingGlobal, setSavingGlobal] = React.useState(false);
  const [globalStatus, setGlobalStatus] = React.useState<string | null>(null);

  // New project budget form state
  const [showAddProjectBudget, setShowAddProjectBudget] = React.useState(false);
  const [selectedProjectId, setSelectedProjectId] = React.useState('');
  const [projectBudgetPeriod, setProjectBudgetPeriod] = React.useState<'job' | 'day' | 'month'>('month');
  const [projectBudgetDollars, setProjectBudgetDollars] = React.useState('100.00');
  const [addingBudget, setAddingBudget] = React.useState(false);
  const [budgetError, setBudgetError] = React.useState<string | null>(null);

  const saveGlobalDefaults = async () => {
    setSavingGlobal(true);
    setGlobalStatus(null);
    try {
      const jobCents = parseDollarsToCents(defaultJobDollars);
      const monthCents = parseDollarsToCents(defaultMonthDollars);

      await onUpdateSettings({
        defaultBudgetCents: jobCents,
        defaultMonthlyBudgetCents: monthCents,
      });

      // Also ensure global budget records match
      await onCreateBudget({ scope: 'global', period: 'job', amountCents: jobCents });
      await onCreateBudget({ scope: 'global', period: 'month', amountCents: monthCents });

      setGlobalStatus('Saved');
      setTimeout(() => setGlobalStatus(null), 2500);
    } catch (e) {
      setGlobalStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleAddProjectBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    setAddingBudget(true);
    setBudgetError(null);
    try {
      const cents = parseDollarsToCents(projectBudgetDollars);
      await onCreateBudget({
        scope: 'project',
        projectId: selectedProjectId,
        period: projectBudgetPeriod,
        amountCents: cents,
      });
      setShowAddProjectBudget(false);
      setSelectedProjectId('');
    } catch (err) {
      setBudgetError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingBudget(false);
    }
  };

  const projectBudgets = budgets.filter((b) => b.scope === 'project');

  return (
    <section aria-label="Budgets" className="bg-card flex flex-col gap-4 rounded-xl p-5 shadow-sm">
      <SectionTitle aside="Ceilings enforced before sessions start">Budgets & Ceilings</SectionTitle>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Spending limits protect against runaway model and tool usage. If a session or council would exceed its ceiling,
        the runtime refuses to start (HTTP 409).
      </p>

      {/* Global defaults */}
      <div className="glass-panel flex flex-col gap-3 rounded-xl p-4 text-xs">
        <span className="font-semibold text-foreground">Global Budget Defaults</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-muted-foreground">
            Default per-job ceiling ($ USD)
            <div className="relative flex items-center">
              <span className="absolute left-2.5 text-muted-foreground">$</span>
              <input
                type="text"
                value={defaultJobDollars}
                onChange={(e) => setDefaultJobDollars(e.target.value)}
                className={cn(inputClass, 'w-full pl-6')}
                placeholder="50.00"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground">
            Default monthly team ceiling ($ USD)
            <div className="relative flex items-center">
              <span className="absolute left-2.5 text-muted-foreground">$</span>
              <input
                type="text"
                value={defaultMonthDollars}
                onChange={(e) => setDefaultMonthDollars(e.target.value)}
                className={cn(inputClass, 'w-full pl-6')}
                placeholder="200.00"
              />
            </div>
          </label>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-muted-foreground">
            {globalStatus ? (
              <span className="text-verified">{globalStatus}</span>
            ) : (
              'Applied when a project or job has no specific ceiling.'
            )}
          </span>
          <button
            type="button"
            disabled={savingGlobal || isOffline}
            onClick={saveGlobalDefaults}
            className={buttonVariants({ variant: 'default', size: 'xs' })}
          >
            {savingGlobal ? 'Saving…' : 'Save Defaults'}
          </button>
        </div>
      </div>

      {/* Project budgets */}
      <div className="flex flex-col gap-2.5 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">Project Budget Overrides</span>
          <button
            type="button"
            disabled={isOffline || projects.length === 0}
            onClick={() => setShowAddProjectBudget(!showAddProjectBudget)}
            className={buttonVariants({ variant: 'glass', size: 'xs' })}
          >
            <Plus className="size-3" />
            Set project budget
          </button>
        </div>

        {showAddProjectBudget && (
          <form onSubmit={handleAddProjectBudget} className="glass-panel flex flex-col gap-3 rounded-lg p-3 text-xs">
            <span className="font-medium text-foreground">Configure Project Ceiling</span>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-muted-foreground">
                Project *
                <select
                  required
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-muted-foreground">
                Period
                <select
                  value={projectBudgetPeriod}
                  onChange={(e) => setProjectBudgetPeriod(e.target.value as 'job' | 'day' | 'month')}
                  className={inputClass}
                >
                  <option value="job">Per job</option>
                  <option value="month">Per month</option>
                  <option value="day">Per day</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-muted-foreground">
                Limit ($ USD)
                <div className="relative flex items-center">
                  <span className="absolute left-2 text-muted-foreground">$</span>
                  <input
                    type="text"
                    value={projectBudgetDollars}
                    onChange={(e) => setProjectBudgetDollars(e.target.value)}
                    className={cn(inputClass, 'w-full pl-5')}
                    placeholder="100.00"
                  />
                </div>
              </label>
            </div>
            {budgetError && <p className="text-risk">{budgetError}</p>}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddProjectBudget(false)}
                className={buttonVariants({ variant: 'glass', size: 'xs' })}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingBudget || !selectedProjectId}
                className={buttonVariants({ variant: 'default', size: 'xs' })}
              >
                {addingBudget ? 'Saving…' : 'Save Project Budget'}
              </button>
            </div>
          </form>
        )}

        {projectBudgets.length === 0 ? (
          <p className="text-xs text-muted-foreground">No per-project overrides configured. Global ceilings apply.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {projectBudgets.map((b) => {
              const project = projects.find((p) => p.id === b.projectId);
              return (
                <div
                  key={b.id}
                  className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold">{project?.name ?? b.projectId ?? 'Project'}</span>
                    <Tag tone="quiet">per-{b.period}</Tag>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium">${formatCents(b.amountCents)} {b.currency}</span>
                    <span className="text-[11px] text-muted-foreground">
                      Updated {new Date(b.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 3. Approval Policies Section

const COMMON_ACTION_TYPES = [
  { id: 'merge', label: 'Merge branch / PR' },
  { id: 'push', label: 'Push commit to remote' },
  { id: 'force_push', label: 'Force push to remote' },
  { id: 'deploy', label: 'Deploy to environment' },
  { id: 'rollback', label: 'Rollback deployment' },
  { id: 'db_write', label: 'Production database write' },
  { id: 'spend', label: 'Spend authorization' },
  { id: 'all', label: 'All consequential actions' },
];

function ApprovalPoliciesSection({
  policies,
  projects,
  identities,
  ownerId,
  isOffline,
  onCreatePolicy,
  onUpdatePolicy,
  onDeletePolicy,
}: {
  policies: ApprovalPolicy[];
  projects: Project[];
  identities: Identity[];
  ownerId: string;
  isOffline: boolean;
  onCreatePolicy: (input: CreatePolicyInput) => Promise<void>;
  onUpdatePolicy: (id: string, input: UpdatePolicyInput) => Promise<void>;
  onDeletePolicy: (id: string) => Promise<void>;
}) {
  const [showAddPolicy, setShowAddPolicy] = React.useState(false);
  const [scope, setScope] = React.useState<'global' | 'project'>('global');
  const [projectId, setProjectId] = React.useState('');
  const [actionType, setActionType] = React.useState('merge');
  const [maxRiskForLead, setMaxRiskForLead] = React.useState<Risk>('medium');
  const [leadId, setLeadId] = React.useState('');
  const [timeoutMinutes, setTimeoutMinutes] = React.useState('120');
  const [addingPolicy, setAddingPolicy] = React.useState(false);
  const [policyError, setPolicyError] = React.useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionType.trim()) return;
    setAddingPolicy(true);
    setPolicyError(null);
    try {
      await onCreatePolicy({
        scope,
        projectId: scope === 'project' ? projectId || null : null,
        actionType: actionType.trim(),
        maxRiskForLead,
        leadId: leadId || null,
        escalateTo: ownerId,
        timeoutMinutes: parseInt(timeoutMinutes, 10) || 120,
        enabled: true,
      });
      setShowAddPolicy(false);
    } catch (err) {
      setPolicyError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingPolicy(false);
    }
  };

  return (
    <section aria-label="Approval policies" className="bg-card flex flex-col gap-4 rounded-xl p-5 shadow-sm">
      <SectionTitle
        aside={
          <button
            type="button"
            disabled={isOffline}
            onClick={() => setShowAddPolicy(!showAddPolicy)}
            className={buttonVariants({ variant: 'glass', size: 'xs' })}
          >
            <Plus className="size-3" />
            Add policy
          </button>
        }
      >
        Approval Policies ({policies.length})
      </SectionTitle>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Defines which actions a team lead may approve vs actions that escalate to the human owner. Low and medium risk
        route to the lead agent; high and critical risk always require owner sign-off.
      </p>

      {showAddPolicy && (
        <form onSubmit={handleCreate} className="glass-panel flex flex-col gap-3 rounded-lg p-3 text-xs">
          <span className="font-medium text-foreground">New Approval Policy</span>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-muted-foreground">
              Scope
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as 'global' | 'project')}
                className={inputClass}
              >
                <option value="global">Global (all projects)</option>
                <option value="project">Project-specific</option>
              </select>
            </label>

            {scope === 'project' && (
              <label className="flex flex-col gap-1 text-muted-foreground">
                Project *
                <select
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1 text-muted-foreground">
              Action type *
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className={inputClass}
              >
                {COMMON_ACTION_TYPES.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.id})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-muted-foreground">
              Max risk for lead agent
              <select
                value={maxRiskForLead}
                onChange={(e) => setMaxRiskForLead(e.target.value as Risk)}
                className={inputClass}
              >
                <option value="low">Low only</option>
                <option value="medium">Medium (standard)</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-muted-foreground">
              Lead agent
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className={inputClass}
              >
                <option value="">Any project lead</option>
                {identities.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.role ?? 'Coworker'})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-muted-foreground">
              Timeout before escalation (minutes)
              <input
                type="number"
                min="5"
                max="10080"
                value={timeoutMinutes}
                onChange={(e) => setTimeoutMinutes(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          {policyError && <p className="text-risk">{policyError}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddPolicy(false)}
              className={buttonVariants({ variant: 'glass', size: 'xs' })}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addingPolicy || !actionType.trim()}
              className={buttonVariants({ variant: 'default', size: 'xs' })}
            >
              {addingPolicy ? 'Creating…' : 'Create Policy'}
            </button>
          </div>
        </form>
      )}

      {policies.length === 0 ? (
        <EmptyState title="No approval policies configured">
          Default routing applies: low/medium actions route to the team lead agent; high/critical route to the owner.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {policies.map((policy) => {
            const leadIdentity = identities.find((i) => i.id === policy.leadId);
            const project = projects.find((p) => p.id === policy.projectId);
            return (
              <div
                key={policy.id}
                className={cn(
                  'glass-panel flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-xs',
                  !policy.enabled && 'opacity-60'
                )}
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                  <span className="font-semibold font-mono text-foreground">{policy.actionType}</span>
                  <Tag tone={policy.scope === 'global' ? 'quiet' : 'observed'}>
                    {policy.scope === 'project' ? `Project: ${project?.name ?? policy.projectId}` : 'Global'}
                  </Tag>
                  <span className="text-muted-foreground">
                    Lead approves up to:{' '}
                    <Tag tone={riskTone(policy.maxRiskForLead)}>{policy.maxRiskForLead}</Tag>
                  </span>
                  {leadIdentity ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Avatar who={leadIdentity} size={14} />
                      {leadIdentity.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">(Any Lead)</span>
                  )}
                  <span className="text-muted-foreground">
                    Escalates in {policy.timeoutMinutes}m
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdatePolicy(policy.id, { enabled: !policy.enabled })}
                    className={buttonVariants({ variant: policy.enabled ? 'glass' : 'outline', size: 'xs' })}
                  >
                    {policy.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    type="button"
                    title="Delete policy"
                    onClick={() => onDeletePolicy(policy.id)}
                    className="text-muted-foreground hover:text-risk p-1 transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 4. AI Engines & Agent Runtimes Section

function AiEnginesSection({
  adapters: initialAdapters,
  settings,
  identities,
  isOffline,
  onUpdateSettings,
  revision: _revision,
}: {
  adapters: AdapterInfo[];
  settings: Settings;
  identities: Identity[];
  isOffline: boolean;
  onUpdateSettings: (patch: Settings) => Promise<void>;
  revision: number;
}) {
  const { client } = useRuntime();
  const [adapters, setAdapters] = React.useState<AdapterInfo[]>(initialAdapters);
  const [probing, setProbing] = React.useState(false);

  // Sync when initialAdapters updates
  React.useEffect(() => {
    if (initialAdapters.length > 0) {
      setAdapters(initialAdapters);
    }
  }, [initialAdapters]);

  // Default engine state
  const currentDefault = (settings.defaultRuntime as string) || 'antigravity';
  const [defaultEngine, setDefaultEngine] = React.useState(currentDefault);
  const [savingDefault, setSavingDefault] = React.useState(false);

  React.useEffect(() => {
    if (settings.defaultRuntime && typeof settings.defaultRuntime === 'string') {
      setDefaultEngine(settings.defaultRuntime);
    }
  }, [settings.defaultRuntime]);

  // Batch agent update state
  const [batchUpdating, setBatchUpdating] = React.useState(false);
  const [batchMsg, setBatchMsg] = React.useState<string | null>(null);

  // Secrets state
  const [envStatus, setEnvStatus] = React.useState<{ hasAntigravityKey: boolean; hasGeminiKey: boolean; keys: string[] } | null>(null);
  const [selectedKeyName, setSelectedKeyName] = React.useState<'ANTIGRAVITY_API_KEY' | 'GEMINI_API_KEY' | 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY'>('ANTIGRAVITY_API_KEY');
  const [secretVal, setSecretVal] = React.useState('');
  const [savingSecret, setSavingSecret] = React.useState(false);
  const [secretFeedback, setSecretFeedback] = React.useState<string | null>(null);

  // Load env keys status
  const loadEnvStatus = React.useCallback(async () => {
    if (!client) return;
    try {
      const res = await client.adaptersEnv();
      setEnvStatus(res);
    } catch {
      /* ignore */
    }
  }, [client]);

  React.useEffect(() => {
    void loadEnvStatus();
  }, [loadEnvStatus]);

  // Re-probe adapters
  const handleReProbe = async () => {
    if (!client || isOffline) return;
    setProbing(true);
    try {
      const res = await client.adapters(true);
      setAdapters(res);
      await loadEnvStatus();
    } finally {
      setProbing(false);
    }
  };

  // Set default engine
  const handleSetDefaultEngine = async (eng: string) => {
    if (isOffline) return;
    setDefaultEngine(eng);
    setSavingDefault(true);
    try {
      await onUpdateSettings({ defaultRuntime: eng });
    } finally {
      setSavingDefault(false);
    }
  };

  // Batch assign unconfigured agents to Antigravity
  const handleBatchSetAntigravity = async () => {
    if (!client || isOffline) return;
    setBatchUpdating(true);
    setBatchMsg(null);
    try {
      const res = await client.batchSetIdentityRuntime('antigravity --acp', true);
      setBatchMsg(`Assigned Antigravity to ${res.updated} agent${res.updated === 1 ? '' : 's'}.`);
    } catch (err) {
      setBatchMsg(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBatchUpdating(false);
    }
  };

  // Save secret
  const handleSaveSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !secretVal.trim() || isOffline) return;
    setSavingSecret(true);
    setSecretFeedback(null);
    try {
      const updated = await client.setAdapterEnv(selectedKeyName, secretVal.trim());
      setAdapters(updated);
      setSecretVal('');
      setSecretFeedback(`Saved ${selectedKeyName} to ~/.myaos/adapters.env (0600).`);
      await loadEnvStatus();
    } catch (err) {
      setSecretFeedback(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingSecret(false);
    }
  };

  // Count team members by engine
  const teamMembers = identities.filter((i) => !i.isOwner && i.id !== 'winston');
  const antigravityMembers = teamMembers.filter((i) => {
    const r = (i.runtime || '').toLowerCase();
    return r.includes('antigravity') || r.includes('agy') || (!r && defaultEngine === 'antigravity');
  });
  const claudeMembers = teamMembers.filter((i) => (i.runtime || '').toLowerCase().includes('claude'));
  const codexMembers = teamMembers.filter((i) => (i.runtime || '').toLowerCase().includes('codex'));
  const geminiMembers = teamMembers.filter((i) => (i.runtime || '').toLowerCase().includes('gemini'));
  const unconfiguredMembers = teamMembers.filter((i) => !i.runtime || !i.runtime.trim());

  const ENGINE_OPTIONS = [
    {
      id: 'antigravity',
      name: 'Antigravity',
      tagline: 'Google DeepMind Agentic Pair Programmer',
      badge: 'Recommended',
      command: 'antigravity --acp',
      icon: Sparkles,
      iconColor: 'text-primary',
    },
    {
      id: 'claude',
      name: 'Claude Code',
      tagline: 'Anthropic CLI Subprocess',
      badge: 'ACP v1',
      command: 'claude-agent-acp',
      icon: Cpu,
      iconColor: 'text-amber-500',
    },
    {
      id: 'codex',
      name: 'Codex',
      tagline: 'OpenAI Agent Client Protocol',
      badge: 'ACP v1',
      command: 'codex-acp',
      icon: ShieldCheck,
      iconColor: 'text-emerald-500',
    },
    {
      id: 'gemini',
      name: 'Gemini CLI',
      tagline: 'Google Gemini Command-Line',
      badge: 'ACP Subshell',
      command: 'gemini --acp',
      icon: Zap,
      iconColor: 'text-indigo-400',
    },
  ];

  return (
    <section aria-label="AI engines and agent runtimes" className="bg-card flex flex-col gap-5 rounded-xl p-5 shadow-sm border border-border/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle aside="Probed live on this Mac · ACP stdio">AI Engines &amp; Agent Runtimes</SectionTitle>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The runtime drives autonomous agents via the Agent Client Protocol (ACP). Antigravity, Claude Code, Codex, and Gemini CLI are probed live on your system.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReProbe}
          disabled={probing || isOffline}
          className={cn(buttonVariants({ variant: 'glass', size: 'sm' }), 'gap-1.5 cursor-pointer shrink-0')}
          title="Re-probe installed CLI adapters on PATH"
        >
          <RefreshCw className={cn('size-3.5', probing && 'animate-spin')} />
          <span>{probing ? 'Probing…' : 'Re-probe Engines'}</span>
        </button>
      </div>

      {/* 1. Default Team Engine Selector */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">Default Team Engine</span>
          <span className="text-[11px] font-mono text-muted-foreground">
            {savingDefault ? 'Saving…' : `Active: ${defaultEngine}`}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ENGINE_OPTIONS.map((eng) => {
            const isSelected = defaultEngine.toLowerCase() === eng.id;
            const Icon = eng.icon;
            return (
              <div
                key={eng.id}
                onClick={() => handleSetDefaultEngine(eng.id)}
                className={cn(
                  'glass-panel flex flex-col justify-between gap-2.5 rounded-xl p-3.5 border transition-all cursor-pointer relative overflow-hidden',
                  isSelected
                    ? 'border-primary/80 bg-primary/[0.04] shadow-xs ring-1 ring-primary/40'
                    : 'border-border/60 hover:border-foreground/30 hover:bg-foreground/[0.02]'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('flex size-7 items-center justify-center rounded-lg bg-foreground/[0.06]', eng.iconColor)}>
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                        <span>{eng.name}</span>
                        {eng.badge && (
                          <span className={cn(
                            'text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold',
                            eng.id === 'antigravity'
                              ? 'bg-primary/15 text-primary border border-primary/30'
                              : 'bg-foreground/[0.06] text-muted-foreground'
                          )}>
                            {eng.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{eng.tagline}</div>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 shadow-2xs">
                      <Check className="size-3 stroke-[2.5]" />
                    </span>
                  )}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground/80 bg-foreground/[0.03] px-2 py-1 rounded border border-border/40 truncate">
                  {eng.command}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Team Roster Engine Breakdown */}
      <div className="glass-panel flex flex-col gap-3 rounded-xl p-4 border border-border/60 bg-foreground/[0.015]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <span className="text-xs font-bold text-foreground">Team Agent Engine Allocation</span>
            <span className="text-[11px] font-mono text-muted-foreground">({teamMembers.length} active agents)</span>
          </div>
          {unconfiguredMembers.length > 0 && (
            <button
              type="button"
              onClick={handleBatchSetAntigravity}
              disabled={batchUpdating || isOffline}
              className={cn(buttonVariants({ variant: 'default', size: 'xs' }), 'gap-1.5 cursor-pointer shadow-xs')}
            >
              <Sparkles className={cn('size-3', batchUpdating && 'animate-spin')} />
              <span>Apply Antigravity to {unconfiguredMembers.length} Unconfigured Agent{unconfiguredMembers.length === 1 ? '' : 's'}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1 font-semibold text-primary flex items-center gap-1.5">
            <Sparkles className="size-3" />
            <span>Antigravity:</span>
            <strong className="font-mono font-bold">{antigravityMembers.length}</strong>
          </span>
          <span className="rounded-lg bg-foreground/[0.05] border border-border/60 px-2.5 py-1 font-semibold text-foreground flex items-center gap-1.5">
            <Cpu className="size-3 text-amber-500" />
            <span>Claude Code:</span>
            <strong className="font-mono font-bold">{claudeMembers.length}</strong>
          </span>
          <span className="rounded-lg bg-foreground/[0.05] border border-border/60 px-2.5 py-1 font-semibold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="size-3 text-emerald-500" />
            <span>Codex:</span>
            <strong className="font-mono font-bold">{codexMembers.length}</strong>
          </span>
          <span className="rounded-lg bg-foreground/[0.05] border border-border/60 px-2.5 py-1 font-semibold text-foreground flex items-center gap-1.5">
            <Zap className="size-3 text-indigo-400" />
            <span>Gemini CLI:</span>
            <strong className="font-mono font-bold">{geminiMembers.length}</strong>
          </span>
        </div>

        {batchMsg && (
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-2 text-xs text-primary flex items-center gap-1.5 font-medium animate-fade-in">
            <CheckCircle2 className="size-3.5" />
            <span>{batchMsg}</span>
          </div>
        )}
      </div>

      {/* 3. Probed Adapters List */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold text-foreground">Probed ACP Adapters &amp; Binaries</span>
        {adapters.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">The runtime has not reported adapter states yet. Click &quot;Re-probe Engines&quot; above.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {adapters.map((adapter) => {
              const status = authBadge(adapter.auth);
              const isAntigravity = adapter.id === 'antigravity';
              return (
                <div
                  key={adapter.id}
                  className={cn(
                    'glass-panel flex flex-col gap-2 rounded-xl p-3.5 text-xs border transition-colors',
                    isAntigravity ? 'border-primary/40 bg-primary/[0.02]' : 'border-border/60'
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {isAntigravity ? (
                        <Sparkles className="size-4 text-primary" />
                      ) : adapter.id === 'claude' ? (
                        <Cpu className="size-4 text-amber-500" />
                      ) : adapter.id === 'codex' ? (
                        <ShieldCheck className="size-4 text-emerald-500" />
                      ) : (
                        <Zap className="size-4 text-indigo-400" />
                      )}
                      <span className="font-bold text-foreground text-xs">{adapter.name}</span>
                      <span className="font-mono text-muted-foreground text-[11px] bg-foreground/[0.04] px-1.5 py-0.5 rounded border border-border/30">
                        {adapter.command}
                      </span>
                      {adapter.version && (
                        <span className="font-mono text-[11px] text-muted-foreground font-semibold">
                          v{adapter.version}
                        </span>
                      )}
                      {adapter.path && (
                        <span className="font-mono text-[10px] text-muted-foreground/70 hidden md:inline truncate max-w-xs" title={adapter.path}>
                          {adapter.path}
                        </span>
                      )}
                    </div>
                    <Tag tone={status.tone}>{status.label}</Tag>
                  </div>

                  <div className="text-muted-foreground text-xs leading-relaxed">
                    {adapter.auth?.detail || 'No detail provided.'}
                    {adapter.auth?.account?.label ? (
                      <div className="mt-1">Account: {adapter.auth.account.label}</div>
                    ) : null}
                  </div>

                  {adapter.abilities && Object.keys(adapter.abilities).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-muted-foreground">Observed abilities:</span>
                      {Object.entries(adapter.abilities).map(([ability, supported]) => (
                        <Tag key={ability} tone={supported ? 'observed' : 'quiet'}>
                          {ability}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Credentials & Keys Configuration */}
      <div className="glass-panel flex flex-col gap-3 rounded-xl p-4 border border-border/60 bg-foreground/[0.015]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <KeyRound className="size-4 text-primary" />
            <span>Engine Secrets &amp; Credentials (~/.myaos/adapters.env)</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className={cn('px-2 py-0.5 rounded-full border', envStatus?.hasAntigravityKey ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-foreground/[0.05] text-muted-foreground border-border/40')}>
              Antigravity Key: {envStatus?.hasAntigravityKey ? 'Set' : 'Unset'}
            </span>
            <span className={cn('px-2 py-0.5 rounded-full border', envStatus?.hasGeminiKey ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-foreground/[0.05] text-muted-foreground border-border/40')}>
              Gemini Key: {envStatus?.hasGeminiKey ? 'Set' : 'Unset'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveSecret} className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={selectedKeyName}
            onChange={(e) => setSelectedKeyName(e.target.value as any)}
            className="glass-panel h-8.5 rounded-md px-2.5 text-xs outline-none bg-background/80 border border-border/60 font-mono"
          >
            <option value="ANTIGRAVITY_API_KEY">ANTIGRAVITY_API_KEY</option>
            <option value="GEMINI_API_KEY">GEMINI_API_KEY</option>
            <option value="OPENAI_API_KEY">OPENAI_API_KEY</option>
            <option value="ANTHROPIC_API_KEY">ANTHROPIC_API_KEY</option>
          </select>

          <input
            type="password"
            placeholder="Paste secret or API key..."
            value={secretVal}
            onChange={(e) => setSecretVal(e.target.value)}
            className="glass-panel h-8.5 flex-1 min-w-[200px] rounded-md px-2.5 font-mono text-xs outline-none bg-background/80 border border-border/60 placeholder:text-muted-foreground"
          />

          <button
            type="submit"
            disabled={savingSecret || !secretVal.trim() || isOffline}
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'gap-1.5 cursor-pointer')}
          >
            <Lock className="size-3.5" />
            <span>{savingSecret ? 'Saving…' : 'Save Secret'}</span>
          </button>
        </form>

        {secretFeedback && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-xs text-emerald-500 flex items-center gap-1.5 font-medium animate-fade-in">
            <CheckCircle2 className="size-3.5" />
            <span>{secretFeedback}</span>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Keys are stored in <span className="font-mono text-foreground">~/.myaos/adapters.env</span> with strict file permissions (0600) and passed only to adapter subprocesses. They are never written to SQLite or git.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 5. Team Bridge Section

function TeamBridgeSection({
  settings,
  bridgeStatus,
  isOffline,
  onUpdateSettings,
}: {
  settings: Settings;
  bridgeStatus?: BridgeStatus;
  isOffline: boolean;
  onUpdateSettings: (patch: Settings) => Promise<void>;
}) {
  const { client } = useRuntime();
  const bridgeSetting = settings.bridge as { enabled?: boolean; inbox?: boolean } | undefined;
  const isEnabled = bridgeSetting?.enabled ?? bridgeStatus?.enabled ?? false;
  const [toggling, setToggling] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ text: string; error?: boolean } | null>(null);

  const toggleBridge = async () => {
    setToggling(true);
    setFeedback(null);
    try {
      if (isEnabled) {
        await onUpdateSettings({ bridge: { enabled: false } });
      } else {
        await onUpdateSettings({ bridge: { enabled: true, inbox: true } });
      }
    } finally {
      setToggling(false);
    }
  };

  const handleSyncAll = async () => {
    if (!client || isOffline) return;
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await client.bridgeSync();
      setFeedback({
        text: `Sync complete: ${res.verdictsExported} verdict(s) to proposals, ${res.jobsExported} shipped job(s) exported, ${res.ingested} note(s) ingested.`,
      });
      setTimeout(() => setFeedback(null), 6000);
    } catch (e) {
      setFeedback({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setSyncing(false);
    }
  };

  const handleExportVerdicts = async () => {
    if (!client || isOffline) return;
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await client.bridgeExportAllCouncils();
      setFeedback({
        text: `Exported ${res.exported} Council verdict(s) to community/proposals/.`,
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (e) {
      setFeedback({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setSyncing(false);
    }
  };

  const handleExportShipped = async () => {
    if (!client || isOffline) return;
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await client.bridgeExportShipped();
      setFeedback({
        text: `Exported ${res.exported} shipped job(s) to community/threads/desktop/ and community/proposals/.`,
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (e) {
      setFeedback({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section aria-label="Team bridge" className="bg-card flex flex-col gap-4 rounded-xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle aside="Outbound mirroring & community git sync">Team Bridge & Git Sync</SectionTitle>
        <button
          type="button"
          disabled={toggling || isOffline}
          onClick={toggleBridge}
          className={cn(buttonVariants({ variant: isEnabled ? 'default' : 'glass', size: 'xs' }))}
        >
          {toggling ? 'Updating…' : isEnabled ? 'Mirroring Enabled' : 'Enable Mirroring'}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Mirrors job dossiers into markdown threads (<span className="font-mono">community/threads/desktop/JOB-*.md</span>),
        exports Council verdicts and shipped jobs to proposals (<span className="font-mono">community/proposals/</span>),
        and drops notifications into agent inboxes (<span className="font-mono">community/inboxes/</span>).
      </p>

      {/* Manual Sync Controls */}
      <div className="glass-panel flex flex-col gap-3 rounded-lg p-3.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-foreground">Manual Git Sync & Export Controls</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={syncing || isOffline || !client}
              onClick={handleExportVerdicts}
              className={buttonVariants({ variant: 'glass', size: 'xs' })}
              title="Export all completed Council verdicts to community/proposals/"
            >
              <FileText className="size-3 mr-1" />
              Export Council Verdicts
            </button>
            <button
              type="button"
              disabled={syncing || isOffline || !client}
              onClick={handleExportShipped}
              className={buttonVariants({ variant: 'glass', size: 'xs' })}
              title="Export all completed/shipped jobs to community/threads/desktop/ and community/proposals/"
            >
              <FileText className="size-3 mr-1" />
              Export Shipped Jobs
            </button>
            <button
              type="button"
              disabled={syncing || isOffline || !client}
              onClick={handleSyncAll}
              className={buttonVariants({ variant: 'default', size: 'xs' })}
              title="Full bidirectional sync: export verdicts, export shipped jobs, mirror active jobs, and ingest team inbox replies"
            >
              <RefreshCw className={cn('size-3 mr-1', syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Sync All'}
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px]',
              feedback.error ? 'bg-risk/10 text-risk' : 'bg-verified/10 text-verified'
            )}
          >
            {feedback.error ? <AlertCircle className="size-3.5 shrink-0" /> : <CheckCircle2 className="size-3.5 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      <div className="glass-panel grid grid-cols-1 gap-2.5 rounded-lg p-3 text-xs sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-[11px]">Bridge State</span>
          <span className="font-medium">
            <Tag tone={isEnabled ? 'observed' : 'quiet'}>{isEnabled ? 'Active' : 'Disabled'}</Tag>
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-[11px]">Last Synced</span>
          <span className="font-mono text-muted-foreground">
            {bridgeStatus?.lastSyncAt ? new Date(bridgeStatus.lastSyncAt).toLocaleString() : 'Never synced'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-[11px]">Last Mirrored</span>
          <span className="font-mono text-muted-foreground">
            {bridgeStatus?.lastMirrorAt ? new Date(bridgeStatus.lastMirrorAt).toLocaleString() : 'Never mirrored'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-[11px]">Ingested from Inboxes / Replies</span>
          <span className="font-medium">{bridgeStatus?.ingested ?? 0} notes / replies</span>
        </div>
        <div className="flex flex-col gap-0.5 sm:col-span-2">
          <span className="text-muted-foreground text-[11px]">Threads Directory</span>
          <span className="font-mono text-muted-foreground">
            {bridgeStatus?.threadsDir ?? 'community/threads/desktop'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 sm:col-span-2">
          <span className="text-muted-foreground text-[11px]">Proposals Directory</span>
          <span className="font-mono text-muted-foreground">
            {bridgeStatus?.proposalsDir ?? 'community/proposals'}
          </span>
        </div>
        {bridgeStatus?.lastError && (
          <div className="flex items-center gap-1.5 text-risk sm:col-span-2">
            <AlertCircle className="size-3.5" />
            <span>Error: {bridgeStatus.lastError}</span>
          </div>
        )}
      </div>
    </section>
  );
}
