import React, { useState } from 'react';
import { ki, fileToBase64, fmtDate, KiDocument, KiVersion } from '../../services/knowledgeApi';
import { Btn, Card, Empty, ErrorBox, Field, Input, Pill, Select, StatusPill, useKi } from './shared';

const CATEGORIES = ['general', 'project_plan', 'technical_spec', 'architecture', 'adr', 'meeting_summary', 'research', 'proposal', 'requirements', 'qa_report', 'delivery_report', 'procedure', 'policy', 'instruction', 'transcript', 'source_code', 'data', 'contract'];
const PIPELINE = ['received', 'stored', 'extracting', 'extracted', 'indexing', 'indexed', 'available'];

const Pipeline: React.FC<{ status: string }> = ({ status }) => {
  const idx = PIPELINE.indexOf(status);
  const failed = status === 'failed';
  return (
    <div className="flex items-center gap-1" title={status}>
      {['Stored', 'Extracted', 'Indexed', 'Available'].map((label, i) => {
        const reached = status === 'available' || (idx >= [1, 3, 5, 6][i]);
        return <span key={label} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${failed ? 'bg-rose-50 text-rose-500' : reached ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>{label}</span>;
      })}
    </div>
  );
};

export const DocumentsTab: React.FC<{ projects: { id: string; title: string }[] }> = ({ projects }) => {
  const [filters, setFilters] = useState({ projectId: '', category: '', text: '', includeArchived: false });
  const { data: docs, error, reload, loading } = useKi<KiDocument[]>('documents.list', { ...filters, projectId: filters.projectId || undefined, category: filters.category || undefined, text: filters.text || undefined });
  const [sel, setSel] = useState<string | null>(null);
  const [up, setUp] = useState({ projectId: '', category: 'general', classification: 'internal' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<any[] | null>(null);
  const pipeline = useKi<any>('documents.get', { documentId: sel || '' }, [sel]);
  const detail = sel ? pipeline.data : null;

  const upload = async (file: File | undefined, documentId?: string) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const r = await ki<any>('documents.upload', { filename: file.name, base64: await fileToBase64(file), projectId: up.projectId || undefined, category: up.category, classification: up.classification, documentId });
      if (r.duplicate) setErr(`Duplicate: identical content already stored (${r.scope === 'same_document' ? 'same document' : 'another document'}). Nothing was changed.`);
      await reload(); if (r.documentId) setSel(r.documentId);
    } catch (e: any) { setErr(String(e?.message || e)); } finally { setBusy(false); }
  };
  const act = async (fn: () => Promise<unknown>) => { try { setErr(null); await fn(); await reload(); await pipeline.reload(); } catch (e: any) { setErr(String(e?.message || e)); } };

  return (
    <div className="grid xl:grid-cols-5 gap-4">
      <div className="xl:col-span-3 space-y-3">
        <ErrorBox error={error || err} />
        <Card title="Upload or import" right={busy ? <Pill tone="blue">processing…</Pill> : undefined}>
          <div className="flex flex-wrap gap-2 items-end">
            <Field label="Project"><Select value={up.projectId} onChange={(e) => setUp({ ...up, projectId: e.target.value })}><option value="">Organisation-wide</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
            <Field label="Category"><Select value={up.category} onChange={(e) => setUp({ ...up, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Classification"><Select value={up.classification} onChange={(e) => setUp({ ...up, classification: e.target.value })}>{['public', 'internal', 'confidential', 'restricted'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <label className="h-8 px-3 rounded-xl bg-zinc-900 text-white text-[11px] font-semibold flex items-center cursor-pointer">Choose file…
              <input type="file" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
          </div>
          <p className="text-[10px] text-zinc-400 mt-2">PDF, DOCX, XLSX, PPTX, CSV, Markdown/text, source & config files, transcripts (.vtt/.srt), images (OCR needs tesseract). Originals are stored immutably; duplicates are detected by hash.</p>
        </Card>

        <Card title="Library" right={<div className="flex gap-2 items-center">
          <Input placeholder="Filter by name…" value={filters.text} onChange={(e) => setFilters({ ...filters, text: e.target.value })} className="w-40" />
          <Select value={filters.projectId} onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
          <Select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
          <label className="text-[10px] text-zinc-500 flex items-center gap-1"><input type="checkbox" checked={filters.includeArchived} onChange={(e) => setFilters({ ...filters, includeArchived: e.target.checked })} />archived</label>
        </div>}>
          {loading && !docs ? <Empty>Loading…</Empty> : !docs?.length ? <Empty>No documents yet. Upload a specification, plan or report.</Empty> : (
            <table className="w-full text-xs"><thead><tr className="text-left text-[10px] font-mono uppercase text-zinc-400"><th className="pb-2">Document</th><th>Category</th><th>Version</th><th>Pipeline</th><th>Updated</th></tr></thead>
              <tbody>{docs.map((d) => (
                <tr key={d.id} onClick={() => setSel(d.id)} className={`border-t border-zinc-100 cursor-pointer hover:bg-indigo-50/40 ${sel === d.id ? 'bg-indigo-50/60' : ''}`}>
                  <td className="py-2 pr-2"><div className="font-semibold text-zinc-800 truncate max-w-[16rem]">{d.displayName}</div><div className="text-[10px] text-zinc-400">{d.sourceKind} · {d.authorId} · {d.classification}{d.projectId ? ` · ${d.projectId}` : ''}</div></td>
                  <td>{d.category}</td><td>{d.current ? `v${d.current.versionNo}` : '—'}</td>
                  <td>{d.status === 'archived' ? <StatusPill status="archived" /> : d.latestStatus ? <Pipeline status={d.latestStatus} /> : null}</td><td className="text-zinc-400">{fmtDate(d.updatedAt)}</td></tr>))}</tbody></table>
          )}
        </Card>

        <Card title="Search documents" right={<Btn kind="primary" disabled={!q.trim()} onClick={async () => { try { setHits((await ki<any>('search', { query: q, types: ['document'], limit: 8 })).results); } catch (e: any) { setErr(String(e?.message || e)); } }}>Search</Btn>}>
          <Input placeholder="Natural language or exact terms (hybrid search)…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q.trim() && ki<any>('search', { query: q, types: ['document'], limit: 8 }).then((r) => setHits(r.results))} className="w-full" />
          {hits && (hits.length ? <ul className="mt-3 space-y-2">{hits.map((h) => (
            <li key={h.id} className="text-xs border-t border-zinc-100 pt-2 cursor-pointer" onClick={() => setSel(h.citation.documentId)}>
              <div className="font-semibold text-zinc-800 flex gap-2 items-center">{h.title}{h.flags?.length ? <Pill tone="red">possible prompt injection</Pill> : null}{!h.citation.current && <Pill tone="zinc">old version</Pill>}</div>
              <div className="text-zinc-600">{h.excerpt}</div><div className="text-[10px] font-mono text-zinc-400">v{h.citation.versionNo} · chars {h.citation.charStart}–{h.citation.charEnd} · score {h.score}</div></li>))}</ul> : <Empty>No matches.</Empty>)}
        </Card>
      </div>

      <div className="xl:col-span-2 space-y-3">
        {!sel ? <Card><Empty>Select a document to see versions, status, provenance and relationships.</Empty></Card> : !detail ? <Card><Empty>Loading…</Empty></Card> : (
          <>
            <Card title="Document" right={<div className="flex gap-1">
              {detail.status === 'archived' ? <Btn onClick={() => act(() => ki('documents.restore', { documentId: detail.id }))}>Restore</Btn> : <Btn onClick={() => { const reason = window.prompt('Archive reason?') ?? ''; act(() => ki('documents.archive', { documentId: detail.id, reason })); }}>Archive</Btn>}
              <label className="h-8 px-3 rounded-xl bg-zinc-100 border border-zinc-200/80 text-[11px] font-semibold flex items-center cursor-pointer">New version…<input type="file" className="hidden" onChange={(e) => { upload(e.target.files?.[0], detail.id); e.currentTarget.value = ''; }} /></label></div>}>
              <h4 className="text-sm font-bold text-zinc-900">{detail.displayName}</h4>
              <div className="text-[11px] text-zinc-500 mt-1 flex flex-wrap gap-1.5"><Pill tone="indigo">{detail.category}</Pill><Pill>{detail.classification}</Pill><Pill>{detail.sourceKind}</Pill><span>by {detail.authorId}</span><span>· created {fmtDate(detail.createdAt)}</span></div>
              {detail.origin && <div className="text-[11px] text-zinc-500 mt-2">Generated for: {Object.entries(detail.origin).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ')}</div>}
              {detail.links?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{detail.links.map((l: any) => <Pill key={l.link_type + l.target_id}>{l.link_type}: {l.target_id}</Pill>)}</div>}
            </Card>
            <Card title="Versions">
              <ul className="space-y-2">{detail.versions.map((v: KiVersion) => (
                <li key={v.id} className="text-xs border border-zinc-100 rounded-2xl p-3">
                  <div className="flex items-center justify-between"><span className="font-semibold">v{v.versionNo} {v.isCurrent && <Pill tone="green">current</Pill>}</span><StatusPill status={v.status} /></div>
                  <div className="text-[10px] font-mono text-zinc-400 mt-1">{v.filename} · {(v.size / 1024).toFixed(1)} KB · sha256 {v.hash.slice(0, 12)}… · {fmtDate(v.receivedAt)} · {v.createdBy}</div>
                  {v.extractor && <div className="text-[10px] text-zinc-500">extracted with {v.extractor}{v.extractionQuality === 'best_effort' ? ' (best effort — verify)' : ''} · {v.chunkCount} chunks</div>}
                  {v.changeNote && <div className="text-[11px] text-zinc-600">“{v.changeNote}”</div>}
                  {(v.extractionError || v.indexError) && <div className="mt-1 text-[11px] text-rose-700 bg-rose-50 rounded-lg px-2 py-1">{(v.extractionError || v.indexError).message || String(v.extractionError || v.indexError)}{(v.extractionError || v.indexError).retryable ? ' — retryable' : ''}</div>}
                  <div className="mt-2 flex gap-1"><Btn onClick={() => act(() => ki('documents.reprocess', { versionId: v.id }))}>Reprocess</Btn></div>
                </li>))}</ul>
            </Card>
            <Preview documentId={detail.id} versionId={detail.currentVersionId} />
            <Derived documentId={detail.id} />
          </>
        )}
      </div>
    </div>
  );
};

const Preview: React.FC<{ documentId: string; versionId?: string | null }> = ({ documentId, versionId }) => {
  const { data, error } = useKi<any>('documents.read', versionId ? { documentId, versionId, length: 3000 } : { documentId: '' }, [versionId]);
  if (!versionId) return null;
  return <Card title="Preview (extracted text — untrusted evidence)"><ErrorBox error={error} />{data && <pre className="whitespace-pre-wrap text-[11px] text-zinc-700 max-h-72 overflow-auto bg-zinc-50 rounded-xl p-3">{data.content}{data.truncated ? '\n…' : ''}</pre>}</Card>;
};
const Derived: React.FC<{ documentId: string }> = ({ documentId }) => {
  const { data } = useKi<any>('documents.relations', { documentId });
  if (!data?.knowledge?.length) return null;
  return <Card title="Knowledge derived from this document"><ul className="space-y-1">{data.knowledge.map((k: any) => <li key={k.id} className="text-xs flex gap-2"><Pill tone="indigo">{k.type}</Pill><span className="truncate text-zinc-700">{k.title}</span><StatusPill status={k.status} /></li>)}</ul></Card>;
};
