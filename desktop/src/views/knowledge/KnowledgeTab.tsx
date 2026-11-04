import React, { useState } from 'react';
import { ki, fmtDate, KiKnowledge } from '../../services/knowledgeApi';
import { Btn, Card, Confidence, Empty, ErrorBox, Field, Input, Pill, Select, StatusPill, useKi } from './shared';

const TYPES = ['fact', 'decision', 'requirement', 'instruction', 'policy', 'lesson', 'preference', 'assumption', 'hypothesis', 'reference'];
const AUTH_TONE = ['zinc', 'zinc', 'blue', 'green', 'green', 'indigo'];

export const KnowledgeTab: React.FC<{ projects: { id: string; title: string }[] }> = ({ projects }) => {
  const [f, setF] = useState({ type: '', status: '', projectId: '', q: '' });
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hits, setHits] = useState<any[] | null>(null);
  const list = useKi<KiKnowledge[]>('knowledge.list', { type: f.type || undefined, status: f.status || undefined, projectId: f.projectId || undefined, includeInactive: f.status === 'superseded' || f.status === 'archived' });
  const conflicts = useKi<any[]>('knowledge.conflicts', {});
  const detail = useKi<any>('knowledge.get', { knowledgeId: sel || '' }, [sel]);
  const reloadAll = async () => { await list.reload(); await conflicts.reload(); if (sel) await detail.reload(); };
  const act = async (fn: () => Promise<unknown>) => { try { setErr(null); await fn(); await reloadAll(); } catch (e: any) { setErr(String(e?.message || e)); } };

  const rec: KiKnowledge | undefined = sel ? detail.data?.record : undefined;
  return (
    <div className="grid xl:grid-cols-5 gap-4">
      <div className="xl:col-span-3 space-y-3">
        <ErrorBox error={list.error || err} />
        {conflicts.data && conflicts.data.length > 0 && (
          <Card title={`Conflicts requiring resolution (${conflicts.data.length})`}>
            <ul className="space-y-3">{conflicts.data.map((c) => <ConflictRow key={c.id} c={c} onResolve={(resolution, note) => act(() => ki('knowledge.resolve', { conflictId: c.id, resolution, note }))} />)}</ul>
          </Card>
        )}
        <Card title="Knowledge explorer" right={<div className="flex gap-2">
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">All types</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Current</option>{['proposed', 'accepted', 'verified', 'disputed', 'superseded', 'archived'].map((t) => <option key={t}>{t}</option>)}</Select>
          <Select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></div>}>
          <div className="flex gap-2 mb-3">
            <Input className="flex-1" placeholder="Search knowledge (ranked by authority, status, recency)…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })}
              onKeyDown={async (e) => { if (e.key === 'Enter' && f.q.trim()) setHits((await ki<any>('search', { query: f.q, types: ['knowledge'], projectId: f.projectId || undefined, includeSuperseded: f.status === 'superseded' })).results); }} />
            {hits && <Btn onClick={() => setHits(null)}>Clear</Btn>}
          </div>
          {hits ? (hits.length ? <ul className="space-y-2">{hits.map((h) => <li key={h.id} onClick={() => setSel(h.id)} className="text-xs border-t border-zinc-100 pt-2 cursor-pointer"><div className="font-semibold text-zinc-800">{h.title} <StatusPill status={h.status} /></div><div className="text-zinc-600">{h.excerpt}</div>
            <div className="text-[10px] font-mono text-zinc-400">score {h.score} · via {Object.keys(h.explain.via).join('+')} · authority ×{h.explain.authorityFactor}</div></li>)}</ul> : <Empty>No matches.</Empty>)
            : !list.data?.length ? <Empty>No knowledge records in this view. Upload documents or capture messages; extracted items arrive as proposals to review.</Empty> : (
              <ul className="space-y-1">{list.data.map((k) => (
                <li key={k.id} onClick={() => setSel(k.id)} className={`flex items-center gap-2 text-xs rounded-xl px-2 py-1.5 cursor-pointer hover:bg-indigo-50/50 ${sel === k.id ? 'bg-indigo-50/70' : ''}`}>
                  <Pill tone="indigo">{k.type}</Pill><span className="truncate flex-1 text-zinc-800">{k.title}</span>
                  {k.staleSource && <Pill tone="amber" title="Its source document has a newer version">source updated</Pill>}{k.reviewDue && <Pill tone="amber">review due</Pill>}
                  <Pill tone={AUTH_TONE[k.authority]}>{k.authorityName}</Pill><StatusPill status={k.status} /></li>))}</ul>)}
        </Card>
      </div>

      <div className="xl:col-span-2 space-y-3">
        {!rec ? <Card><Empty>Select a record to review provenance, confidence and relationships.</Empty></Card> : (
          <>
            <Card title={`${rec.type} · ${rec.status}`}>
              <h4 className="text-sm font-bold text-zinc-900">{rec.title}</h4>
              <p className="text-xs text-zinc-700 mt-2 whitespace-pre-wrap">{rec.content}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-600">
                <div>Authority: <Pill tone={AUTH_TONE[rec.authority]}>{rec.authorityName}</Pill></div><div>Confidence: <Confidence value={rec.confidence} /></div>
                <div>Evidence type: <Pill>{rec.evidenceType.replace(/_/g, ' ')}</Pill></div><div>Verification: <Pill tone={rec.verificationClass === 'VERIFIED' ? 'green' : 'zinc'}>{rec.verificationClass}</Pill></div>
                <div>Author: {rec.authorId}</div><div>Captured: {fmtDate(rec.capturedAt)}</div>
                {rec.approvedBy && <div>Approved by: {rec.approvedBy}</div>}{rec.supersededBy && <div>Superseded by: <code>{rec.supersededBy.slice(0, 14)}</code></div>}
              </div>
              {rec.sourceRef && <div className="mt-3 text-[11px] bg-zinc-50 rounded-xl p-3"><div className="font-mono text-[10px] uppercase text-zinc-400 mb-1">Provenance</div>
                {rec.sourceRef.documentName || rec.sourceRef.documentId}{rec.sourceRef.versionNo ? ` v${rec.sourceRef.versionNo}` : ''}{rec.sourceRef.sectionPath ? ` › ${rec.sourceRef.sectionPath}` : ''}
                {rec.sourceRef.charStart !== undefined && <span className="text-zinc-400"> (chars {rec.sourceRef.charStart}–{rec.sourceRef.charEnd})</span>}
                {rec.sourceRef.quote && <blockquote className="mt-1 border-l-2 border-indigo-200 pl-2 text-zinc-600">“{rec.sourceRef.quote}”</blockquote>}</div>}
              {rec.derivedBy !== 'human' && rec.status === 'proposed' && <p className="mt-2 text-[11px] text-amber-700">This was {rec.derivedBy === 'agent' ? 'inferred by an agent' : 'extracted automatically'} and is <b>not</b> established knowledge until accepted.</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {['proposed', 'disputed'].includes(rec.status) && <>
                  <Select id="auth" defaultValue="approved"><option value="documented">documented</option><option value="approved">approved</option><option value="mandated">mandated (owner)</option></Select>
                  <Btn kind="primary" onClick={() => act(() => ki('knowledge.accept', { knowledgeId: rec.id, authority: (document.getElementById('auth') as HTMLSelectElement).value }))}>Accept</Btn>
                  <Btn kind="danger" onClick={() => { const reason = window.prompt('Why reject?') ?? ''; act(() => ki('knowledge.reject', { knowledgeId: rec.id, reason })); }}>Reject</Btn></>}
                {['accepted', 'proposed'].includes(rec.status) && <Btn onClick={() => { const evidence = window.prompt('Independent evidence (command/result/observation)?'); if (evidence) act(() => ki('knowledge.verify', { knowledgeId: rec.id, evidenceClass: 'OBSERVED', evidence })); }}>Verify…</Btn>}
              </div>
              {rec.openConflicts && rec.openConflicts.length > 0 && <p className="mt-2 text-[11px] text-rose-700">Open conflict: {rec.openConflicts.map((c) => c.reason).join('; ')}</p>}
            </Card>
            {detail.data?.related && (
              <Card title="Related">
                <RelatedList title="Documents" items={detail.data.related.documents.map((d: any) => `${d.name} (${d.relation})`)} />
                <RelatedList title="Knowledge" items={detail.data.related.knowledge.map((k: any) => `${k.relation}: ${k.title}`)} />
                <RelatedList title="Commitments from the same source" items={detail.data.related.commitments.map((c: any) => `[${c.status}] ${c.description}`)} />
                <RelatedList title="Decision" items={detail.data.related.decisions.map((d: any) => `${d.status}`)} />
                {detail.data.related.source && <RelatedList title="Original source" items={[`${detail.data.related.source.platform}${detail.data.related.source.channel ? '/' + detail.data.related.source.channel : ''} from ${detail.data.related.source.authorId} at ${fmtDate(detail.data.related.source.originalTs)}`]} />}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const RelatedList: React.FC<{ title: string; items: string[] }> = ({ title, items }) => !items.length ? null : (
  <div className="mb-2"><div className="text-[10px] font-mono uppercase text-zinc-400 font-bold">{title}</div><ul className="text-xs text-zinc-700 list-disc ml-4">{items.map((i, n) => <li key={n}>{i}</li>)}</ul></div>
);

const ConflictRow: React.FC<{ c: any; onResolve: (r: string, note: string) => void }> = ({ c, onResolve }) => {
  const [note, setNote] = useState('');
  const side = (r: any, label: string) => (
    <div className="flex-1 bg-zinc-50 rounded-2xl p-3 text-xs"><div className="flex gap-1 items-center mb-1"><Pill tone="indigo">{label}</Pill><Pill tone={AUTH_TONE[r.authority]}>{r.authorityName}</Pill><StatusPill status={r.status} /></div>
      <div className="text-zinc-800">{r.content}</div><div className="text-[10px] text-zinc-400 mt-1">{r.authorId} · {fmtDate(r.capturedAt)}</div></div>
  );
  return (
    <li className="space-y-2">
      <div className="text-[11px] text-rose-700">{c.reason} <span className="text-zinc-400">(advice: prefer {c.recommendation.prefer === c.a.id ? 'A' : 'B'} — {c.recommendation.basis})</span></div>
      <div className="flex gap-2">{side(c.a, 'A (older)')}{side(c.b, 'B (newer)')}</div>
      <div className="flex gap-2 items-center"><Input className="flex-1" placeholder="Rationale (required, recorded with your name)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Btn disabled={!note.trim()} onClick={() => onResolve('prefer_a', note)}>Keep A</Btn><Btn disabled={!note.trim()} onClick={() => onResolve('prefer_b', note)}>Keep B</Btn>
        <Btn disabled={!note.trim()} onClick={() => onResolve('both_valid', note)}>Both valid</Btn><Btn disabled={!note.trim()} onClick={() => onResolve('dismiss', note)}>Not a conflict</Btn></div>
    </li>
  );
};
