import * as React from 'react';
import {
  AlertCircle,
  Plus,
  Terminal,
  Trash2,
} from 'lucide-react';
import type {
  AdapterInfo,
  ApprovalPolicy,
  BridgeStatus,
  Budget,
  CreateBudgetInput,
  CreatePolicyInput,
  Health,
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
import type { ConnectionState } from '@/lib/runtime';
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

      {/* 4. Adapter Health */}
      <AdapterHealthSection adapters={adapters} revision={revision} />

      {/* 5. Team Bridge */}
      <TeamBridgeSection
        settings={settings}
        bridgeStatus={bridgeStatus}
        isOffline={isOffline}
        onUpdateSettings={handleUpdateSettings}
      />

      {/* 6. Runtime Health */}
      <RuntimeHealthSection connectionState={connectionState} />
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

// ---------------------------------------------------------------- 4. Adapter Health Section

function AdapterHealthSection({
  adapters,
  revision: _revision,
}: {
  adapters: AdapterInfo[];
  revision: number;
}) {
  return (
    <section aria-label="Adapter health" className="bg-card flex flex-col gap-4 rounded-xl p-5 shadow-sm">
      <SectionTitle aside="Probed at runtime on this machine">Adapter Health & ACP Capabilities</SectionTitle>
      <p className="text-xs leading-relaxed text-muted-foreground">
        The runtime drives AI adapters over the Agent Client Protocol (ACP). Readiness and capabilities are probed directly
        via CLI execution. Capabilities like file writes and command executions are observed, never assumed.
      </p>

      {adapters.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">The runtime has not reported adapter states yet.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {adapters.map((adapter) => {
            const status = authBadge(adapter.auth);
            return (
              <div
                key={adapter.id}
                className="glass-panel flex flex-col gap-2 rounded-lg p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-foreground">{adapter.name}</span>
                    <span className="font-mono text-muted-foreground text-[11px]">{adapter.command}</span>
                    {adapter.version && (
                      <span className="font-mono text-[11px] text-muted-foreground">v{adapter.version}</span>
                    )}
                  </div>
                  <Tag tone={status.tone}>{status.label}</Tag>
                </div>

                <div className="text-muted-foreground leading-relaxed">
                  {adapter.auth?.detail || 'No detail provided.'}
                </div>

                {adapter.abilities && Object.keys(adapter.abilities).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-muted-foreground">Probed abilities:</span>
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

      {/* Gemini auth notice */}
      <div className="glass-panel flex items-start gap-3 rounded-lg p-3 text-xs text-muted-foreground">
        <Terminal className="size-4 shrink-0 mt-0.5 text-observed" />
        <div className="flex flex-col gap-1 leading-relaxed">
          <span className="font-semibold text-foreground">Configuring Secrets & Keys</span>
          <p>
            API secrets are never entered or stored in the desktop UI. To authenticate Gemini or add custom keys, run in
            terminal:
          </p>
          <span className="font-mono text-foreground/90 bg-background/50 rounded px-1.5 py-0.5 self-start">
            node runtime/scripts/set-adapter-key.mjs GEMINI_API_KEY &lt;your-key&gt;
          </span>
          <p className="text-[11px]">
            Secrets are saved to <span className="font-mono">~/.myaos/adapters.env</span> (permissions 0600) and passed
            only to the adapter subprocess.
          </p>
        </div>
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
  const bridgeSetting = settings.bridge as { enabled?: boolean; inbox?: boolean } | undefined;
  const isEnabled = bridgeSetting?.enabled ?? bridgeStatus?.enabled ?? false;
  const [toggling, setToggling] = React.useState(false);

  const toggleBridge = async () => {
    setToggling(true);
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

  return (
    <section aria-label="Team bridge" className="bg-card flex flex-col gap-4 rounded-xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle aside="Outbound mirroring to legacy agents">Team Bridge</SectionTitle>
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
        Mirrors job dossiers into markdown threads (<span className="font-mono">community/threads/desktop/JOB-*.md</span>)
        and notifications into agent inboxes (<span className="font-mono">community/inboxes/</span>). This allows
        existing CLI/tmux coworkers to follow live jobs without reading the runtime database.
      </p>

      <div className="glass-panel grid grid-cols-1 gap-2.5 rounded-lg p-3 text-xs sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-[11px]">Bridge State</span>
          <span className="font-medium">
            <Tag tone={isEnabled ? 'observed' : 'quiet'}>{isEnabled ? 'Active' : 'Disabled'}</Tag>
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-[11px]">Last Mirrored</span>
          <span className="font-mono text-muted-foreground">
            {bridgeStatus?.lastMirrorAt ? new Date(bridgeStatus.lastMirrorAt).toLocaleString() : 'Never mirrored'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 sm:col-span-2">
          <span className="text-muted-foreground text-[11px]">Threads Directory</span>
          <span className="font-mono text-muted-foreground">
            {bridgeStatus?.threadsDir ?? 'community/threads/desktop'}
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

// ---------------------------------------------------------------- 6. Runtime Health Section

function RuntimeHealthSection({ connectionState }: { connectionState: ConnectionState }) {
  const isConnected = connectionState.status === 'connected';
  const health: Health | undefined = isConnected ? connectionState.health : undefined;

  return (
    <section aria-label="Runtime health" className="bg-card flex flex-col gap-4 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle aside="Local API daemon status">Runtime Health</SectionTitle>
        <Tag tone={isConnected ? 'verified' : connectionState.status === 'connecting' ? 'needs-you' : 'risk'}>
          {isConnected ? 'Online' : connectionState.status === 'connecting' ? 'Connecting' : 'Offline'}
        </Tag>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        The desktop connects exclusively to the local MyaOS runtime process over HTTP and SSE. The runtime owns the
        SQLite store, ACP sessions, git operations, and independent verification.
      </p>

      {isConnected && health ? (
        <div className="glass-panel grid grid-cols-1 gap-3 rounded-lg p-3 text-xs sm:grid-cols-2 md:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">Local Endpoint</span>
            <span className="font-mono text-foreground break-all">{connectionState.connection.url}</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">Process PID</span>
            <span className="font-mono text-foreground">{health.pid}</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">Schema Version</span>
            <span className="font-mono text-foreground">v{health.schemaVersion} ({health.version})</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">Store Health</span>
            <span className="font-medium">
              <Tag tone={health.checks?.store ? 'verified' : 'risk'}>
                {health.checks?.store ? 'Healthy (WAL mode)' : 'Store Error'}
              </Tag>
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">Host Git</span>
            <span className="font-medium">
              <Tag tone={health.checks?.git ? 'verified' : 'risk'}>
                {health.checks?.git ? 'Available' : 'Missing'}
              </Tag>
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">Node Runtime</span>
            <span className="font-mono text-muted-foreground">{health.checks?.node ?? 'unknown'}</span>
          </div>

          <div className="flex flex-col gap-0.5 sm:col-span-2 md:col-span-3">
            <span className="text-[11px] text-muted-foreground">Allowed Workspace Roots</span>
            <span className="text-muted-foreground">
              {health.checks?.workspaceRoots ?? 0} directory root(s) configured under <span className="font-mono">~/.myaos/runtime.json</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="glass-panel flex items-center gap-2.5 rounded-lg p-3 text-xs text-risk">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            {connectionState.status === 'connecting'
              ? 'Attempting to discover and connect to local MyaOS runtime…'
              : connectionState.status === 'unavailable'
                ? `Runtime unreachable: ${connectionState.reason}`
                : 'Runtime is not connected.'}
          </span>
        </div>
      )}
    </section>
  );
}
