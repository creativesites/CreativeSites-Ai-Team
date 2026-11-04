import * as React from 'react';
import { LoadNote, Panel, ScreenHeader, Stat } from '@/components/app/metric';
import { EmptyState, SectionTitle, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { RuntimeError } from '@/lib/runtime';
import { dateOnly, dateTime } from '@/lib/format';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';
import type { StandupReportAgent } from '@/lib/wp11-types';

// Stand-ups (vision section 8, 14.2 item 7). Two kinds of line, always kept apart: what the store
// recorded (facts) and what an agent said (reported, unverified). A claim no record backs is flagged.

const STATUS_TONE = { reported: 'verified', no_update: 'needs-you', absent: 'quiet' } as const;
const STATUS_LABEL = { reported: 'Reported', no_update: 'No update', absent: 'Absent' } as const;

export function StandupsScreen() {
  const { client } = useRuntime();
  const [bump, setBump] = React.useState(0);
  const settings = useRuntimeData((c) => c.settings(), [bump]);
  const latest = useRuntimeData((c) => c.latestStandup(), [bump]);
  const history = useRuntimeData((c) => c.standups(20), [bump]);
  const runs = useRuntimeData((c) => c.scheduleRuns(undefined, 15), [bump]);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'off' | 'error'; text: string } | null>(null);

  const flag = settings.status === 'ready' ? settings.data['workflow.standups'] : undefined;
  const enabled = flag === true;

  const runNow = async () => {
    if (!client) return;
    setBusy(true);
    setMessage(null);
    try {
      const out = await client.runStandupNow();
      setMessage({ tone: 'ok', text: out.existing ? 'A stand-up is already running; showing it when it finishes.' : 'Stand-up started. Agents are asked to reply; the report appears when it compiles.' });
      setBump((n) => n + 1);
    } catch (e) {
      if (e instanceof RuntimeError && e.status === 409) setMessage({ tone: 'off', text: 'Stand-ups are switched off (workflow.standups). Turn the setting on, then run again.' });
      else setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const report = latest.status === 'ready' ? latest.data?.report : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-4">
      <ScreenHeader kicker="What the records show, next to what each agent said, labelled apart" title="Stand-ups">
        <Tag tone={settings.status !== 'ready' ? 'quiet' : enabled ? 'verified' : 'needs-you'}>{settings.status !== 'ready' ? 'setting unknown' : enabled ? 'stand-ups on' : 'stand-ups off'}</Tag>
        <button type="button" className={buttonVariants({ variant: 'default' })} onClick={runNow} disabled={busy || !client}>
          {busy ? 'Starting…' : 'Run stand-up now'}
        </button>
      </ScreenHeader>

      {message && (
        <div role={message.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-2.5 text-sm ${message.tone === 'ok' ? 'border-border text-muted-foreground' : message.tone === 'off' ? 'border-needs-you/40 bg-needs-you/10 text-needs-you' : 'border-risk/40 bg-risk/10 text-risk'}`}>
          {message.text}
        </div>
      )}

      <Panel label="Latest stand-up">
        {!report && <SectionTitle aside={latest.status === 'ready' && latest.data ? `compiled ${dateTime(latest.data.ts)}` : 'latest'}>Latest stand-up</SectionTitle>}
        <LoadNote what="the latest stand-up" state={latest} />
        {latest.status === 'ready' && !latest.data && (
          <EmptyState title="No stand-up yet">{enabled ? 'Run one now, or wait for the scheduled time.' : 'Stand-ups are off, so none has been run by the runtime.'}</EmptyState>
        )}
        {latest.status === 'ready' && latest.data && (
          <>
            <SectionTitle aside={`compiled ${dateTime(latest.data.ts)}`}>{dateOnly(latest.data.date)}</SectionTitle>
            {report ? (
              <>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-5">
                  <Stat label="Reported" value={report.summary.reported} measure="recorded" tone="observed" />
                  <Stat label="No update" value={report.summary.noUpdate} measure="recorded" tone="observed" />
                  <Stat label="Absent" value={report.summary.absent} measure="recorded" tone="observed" />
                  <Stat label="Claims no record backs" value={report.summary.discrepancies} measure="checked" tone={report.summary.discrepancies ? 'risk' : 'verified'} />
                  <Stat label="Blockers reported" value={report.summary.blockersReported} measure="agent-reported" tone="claimed" />
                </div>
                <p className="text-xs text-muted-foreground">Window since {dateTime(report.since)}.</p>
                <div className="flex flex-col gap-2.5">
                  {report.agents.map((a) => (
                    <AgentBlock key={a.agentId} agent={a} />
                  ))}
                </div>
              </>
            ) : latest.data.markdown ? (
              <pre className="glass-panel max-h-96 overflow-auto rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">{latest.data.markdown}</pre>
            ) : (
              <EmptyState title="This stand-up has no structured report" />
            )}
          </>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="Scheduled runs">
          <SectionTitle aside="from the scheduler's own log">Recent scheduled runs</SectionTitle>
          <LoadNote what="schedule runs" state={runs} />
          {runs.status === 'ready' && runs.data.length === 0 && <EmptyState title="No scheduled run recorded">The scheduler has not fired a schedule yet.</EmptyState>}
          {runs.status === 'ready' &&
            runs.data.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-1.5 text-xs last:border-b-0">
                <span className="font-mono text-muted-foreground">{r.scheduleId.slice(0, 18)}</span>
                <span>due {dateTime(r.dueAt)}</span>
                <Tag tone={r.status === 'ok' || r.status === 'fired' ? 'verified' : r.status === 'failed' ? 'risk' : 'quiet'}>{r.status}</Tag>
              </div>
            ))}
        </Panel>
        <Panel label="Earlier stand-ups">
          <SectionTitle aside="all sources">Earlier stand-ups</SectionTitle>
          <LoadNote what="stand-up history" state={history} />
          {history.status === 'ready' && history.data.length === 0 && (
            <EmptyState title="No stand-ups on record">
              Free-form stand-ups can also be posted in the <a className="underline" href={href({ name: 'communication', tab: 'standups' })}>Communications</a> hub.
            </EmptyState>
          )}
          {history.status === 'ready' &&
            history.data.map((s) => (
              <details key={s.id} className="border-b border-border/40 py-1.5 text-xs last:border-b-0">
                <summary className="flex cursor-pointer items-center justify-between gap-2">
                  <span>{dateOnly(s.standup_date)}</span>
                  <span className="text-muted-foreground">{s.facilitator ?? 'unknown facilitator'}</span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{s.content?.slice(0, 1200) || 'No text recorded.'}</p>
              </details>
            ))}
        </Panel>
      </div>
    </div>
  );
}

function AgentBlock({ agent }: { agent: StandupReportAgent }) {
  const f = agent.facts;
  const recorded = f.tasksCompleted.length + f.evidence.length + f.blockersOpened.length + f.jobStageChanges.length;
  return (
    <article className="glass-panel flex flex-col gap-2 rounded-lg px-3.5 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{agent.name}</span>
        <Tag tone={STATUS_TONE[agent.status]}>{STATUS_LABEL[agent.status]}</Tag>
      </div>
      {agent.status === 'absent' && <p className="text-muted-foreground">{agent.reason ?? 'Not part of this stand-up.'}</p>}
      {agent.status !== 'absent' && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              Recorded <Tag tone="observed">observed</Tag>
            </span>
            {recorded === 0 ? (
              <span className="text-muted-foreground">Nothing recorded in the window.</span>
            ) : (
              <ul className="flex list-disc flex-col gap-0.5 pl-4">
                {f.tasksCompleted.map((t) => (
                  <li key={t.taskId}>
                    {t.status}: {t.title}
                  </li>
                ))}
                {f.evidence.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    [{e.class}] {e.summary}
                  </li>
                ))}
                {f.blockersOpened.map((b) => (
                  <li key={b.id}>blocker opened: {b.summary}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              Said <Tag tone="claimed">agent-reported, unverified</Tag>
            </span>
            {agent.reported ? (
              <div className="flex flex-col gap-1">
                <span>Done: {agent.reported.done || 'nothing stated'}</span>
                <span>Next: {agent.reported.next || 'nothing stated'}</span>
                {agent.reported.blockers.length > 0 && <span>Blockers: {agent.reported.blockers.join('; ')}</span>}
              </div>
            ) : (
              <span className="text-muted-foreground">No reply. Nothing is filled in on its behalf.</span>
            )}
          </div>
        </div>
      )}
      {agent.discrepancies.map((d, i) => (
        <p key={i} className="rounded-md border border-risk/40 bg-risk/10 px-2.5 py-1.5 text-risk">
          {d}
        </p>
      ))}
    </article>
  );
}
