import React from 'react';
import { UserCheck, Sparkles, CheckCircle2, ShieldCheck, ArrowUpRight, FolderGit2 } from 'lucide-react';
import { Coworker } from '../../types/normalMode';

interface CoworkersViewProps {
  coworkers: Coworker[];
  onStartJobWithCoworker: (coworkerId: string) => void;
}

export const CoworkersView: React.FC<CoworkersViewProps> = ({
  coworkers,
  onStartJobWithCoworker,
}) => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 px-2 font-sans select-none">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-indigo-600" />
          <span>Digital Coworkers</span>
        </h1>
        <p className="text-xs text-zinc-500">
          Persistent role-based AI teammates ready to execute multi-step jobs on your operating system.
        </p>
      </div>

      {/* Coworker Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {coworkers.map((cw) => (
          <div
            key={cw.id}
            className="bg-white border border-black/[0.08] shadow-2xs hover:shadow-md rounded-3xl p-5 space-y-4 transition flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl ${cw.color} text-white font-bold flex items-center justify-center text-sm shadow-2xs`}>
                    {cw.monogram}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">{cw.name}</h3>
                    <p className="text-xs font-mono text-zinc-500">{cw.title}</p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold capitalize ${
                    cw.status === 'working'
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  ● {cw.status}
                </span>
              </div>

              <p className="text-xs text-zinc-600 leading-relaxed">
                {cw.description}
              </p>

              {cw.currentJobTitle && (
                <div className="p-2.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-[11px] text-indigo-900 font-mono">
                  Current activity: {cw.currentJobTitle}
                </div>
              )}

              {/* Capabilities Pills */}
              <div className="space-y-1 pt-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                  Specialized Duties & Capabilities
                </span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {cw.capabilities.map((cap, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 text-[10.5px] font-medium border border-zinc-200/60"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 truncate max-w-[200px]" title={cw.defaultWorkspace}>
                <FolderGit2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="truncate">{cw.defaultWorkspace.split('/').pop()}</span>
              </div>

              <button
                onClick={() => onStartJobWithCoworker(cw.id)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1 cursor-pointer active:scale-[0.97]"
              >
                <span>Ask {cw.name}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
