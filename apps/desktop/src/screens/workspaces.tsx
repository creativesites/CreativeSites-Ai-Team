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
} from 'lucide-react';
import type {
  AttachProjectInput,
  CloneProjectInput,
  CreateProjectFolderInput,
  CreateRepoInput,
  CreateRoomInput,
  Identity,
  Project,
  Repo,
  Room,
  RoomMember,
  Team,
  WorkspaceState,
} from '@runtime/types';
import { Avatar, OwnerAvatar } from '@/components/app/avatar';
import { EmptyState, SectionTitle, Tag } from '@/components/app/status';
import { WorkspaceStatusBadge } from '@/components/workspaces/workspace-status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData, type Loadable } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

export interface WorkspacesScreenProps {
  projects?: Project[];
  rooms?: Room[];
  teams?: Team[];
  identities?: Identity[];
  onAttachProject?: (input: AttachProjectInput) => Promise<void>;
  onCloneProject?: (input: CloneProjectInput) => Promise<void>;
  onCreateProjectFolder?: (input: CreateProjectFolderInput) => Promise<void>;
  onAddRepo?: (projectId: string, input: CreateRepoInput) => Promise<void>;
  onRemoveRepo?: (repoId: string) => Promise<void>;
  onCreateRoom?: (input: CreateRoomInput) => Promise<Room>;
  onAddRoomMember?: (roomId: string, memberId: string, kind?: 'human' | 'agent', role?: string) => Promise<void>;
}

type ActionTab = 'attach' | 'clone' | 'create' | null;

const list = <T,>(l: Loadable<T[]>): T[] => (l.status === 'ready' ? l.data : []);

