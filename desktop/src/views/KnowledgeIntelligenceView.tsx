import React, { useState } from 'react';
import { BookOpenCheck, FileText, Brain, ListChecks, FolderKanban, Users, SlidersHorizontal, LayoutDashboard } from 'lucide-react';
import { OverviewTab, KiTab } from './knowledge/OverviewTab';
import { DocumentsTab } from './knowledge/DocumentsTab';
import { KnowledgeTab } from './knowledge/KnowledgeTab';
import { CommitmentsTab } from './knowledge/CommitmentsTab';
import { ProjectsTab } from './knowledge/ProjectsTab';
import { SourcesTab, SettingsTab } from './knowledge/SourcesSettingsTabs';
import { ErrorBox, useKi } from './knowledge/shared';

const TABS: { id: KiTab; label: string; icon: any }[] = [
  { id: 'overview', label: 'Intelligence Overview', icon: LayoutDashboard }, { id: 'documents', label: 'Document Library', icon: FileText },
  { id: 'knowledge', label: 'Knowledge Explorer', icon: Brain }, { id: 'commitments', label: 'Commitments & Actions', icon: ListChecks },
  { id: 'projects', label: 'Project Intelligence', icon: FolderKanban }, { id: 'sources', label: 'Sources & People', icon: Users },
  { id: 'settings', label: 'Knowledge Settings', icon: SlidersHorizontal },
];

/** Organisational knowledge, documents, commitments and work intelligence. All data comes from the KI runtime via the Tauri bridge. */
export const KnowledgeIntelligenceView: React.FC = () => {
  const [tab, setTab] = useState<KiTab>('overview');
  const proj = useKi<{ id: string; title: string }[]>('work.projects', {});
  const projects = (proj.data || []).map((p) => ({ id: p.id, title: p.title }));
  return (
    <div className="p-6 space-y-5 max-w-[1700px] mx-auto">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600"><BookOpenCheck className="w-5 h-5" /></div>
        <div><h1 className="text-lg font-bold text-zinc-900">Knowledge &amp; Intelligence</h1>
          <p className="text-xs text-zinc-500">What the organisation knows, where it came from, what was promised, and what is verifiably done.</p></div>
      </header>
      <nav className="flex flex-wrap gap-1 bg-white/70 border border-zinc-200/70 rounded-2xl p-1.5 w-fit">
        {TABS.map((t) => { const Icon = t.icon; return (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition ${tab === t.id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}><Icon className="w-3.5 h-3.5" />{t.label}</button>); })}
      </nav>
      <ErrorBox error={proj.error ? `Work system unavailable: ${proj.error}` : null} />
      {tab === 'overview' && <OverviewTab go={setTab} projects={projects} />}
      {tab === 'documents' && <DocumentsTab projects={projects} />}
      {tab === 'knowledge' && <KnowledgeTab projects={projects} />}
      {tab === 'commitments' && <CommitmentsTab projects={projects} />}
      {tab === 'projects' && <ProjectsTab projects={projects} />}
      {tab === 'sources' && <SourcesTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
};
