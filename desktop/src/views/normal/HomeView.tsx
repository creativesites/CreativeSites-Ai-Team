import React, { useState } from 'react';
import {
  Sparkles,
  Send,
  Plus,
  ArrowUpRight,
  UserCheck,
  Briefcase,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ChevronRight,
  Globe,
  FileText,
  Search,
  Layout,
  Flame,
  Zap,
} from 'lucide-react';
import { Coworker, Job } from '../../types/normalMode';

interface HomeViewProps {
  coworkers: Coworker[];
  activeJobs: Job[];
  onStartJob: (prompt: string, coworkerId?: string) => void;
  onSelectJob: (jobId: string) => void;
  onSelectCoworker: (coworkerId: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  coworkers,
  activeJobs,
  onStartJob,
  onSelectJob,
  onSelectCoworker,
}) => {
  const [promptInput, setPromptInput] = useState('');

  const samplePrompts = [
    { label: 'Check my website for anything broken', icon: Globe, coworkerId: 'vela' },
    { label: "Summarize today's important emails & metrics", icon: FileText, coworkerId: 'iris' },
    { label: 'Create a modern landing page concept', icon: Layout, coworkerId: 'astra' },
    { label: 'Run regression tests on latest code fixes', icon: ShieldCheck, coworkerId: 'kael' },
  ];

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promptInput.trim()) return;
    onStartJob(promptInput.trim());
    setPromptInput('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4 px-2 font-sans select-none">
      {/* ──────────────────  HERO GREETING & COMPOSER  ────────────────── */}
      <section className="space-y-4 text-center sm:text-left">
        <div className="space-y-1">
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
            <span className="text-xs font-mono font-semibold text-indigo-600 uppercase tracking-wider">
              MyaOS Coworker Substrate
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">
            Good day, Winston. What should MyaOS take care of?
          </h1>
          <p className="text-sm text-zinc-500 max-w-xl leading-relaxed">
            Tell MyaOS what you need done. It assigns the right digital coworkers, uses the required tools, executes the work, and brings back verified results.
          </p>
        </div>

        {/* Large Natural-Language Composer */}
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-black/[0.08] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] rounded-2xl p-4 space-y-3 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all duration-200"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <textarea
              rows={3}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="✨ Tell MyaOS what you need... e.g. 'Check my site for broken links' or 'Summarize customer feedback'"
              className="w-full bg-transparent resize-none text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="hidden sm:inline">Press ↵ to delegate</span>
              <span className="text-zinc-300">·</span>
              <span>Autonomous verification included</span>
            </div>

            <button
              type="submit"
              disabled={!promptInput.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow-2xs transition flex items-center gap-2 cursor-pointer active:scale-[0.97]"
            >
              <span>Hand off task</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Quick Suggestion Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
          <span className="text-xs font-mono text-zinc-400 shrink-0">Try:</span>
          {samplePrompts.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                onClick={() => onStartJob(item.label, item.coworkerId)}
                className="px-3 py-1.5 bg-white hover:bg-zinc-50 border border-zinc-200/80 rounded-full text-xs font-medium text-zinc-700 hover:text-zinc-900 shadow-2xs transition flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-[0.97]"
              >
                <Icon className="w-3.5 h-3.5 text-indigo-500" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ──────────────────  HAPPENING NOW  ────────────────── */}
      {activeJobs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Happening Now</span>
            </h2>
            <span className="text-xs font-mono text-zinc-400">{activeJobs.length} active job(s)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeJobs.map((job) => (
              <div
                key={job.id}
                onClick={() => onSelectJob(job.id)}
                className="bg-white border border-black/[0.06] shadow-2xs hover:shadow-md rounded-2xl p-4 space-y-3 transition cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold">
                      {job.status.replace('_', ' ')}
                    </span>
                    <h3 className="text-sm font-semibold text-zinc-900 group-hover:text-indigo-600 transition truncate">
                      {job.title}
                    </h3>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-0.5 transition" />
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-500">
                    <span>Progress</span>
                    <span>{job.progressPercentage}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${job.progressPercentage}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-400 pt-1 border-t border-zinc-100">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{job.humanizedLog[job.humanizedLog.length - 1] || 'Processing...'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ──────────────────  YOUR DIGITAL COWORKERS  ────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>Your Digital Coworkers</span>
          </h2>
          <span className="text-xs font-mono text-zinc-400">Persistent digital team</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {coworkers.map((cw) => (
            <div
              key={cw.id}
              onClick={() => onSelectCoworker(cw.id)}
              className="bg-white border border-black/[0.06] shadow-2xs hover:shadow-md rounded-2xl p-4 space-y-3 transition cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl ${cw.color} text-white font-bold flex items-center justify-center text-xs shadow-2xs`}>
                      {cw.monogram}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-zinc-900 group-hover:text-indigo-600 transition">
                        {cw.name}
                      </h3>
                      <p className="text-[10px] text-zinc-400 font-mono truncate">{cw.title}</p>
                    </div>
                  </div>

                  <span className={`w-2 h-2 rounded-full ${cw.status === 'working' ? 'bg-indigo-600 animate-ping' : 'bg-emerald-500'}`} />
                </div>

                <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
                  {cw.description}
                </p>
              </div>

              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px]">
                <span className="text-zinc-400 font-mono">{cw.capabilities[0]}</span>
                <span className="text-indigo-600 font-medium group-hover:underline flex items-center gap-0.5">
                  Ask {cw.name}
                  <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
