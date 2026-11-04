import * as React from 'react';
import { Activity, BookOpen, Briefcase, CalendarCheck, ChevronDown, ChevronRight, ClipboardCheck, Clock, FolderGit2, Gauge, Hash, Inbox, Kanban, LayoutDashboard, MessageSquare, Palette, RefreshCw, Scale, Search, Settings, Target, Terminal, Users, Workflow } from 'lucide-react';
import type { Identity, JobSummary, Room, Session } from '@runtime/types';
import { Avatar, OwnerAvatar } from '@/components/app/avatar';
import { CommandPalette } from '@/components/app/command-palette';
import { Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href, type Route } from '@/lib/route';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

export type Mode = 'work' | 'dev';

function NavLink({ to, active, icon, children, trailing }: { to: Route; active?: boolean; icon: React.ReactNode; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <a
      href={href(to)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-8 items-center justify-between gap-2.5 rounded-lg px-2.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground',
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
  ownerName,
  ownerId = 'winston',
  rooms,
  jobs,
  identities,
  sessions,
}: {
  route: Route;
  ownerName: string;
  ownerId?: string;
  rooms: Room[];
  jobs: JobSummary[];
  identities: Identity[];
  sessions: Session[];
}) {
  const [openPalette, setOpenPalette] = React.useState(false);
  const [roomsOpen, setRoomsOpen] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('myaos.sidebar.roomsOpen') !== 'false';
    } catch {
      return true;
    }
  });
  const [coworkersOpen, setCoworkersOpen] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('myaos.sidebar.coworkersOpen') !== 'false';
    } catch {
      return true;
    }
  });
  const toggleRooms = () => {
    setRoomsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('myaos.sidebar.roomsOpen', String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const toggleCoworkers = () => {
    setCoworkersOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('myaos.sidebar.coworkersOpen', String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const needsYouFeed = useRuntimeData((c) => c.needsYou(), []);
  // The aggregate /v1/needs-you list is the source of truth; fall back to the job summaries until it loads.
  const needsYou =
    needsYouFeed.status === 'ready' ? needsYouFeed.data.length : jobs.filter((j) => j.pendingApprovals > 0 || j.stage === 'approve').length;
  const rateLimitedCount = identities.filter((i) => i.statusState === 'rate_limited').length;
  const activeJobs = jobs.filter((j) => !['done', 'cancelled'].includes(j.stage)).length;
  const liveAgents = new Set(sessions.filter(isLive).map((s) => s.agentId));
  const liveSessions = sessions.filter(isLive);
  const verifyQueue = jobs.filter((j) => j.stage === 'verify' || j.stage === 'approve').length;

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpenPalette((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <nav aria-label="Workspace" className="flex h-full max-h-full w-full flex-col gap-4 overflow-y-auto px-1.5 py-2.5 md:w-64 md:shrink-0">
      <div className="flex items-center gap-2.5 px-1.5">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-background">M</span>
        <span className="text-[15px] font-semibold">MyaOS</span>
      </div>

      <button
        type="button"
        onClick={() => setOpenPalette(true)}
        title="Search across MyaOS (⌘K)"
        className={cn(buttonVariants({ variant: 'glass' }), 'w-full justify-between text-muted-foreground hover:text-foreground cursor-pointer')}
      >
        <span className="flex items-center gap-2">
          <Search className="size-4" />
          Search
        </span>
        <span className="font-mono text-xs">⌘K</span>
      </button>

      <div className="flex flex-col gap-0.5" role="group" aria-label="Core navigation">
        <NavLink to={{ name: 'home' }} active={route.name === 'home'} icon={<LayoutDashboard />}>
          Executive Home
        </NavLink>
        <NavLink to={{ name: 'jobs' }} active={route.name === 'jobs' || route.name === 'job'} icon={<Briefcase />} trailing={activeJobs > 0 ? <span className="text-xs text-muted-foreground">{activeJobs}</span> : undefined}>
          Workflows
        </NavLink>
        <NavLink to={{ name: 'coworkers' }} active={route.name === 'coworkers'} icon={<Users />} trailing={rateLimitedCount > 0 ? <Tag tone="risk">{rateLimitedCount} paused</Tag> : undefined}>
          Coworkers
        </NavLink>
        <NavLink to={{ name: 'planning' }} active={route.name === 'planning' || route.name === 'council' || route.name === 'verdict'} icon={<Scale />}>
          Planning Council
        </NavLink>
        <NavLink to={{ name: 'projects' }} active={route.name === 'projects'} icon={<Kanban />}>
          Projects
        </NavLink>
        <NavLink to={{ name: 'communication' }} active={route.name === 'communication'} icon={<MessageSquare />}>
          Communications
        </NavLink>
        <NavLink to={{ name: 'standups' }} active={route.name === 'standups'} icon={<CalendarCheck />}>
          Stand-ups
        </NavLink>
        <NavLink to={{ name: 'design-studio' }} active={route.name === 'design-studio'} icon={<Palette />}>
          Design Studio
        </NavLink>
        <NavLink to={{ name: 'okrs' }} active={route.name === 'okrs'} icon={<Target />}>
          Strategy &amp; OKRs
        </NavLink>
        <NavLink to={{ name: 'skills' }} active={route.name === 'skills'} icon={<BookOpen />}>
          Skills &amp; Knowledge
        </NavLink>
        <NavLink to={{ name: 'time' }} active={route.name === 'time'} icon={<Clock />}>
          Time &amp; Productivity
        </NavLink>
        <NavLink to={{ name: 'ai' }} active={route.name === 'ai'} icon={<Gauge />}>
          AI Resources &amp; Usage
        </NavLink>
        <NavLink to={{ name: 'qa' }} active={route.name === 'qa'} icon={<ClipboardCheck />} trailing={verifyQueue > 0 ? <span className="text-xs text-muted-foreground">{verifyQueue}</span> : undefined}>
          QA &amp; Verification
        </NavLink>
        <NavLink to={{ name: 'dev' }} active={route.name === 'dev'} icon={<Terminal />} trailing={liveSessions.length > 0 ? <Tag tone="observed">{liveSessions.length} live</Tag> : undefined}>
          Engineering Cockpit
        </NavLink>
        <NavLink to={{ name: 'health' }} active={route.name === 'health'} icon={<Activity />}>
          Runtime &amp; Health
        </NavLink>
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border/50 pt-2" role="group" aria-label="More">
        <NavLink to={{ name: 'approvals' }} active={route.name === 'approvals'} icon={<Inbox />} trailing={needsYou > 0 ? <Tag tone="needs-you">{needsYou}</Tag> : undefined}>
          Needs you
        </NavLink>
        <NavLink to={{ name: 'team' }} active={route.name === 'team'} icon={<Workflow />}>
          Team &amp; Org
        </NavLink>
        <NavLink to={{ name: 'workspaces' }} active={route.name === 'workspaces'} icon={<FolderGit2 />}>
          Workspaces
        </NavLink>
        <NavLink to={{ name: 'settings' }} active={route.name === 'settings'} icon={<Settings />}>
          Settings
        </NavLink>
      </div>

      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={toggleRooms}
          aria-expanded={roomsOpen}
          className="flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <span className="flex items-center gap-1.5">
            {roomsOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            <span>Rooms</span>
          </span>
          <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {rooms.length}
          </span>
        </button>
        {roomsOpen && (
          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto pr-0.5">
            {rooms.length === 0 && <p className="px-2.5 py-1 text-xs text-muted-foreground">No rooms yet. Start a job from Home to make one.</p>}
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
        )}
      </div>

      {identities.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={toggleCoworkers}
            aria-expanded={coworkersOpen}
            className="flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              {coworkersOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <span>Coworkers</span>
            </span>
            <span className="flex items-center gap-1.5">
              {liveAgents.size > 0 && <span className="text-[10px] text-observed">{liveAgents.size} live</span>}
              <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {identities.length}
              </span>
            </span>
          </button>
          {coworkersOpen && (
            <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto pr-0.5">
              {identities.map((i) => (
                <NavLink
                  key={i.id}
                  to={{ name: 'coworkers' }}
                  icon={<Avatar who={i} size={22} dot={liveAgents.has(i.id) ? 'var(--observed)' : i.statusState === 'rate_limited' ? 'var(--risk)' : undefined} />}
                  trailing={<span className="text-xs text-muted-foreground">{liveAgents.has(i.id) ? 'Live' : i.statusState === 'rate_limited' ? 'Paused' : 'Offline'}</span>}
                >
                  {i.name}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )}

      {openPalette && (
        <CommandPalette
          ownerId={ownerId}
          rooms={rooms}
          jobs={jobs}
          identities={identities}
          sessions={sessions}
          onClose={() => setOpenPalette(false)}
        />
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
