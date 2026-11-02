import * as React from 'react';
import {
  FolderOpen,
  FolderPlus,
  GitFork,
  Hash,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitCommit,
  GitBranch,
  FolderTree,
  Play,
  Copy,
  Check,
  Sparkles,
  Layers,
  FileCode,
  FileText,
  File,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  Folder,
  Search,
  Terminal,
} from 'lucide-react';
import type {
  AttachProjectInput,
  CloneProjectInput,
  CreateProjectFolderInput,
  CreateRepoInput,
  CreateRoomInput,
  GitCommitItem,
  GitDiffSummary,
  Identity,
  JobSummary,
  Project,
  ProjectFileItem,
  Repo,
  Room,
  RoomMember,
  Session,
  Team,
  WorkspaceState,
} from '@runtime/types';
import { Avatar, OwnerAvatar } from '@/components/app/avatar';
import { EmptyState, Tag } from '@/components/app/status';
import { WorkspaceStatusBadge } from '@/components/workspaces/workspace-status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData, type Loadable } from '@/lib/runtime-context';
import type { StartJobRequest } from '@/screens/home';
import { cn } from '@/lib/utils';

export interface WorkspacesScreenProps {
  projects?: Project[];
  rooms?: Room[];
  teams?: Team[];
  identities?: Identity[];
  jobs?: JobSummary[];
  sessions?: Session[];
  ownerId?: string;
  onAttachProject?: (input: AttachProjectInput) => Promise<void>;
  onCloneProject?: (input: CloneProjectInput) => Promise<void>;
  onCreateProjectFolder?: (input: CreateProjectFolderInput) => Promise<void>;
  onAddRepo?: (projectId: string, input: CreateRepoInput) => Promise<void>;
  onRemoveRepo?: (repoId: string) => Promise<void>;
  onCreateRoom?: (input: CreateRoomInput) => Promise<Room>;
  onAddRoomMember?: (roomId: string, memberId: string, kind?: 'human' | 'agent', role?: string) => Promise<void>;
  onStartJob?: (req: StartJobRequest) => Promise<void>;
}

type ActionTab = 'attach' | 'clone' | 'create' | null;

