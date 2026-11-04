import * as React from 'react';
import type { Approval } from '@runtime/types';
import { OwnerAvatar } from '@/components/app/avatar';
import { EmptyState, SectionTitle, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';

const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

function riskTone(risk: string | undefined): 'risk' | 'needs-you' | 'quiet' {
  if (risk === 'critical' || risk === 'high') return 'risk';
  if (risk === 'medium') return 'needs-you';
  return 'quiet';
}

export function ApprovalsScreen() {
  const { client } = useRuntime();
  const pending = useRuntimeData((c) => c.approvals({ status: 'pending' }), []);
  const feed = useRuntimeData((c) => c.needsYou(), []);
  const decided = useRuntimeData((c) => c.approvals({ status: 'approved' }), []);
  const settings = useRuntimeData((c) => c.settings(), []);
  const identities = useRuntimeData((c) => c.identities(), []);
  const ownerId = (settings.status === 'ready' && String(settings.data.ownerId ?? '')) || 'winston';
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');
  const [resolved, setResolved] = React.useState<Set<string>>(new Set());
  const who = (id: string | null | undefined) => (identities.status === 'ready' ? identities.data.find((i) => i.id === id) : undefined);

  const decide = async (approval: Approval, decision: 'approve' | 'decline') => {
    if (!client) return;
    setBusy(approval.id);
    setError(null);
    try {
      await client.decideApproval(approval.id, { decision, decidedBy: ownerId, note: note.trim() || undefined });
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (blockerId: string) => {
    if (!client) return;
    setBusy(blockerId);
    setError(null);
    try {
      await client.resolveBlocker(blockerId, ownerId);
      setResolved((prev) => new Set(prev).add(blockerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // Approvals keep their rich cards above; everything else from the aggregate list is listed below (each source once).
  const others = (feed.status === 'ready' ? feed.data : []).filter((i) => i.kind !== 'approval' && !resolved.has(i.id));
  const rows = pending.status === 'ready' ? pending.data : [];
  const recent = decided.status === 'ready' ? decided.data.slice(0, 8) : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-muted-foreground">Approvals are the human gate; every fact on a card is traceable to evidence</span>
          <h1 className="text-lg font-semibold">Needs you</h1>
        </div>
        <Tag tone={rows.length + others.length ? 'needs-you' : 'quiet'}>{rows.length + others.length} waiting</Tag>
      </header>

      {error && <div role="alert" className="rounded-xl border border-risk/40 bg-risk/10 px-4 py-2.5 text-sm text-risk">{error}</div>}

      {pending.status !== 'ready' ? (
        <EmptyState title="Waiting for the runtime">Approvals load when the runtime is reachable.</EmptyState>
      ) : rows.length === 0 && others.length === 0 ? (
        <EmptyState title="Nothing waiting on you">When an agent asks for a consequential action, it lands here with its evidence and consequence.</EmptyState>
      ) : (
        <section aria-label="Pending approvals" className="flex flex-col gap-3">
          {rows.map((approval) => {
            const assignee = who(approval.assignedTo ?? undefined);
            return (
              <article key={approval.id} className="bg-card flex flex-col gap-3 rounded-xl border border-needs-you/25 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Tag tone={riskTone(approval.risk)}>Risk {approval.risk ?? 'low'}</Tag>
                      <span className="font-mono">{approval.actionType ?? 'action'}</span>
                      <span>requested by {approval.requestedBy}</span>
                      {approval.reversible != null && <span>{approval.reversible ? 'reversible' : 'not reversible'}</span>}
                    </div>
                    <h2 className="text-base font-semibold">{approval.title}</h2>
                  </div>
                  <a href={href({ name: 'job', jobId: approval.jobId })} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
                    Open job
                  </a>
                </div>
                <p className="text-[13px] leading-relaxed text-foreground/85">{approval.consequence}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {assignee ? <OwnerAvatar name={assignee.name} size={18} /> : <OwnerAvatar name={approval.assignedTo ?? 'owner'} size={18} />}
                    assigned to {assignee?.name ?? approval.assignedTo ?? 'owner'}
                  </span>
                  <span>expires {time(approval.expiresAt)}</span>
                  {approval.escalatedAt && <Tag tone="needs-you">escalated</Tag>}
                  {approval.requestId && <span className="font-mono">{approval.requestId.slice(0, 24)}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional note recorded with the decision"
                    aria-label="Decision note"
                    className="glass-panel h-9 min-w-56 flex-1 rounded-md px-2.5 text-sm outline-none"
                  />
                  <button type="button" onClick={() => decide(approval, 'approve')} disabled={busy !== null} className={buttonVariants({ variant: 'default' })}>
                    {busy === approval.id ? 'Recording…' : 'Approve'}
                  </button>
                  <button type="button" onClick={() => decide(approval, 'decline')} disabled={busy !== null} className={buttonVariants({ variant: 'glass' })}>
                    Send back
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {others.length > 0 && (
        <section aria-label="Other items waiting on you" className="flex flex-col gap-3">
          {others.map((item) => (
            <article key={`${item.kind}:${item.id}`} className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border border-needs-you/25 p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Tag tone={item.severity === 'high' ? 'risk' : item.severity === 'normal' ? 'needs-you' : 'quiet'}>{item.kind.replace(/_/g, ' ')}</Tag>
                  <span>{time(item.createdAt)}</span>
                </div>
                <h2 className="text-sm font-semibold">{item.title}</h2>
                <p className="text-[13px] text-foreground/80">{item.detail}</p>
              </div>
              <div className="flex items-center gap-2">
                {item.jobId && (
                  <a href={href({ name: 'job', jobId: item.jobId })} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
                    Open job
                  </a>
                )}
                {item.kind === 'budget_exception' && (
                  <a href={href({ name: 'ai' })} className={buttonVariants({ variant: 'glass', size: 'sm' })}>
                    Open AI usage
                  </a>
                )}
                {item.kind === 'blocker' && (
                  <button type="button" onClick={() => resolve(item.id)} disabled={busy !== null} className={buttonVariants({ variant: 'default', size: 'sm' })}>
                    {busy === item.id ? 'Resolving…' : 'Resolve'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      <section aria-label="Recently approved" className="bg-card flex flex-col gap-2 rounded-xl p-5">
        <SectionTitle aside="audited">Recently approved</SectionTitle>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approved decisions yet.</p>
        ) : (
          recent.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-2 text-sm last:border-b-0">
              <span className="min-w-0 flex-1 truncate">{a.title}</span>
              <span className="text-xs text-muted-foreground">
                {a.decidedBy} · {time(a.decidedAt)}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
