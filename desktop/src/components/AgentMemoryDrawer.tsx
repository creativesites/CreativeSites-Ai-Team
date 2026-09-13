import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Sparkles,
  Plus,
  Trash2,
  X,
  Search,
  Tag,
  FolderGit2,
  Clock,
  ShieldAlert,
  FileText,
  Lightbulb,
  Check,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export interface MemoryBookmark {
  id: string;
  category: string;
  title: string;
  content: string;
  agent_id?: string;
  workspace?: string;
  tags?: string;
  created_at: string;
  updated_at: string;
}

interface AgentMemoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: string;
}

export const AgentMemoryDrawer: React.FC<AgentMemoryDrawerProps> = ({
  isOpen,
  onClose,
  currentWorkspace,
}) => {
  const [bookmarks, setBookmarks] = useState<MemoryBookmark[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // New Bookmark Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('architectural_rule');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('["standard","architecture"]');

  const fetchBookmarks = async () => {
    try {
      const res = await invoke<MemoryBookmark[]>('myaos_list_memory_bookmarks', {
        category: selectedCategory === 'all' ? null : selectedCategory,
        limit: 100,
      });
      setBookmarks(res);
    } catch (e) {
      console.warn('Failed to load memory bookmarks:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBookmarks();
    }
  }, [isOpen, selectedCategory]);

  const handleCreateBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    try {
      await invoke('myaos_create_memory_bookmark', {
        category: newCategory,
        title: newTitle.trim(),
        content: newContent.trim(),
        agentId: 'orchestrator',
        workspace: currentWorkspace,
        tags: newTags.trim(),
      });

      setNewTitle('');
      setNewContent('');
      setIsCreating(false);
      fetchBookmarks();
    } catch (err) {
      console.error('Failed to create bookmark:', err);
    }
  };

  const handleDeleteBookmark = async (id: string) => {
    try {
      await invoke('myaos_delete_memory_bookmark', { id });
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.error('Failed to delete bookmark:', e);
    }
  };

  if (!isOpen) return null;

  const filtered = bookmarks.filter(
    (b) =>
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.content.toLowerCase().includes(search.toLowerCase())
  );

  const categories = [
    { id: 'all', label: 'All Context' },
    { id: 'architectural_rule', label: 'Architectural Rules' },
    { id: 'executive_brief', label: 'Executive Briefs' },
    { id: 'mission_snapshot', label: 'Mission Snapshots' },
    { id: 'code_pattern', label: 'Code Patterns' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-xs font-sans select-none animate-fade-in">
      <div className="w-full max-w-md bg-white/95 backdrop-blur-2xl border-l border-zinc-200 h-full shadow-2xl flex flex-col animate-slide-left">
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
              <Bookmark className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-900 tracking-tight">
                  Agent Memory Substrate
                </h2>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-zinc-100 text-zinc-600 font-bold">
                  ⌘M
                </span>
              </div>
              <p className="text-[10px] text-zinc-500">
                Persistent context and architectural memory across restarts
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Pills */}
        <div className="px-5 py-2.5 border-b border-zinc-100 flex items-center gap-1.5 overflow-x-auto bg-zinc-50/50">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1 rounded-xl text-[11px] font-medium transition cursor-pointer shrink-0 ${
                selectedCategory === cat.id
                  ? 'bg-zinc-900 text-white shadow-2xs font-semibold'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200/80'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search & New Bookmark Button */}
        <div className="p-4 border-b border-zinc-100 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-xl">
            <Search className="w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agent memory..."
              className="w-full text-xs text-zinc-800 placeholder-zinc-400 bg-transparent focus:outline-none"
            />
          </div>

          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer shrink-0 active:scale-95 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>

        {/* Creation Form (Collapsible) */}
        {isCreating && (
          <form onSubmit={handleCreateBookmark} className="p-4 bg-zinc-50 border-b border-zinc-200/80 space-y-2.5 animate-card-entry">
            <div className="text-xs font-bold text-zinc-900">New Memory Bookmark</div>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title or rule name..."
              className="w-full text-xs bg-white border border-zinc-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              required
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full text-xs bg-white border border-zinc-200 rounded-xl px-3 py-1.5 focus:outline-none text-zinc-700"
            >
              <option value="architectural_rule">Architectural Rule</option>
              <option value="executive_brief">Executive Brief</option>
              <option value="mission_snapshot">Mission Snapshot</option>
              <option value="code_pattern">Code Pattern</option>
            </select>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Content, guidelines, or decision notes..."
              rows={3}
              className="w-full text-xs bg-white border border-zinc-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none"
              required
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1 rounded-xl text-xs text-zinc-600 hover:bg-zinc-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition cursor-pointer"
              >
                Save to Memory
              </button>
            </div>
          </form>
        )}

        {/* Bookmark List */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {filtered.map((bm) => (
            <div
              key={bm.id}
              className="p-3.5 bg-white border border-zinc-200/80 hover:border-zinc-300 rounded-2xl shadow-2xs space-y-2 transition group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase font-bold text-indigo-700 bg-indigo-50 px-2 py-0.2 rounded-full border border-indigo-200/60">
                      {bm.category.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">
                      {new Date(bm.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="font-bold text-xs text-zinc-900 tracking-tight pt-1">
                    {bm.title}
                  </h3>
                </div>

                <button
                  onClick={() => handleDeleteBookmark(bm.id)}
                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 transition cursor-pointer"
                  title="Delete bookmark"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs text-zinc-600 leading-relaxed font-sans">
                {bm.content}
              </p>

              {bm.tags && (
                <div className="flex items-center gap-1 pt-1 overflow-x-auto text-[10px] font-mono text-zinc-400">
                  <Tag className="w-3 h-3 text-zinc-300" />
                  <span>{bm.tags}</span>
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-zinc-400 text-xs font-mono">
              No memory bookmarks in this category.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
          <span>Active Bookmarks: {filtered.length}</span>
          <span className="text-emerald-600 font-semibold">Substrate Synced</span>
        </div>
      </div>
    </div>
  );
};
