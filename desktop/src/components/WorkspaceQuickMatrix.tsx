import React, { useEffect, useState } from 'react';
import {
  FolderGit2,
  GitBranch,
  CheckCircle2,
  Terminal,
  Search,
  X,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  git_branch: string;
  git_dirty_files: number;
  last_commit: string;
  open_tasks_count: number;
}

const WORKSPACE_AGENT_RECOMMENDATIONS: Record<string, { agent: string; symbol: string; role: string }> = {
  DeployFleet: { agent: 'Astra', symbol: 'AS', role: 'AI Protocol & Widget SDK' },
  'DeployFleet-website': { agent: 'Lyra', symbol: 'LY', role: 'Frontend & Next.js Website' },
  'DeployFleet-Team': { agent: 'Iris', symbol: 'IR', role: 'Team Coordination & Infrastructure' },
  'CreativeSites-Ai-Team': { agent: 'Atlas', symbol: 'AT', role: 'System Orchestrator & Substrate' },
};

interface WorkspaceQuickMatrixProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: string;
  onSelectWorkspace: (path: string) => void;
}

export const WorkspaceQuickMatrix: React.FC<WorkspaceQuickMatrixProps> = ({
  isOpen,
  onClose,
  currentWorkspace,
  onSelectWorkspace,
}) => {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchWorkspaces = async () => {
    setLoading(true);
    try {
      const res = await invoke<WorkspaceInfo[]>('myaos_get_workspaces_status');
      setWorkspaces(res);
    } catch (e) {
      console.error('Failed to load workspaces:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchWorkspaces();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = workspaces.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.path.toLowerCase().includes(search.toLowerCase()) ||
      w.git_branch.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in font-sans select-none">
      <div className="w-full max-w-2xl bg-white/95 backdrop-blur-2xl border border-white/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-up">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                <span>Multi-Workspace Quick-Switch Matrix</span>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                  ⌘K
                </span>
              </h2>
              <p className="text-[11px] text-zinc-500">
                Instantly jump active context across the DeployFleet & CreativeSites ecosystem
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

        {/* Search Bar */}
        <div className="px-6 py-3 border-b border-zinc-100/80 bg-zinc-50/50">
          <div className="flex items-center gap-2.5 px-3 py-2 bg-white rounded-2xl border border-zinc-200/80 shadow-2xs">
            <Search className="w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter repositories by name, branch, or path..."
              className="w-full text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none bg-transparent"
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-[10px] text-zinc-400 hover:text-zinc-700 font-mono"
              >
                CLEAR
              </button>
            )}
          </div>
        </div>

        {/* Workspace Matrix Cards */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {filtered.map((ws) => {
            const isCurrent = currentWorkspace === ws.path;
            const rec = WORKSPACE_AGENT_RECOMMENDATIONS[ws.id] || {
              agent: 'Atlas',
              symbol: 'AT',
              role: 'Engineering Lead',
            };

            return (
              <div
                key={ws.id}
                onClick={() => {
                  onSelectWorkspace(ws.path);
                  onClose();
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative group ${
                  isCurrent
                    ? 'bg-indigo-50/60 border-indigo-200/90 shadow-xs ring-1 ring-indigo-500/20'
                    : 'bg-white hover:bg-zinc-50/80 border-zinc-200/70 hover:border-zinc-300 shadow-2xs'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-zinc-900 truncate">{ws.name}</span>
                      {isCurrent && (
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800">
                          ACTIVE
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 bg-zinc-100 px-2 py-0.2 rounded-full">
                        <GitBranch className="w-3 h-3 text-zinc-400" />
                        <span>{ws.git_branch}</span>
                      </span>
                      {ws.git_dirty_files > 0 ? (
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                          <span>{ws.git_dirty_files} modified</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200">
                          clean
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-zinc-400 truncate">
                      {ws.path}
                    </div>

                    <div className="text-xs text-zinc-600 truncate flex items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-zinc-400 font-mono">Last Commit:</span>
                      <span className="truncate">{ws.last_commit}</span>
                    </div>
                  </div>

                  {/* Assigned Agent Pill */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-100/90 border border-zinc-200/70">
                      <span className="w-4 h-4 rounded-md bg-zinc-900 text-white flex items-center justify-center text-[9px] font-bold">
                        {rec.symbol}
                      </span>
                      <span className="text-xs font-semibold text-zinc-800">{rec.agent}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">{rec.role}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && !loading && (
            <div className="text-center py-8 text-zinc-400 text-xs font-mono">
              No matching repositories found.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
          <span>Press ESC or click outside to dismiss</span>
          <span>DeployFleet Ecosystem Matrix</span>
        </div>
      </div>
    </div>
  );
};
