import React from 'react';
import { Clock, Plus, Play, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { Routine, Skill, Coworker } from '../../types/normalMode';

interface RoutinesViewProps {
  routines: Routine[];
  skills: Skill[];
  coworkers: Coworker[];
  onToggleRoutine: (routineId: string) => void;
  onRunRoutineNow: (routineId: string) => void;
  onCreateRoutine: () => void;
}

export const RoutinesView: React.FC<RoutinesViewProps> = ({
  routines,
  skills,
  coworkers,
  onToggleRoutine,
  onRunRoutineNow,
  onCreateRoutine,
}) => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 px-2 font-sans select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            <span>Routines & Automations</span>
          </h1>
          <p className="text-xs text-zinc-500">
            Teach digital coworkers recurring workflows to run automatically on a schedule backed by MyaOS background daemons.
          </p>
        </div>

        <button
          onClick={onCreateRoutine}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-[0.97]"
        >
          <Plus className="w-4 h-4" />
          <span>New Routine</span>
        </button>
      </div>

      {/* Active Routines List */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
          Scheduled Background Routines ({routines.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {routines.map((r) => {
            const coworker = coworkers.find((c) => c.id === r.coworkerId);
            return (
              <div
                key={r.id}
                className="bg-white border border-black/[0.08] shadow-2xs hover:shadow-md rounded-3xl p-5 space-y-4 transition flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-xl ${coworker?.color || 'bg-indigo-600'} text-white font-bold flex items-center justify-center text-xs shadow-2xs`}>
                        {coworker?.monogram || 'CW'}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900">{r.title}</h3>
                        <span className="text-[10px] font-mono text-zinc-400">
                          Assigned: {coworker?.name || r.coworkerId}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onToggleRoutine(r.id)}
                      className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                        r.enabled ? 'bg-indigo-600' : 'bg-zinc-300'
                      }`}
                      title={r.enabled ? 'Disable routine' : 'Enable routine'}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 shadow-xs transition-transform ${
                          r.enabled ? 'left-4.5' : 'left-0.75'
                        }`}
                      />
                    </button>
                  </div>

                  <p className="text-xs text-zinc-600 leading-relaxed font-mono bg-zinc-50 p-2.5 rounded-2xl border border-zinc-100">
                    "{r.prompt}"
                  </p>

                  <div className="flex items-center justify-between text-xs font-mono text-zinc-500 pt-1">
                    <span>Schedule:</span>
                    <span className="font-semibold text-zinc-800">{r.schedule}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    {r.lastRunStatus === 'success' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                    )}
                    <span className="font-mono text-[10px]">Last: {r.lastRunTime}</span>
                  </div>

                  <button
                    onClick={() => onRunRoutineNow(r.id)}
                    className="px-3 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-indigo-600" />
                    <span>Run Now</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Saved Skills Catalog */}
      <div className="space-y-3 pt-4 border-t border-zinc-200">
        <h2 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span>Saved Skills & Templates</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {skills.map((sk) => (
            <div
              key={sk.id}
              className="bg-white border border-black/[0.06] rounded-2xl p-4 space-y-2 hover:border-zinc-300 transition"
            >
              <span className="text-[9.5px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 font-bold">
                {sk.category}
              </span>
              <h4 className="text-xs font-bold text-zinc-900">{sk.title}</h4>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{sk.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
