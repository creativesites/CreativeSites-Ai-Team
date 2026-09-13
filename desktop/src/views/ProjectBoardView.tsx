import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Kanban,
  List,
  Plus,
  Search,
  Filter,
  Layers,
  FolderGit2,
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  ArrowRight,
  Sparkles,
  Terminal,
  ChevronRight,
  Target,
  RefreshCw,
} from 'lucide-react';
import { AGENT_PILLS } from './JulesMissionFlowView';

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  repo?: string;
  target_date?: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id?: string;
  okr_kr_id?: string;
  title: string;
  description?: string;
  assignee_id?: string;
  priority?: string;
  status?: string;
  repo?: string;
  branch?: string;
  created_at: string;
  updated_at?: string;
}

interface ProjectBoardViewProps {
  onSpawnClaude: (agentId?: string, cwd?: string, resume?: boolean, prompt?: string) => void;
  onSpawnGemini: (agentId?: string, cwd?: string, resume?: boolean, prompt?: string) => void;
  onSpawnShell: (cwd?: string) => void;
  currentWorkspace: string;
}

const COLUMNS = [
  { id: 'open', label: 'Backlog & Ready', color: 'border-zinc-300 bg-zinc-50/50' },
  { id: 'in_progress', label: 'Active Execution', color: 'border-indigo-300 bg-indigo-50/20' },
  { id: 'in_review', label: 'Verification (Kael)', color: 'border-amber-300 bg-amber-50/20' },
  { id: 'done', label: 'Verified & Shipped', color: 'border-emerald-300 bg-emerald-50/20' },
];

