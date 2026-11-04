import * as React from 'react';
import type { AiLimitModel, AiProvider } from '@runtime/usage-types';
import type { Identity } from '@runtime/types';
import { LoadNote, Panel, ScreenHeader } from '@/components/app/metric';
import { EmptyState, SectionTitle, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { dateTime, percent, UNKNOWN } from '@/lib/format';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';
import { AiUsageSection } from '@/screens/ai-usage';

// AI Resources & Usage (vision section 14.2 item 12). The headline figure is the weekly percentage of
// each subscription plan. Everything attributed to an agent or task type is an estimate. There are no
// prices and no token caps here: providers publish neither for subscription plans.

const field = 'glass-panel h-9 rounded-md px-2.5 text-sm outline-none focus:ring-1 focus:ring-foreground/40';

const LIMIT_MODELS: { id: AiLimitModel; label: string }[] = [
  { id: 'claude_5h_weekly_pct', label: '5-hour session plus weekly percent' },
  { id: 'gemini_app_5h_weekly_pct', label: 'Gemini app: 5-hour plus weekly percent' },
  { id: 'gemini_cli_requests_per_day', label: 'Gemini CLI: requests per day' },
];

export function AiResourcesScreen({ identities }: { identities: Identity[] }) {
  const { state } = useRuntime();
  const isOffline = state.status !== 'connected';
  const [bump, setBump] = React.useState(0);
  const estimates = useRuntimeData((c) => c.usageEstimates(), [bump]);
  const registry = useRuntimeData((c) => c.modelRegistry(), [bump]);
  const budgets = useRuntimeData((c) => c.budgets(), [bump]);
  const accounts = useRuntimeData((c) => c.aiAccounts(), [bump]);
  const nameOf = (id: string | null) => (id ? (identities.find((i) => i.id === id)?.name ?? id) : 'any');
  const shareBudgets = budgets.status === 'ready' ? budgets.data.filter((b) => b.kind && b.kind !== 'money') : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-4">
      <ScreenHeader kicker="Subscription plans, not API billing: percentages you read from the provider, never prices" title="AI Resources & Usage">
        <Tag tone="observed">weekly % = actual</Tag>
        <Tag tone="quiet">per-task = estimated</Tag>
      </ScreenHeader>

      <AiUsageSection isOffline={isOffline} />

      <AddAccount existing={accounts.status === 'ready' ? accounts.data.length : 0} disabled={isOffline} onAdded={() => setBump((n) => n + 1)} />

      <Panel label="Usage estimates">
        <SectionTitle aside="median share of a week per task type">Estimated cost of a task</SectionTitle>
        <LoadNote what="estimates" state={estimates} />
        {estimates.status === 'ready' && estimates.data.length === 0 ? (
          <EmptyState title="No estimates yet">
            An estimate needs finished tasks with a before and after weekly reading. Until then the share of a week a task will use is {UNKNOWN}.
          </EmptyState>
        ) : null}
        {estimates.status === 'ready' && estimates.data.length > 0 && (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Task type</th>
                  <th className="py-1.5 pr-3 font-medium">Model</th>
                  <th className="py-1.5 pr-3 font-medium">Agent</th>
                  <th className="py-1.5 pr-3 font-medium">Median share of a week</th>
                  <th className="py-1.5 font-medium">Samples</th>
                </tr>
              </thead>
              <tbody>
                {estimates.data.map((r, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="py-2 pr-3">{r.taskType ?? 'unspecified'}</td>
                    <td className="py-2 pr-3 font-mono">{r.modelId ?? UNKNOWN}</td>
                    <td className="py-2 pr-3">{nameOf(r.agentId)}</td>
                    <td className="py-2 pr-3 font-mono">
                      {percent(r.medianWeeklyPct)} <Tag tone="quiet">estimated</Tag>
                    </td>
                    <td className="py-2 font-mono">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel label="Budgets">
        <SectionTitle aside="limits on a plan, not money">Budgets</SectionTitle>
        <LoadNote what="budgets" state={budgets} />
        {budgets.status === 'ready' && shareBudgets.length === 0 && <EmptyState title="No usage budgets set">A budget caps a share of an account's week, a token count or a request count. None is configured.</EmptyState>}
        {shareBudgets.map((b) => (
          <div key={b.id} className="glass-panel flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs">
            <span>
              {b.scope}
              {b.scopeId ? ` ${b.scopeId}` : ''} · {b.period}
            </span>
            <span className="flex items-center gap-2 font-mono">
              {b.amount == null ? UNKNOWN : `${b.amount} ${b.kind === 'weekly_pct' || b.kind === 'session_pct' ? '%' : b.kind === 'requests_per_day' ? 'requests/day' : 'tokens'}`}
              <Tag tone="claimed">declared</Tag>
              {b.warnPct != null && <span className="text-muted-foreground">warn {b.warnPct}%</span>}
              {b.hardPct != null && <span className="text-muted-foreground">stop {b.hardPct}%</span>}
            </span>
          </div>
        ))}
      </Panel>

      <Panel label="Model registry">
        <SectionTitle aside="context windows are only what you entered">Model registry</SectionTitle>
        <LoadNote what="the model registry" state={registry} />
        {registry.status === 'ready' && registry.data.length === 0 && (
          <EmptyState title="No models registered">
            The runtime ships no context windows from memory, so a model's window is {UNKNOWN} until the provider reports it or you register it.
          </EmptyState>
        )}
        {registry.status === 'ready' && registry.data.length > 0 && (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Provider</th>
                  <th className="py-1.5 pr-3 font-medium">Model</th>
                  <th className="py-1.5 pr-3 font-medium">Context window</th>
                  <th className="py-1.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {registry.data.map((m) => (
                  <tr key={`${m.provider}:${m.modelId}`} className="border-t border-border/40">
                    <td className="py-2 pr-3">{m.provider}</td>
                    <td className="py-2 pr-3 font-mono">{m.modelId}</td>
                    <td className="py-2 pr-3 font-mono">
                      {m.contextWindow == null ? UNKNOWN : `${m.contextWindow.toLocaleString()} tokens`} {m.contextWindow != null && <Tag tone="claimed">declared</Tag>}
                    </td>
                    <td className="py-2">{dateTime(m.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function AddAccount({ existing, disabled, onAdded }: { existing: number; disabled: boolean; onAdded: () => void }) {
  const { client } = useRuntime();
  const [open, setOpen] = React.useState(false);
  const [provider, setProvider] = React.useState<AiProvider>('anthropic');
  const [plan, setPlan] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [limitModel, setLimitModel] = React.useState<AiLimitModel>('claude_5h_weekly_pct');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !label.trim() || !plan.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.createAiAccount({ provider, plan: plan.trim(), label: label.trim(), limitModel });
      setLabel('');
      setPlan('');
      setOpen(false);
      onAdded();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel label="Add an AI account">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle aside={`${existing} account${existing === 1 ? '' : 's'} tracked`}>Accounts</SectionTitle>
        <button type="button" className={buttonVariants({ variant: 'glass', size: 'sm' })} onClick={() => setOpen((v) => !v)} aria-expanded={open} disabled={disabled}>
          {open ? 'Cancel' : 'Add an account'}
        </button>
      </div>
      {open && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Provider
            <select className={field} value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
              <option value="anthropic">anthropic</option>
              <option value="google">google</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Limit model
            <select className={field} value={limitModel} onChange={(e) => setLimitModel(e.target.value as AiLimitModel)}>
              {LIMIT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Plan name
            <input className={field} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="as the provider names it" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Label
            <input className={field} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="how you will recognise it" />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button type="submit" className={buttonVariants({ variant: 'default' })} disabled={busy || !label.trim() || !plan.trim()}>
              {busy ? 'Saving…' : 'Save account'}
            </button>
            {message && <span className="text-xs text-risk">{message}</span>}
          </div>
        </form>
      )}
    </Panel>
  );
}
