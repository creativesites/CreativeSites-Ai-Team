import React, { useEffect, useState } from 'react';
import {
  FolderGit2,
  GitBranch,
  GitCommit,
  AlertCircle,
  CheckCircle2,
  Terminal,
  FolderOpen,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

import { AddProjectModal } from '../components/AddProjectModal';
import { Plus, Trash2 } from 'lucide-react';

export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  git_branch: string;
  git_dirty_files: number;
  last_commit: string;
  open_tasks_count: number;
}

interface WorkspaceExplorerViewProps {
  currentWorkspace: string;
  onSelectWorkspace: (path: string) => void;
  onSpawnClaude: (agentId?: string) => void;
  onSpawnGemini: (agentId?: string) => void;
  onSpawnShell: () => void;
}

export const WorkspaceExplorerView: React.FC<WorkspaceExplorerViewProps> = ({
  currentWorkspace,
  onSelectWorkspace,
  onSpawnClaude,
  onSpawnGemini,
  onSpawnShell,
}) => {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const fetchWorkspaces = async () => {
    try {
      setLoading(true);
      const res = await invoke<WorkspaceInfo[]>('myaos_get_workspaces_status');
      setWorkspaces(res);
    } catch (e) {
      console.error('Failed to load workspaces:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCustomWorkspace = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Remove project from MyaDesktop workspace list?\n(Local files will NOT be deleted)`)) {
      try {
        await invoke('myaos_remove_workspace', { path });
        fetchWorkspaces();
      } catch (err) {
        alert(String(err));
      }
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  return (
    <div className="space-y-6 font-sans select-none animate-card-entry">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border border-black/[0.06] p-6 rounded-3xl flex justify-between items-center shadow-xs">
        <div>
          <h1 className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <FolderGit2 className="w-5 h-5 text-zinc-900" />
            <span>Workspace & Codebase Hub</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Real-time Git substrate status, repository cloning, and 1-click CLI sessions across your active projects
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl text-xs font-semibold transition cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Project</span>
          </button>

          <button
            onClick={fetchWorkspaces}
            className="px-4 py-2 bg-white hover:bg-black/5 text-zinc-700 border border-black/10 rounded-2xl text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            Refresh
          </button>
        </div>
      </div>

      <AddProjectModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onProjectAdded={(newWs) => {
          fetchWorkspaces();
          if (newWs?.path) {
            onSelectWorkspace(newWs.path);
          }
        }}
      />

      {/* Grid of Workspaces */}
      <div className="grid grid-cols-2 gap-5">
        {workspaces.map((ws) => {
          const isActive = ws.path === currentWorkspace;
          const isClean = ws.git_dirty_files === 0;

          return (
            <div
              key={ws.id}
              className={`p-6 rounded-3xl border transition-all duration-300 shadow-mac-soft hover:shadow-mac-deep flex flex-col justify-between space-y-4 ${
                isActive
                  ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/10'
                  : 'bg-white border-white/80 hover:border-slate-200'
              }`}
            >
              <div className="space-y-3">
                {/* Top Title & Badges */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                      <FolderGit2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <span>{ws.name}</span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-indigo-600 text-white shadow-sm">
                            ACTIVE
                          </span>
                        )}
                      </h2>
                      <div className="text-[11px] text-slate-400 font-mono truncate max-w-xs mt-0.5">
                        {ws.path}
                      </div>
                    </div>
                  </div>

                  {/* Git Branch Badge & Unlink Button */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-mono font-bold text-slate-700">
                      <GitBranch className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{ws.git_branch}</span>
                    </div>

                    {!['DeployFleet', 'CreativeSites-Ai-Team', 'DeployFleet-website', 'DeployFleet-Team'].includes(ws.id) && (
                      <button
                        onClick={(e) => handleRemoveCustomWorkspace(ws.path, e)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                        title="Remove from active projects list"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Git Dirty State & Open Tasks */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center gap-2">
                    {isClean ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    )}
                    <div>
                      <div className="text-[10px] uppercase font-mono font-bold text-slate-400">Git Working Tree</div>
                      <div className="font-bold text-slate-700">
                        {isClean ? 'Clean' : `${ws.git_dirty_files} dirty files`}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <div>
                      <div className="text-[10px] uppercase font-mono font-bold text-slate-400">Linked Tasks</div>
                      <div className="font-bold text-slate-700">{ws.open_tasks_count} active</div>
                    </div>
                  </div>
                </div>

                {/* Last Commit */}
                <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono font-bold text-slate-400">
                    <GitCommit className="w-3 h-3 text-slate-400" />
                    <span>Latest Commit</span>
                  </div>
                  <p className="text-xs text-slate-600 font-mono truncate">
                    {ws.last_commit}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => onSelectWorkspace(ws.path)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    isActive
                      ? 'bg-slate-100 text-slate-600 cursor-default'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 shadow-sm'
                  }`}
                >
                  <span>{isActive ? 'Target Workspace' : 'Set as Target'}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      onSelectWorkspace(ws.path);
                      onSpawnClaude('atlas');
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-sm"
                    title="Launch Claude Code in this repository"
                  >
                    <span>⚡ Claude</span>
                  </button>

                  <button
                    onClick={() => {
                      onSelectWorkspace(ws.path);
                      onSpawnGemini('astra');
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-sm"
                    title="Launch Gemini CLI in this repository"
                  >
                    <span>♊ Gemini</span>
                  </button>

                  <button
                    onClick={() => {
                      onSelectWorkspace(ws.path);
                      onSpawnShell();
                    }}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-xl transition cursor-pointer"
                    title="Open terminal shell in this repo"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
