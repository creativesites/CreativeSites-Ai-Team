import React, { useState } from 'react';
import { ki, fmtDate, KiBrief } from '../../services/knowledgeApi';
import { Btn, Card, Empty, ErrorBox, Evidence, Input, Pill, Select, Stat, StatusPill, useKi } from './shared';

export type KiTab = 'overview' | 'documents' | 'knowledge' | 'commitments' | 'projects' | 'sources' | 'settings';

export const OverviewTab: React.FC<{ go: (t: KiTab) => void; projects: { id: string; title: string }[] }> = ({ go, projects }) => {
  const { data, error, loading, reload } = useKi<any>('overview');
  const [review, setReview] = useState<KiBrief | null>(null);
  const [capture, setCapture] = useState({ text: '', author: '', projectId: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { setErr(null); await fn(); setMsg(ok); await reload(); } catch (e: any) { setErr(String(e?.message || e)); }
  };
  const c = data?.counts;
  return (
    <div className="space-y-4">
      <ErrorBox error={error || err} />
      {msg && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2">{msg}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Stat label="Documents" value={c?.documents ?? '…'} onClick={() => go('documents')} />
        <Stat label="Knowledge" value={c?.knowledge ?? '…'} onClick={() => go('knowledge')} />
        <Stat label="To review" value={c?.proposedKnowledge ?? '…'} tone={c?.proposedKnowledge ? 'amber' : 'zinc'} onClick={() => go('knowledge')} />
        <Stat label="Conflicts" value={c?.openConflicts ?? '…'} tone={c?.openConflicts ? 'red' : 'zinc'} onClick={() => go('knowledge')} />
        <Stat label="Awaiting confirm" value={c?.awaitingConfirmation ?? '…'} tone={c?.awaitingConfirmation ? 'amber' : 'zinc'} onClick={() => go('commitments')} />
        <Stat label="Open commitments" value={c?.commitmentsOpen ?? '…'} onClick={() => go('commitments')} />
        <Stat label="Overdue" value={data?.overdue?.length ?? '…'} tone={data?.overdue?.length ? 'red' : 'zinc'} onClick={() => go('commitments')} />
        <Stat label="Fulfilled (verified)" value={c?.fulfilled ?? '…'} tone="green" onClick={() => go('commitments')} />
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Card title="Needs your attention" className="xl:col-span-2" right={<Btn onClick={reload}>{loading ? 'Refreshing…' : 'Refresh'}</Btn>}>
          {!data?.attention?.length && !data?.awaitingConfirmation?.length && !data?.conflicts?.length && !data?.documents?.failed?.length && <Empty>Nothing needs attention.</Empty>}
          <ul className="space-y-2">
            {data?.attention?.map((a: any, i: number) => (
              <li key={`a${i}`} className="text-xs flex gap-2 items-start"><Pill tone="red">{a.severity}</Pill><span className="text-zinc-700">{a.text}<Evidence refs={a.evidence} /></span></li>
            ))}
            {data?.awaitingConfirmation?.map((m: any) => (
              <li key={m.id} className="text-xs flex gap-2 items-center justify-between border-t border-zinc-100 pt-2">
                <span className="flex gap-2 items-center min-w-0"><Pill tone="amber">confirm?</Pill><span className="truncate text-zinc-700">{m.description}</span>
                  {m.deadlineAt && <span className="text-[10px] font-mono text-zinc-400">due {fmtDate(m.deadlineAt)}</span>}{m.lowConfidence && <Pill tone="red">low confidence</Pill>}</span>
                <span className="flex gap-1 shrink-0">
                  <Btn kind="primary" onClick={() => act(() => ki('commitments.confirm', { commitmentId: m.id }), 'Commitment confirmed')}>Confirm</Btn>
                  <Btn kind="danger" onClick={() => { const reason = window.prompt('Reason for rejecting?'); if (reason) act(() => ki('commitments.reject', { commitmentId: m.id, reason }), 'Commitment rejected'); }}>Reject</Btn>
                </span>
              </li>
            ))}
            {data?.conflicts?.map((cf: any) => (
              <li key={cf.id} className="text-xs border-t border-zinc-100 pt-2 flex gap-2 items-center"><Pill tone="red">conflict</Pill>
                <span className="text-zinc-700">“{cf.a.title}” vs “{cf.b.title}” — {cf.reason}</span><Btn onClick={() => go('knowledge')}>Resolve</Btn></li>
            ))}
            {data?.documents?.failed?.map((f: any) => (
              <li key={f.versionId} className="text-xs border-t border-zinc-100 pt-2 flex gap-2 items-center"><Pill tone="red">processing failed</Pill>
                <span className="text-zinc-700">{f.name} v{f.versionNo}: {f.error?.message || String(f.error)}</span>
                <Btn onClick={() => act(() => ki('documents.retry'), 'Retry queued')}>Retry</Btn></li>
            ))}
          </ul>
        </Card>

        <Card title="Capture a message or instruction">
          <div className="space-y-2">
            <textarea value={capture.text} onChange={(e) => setCapture({ ...capture, text: e.target.value })} rows={4} placeholder="Paste a request, e.g. “Can you do a security review by Friday?”"
              className="w-full rounded-xl border border-zinc-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            <div className="flex gap-2">
              <Input placeholder="From (e.g. barbara)" value={capture.author} onChange={(e) => setCapture({ ...capture, author: e.target.value })} className="flex-1" />
              <Select value={capture.projectId} onChange={(e) => setCapture({ ...capture, projectId: e.target.value })}>
                <option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Select>
            </div>
            <Btn kind="primary" disabled={!capture.text.trim()} onClick={() => act(async () => {
              const r = await ki<any>('capture.message', { text: capture.text, authorId: capture.author || undefined, authorName: capture.author || undefined, projectId: capture.projectId || undefined });
              setCapture({ text: '', author: '', projectId: '' });
              setMsg(`Original preserved. ${r.extraction?.created?.length || 0} commitment(s) proposed for confirmation${r.extraction?.dropped ? `, ${r.extraction.dropped} low-confidence dropped` : ''}.`);
            }, 'Captured')}>Capture & extract</Btn>
          </div>
        </Card>
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Card title="Upcoming deadlines">{data?.upcoming?.length ? <ul className="space-y-1.5">{data.upcoming.map((u: any) => <li key={u.id} className="text-xs text-zinc-700 flex justify-between gap-2"><span className="truncate">{u.description}</span><span className="font-mono text-zinc-400 shrink-0">{fmtDate(u.deadlineAt)}</span></li>)}</ul> : <Empty>No deadlines in the next 14 days.</Empty>}</Card>
        <Card title="Overdue">{data?.overdue?.length ? <ul className="space-y-1.5">{data.overdue.map((u: any) => <li key={u.id} className="text-xs text-zinc-700 flex justify-between gap-2"><span className="truncate">{u.description}</span><StatusPill status={u.status} /></li>)}</ul> : <Empty>Nothing overdue.</Empty>}</Card>
        <Card title="Recent decisions">{data?.recentDecisions?.length ? <ul className="space-y-1.5">{data.recentDecisions.map((d: any) => <li key={d.id} className="text-xs text-zinc-700">{d.title}<div className="text-[10px] text-zinc-400">approved by {d.decided_by} · {fmtDate(d.decided_at)}</div></li>)}</ul> : <Empty>No decisions in the last 14 days.</Empty>}</Card>
        <Card title="Project risks" className="xl:col-span-2">{data?.risks?.length ? <ul className="space-y-1.5">{data.risks.map((r: any, i: number) => <li key={i} className="text-xs text-zinc-700 flex gap-2"><Pill tone={r.severity === 'high' ? 'red' : r.severity === 'medium' ? 'amber' : 'zinc'}>{r.severity}</Pill><span>{r.text}<Evidence refs={r.evidence} /></span></li>)}</ul> : <Empty>No risks detected from current records.</Empty>}</Card>
        <Card title="Weekly review" right={<Btn onClick={async () => { try { setReview(await ki<KiBrief>('review.weekly', {})); } catch (e: any) { setErr(String(e?.message || e)); } }}>Generate now</Btn>}>
          {review ? <div className="text-xs space-y-1">
            {review.funnel && <div className="flex flex-wrap gap-1 mb-2">{Object.entries(review.funnel).map(([k, v]) => <Pill key={k} tone={k === 'verified_done' ? 'green' : k === 'reported_done_unverified' ? 'amber' : 'zinc'}>{k.replace(/_/g, ' ')}: {v as number}</Pill>)}</div>}
            {review.sections.map((s) => <div key={s.title} className="flex justify-between"><span className="text-zinc-600">{s.title}</span><span className="font-mono text-zinc-800">{s.count ?? s.items.length}</span></div>)}
            <details className="mt-2"><summary className="cursor-pointer text-indigo-600">Markdown</summary><pre className="whitespace-pre-wrap text-[10px] bg-zinc-50 p-2 rounded-xl max-h-64 overflow-auto">{review.markdown}</pre></details>
          </div> : <Empty>On-demand. Completed work counts only when verified.</Empty>}
        </Card>
      </div>
    </div>
  );
};
