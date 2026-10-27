import * as React from 'react';
import { Briefcase, FolderGit2, Hash, Home, Inbox, RefreshCw, Search, Settings, ShieldCheck, Terminal, Users } from 'lucide-react';
import type { Identity, JobSummary, Room, Session } from '@runtime/types';
import { Avatar, OwnerAvatar } from '@/components/app/avatar';
import { Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href, type Route } from '@/lib/route';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

export type Mode = 'work' | 'dev';

export function useMode(): [Mode, (m: Mode) => void] {
  const [mode, setMode] = React.useState<Mode>(() => {
    try {
      return localStorage.getItem('myaos.mode') === 'dev' ? 'dev' : 'work';
    } catch {
      return 'work';
    }
  });
  const set = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem('myaos.mode', m);
    } catch {
      /* the mode just won't be remembered */
    }
  };
  return [mode, set];
}

function NavLink({ to, active, icon, children, trailing }: { to: Route; active?: boolean; icon: React.ReactNode; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <a
      href={href(to)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-9 items-center justify-between gap-2.5 rounded-lg px-2.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground',
        active && 'glass-chosen text-foreground'
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5 [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        <span className="truncate">{children}</span>
      </span>
      {trailing}
    </a>
  );
}

/** A session counts as live only while the runtime says it is running. */
export function isLive(s: Session) {
  return s.state === 'starting' || s.state === 'running' || s.state === 'idle';
}

export function Sidebar({
  route,
  mode,
  onModeChange,
  ownerName,
  rooms,
  jobs,
  identities,
  sessions,
}: {
  route: Route;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  ownerName: string;
  rooms: Room[];
  jobs: JobSummary[];
  identities: Identity[];
  sessions: Session[];
}) {
  const needsYou = jobs.filter((j) => j.pendingApprovals > 0).length;
  const liveAgents = new Set(sessions.filter(isLive).map((s) => s.agentId));
  const liveSessions = sessions.filter(isLive);

  return (
    <nav aria-label="Workspace" className="flex w-full flex-col gap-5 px-1.5 py-2.5 md:w-64 md:shrink-0">
      <div className="flex items-center justify-between px-1.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-background">M</span>
          <span className="text-[15px] font-semibold">MyaOS</span>
        </div>
        <div role="group" aria-label="Mode" className="glass-panel inline-flex rounded-lg p-0.5">
          {(['work', 'dev'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => onModeChange(m)}
              className={cn('rounded-md px-2.5 py-1 text-xs capitalize text-muted-foreground', mode === m && 'glass-chosen text-foreground')}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <button type="button" disabled title="Search arrives with Phase 1" className={cn(buttonVariants({ variant: 'glass' }), 'w-full justify-between text-muted-foreground')}>
        <span className="flex items-center gap-2">
          <Search className="size-4" />
          Search
        </span>
        <span className="font-mono text-xs">⌘K</span>
      </button>

      <div className="flex flex-col gap-0.5">
        <NavLink to={{ name: 'home' }} active={route.name === 'home'} icon={<Home />}>
          Home
        </NavLink>
        {mode === 'work' ? (
          <>
            <NavLink to={{ name: 'approvals' }} active={route.name === 'approvals'} icon={<Inbox />} trailing={needsYou > 0 ? <Tag tone="needs-you">{needsYou}</Tag> : undefined}>
              Needs you
            </NavLink>
            <NavLink to={{ name: 'jobs' }} active={route.name === 'jobs' || route.name === 'job'} icon={<Briefcase />}>
              Jobs
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to={{ name: 'dev' }} active={route.name === 'dev'} icon={<Terminal />} trailing={liveSessions.length > 0 ? <Tag tone="observed">{liveSessions.length} live</Tag> : undefined}>
              Sessions
            </NavLink>
            <NavLink to={{ name: 'dev' }} icon={<ShieldCheck />}>
              Evidence
            </NavLink>
          </>
        )}
        <NavLink to={{ name: 'coworkers' }} active={route.name === 'coworkers'} icon={<Users />}>
          Coworkers
        </NavLink>
        <NavLink to={{ name: 'workspaces' }} active={route.name === 'workspaces'} icon={<FolderGit2 />}>
          Workspaces
        </NavLink>
        <NavLink to={{ name: 'settings' }} active={route.name === 'settings'} icon={<Settings />}>
          Settings
        </NavLink>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 pb-1 text-xs text-muted-foreground">Rooms</div>
        {rooms.length === 0 && <p className="px-2.5 text-xs text-muted-foreground">No rooms yet. Start a job from Home to make one.</p>}
        {rooms.map((r) => (
          <NavLink
            key={r.id}
            to={{ name: 'room', roomId: r.id }}
            active={route.name === 'room' && route.roomId === r.id}
            icon={<Hash />}
            trailing={r.openJobCount > 0 ? <span className="text-xs text-muted-foreground">{r.openJobCount} open</span> : undefined}
          >
            {r.name}
          </NavLink>
        ))}
      </div>

      {identities.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1 text-xs text-muted-foreground">Coworkers</div>
          {identities.map((i) => (
            <NavLink
              key={i.id}
              to={{ name: 'coworkers' }}
              icon={<Avatar who={i} size={22} dot={liveAgents.has(i.id) ? 'var(--observed)' : undefined} />}
              trailing={<span className="text-xs text-muted-foreground">{liveAgents.has(i.id) ? 'Live' : 'Offline'}</span>}
            >
              {i.name}
            </NavLink>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2.5 px-2.5 py-2">
        <OwnerAvatar name={ownerName} />
        <div className="flex flex-col leading-tight">
          <span className="text-sm">{ownerName}</span>
          <span className="text-xs text-muted-foreground">Owner · approves consequential actions</span>
        </div>
      </div>
    </nav>
  );
}

/** Says, at the top of every screen, when the runtime cannot be reached. */
export function RuntimeBanner() {
  const { state, retry } = useRuntime();
  if (state.status === 'connected') return null;
  return (
    <div role="status" className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm', state.status === 'connecting' ? 'border-border text-muted-foreground' : 'border-risk/40 bg-risk/10 text-risk')}>
      <span>{state.status === 'connecting' ? 'Connecting to the MyaOS runtime…' : `Runtime not reachable: ${state.reason} Nothing below is live.`}</span>
      {state.status === 'unavailable' && (
        <button type="button" onClick={retry} className={cn(buttonVariants({ variant: 'glass', size: 'sm' }))}>
          <RefreshCw /> Try again
        </button>
      )}
    </div>
  );
}
