import * as React from 'react';
import type { AccountWeeklyUsage, AiAccount, AiSnapshotInput, UsageBreakdownRow } from '@runtime/usage-types';
import { EmptyState, SectionTitle, Tag } from '@/components/app/status';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';

// Subscription-plan usage (programme plan K6). Percentages are what a person read
// from `/usage` in Claude Code or Settings > Usage, so they are labelled "actual".
// Anything attributed to an agent or task type is a guess and is labelled "estimated".

function formatReset(iso: string | null): string {
  if (!iso) return 'not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'not recorded';
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const pct = (v: number | null | undefined) => (v == null ? 'unknown' : `${Math.round(v * 10) / 10}%`);

function paceText(row: AccountWeeklyUsage): string {
  if (row.stale) return 'out of date (the window has reset)';
  if (row.pace == null) return 'unknown';
  const label = row.pace > 1.05 ? 'ahead of an even burn' : row.pace < 0.95 ? 'behind an even burn' : 'on an even burn';
  return `${row.pace.toFixed(2)}x, ${label}`;
}

function Breakdown({ title, rows }: { title: string; rows: UsageBreakdownRow[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">
        {title} <Tag tone="quiet">estimated</Tag>
      </span>
      {rows.length === 0 ? (
        <span className="text-muted-foreground">No attributed tasks yet</span>
      ) : (
        rows.map((r) => (
          <span key={r.key ?? 'unknown'} className="flex justify-between gap-3 font-mono">
            <span className="truncate">{r.key ?? 'unspecified'}</span>
            <span>
              {pct(r.attributedWeeklyPct)} ({r.tasks})
            </span>
          </span>
        ))
      )}
    </div>
  );
}

function SnapshotForm({ accounts, onSaved }: { accounts: AiAccount[]; onSaved: () => void }) {
  const { client } = useRuntime();
  const [accountId, setAccountId] = React.useState('');
  const [sessionPct, setSessionPct] = React.useState('');
  const [sessionResets, setSessionResets] = React.useState('');
  const [weeklyPct, setWeeklyPct] = React.useState('');
  const [weeklyResets, setWeeklyResets] = React.useState('');
  const [requests, setRequests] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const selected = accounts.find((a) => a.id === (accountId || accounts[0]?.id));
  const isRequests = selected?.limitModel === 'gemini_cli_requests_per_day';

  const iso = (local: string) => (local ? new Date(local).toISOString() : null);
  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const input: AiSnapshotInput = isRequests
        ? { requestsToday: num(requests) }
        : {
            sessionPct: num(sessionPct),
            sessionResetsAt: iso(sessionResets),
            weeklyPct: num(weeklyPct),
            weeklyResetsAt: iso(weeklyResets),
          };
      const out = await client.addAiSnapshot(selected.id, input);
      setMessage(out.alert ? 'Saved. This account is using its week faster than an even pace.' : 'Saved');
      onSaved();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const field = 'rounded-md border border-border bg-background px-2 py-1 text-foreground';

  return (
    <form onSubmit={submit} className="glass-panel flex flex-col gap-3 rounded-xl p-4 text-xs" aria-label="Enter usage snapshot">
      <span className="font-semibold text-foreground">Enter a reading</span>
      <p className="text-muted-foreground">
        Copy the numbers from <span className="font-mono">/usage</span> in Claude Code, or Settings, Usage. Takes about ten seconds.
        Entered values are saved as actual.
      </p>
      <label className="flex flex-col gap-1 text-muted-foreground">
        Account
        <select className={field} value={selected?.id ?? ''} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      {isRequests ? (
        <label className="flex flex-col gap-1 text-muted-foreground">
          Requests today (Gemini CLI, daily quota {selected?.dailyRequestQuota ?? 1500})
          <input className={field} type="number" min={0} step={1} value={requests} onChange={(e) => setRequests(e.target.value)} />
        </label>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-muted-foreground">
            Session used (%)
            <input className={field} type="number" min={0} max={100} step="any" value={sessionPct} onChange={(e) => setSessionPct(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground">
            Session resets at
            <input className={field} type="datetime-local" value={sessionResets} onChange={(e) => setSessionResets(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground">
            Weekly used (%)
            <input className={field} type="number" min={0} max={100} step="any" value={weeklyPct} onChange={(e) => setWeeklyPct(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground">
            Weekly resets at
            <input className={field} type="datetime-local" value={weeklyResets} onChange={(e) => setWeeklyResets(e.target.value)} />
          </label>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !client || !selected} className="rounded-md border border-border px-3 py-1 font-medium disabled:opacity-50">
          {busy ? 'Saving…' : 'Save reading'}
        </button>
        {message ? <span className="text-muted-foreground">{message}</span> : null}
      </div>
    </form>
  );
}

export function AiUsageSection({ isOffline }: { isOffline: boolean }) {
  const { client } = useRuntime();
  const [bump, setBump] = React.useState(0);
  const weekly = useRuntimeData((c) => c.weeklyUsage(), [bump]);
  const rows = weekly.status === 'ready' ? weekly.data : [];

  const ack = async (id: string) => {
    if (!client) return;
    await client.ackUsageAlert(id).catch(() => undefined);
    setBump((n) => n + 1);
  };

  return (
    <section aria-label="AI usage" className="bg-card flex flex-col gap-4 rounded-xl p-5 shadow-sm">
      <SectionTitle aside="Subscription plans, not API billing">AI Usage</SectionTitle>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Weekly plan usage per account. Providers do not publish token caps, so only percentages are tracked. Values you enter are{' '}
        <span className="font-medium">actual</span>; anything attributed to agents or task types is an{' '}
        <span className="font-medium">estimate</span>.
      </p>

      {weekly.status === 'error' ? <div className="text-xs text-risk">Could not load usage: {weekly.message}</div> : null}
      {isOffline || (weekly.status === 'ready' && rows.length === 0) ? (
        <EmptyState title={isOffline ? 'Runtime offline' : 'No AI accounts yet'}>
          {isOffline ? null : 'Run node runtime/scripts/seed-ai-accounts.ts on this machine to create the three default accounts.'}
        </EmptyState>
      ) : null}

      {rows.map((row) => {
        const open = row.alerts.filter((a) => !a.acknowledgedAt);
        return (
          <div key={row.account.id} className="glass-panel flex flex-col gap-3 rounded-xl p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{row.account.label}</span>
              <span className="flex items-center gap-2">
                <Tag tone="quiet">{row.account.ownerScope}</Tag>
                {open.length ? <Tag tone="needs-you">70% before midweek</Tag> : null}
              </span>
            </div>
            {row.account.limitModel === 'gemini_cli_requests_per_day' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Requests today</span>
                  <span className="font-mono">
                    {row.snapshot?.requestsToday ?? 'unknown'} / {row.account.dailyRequestQuota ?? 1500}{' '}
                    {row.snapshot ? <Tag tone="quiet">{row.snapshot.measurement}</Tag> : null}
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Weekly used</span>
                  <span className="font-mono">
                    {pct(row.weeklyPct)} {row.weeklyMeasurement ? <Tag tone="quiet">{row.weeklyMeasurement}</Tag> : null}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Weekly resets</span>
                  <span className="font-mono">{formatReset(row.weeklyResetsAt)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Pace</span>
                  <span className="font-mono">{paceText(row)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Session used</span>
                  <span className="font-mono">
                    {pct(row.snapshot?.sessionPct)} {row.snapshot?.sessionPct != null ? <Tag tone="quiet">{row.snapshot.measurement}</Tag> : null}
                  </span>
                </div>
              </div>
            )}
            {open.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                <span>
                  Passed {pct(a.weeklyPct)} of the weekly limit with {Math.round(a.elapsedFraction * 100)}% of the window gone.
                </span>
                <button type="button" className="rounded-md border border-border px-2 py-0.5" onClick={() => void ack(a.id)}>
                  Acknowledge
                </button>
              </div>
            ))}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Breakdown title="Fastest agents this window" rows={row.topAgents} />
              <Breakdown title="Fastest task types this window" rows={row.topTaskTypes} />
            </div>
          </div>
        );
      })}

      {rows.length > 0 && !isOffline ? (
        <SnapshotForm accounts={rows.map((r) => r.account)} onSaved={() => setBump((n) => n + 1)} />
      ) : null}
    </section>
  );
}
