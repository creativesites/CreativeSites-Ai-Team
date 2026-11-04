import React, { useState } from 'react';
import { ki, fmtDate, KiCommitment } from '../../services/knowledgeApi';
import { Btn, Card, Confidence, Empty, ErrorBox, Input, Pill, Select, StatusPill, useKi } from './shared';

const VIEWS: { id: string; label: string; params: Record<string, unknown> }[] = [
  { id: 'all', label: 'All', params: {} }, { id: 'mine', label: 'Mine', params: { mine: true } }, { id: 'confirm', label: 'Awaiting confirmation', params: { status: 'needs_confirmation' } },
  { id: 'open', label: 'Open', params: { status: 'open' } }, { id: 'overdue', label: 'Overdue', params: { status: 'overdue' } }, { id: 'blocked', label: 'Blocked', params: { status: 'blocked' } },
  { id: 'fulfilled', label: 'Fulfilled', params: { status: 'fulfilled' } },
];

export const CommitmentsTab: React.FC<{ projects: { id: string; title: string }[] }> = ({ projects }) => {
  const [view, setView] = useState('confirm');
  const [text, setText] = useState('');
  const [projectId, setProjectId] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const base = VIEWS.find((v) => v.id === view)!.params;
  const list = useKi<KiCommitment[]>('commitments.list', { ...base, projectId: projectId || undefined });
  const detail = useKi<KiCommitment>('commitments.get', { commitmentId: sel || '' }, [sel]);
  const tasks = useKi<any[]>('work.tasks', { projectId: projectId || undefined });
  const act = async (fn: () => Promise<unknown>) => { try { setErr(null); await fn(); await list.reload(); if (sel) await detail.reload(); } catch (e: any) { setErr(String(e?.message || e)); } };
  const rows = (list.data || []).filter((c) => !text || c.description.toLowerCase().includes(text.toLowerCase()) || (c.sourceAuthor || '').toLowerCase().includes(text.toLowerCase()));
  const d = sel ? detail.data : null;

  return (
    <div className="grid xl:grid-cols-5 gap-4">
      <div className="xl:col-span-3 space-y-3">
        <ErrorBox error={list.error || err} />
        <Card title="Commitments & actions" right={<div className="flex gap-2"><Input placeholder="Search…" value={text} onChange={(e) => setText(e.target.value)} className="w-40" />
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></div>}>
          <div className="flex flex-wrap gap-1 mb-3">{VIEWS.map((v) => <button key={v.id} onClick={() => setView(v.id)} className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold cursor-pointer ${view === v.id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}>{v.label}</button>)}</div>
          {!rows.length ? <Empty>Nothing here.</Empty> : (
            <ul className="divide-y divide-zinc-100">{rows.map((c) => (
              <li key={c.id} onClick={() => setSel(c.id)} className={`py-2 px-2 cursor-pointer hover:bg-indigo-50/40 rounded-xl ${sel === c.id ? 'bg-indigo-50/60' : ''}`}>
                <div className="flex items-center gap-2 text-xs"><StatusPill status={c.effectiveStatus} /><Pill tone="indigo">{c.kind.replace(/_/g, ' ')}</Pill>
                  <span className="truncate flex-1 text-zinc-800 font-medium">{c.description}</span>{c.priority === 'urgent' || c.priority === 'high' ? <Pill tone="red">{c.priority}</Pill> : null}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5 flex gap-3 flex-wrap">
                  <span>from {c.sourceAuthor || c.requester || 'unknown'}{c.sourcePlatform ? ` via ${c.sourcePlatform}` : ''}</span>
                  <span>owner: {c.responsibleId || 'unassigned'}</span><span className={c.overdue ? 'text-rose-600 font-semibold' : ''}>due {c.deadlineAt ? fmtDate(c.deadlineAt) : c.deadlineNeedsClarification ? `unclear (“${c.deadlineText}”)` : '—'}</span>
                  <Confidence value={c.confidence} /></div></li>))}</ul>)}
        </Card>
      </div>

      <div className="xl:col-span-2 space-y-3">
        {!d ? <Card><Empty>Select a commitment to see its original source, tasks, evidence and history.</Empty></Card> : (
          <>
            <Card title={`${d.kind.replace(/_/g, ' ')} · ${d.effectiveStatus}`}>
              <h4 className="text-sm font-bold text-zinc-900">{d.description}</h4>
              <div className="text-[11px] text-zinc-600 mt-2 grid grid-cols-2 gap-1">
                <div>Requested by: {d.requester || '—'}</div><div>Owner: {d.responsibleId || 'unassigned'}</div>
                <div>Deadline: {d.deadlineAt ? fmtDate(d.deadlineAt) : '—'}</div><div>Priority: {d.priority}</div>
                <div>Confirmation: <Pill tone={d.confirmation === 'confirmed' ? 'green' : 'amber'}>{d.confirmation}</Pill></div><div>Confidence: <Confidence value={d.confidence} /></div>
              </div>
              {d.deadlineNeedsClarification && <p className="text-[11px] text-amber-700 mt-2">Deadline “{d.deadlineText}” is ambiguous — set a date when confirming.</p>}
              {d.acceptanceCriteria.length > 0 && <div className="mt-2 text-xs"><div className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Acceptance criteria</div><ol className="list-decimal ml-4 text-zinc-700">{d.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}</ol></div>}
              {d.blockedReason && <p className="text-[11px] text-rose-700 mt-2">Blocked: {d.blockedReason}</p>}
              <Actions d={d} act={act} tasks={tasks.data || []} />
            </Card>
            {d.source && <Card title="Original source (evidence)"><div className="text-[10px] font-mono text-zinc-400 mb-1">{d.source.platform}{d.source.channel ? ` / ${d.source.channel}` : ''} · {d.source.authorName || d.source.authorId} · {fmtDate(d.source.originalTs)} · trust: {d.source.trust}</div>
              <blockquote className="border-l-2 border-indigo-200 pl-3 text-xs text-zinc-700 whitespace-pre-wrap">{d.source.text}</blockquote>{d.source.originalUrl && <div className="text-[10px] text-indigo-600 mt-1 break-all">{d.source.originalUrl}</div>}</Card>}
            <Card title="Tasks (live from the work system)">
              {!d.tasks?.length ? <Empty>No tasks linked. A commitment is not a task — link one or more tasks to deliver it.</Empty> : <ul className="space-y-1.5">{d.tasks.map((t) => <li key={t.taskId} className="text-xs flex items-center gap-2"><code className="text-[10px]">{t.taskId}</code><span className="truncate flex-1">{t.title}</span><StatusPill status={t.status} />{t.verified ? <Pill tone="green">verified</Pill> : <Pill tone="amber" title={t.verificationReason}>unverified</Pill>}</li>)}</ul>}
            </Card>
            <Card title="Completion evidence">
              {!d.evidence?.length ? <Empty>No evidence yet. Fulfilment requires independently verified evidence.</Empty> : <ul className="space-y-1.5">{d.evidence.map((e) => <li key={e.id} className="text-xs"><Pill tone={e.independentlyVerified ? 'green' : 'amber'}>{e.class}{e.independentlyVerified ? ' ✓ ' + e.verifiedBy : ' unverified claim'}</Pill> {e.summary}<div className="text-[10px] text-zinc-400">by {e.submittedBy} · {fmtDate(e.createdAt)}</div>
                {!e.independentlyVerified && <Btn onClick={() => act(() => ki('commitments.verifyEvidence', { evidenceId: e.id, note: window.prompt('Verification note?') ?? '' }))}>Verify</Btn>}</li>)}</ul>}
            </Card>
            <Card title="History"><ul className="text-[11px] text-zinc-600 space-y-0.5">{d.history?.map((h, i) => <li key={i}><span className="font-mono text-zinc-400">{fmtDate(h.ts)}</span> {h.from_status || '∅'} → <b>{h.to_status}</b> by {h.actor}{h.reason ? ` — ${h.reason}` : ''}</li>)}</ul></Card>
          </>
        )}
      </div>
    </div>
  );
};

