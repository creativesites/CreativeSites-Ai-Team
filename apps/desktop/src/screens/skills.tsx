import * as React from 'react';
import { LoadNote, Panel, ScreenHeader } from '@/components/app/metric';
import { EmptyState, Tag } from '@/components/app/status';
import { Button } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';
import type { SkillDetail } from '@/lib/wp11-types';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  Copy,
  Edit3,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

const KNOWLEDGE_CATEGORIES = [
  'all',
  'general',
  'technical_spec',
  'architecture',
  'project_plan',
  'adr',
  'qa_report',
  'proposal',
  'procedure',
  'policy',
  'contract',
  'research',
  'data',
] as const;

const WORKFLOW_OPTIONS = ['quick', 'feature', 'strategic', 'incident'] as const;

export function SkillsScreen({ skillId }: { skillId?: string }) {
  const { client } = useRuntime();
  const [activeTab, setActiveTab] = React.useState<'skills' | 'knowledge'>('skills');
  const [bump, setBump] = React.useState(0);
  const [note, setNote] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Skills filter & search state
  const [skillQuery, setSkillQuery] = React.useState('');
  const [workflowFilter, setWorkflowFilter] = React.useState<string>('all');

  // Knowledge search & filter state
  const [docQuery, setDocQuery] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  const [selectedDocId, setSelectedDocId] = React.useState<string | null>(null);

  // Modals state
  const [showSkillModal, setShowSkillModal] = React.useState(false);
  const [editingSkill, setEditingSkill] = React.useState<SkillDetail | null>(null);
  const [showUploadModal, setShowUploadModal] = React.useState(false);

  // Runtime Data Queries
  const skillsList = useRuntimeData((c) => c.skills(), [bump]);
  const skillDetail = useRuntimeData((c) => (skillId ? c.skill(skillId) : Promise.resolve(null)), [skillId, bump]);
  const knowledgeList = useRuntimeData(
    (c) => c.knowledgeDocuments({ category: categoryFilter !== 'all' ? categoryFilter : undefined, q: docQuery || undefined }),
    [bump, categoryFilter, docQuery]
  );
  const docDetail = useRuntimeData((c) => (selectedDocId ? c.knowledgeDocument(selectedDocId) : Promise.resolve(null)), [selectedDocId, bump]);
  const projectsList = useRuntimeData((c) => c.projects(), []);

  const skills = skillsList.status === 'ready' ? skillsList.data.skills : [];
  const documents = knowledgeList.status === 'ready' ? knowledgeList.data.documents : [];
  const projects = projectsList.status === 'ready' ? projectsList.data : [];

  // Filter skills
  const q = skillQuery.trim().toLowerCase();
  const filteredSkills = skills.filter((s) => {
    const matchesQuery = !q || `${s.id} ${s.name} ${s.description} ${s.triggers.join(' ')} ${s.roles.join(' ')}`.toLowerCase().includes(q);
    const matchesWorkflow = workflowFilter === 'all' || s.workflows.includes(workflowFilter);
    return matchesQuery && matchesWorkflow;
  });

  // Reload skills from disk
  const handleReloadSkills = async () => {
    if (!client) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await client.reloadSkills();
      setNote(`Found ${r.found}: ${r.added} new or changed, ${r.unchanged} unchanged${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}.`);
      setBump((n) => n + 1);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Delete skill
  const handleDeleteSkill = async (id: string) => {
    if (!client) return;
    if (!window.confirm(`Are you sure you want to delete the skill "${id}"? This will remove the folder from disk.`)) return;
    setBusy(true);
    try {
      await client.deleteSkill(id);
      setNote(`Skill "${id}" deleted.`);
      if (skillId === id) {
        window.location.hash = href({ name: 'skills' });
      }
      setBump((n) => n + 1);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Delete knowledge document
  const handleDeleteDocument = async (id: string) => {
    if (!client) return;
    if (!window.confirm('Are you sure you want to delete this document from the library?')) return;
    setBusy(true);
    try {
      await client.deleteKnowledgeDocument(id);
      setNote('Document deleted from library.');
      if (selectedDocId === id) setSelectedDocId(null);
      setBump((n) => n + 1);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 py-4">
      {/* Top Header & Global Actions */}
      <ScreenHeader kicker="Executable procedures, pinned task skills, and organisational knowledge library" title="Skills & Knowledge">
        <div className="flex flex-wrap items-center gap-2">
          {/* Subpage Tabs Switcher */}
          <div className="glass-panel flex items-center rounded-xl p-1 text-xs font-medium border border-border/50">
            <button
              type="button"
              onClick={() => setActiveTab('skills')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer',
                activeTab === 'skills' ? 'glass-chosen text-foreground font-semibold shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BookOpen className="size-3.5" />
              <span>Skills Catalog ({skills.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('knowledge')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer',
                activeTab === 'knowledge' ? 'glass-chosen text-foreground font-semibold shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Layers className="size-3.5" />
              <span>Knowledge Library ({documents.length})</span>
            </button>
          </div>

          {/* Primary Action Buttons */}
          <Button
            size="sm"
            variant="default"
            className="flex items-center gap-1.5 rounded-xl cursor-pointer shadow-xs"
            onClick={() => {
              setEditingSkill(null);
              setShowSkillModal(true);
            }}
          >
            <Plus className="size-3.5" />
            <span>Add Skill</span>
          </Button>

          <Button
            size="sm"
            variant="glass"
            className="flex items-center gap-1.5 rounded-xl cursor-pointer shadow-xs"
            onClick={() => setShowUploadModal(true)}
          >
            <Upload className="size-3.5 text-indigo-400" />
            <span>Upload Files</span>
          </Button>

          <Button
            size="sm"
            variant="glass"
            className="flex items-center gap-1.5 rounded-xl cursor-pointer"
            onClick={handleReloadSkills}
            disabled={busy || !client}
            title="Reload and re-index all skills from disk"
          >
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin text-indigo-400')} />
            <span className="hidden sm:inline">{busy ? 'Reloading…' : 'Reload Disk'}</span>
          </Button>
        </div>
      </ScreenHeader>

      {/* Notifications / Alerts */}
      {note && (
        <div role="status" className="flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-200 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-indigo-400 shrink-0" />
            <span>{note}</span>
          </div>
          <button type="button" onClick={() => setNote(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* =========================================================================
          TAB 1: SKILLS CATALOG
         ========================================================================= */}
      {activeTab === 'skills' && (
        <div className="flex flex-col gap-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 glass-panel rounded-2xl border border-border/60 shadow-xs">
            <div className="flex flex-1 items-center gap-2 min-w-[240px]">
              <div className="relative flex-1 max-w-md">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="skill-search"
                  value={skillQuery}
                  onChange={(e) => setSkillQuery(e.target.value)}
                  placeholder="Search skills by name, trigger words, roles..."
                  className="w-full h-8.5 pl-8 pr-7 bg-background/50 border border-border/60 rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground"
                />
                {skillQuery && (
                  <button type="button" onClick={() => setSkillQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="size-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[11px] text-muted-foreground font-mono">Workflow:</span>
                <select
                  value={workflowFilter}
                  onChange={(e) => setWorkflowFilter(e.target.value)}
                  className="h-8.5 px-2 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none cursor-pointer"
                >
                  <option value="all">All workflows</option>
                  {WORKFLOW_OPTIONS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {skillsList.status === 'ready' && (
              <span className="text-xs text-muted-foreground font-mono hidden md:inline">
                Catalog Root: <span className="text-foreground">{skillsList.data.root ?? 'not configured'}</span>
              </span>
            )}
          </div>

          <LoadNote what="skills" state={skillsList} />

          {skillsList.status === 'ready' && skills.length === 0 ? (
            <EmptyState title="No skills loaded">
              {skillsList.data.root
                ? 'The skills folder has no valid skill documents yet. Add a new skill or upload a SKILL.md file to get started.'
                : 'The runtime has no skills folder configured, so no skill is available to any task.'}
              <div className="mt-4 flex gap-2 justify-center">
                <Button size="sm" variant="default" onClick={() => setShowSkillModal(true)}>
                  <Plus className="size-3.5 mr-1" /> Add First Skill
                </Button>
                <Button size="sm" variant="glass" onClick={() => setShowUploadModal(true)}>
                  <Upload className="size-3.5 mr-1" /> Upload SKILL.md
                </Button>
              </div>
            </EmptyState>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              {/* Left Column: Skill List Cards */}
              <section aria-label="Skill catalog" className="bg-card flex max-h-[72vh] flex-col overflow-y-auto rounded-2xl border border-border/60 shadow-xs">
                {filteredSkills.length === 0 && skills.length > 0 && (
                  <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
                    <p>No skill matches "{skillQuery}".</p>
                    <button type="button" onClick={() => { setSkillQuery(''); setWorkflowFilter('all'); }} className="text-indigo-400 hover:underline">
                      Reset search filters
                    </button>
                  </div>
                )}
                {filteredSkills.map((s) => (
                  <a
                    key={s.id}
                    href={href({ name: 'skills', skillId: s.id })}
                    aria-current={skillId === s.id ? 'page' : undefined}
                    className={cn(
                      'flex flex-col gap-1.5 border-b border-border/50 p-3.5 last:border-b-0 hover:bg-foreground/[0.03] transition',
                      skillId === s.id && 'glass-chosen border-l-2 border-l-indigo-500'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{s.name}</span>
                      <div className="flex items-center gap-1.5">
                        <Tag tone="quiet">v{s.version}</Tag>
                        <span className="text-[10px] font-mono text-muted-foreground">{s.contentHash.slice(0, 7)}</span>
                      </div>
                    </div>
                    <span className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">{s.description || 'No description provided'}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.workflows.map((w) => (
                        <Tag key={w} tone="observed" className="capitalize text-[10px]">
                          {w}
                        </Tag>
                      ))}
                      {s.triggers.slice(0, 3).map((t) => (
                        <span key={t} className="px-1.5 py-0.2 rounded-md bg-foreground/[0.04] text-[10px] font-mono text-muted-foreground border border-border/40">
                          {t}
                        </span>
                      ))}
                      {s.roles.slice(0, 2).map((r) => (
                        <Tag key={r} className="text-[10px]">
                          {r}
                        </Tag>
                      ))}
                    </div>
                  </a>
                ))}
              </section>

              {/* Right Column: Skill Detail View */}
              <Panel label="Skill Detail & Instructions" className="min-w-0 border border-border/60 shadow-xs rounded-2xl flex flex-col max-h-[72vh]">
                {!skillId ? (
                  <EmptyState title="Select a skill to inspect">
                    Select a skill from the directory on the left, or create a new procedure for your autonomous agents.
                  </EmptyState>
                ) : skillDetail.status !== 'ready' || !skillDetail.data ? (
                  <LoadNote what="the skill" state={skillDetail} />
                ) : (
                  <div className="flex flex-col h-full overflow-hidden space-y-3.5">
                    {/* Header & Actions */}
                    <div className="flex items-start justify-between pb-3 border-b border-border/40 shrink-0 gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-foreground">{skillDetail.data.name}</h2>
                          <Tag tone="quiet">v{skillDetail.data.version}</Tag>
                        </div>
                        <p className="text-xs text-muted-foreground">{skillDetail.data.description}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="glass"
                          onClick={() => {
                            setEditingSkill(skillDetail.data);
                            setShowSkillModal(true);
                          }}
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="size-3" />
                          <span>Edit</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => skillDetail.data && handleDeleteSkill(skillDetail.data.id)}
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="size-3" />
                          <span>Delete</span>
                        </Button>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 p-3 rounded-xl bg-foreground/[0.02] border border-border/40 shrink-0">
                      <span className="text-muted-foreground font-mono">
                        Identifier: <span className="text-foreground font-semibold">{skillDetail.data.id}</span>
                      </span>
                      <span className="text-muted-foreground font-mono">
                        Content Hash: <span className="text-foreground font-semibold">{skillDetail.data.contentHash}</span>
                      </span>
                      <span className="text-muted-foreground font-mono sm:col-span-2 truncate" title={skillDetail.data.path}>
                        File: <span className="text-foreground">{skillDetail.data.path}</span>
                      </span>
                      <div className="text-muted-foreground sm:col-span-2 flex flex-wrap items-center gap-1">
                        <span>Triggers:</span>
                        {skillDetail.data.triggers.length ? (
                          skillDetail.data.triggers.map((t) => (
                            <span key={t} className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 font-mono text-[10.5px]">
                              {t}
                            </span>
                          ))
                        ) : (
                          <span className="text-foreground">None declared</span>
                        )}
                      </div>
                      <div className="text-muted-foreground sm:col-span-2 flex flex-wrap items-center gap-1">
                        <span>Workflows:</span>
                        {skillDetail.data.workflows.map((w) => (
                          <Tag key={w} tone="observed" className="capitalize text-[10px]">
                            {w}
                          </Tag>
                        ))}
                        <span className="ml-2">Roles:</span>
                        {skillDetail.data.roles.map((r) => (
                          <Tag key={r} className="text-[10px]">
                            {r}
                          </Tag>
                        ))}
                      </div>
                    </div>

                    {/* Instructions Content */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                        Procedure Instructions (SKILL.md)
                      </span>
                      <pre className="flex-1 glass-panel overflow-auto rounded-xl p-3.5 text-xs leading-relaxed whitespace-pre-wrap font-mono text-foreground/90 border border-border/40">
                        {skillDetail.data.body}
                      </pre>
                    </div>
                  </div>
                )}
              </Panel>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: KNOWLEDGE & DOCUMENTS LIBRARY
         ========================================================================= */}
      {activeTab === 'knowledge' && (
        <div className="flex flex-col gap-4">
          {/* Search & Category Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 glass-panel rounded-2xl border border-border/60 shadow-xs">
            <div className="flex flex-1 items-center gap-2 min-w-[240px]">
              <div className="relative flex-1 max-w-md">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={docQuery}
                  onChange={(e) => setDocQuery(e.target.value)}
                  placeholder="Search documents, specifications, extracted text..."
                  className="w-full h-8.5 pl-8 pr-7 bg-background/50 border border-border/60 rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground"
                />
                {docQuery && (
                  <button type="button" onClick={() => setDocQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="size-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[11px] text-muted-foreground font-mono">Category:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-8.5 px-2 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none cursor-pointer capitalize"
                >
                  {KNOWLEDGE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {knowledgeList.status === 'ready' && (
              <span className="text-xs text-muted-foreground font-mono hidden md:inline">
                Storage: <span className="text-foreground">{knowledgeList.data.root}</span>
              </span>
            )}
          </div>

          <LoadNote what="documents" state={knowledgeList} />

          {knowledgeList.status === 'ready' && documents.length === 0 ? (
            <EmptyState title="No knowledge documents uploaded yet">
              Upload project specifications, architecture guidelines, ADRs, research notes, or design tokens to make them permanently accessible to your team.
              <div className="mt-4 flex justify-center">
                <Button size="sm" variant="default" onClick={() => setShowUploadModal(true)}>
                  <Upload className="size-3.5 mr-1.5" /> Upload First Document
                </Button>
              </div>
            </EmptyState>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              {/* Document List Table / Cards */}
              <section className="bg-card flex max-h-[72vh] flex-col overflow-y-auto rounded-2xl border border-border/60 shadow-xs">
                {documents.map((doc) => {
                  const isSelected = selectedDocId === doc.id;
                  const sizeKb = (doc.sizeBytes / 1024).toFixed(1);
                  return (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id)}
                      className={cn(
                        'flex flex-col gap-1.5 border-b border-border/50 p-3.5 last:border-b-0 hover:bg-foreground/[0.03] transition cursor-pointer',
                        isSelected && 'glass-chosen border-l-2 border-l-indigo-500'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="size-4 text-indigo-400 shrink-0" />
                          <span className="truncate text-sm font-semibold text-foreground">{doc.title}</span>
                        </div>
                        <span className="px-1.5 py-0.2 rounded-md bg-indigo-500/10 text-indigo-400 font-mono text-[10px] uppercase font-bold shrink-0">
                          {doc.category.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground truncate">{doc.filename}</div>

                      {doc.summary && (
                        <p className="line-clamp-2 text-xs text-muted-foreground/90 leading-relaxed font-sans">{doc.summary}</p>
                      )}

                      <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-muted-foreground">
                        <span>
                          {sizeKb} KB · {doc.classification}
                        </span>
                        <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* Document Viewer / Preview Pane */}
              <Panel label="Document Viewer & Metadata" className="min-w-0 border border-border/60 shadow-xs rounded-2xl flex flex-col max-h-[72vh]">
                {!selectedDocId ? (
                  <EmptyState title="Select a document to inspect">
                    Select a document from the library on the left to read its extracted text, inspect provenance, and access metadata.
                  </EmptyState>
                ) : docDetail.status !== 'ready' || !docDetail.data ? (
                  <LoadNote what="the document" state={docDetail} />
                ) : (
                  <div className="flex flex-col h-full overflow-hidden space-y-3.5">
                    {/* Header */}
                    <div className="flex items-start justify-between pb-3 border-b border-border/40 shrink-0 gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-bold text-foreground truncate">{docDetail.data.title}</h2>
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-mono text-[10px] uppercase font-semibold">
                            {docDetail.data.category}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground truncate">{docDetail.data.filename}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => docDetail.data && handleDeleteDocument(docDetail.data.id)}
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="size-3" />
                          <span>Delete</span>
                        </Button>
                      </div>
                    </div>

                    {/* Metadata Card */}
                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 p-3 rounded-xl bg-foreground/[0.02] border border-border/40 shrink-0 font-mono">
                      <span className="text-muted-foreground">
                        Size: <span className="text-foreground">{(docDetail.data.sizeBytes / 1024).toFixed(1)} KB</span>
                      </span>
                      <span className="text-muted-foreground">
                        Classification: <span className="text-foreground">{docDetail.data.classification}</span>
                      </span>
                      <span className="text-muted-foreground truncate sm:col-span-2" title={docDetail.data.contentHash}>
                        SHA-256: <span className="text-foreground">{docDetail.data.contentHash}</span>
                      </span>
                      <span className="text-muted-foreground truncate sm:col-span-2" title={docDetail.data.filePath}>
                        Path: <span className="text-foreground">{docDetail.data.filePath}</span>
                      </span>
                    </div>

                    {/* Extracted Text Content */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                      <div className="flex items-center justify-between pb-1.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-muted-foreground">
                          Extracted Content Preview
                        </span>
                        {docDetail.data?.content && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(docDetail.data?.content || '');
                              setNote('Document text copied to clipboard.');
                            }}
                            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-mono cursor-pointer"
                          >
                            <Copy className="size-3" />
                            <span>Copy</span>
                          </button>
                        )}
                      </div>

                      {docDetail.data.content ? (
                        <pre className="flex-1 glass-panel overflow-auto rounded-xl p-3.5 text-xs leading-relaxed whitespace-pre-wrap font-mono text-foreground/90 border border-border/40">
                          {docDetail.data.content}
                        </pre>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground border border-border/40 rounded-xl glass-panel">
                          <FileText className="size-8 text-muted-foreground/40 mb-2" />
                          <p>Binary or non-text document format ({docDetail.data.mimeType || 'unknown'}).</p>
                          <p className="text-[11px] mt-1">Original file stored safely on disk at {docDetail.data.filePath}.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Panel>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODAL 1: ADD / EDIT SKILL MODAL
         ========================================================================= */}
      {showSkillModal && (
        <SkillEditorModal
          editingSkill={editingSkill}
          onClose={() => {
            setShowSkillModal(false);
            setEditingSkill(null);
          }}
          onSave={async (payload) => {
            if (!client) return;
            try {
              const res = await client.createSkill(payload);
              setNote(`Skill "${res.id}" saved successfully.`);
              setShowSkillModal(false);
              setEditingSkill(null);
              setBump((n) => n + 1);
              window.location.hash = href({ name: 'skills', skillId: res.id });
            } catch (err) {
              alert(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      )}

      {/* =========================================================================
          MODAL 2: UPLOAD FILE MODAL (SKILL & KNOWLEDGE DOCUMENTS)
         ========================================================================= */}
      {showUploadModal && (
        <FileUploadModal
          projects={projects}
          onClose={() => setShowUploadModal(false)}
          onUploadSkill={async (filename, content) => {
            if (!client) return;
            try {
              const res = await client.uploadSkill(filename, content);
              setNote(`Skill "${res.id}" imported successfully.`);
              setShowUploadModal(false);
              setBump((n) => n + 1);
              setActiveTab('skills');
              window.location.hash = href({ name: 'skills', skillId: res.id });
            } catch (err) {
              alert(err instanceof Error ? err.message : String(err));
            }
          }}
          onUploadDocument={async (payload) => {
            if (!client) return;
            try {
              const res = await client.uploadKnowledgeFile(payload);
              setNote(`Document "${res.title}" uploaded to library.`);
              setShowUploadModal(false);
              setBump((n) => n + 1);
              setActiveTab('knowledge');
              setSelectedDocId(res.id);
            } catch (err) {
              alert(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Editor Modal (Form + Raw Markdown toggle)
// ---------------------------------------------------------------------------

function SkillEditorModal({
  editingSkill,
  onClose,
  onSave,
}: {
  editingSkill: SkillDetail | null;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
}) {
  const [mode, setMode] = React.useState<'form' | 'raw'>('form');
  const [id, setId] = React.useState(editingSkill?.id || '');
  const [name, setName] = React.useState(editingSkill?.name || '');
  const [version, setVersion] = React.useState(editingSkill?.version || '1.0.0');
  const [owner, setOwner] = React.useState(editingSkill?.description || 'The Orchestrator');
  const [description, setDescription] = React.useState(editingSkill?.description || '');
  const [workflows, setWorkflows] = React.useState<string[]>(editingSkill?.workflows || []);
  const [triggers, setTriggers] = React.useState(editingSkill?.triggers.join(', ') || '');
  const [roles, setRoles] = React.useState(editingSkill?.roles.join(', ') || '');
  const [body, setBody] = React.useState(
    editingSkill?.body ||
      `# ${editingSkill?.name || 'Skill Title'}\n\n## Purpose\nExplain what problem this skill solves and when agents should use it.\n\n## Ordered Steps\n1. Step one\n2. Step two\n3. Step three\n\n## Acceptance Evidence\n- Explicit evidence required before marking done\n`
  );

  // Raw mode content
  const [rawContent, setRawContent] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // Auto-slug ID from name if ID is not manually modified
  const handleNameChange = (val: string) => {
    setName(val);
    if (!editingSkill && !id) {
      setId(val.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, ''));
    }
  };

  const toggleWorkflow = (w: string) => {
    setWorkflows((prev) => (prev.includes(w) ? prev.filter((item) => item !== w) : [...prev, w]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (mode === 'raw') {
        if (!rawContent.trim()) throw new Error('Raw markdown cannot be empty');
        await onSave({ id: id.trim() || undefined, rawContent });
      } else {
        if (!id.trim()) throw new Error('Skill ID is required');
        const triggerList = triggers
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);
        const roleList = roles
          .split(',')
          .map((r) => r.trim().toLowerCase())
          .filter(Boolean);
        await onSave({
          id: id.trim().toLowerCase(),
          name: name.trim() || id.trim(),
          version: version.trim() || '1.0.0',
          owner: owner.trim() || 'The Orchestrator',
          description: description.trim(),
          workflows,
          triggers: triggerList,
          roles: roleList,
          body,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-card border border-border/80 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/40 shrink-0">
          <div>
            <h3 className="text-base font-bold text-foreground">
              {editingSkill ? `Edit Skill: ${editingSkill.id}` : 'Create New Skill'}
            </h3>
            <p className="text-xs text-muted-foreground">Define an executable, version-pinned procedure for autonomous tasks</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="glass-panel p-0.5 rounded-lg flex text-xs font-medium border border-border/50">
              <button
                type="button"
                onClick={() => setMode('form')}
                className={cn('px-2.5 py-1 rounded-md transition cursor-pointer', mode === 'form' ? 'glass-chosen font-semibold' : 'text-muted-foreground')}
              >
                Form
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mode === 'form') {
                    // Populate raw template from form fields
                    const fm = [
                      '---',
                      `name: ${id || 'my-skill'}`,
                      `description: ${description || 'Skill description'}`,
                      `version: ${version || '1.0.0'}`,
                      `owner: ${owner || 'The Orchestrator'}`,
                      `triggers: [${triggers}]`,
                      `workflows: [${workflows.join(', ')}]`,
                      `roles: [${roles}]`,
                      '---',
                      '',
                      body,
                    ].join('\n');
                    setRawContent(fm);
                  }
                  setMode('raw');
                }}
                className={cn('px-2.5 py-1 rounded-md transition cursor-pointer', mode === 'raw' ? 'glass-chosen font-semibold' : 'text-muted-foreground')}
              >
                Raw SKILL.md
              </button>
            </div>
            <button type="button" onClick={onClose} className="p-1 hover:bg-muted/60 text-muted-foreground hover:text-foreground rounded-lg transition">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {mode === 'form' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                    Skill Identifier (ID) *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingSkill)}
                    value={id}
                    onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
                    placeholder="e.g. api-design-guidelines"
                    className="w-full h-8.5 px-3 bg-background border border-border/60 rounded-xl text-xs font-mono text-foreground focus:outline-none focus:border-foreground disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. API Design Guidelines"
                    className="w-full h-8.5 px-3 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none focus:border-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                    Version
                  </label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full h-8.5 px-3 bg-background border border-border/60 rounded-xl text-xs font-mono text-foreground focus:outline-none focus:border-foreground"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                    Owner
                  </label>
                  <input
                    type="text"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="e.g. The Orchestrator or Winston"
                    className="w-full h-8.5 px-3 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none focus:border-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="One concise sentence explaining what this procedure accomplishes..."
                  className="w-full h-8.5 px-3 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none focus:border-foreground"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                  Applicable Workflows
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {WORKFLOW_OPTIONS.map((w) => {
                    const active = workflows.includes(w);
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => toggleWorkflow(w)}
                        className={cn(
                          'px-3 py-1 rounded-lg text-xs font-medium capitalize border transition cursor-pointer',
                          active
                            ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/40 font-semibold'
                            : 'glass-panel text-muted-foreground hover:text-foreground border-border/50'
                        )}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                    Triggers (keywords, comma-separated)
                  </label>
                  <input
                    type="text"
                    value={triggers}
                    onChange={(e) => setTriggers(e.target.value)}
                    placeholder="e.g. auth, oauth, token, security"
                    className="w-full h-8.5 px-3 bg-background border border-border/60 rounded-xl text-xs font-mono text-foreground focus:outline-none focus:border-foreground"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                    Roles (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={roles}
                    onChange={(e) => setRoles(e.target.value)}
                    placeholder="e.g. architect, backend, engineer"
                    className="w-full h-8.5 px-3 bg-background border border-border/60 rounded-xl text-xs font-mono text-foreground focus:outline-none focus:border-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                  Instructions & Steps (Markdown)
                </label>
                <textarea
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="## Purpose\n\n## Steps\n1. ...\n\n## Acceptance Evidence"
                  className="w-full p-3 bg-background border border-border/60 rounded-xl text-xs font-mono text-foreground leading-relaxed focus:outline-none focus:border-foreground resize-y"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                Raw SKILL.md Document (including --- frontmatter)
              </label>
              <textarea
                rows={16}
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                placeholder="---\nname: my-skill\nversion: 1.0.0\ndescription: ...\n---\n\n# Instructions"
                className="w-full p-3 bg-background border border-border/60 rounded-xl text-xs font-mono text-foreground leading-relaxed focus:outline-none focus:border-foreground resize-y"
              />
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
            <Button type="button" variant="glass" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingSkill ? 'Update Skill' : 'Create Skill'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File Upload Modal (Supports SKILL.md and Knowledge Documents)
// ---------------------------------------------------------------------------

function FileUploadModal({
  projects,
  onClose,
  onUploadSkill,
  onUploadDocument,
}: {
  projects: any[];
  onClose: () => void;
  onUploadSkill: (filename: string, content: string) => Promise<void>;
  onUploadDocument: (payload: any) => Promise<void>;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [fileText, setFileText] = React.useState<string | null>(null);
  const [fileBase64, setFileBase64] = React.useState<string | null>(null);
  const [_isSkillFile, setIsSkillFile] = React.useState(false);
  const [uploadType, setUploadType] = React.useState<'skill' | 'knowledge'>('knowledge');

  // Knowledge metadata
  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState<string>('technical_spec');
  const [classification, setClassification] = React.useState<string>('internal');
  const [projectId, setProjectId] = React.useState('');
  const [uploading, setUploading] = React.useState(false);

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setTitle(selected.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));

    const isText = selected.type.startsWith('text/') || /\.(md|txt|json|yaml|yml|csv|tsv|js|ts|py|sh|html)$/i.test(selected.name);

    if (isText) {
      const text = await selected.text();
      setFileText(text);
      setFileBase64(null);

      // Check if it's a SKILL.md
      const hasSkillFm = text.startsWith('---\n') && (text.includes('name:') || text.includes('triggers:') || text.includes('workflows:'));
      if (selected.name.toLowerCase().includes('skill') || hasSkillFm) {
        setIsSkillFile(true);
        setUploadType('skill');
      } else {
        setIsSkillFile(false);
        setUploadType('knowledge');
      }
    } else {
      // Read as base64 for binary files (PDFs, Images, Office docs)
      setFileText(null);
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setFileBase64(result);
      };
      reader.readAsDataURL(selected);
      setIsSkillFile(false);
      setUploadType('knowledge');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      if (uploadType === 'skill') {
        if (!fileText) throw new Error('Skill files must be readable text or markdown');
        await onUploadSkill(file.name, fileText);
      } else {
        await onUploadDocument({
          filename: file.name,
          title: title.trim() || file.name,
          content: fileText || undefined,
          base64: fileBase64 || undefined,
          category,
          classification,
          projectId: projectId || undefined,
        });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-card border border-border/80 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/40 shrink-0">
          <div>
            <h3 className="text-base font-bold text-foreground">Upload Files to MyaOS</h3>
            <p className="text-xs text-muted-foreground">Upload procedures, specifications, architecture blueprints, or PDFs</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-muted/60 text-muted-foreground hover:text-foreground rounded-lg transition">
            <X className="size-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* File Picker / Dropzone */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
              Select File to Upload
            </label>
            <label className="border-2 border-dashed border-border/80 hover:border-foreground/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer glass-panel transition group">
              <Upload className="size-7 text-indigo-400 group-hover:scale-110 transition mb-2" />
              {file ? (
                <div>
                  <span className="text-xs font-bold text-foreground">{file.name}</span>
                  <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <span className="text-xs font-semibold text-foreground">Click to browse or drop file here</span>
                  <p className="text-[10px] text-muted-foreground mt-1">Supports Markdown (.md), PDF, TXT, JSON, CSV, DOCX, Code</p>
                </div>
              )}
              <input type="file" className="hidden" onChange={handleSelectFile} />
            </label>
          </div>

          {file && (
            <>
              {/* Type Selector: Skill vs Knowledge */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                  Target Destination
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!fileText}
                    onClick={() => setUploadType('skill')}
                    className={cn(
                      'p-2.5 rounded-xl border text-left transition cursor-pointer',
                      uploadType === 'skill'
                        ? 'bg-foreground text-background border-foreground shadow-xs font-semibold'
                        : 'glass-panel text-muted-foreground hover:text-foreground border-border/50 disabled:opacity-30'
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <BookOpen className="size-3.5" />
                      <span>Skills Catalog</span>
                    </div>
                    <p className="text-[10px] mt-0.5 line-clamp-1 opacity-80">Parse frontmatter into task procedure</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUploadType('knowledge')}
                    className={cn(
                      'p-2.5 rounded-xl border text-left transition cursor-pointer',
                      uploadType === 'knowledge'
                        ? 'bg-foreground text-background border-foreground shadow-xs font-semibold'
                        : 'glass-panel text-muted-foreground hover:text-foreground border-border/50'
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Layers className="size-3.5" />
                      <span>Knowledge Library</span>
                    </div>
                    <p className="text-[10px] mt-0.5 line-clamp-1 opacity-80">Reference doc, spec, architecture</p>
                  </button>
                </div>
              </div>

              {/* Metadata Fields for Knowledge Documents */}
              {uploadType === 'knowledge' && (
                <div className="space-y-3 pt-1 border-t border-border/40">
                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                      Document Title
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Authentication Architecture Spec"
                      className="w-full h-8.5 px-3 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none focus:border-foreground"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                        Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full h-8.5 px-2 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none cursor-pointer capitalize"
                      >
                        {KNOWLEDGE_CATEGORIES.filter((c) => c !== 'all').map((c) => (
                          <option key={c} value={c}>
                            {c.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                        Classification
                      </label>
                      <select
                        value={classification}
                        onChange={(e) => setClassification(e.target.value)}
                        className="w-full h-8.5 px-2 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none cursor-pointer capitalize"
                      >
                        {['internal', 'public', 'confidential', 'restricted'].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider font-bold text-muted-foreground mb-1">
                      Project Linkage (Optional)
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="w-full h-8.5 px-2 bg-background border border-border/60 rounded-xl text-xs text-foreground focus:outline-none cursor-pointer"
                    >
                      <option value="">Organisation-wide (No project)</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title || p.name || p.id}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
            <Button type="button" variant="glass" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!file || uploading}>
              {uploading ? 'Uploading…' : uploadType === 'skill' ? 'Import Skill' : 'Upload to Library'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
