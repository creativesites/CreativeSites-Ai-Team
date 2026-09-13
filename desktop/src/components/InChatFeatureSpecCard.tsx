import React, { useState } from 'react';
import {
  Sparkles,
  GitBranch,
  CheckSquare,
  Square,
  FileCode2,
  Terminal,
  Play,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { FeatureSpecPayload } from '../services/geminiOrchestrator';

interface InChatFeatureSpecCardProps {
  spec: FeatureSpecPayload;
  onDispatchBranch: (branch: string, assignee: string, commands: string[]) => void;
  isDispatching?: boolean;
}

export const InChatFeatureSpecCard: React.FC<InChatFeatureSpecCardProps> = ({
  spec,
  onDispatchBranch,
  isDispatching = false,
}) => {
  const [criteria, setCriteria] = useState(spec.acceptanceCriteria || []);
  const [activeTab, setActiveTab] = useState<'criteria' | 'stories' | 'schema'>('criteria');

  const toggleCriteria = (id: string) => {
    setCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, completed: !c.completed } : c))
    );
  };

  const completedCount = criteria.filter((c) => c.completed).length;
  const progressPercent = Math.round((completedCount / Math.max(criteria.length, 1)) * 100);

  return (
    <div className="mt-3.5 rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 via-white/95 to-violet-50/40 backdrop-blur-2xl p-4.5 space-y-3.5 font-sans shadow-xs transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-indigo-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                Feature Blueprint
              </span>
              <span className="text-xs font-mono font-medium text-zinc-500">
                branch: <strong className="text-zinc-800">{spec.targetBranch}</strong>
              </span>
            </div>
            <h4 className="text-xs font-bold text-zinc-900 mt-0.5">{spec.featureTitle}</h4>
          </div>
        </div>

        {/* 1-Click Branch & Dispatch Action */}
        <button
          onClick={() => onDispatchBranch(spec.targetBranch, spec.assignee, spec.scaffoldCommands)}
          disabled={isDispatching}
          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
        >
          <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
          <span>Scaffold Branch & Dispatch @{spec.assignee}</span>
          <ArrowRight className="w-3 h-3 ml-0.5" />
        </button>
      </div>

      <p className="text-xs text-zinc-600 leading-relaxed font-sans">{spec.summary}</p>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-zinc-100/80 p-0.5 rounded-xl border border-zinc-200/60 w-fit">
        <button
          onClick={() => setActiveTab('criteria')}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
            activeTab === 'criteria'
              ? 'bg-white text-zinc-900 shadow-xs font-semibold'
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Acceptance Criteria ({completedCount}/{criteria.length})
        </button>
        {spec.userStories && spec.userStories.length > 0 && (
          <button
            onClick={() => setActiveTab('stories')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'stories'
                ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            User Stories ({spec.userStories.length})
          </button>
        )}
        {spec.schemaPreview && (
          <button
            onClick={() => setActiveTab('schema')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'schema'
                ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Schema / Contract
          </button>
        )}
      </div>

      {/* Tab Contents */}
      {activeTab === 'criteria' && (
        <div className="space-y-2">
          {/* Progress bar */}
          <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5 pt-1">
            {criteria.map((c) => (
              <div
                key={c.id}
                onClick={() => toggleCriteria(c.id)}
                className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                  c.completed
                    ? 'bg-emerald-50/50 border-emerald-200 text-zinc-700 line-through opacity-80'
                    : 'bg-white/90 border-zinc-200/70 hover:border-indigo-300 text-zinc-800'
                }`}
              >
                {c.completed ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                )}
                <span className="text-xs leading-relaxed">{c.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'stories' && (
        <div className="space-y-2">
          {spec.userStories.map((story, i) => (
            <div
              key={i}
              className="p-3 rounded-2xl bg-white/90 border border-zinc-200/70 text-xs text-zinc-700 leading-relaxed flex items-start gap-2"
            >
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 shrink-0">
                0{i + 1}
              </span>
              <span>{story}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'schema' && spec.schemaPreview && (
        <div className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800 overflow-x-auto text-[11px] font-mono text-zinc-200 leading-relaxed max-h-48">
          <pre>{spec.schemaPreview}</pre>
        </div>
      )}

      {/* Scaffold Commands Preview */}
      {spec.scaffoldCommands && spec.scaffoldCommands.length > 0 && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-indigo-100/60 text-[10px] font-mono text-zinc-500">
          <span className="truncate">
            Auto-executes: <code>{spec.scaffoldCommands.join(' && ')}</code>
          </span>
          <span className="font-semibold text-indigo-600 shrink-0">Ready to scaffold</span>
        </div>
      )}
    </div>
  );
};
