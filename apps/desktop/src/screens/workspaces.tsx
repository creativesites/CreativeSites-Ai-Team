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
  GitCompare,
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
  CheckCircle2,
  Eye,
  X,
} from 'lucide-react';
import type {
  AttachProjectInput,
  CloneProjectInput,
  CreateProjectFolderInput,
  CreateRepoInput,
  CreateRoomInput,
  DirectoryListing,
  GitBranchItem,
  GitCommitItem,
  GitDiffSummary,
  GitWorktreeItem,
  Identity,
  JobSummary,
  Project,
  ProjectFileContent,
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
  const [activeBrowseRoot, setActiveBrowseRoot] = React.useState<string | undefined>(undefined);

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
            {/* Git Worktrees & Sessions Section */}
            <GitWorktreesInspector
              projectId={project.id}
              sessions={sessions}
              jobs={jobs}
              identities={identities}
              activeBrowseRoot={activeBrowseRoot}
              onSelectWorktreeForFiles={(path) => setActiveBrowseRoot(path)}
            />

            {/* Project File Tree Browser */}
            <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Project Files
              </span>
              <ProjectFileBrowser
                projectId={project.id}
                rootPath={project.rootPath ?? undefined}
                activeRoot={activeBrowseRoot}
                onSelectRoot={setActiveBrowseRoot}
              />
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
  const [branches, setBranches] = React.useState<GitBranchItem[]>([]);
  const [selectedBranch, setSelectedBranch] = React.useState<string>(rootState?.branch || '');
  const [diffMode, setDiffMode] = React.useState<'working' | 'compare'>('working');
  const [commitLimit, setCommitLimit] = React.useState<number>(20);
  const [commits, setCommits] = React.useState<GitCommitItem[]>([]);
  const [diffSummary, setDiffSummary] = React.useState<GitDiffSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [copiedHash, setCopiedHash] = React.useState<string | null>(null);
  const [showUnifiedDiff, setShowUnifiedDiff] = React.useState(false);

  // 1. Fetch available branches
  const fetchBranches = React.useCallback(async () => {
    if (!client) return;
    try {
      const b = await client.projectBranches(projectId);
      setBranches(b);
      // Auto-select current branch if not yet set
      setSelectedBranch((prev) => {
        if (prev && b.some((branch) => branch.name === prev)) return prev;
        const current = b.find((branch) => branch.isCurrent);
        return current?.name || rootState?.branch || b[0]?.name || '';
      });
    } catch {
      setBranches([]);
    }
  }, [client, projectId, rootState?.branch]);

  // 2. Fetch commits & diff for selected branch and diff mode
  const fetchBranchGitData = React.useCallback(
    async (branch: string, mode: 'working' | 'compare', limit: number, isInitial = false) => {
      if (!client) return;
      if (isInitial) setLoading(true);
      else setRefreshing(true);

      try {
        const [c, d] = await Promise.all([
          client.projectCommits(projectId, limit, branch || undefined).catch(() => []),
          client
            .projectDiff(
              projectId,
              branch || undefined,
              mode === 'compare' ? 'main' : undefined,
              mode
            )
            .catch(() => ({ diff: '', files: [], truncated: false })),
        ]);
        setCommits(c);
        setDiffSummary(d);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client, projectId]
  );

  React.useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  React.useEffect(() => {
    if (selectedBranch || branches.length > 0) {
      fetchBranchGitData(selectedBranch, diffMode, commitLimit, loading);
    }
  }, [fetchBranchGitData, selectedBranch, diffMode, commitLimit]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBranches();
    await fetchBranchGitData(selectedBranch, diffMode, commitLimit, false);
    setRefreshing(false);
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);
  const currentBranchItem = branches.find((b) => b.name === selectedBranch);
  const isCurrentCheckedOut = currentBranchItem?.isCurrent ?? (selectedBranch === rootState?.branch);
  const changedFileCount = diffSummary?.files?.length ?? 0;
  const hasChangedFiles = changedFileCount > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
        <RefreshCw className="mr-2 size-4 animate-spin text-primary" />
        Inspecting Git branches, commits & diffs…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top Controls: Branch Selector, Comparison Mode & Actions */}
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-xs">
        {/* Branch Selector */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <GitBranch className="size-3.5 text-primary" />
            <span className="font-semibold text-foreground">Branch:</span>
          </div>

          <div className="relative">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              aria-label="Select git branch"
              className="appearance-none rounded border border-border/60 bg-background/80 py-1 pl-2.5 pr-8 font-mono text-xs text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {branches.length === 0 ? (
                <option value={selectedBranch || 'HEAD'}>{selectedBranch || 'HEAD'}</option>
              ) : (
                <>
                  {localBranches.length > 0 && (
                    <optgroup label="Local Branches">
                      {localBranches.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name} {b.isCurrent ? '(current)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {remoteBranches.length > 0 && (
                    <optgroup label="Remote Branches">
                      {remoteBranches.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>

          {isCurrentCheckedOut && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
              Checked Out
            </span>
          )}
        </div>

        {/* Diff Mode Switcher & Commit Limit & Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-md border border-border/40 bg-background/50 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setDiffMode('working')}
              className={cn(
                'rounded px-2.5 py-1 font-medium transition-colors',
                diffMode === 'working'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Working Changes
            </button>
            <button
              type="button"
              onClick={() => setDiffMode('compare')}
              className={cn(
                'rounded px-2.5 py-1 font-medium transition-colors flex items-center gap-1',
                diffMode === 'compare'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <GitCompare className="size-3" />
              Compare vs main
            </button>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
          >
            <RefreshCw className={cn('size-3', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Diff View Section */}
      <div className="glass-panel flex flex-col gap-2.5 rounded-lg p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider">
              {diffMode === 'working'
                ? isCurrentCheckedOut
                  ? 'Uncommitted Working Tree Changes'
                  : `Working Tree vs ${selectedBranch}`
                : `Branch Diff: ${selectedBranch} vs main`}
            </span>
            <span className="text-muted-foreground">·</span>
            {hasChangedFiles ? (
              <span className="font-medium text-amber-400">
                {changedFileCount} file{changedFileCount === 1 ? '' : 's'} changed
              </span>
            ) : (
              <span className="font-medium text-emerald-400">
                {diffMode === 'working' ? 'Working tree is clean' : 'No differences with main'}
              </span>
            )}
            {diffSummary?.truncated && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400 border border-amber-500/20">
                Truncated (256 KB)
              </span>
            )}
          </div>

          {hasChangedFiles && (
            <button
              type="button"
              onClick={() => setShowUnifiedDiff(!showUnifiedDiff)}
              className="text-foreground underline underline-offset-2 hover:opacity-80"
            >
              {showUnifiedDiff ? 'Hide diff' : 'Show unified diff'}
            </button>
          )}
        </div>

        {/* Changed Files Pill List */}
        {hasChangedFiles ? (
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
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
                    f.status === 'D' && 'text-rose-400',
                    f.status.startsWith('R') && 'text-cyan-400'
                  )}
                >
                  {f.status}
                </span>
                <span className="text-foreground/90">{f.path}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {diffMode === 'working'
              ? 'All files match the selected branch. No uncommitted modifications.'
              : `Branch "${selectedBranch}" is synchronized with main branch.`}
          </p>
        )}

        {/* Unified Diff Box */}
        {showUnifiedDiff && diffSummary?.diff && (
          <div className="mt-2 max-h-80 overflow-y-auto rounded bg-black/60 p-3 font-mono text-[11px] text-foreground leading-relaxed">
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

      {/* Commits List Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Commits on {selectedBranch || 'current branch'} ({commits.length})
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Show:</span>
            {[15, 30, 50].map((limit) => (
              <button
                key={limit}
                type="button"
                onClick={() => setCommitLimit(limit)}
                className={cn(
                  'rounded px-1.5 py-0.5 font-mono text-[10px]',
                  commitLimit === limit
                    ? 'bg-foreground/20 text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {limit}
              </button>
            ))}
          </div>
        </div>

        {commits.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {commits.map((commit) => (
              <div
                key={commit.hash}
                className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs hover:border-border/80 transition-colors"
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
                  <span className="font-medium text-foreground truncate" title={commit.subject}>
                    {commit.subject}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
                  <span className="font-medium text-foreground/80">{commit.author}</span>
                  <span>·</span>
                  <span>{commit.date ? new Date(commit.date).toLocaleDateString() : ''}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No commits recorded on this branch yet.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Git Worktrees Inspector

function GitWorktreesInspector({
  projectId,
  sessions,
  jobs,
  identities,
  activeBrowseRoot,
  onSelectWorktreeForFiles,
}: {
  projectId: string;
  sessions: Session[];
  jobs: JobSummary[];
  identities: Identity[];
  activeBrowseRoot?: string;
  onSelectWorktreeForFiles?: (worktreePath: string) => void;
}) {
  const { client, revision } = useRuntime();
  const [worktrees, setWorktrees] = React.useState<GitWorktreeItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [copiedPath, setCopiedPath] = React.useState<string | null>(null);

  const fetchWorktrees = React.useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const res = await client.projectWorktrees(projectId);
      setWorktrees(res);
    } catch {
      setWorktrees([]);
    } finally {
      setLoading(false);
    }
  }, [client, projectId]);

  React.useEffect(() => {
    fetchWorktrees();
  }, [fetchWorktrees, revision]);

  const copyPath = (p: string) => {
    navigator.clipboard.writeText(p);
    setCopiedPath(p);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Git Worktrees ({worktrees.length})
        </span>
        <button
          type="button"
          onClick={fetchWorktrees}
          className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
        >
          <RefreshCw className="size-3" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-6 text-xs text-muted-foreground">
          <RefreshCw className="mr-2 size-3 animate-spin" />
          Inspecting Git worktrees…
        </div>
      ) : worktrees.length === 0 ? (
        <div className="glass-panel rounded-lg p-3 text-xs text-muted-foreground">
          No git worktrees found for this project directory.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {worktrees.map((wt) => {
            const isCurrentlyBrowsing = activeBrowseRoot === wt.path;
            const matchingSession = sessions.find(
              (s) => s.worktree && (s.worktree === wt.path || wt.path.endsWith(s.worktree))
            );
            const agent = matchingSession ? identities.find((i) => i.id === matchingSession.agentId) : null;
            const job = matchingSession?.jobId ? jobs.find((j) => j.id === matchingSession.jobId) : null;

            return (
              <div
                key={wt.path}
                className={cn(
                  'glass-panel flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-xs transition-colors',
                  isCurrentlyBrowsing && 'ring-1 ring-cyan-500/50 bg-cyan-500/5'
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <GitBranch className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-foreground">{wt.branch}</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        wt.isMain
                          ? 'bg-foreground/15 text-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {wt.isMain ? 'Main' : 'Worktree'}
                    </span>
                    {wt.clean !== undefined && (
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                          wt.clean
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        )}
                      >
                        {wt.clean ? 'Clean' : 'Dirty'}
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-muted-foreground">({wt.shortHead})</span>
                    {agent && (
                      <div className="flex items-center gap-1 ml-2 rounded-full bg-background/60 px-2 py-0.5 border border-border/40">
                        <Avatar who={agent} size={14} />
                        <span className="text-[11px] font-medium">{agent.name}</span>
                        {job && <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">· {job.title}</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                    <span className="truncate">{wt.path}</span>
                    <button
                      type="button"
                      onClick={() => copyPath(wt.path)}
                      title="Copy full worktree path"
                      className="hover:text-foreground inline-flex items-center p-0.5 shrink-0"
                    >
                      {copiedPath === wt.path ? (
                        <Check className="size-2.5 text-emerald-400" />
                      ) : (
                        <Copy className="size-2.5 opacity-60" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onSelectWorktreeForFiles && (
                    <button
                      type="button"
                      onClick={() => onSelectWorktreeForFiles(wt.path)}
                      className={cn(
                        buttonVariants({ variant: isCurrentlyBrowsing ? 'default' : 'glass', size: 'xs' }),
                        'gap-1'
                      )}
                    >
                      <FolderTree className="size-3" />
                      {isCurrentlyBrowsing ? 'Viewing Files' : 'Browse Files'}
                    </button>
                  )}
                  {matchingSession && (
                    <a
                      href={href({ name: 'dev', jobId: matchingSession.jobId ?? undefined })}
                      className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
                    >
                      <Terminal className="size-3" />
                      Dev
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- File Viewer Modal

function FileViewerModal({
  projectId,
  filePath,
  activeRoot,
  onClose,
}: {
  projectId: string;
  filePath: string;
  activeRoot?: string;
  onClose: () => void;
}) {
  const { client } = useRuntime();
  const [data, setData] = React.useState<ProjectFileContent | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!client) return;
    setLoading(true);
    setError(null);
    client
      .projectFileContent(projectId, filePath, activeRoot)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [client, projectId, filePath, activeRoot]);

  const copyContent = () => {
    if (data?.content) {
      navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-panel flex flex-col gap-3 rounded-xl w-full max-w-4xl max-h-[85vh] p-5 shadow-2xl border border-border/60 bg-background/95">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileCode className="size-4 text-cyan-400 shrink-0" />
            <span className="font-semibold text-foreground text-sm truncate">{filePath}</span>
            {data && (
              <span className="text-[11px] text-muted-foreground font-mono">
                ({formatFileSize(data.size)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {data && !data.isBinary && (
              <button
                type="button"
                onClick={copyContent}
                className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
              >
                {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto rounded-lg border border-border/30 bg-black/75 p-3 font-mono text-xs text-foreground leading-relaxed">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <RefreshCw className="mr-2 size-4 animate-spin" />
              Loading file content…
            </div>
          ) : error ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-risk p-4 text-center">
              <AlertCircle className="size-5" />
              <span>Failed to load file: {error}</span>
            </div>
          ) : data?.isBinary ? (
            <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
              <File className="mb-2 size-8 opacity-40" />
              <span>(Binary file cannot be previewed as text)</span>
            </div>
          ) : (
            <div className="flex">
              {/* Line Numbers */}
              <div className="select-none pr-3 text-right text-muted-foreground/40 font-mono text-[11px] shrink-0 border-r border-border/30 mr-3">
                {data?.content.split('\n').map((_: string, idx: number) => (
                  <div key={idx}>{idx + 1}</div>
                ))}
              </div>
              {/* Code lines */}
              <pre className="flex-1 overflow-x-auto whitespace-pre font-mono text-[11px] text-foreground/90">
                {data?.content}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Project File Browser

function ProjectFileBrowser({
  projectId,
  rootPath,
  activeRoot,
  onSelectRoot,
}: {
  projectId: string;
  rootPath?: string;
  activeRoot?: string;
  onSelectRoot?: (root: string) => void;
}) {
  const { client } = useRuntime();
  const [currentPath, setCurrentPath] = React.useState('');
  const [files, setFiles] = React.useState<ProjectFileItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filterQuery, setFilterQuery] = React.useState('');
  const [viewingFile, setViewingFile] = React.useState<string | null>(null);

  const effectiveRoot = activeRoot || rootPath;

  const loadFiles = React.useCallback(
    async (dirPath: string) => {
      if (!client) return;
      setLoading(true);
      try {
        const res = await client.projectFiles(projectId, dirPath, 150, effectiveRoot);
        setFiles(res);
      } catch {
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [client, projectId, effectiveRoot]
  );

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
      {/* Root Location Indicator & Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-2">
        <div className="flex flex-wrap items-center gap-1 font-mono text-[11px] overflow-x-auto max-w-[70%]">
          {activeRoot && onSelectRoot && (
            <button
              type="button"
              onClick={() => onSelectRoot(rootPath || '')}
              className="mr-1 inline-flex items-center gap-1 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400 hover:bg-cyan-500/20"
              title="Reset to main project root"
            >
              <span>Worktree Target</span>
              <span>✕</span>
            </button>
          )}

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
              className="flex items-center justify-between py-1.5 px-1 hover:bg-foreground/5 rounded transition-colors group"
            >
              <div className="flex min-w-0 items-center gap-2 flex-1">
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
                    className="font-semibold text-foreground hover:underline truncate text-left"
                  >
                    {file.name}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setViewingFile(file.path)}
                    className="font-mono text-muted-foreground hover:text-foreground hover:underline truncate text-left"
                  >
                    {file.name}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!file.isDirectory && (
                  <button
                    type="button"
                    onClick={() => setViewingFile(file.path)}
                    title="View file content"
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-foreground text-muted-foreground transition-opacity"
                  >
                    <Eye className="size-3.5" />
                  </button>
                )}
                <span className="font-mono text-[11px] text-muted-foreground/70">
                  {file.isDirectory ? 'dir' : formatFileSize(file.size)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File Viewer Modal */}
      {viewingFile && (
        <FileViewerModal
          projectId={projectId}
          filePath={viewingFile}
          activeRoot={effectiveRoot}
          onClose={() => setViewingFile(null)}
        />
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

// In-App Interactive Directory Navigator Modal
function DirectoryPickerModal({
  initialPath,
  onSelect,
  onClose,
}: {
  initialPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const { client } = useRuntime();
  const [currentPath, setCurrentPath] = React.useState(initialPath || '~');
  const [listing, setListing] = React.useState<DirectoryListing | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [filterQuery, setFilterQuery] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const fetchDirectories = React.useCallback(
    async (dir: string) => {
      if (!client) return;
      setLoading(true);
      setError(null);
      try {
        const res = await client.systemDirectories(dir);
        setListing(res);
        setCurrentPath(res.current);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  React.useEffect(() => {
    fetchDirectories(currentPath);
  }, []);

  const navigateTo = (dir: string) => {
    setFilterQuery('');
    fetchDirectories(dir);
  };

  const handleSelectCurrent = () => {
    if (listing?.current) {
      onSelect(listing.current);
      onClose();
    }
  };

  const handleSelectSub = (subPath: string) => {
    onSelect(subPath);
    onClose();
  };

  const shortcuts = [
    { label: 'Home (~)', path: '~' },
    { label: 'WebstormProjects', path: '~/WebstormProjects' },
    { label: 'Projects', path: '~/Projects' },
    { label: 'Desktop', path: '~/Desktop' },
    { label: 'Documents', path: '~/Documents' },
    { label: '/tmp', path: '/tmp' },
  ];

  const filteredDirs = listing?.directories.filter((d) =>
    filterQuery ? d.name.toLowerCase().includes(filterQuery.toLowerCase()) : true
  );

  const pathParts = listing?.current ? listing.current.split('/').filter(Boolean) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-panel flex flex-col gap-3 rounded-xl w-full max-w-2xl max-h-[85vh] p-5 shadow-2xl border border-border/60 bg-background/95">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-3">
          <div className="flex flex-col">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <FolderOpen className="size-4 text-amber-400" />
              Select Workspace Directory
            </h3>
            <p className="text-xs text-muted-foreground">
              Browse folders on your computer and select a workspace or project root.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Shortcuts */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground font-medium">Quick jump:</span>
          {shortcuts.map((s) => (
            <button
              key={s.path}
              type="button"
              onClick={() => navigateTo(s.path)}
              className="rounded border border-border/50 bg-background/50 px-2 py-0.5 text-xs text-foreground/90 hover:bg-foreground/10 hover:text-foreground"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Breadcrumb Navigation & Filter */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border/30 py-2">
          <div className="flex flex-wrap items-center gap-1 font-mono text-xs overflow-x-auto max-w-[70%]">
            <button
              type="button"
              onClick={() => navigateTo('/')}
              className="hover:text-foreground text-muted-foreground"
            >
              /
            </button>
            {pathParts.map((part, idx) => {
              const sub = '/' + pathParts.slice(0, idx + 1).join('/');
              const isLast = idx === pathParts.length - 1;
              return (
                <React.Fragment key={sub}>
                  <span className="text-muted-foreground/60">/</span>
                  <button
                    type="button"
                    onClick={() => navigateTo(sub)}
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
            {listing?.parent && (
              <button
                type="button"
                onClick={() => navigateTo(listing.parent!)}
                className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'gap-1')}
              >
                <ArrowLeft className="size-3" />
                Up
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <input
                type="search"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter folders…"
                className="glass-panel h-7 w-36 rounded pl-7 pr-2 text-xs outline-none"
              />
            </div>
          </div>
        </div>

        {/* Directory Listing Body */}
        <div className="flex-1 overflow-y-auto min-h-[240px] max-h-[360px] rounded-lg border border-border/30 bg-background/40 p-2">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
              <RefreshCw className="mr-2 size-4 animate-spin" />
              Reading folders…
            </div>
          ) : error ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-xs text-risk p-4 text-center">
              <AlertCircle className="size-5" />
              <span>Failed to read directory: {error}</span>
              <button
                type="button"
                onClick={() => navigateTo('~')}
                className="mt-1 text-foreground underline"
              >
                Return to Home
              </button>
            </div>
          ) : !filteredDirs || filteredDirs.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-xs text-muted-foreground">
              <Folder className="mb-2 size-6 opacity-40" />
              <span>{listing?.directories.length === 0 ? 'No subfolders in this directory.' : 'No folders match your filter.'}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredDirs.map((dir) => (
                <div
                  key={dir.path}
                  className="flex items-center justify-between rounded-lg p-2 hover:bg-foreground/5 transition-colors group"
                >
                  <button
                    type="button"
                    onClick={() => navigateTo(dir.path)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <Folder className="size-4 text-amber-400 shrink-0" />
                    <span className="font-medium text-xs text-foreground group-hover:underline truncate">
                      {dir.name}
                    </span>
                    {dir.isGit && (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                        <GitBranch className="size-2.5" />
                        Git
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectSub(dir.path)}
                    className={cn(buttonVariants({ variant: 'glass', size: 'xs' }), 'opacity-80 hover:opacity-100')}
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
            <span className="text-muted-foreground shrink-0">Current:</span>
            <span className="font-mono text-foreground truncate">{listing?.current ?? currentPath}</span>
            {listing?.isGit && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 shrink-0">
                <GitBranch className="size-2.5" />
                Git Repo
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={buttonVariants({ variant: 'glass', size: 'sm' })}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSelectCurrent}
              disabled={!listing?.exists}
              className={buttonVariants({ variant: 'default', size: 'sm' })}
            >
              Select This Directory
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Native OS & Browser Folder Path Input with Presets & Live Validation
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
  const { client } = useRuntime();
  const [showBrowserModal, setShowBrowserModal] = React.useState(false);
  const [isPickingOS, setIsPickingOS] = React.useState(false);
  const [validation, setValidation] = React.useState<{ exists: boolean; isGit: boolean } | null>(null);

  const presets = [
    { label: '~', path: '~' },
    { label: '~/Projects', path: '~/Projects' },
    { label: '~/WebstormProjects', path: '~/WebstormProjects' },
    { label: '~/Desktop', path: '~/Desktop' },
    { label: '/tmp', path: '/tmp' },
  ];

  // Validate directory live as user types or picks
  React.useEffect(() => {
    if (!client || !value.trim()) {
      setValidation(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      client
        .systemDirectories(value.trim())
        .then((res) => {
          if (!cancelled) setValidation({ exists: res.exists, isGit: res.isGit });
        })
        .catch(() => {
          if (!cancelled) setValidation(null);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, value]);

  const handlePickNativeOS = async () => {
    if (!client) return;
    setIsPickingOS(true);
    try {
      const res = await client.pickFolder(value.trim() || undefined);
      if (res.path) {
        onChange(res.path);
      }
    } catch (err) {
      console.error('Failed to trigger OS folder picker:', err);
    } finally {
      setIsPickingOS(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, 'flex-1 font-mono text-xs')}
          placeholder={placeholder ?? '/Users/username/Projects/my-app'}
        />

        {/* Native OS Folder Dialog Button */}
        <button
          type="button"
          disabled={isPickingOS}
          onClick={handlePickNativeOS}
          title="Open native OS Finder folder picker dialog"
          className={cn(
            buttonVariants({ variant: 'glass', size: 'sm' }),
            'shrink-0 gap-1.5 text-xs font-medium'
          )}
        >
          {isPickingOS ? (
            <RefreshCw className="size-3.5 animate-spin" />
          ) : (
            <FolderOpen className="size-3.5 text-amber-400" />
          )}
          <span>{isPickingOS ? 'Selecting…' : 'OS Dialog'}</span>
        </button>

        {/* In-App Browser Modal Button */}
        <button
          type="button"
          onClick={() => setShowBrowserModal(true)}
          title="Browse directories in interactive browser"
          className={cn(
            buttonVariants({ variant: 'glass', size: 'sm' }),
            'shrink-0 gap-1.5 text-xs font-medium'
          )}
        >
          <FolderTree className="size-3.5 text-cyan-400" />
          <span>Browse Tree…</span>
        </button>
      </div>

      {/* Presets & Live Validation Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-1.5">
          <span>Presets:</span>
          {presets.map((p) => (
            <button
              key={p.path}
              type="button"
              onClick={() => onChange(p.path)}
              className="rounded border border-border/50 bg-background/50 px-1.5 py-0.5 hover:bg-accent hover:text-accent-foreground font-mono"
            >
              {p.label}
            </button>
          ))}
        </div>

        {validation && (
          <div className="flex items-center gap-1 text-[11px]">
            {validation.exists ? (
              validation.isGit ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="size-3" />
                  Valid Git repo
                </span>
              ) : (
                <span className="flex items-center gap-1 text-foreground/80">
                  <CheckCircle2 className="size-3 text-muted-foreground" />
                  Directory exists
                </span>
              )
            ) : (
              <span className="text-amber-400/90">Directory does not exist yet</span>
            )}
          </div>
        )}
      </div>

      {/* Directory Browser Modal */}
      {showBrowserModal && (
        <DirectoryPickerModal
          initialPath={value || '~'}
          onSelect={(selectedPath) => onChange(selectedPath)}
          onClose={() => setShowBrowserModal(false)}
        />
      )}
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
