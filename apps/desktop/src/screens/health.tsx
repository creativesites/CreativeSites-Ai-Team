import { AlertCircle } from 'lucide-react';
import type { AdapterInfo, Health } from '@runtime/types';
import { LoadNote, Panel, ScreenHeader, Stat } from '@/components/app/metric';
import { EmptyState, SectionTitle, Tag, type Tone } from '@/components/app/status';
import { dateTime } from '@/lib/format';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';

// Runtime & Health (vision section 14.2 item 15). Everything here is read from the runtime process or
// from probing the installed CLIs; a readiness it could not check shows as "unknown", not "ready".

const AUTH_TONE: Record<AdapterInfo['auth']['state'], Tone> = {
  ready: 'verified',
  configured: 'observed',
  needs_login: 'needs-you',
  missing_binary: 'risk',
  unsupported: 'quiet',
  unknown: 'quiet',
};

const AUTH_LABEL: Record<AdapterInfo['auth']['state'], string> = {
  ready: 'Signed in',
  configured: 'Configured',
  needs_login: 'Needs sign-in',
  missing_binary: 'Not installed',
  unsupported: 'No sign-in check',
  unknown: 'Unknown',
};

export function HealthScreen() {
  const { state } = useRuntime();
  const adapters = useRuntimeData((c) => c.adapters(), []);
  const schedules = useRuntimeData((c) => c.schedules({ enabledOnly: true }), []);
  const runs = useRuntimeData((c) => c.scheduleRuns(undefined, 8), []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-4">
      <ScreenHeader kicker="The local daemon that owns the store, the sessions and the git work" title="Runtime & Health" />
      <RuntimeHealthSection />

      <Panel label="Adapter readiness">
        <SectionTitle aside="installed binary and sign-in, as probed on this machine">Adapter readiness</SectionTitle>
        <LoadNote what="adapters" state={adapters} />
        {adapters.status === 'ready' && adapters.data.length === 0 && <EmptyState title="No adapters registered" />}
        {adapters.status === 'ready' && adapters.data.length > 0 && (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Adapter</th>
                  <th className="py-1.5 pr-3 font-medium">Installed</th>
                  <th className="py-1.5 pr-3 font-medium">Version</th>
                  <th className="py-1.5 pr-3 font-medium">Sign-in</th>
                  <th className="py-1.5 pr-3 font-medium">Account</th>
                  <th className="py-1.5 font-medium">Last probe</th>
                </tr>
              </thead>
              <tbody>
                {adapters.data.map((a) => (
                  <tr key={a.id} className="border-t border-border/40 align-top">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{a.name}</span>
                      {!a.enabled && <span className="ml-1.5 text-muted-foreground">(disabled)</span>}
                      {a.rateLimitResetAt && <div className="mt-0.5 text-needs-you">paused until {dateTime(a.rateLimitResetAt)}</div>}
                    </td>
                    <td className="py-2 pr-3">
                      <Tag tone={a.installed ? 'verified' : 'risk'}>{a.installed ? 'yes' : 'no'}</Tag>
                    </td>
                    <td className="py-2 pr-3 font-mono">{a.version ?? 'unknown'}</td>
                    <td className="py-2 pr-3" title={a.auth.detail}>
                      <Tag tone={AUTH_TONE[a.auth.state]}>{AUTH_LABEL[a.auth.state]}</Tag>
                    </td>
                    <td className="py-2 pr-3">{a.auth.account?.label ?? a.auth.account?.id ?? 'not exposed by the CLI'}</td>
                    <td className="py-2">{a.lastProbeAt ? dateTime(a.lastProbeAt) : 'never probed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="Schedules">
          <SectionTitle aside="enabled only">Schedules</SectionTitle>
          <LoadNote what="schedules" state={schedules} />
          {schedules.status === 'ready' && schedules.data.length === 0 && <EmptyState title="No enabled schedules" />}
          {schedules.status === 'ready' &&
            schedules.data.slice(0, 10).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-1.5 text-xs last:border-b-0">
                <span className="min-w-0 truncate">{s.reason ?? s.prompt.slice(0, 60)}</span>
                <span className="text-muted-foreground">next {dateTime(s.nextRunAt)}</span>
              </div>
            ))}
        </Panel>
        <Panel label="Scheduler log">
          <SectionTitle aside="latest recorded runs">Scheduler log</SectionTitle>
          <LoadNote what="the scheduler log" state={runs} />
          {runs.status === 'ready' && runs.data.length === 0 && <EmptyState title="No scheduler runs recorded" />}
          {runs.status === 'ready' &&
            runs.data.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-1.5 text-xs last:border-b-0">
                <span>{dateTime(r.ranAt)}</span>
                <Tag tone={r.status === 'failed' ? 'risk' : 'quiet'}>{r.status}</Tag>
              </div>
            ))}
        </Panel>
      </div>
      {state.status !== 'connected' && <p className="text-xs text-muted-foreground">The runtime is not connected, so the tables above stay empty.</p>}
    </div>
  );
}

export function RuntimeHealthSection() {
  const { state: connectionState } = useRuntime();
  const isConnected = connectionState.status === 'connected';
  const health: Health | undefined = isConnected ? connectionState.health : undefined;

  return (
    <Panel label="Runtime health">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle aside="Local API daemon status">Runtime Health</SectionTitle>
        <Tag tone={isConnected ? 'verified' : connectionState.status === 'connecting' ? 'needs-you' : 'risk'}>
          {isConnected ? 'Online' : connectionState.status === 'connecting' ? 'Connecting' : 'Offline'}
        </Tag>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        The desktop connects only to the local MyaOS runtime over HTTP and SSE. The runtime owns the SQLite store, the ACP sessions, git operations and independent verification.
      </p>

      {isConnected && health ? (
        <div className="glass-panel grid grid-cols-1 gap-4 rounded-lg p-3 text-xs sm:grid-cols-2 md:grid-cols-3">
          <Stat label="Local endpoint" value={connectionState.connection.url} measure="observed" tone="observed" className="[&>span:nth-child(2)]:text-sm [&>span:nth-child(2)]:break-all" />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Owner key</span>
            <span title={connectionState.ownerKey?.detail ?? ''}>
              <Tag tone={connectionState.ownerKey?.state === 'ok' ? 'verified' : connectionState.ownerKey?.state === 'mismatch' ? 'risk' : 'needs-you'}>
                {connectionState.ownerKey?.state === 'ok'
                  ? `Enrolled ${connectionState.ownerKey.fingerprint ?? ''}`
                  : connectionState.ownerKey?.state === 'mismatch'
                    ? 'Mismatch: owner actions refused'
                    : 'Not available: owner actions refused'}
              </Tag>
            </span>
          </div>
          <Stat label="Process id" value={health.pid} measure="observed" tone="observed" />
          <Stat label="Schema version" value={`v${health.schemaVersion}`} measure="observed" tone="observed" note={`runtime ${health.version}`} />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Store</span>
            <span>
              <Tag tone={health.checks?.store ? 'verified' : 'risk'}>{health.checks?.store ? 'Healthy' : 'Store error'}</Tag>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Host git</span>
            <span>
              <Tag tone={health.checks?.git ? 'verified' : 'risk'}>{health.checks?.git ? 'Available' : 'Missing'}</Tag>
            </span>
          </div>
          <Stat label="Node" value={health.checks?.node ?? null} measure="observed" tone="observed" unknownReason="not reported" />
          <Stat label="Started" value={dateTime(health.startedAt)} measure="observed" tone="observed" />
          <Stat label="Workspace roots" value={health.checks?.workspaceRoots ?? null} measure="declared" tone="claimed" unknownReason="not reported" />
        </div>
      ) : (
        <div className="glass-panel flex items-center gap-2.5 rounded-lg p-3 text-xs text-risk">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            {connectionState.status === 'connecting'
              ? 'Attempting to discover and connect to the local MyaOS runtime…'
              : connectionState.status === 'unavailable'
                ? `Runtime unreachable: ${connectionState.reason}`
                : 'Runtime is not connected.'}
          </span>
        </div>
      )}
    </Panel>
  );
}
