import React, { useState } from 'react';
import {
  FolderPlus,
  Rocket,
  Terminal,
  Layers,
  ArrowRight,
  Sparkles,
  FolderGit2,
} from 'lucide-react';
import { AppScaffoldPayload } from '../services/geminiOrchestrator';

interface InChatAppScaffoldCardProps {
  scaffold: AppScaffoldPayload;
  onInitApp: (appName: string, directory: string, commands: string[], agent: string) => void;
  isInitializing?: boolean;
}

export const InChatAppScaffoldCard: React.FC<InChatAppScaffoldCardProps> = ({
  scaffold,
  onInitApp,
  isInitializing = false,
}) => {
  const [selectedFramework, setSelectedFramework] = useState(scaffold.framework);

  return (
    <div className="mt-3.5 rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/40 via-white/95 to-sky-50/30 backdrop-blur-2xl p-4.5 space-y-3.5 font-sans shadow-xs transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-indigo-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <FolderPlus className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                New App Scaffolder
              </span>
              <span className="text-xs font-mono font-medium text-zinc-500">
                Assigned: <strong className="text-zinc-800">@{scaffold.agentAssignee}</strong>
              </span>
            </div>
            <h4 className="text-xs font-bold text-zinc-900 mt-0.5">{scaffold.appName}</h4>
          </div>
        </div>

        {/* 1-Click Init Action */}
        <button
          onClick={() => onInitApp(scaffold.appName, scaffold.directory, scaffold.initCommands, scaffold.agentAssignee)}
          disabled={isInitializing}
          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
        >
          <Rocket className="w-3.5 h-3.5 text-indigo-400" />
          <span>Initialize Repo & Register Workspace</span>
          <ArrowRight className="w-3 h-3 ml-0.5" />
        </button>
      </div>

      {/* Directory & Framework Config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="p-3 rounded-2xl bg-white/90 border border-zinc-200/70 space-y-1">
          <span className="text-[10px] font-mono uppercase font-bold text-zinc-400">Target Path</span>
          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-800 truncate">
            <FolderGit2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="truncate">{scaffold.directory}</span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white/90 border border-zinc-200/70 space-y-1">
          <span className="text-[10px] font-mono uppercase font-bold text-zinc-400">Stack Preset</span>
          <div className="flex items-center gap-1 text-xs font-medium text-zinc-800">
            <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-[11px] font-bold border border-indigo-200">
              {scaffold.framework.toUpperCase()}
            </span>
            <span className="text-zinc-500 font-normal">TypeScript + Tailwind</span>
          </div>
        </div>
      </div>

      {/* Init Commands Snippet */}
      {scaffold.initCommands && scaffold.initCommands.length > 0 && (
        <div className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800 text-[11px] font-mono text-zinc-300 space-y-1">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Scaffolding Pipeline:</div>
          <div className="truncate">
            <code>{scaffold.initCommands.join(' && ')}</code>
          </div>
        </div>
      )}
    </div>
  );
};