export const ProjectBoardView: React.FC<ProjectBoardViewProps> = ({
  onSpawnClaude,
  onSpawnGemini,
  onSpawnShell,
  currentWorkspace,
}) => {
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [todayFocusOnly, setTodayFocusOnly] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('astra');
  const [newTaskPriority, setNewTaskPriority] = useState('high');

  const loadData = async () => {
    try {
      const projs = await invoke<Project[]>('myaos_list_projects');
      setProjects(projs || []);

      const summary = await invoke<any>('myaos_get_summary');
      if (summary?.recent_tasks) {
        setTasks(summary.recent_tasks);
      }
    } catch (e) {
      console.warn('Failed to load project board data:', e);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      await invoke('myaos_update_task_status', { taskId, status: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
    } catch (e) {
      console.error('Failed to update task status:', e);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      const created = await invoke<Task>('myaos_create_task', {
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim() || null,
        assigneeId: newTaskAssignee,
        priority: newTaskPriority,
        repo: currentWorkspace,
      });

      setTasks((prev) => [created, ...prev]);
      setNewTaskTitle('');
      setNewTaskDesc('');
      setShowCreateModal(false);
    } catch (e) {
      alert(`Failed to create task: ${e}`);
    }
  };

  const handleDispatchAgentOnTask = (task: Task, engine: 'claude' | 'gemini') => {
    const prompt = `Working on ${task.id}: "${task.title}". ${task.description || ''} Workspace: ${task.repo || currentWorkspace}.`;
    const targetWs = task.repo || currentWorkspace;
    const targetAgent = task.assignee_id || 'astra';

    if (engine === 'claude') {
      onSpawnClaude(targetAgent, targetWs, true, prompt);
    } else {
      onSpawnGemini(targetAgent, targetWs, true, prompt);
    }

    // Auto move task to in_progress if currently open
    if (task.status === 'open') {
      handleUpdateStatus(task.id, 'in_progress');
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const matchesProject = selectedProjectId === 'all' || t.project_id === selectedProjectId;
    const matchesQuery =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.assignee_id && t.assignee_id.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesFocus = !todayFocusOnly || (t.status === 'in_progress' || t.status === 'in_review' || t.priority === 'urgent' || t.priority === 'high');
    return matchesProject && matchesQuery && matchesPriority && matchesFocus;
  });

  return (
    <div className="h-full w-full bg-[#faf9f6] text-zinc-900 font-sans select-none flex flex-col p-4 space-y-4 overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/90 backdrop-blur-xl border border-zinc-200/80 p-4 rounded-3xl shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <Kanban className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-zinc-900">Project Management</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200/80">
                {tasks.length} Substrate Tasks
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Enterprise sprint execution, live git-commit linking, and 1-click agent dispatch
            </p>
          </div>
        </div>

        {/* View Controls & Action */}
        <div className="flex items-center gap-2">
          {/* Project Picker */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-8 px-2.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-xs font-medium cursor-pointer focus:outline-none"
          >
            <option value="all">All Projects ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200/80">
            <button
              onClick={() => setViewMode('kanban')}
              className={`h-7 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'kanban' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`h-7 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'list' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="h-8 px-3.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Task</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-3 px-1 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by title, ID, or @agent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTodayFocusOnly(!todayFocusOnly)}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 border ${
              todayFocusOnly
                ? 'bg-amber-500 text-white border-amber-600 shadow-2xs font-bold'
                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
            }`}
            title="Filter to tasks committed in daily standups or marked high/urgent"
          >
            <Clock className="w-3 h-3" />
            <span>Today's Focus</span>
          </button>

          <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold mr-1">Priority:</span>
          {['all', 'urgent', 'high', 'medium', 'low'].map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition cursor-pointer ${
                priorityFilter === p
                  ? 'bg-zinc-900 text-white font-bold'
                  : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main Board View */}
      {viewMode === 'kanban' ? (
        <div className="flex-1 min-h-0 grid grid-cols-4 gap-3.5 overflow-hidden">
          {COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => {
              const st = t.status || 'open';
              return st === col.id;
            });

            return (
              <div
                key={col.id}
                className={`flex flex-col h-full rounded-3xl border ${col.color} backdrop-blur-xl p-3 overflow-hidden shadow-2xs`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200/50 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-800">{col.label}</span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-white border border-zinc-200 text-zinc-600">
                      {colTasks.length}
                    </span>
                  </div>
                </div>

                {/* Tasks Column Feed */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                  {colTasks.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-zinc-400 text-xs text-center border border-dashed border-zinc-200 rounded-2xl">
                      <span>No tasks in this lane</span>
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const agent = AGENT_PILLS.find((a) => a.id === task.assignee_id) || AGENT_PILLS[0];
                      return (
                        <div
                          key={task.id}
                          className="p-3 bg-white rounded-2xl border border-zinc-200/80 shadow-xs hover:border-indigo-300 transition duration-200 space-y-2 group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                              {task.id}
                            </span>
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                                task.priority === 'urgent'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : task.priority === 'high'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-zinc-100 text-zinc-600'
                              }`}
                            >
                              {task.priority || 'medium'}
                            </span>
                          </div>

                          <h4 className="text-xs font-semibold text-zinc-900 leading-snug">
                            {task.title}
                          </h4>

                          {task.description && (
                            <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          {/* Footer with Agent and Dispatch Actions */}
                          <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-[10.5px] font-mono text-zinc-600">
                              <span className="w-4 h-4 rounded bg-zinc-900 text-white flex items-center justify-center text-[9px] font-bold">
                                {agent.monogram}
                              </span>
                              <span className="font-semibold">@{task.assignee_id || 'unassigned'}</span>
                            </div>

                            {/* Dispatch Agent Buttons */}
                            <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition">
                              <button
                                onClick={() => handleDispatchAgentOnTask(task, 'claude')}
                                className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[10px] font-medium transition cursor-pointer flex items-center gap-0.5 shadow-2xs"
                                title="Spawn Claude on this task"
                              >
                                <Play className="w-2.5 h-2.5 text-indigo-400" />
                                <span>Claude</span>
                              </button>
                              <button
                                onClick={() => handleDispatchAgentOnTask(task, 'gemini')}
                                className="px-2 py-0.5 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-lg text-[10px] font-medium transition cursor-pointer"
                                title="Spawn Gemini on this task"
                              >
                                <span>Gemini</span>
                              </button>
                            </div>
                          </div>

                          {/* Quick Status Shift */}
                          <div className="flex items-center gap-1 pt-1 overflow-x-auto text-[9.5px] font-mono text-zinc-400">
                            <span>Move:</span>
                            {COLUMNS.filter((c) => c.id !== (task.status || 'open')).map((c) => (
                              <button
                                key={c.id}
                                onClick={() => handleUpdateStatus(task.id, c.id)}
                                className="hover:text-indigo-600 transition cursor-pointer underline"
                              >
                                {c.id}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Linear List View */
        <div className="flex-1 bg-white rounded-3xl border border-zinc-200/80 overflow-y-auto p-4 space-y-2 shadow-xs">
          {filteredTasks.map((t) => (
            <div
              key={t.id}
              className="p-3 rounded-2xl border border-zinc-200 hover:border-indigo-300 transition flex items-center justify-between gap-4 bg-zinc-50/40 hover:bg-white"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-700 shrink-0">
                  {t.id}
                </span>
                <span className="text-xs font-semibold text-zinc-900 truncate">{t.title}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                  @{t.assignee_id}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <select
                  value={t.status || 'open'}
                  onChange={(e) => handleUpdateStatus(t.id, e.target.value)}
                  className="text-xs font-mono px-2 py-1 rounded-xl bg-white border border-zinc-200 cursor-pointer focus:outline-none"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="in_review">In Review</option>
                  <option value="done">Done</option>
                </select>

                <button
                  onClick={() => handleDispatchAgentOnTask(t, 'claude')}
                  className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Play className="w-3 h-3 text-indigo-400" />
                  <span>Execute</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-2xl border border-white/80 rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-card-entry">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900">Create New Engineering Task</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-zinc-700 text-xs font-mono cursor-pointer"
              >
                ✕ Cancel
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="text-[11px] font-mono uppercase font-bold text-zinc-500">
                  Task Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Integrate Playwright regression tests for Chatbot widget"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase font-bold text-zinc-500">
                  Description / Context
                </label>
                <textarea
                  rows={3}
                  placeholder="Acceptance criteria, target files, or reproduction steps..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono uppercase font-bold text-zinc-500">
                    Assignee
                  </label>
                  <select
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none"
                  >
                    {AGENT_PILLS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.domain})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-mono uppercase font-bold text-zinc-500">
                    Priority
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  Save Task to Substrate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
