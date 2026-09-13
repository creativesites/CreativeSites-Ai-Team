import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  GitBranch,
  FileCode2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  PlusCircle,
  FileCheck2,
} from 'lucide-react';
import { GitWorkspaceDiff } from '../services/geminiOrchestrator';

interface InChatGitDiffCardProps {
  diff: GitWorkspaceDiff;
  workspacePath?: string;
  onRefreshDiff?: () => void;
}

export const InChatGitDiffCard: React.FC<InChatGitDiffCardProps> = ({
  diff,
  workspacePath,
  onRefreshDiff,
}) => {
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>(() => {
    // Expand the first file by default if <= 3 files
    const init: Record<string, boolean> = {};
    if (diff.files && diff.files.length <= 3 && diff.files.length > 0) {
      init[diff.files[0].path] = true;
    }
    return init;
  });
  const [copied, setCopied] = useState(false);
  const [staging, setStaging] = useState(false);
  const [stagedSuccess, setStagedSuccess] = useState(false);

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const toggleAll = () => {
    const allExpanded = diff.files.every((f) => expandedFiles[f.path]);
    const nextState: Record<string, boolean> = {};
    diff.files.forEach((f) => {
      nextState[f.path] = !allExpanded;
    });
    setExpandedFiles(nextState);
  };

  const handleCopyDiff = () => {
    const fullDiffText = diff.files.map((f) => f.diff_content).join('\n\n');
    navigator.clipboard.writeText(fullDiffText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStageAll = async () => {
    if (!workspacePath) return;
    setStaging(true);
    try {
      await invoke('myaos_stage_all_git', { cwd: workspacePath });
      setStagedSuccess(true);
      if (onRefreshDiff) onRefreshDiff();
      setTimeout(() => setStagedSuccess(false), 3000);
    } catch (err) {
      alert(`Staging failed: ${err}`);
    } finally {
      setStaging(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'A':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">A</span>;
      case 'D':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-200">D</span>;
      case '?':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-zinc-100 text-zinc-700 border border-zinc-200">?</span>;
      case 'M':
      default:
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">M</span>;
    }
  };

  if (diff.clean || !diff.files || diff.files.length === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-zinc-200/80 bg-white/70 backdrop-blur-xl p-3.5 flex items-center justify-between text-xs text-zinc-600 shadow-xs">
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 text-emerald-600" />
          <span className="font-medium">Working directory clean — no uncommitted git changes</span>
        </div>
        <span className="font-mono text-[10px] text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-md">
          {diff.branch}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3.5 rounded-3xl border border-zinc-200/80 bg-white/85 backdrop-blur-2xl p-4 space-y-3 font-sans shadow-xs transition-all">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-200/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <GitBranch className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-900 flex items-center gap-2">
              <span>Git Workspace Changes</span>
              <span className="text-[10px] font-mono font-normal text-zinc-400 px-2 py-0.5 bg-zinc-100 rounded-md border border-zinc-200/50">
                {diff.branch}
              </span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
              {diff.files.length} file{diff.files.length === 1 ? '' : 's'} modified
            </div>
          </div>
        </div>

        {/* Stats and Action Chips */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
            +{diff.total_additions}
          </span>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60">
            -{diff.total_deletions}
          </span>

          <button
            onClick={toggleAll}
            className="text-[10px] font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200/70 px-2.5 py-1 rounded-lg transition cursor-pointer"
          >
            {diff.files.every((f) => expandedFiles[f.path]) ? 'Collapse All' : 'Expand All'}
          </button>

          <button
            onClick={handleCopyDiff}
            className="p-1.5 text-zinc-500 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200/70 rounded-lg transition cursor-pointer"
            title="Copy Unified Diff"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
          </button>
        </div>
      </div>

      {/* File Accordion List */}
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {diff.files.map((file) => {
          const isExpanded = expandedFiles[file.path];
          return (
            <div
              key={file.path}
              className="rounded-2xl border border-zinc-200/70 bg-zinc-50/60 overflow-hidden transition-all"
            >
              {/* File Row Toggle */}
              <button
                onClick={() => toggleFile(file.path)}
                className="w-full flex items-center justify-between p-2.5 hover:bg-zinc-100/70 transition cursor-pointer text-left"
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  )}
                  {getStatusBadge(file.status)}
                  <FileCode2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="text-xs font-mono font-medium text-zinc-800 truncate" title={file.path}>
                    {file.path}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono">
                  {file.additions > 0 && (
                    <span className="text-emerald-700 font-bold">+{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span className="text-rose-600 font-bold">-{file.deletions}</span>
                  )}
                </div>
              </button>

              {/* Expanded Diff Code Viewer */}
              {isExpanded && (
                <div className="p-3 bg-zinc-950 text-zinc-300 font-mono text-[11px] leading-relaxed overflow-x-auto border-t border-zinc-800 max-h-72 select-text">
                  <pre className="whitespace-pre">
                    {file.diff_content.split('\n').map((line, idx) => {
                      let lineClass = 'text-zinc-400';
                      if (line.startsWith('+') && !line.startsWith('+++')) {
                        lineClass = 'text-emerald-400 bg-emerald-950/40 block px-1 -mx-1';
                      } else if (line.startsWith('-') && !line.startsWith('---')) {
                        lineClass = 'text-rose-400 bg-rose-950/40 block px-1 -mx-1';
                      } else if (line.startsWith('@@')) {
                        lineClass = 'text-indigo-300 bg-indigo-950/30 font-semibold block px-1 -mx-1 my-0.5';
                      }
                      return (
                        <div key={idx} className={lineClass}>
                          {line || ' '}
                        </div>
                      );
                    })}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Footer */}
      {workspacePath && (
        <div className="pt-2 border-t border-zinc-200/60 flex items-center justify-between text-xs">
          <button
            onClick={handleStageAll}
            disabled={staging}
            className={`px-3 py-1.5 rounded-xl font-medium transition cursor-pointer flex items-center gap-1.5 shadow-xs ${
              stagedSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white'
            }`}
          >
            {stagedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span>Changes Staged (`git add .`)</span>
              </>
            ) : (
              <>
                <PlusCircle className="w-3.5 h-3.5 text-zinc-400" />
                <span>{staging ? 'Staging...' : 'Stage All (git add .)'}</span>
              </>
            )}
          </button>

          <span className="text-[10px] font-mono text-zinc-400">
            Interactive diff inspection • MyaOS Control Plane
          </span>
        </div>
      )}
    </div>
  );
};