const list = <T,>(l: Loadable<T[]>): T[] => (l.status === 'ready' ? l.data : []);

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkspacesScreen(props: WorkspacesScreenProps) {
  const { client, state: connectionState, revision } = useRuntime();

  // Load from context when props are not provided
  const runtimeProjects = useRuntimeData((c) => c.projects());
  const runtimeRooms = useRuntimeData((c) => c.rooms());
  const runtimeTeams = useRuntimeData((c) => c.teams());
  const runtimeIdentities = useRuntimeData((c) => c.identities());
  const runtimeJobs = useRuntimeData((c) => c.jobs());
  const runtimeSessions = useRuntimeData((c) => c.sessions());

  const projects = props.projects ?? list(runtimeProjects);
  const rooms = props.rooms ?? list(runtimeRooms);
  const teams = props.teams ?? list(runtimeTeams);
  const identities = props.identities ?? list(runtimeIdentities);
  const jobs = props.jobs ?? list(runtimeJobs);
  const sessions = props.sessions ?? list(runtimeSessions);
  const ownerId = props.ownerId ?? 'winston';

  const [activeTab, setActiveTab] = React.useState<ActionTab>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterMode, setFilterMode] = React.useState<'all' | 'with-repos' | 'active-jobs'>('all');
  const [projectStatuses, setProjectStatuses] = React.useState<
    Record<string, { project: Project; repos: { repo: Repo; state: WorkspaceState }[] }>
  >({});
  const [loadingStatuses, setLoadingStatuses] = React.useState<Record<string, boolean>>({});

  // Poll project statuses when projects change or revision bumps
  React.useEffect(() => {
    if (!client || projects.length === 0) return;
    let cancelled = false;

    for (const p of projects) {
      setLoadingStatuses((prev) => ({ ...prev, [p.id]: true }));
      client
        .projectStatus(p.id)
        .then((res) => {
          if (!cancelled) {
            setProjectStatuses((prev) => ({ ...prev, [p.id]: res }));
            setLoadingStatuses((prev) => ({ ...prev, [p.id]: false }));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLoadingStatuses((prev) => ({ ...prev, [p.id]: false }));
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [client, projects, revision]);

  // Handlers fallback to client
  const handleAttach = async (input: AttachProjectInput) => {
    if (props.onAttachProject) {
      await props.onAttachProject(input);
    } else if (client) {
      await client.attachProject(input);
    }
    setActiveTab(null);
  };

  const handleClone = async (input: CloneProjectInput) => {
    if (props.onCloneProject) {
      await props.onCloneProject(input);
    } else if (client) {
      await client.cloneProject(input);
    }
    setActiveTab(null);
  };

  const handleCreateFolder = async (input: CreateProjectFolderInput) => {
    if (props.onCreateProjectFolder) {
      await props.onCreateProjectFolder(input);
    } else if (client) {
      await client.createProjectFolder(input);
    }
    setActiveTab(null);
  };

  const handleAddRepo = async (projectId: string, input: CreateRepoInput) => {
    if (props.onAddRepo) {
      await props.onAddRepo(projectId, input);
    } else if (client) {
      await client.addRepo(projectId, input);
      const res = await client.projectStatus(projectId);
      setProjectStatuses((prev) => ({ ...prev, [projectId]: res }));
    }
  };

  const handleRemoveRepo = async (projectId: string, repoId: string) => {
    if (props.onRemoveRepo) {
      await props.onRemoveRepo(repoId);
    } else if (client) {
      await client.removeRepo(repoId);
      const res = await client.projectStatus(projectId);
      setProjectStatuses((prev) => ({ ...prev, [projectId]: res }));
    }
  };

  const handleCreateRoom = async (input: CreateRoomInput): Promise<Room> => {
    if (props.onCreateRoom) {
      return props.onCreateRoom(input);
    }
    if (!client) throw new Error('Runtime is not connected');
    return client.createRoom(input);
  };

  const handleAddRoomMember = async (
    roomId: string,
    memberId: string,
    kind: 'human' | 'agent' = 'agent',
    role = 'member'
  ) => {
    if (props.onAddRoomMember) {
      await props.onAddRoomMember(roomId, memberId, kind, role);
    } else if (client) {
      await client.addRoomMember(roomId, memberId, kind, role);
    }
  };

  const handleStartJob = async (req: StartJobRequest) => {
    if (props.onStartJob) {
      await props.onStartJob(req);
      return;
    }
    if (!client) throw new Error('The runtime is not reachable.');
    const roomId =
      req.roomId ??
      (await client.createRoom({ name: req.newRoomName!, projectId: req.projectId ?? undefined })).id;
    const first = req.text.split('\n')[0].split(/(?<=[.!?])\s/)[0].replace(/[.]$/, '');
    const title = first.length > 90 ? `${first.slice(0, 87)}…` : first;
    const job = await client.createJob({ roomId, title, brief: req.text, createdBy: ownerId });
    await client.postMessage(roomId, { authorId: ownerId, authorKind: 'human', body: req.text, jobId: job.id });
    window.location.hash = href({ name: 'room', roomId });
  };

  const isOffline = connectionState.status !== 'connected';
  const isLoading =
    props.projects === undefined && runtimeProjects.status === 'loading' && projects.length === 0;

  // Filter projects by search query and mode
  const filteredProjects = projects.filter((project) => {
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const matchName = project.name.toLowerCase().includes(q);
      const matchPath = project.rootPath?.toLowerCase().includes(q);
      const matchRepo = project.repos?.some(
        (r) => r.name.toLowerCase().includes(q) || r.path?.toLowerCase().includes(q)
      );
      if (!matchName && !matchPath && !matchRepo) return false;
    }

    if (filterMode === 'with-repos') {
      return (project.repos?.length ?? 0) > 0;
    }
    if (filterMode === 'active-jobs') {
      return (project.openJobCount ?? 0) > 0;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-6 py-2">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-muted-foreground">Workspaces, Repositories & Worktrees</span>
          <h1 className="text-lg font-semibold tracking-tight">Workspaces</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isOffline}
            onClick={() => setActiveTab(activeTab === 'attach' ? null : 'attach')}
            className={cn(buttonVariants({ variant: activeTab === 'attach' ? 'default' : 'glass' }))}
          >
            <FolderOpen className="size-4" />
            Attach folder
          </button>
          <button
            type="button"
            disabled={isOffline}
            onClick={() => setActiveTab(activeTab === 'clone' ? null : 'clone')}
            className={cn(buttonVariants({ variant: activeTab === 'clone' ? 'default' : 'glass' }))}
          >
            <GitFork className="size-4" />
            Clone repo
          </button>
          <button
            type="button"
            disabled={isOffline}
            onClick={() => setActiveTab(activeTab === 'create' ? null : 'create')}
            className={cn(buttonVariants({ variant: activeTab === 'create' ? 'default' : 'glass' }))}
          >
            <FolderPlus className="size-4" />
            New folder
          </button>
        </div>
      </header>

      {/* Action form panel */}
      {activeTab && (
        <section aria-label="Project action" className="glass-panel flex flex-col gap-4 rounded-xl p-5 shadow-sm">
          {activeTab === 'attach' && (
            <AttachProjectForm teams={teams} onSubmit={handleAttach} onCancel={() => setActiveTab(null)} />
          )}
          {activeTab === 'clone' && (
            <CloneProjectForm teams={teams} onSubmit={handleClone} onCancel={() => setActiveTab(null)} />
          )}
          {activeTab === 'create' && (
            <CreateFolderForm teams={teams} onSubmit={handleCreateFolder} onCancel={() => setActiveTab(null)} />
          )}
        </section>
      )}

      {/* Search and filter bar */}
      {projects.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex flex-1 min-w-[240px] max-w-md items-center">
            <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter workspaces by name, path, or repo…"
              className="glass-panel h-9 w-full rounded-lg pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground/70 focus:ring-1 focus:ring-foreground/30"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={cn(
                'rounded-lg px-2.5 py-1 transition-colors',
                filterMode === 'all'
                  ? 'bg-foreground/15 text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-foreground/5'
              )}
            >
              All ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('with-repos')}
              className={cn(
                'rounded-lg px-2.5 py-1 transition-colors',
                filterMode === 'with-repos'
                  ? 'bg-foreground/15 text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-foreground/5'
              )}
            >
              With Repos ({projects.filter((p) => (p.repos?.length ?? 0) > 0).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('active-jobs')}
              className={cn(
                'rounded-lg px-2.5 py-1 transition-colors',
                filterMode === 'active-jobs'
                  ? 'bg-foreground/15 text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-foreground/5'
              )}
            >
              Active Jobs ({projects.filter((p) => (p.openJobCount ?? 0) > 0).length})
            </button>
          </div>
        </div>
      )}

      {/* Projects display */}
      <main className="flex flex-col gap-5">
        {isLoading ? (
          <div className="glass-panel flex items-center justify-center rounded-xl p-12 text-sm text-muted-foreground">
            Loading workspaces…
          </div>
        ) : projects.length === 0 ? (
          <EmptyState title="No workspaces yet">
            <p>Attach an existing folder, clone a Git repository, or create a new empty project folder.</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={isOffline}
                onClick={() => setActiveTab('attach')}
                className={buttonVariants({ variant: 'glass' })}
              >
                <FolderOpen className="size-4" />
                Attach existing folder
              </button>
              <button
                type="button"
                disabled={isOffline}
                onClick={() => setActiveTab('clone')}
                className={buttonVariants({ variant: 'glass' })}
              >
                <GitFork className="size-4" />
                Clone repo
              </button>
              <button
                type="button"
                disabled={isOffline}
                onClick={() => setActiveTab('create')}
                className={buttonVariants({ variant: 'glass' })}
              >
                <FolderPlus className="size-4" />
                Create project folder
              </button>
            </div>
          </EmptyState>
        ) : filteredProjects.length === 0 ? (
          <div className="glass-panel flex flex-col items-center justify-center rounded-xl p-8 text-center text-xs text-muted-foreground">
            <AlertCircle className="mb-2 size-5 text-muted-foreground/60" />
            <p>No workspaces match your filter criteria.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterMode('all');
              }}
              className="mt-2 text-foreground underline underline-offset-2 hover:opacity-80"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredProjects.map((project) => {
              const statusData = projectStatuses[project.id];
              const isStatusLoading = loadingStatuses[project.id] ?? false;
              const projectRooms = rooms.filter((r) => r.projectId === project.id);
              const projectJobs = jobs.filter(
                (j) => projectRooms.some((r) => r.id === j.roomId)
              );
              const team = teams.find((t) => t.id === project.teamId);

              // Derive root workspace state from repo matching rootPath or first repo
              const primaryRepoState =
                statusData?.repos.find((r) => r.repo.path === project.rootPath)?.state ??
                statusData?.repos[0]?.state ??
                null;

              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  team={team}
                  rootState={primaryRepoState}
                  isStatusLoading={isStatusLoading}
                  statusData={statusData}
                  rooms={projectRooms}
                  jobs={projectJobs}
                  sessions={sessions}
                  identities={identities}
                  onAddRepo={(input) => handleAddRepo(project.id, input)}
                  onRemoveRepo={(repoId) => handleRemoveRepo(project.id, repoId)}
                  onCreateRoom={handleCreateRoom}
                  onAddRoomMember={handleAddRoomMember}
                  onStartJob={handleStartJob}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- Project Card Component

type CardSubTab = 'overview' | 'commits' | 'files' | 'rooms-jobs';

function ProjectCard({
  project,
  team,
  rootState,
  isStatusLoading,
  statusData,
  rooms,
  jobs,
  sessions,
  identities,
  onAddRepo,
  onRemoveRepo,
  onCreateRoom,
  onAddRoomMember,
  onStartJob,
}: {
  project: Project;
  team?: Team;
  rootState?: WorkspaceState | null;
  isStatusLoading: boolean;
  statusData?: { project: Project; repos: { repo: Repo; state: WorkspaceState }[] };
  rooms: Room[];
  jobs: JobSummary[];
  sessions: Session[];
  identities: Identity[];
  onAddRepo: (input: CreateRepoInput) => Promise<void>;
  onRemoveRepo: (repoId: string) => Promise<void>;
  onCreateRoom: (input: CreateRoomInput) => Promise<Room>;
  onAddRoomMember: (roomId: string, memberId: string, kind?: 'human' | 'agent', role?: string) => Promise<void>;
  onStartJob: (req: StartJobRequest) => Promise<void>;
}) {
  const [activeSubTab, setActiveSubTab] = React.useState<CardSubTab>('overview');
  const [showAddRepo, setShowAddRepo] = React.useState(false);
  const [showCreateRoom, setShowCreateRoom] = React.useState(false);
  const [showJobLauncher, setShowJobLauncher] = React.useState(false);
  const [copiedRoot, setCopiedRoot] = React.useState(false);

  // Find active sessions that belong to this project
  const projectRoomIds = new Set(rooms.map((r) => r.id));
  const activeSessionWorktrees = sessions.filter((s) => {
    if (!s.worktree) return false;
    // Direct room match
    const job = jobs.find((j) => j.id === s.jobId);
    if (job && projectRoomIds.has(job.roomId)) return true;
    // Or path prefix match
    if (project.rootPath && s.worktree.includes(project.rootPath)) return true;
    if (project.repos?.some((r) => r.path && s.worktree!.includes(r.path))) return true;
    return false;
  });

  const copyRootPath = () => {
    if (project.rootPath) {
      navigator.clipboard.writeText(project.rootPath);
      setCopiedRoot(true);
      setTimeout(() => setCopiedRoot(false), 1500);
    }
  };

  return (
    <article className="glass-panel flex flex-col gap-4 rounded-xl p-5 shadow-sm transition-all duration-150">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{project.name}</h2>
            {team && <Tag tone="quiet">{team.name}</Tag>}
            <WorkspaceStatusBadge state={rootState} loading={isStatusLoading} />
          </div>

          {project.rootPath && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono break-all">{project.rootPath}</span>
              <button
                type="button"
                onClick={copyRootPath}
                title="Copy root directory path"
                className="hover:text-foreground inline-flex items-center p-0.5"
              >
                {copiedRoot ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
              </button>
            </div>
          )}

          {project.description && (
            <p className="text-xs text-muted-foreground/90">{project.description}</p>
          )}
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowJobLauncher((prev) => !prev)}
            className={cn(
              buttonVariants({ variant: showJobLauncher ? 'default' : 'glass', size: 'xs' }),
              'gap-1.5 font-medium'
            )}
          >
            <Sparkles className="size-3 text-amber-400" />
            Start Job
          </button>
          <button
            type="button"
            onClick={() => setShowCreateRoom((prev) => !prev)}
            className={cn(
              buttonVariants({ variant: showCreateRoom ? 'default' : 'glass', size: 'xs' }),
              'gap-1.5'
            )}
          >
            <Plus className="size-3" />
            New Room
          </button>
        </div>
      </div>

      {/* Embedded Job Launcher Drawer */}
      {showJobLauncher && (
        <div className="rounded-lg border border-border/50 bg-background/40 p-4">
          <ProjectJobLauncher
            project={project}
            rooms={rooms}
            onCancel={() => setShowJobLauncher(false)}
            onStartJob={async (req) => {
              await onStartJob(req);
              setShowJobLauncher(false);
            }}
          />
        </div>
      )}

      {/* Embedded Room Creator Drawer */}
      {showCreateRoom && (
        <div className="rounded-lg border border-border/50 bg-background/40 p-4">
          <CreateRoomForm
            projectId={project.id}
            identities={identities}
            onSubmit={async (input, initialMemberIds) => {
              const created = await onCreateRoom(input);
              for (const memberId of initialMemberIds) {
                await onAddRoomMember(created.id, memberId);
              }
              setShowCreateRoom(false);
            }}
            onCancel={() => setShowCreateRoom(false)}
          />
        </div>
      )}

      {/* Sub-tab Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab('overview')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors',
              activeSubTab === 'overview'
                ? 'bg-foreground/15 text-foreground'
                : 'text-muted-foreground hover:bg-foreground/5'
            )}
          >
            <Layers className="size-3.5" />
            Overview ({project.repos?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('commits')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors',
              activeSubTab === 'commits'
                ? 'bg-foreground/15 text-foreground'
                : 'text-muted-foreground hover:bg-foreground/5'
            )}
          >
            <GitCommit className="size-3.5" />
            Commits & Diff
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('files')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors',
              activeSubTab === 'files'
                ? 'bg-foreground/15 text-foreground'
                : 'text-muted-foreground hover:bg-foreground/5'
            )}
          >
            <FolderTree className="size-3.5" />
            Files & Worktrees {activeSessionWorktrees.length > 0 && `(${activeSessionWorktrees.length})`}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('rooms-jobs')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors',
              activeSubTab === 'rooms-jobs'
                ? 'bg-foreground/15 text-foreground'
                : 'text-muted-foreground hover:bg-foreground/5'
            )}
          >
            <Hash className="size-3.5" />
            Rooms ({rooms.length}) & Jobs ({jobs.length})
          </button>
        </div>

        {/* Status indicator summary on right */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {rootState?.branch && (
            <span className="flex items-center gap-1 font-mono">
              <GitBranch className="size-3" />
              {rootState.branch}
            </span>
          )}
          {rootState?.dirty !== null && rootState?.dirty !== undefined && !rootState.unknown && (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
                !rootState.dirty
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-amber-500/10 text-amber-400'
              )}
            >
              {!rootState.dirty ? 'Clean' : 'Dirty'}
            </span>
          )}
        </div>
      </div>

      {/* Sub-tab Content Area */}
      <div className="flex flex-col gap-3">
        {/* TAB 1: OVERVIEW & REPOSITORIES */}
        {activeSubTab === 'overview' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Attached Repositories ({project.repos?.length ?? 0})
              </span>
              <button
                type="button"
                onClick={() => setShowAddRepo(!showAddRepo)}
                className={cn(buttonVariants({ variant: 'glass', size: 'xs' }))}
              >
                <Plus className="size-3" />
                Add repo
              </button>
            </div>

            {showAddRepo && (
              <AddRepoForm
                onSubmit={async (input) => {
                  await onAddRepo(input);
                  setShowAddRepo(false);
                }}
                onCancel={() => setShowAddRepo(false)}
              />
            )}

            {project.repos && project.repos.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {project.repos.map((repo) => {
                  const repoState = statusData?.repos.find((r) => r.repo.id === repo.id)?.state;
                  return (
                    <div
                      key={repo.id}
                      className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                        <span className="font-semibold">{repo.name}</span>
                        {repo.path && (
                          <span className="font-mono text-muted-foreground truncate">{repo.path}</span>
                        )}
                        {repo.remoteUrl && (
                          <span className="font-mono text-muted-foreground/80 truncate">({repo.remoteUrl})</span>
                        )}
                        <WorkspaceStatusBadge state={repoState} loading={isStatusLoading} />
                      </div>
                      <button
                        type="button"
                        title={`Remove repository ${repo.name}`}
                        onClick={() => onRemoveRepo(repo.id)}
                        className="text-muted-foreground hover:text-risk p-1 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No repositories attached.</p>
            )}
          </div>
        )}

        {/* TAB 2: COMMITS & GIT DIFF INSPECTOR */}
        {activeSubTab === 'commits' && (
          <GitInspectorTab projectId={project.id} rootState={rootState} />
        )}

        {/* TAB 3: FILES & WORKTREES */}
        {activeSubTab === 'files' && (
          <div className="flex flex-col gap-4">
            {/* Active Session Worktrees Section */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Active Agent Session Worktrees ({activeSessionWorktrees.length})
              </span>
              {activeSessionWorktrees.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {activeSessionWorktrees.map((session) => {
                    const agent = identities.find((i) => i.id === session.agentId);
                    const job = jobs.find((j) => j.id === session.jobId);
                    return (
                      <div
                        key={session.id}
                        className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-xs"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <Avatar who={agent ?? { name: session.agentId }} size={24} />
                          <div className="flex min-w-0 flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{agent?.name ?? session.agentId}</span>
                              <Tag tone="observed">Worktree</Tag>
                              {job && (
                                <span className="text-muted-foreground truncate max-w-xs">
                                  {job.title}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground truncate">
                              {session.worktree}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={href({ name: 'dev', jobId: session.jobId ?? undefined })}
                            className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
                          >
                            <Terminal className="size-3" />
                            Dev Console
                          </a>
                          {session.jobId && (
                            <a
                              href={href({ name: 'job', jobId: session.jobId })}
                              className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
                            >
                              <ExternalLink className="size-3" />
                              Job
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No active agent worktrees currently branched for this workspace.
                </p>
              )}
            </div>

            {/* Project File Tree Browser */}
            <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Project Files
              </span>
              <ProjectFileBrowser projectId={project.id} />
            </div>
          </div>
        )}

        {/* TAB 4: ROOMS & JOBS */}
        {activeSubTab === 'rooms-jobs' && (
          <ProjectRoomsAndJobs
            rooms={rooms}
            jobs={jobs}
            identities={identities}
            onAddRoomMember={onAddRoomMember}
            onOpenRoomCreator={() => setShowCreateRoom(true)}
            onOpenJobLauncher={() => setShowJobLauncher(true)}
          />
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- Git Inspector Tab (Commits & Diff)

function GitInspectorTab({
  projectId,
  rootState,
}: {
  projectId: string;
  rootState?: WorkspaceState | null;
}) {
  const { client } = useRuntime();
  const [commits, setCommits] = React.useState<GitCommitItem[]>([]);
  const [diffSummary, setDiffSummary] = React.useState<GitDiffSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [copiedHash, setCopiedHash] = React.useState<string | null>(null);
  const [showUnifiedDiff, setShowUnifiedDiff] = React.useState(false);

  const fetchGitData = React.useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const [c, d] = await Promise.all([
        client.projectCommits(projectId, 15).catch(() => []),
        client.projectDiff(projectId).catch(() => ({ diff: '', files: [] })),
      ]);
      setCommits(c);
      setDiffSummary(d);
    } finally {
      setLoading(false);
    }
  }, [client, projectId]);

  React.useEffect(() => {
    fetchGitData();
  }, [fetchGitData]);

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-xs text-muted-foreground">
        <RefreshCw className="mr-2 size-3.5 animate-spin" />
        Inspecting Git commits & working diff…
      </div>
    );
  }

  const hasDirtyFiles = (diffSummary?.files?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Top Working Tree Status Banner */}
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-xs">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <span className="font-medium">Branch:</span>
          <span className="font-mono text-foreground">{rootState?.branch ?? 'unknown'}</span>
          <span className="text-muted-foreground">·</span>
          {hasDirtyFiles ? (
            <span className="text-amber-400 font-medium">
              {diffSummary!.files.length} changed file{diffSummary!.files.length === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="text-emerald-400 font-medium">Working tree is clean</span>
          )}
        </div>
        <button
          type="button"
          onClick={fetchGitData}
          className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
        >
          <RefreshCw className="size-3" />
          Refresh
        </button>
      </div>

      {/* Working Tree Changes / Diff View */}
      {hasDirtyFiles && (
        <div className="glass-panel flex flex-col gap-2.5 rounded-lg p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider">
              Uncommitted Changes ({diffSummary!.files.length})
            </span>
            <button
              type="button"
              onClick={() => setShowUnifiedDiff(!showUnifiedDiff)}
              className="text-foreground underline underline-offset-2 hover:opacity-80"
            >
              {showUnifiedDiff ? 'Hide diff' : 'Show unified diff'}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {diffSummary!.files.map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-1.5 rounded border border-border/40 bg-background/50 px-2 py-1 font-mono text-[11px]"
              >
                <span
                  className={cn(
                    'font-bold',
                    f.status === 'M' && 'text-amber-400',
                    (f.status === 'A' || f.status === '??') && 'text-emerald-400',
                    f.status === 'D' && 'text-rose-400'
                  )}
                >
                  {f.status}
                </span>
                <span className="text-foreground/90">{f.path}</span>
              </div>
            ))}
          </div>

          {showUnifiedDiff && diffSummary?.diff && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded bg-black/60 p-3 font-mono text-[11px] text-foreground leading-relaxed">
              {diffSummary.diff.split('\n').map((line, idx) => {
                let colorClass = 'text-muted-foreground';
                if (line.startsWith('+') && !line.startsWith('+++')) {
                  colorClass = 'text-emerald-400 bg-emerald-500/10 block px-1 -mx-1';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                  colorClass = 'text-rose-400 bg-rose-500/10 block px-1 -mx-1';
                } else if (line.startsWith('@@')) {
                  colorClass = 'text-cyan-400 font-semibold block px-1 -mx-1';
                }
                return (
                  <div key={idx} className={colorClass}>
                    {line || ' '}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Commits List */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Recent Git Commits ({commits.length})
        </span>

        {commits.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {commits.map((commit) => (
              <div
                key={commit.hash}
                className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <GitCommit className="size-3.5 text-muted-foreground shrink-0" />
                  <button
                    type="button"
                    onClick={() => copyHash(commit.hash)}
                    title="Copy full commit SHA"
                    className="flex items-center gap-1 font-mono text-[11px] font-semibold text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <span>{commit.shortHash}</span>
                    {copiedHash === commit.hash ? (
                      <Check className="size-2.5 text-emerald-400" />
                    ) : (
                      <Copy className="size-2.5 opacity-50" />
                    )}
                  </button>
                  <span className="font-medium text-foreground truncate">{commit.subject}</span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
                  <span>{commit.author}</span>
                  <span>·</span>
                  <span>{commit.date ? new Date(commit.date).toLocaleDateString() : ''}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No commits recorded in this repository yet.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Project File Browser

function ProjectFileBrowser({ projectId }: { projectId: string }) {
  const { client } = useRuntime();
  const [currentPath, setCurrentPath] = React.useState('');
  const [files, setFiles] = React.useState<ProjectFileItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filterQuery, setFilterQuery] = React.useState('');

  const loadFiles = React.useCallback(async (dirPath: string) => {
    if (!client) return;
    setLoading(true);
    try {
      const res = await client.projectFiles(projectId, dirPath, 150);
      setFiles(res);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [client, projectId]);

  React.useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath, loadFiles]);

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  const filteredFiles = files.filter((f) =>
    filterQuery ? f.name.toLowerCase().includes(filterQuery.toLowerCase()) : true
  );

  return (
    <div className="glass-panel flex flex-col gap-2 rounded-lg p-3 text-xs">
      {/* Breadcrumb Navigation & Filter */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-2">
        <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => setCurrentPath('')}
            className={cn(
              'hover:text-foreground',
              currentPath === '' ? 'font-bold text-foreground' : 'text-muted-foreground'
            )}
          >
            /root
          </button>
          {pathParts.map((part, idx) => {
            const sub = pathParts.slice(0, idx + 1).join('/');
            const isLast = idx === pathParts.length - 1;
            return (
              <React.Fragment key={sub}>
                <span className="text-muted-foreground">/</span>
                <button
                  type="button"
                  onClick={() => setCurrentPath(sub)}
                  className={cn(
                    'hover:text-foreground',
                    isLast ? 'font-bold text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {currentPath !== '' && (
            <button
              type="button"
              onClick={navigateUp}
              className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
            >
              <ArrowLeft className="size-3" />
              Up
            </button>
          )}
          <input
            type="search"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter files…"
            className="glass-panel h-6 w-32 rounded px-2 text-[11px] outline-none"
          />
        </div>
      </div>

      {/* Files List Table */}
      {loading ? (
        <div className="flex items-center justify-center p-6 text-muted-foreground">
          <RefreshCw className="mr-2 size-3 animate-spin" />
          Loading folder contents…
        </div>
      ) : filteredFiles.length === 0 ? (
        <p className="p-4 text-center text-muted-foreground">
          {files.length === 0 ? 'Folder is empty.' : 'No files match your search.'}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border/20 max-h-64 overflow-y-auto">
          {filteredFiles.map((file) => (
            <div
              key={file.path}
              className="flex items-center justify-between py-1.5 px-1 hover:bg-foreground/5 rounded transition-colors"
            >
              <div className="flex min-w-0 items-center gap-2">
                {file.isDirectory ? (
                  <Folder className="size-3.5 text-amber-400 shrink-0" />
                ) : file.name.endsWith('.ts') ||
                  file.name.endsWith('.tsx') ||
                  file.name.endsWith('.js') ||
                  file.name.endsWith('.rs') ? (
                  <FileCode className="size-3.5 text-cyan-400 shrink-0" />
                ) : file.name.endsWith('.md') || file.name.endsWith('.txt') ? (
                  <FileText className="size-3.5 text-blue-400 shrink-0" />
                ) : (
                  <File className="size-3.5 text-muted-foreground shrink-0" />
                )}

                {file.isDirectory ? (
                  <button
                    type="button"
                    onClick={() => setCurrentPath(file.path)}
                    className="font-semibold text-foreground hover:underline truncate"
                  >
                    {file.name}
                  </button>
                ) : (
                  <span className="font-mono text-muted-foreground truncate">{file.name}</span>
                )}
              </div>

              <span className="font-mono text-[11px] text-muted-foreground/70 shrink-0">
                {file.isDirectory ? 'dir' : formatFileSize(file.size)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Project Rooms and Jobs Tab

function ProjectRoomsAndJobs({
  rooms,
  jobs,
  identities,
  onAddRoomMember,
  onOpenRoomCreator,
  onOpenJobLauncher,
}: {
  rooms: Room[];
  jobs: JobSummary[];
  identities: Identity[];
  onAddRoomMember: (roomId: string, memberId: string, kind?: 'human' | 'agent', role?: string) => Promise<void>;
  onOpenRoomCreator: () => void;
  onOpenJobLauncher: () => void;
}) {
  const [expandedRoomId, setExpandedRoomId] = React.useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Rooms Column */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Rooms ({rooms.length})
          </span>
          <button
            type="button"
            onClick={onOpenRoomCreator}
            className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
          >
            <Plus className="size-3" />
            New Room
          </button>
        </div>

        {rooms.length > 0 ? (
          <div className="flex flex-col gap-2">
            {rooms.map((room) => {
              const isExpanded = expandedRoomId === room.id;
              return (
                <div key={room.id} className="glass-panel flex flex-col rounded-lg">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setExpandedRoomId(isExpanded ? null : room.id)}
                      className="flex items-center gap-2 font-medium hover:text-foreground"
                    >
                      {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      <Hash className="size-3.5 text-muted-foreground" />
                      <span>{room.name}</span>
                      <Tag tone="quiet">{room.kind ?? 'project'}</Tag>
                    </button>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{room.openJobCount} open job{room.openJobCount === 1 ? '' : 's'}</span>
                      <a
                        href={href({ name: 'room', roomId: room.id })}
                        className="inline-flex items-center gap-1 hover:text-foreground font-medium"
                      >
                        Open <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </div>

                  {isExpanded && (
                    <RoomMembersView
                      roomId={room.id}
                      identities={identities}
                      onAddMember={(memberId) => onAddRoomMember(room.id, memberId)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No rooms bound to this workspace yet.</p>
        )}
      </div>

      {/* Jobs Column */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Jobs ({jobs.length})
          </span>
          <button
            type="button"
            onClick={onOpenJobLauncher}
            className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
          >
            <Plus className="size-3" />
            New Job
          </button>
        </div>

        {jobs.length > 0 ? (
          <div className="flex flex-col gap-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="glass-panel flex flex-wrap items-center justify-between gap-2 rounded-lg p-2.5 text-xs"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground truncate">{job.title}</span>
                    <Tag tone={job.stage === 'done' ? 'verified' : 'quiet'}>{job.stage}</Tag>
                  </div>
                  <span className="text-[11px] text-muted-foreground truncate">
                    Job #{job.number} · {new Date(job.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <a
                  href={href({ name: 'job', jobId: job.id })}
                  className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
                >
                  View
                  <ExternalLink className="size-3" />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No jobs started under this workspace yet.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Project Job Launcher (Feature 3)

function ProjectJobLauncher({
  project,
  rooms,
  onStartJob,
  onCancel,
}: {
  project: Project;
  rooms: Room[];
  onStartJob: (req: StartJobRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [brief, setBrief] = React.useState('');
  const [roomMode, setRoomMode] = React.useState<'existing' | 'new'>(rooms.length > 0 ? 'existing' : 'new');
  const [selectedRoomId, setSelectedRoomId] = React.useState(rooms[0]?.id ?? '');
  const [newRoomName, setNewRoomName] = React.useState(`${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-task`);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const presets = [
    'Run tests, fix failing assertions, and verify workspace cleanly.',
    'Refactor and polish UI components for full responsiveness.',
    'Review recent commits and perform independent verification.',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brief.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onStartJob({
        roomId: roomMode === 'existing' ? selectedRoomId : null,
        newRoomName: roomMode === 'new' ? newRoomName : null,
        projectId: project.id,
        text: brief.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-400" />
          <span className="font-semibold text-foreground text-sm">Launch Team Job on {project.name}</span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <label className="flex flex-col gap-1 text-muted-foreground">
        Job Brief / Objective *
        <textarea
          required
          rows={3}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Describe what the autonomous agent team should build, investigate, or verify…"
          className="glass-panel rounded-lg p-2.5 text-xs outline-none placeholder:text-muted-foreground/70 focus:ring-1 focus:ring-foreground/30 resize-none"
        />
      </label>

      {/* Preset brief suggestions */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>Quick suggestions:</span>
        {presets.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setBrief(p)}
            className="rounded border border-border/40 bg-background/50 px-2 py-0.5 hover:bg-accent hover:text-accent-foreground truncate max-w-xs"
          >
            {p}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-muted-foreground">
          Target Room
          <div className="flex items-center gap-2">
            {rooms.length > 0 && (
              <label className="flex items-center gap-1 text-foreground/90">
                <input
                  type="radio"
                  name="roomMode"
                  checked={roomMode === 'existing'}
                  onChange={() => setRoomMode('existing')}
                />
                Existing
              </label>
            )}
            <label className="flex items-center gap-1 text-foreground/90">
              <input
                type="radio"
                name="roomMode"
                checked={roomMode === 'new'}
                onChange={() => setRoomMode('new')}
              />
              Create new
            </label>
          </div>
        </label>

        {roomMode === 'existing' && rooms.length > 0 ? (
          <label className="flex flex-col gap-1 text-muted-foreground">
            Select Room
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="glass-panel h-8 rounded px-2 text-xs outline-none"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-muted-foreground">
            New Room Name
            <input
              required
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className="glass-panel h-8 rounded px-2 text-xs outline-none"
              placeholder="e.g. feature-refactor"
            />
          </label>
        )}
      </div>

      {error && <p className="text-risk">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/30">
        <button type="button" onClick={onCancel} className={buttonVariants({ variant: 'glass', size: 'xs' })}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !brief.trim()}
          className={cn(buttonVariants({ variant: 'default', size: 'xs' }), 'gap-1.5')}
        >
          <Play className="size-3" />
          {submitting ? 'Launching…' : 'Launch Job'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Room Members View

function RoomMembersView({
  roomId,
  identities,
  onAddMember,
}: {
  roomId: string;
  identities: Identity[];
  onAddMember: (memberId: string) => Promise<void>;
}) {
  const { client, revision } = useRuntime();
  const [members, setMembers] = React.useState<RoomMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedMember, setSelectedMember] = React.useState('');

  React.useEffect(() => {
    if (!client) return;
    let cancelled = false;
    setLoading(true);
    client
      .roomMembers(roomId)
      .then((m) => {
        if (!cancelled) {
          setMembers(m);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, roomId, revision]);

  const memberIds = new Set(members.map((m) => m.memberId));
  const availableToAdd = identities.filter((i) => !memberIds.has(i.id));

  const add = async () => {
    if (!selectedMember) return;
    await onAddMember(selectedMember);
    setSelectedMember('');
    if (client) {
      const updated = await client.roomMembers(roomId);
      setMembers(updated);
    }
  };

  return (
    <div className="border-t border-border/30 px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <span className="font-medium text-muted-foreground">Members ({members.length})</span>
        {availableToAdd.length > 0 && (
          <div className="flex items-center gap-1.5">
            <select
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
              className="glass-panel h-7 rounded px-2 text-xs outline-none"
            >
              <option value="">Add coworker…</option>
              {availableToAdd.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.role ?? 'Coworker'})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedMember}
              onClick={add}
              className={buttonVariants({ variant: 'glass', size: 'xs' })}
            >
              Add
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <span className="text-muted-foreground">Loading members…</span>
      ) : members.length === 0 ? (
        <span className="text-muted-foreground">No members assigned.</span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const identity = identities.find((i) => i.id === m.memberId);
            return (
              <div
                key={m.memberId}
                className="glass-panel flex items-center gap-1.5 rounded-full px-2 py-0.5"
              >
                {m.kind === 'human' ? (
                  <OwnerAvatar name={m.memberId} size={16} />
                ) : (
                  <Avatar who={identity ?? { name: m.memberId }} size={16} />
                )}
                <span>{identity?.name ?? m.memberId}</span>
                <span className="text-muted-foreground">({m.role})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Form Components

const inputClass =
  'glass-panel h-9 rounded-md px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-foreground/40';

// Native Folder Path Input with Presets & HTML5 Directory Picker
function FolderPathInput({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const presets = [
    { label: '~', path: '~' },
    { label: '~/Projects', path: '~/Projects' },
    { label: '~/WebstormProjects', path: '~/WebstormProjects' },
    { label: '~/Desktop', path: '~/Desktop' },
    { label: '/tmp', path: '/tmp' },
  ];

  const handleDirectoryPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0] as unknown as { webkitRelativePath?: string; path?: string };
      if (file.path) {
        const dir = file.path.substring(0, file.path.lastIndexOf('/'));
        if (dir) onChange(dir);
      } else if (file.webkitRelativePath) {
        const rootDir = file.webkitRelativePath.split('/')[0];
        if (rootDir) onChange(rootDir);
      }
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative flex items-center">
        <input
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, 'w-full pr-24')}
          placeholder={placeholder ?? '/Users/username/Projects/my-app'}
        />
        <input
          ref={fileInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard in browsers
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={handleDirectoryPicked}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded bg-muted/80 px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
        >
          Browse…
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>Presets:</span>
        {presets.map((p) => (
          <button
            key={p.path}
            type="button"
            onClick={() => onChange(p.path)}
            className="rounded border border-border/50 bg-background/50 px-1.5 py-0.5 hover:bg-accent hover:text-accent-foreground"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AttachProjectForm({
  teams,
  onSubmit,
  onCancel,
}: {
  teams: Team[];
  onSubmit: (input: AttachProjectInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [path, setPath] = React.useState('');
  const [name, setName] = React.useState('');
  const [defaultBranch, setDefaultBranch] = React.useState('main');
  const [teamId, setTeamId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        path: path.trim(),
        name: name.trim() || undefined,
        defaultBranch: defaultBranch.trim() || undefined,
        teamId: teamId || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col leading-tight">
        <h3 className="text-sm font-semibold">Attach existing workspace folder</h3>
        <p className="text-xs text-muted-foreground">
          Point to a directory on this machine. Git status and repos will be observed directly.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">
          <span>Folder path *</span>
          <FolderPathInput
            required
            value={path}
            onChange={setPath}
            placeholder="/Users/username/Projects/my-app"
          />
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Project name (optional)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Defaults to directory name"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Default branch
          <input
            value={defaultBranch}
            onChange={(e) => setDefaultBranch(e.target.value)}
            className={inputClass}
            placeholder="main"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">
          Team
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className={inputClass}
          >
            <option value="">No team assigned</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-xs text-risk">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className={buttonVariants({ variant: 'glass' })}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !path.trim()}
          className={buttonVariants({ variant: 'default' })}
        >
          {submitting ? 'Attaching…' : 'Attach project'}
        </button>
      </div>
    </form>
  );
}

function CloneProjectForm({
  teams,
  onSubmit,
  onCancel,
}: {
  teams: Team[];
  onSubmit: (input: CloneProjectInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [url, setUrl] = React.useState('');
  const [parentDir, setParentDir] = React.useState('');
  const [name, setName] = React.useState('');
  const [teamId, setTeamId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        url: url.trim(),
        parentDir: parentDir.trim() || undefined,
        name: name.trim() || undefined,
        teamId: teamId || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col leading-tight">
        <h3 className="text-sm font-semibold">Clone repository</h3>
        <p className="text-xs text-muted-foreground">Clone a remote git repository into an allowed workspace root.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">
          Repository URL *
          <input
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputClass}
            placeholder="https://github.com/myavana/app.git"
          />
        </label>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>Parent folder (optional)</span>
          <FolderPathInput
            value={parentDir}
            onChange={setParentDir}
            placeholder="Defaults to workspace root"
          />
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Target folder name (optional)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Defaults to repository name"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">
          Team
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className={inputClass}
          >
            <option value="">No team assigned</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-xs text-risk">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className={buttonVariants({ variant: 'glass' })}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !url.trim()}
          className={buttonVariants({ variant: 'default' })}
        >
          {submitting ? 'Cloning…' : 'Clone repository'}
        </button>
      </div>
    </form>
  );
}

function CreateFolderForm({
  teams,
  onSubmit,
  onCancel,
}: {
  teams: Team[];
  onSubmit: (input: CreateProjectFolderInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [path, setPath] = React.useState('');
  const [name, setName] = React.useState('');
  const [initGit, setInitGit] = React.useState(true);
  const [teamId, setTeamId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        path: path.trim(),
        name: name.trim() || undefined,
        initGit,
        teamId: teamId || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col leading-tight">
        <h3 className="text-sm font-semibold">Create empty project folder</h3>
        <p className="text-xs text-muted-foreground">Creates a directory under the workspace root and initializes Git.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">
          <span>Directory path *</span>
          <FolderPathInput
            required
            value={path}
            onChange={setPath}
            placeholder="/Users/username/Projects/new-service"
          />
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Project name (optional)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Defaults to directory name"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Team
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className={inputClass}
          >
            <option value="">No team assigned</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-foreground/90">
        <input
          type="checkbox"
          checked={initGit}
          onChange={(e) => setInitGit(e.target.checked)}
          className="rounded border-border"
        />
        Initialize Git repository (recommended)
      </label>

      {error && <p className="text-xs text-risk">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className={buttonVariants({ variant: 'glass' })}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !path.trim()}
          className={buttonVariants({ variant: 'default' })}
        >
          {submitting ? 'Creating…' : 'Create folder'}
        </button>
      </div>
    </form>
  );
}

function AddRepoForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: CreateRepoInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState('');
  const [path, setPath] = React.useState('');
  const [remoteUrl, setRemoteUrl] = React.useState('');
  const [defaultBranch, setDefaultBranch] = React.useState('main');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        path: path.trim() || undefined,
        remoteUrl: remoteUrl.trim() || undefined,
        defaultBranch: defaultBranch.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel flex flex-col gap-3 rounded-lg p-3 text-xs">
      <span className="font-semibold text-foreground">Attach repository to this project</span>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-muted-foreground">
          Repo name *
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass-panel h-8 rounded px-2 text-xs outline-none"
            placeholder="e.g. mobile or backend"
          />
        </label>
        <label className="flex flex-col gap-1 text-muted-foreground">
          Relative or absolute path
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="glass-panel h-8 rounded px-2 text-xs outline-none"
            placeholder="e.g. apps/mobile"
          />
        </label>
        <label className="flex flex-col gap-1 text-muted-foreground">
          Remote URL
          <input
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
            className="glass-panel h-8 rounded px-2 text-xs outline-none"
            placeholder="https://github.com/..."
          />
        </label>
        <label className="flex flex-col gap-1 text-muted-foreground">
          Default branch
          <input
            value={defaultBranch}
            onChange={(e) => setDefaultBranch(e.target.value)}
            className="glass-panel h-8 rounded px-2 text-xs outline-none"
            placeholder="main"
          />
        </label>
      </div>

      {error && <p className="text-risk">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={buttonVariants({ variant: 'glass', size: 'xs' })}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className={buttonVariants({ variant: 'default', size: 'xs' })}
        >
          {submitting ? 'Adding…' : 'Add repository'}
        </button>
      </div>
    </form>
  );
}

function CreateRoomForm({
  projectId,
  identities,
  onSubmit,
  onCancel,
}: {
  projectId: string;
  identities: Identity[];
  onSubmit: (input: CreateRoomInput, initialMemberIds: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState('');
  const [kind, setKind] = React.useState<'project' | 'squad' | 'adhoc'>('project');
  const [selectedMembers, setSelectedMembers] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(
        { name: name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'), projectId, kind },
        selectedMembers
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel flex flex-col gap-3 rounded-lg p-3 text-xs">
      <span className="font-semibold text-foreground">Create room bound to this project</span>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-muted-foreground">
          Room name *
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass-panel h-8 rounded px-2 text-xs outline-none"
            placeholder="e.g. auth-refactor"
          />
        </label>
        <label className="flex flex-col gap-1 text-muted-foreground">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'project' | 'squad' | 'adhoc')}
            className="glass-panel h-8 rounded px-2 text-xs outline-none"
          >
            <option value="project">Project (default #project)</option>
            <option value="squad">Squad</option>
            <option value="adhoc">Ad-hoc</option>
          </select>
        </label>
      </div>

      {identities.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-muted-foreground">Assign initial coworkers:</span>
          <div className="flex flex-wrap gap-1.5">
            {identities.map((i) => {
              const selected = selectedMembers.includes(i.id);
              return (
                <button
                  type="button"
                  key={i.id}
                  onClick={() => toggleMember(i.id)}
                  className={cn(
                    'glass-panel inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs transition-colors',
                    selected && 'glass-chosen ring-1 ring-foreground'
                  )}
                >
                  <Avatar who={i} size={14} />
                  <span>{i.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-risk">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={buttonVariants({ variant: 'glass', size: 'xs' })}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className={buttonVariants({ variant: 'default', size: 'xs' })}
        >
          {submitting ? 'Creating…' : 'Create room'}
        </button>
      </div>
    </form>
  );
}
