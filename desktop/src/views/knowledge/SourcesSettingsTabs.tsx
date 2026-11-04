import React, { useState } from 'react';
import { ki, fmtDate } from '../../services/knowledgeApi';
import { Btn, Card, Empty, ErrorBox, Input, Pill, StatusPill, useKi } from './shared';

export const SourcesTab: React.FC = () => {
  const people = useKi<any>('people', {});
  const sources = useKi<any[]>('sources.list', { limit: 50 });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid xl:grid-cols-2 gap-4">
      <Card title="People (derived from captured sources — not a roster)">
        {!people.data?.people?.length ? <Empty>No sources captured yet.</Empty> : (
          <table className="w-full text-xs"><thead><tr className="text-left text-[10px] font-mono uppercase text-zinc-400"><th>Person</th><th>Sources</th><th>Requested</th><th>Owns (open)</th><th>Projects</th></tr></thead>
            <tbody>{people.data.people.map((p: any) => <tr key={p.id} className="border-t border-zinc-100"><td className="py-1.5"><div className="font-semibold">{p.name || p.id}</div><div className="text-[10px] text-zinc-400">{p.platforms.join(', ')} · last {fmtDate(p.lastSeen)}</div></td><td>{p.sources}</td><td>{p.commitmentsRequested}</td><td>{p.commitmentsOwned}</td><td className="text-zinc-500">{p.projects.join(', ') || '—'}</td></tr>)}</tbody></table>)}
        <div className="mt-4"><div className="text-[10px] font-mono uppercase text-zinc-400 font-bold mb-1">Connected sources</div>
          {people.data?.platforms?.length ? <ul className="text-xs space-y-1">{people.data.platforms.map((p: any, i: number) => <li key={i} className="flex justify-between"><span><Pill tone="indigo">{p.platform}</Pill> {p.workspace || ''}</span><span className="text-zinc-400">{p.captured} captured · last {fmtDate(p.lastCaptured)}</span></li>)}</ul> : <Empty>No sources connected. Integrations only ingest from explicit allow-lists.</Empty>}</div>
      </Card>
      <Card title="Captured sources (original evidence)">
        <ErrorBox error={sources.error} />
        {!sources.data?.length ? <Empty>Nothing captured.</Empty> : <ul className="space-y-2">{sources.data.map((s) => (
          <li key={s.id} className="text-xs border border-zinc-100 rounded-2xl p-3 cursor-pointer" onClick={() => setOpen(open === s.id ? null : s.id)}>
            <div className="flex items-center gap-2"><Pill tone="indigo">{s.platform}</Pill><span className="font-semibold">{s.authorName || s.authorId || 'unknown'}</span><span className="text-zinc-400">{s.channel || ''}</span>
              <Pill tone={s.trust === 'trusted' ? 'green' : 'zinc'}>{s.trust}</Pill>{s.flags?.length ? <Pill tone="red">possible prompt injection</Pill> : null}{s.redacted ? <Pill tone="amber">redacted</Pill> : null}<span className="ml-auto text-zinc-400">{fmtDate(s.originalTs || s.capturedAt)}</span></div>
            <div className={`text-zinc-700 mt-1 ${open === s.id ? '' : 'line-clamp-2'}`}>{s.text}</div>
            {open === s.id && <div className="text-[10px] font-mono text-zinc-400 mt-1">sha256 {s.textHash.slice(0, 16)}… · captured by {s.capturedBy} · message {s.messageId || '—'} {s.originalUrl || ''}</div>}</li>))}</ul>}
      </Card>
    </div>
  );
};

export const SettingsTab: React.FC = () => {
  const health = useKi<any>('health', {});
  const settings = useKi<any>('settings.get', {});
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<any>, label: string) => { try { setErr(null); const r = await fn(); setMsg(`${label}: ${JSON.stringify(r).slice(0, 160)}`); await health.reload(); await settings.reload(); } catch (e: any) { setErr(String(e?.message || e)); } };
  const h = health.data;
  return (
    <div className="grid xl:grid-cols-2 gap-4">
      <ErrorBox error={health.error || err} />
      {msg && <div className="xl:col-span-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2">{msg}</div>}
      <Card title="Processing health" right={<Btn onClick={health.reload}>Refresh</Btn>}>
        {!h ? <Empty>Loading…</Empty> : (
          <div className="text-xs space-y-2">
            <div className="flex flex-wrap gap-1.5"><Pill tone="green">schema v{h.schemaVersion}</Pill><Pill tone={h.audit.ok ? 'green' : 'red'}>audit chain {h.audit.ok ? 'intact' : `BROKEN at ${h.audit.brokenAt}`}</Pill><Pill tone={h.storage.ok ? 'green' : 'red'}>originals {h.storage.ok ? 'intact' : `${h.storage.bad.length} missing/corrupt`}</Pill><Pill tone={h.index.staleEmbeddings ? 'amber' : 'green'}>index {h.index.model}</Pill></div>
            <div>Work system: <code>{h.work.kind}</code> <span className="text-zinc-400 break-all">{h.work.source}</span> <span className="text-zinc-400">(read-only; KI owns no tasks/projects)</span></div>
            <div>Documents: {Object.entries(h.pipeline).map(([k, v]) => <span key={k} className="mr-2"><StatusPill status={k} /> {v as number}</span>)}{!Object.keys(h.pipeline).length && '—'}</div>
            <div>Jobs: {Object.entries(h.jobs).map(([k, v]) => <span key={k} className="mr-2"><StatusPill status={k} /> {v as number}</span>)}{!Object.keys(h.jobs).length && 'idle'}</div>
            <div>Index: {h.index.ftsRows} full-text rows · {h.index.embeddings} embeddings (dim {h.index.dim}){h.index.staleEmbeddings ? ` · ${h.index.staleEmbeddings} outdated` : ''}</div>
            <div className="flex gap-2 pt-1"><Btn onClick={() => run(() => ki('worker.drain'), 'Processed jobs')}>Run pending jobs</Btn><Btn onClick={() => run(() => ki('documents.retry'), 'Retry failed')}>Retry failed documents</Btn><Btn onClick={() => run(() => ki('index.rebuild'), 'Index rebuilt')}>Rebuild index</Btn></div>
          </div>)}
      </Card>
      <Card title="Retrieval & ingestion settings">
        {!settings.data ? <Empty>Loading…</Empty> : <table className="w-full text-xs"><tbody>{Object.entries(settings.data).map(([k, v]) => (
          <tr key={k} className="border-t border-zinc-100"><td className="py-1.5 font-mono text-[10px] text-zinc-500 w-1/2">{k}</td>
            <td>{typeof v === 'number' || typeof v === 'boolean' ? <Input defaultValue={String(v)} className="w-32" onBlur={(e) => { const raw = e.target.value; const val = typeof v === 'boolean' ? raw === 'true' : Number(raw); if (val !== v && !(typeof val === 'number' && isNaN(val))) run(() => ki('settings.set', { key: k, value: val }), `Updated ${k}`); }} /> : <code className="text-[10px] text-zinc-600 break-all">{JSON.stringify(v)}</code>}</td></tr>))}</tbody></table>}
        <p className="text-[10px] text-zinc-400 mt-2">Embedding provider is replaceable (local hashing by default; remote/local-model providers plug into the same interface). Changes are audited. Storage, retention and access policy are enforced server-side regardless of this screen.</p>
      </Card>
    </div>
  );
};
