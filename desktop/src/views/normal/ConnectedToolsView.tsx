import React from 'react';
import { Plug, Shield, CheckCircle2, Lock, ExternalLink, RefreshCw } from 'lucide-react';
import { ConnectedTool } from '../../types/normalMode';

interface ConnectedToolsViewProps {
  tools: ConnectedTool[];
}

export const ConnectedToolsView: React.FC<ConnectedToolsViewProps> = ({ tools }) => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 px-2 font-sans select-none">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
          <Plug className="w-5 h-5 text-indigo-600" />
          <span>Connected Tools & App Connectors</span>
        </h1>
        <p className="text-xs text-zinc-500">
          Manage integrations and explicit permission boundaries for MyaOS digital coworkers.
        </p>
      </div>

      {/* Grid of Connectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tools.map((tool) => (
          <div
            key={tool.id}
            className="bg-white border border-black/[0.08] shadow-2xs hover:shadow-md rounded-3xl p-5 space-y-4 transition flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold flex items-center justify-center shadow-2xs">
                    <Plug className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">{tool.name}</h3>
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                      {tool.category}
                    </span>
                  </div>
                </div>

                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ● Connected
                </span>
              </div>

              <p className="text-xs text-zinc-600 leading-relaxed">
                {tool.description}
              </p>

              {/* Permissions matrix */}
              <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                  Permission Boundaries
                </span>
                <div className="grid grid-cols-4 gap-1 text-[11px] font-mono">
                  <span className={`px-2 py-1 rounded-lg text-center ${tool.permissions.read ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
                    Read {tool.permissions.read ? '✓' : '✕'}
                  </span>
                  <span className={`px-2 py-1 rounded-lg text-center ${tool.permissions.write ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
                    Write {tool.permissions.write ? '✓' : '✕'}
                  </span>
                  <span className={`px-2 py-1 rounded-lg text-center ${tool.permissions.execute ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
                    Exec {tool.permissions.execute ? '✓' : '✕'}
                  </span>
                  <span className={`px-2 py-1 rounded-lg text-center ${tool.permissions.delete ? 'bg-rose-50 text-rose-700' : 'bg-zinc-100 text-zinc-400'}`}>
                    Delete {tool.permissions.delete ? '✓' : '✕'}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-400">
              <span className="font-mono text-[10px]">Used by: {tool.usedByCoworkers.join(', ')}</span>
              <button className="px-3 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition cursor-pointer">
                Configure
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
