import * as React from 'react';
import {
  Kanban,
  List,
  Plus,
  Search,
  FolderGit2,
  GitBranch,
  Clock,
  Play,
  RefreshCw,
  Folder,
  Calendar,
  ExternalLink,
  Target,
} from 'lucide-react';
import type {
  Identity,
  JobSummary,
  Project,
  ProjectTask,
  ProjectTaskPriority,
  ProjectTaskStatus,
  Room,
} from '@runtime/types';
import { Avatar } from '@/components/app/avatar';
import { buttonVariants } from '@/components/ui/button';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';
import { href } from '@/lib/route';

export interface ProjectsScreenProps {
  projects: Project[];
  identities: Identity[];
  jobs: JobSummary[];
  rooms: Room[];
  initialSubpage?: 'board' | 'list' | 'projects' | 'okrs';
  initialProjectId?: string;
  ownerId: string;
  ownerName: string;
  onStartJob?: (req: { text: string; roomId: string | null; newRoomName: string | null; projectId: string | null }) => Promise<void>;
}

const COLUMNS: { id: ProjectTaskStatus; label: string; tone: string; border: string; bg: string }[] = [
  { id: 'open', label: 'Backlog & Ready', tone: 'text-zinc-600', border: 'border-zinc-500/20', bg: 'bg-zinc-500/5' },
  { id: 'in_progress', label: 'Active Execution', tone: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500/30', bg: 'bg-indigo-500/5' },
  { id: 'in_review', label: 'Verification (Kael)', tone: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/5' },
  { id: 'done', label: 'Verified & Shipped', tone: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5' },
];

export function ProjectsScreen({
  projects: initialProjects,
  identities,
  rooms,
  initialSubpage = 'board',
  initialProjectId,
  ownerId,
  onStartJob,
}: ProjectsScreenProps) {
  const { client } = useRuntime();

  // Navigation subpage state
  const [subpage, setSubpage] = React.useState<'board' | 'list' | 'projects' | 'okrs'>(initialSubpage);
  const [projectsList, setProjectsList] = React.useState<Project[]>(initialProjects);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>(initialProjectId || 'all');
  const [tasks, setTasks] = React.useState<ProjectTask[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [refreshing, setRefreshing] = React.useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState('');
  const [priorityFilter, setPriorityFilter] = React.useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>('all');
  const [todayFocusOnly, setTodayFocusOnly] = React.useState(false);

  // Modals
  const [showCreateTaskModal, setShowCreateTaskModal] = React.useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = React.useState(false);

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = React.useState('');
  const [newTaskDesc, setNewTaskDesc] = React.useState('');
  const [newTaskProject, setNewTaskProject] = React.useState<string>(initialProjectId || (initialProjects[0]?.id ?? ''));
  const [newTaskAssignee, setNewTaskAssignee] = React.useState('astra');
  const [newTaskPriority, setNewTaskPriority] = React.useState<ProjectTaskPriority>('high');
  const [submittingTask, setSubmittingTask] = React.useState(false);

  // New project form state
  const [newProjName, setNewProjName] = React.useState('');
  const [newProjDesc, setNewProjDesc] = React.useState('');
  const [newProjRepo, setNewProjRepo] = React.useState('');
  const [newProjBranch, setNewProjBranch] = React.useState('main');
  const [newProjDate, setNewProjDate] = React.useState('');
  const [submittingProject, setSubmittingProject] = React.useState(false);

  // Fetch tasks and projects from runtime
  const loadData = React.useCallback(async (isSilent = false) => {
    if (!client) return;
    if (!isSilent) setLoading(true);
    try {
      const [fetchedTasks, fetchedProjects] = await Promise.all([
        client.projectTasks(),
        client.projects(),
      ]);
      setTasks(fetchedTasks || []);
      if (fetchedProjects && fetchedProjects.length > 0) {
        setProjectsList(fetchedProjects);
      }
    } catch (e) {
      console.warn('Failed to load project board data:', e);
    } finally {
      if (!isSilent) setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  React.useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Handle status update
  const handleUpdateStatus = async (taskId: string, newStatus: ProjectTaskStatus) => {
    if (!client) return;
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t))
    );
    try {
      await client.updateProjectTask(taskId, { status: newStatus });
      // Refresh project counts quietly
      const updatedProjects = await client.projects();
      setProjectsList(updatedProjects);
    } catch (e) {
      console.error('Failed to update task status:', e);
      loadData(true);
    }
  };

  // Create task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !newTaskTitle.trim()) return;
    setSubmittingTask(true);
    try {
      const created = await client.createProjectTask({
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim() || null,
        projectId: newTaskProject || null,
        assigneeId: newTaskAssignee || null,
        priority: newTaskPriority,
        status: 'open',
      });
      setTasks((prev) => [created, ...prev]);
      setNewTaskTitle('');
      setNewTaskDesc('');
      setShowCreateTaskModal(false);
      // Quiet reload
      const updatedProjects = await client.projects();
      setProjectsList(updatedProjects);
    } catch (e) {
      alert(`Failed to create task: ${(e as Error).message}`);
    } finally {
      setSubmittingTask(false);
    }
  };

  // Create project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !newProjName.trim()) return;
    setSubmittingProject(true);
    try {
      const created = await client.createProject({
        name: newProjName.trim(),
        description: newProjDesc.trim() || undefined,
        rootPath: newProjRepo.trim() || undefined,
        defaultBranch: newProjBranch.trim() || 'main',
      });
      setProjectsList((prev) => [...prev, created]);
      setNewProjName('');
      setNewProjDesc('');
      setNewProjRepo('');
      setShowCreateProjectModal(false);
      setSelectedProjectId(created.id);
    } catch (e) {
      alert(`Failed to create project: ${(e as Error).message}`);
    } finally {
      setSubmittingProject(false);
    }
  };

  // Dispatch agent on task
  const handleDispatchTask = async (task: ProjectTask) => {
    const targetAgent = task.assigneeId || 'astra';
    const proj = projectsList.find((p) => p.id === task.projectId);
    const targetWorkspace = task.repo || proj?.rootPath || proj?.repo || '';
    const prompt = `Executing Substrate Task [${task.id}]: "${task.title}".\nDetails: ${task.description || 'Sprint task implementation.'}\nTarget workspace: ${targetWorkspace}`;

    // Auto-advance open tasks to in_progress
    if (task.status === 'open') {
      void handleUpdateStatus(task.id, 'in_progress');
    }

    if (onStartJob) {
      const targetRoom = rooms.find((r) => r.projectId === task.projectId)?.id ?? rooms[0]?.id ?? null;
      await onStartJob({
        text: prompt,
        roomId: targetRoom,
        newRoomName: null,
        projectId: task.projectId ?? null,
      });
    } else {
      // Fallback: wake agent directly via client
      if (client) {
        try {
          await client.wakeAgent(targetAgent, {
            fromActorId: ownerId,
            fromActorKind: 'human',
            prompt,
            reason: `Dispatched from Project Management on ${task.id}`,
          });
          alert(`Dispatched @${targetAgent} on ${task.id}`);
        } catch (e) {
          console.error('Failed to dispatch agent:', e);
        }
      }
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    const matchesProject = selectedProjectId === 'all' || t.projectId === selectedProjectId;
    const matchesQuery =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.assigneeId && t.assigneeId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesAssignee = assigneeFilter === 'all' || (t.assigneeId && t.assigneeId.toLowerCase() === assigneeFilter.toLowerCase());
    const matchesFocus =
      !todayFocusOnly ||
      t.status === 'in_progress' ||
      t.status === 'in_review' ||
      t.priority === 'urgent' ||
      t.priority === 'high';
    return matchesProject && matchesQuery && matchesPriority && matchesAssignee && matchesFocus;
  });

  // Sprint metrics
  const totalTasksCount = tasks.length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const inReviewCount = tasks.filter((t) => t.status === 'in_review').length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-hidden p-4 md:p-6 select-none font-sans">
      {/* Top Header & Metrics Bar */}
      <div className="glass-panel border border-border/60 rounded-3xl p-4 md:p-5 shadow-xs shrink-0 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="size-10 rounded-2xl bg-foreground text-background flex items-center justify-center shadow-xs">
            <Kanban className="size-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-foreground">Project Management</h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                {totalTasksCount} Substrate Tasks
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Enterprise sprint execution, live git-commit linking, and 1-click agent dispatch
            </p>
          </div>
        </div>

        {/* Global Sprint Metrics */}
        <div className="flex items-center gap-2 md:gap-3">
          <div className="glass-panel px-3 py-1.5 rounded-xl border border-border/40 text-center">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">Execution</div>
            <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{inProgressCount}</div>
          </div>
          <div className="glass-panel px-3 py-1.5 rounded-xl border border-border/40 text-center">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">Review</div>
            <div className="text-sm font-bold text-amber-600 dark:text-amber-400">{inReviewCount}</div>
          </div>
          <div className="glass-panel px-3 py-1.5 rounded-xl border border-border/40 text-center">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">Shipped</div>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{doneCount}</div>
          </div>

          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            title="Refresh substrate state"
            className={cn(buttonVariants({ variant: 'glass', size: 'icon' }), 'size-9 cursor-pointer')}
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </button>

          <button
            type="button"
            onClick={() => setShowCreateTaskModal(true)}
            className="px-3.5 py-2 bg-foreground text-background hover:bg-foreground/90 rounded-xl text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 shadow-xs active:scale-95"
          >
            <Plus className="size-3.5" />
            <span>Create Task</span>
          </button>
        </div>
      </div>

      {/* Subpage Tabs & Project Picker Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          {/* Subpage Switcher */}
          <div className="glass-panel p-1 rounded-2xl flex items-center gap-1 border border-border/40">
            <button
              type="button"
              onClick={() => setSubpage('board')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5',
                subpage === 'board'
                  ? 'bg-foreground text-background shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Kanban className="size-3.5" />
              <span>Board</span>
            </button>
            <button
              type="button"
              onClick={() => setSubpage('list')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5',
                subpage === 'list'
                  ? 'bg-foreground text-background shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <List className="size-3.5" />
              <span>Backlog List</span>
            </button>
            <button
              type="button"
              onClick={() => setSubpage('projects')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5',
                subpage === 'projects'
                  ? 'bg-foreground text-background shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <FolderGit2 className="size-3.5" />
              <span>Projects ({projectsList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.hash = href({ name: 'okrs' });
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground transition cursor-pointer flex items-center gap-1.5"
            >
              <Target className="size-3.5" />
              <span>Strategic OKRs</span>
            </button>
          </div>

          {/* Project Picker Dropdown */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-9 px-3 bg-card border border-border/60 rounded-xl text-xs font-medium cursor-pointer focus:outline-hidden"
          >
            <option value="all">All Projects ({projectsList.length})</option>
            {projectsList.map((p) => {
              const pTasksCount = tasks.filter((t) => t.projectId === p.id).length;
              return (
                <option key={p.id} value={p.id}>
                  {p.name} ({pTasksCount} tasks)
                </option>
              );
            })}
          </select>
        </div>

        {/* Filter Controls (for Board & List views) */}
        {(subpage === 'board' || subpage === 'list') && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative w-48 md:w-64">
              <Search className="size-3.5 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search title, ID, @agent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-3 bg-card border border-border/60 rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-hidden focus:border-border"
              />
            </div>

            {/* Today's Focus Toggle */}
            <button
              type="button"
              onClick={() => setTodayFocusOnly(!todayFocusOnly)}
              className={cn(
                'h-8 px-2.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 border',
                todayFocusOnly
                  ? 'bg-amber-500 text-white border-amber-600 shadow-2xs font-bold'
                  : 'glass-panel text-muted-foreground hover:text-foreground border-border/40'
              )}
              title="Filter to tasks committed in daily standups or marked high/urgent"
            >
              <Clock className="size-3" />
              <span>Today's Focus</span>
            </button>

            {/* Assignee Filter */}
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="h-8 px-2.5 bg-card border border-border/60 rounded-xl text-xs font-medium cursor-pointer focus:outline-hidden"
            >
              <option value="all">All Agents</option>
              {identities.map((id) => (
                <option key={id.id} value={id.id}>
                  @{id.id} ({id.name})
                </option>
              ))}
            </select>

            {/* Priority Filter */}
            <div className="flex items-center gap-1">
              {['all', 'urgent', 'high', 'medium', 'low'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriorityFilter(p)}
                  className={cn(
                    'h-7 px-2 rounded-lg text-[10px] font-mono transition cursor-pointer uppercase',
                    priorityFilter === p
                      ? 'bg-foreground text-background font-bold'
                      : 'glass-panel text-muted-foreground hover:text-foreground border border-border/40'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Body */}
      {loading && tasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="size-4 animate-spin text-muted-foreground" />
            <span>Synchronizing substrate tasks from SQLite...</span>
          </div>
        </div>
      ) : subpage === 'board' ? (
        /* 1. Kanban Sprint Board */
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-4 gap-3.5 overflow-hidden">
          {COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => {
              const st = t.status || 'open';
              return st === col.id;
            });

            return (
              <div
                key={col.id}
                className={cn(
                  'flex flex-col h-full rounded-3xl border p-3 overflow-hidden shadow-2xs transition backdrop-blur-xl',
                  col.border,
                  col.bg
                )}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/40 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-bold', col.tone)}>{col.label}</span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full glass-panel border border-border/40 text-foreground">
                      {colTasks.length}
                    </span>
                  </div>
                </div>

                {/* Column Feed */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                  {colTasks.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-muted-foreground text-xs text-center border border-dashed border-border/40 rounded-2xl">
                      <span>No tasks in this lane</span>
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const assignee = identities.find(
                        (i) => i.id.toLowerCase() === (task.assigneeId || '').toLowerCase()
                      );
                      const project = projectsList.find((p) => p.id === task.projectId);

                      return (
                        <div
                          key={task.id}
                          className="p-3 bg-card rounded-2xl border border-border/60 shadow-xs hover:border-indigo-500/50 transition duration-200 space-y-2 group"
                        >
                          {/* Task Header: ID & Priority */}
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">
                              {task.id}
                            </span>
                            <span
                              className={cn(
                                'text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase',
                                task.priority === 'urgent'
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                  : task.priority === 'high'
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                  : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {task.priority || 'medium'}
                            </span>
                          </div>

                          {/* Title */}
                          <h4 className="text-xs font-semibold text-foreground leading-snug">
                            {task.title}
                          </h4>

                          {/* Description */}
                          {task.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          {/* Project Tag */}
                          {project && selectedProjectId === 'all' && (
                            <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                              <Folder className="size-2.5" />
                              <span className="truncate">{project.name}</span>
                            </div>
                          )}

                          {/* Footer with Assignee & 1-Click Dispatch */}
                          <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-muted-foreground">
                              {assignee ? (
                                <Avatar who={assignee} size={18} />
                              ) : (
                                <div className="size-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold">
                                  ?
                                </div>
                              )}
                              <span className="font-semibold text-foreground">
                                @{task.assigneeId || 'unassigned'}
                              </span>
                            </div>

                            {/* 1-Click Dispatch Button */}
                            <button
                              type="button"
                              onClick={() => handleDispatchTask(task)}
                              className="px-2 py-0.5 bg-foreground hover:bg-foreground/90 text-background rounded-lg text-[10px] font-medium transition cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Dispatch autonomous agent turn on this task"
                            >
                              <Play className="size-2.5 text-indigo-400" />
                              <span>Dispatch</span>
                            </button>
                          </div>

                          {/* Quick Status Shift */}
                          <div className="flex items-center gap-1 pt-1 overflow-x-auto text-[9.5px] font-mono text-muted-foreground">
                            <span>Move:</span>
                            {COLUMNS.filter((c) => c.id !== (task.status || 'open')).map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handleUpdateStatus(task.id, c.id)}
                                className="hover:text-foreground transition cursor-pointer underline hover:no-underline"
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
      ) : subpage === 'list' ? (
        /* 2. Linear Backlog List View */
        <div className="flex-1 glass-panel rounded-3xl border border-border/60 overflow-y-auto p-4 space-y-2 shadow-xs">
          {filteredTasks.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-xs text-center">
              <span>No tasks matching your current filters.</span>
            </div>
          ) : (
            filteredTasks.map((t) => {
              const project = projectsList.find((p) => p.id === t.projectId);

              return (
                <div
                  key={t.id}
                  className="p-3 rounded-2xl border border-border/60 hover:border-indigo-500/50 transition flex items-center justify-between gap-4 bg-card/60 hover:bg-card"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground shrink-0">
                      {t.id}
                    </span>
                    <span
                      className={cn(
                        'text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase shrink-0',
                        t.priority === 'urgent'
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                          : t.priority === 'high'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {t.priority}
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate">{t.title}</span>
                    {project && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/40 shrink-0 truncate max-w-[140px]">
                        {project.name}
                      </span>
                    )}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                      @{t.assigneeId || 'unassigned'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <select
                      value={t.status || 'open'}
                      onChange={(e) => handleUpdateStatus(t.id, e.target.value as ProjectTaskStatus)}
                      className="text-xs font-mono px-2.5 py-1 rounded-xl bg-card border border-border/60 cursor-pointer focus:outline-hidden"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="in_review">In Review</option>
                      <option value="done">Done</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleDispatchTask(t)}
                      className="px-3 py-1 bg-foreground hover:bg-foreground/90 text-background rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <Play className="size-3 text-indigo-400" />
                      <span>Execute</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : subpage === 'projects' ? (
        /* 3. Project Portfolio View */
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div>
              <h2 className="text-sm font-bold text-foreground">Active Engineering Projects</h2>
              <p className="text-xs text-muted-foreground">Portfolio progress, repository roots, and delivery schedules</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateProjectModal(true)}
              className="px-3 py-1.5 bg-foreground text-background hover:bg-foreground/90 rounded-xl text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="size-3.5" />
              <span>New Project</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectsList.map((project) => {
              const projectTasksList = tasks.filter((t) => t.projectId === project.id);
              const totalTasks = projectTasksList.length;
              const completedTasks = projectTasksList.filter((t) => t.status === 'done').length;
              const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

              return (
                <div
                  key={project.id}
                  className="glass-panel border border-border/60 rounded-3xl p-5 shadow-xs space-y-4 hover:border-border transition flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-muted-foreground">{project.id}</span>
                        <h3 className="text-sm font-bold text-foreground leading-snug">{project.name}</h3>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase">
                        {project.status || 'active'}
                      </span>
                    </div>

                    {project.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {project.description}
                      </p>
                    )}

                    {/* Repository and branch metadata */}
                    <div className="space-y-1.5 text-xs font-mono text-muted-foreground">
                      {(project.rootPath || project.repo) && (
                        <div className="flex items-center gap-1.5 truncate">
                          <FolderGit2 className="size-3.5 shrink-0 text-foreground" />
                          <span className="truncate">{project.rootPath || project.repo}</span>
                        </div>
                      )}
                      {project.defaultBranch && (
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="size-3.5 shrink-0 text-foreground" />
                          <span>{project.defaultBranch}</span>
                        </div>
                      )}
                      {project.targetDate && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="size-3.5 shrink-0 text-foreground" />
                          <span>Target: {project.targetDate}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress & Actions */}
                  <div className="space-y-3 pt-3 border-t border-border/40">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">Task Completion</span>
                        <span className="font-mono text-muted-foreground">
                          {completedTasks} / {totalTasks} ({progressPct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          setSubpage('board');
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                      >
                        <Kanban className="size-3 text-indigo-400" />
                        <span>View Board</span>
                      </button>

                      <a
                        href={href({ name: 'workspaces' })}
                        className="px-2.5 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1"
                      >
                        <ExternalLink className="size-3" />
                        <span>Workspaces</span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Create Task Modal */}
      {showCreateTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-card-entry">
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <h3 className="text-sm font-bold text-foreground">Create New Substrate Engineering Task</h3>
              <button
                type="button"
                onClick={() => setShowCreateTaskModal(false)}
                className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer"
              >
                ✕ Cancel
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-mono uppercase font-bold text-muted-foreground">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Integrate Playwright regression tests for Chatbot widget"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-muted/60 border border-border/60 rounded-xl text-xs text-foreground focus:outline-hidden focus:border-border"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase font-bold text-muted-foreground">
                  Description / Context
                </label>
                <textarea
                  rows={3}
                  placeholder="Acceptance criteria, reproduction steps, or target files..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-muted/60 border border-border/60 rounded-xl text-xs text-foreground focus:outline-hidden focus:border-border"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-mono uppercase font-bold text-muted-foreground">
                    Project
                  </label>
                  <select
                    value={newTaskProject}
                    onChange={(e) => setNewTaskProject(e.target.value)}
                    className="w-full mt-1 px-2.5 py-2 bg-muted/60 border border-border/60 rounded-xl text-xs text-foreground focus:outline-hidden"
                  >
                    {projectsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-mono uppercase font-bold text-muted-foreground">
                    Assignee
                  </label>
                  <select
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="w-full mt-1 px-2.5 py-2 bg-muted/60 border border-border/60 rounded-xl text-xs text-foreground focus:outline-hidden"
                  >
                    {identities.map((a) => (
                      <option key={a.id} value={a.id}>
                        @{a.id} ({a.name})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-mono uppercase font-bold text-muted-foreground">
                    Priority
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as ProjectTaskPriority)}
                    className="w-full mt-1 px-2.5 py-2 bg-muted/60 border border-border/60 rounded-xl text-xs text-foreground focus:outline-hidden"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShowCreateTaskModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTask}
                  className="px-4 py-2 bg-foreground hover:bg-foreground/90 text-background rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submittingTask ? 'Saving...' : 'Save Task to Substrate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateProjectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-card-entry">
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <h3 className="text-sm font-bold text-foreground">Create Engineering Project</h3>
              <button
                type="button"
                onClick={() => setShowCreateProjectModal(false)}
                className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer"
              >
                ✕ Cancel
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-mono uppercase font-bold text-muted-foreground">
                  Project Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DeployFleet Continuous Cloud Orchestration"
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-muted/60 border border-border/60 rounded-xl text-xs text-foreground focus:outline-hidden focus:border-border"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase font-bold text-muted-foreground">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Primary outcomes and architectural scope..."
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-muted/60 border border-border/60 rounded-xl text-xs text-foreground focus:outline-hidden focus:border-border"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase font-bold text-muted-foreground">
                  Repository Root Path
                </label>
                <input
                  type="text"
                  placeholder="/Users/winstonzulu/Documents/GitHub/DeployFleet"
                  value={newProjRepo}
                  onChange={(e) => setNewProjRepo(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-muted/60 border border-border/60 rounded-xl text-xs font-mono text-foreground focus:outline-hidden focus:border-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono uppercase font-bold text-muted-foreground">
                    Default Branch
                  </label>
                  <input
                    type="text"
                    value={newProjBranch}
                    onChange={(e) => setNewProjBranch(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-muted/60 border border-border/60 rounded-xl text-xs font-mono text-foreground focus:outline-hidden focus:border-border"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono uppercase font-bold text-muted-foreground">
                    Target Date
                  </label>
                  <input
                    type="text"
                    placeholder="YYYY-MM-DD"
                    value={newProjDate}
                    onChange={(e) => setNewProjDate(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-muted/60 border border-border/60 rounded-xl text-xs font-mono text-foreground focus:outline-hidden focus:border-border"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShowCreateProjectModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingProject}
                  className="px-4 py-2 bg-foreground hover:bg-foreground/90 text-background rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submittingProject ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