export function WorkspacesScreen(props: WorkspacesScreenProps) {
  const { client, state: connectionState, revision } = useRuntime();

  // Load from context when props are not provided
  const runtimeProjects = useRuntimeData((c) => c.projects());
  const runtimeRooms = useRuntimeData((c) => c.rooms());
  const runtimeTeams = useRuntimeData((c) => c.teams());
  const runtimeIdentities = useRuntimeData((c) => c.identities());

  const projects = props.projects ?? list(runtimeProjects);
  const rooms = props.rooms ?? list(runtimeRooms);
  const teams = props.teams ?? list(runtimeTeams);
  const identities = props.identities ?? list(runtimeIdentities);

  const [activeTab, setActiveTab] = React.useState<ActionTab>(null);
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

  const isOffline = connectionState.status !== 'connected';
  const isLoading =
    props.projects === undefined && runtimeProjects.status === 'loading' && projects.length === 0;

  return (
    <div className="flex flex-col gap-6 py-2">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-muted-foreground">Workspaces & Project Roots</span>
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
        <section aria-label="Project action" className="bg-card flex flex-col gap-4 rounded-xl p-5 shadow-sm">
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

      {/* Projects display */}
      <main className="flex flex-col gap-5">
        {isLoading ? (
          <div className="bg-card flex items-center justify-center rounded-xl p-12 text-sm text-muted-foreground">
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
        ) : (
          <div className="flex flex-col gap-4">
            {projects.map((project) => {
              const statusData = projectStatuses[project.id];
              const isStatusLoading = loadingStatuses[project.id] ?? false;
              const projectRooms = rooms.filter((r) => r.projectId === project.id);
              const team = teams.find((t) => t.id === project.teamId);

              // Derive root workspace state from repo matching rootPath or first repo
              const primaryRepoState = statusData?.repos.find((r) => r.repo.path === project.rootPath)?.state ??
                statusData?.repos[0]?.state ?? null;

              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  team={team}
                  rootState={primaryRepoState}
                  isStatusLoading={isStatusLoading}
                  statusData={statusData}
                  rooms={projectRooms}
                  identities={identities}
                  onAddRepo={(input) => handleAddRepo(project.id, input)}
                  onRemoveRepo={(repoId) => handleRemoveRepo(project.id, repoId)}
                  onCreateRoom={handleCreateRoom}
                  onAddRoomMember={handleAddRoomMember}
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

function ProjectCard({
  project,
  team,
  rootState,
  isStatusLoading,
  statusData,
  rooms,
  identities,
  onAddRepo,
  onRemoveRepo,
  onCreateRoom,
  onAddRoomMember,
}: {
  project: Project;
  team?: Team;
  rootState?: WorkspaceState | null;
  isStatusLoading: boolean;
  statusData?: { project: Project; repos: { repo: Repo; state: WorkspaceState }[] };
  rooms: Room[];
  identities: Identity[];
  onAddRepo: (input: CreateRepoInput) => Promise<void>;
  onRemoveRepo: (repoId: string) => Promise<void>;
  onCreateRoom: (input: CreateRoomInput) => Promise<Room>;
  onAddRoomMember: (roomId: string, memberId: string, kind?: 'human' | 'agent', role?: string) => Promise<void>;
}) {
  const [showAddRepo, setShowAddRepo] = React.useState(false);
  const [showCreateRoom, setShowCreateRoom] = React.useState(false);
  const [expandedRoomId, setExpandedRoomId] = React.useState<string | null>(null);

  return (
    <article className="bg-card flex flex-col gap-4.5 rounded-xl p-5 shadow-sm">
      {/* Top row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{project.name}</h2>
            {team && <Tag tone="quiet">{team.name}</Tag>}
            <WorkspaceStatusBadge state={rootState} loading={isStatusLoading} />
          </div>
          {project.rootPath && (
            <span className="font-mono text-xs text-muted-foreground break-all">{project.rootPath}</span>
          )}
          {project.description && (
            <p className="text-xs text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{project.roomCount} room{project.roomCount === 1 ? '' : 's'}</span>
          <span>·</span>
          <span>{project.openJobCount} open job{project.openJobCount === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* Repositories section */}
      <div className="flex flex-col gap-2.5 border-t border-border/40 pt-3">
        <SectionTitle
          aside={
            <button
              type="button"
              onClick={() => setShowAddRepo(!showAddRepo)}
              className={cn(buttonVariants({ variant: 'glass', size: 'xs' }))}
            >
              <Plus className="size-3" />
              Add repo
            </button>
          }
        >
          Repositories ({project.repos?.length ?? 0})
        </SectionTitle>

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
                    <span className="font-medium">{repo.name}</span>
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

      {/* Rooms section */}
      <div className="flex flex-col gap-2.5 border-t border-border/40 pt-3">
        <SectionTitle
          aside={
            <button
              type="button"
              onClick={() => setShowCreateRoom(!showCreateRoom)}
              className={cn(buttonVariants({ variant: 'glass', size: 'xs' }))}
            >
              <Plus className="size-3" />
              Create room
            </button>
          }
        >
          Rooms ({rooms.length})
        </SectionTitle>

        {showCreateRoom && (
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
        )}

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
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        Open <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </div>

                  {/* Room members dropdown */}
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
          <p className="text-xs text-muted-foreground">No rooms bound to this project yet.</p>
        )}
      </div>
    </article>
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
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Folder path *
          <input
            required
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className={inputClass}
            placeholder="/Users/username/Projects/my-app"
          />
        </label>
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
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Parent folder (optional)
          <input
            value={parentDir}
            onChange={(e) => setParentDir(e.target.value)}
            className={inputClass}
            placeholder="Defaults to standard clone parent directory"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Target folder name (optional)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Defaults to repository name"
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
        <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">
          Directory path *
          <input
            required
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className={inputClass}
            placeholder="/Users/username/Projects/new-service"
          />
        </label>
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
      <span className="font-medium text-foreground">Attach repository to this project</span>
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
      await onSubmit({ name: name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'), projectId, kind }, selectedMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel flex flex-col gap-3 rounded-lg p-3 text-xs">
      <span className="font-medium text-foreground">Create room bound to this project</span>
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