const Actions: React.FC<{ d: KiCommitment; act: (fn: () => Promise<unknown>) => void; tasks: any[] }> = ({ d, act, tasks }) => {
  const [owner, setOwner] = useState(d.responsibleId || '');
  const [taskId, setTaskId] = useState('');
  const id = d.id;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 items-center">
      {d.status === 'needs_confirmation' && <>
        <Input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} className="w-32" />
        <Btn kind="primary" onClick={() => act(() => ki('commitments.confirm', { commitmentId: id, responsibleId: owner || undefined, deadlineAt: d.deadlineNeedsClarification ? (window.prompt('Deadline (ISO date) — leave empty to confirm without one') || undefined) : undefined }))}>Confirm</Btn>
        <Btn kind="danger" onClick={() => { const reason = window.prompt('Reason for rejecting?'); if (reason) act(() => ki('commitments.reject', { commitmentId: id, reason })); }}>Reject</Btn></>}
      {['accepted', 'assigned', 'in_progress', 'blocked'].includes(d.status) && <>
        <Input placeholder="Assign to…" value={owner} onChange={(e) => setOwner(e.target.value)} className="w-28" />
        <Btn disabled={!owner} onClick={() => act(() => ki('commitments.assign', { commitmentId: id, responsibleId: owner }))}>Assign</Btn>
        <Select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="w-40"><option value="">Link task…</option>{tasks.map((t: any) => <option key={t.id} value={t.id}>{t.id} · {t.title.slice(0, 30)}</option>)}</Select>
        <Btn disabled={!taskId} onClick={() => act(() => ki('commitments.linkTask', { commitmentId: id, taskId }))}>Link</Btn>
        <Btn onClick={() => act(() => ki('commitments.status', { commitmentId: id, status: 'in_progress' }))}>Start</Btn>
        <Btn onClick={() => { const reason = window.prompt('What is blocking this?'); if (reason) act(() => ki('commitments.status', { commitmentId: id, status: 'blocked', reason })); }}>Block</Btn>
        <Btn onClick={() => { const summary = window.prompt('Evidence summary (command, link, observation)?'); if (summary) act(() => ki('commitments.evidence', { commitmentId: id, summary })); }}>Add evidence</Btn>
        <Btn kind="primary" onClick={() => act(() => ki('commitments.fulfil', { commitmentId: id }))}>Fulfil (evidence-gated)</Btn></>}
    </div>
  );
};
