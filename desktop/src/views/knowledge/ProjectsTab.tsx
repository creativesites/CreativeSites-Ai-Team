import React, { useState } from 'react';
import { ki, fmtDate, KiBrief } from '../../services/knowledgeApi';
import { Btn, Card, Empty, ErrorBox, Evidence, Pill, Select, StatusPill, useKi } from './shared';

export const ProjectsTab: React.FC<{ projects: { id: string; title: string }[] }> = ({ projects }) => {
  const [pid, setPid] = useState(projects[0]?.id || '');
  const intel = useKi<any>('project.intelligence', { projectId: pid || '' }, [pid]);
  const [review, setReview] = useState<KiBrief | null>(null);
  const [ctxErr, setCtxErr] = useState<string | null>(null);
  const d = pid ? intel.data : null;
  const Section: React.FC<{ title: string; items: any[]; render: (x: any) => React.ReactNode; empty: string }> = ({ title, items, render, empty }) => (
    <Card title={`${title}${items.length ? ` (${items.length})` : ''}`}>{items.length ? <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className="text-xs text-zinc-700">{render(x)}</li>)}</ul> : <Empty>{empty}</Empty>}</Card>
  );
  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Select value={pid} onChange={(e) => setPid(e.target.value)} className="w-72"><option value="">Select project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
        <Btn disabled={!pid} onClick={async () => { try { setReview(await ki<KiBrief>('review.weekly', { projectId: pid })); } catch (e: any) { setCtxErr(String(e?.message || e)); } }}>Weekly review</Btn>
        <Btn onClick={intel.reload}>Refresh</Btn>
      </div>
      <ErrorBox error={intel.error || ctxErr} />
      {!d ? <Card><Empty>{pid ? 'Loading…' : 'Choose a project to see objectives, approved requirements, decisions, risks, commitments and delivery.'}</Empty></Card> : (
        <div className="grid xl:grid-cols-3 gap-4">
          <Section title="Objectives" items={d.objectives || []} render={(o) => (typeof o === 'string' ? o : JSON.stringify(o))} empty="No objectives recorded in the project record." />
          <Section title="Approved requirements" items={d.approvedRequirements} render={(r) => <>{r.text} <Pill tone="green">{r.authority}</Pill><Evidence refs={r.evidence} /></>} empty="None accepted yet — review proposals in Knowledge." />
          <Section title="Decisions" items={d.decisions} render={(x) => <>{x.text} <span className="text-[10px] text-zinc-400">approved by {x.approvedBy}</span></>} empty="No approved decisions." />
          <Section title="Plans & blueprints" items={d.plans} render={(x) => <>{x.name} <Pill>{x.category}</Pill> v{x.version}</>} empty="No plan, spec or architecture documents." />
          <Section title="Risks & blockers" items={d.risks} render={(r) => <><Pill tone={r.severity === 'high' ? 'red' : r.severity === 'medium' ? 'amber' : 'zinc'}>{r.severity}</Pill> {r.text}<Evidence refs={r.evidence} /></>} empty="No risks derived from current records." />
          <Section title="Outstanding commitments" items={d.outstandingCommitments} render={(c) => <><StatusPill status={c.stage} /> {c.description} {c.deadlineAt && <span className="text-[10px] text-zinc-400">due {fmtDate(c.deadlineAt)}</span>} {c.overdue && <Pill tone="red">overdue</Pill>}</>} empty="Nothing outstanding." />
          <Section title="Awaiting confirmation" items={d.awaitingConfirmation} render={(c) => c.description} empty="None." />
          <Section title="Active tasks (work system)" items={d.activeTasks} render={(t) => <><code className="text-[10px]">{t.id}</code> {t.title} <StatusPill status={t.status} /></>} empty="No active tasks." />
          <Section title="Recent changes (7 days)" items={d.recentChanges} render={(c) => <><Pill>{c.category.replace(/_/g, ' ')}</Pill> {c.summary}</>} empty="No changes." />
          <Section title="Delivery history (verified)" items={d.deliveryHistory} render={(x) => <>{x.description} <span className="text-[10px] text-zinc-400">{fmtDate(x.fulfilledAt)}</span></>} empty="Nothing verified as delivered yet." />
        </div>
      )}
      {review && <Card title={`Weekly review — ${review.title || ''}`}>{review.funnel && <div className="flex flex-wrap gap-1 mb-2">{Object.entries(review.funnel).map(([k, v]) => <Pill key={k} tone={k === 'verified_done' ? 'green' : k === 'reported_done_unverified' ? 'amber' : 'zinc'}>{k.replace(/_/g, ' ')}: {v as number}</Pill>)}</div>}<pre className="whitespace-pre-wrap text-[11px] bg-zinc-50 rounded-xl p-3 max-h-96 overflow-auto">{review.markdown}</pre></Card>}
    </div>
  );
};
