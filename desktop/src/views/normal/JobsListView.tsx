import React, { useState } from 'react';
import { Briefcase, Plus, Search, ChevronRight, ShieldCheck, Clock, CheckCircle2 } from 'lucide-react';
import { Job } from '../../types/normalMode';

interface JobsListViewProps {
  jobs: Job[];
  onSelectJob: (jobId: string) => void;
  onStartNewJob: () => void;
}

export const JobsListView: React.FC<JobsListViewProps> = ({
  jobs,
  onSelectJob,
  onStartNewJob,
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [search, setSearch] = useState('');

  const filteredJobs = jobs.filter((job) => {
    if (filter === 'active' && job.status === 'completed') return false;
    if (filter === 'completed' && job.status !== 'completed') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        job.title.toLowerCase().includes(q) ||
        job.userPrompt.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 px-2 font-sans select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-600" />
            <span>My Work & Jobs</span>
          </h1>
          <p className="text-xs text-zinc-500">
            All active, completed, and pending tasks delegated to MyaOS digital coworkers.
          </p>
        </div>

        <button
          onClick={onStartNewJob}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-[0.97]"
        >
          <Plus className="w-4 h-4" />
          <span>Ask MyaOS Job</span>
        </button>
      </div>

      {/* Filter & Search Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 border border-black/[0.06] rounded-2xl shadow-2xs">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {(['all', 'active', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition cursor-pointer ${
                filter === tab
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs..."
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-indigo-500 font-sans"
          />
        </div>
      </div>

      {/* Jobs List */}
      <div className="space-y-3">
        {filteredJobs.length === 0 ? (
          <div className="bg-white border border-black/[0.06] rounded-2xl p-12 text-center space-y-3">
            <Briefcase className="w-8 h-8 text-zinc-300 mx-auto" />
            <h3 className="text-sm font-semibold text-zinc-700">No jobs found</h3>
            <p className="text-xs text-zinc-400">Try adjusting your filters or ask MyaOS to start a new job.</p>
          </div>
        ) : (
          filteredJobs.map((job) => (
            <div
              key={job.id}
              onClick={() => onSelectJob(job.id)}
              className="bg-white border border-black/[0.06] shadow-2xs hover:shadow-md rounded-2xl p-4 space-y-3 transition cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-bold ${
                        job.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : job.status === 'working'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {job.status.replace('_', ' ')}
                    </span>

                    {job.evidencePassed && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-600">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        <span>Verified</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-zinc-900 group-hover:text-indigo-600 transition truncate">
                    {job.title}
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono truncate">"{job.userPrompt}"</p>
                </div>

                <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-0.5 transition shrink-0 mt-1" />
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-100">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-400">
                    Coworkers: {job.assignedCoworkers.join(', ').toUpperCase()}
                  </span>
                </div>
                <span className="font-mono text-[10px]">
                  Updated {new Date(job.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
