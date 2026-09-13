import React from 'react';
import { Activity, CheckCircle2, AlertTriangle, Info, Clock, Briefcase } from 'lucide-react';
import { ActivityItem, Coworker } from '../../types/normalMode';

interface ActivityViewProps {
  activities: ActivityItem[];
  coworkers: Coworker[];
  onSelectJob?: (jobId: string) => void;
}

export const ActivityView: React.FC<ActivityViewProps> = ({
  activities,
  coworkers,
  onSelectJob,
}) => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 px-2 font-sans select-none">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-600" />
          <span>Activity Timeline</span>
        </h1>
        <p className="text-xs text-zinc-500">
          Chronological activity feed of actions, completions, and evidence proofs executed by MyaOS.
        </p>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white border border-black/[0.08] shadow-sm rounded-3xl p-6 space-y-4">
        <div className="space-y-4 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-zinc-100">
          {activities.map((act) => {
            const coworker = coworkers.find((c) => c.id === act.coworkerId);
            return (
              <div key={act.id} className="relative flex items-start gap-4 pl-8 group">
                <span
                  className={`absolute left-1.5 top-1 w-4 h-4 rounded-full flex items-center justify-center ring-4 ring-white ${
                    act.status === 'success'
                      ? 'bg-emerald-500 text-white'
                      : act.status === 'warning'
                      ? 'bg-amber-500 text-white'
                      : 'bg-indigo-600 text-white'
                  }`}
                >
                  {act.status === 'success' ? (
                    <CheckCircle2 className="w-2.5 h-2.5" />
                  ) : act.status === 'warning' ? (
                    <AlertTriangle className="w-2.5 h-2.5" />
                  ) : (
                    <Info className="w-2.5 h-2.5" />
                  )}
                </span>

                <div className="space-y-1 flex-1 bg-zinc-50/70 group-hover:bg-zinc-100/70 p-3 rounded-2xl border border-zinc-100 transition">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-900">{act.title}</span>
                    <span className="font-mono text-[10px] text-zinc-400">{act.timestamp}</span>
                  </div>

                  <p className="text-xs text-zinc-600 leading-relaxed">{act.description}</p>

                  {act.jobId && onSelectJob && (
                    <button
                      onClick={() => onSelectJob(act.jobId!)}
                      className="text-[10.5px] font-medium text-indigo-600 hover:underline flex items-center gap-1 pt-1"
                    >
                      <Briefcase className="w-3 h-3" />
                      <span>View related job</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
