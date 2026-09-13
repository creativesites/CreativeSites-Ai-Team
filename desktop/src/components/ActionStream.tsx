import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Zap,
  Layers,
  ArrowRight,
  Terminal,
  Activity,
  ShieldCheck,
  Cpu,
} from 'lucide-react';

interface Task {
  id: string;
  project_id?: string | null;
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  priority?: string | null;
  status?: string | null;
  repo?: string | null;
  created_at: string;
}

interface EventItem {
  id: number;
  ts: string;
  event_type: string;
  sender?: string | null;
  task_id?: string | null;
  payload?: string | null;
}

interface ActionStreamProps {
  activeTask: Task | null;
  recentTasks: Task[];
  recentEvents: EventItem[];
  onSelectTask: (task: Task) => void;
  onOpenTerminalForTask: (task: Task) => void;
}

export const ActionStream: React.FC<ActionStreamProps> = ({
  activeTask,
  recentTasks,
  recentEvents,
  onSelectTask,
  onOpenTerminalForTask,
}) => {
  const [eventFilter, setEventFilter] = useState<'all' | 'task' | 'human' | 'verification'>('all');
  const [activeTab, setActiveTab] = useState<'stream' | 'tasks'>('stream');

  const filteredEvents = (recentEvents || []).filter((e) => {
    if (eventFilter === 'all') return true;
    if (eventFilter === 'task') return e.event_type.startsWith('task') || e.task_id;
    if (eventFilter === 'human') return e.event_type.includes('human');
    if (eventFilter === 'verification') return e.event_type.includes('verification') || e.event_type.includes('proof');
    return true;
  });

  return (
    <div className="space-y-4 font-sans select-none animate-card-entry">
      {/* Active Mission Card (Google Jules Style Execution Blueprint) */}
      <div className="bg-white border border-white/80 p-5 rounded-3xl shadow-mac-soft space-y-3.5 transition-all duration-300">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Activity className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                Active Mission Context
              </span>
              <div className="text-[10px] text-slate-400 font-semibold">Autonomous MyaDesktop Pipeline</div>
            </div>
          </div>

          {activeTask ? (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                {activeTask.id}
              </span>
              <button
                onClick={() => onOpenTerminalForTask(activeTask)}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Open in Live PTY</span>
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-400 font-medium">No active mission focused</span>
          )}
        </div>

        {activeTask ? (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">{activeTask.title}</h3>
              {activeTask.description && (
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {activeTask.description}
                </p>
              )}
            </div>

            {/* Jules Step Progression */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="bg-emerald-50/60 border border-emerald-200/70 p-2.5 rounded-2xl space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-emerald-700 uppercase font-mono">
                  <span>1. Context & Plan</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-[11px] text-slate-600 font-medium">Decomposed & Prepared</div>
              </div>

              <div className="bg-indigo-50/60 border border-indigo-200/70 p-2.5 rounded-2xl space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-indigo-700 uppercase font-mono">
                  <span>2. Live Execution</span>
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                </div>
                <div className="text-[11px] text-slate-600 font-medium">Running via Claude/Gemini</div>
              </div>

              <div className="bg-slate-50 border border-slate-200/60 p-2.5 rounded-2xl space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase font-mono">
                  <span>3. QA & Proof</span>
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-[11px] text-slate-400 font-medium">Awaiting Kael Review</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400 text-xs font-medium space-y-1">
            <p>Select any task from the queue below or type an executive prompt above to dispatch a mission.</p>
          </div>
        )}
      </div>

      {/* Action Stream / Tasks Switcher Header */}
      <div className="bg-white border border-white/80 p-4 rounded-3xl shadow-mac-soft space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('stream')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'stream'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Real-Time Action Stream</span>
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'tasks'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Tasks & Backlog ({recentTasks?.length || 0})</span>
            </button>
          </div>

          {activeTab === 'stream' && (
            <div className="flex items-center gap-1">
              {(['all', 'task', 'human', 'verification'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setEventFilter(f)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase transition cursor-pointer ${
                    eventFilter === f
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tab 1: Real-Time Event Log */}
        {activeTab === 'stream' && (
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 font-mono text-[11px]">
            {filteredEvents.length > 0 ? (
              filteredEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-1 text-slate-700 hover:bg-slate-50 transition"
                >
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span className="font-bold text-indigo-600 uppercase">
                      {evt.event_type}
                    </span>
                    <span className="font-semibold">{evt.ts?.split('T')[1]?.slice(0, 8) || evt.ts}</span>
                  </div>
                  <div className="text-slate-700 text-xs font-sans">
                    <span className="font-bold text-slate-900">{evt.sender || 'System'}</span>
                    {evt.task_id && (
                      <span className="ml-1 text-indigo-600 font-mono text-[11px] font-bold">
                        [{evt.task_id}]
                      </span>
                    )}
                    {evt.payload && (
                      <span className="ml-1 text-slate-500 line-clamp-2">
                        — {evt.payload.length > 120 ? evt.payload.slice(0, 120) + '...' : evt.payload}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs font-medium">
                No events match current filter.
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Tasks Backlog List */}
        {activeTab === 'tasks' && (
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 text-xs">
            {recentTasks && recentTasks.length > 0 ? (
              recentTasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onSelectTask(t)}
                  className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                    activeTask?.id === t.id
                      ? 'bg-indigo-50/50 border-indigo-200 shadow-sm'
                      : 'bg-slate-50/60 border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className="space-y-1 max-w-[70%]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-indigo-600 text-[11px]">
                        {t.id}
                      </span>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                        {t.priority || 'medium'}
                      </span>
                      {t.assignee_id && (
                        <span className="text-[10px] text-slate-500 font-semibold">
                          @{t.assignee_id}
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-slate-800 line-clamp-1">{t.title}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-lg ${
                        t.status === 'done'
                          ? 'bg-emerald-50 text-emerald-700'
                          : t.status === 'in_progress'
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {t.status || 'open'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTerminalForTask(t);
                      }}
                      className="p-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition shadow-sm"
                      title="Open PTY for this task"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs font-medium">
                No tasks available.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
