import React, { useState } from 'react';
import {
  X,
  GitBranch,
  FolderPlus,
  FolderGit2,
  Sparkles,
  Download,
  Terminal,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectAdded: (workspace: any) => void;
}

type TabMode = 'clone' | 'connect' | 'create';

export const AddProjectModal: React.FC<AddProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectAdded,
}) => {
  const [tab, setTab] = useState<TabMode>('clone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [repoUrl, setRepoUrl] = useState('');
  const [cloneParentDir, setCloneParentDir] = useState('/Users/winstonzulu/Documents/GitHub');
  const [folderName, setFolderName] = useState('');

  const [localPath, setLocalPath] = useState('');
  const [customName, setCustomName] = useState('');

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectParentDir, setNewProjectParentDir] = useState('/Users/winstonzulu/WebstormProjects');
  const [selectedTemplate, setSelectedTemplate] = useState<'vite-react' | 'nextjs' | 'fastapi' | 'custom'>('vite-react');

  if (!isOpen) return null;

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      setError('Please provide a GitHub repository URL.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await invoke<any>('myaos_clone_github_repo', {
        repoUrl: repoUrl.trim(),
        targetParentDir: cloneParentDir.trim(),
        folderName: folderName.trim() || null,
      });
      onProjectAdded(res);
      onClose();
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPath.trim()) {
      setError('Please provide a local directory path.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await invoke<any>('myaos_connect_local_project', {
        path: localPath.trim(),
        customName: customName.trim() || null,
      });
      onProjectAdded(res);
      onClose();
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      setError('Please enter a project name.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await invoke<any>('myaos_create_new_project', {
        name: newProjectName.trim(),
        template: selectedTemplate,
        parentDir: newProjectParentDir.trim(),
      });
      onProjectAdded(res);
      onClose();
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs font-sans select-none animate-fade-in">
      <div className="bg-[#faf9f6] border border-black/[0.08] w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/[0.06] flex items-center justify-between bg-white/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-sm">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 tracking-tight">Add Project to MyaDesktop</h2>
              <p className="text-xs text-zinc-500">Clone from GitHub, connect local repository, or scaffold new codebase</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-black/5 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-black/[0.06] bg-[#f4f3f0] px-6 pt-2 gap-2">
          <button
            onClick={() => { setTab('clone'); setError(null); }}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 border-b-2 ${
              tab === 'clone'
                ? 'bg-white text-zinc-900 border-zinc-900 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 border-transparent'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Clone from GitHub</span>
          </button>
          <button
            onClick={() => { setTab('connect'); setError(null); }}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 border-b-2 ${
              tab === 'connect'
                ? 'bg-white text-zinc-900 border-zinc-900 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 border-transparent'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>Connect Local Repo</span>
          </button>
          <button
            onClick={() => { setTab('create'); setError(null); }}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 border-b-2 ${
              tab === 'create'
                ? 'bg-white text-zinc-900 border-zinc-900 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 border-transparent'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Scaffold New</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Tab 1: Clone from GitHub */}
        {tab === 'clone' && (
          <form onSubmit={handleClone} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                GitHub Repository URL
              </label>
              <input
                type="text"
                placeholder="https://github.com/owner/repository.git"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 font-mono shadow-2xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  Target Parent Directory
                </label>
                <input
                  type="text"
                  value={cloneParentDir}
                  onChange={(e) => setCloneParentDir(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 font-mono shadow-2xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  Folder Name <span className="text-zinc-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Auto-detected from URL"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 font-mono shadow-2xs"
                />
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-black/5 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{loading ? 'Cloning Repository...' : 'Clone Repository'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Connect Local Directory */}
        {tab === 'connect' && (
          <form onSubmit={handleConnect} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Local Directory Path
              </label>
              <input
                type="text"
                placeholder="/Users/winstonzulu/Documents/GitHub/my-project"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 font-mono shadow-2xs"
                required
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Point to an existing directory containing a git repo or project code
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Custom Workspace Label <span className="text-zinc-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. My Next.js Frontend"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 shadow-2xs"
              />
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-black/5 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderGit2 className="w-3.5 h-3.5" />}
                <span>{loading ? 'Connecting...' : 'Connect Project'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Scaffold New Project */}
        {tab === 'create' && (
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Project Name
              </label>
              <input
                type="text"
                placeholder="mya-analytics-service"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 font-mono shadow-2xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-2">
                Template Framework
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'vite-react', label: 'Vite + React TS', desc: 'SPA client' },
                  { id: 'nextjs', label: 'Next.js App', desc: 'SSR & Server actions' },
                  { id: 'fastapi', label: 'FastAPI Python', desc: 'High-speed REST API' },
                ].map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => setSelectedTemplate(tmpl.id as any)}
                    className={`p-3 rounded-2xl border text-left transition ${
                      selectedTemplate === tmpl.id
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                        : 'bg-white text-zinc-700 border-black/10 hover:border-zinc-400'
                    }`}
                  >
                    <div className="text-xs font-bold">{tmpl.label}</div>
                    <div className={`text-[10px] mt-0.5 ${selectedTemplate === tmpl.id ? 'text-zinc-300' : 'text-zinc-400'}`}>
                      {tmpl.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Parent Directory
              </label>
              <input
                type="text"
                value={newProjectParentDir}
                onChange={(e) => setNewProjectParentDir(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-black/10 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-zinc-800 font-mono shadow-2xs"
                required
              />
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-black/5 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
                <span>{loading ? 'Scaffolding...' : 'Scaffold & Initialize'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
