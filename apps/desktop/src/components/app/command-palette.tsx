import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  Crown,
  Hash,
  MessageSquare,
  PlusCircle,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import type { Identity, JobSummary, Room, SearchHit, SearchKind, Session } from '@runtime/types';
import { Avatar } from '@/components/app/avatar';
import type { Mode } from '@/components/app/shell';
import { href, type Route } from '@/lib/route';
import { useRuntime } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

const SEARCH_DELAY_MS = 150;
const JUMP_LIMIT = 5;

/** Where a search hit leads. A session dev view opens with the job if attached, or the general dev screen. */
function routeFor(hit: SearchHit): Route {
  switch (hit.kind) {
    case 'room':
      return { name: 'room', roomId: hit.id };
    case 'job':
      return { name: 'job', jobId: hit.id };
    case 'message':
      return hit.roomId ? { name: 'room', roomId: hit.roomId } : { name: 'home' };
    case 'identity':
      return { name: 'coworkers' };
    case 'session':
      return hit.jobId ? { name: 'dev', jobId: hit.jobId } : { name: 'dev' };
    case 'evidence':
      return hit.jobId ? { name: 'job', jobId: hit.jobId } : { name: 'home' };
  }
}

const KIND_GROUP: Record<SearchKind, { label: string; icon: React.ReactNode }> = {
  job: { label: 'Jobs', icon: <Briefcase /> },
  room: { label: 'Rooms', icon: <Hash /> },
  message: { label: 'Messages', icon: <MessageSquare /> },
  identity: { label: 'Coworkers', icon: <Users /> },
  session: { label: 'Sessions', icon: <Terminal /> },
  evidence: { label: 'Evidence', icon: <ShieldCheck /> },
};

type Pending =
  | { action: 'wake'; agent: Identity | null }
  | { action: 'leader' }
  | { action: 'new_job' }
  | { action: 'council' };

interface Item {
  key: string;
  group: string;
  label: string;
  detail: string | null;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette({
  ownerId,
  rooms,
  jobs,
  identities,
  sessions = [],
  mode,
  onModeChange,
  onClose,
}: {
  ownerId: string;
  rooms: Room[];
  jobs: JobSummary[];
  identities: Identity[];
  sessions?: Session[];
  mode?: Mode;
  onModeChange?: (m: Mode) => void;
  onClose: () => void;
}) {
  const { client } = useRuntime();
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const q = query.trim();
  const qLower = q.toLowerCase();
  const agents = React.useMemo(() => identities.filter((i) => i.id !== ownerId), [identities, ownerId]);

  // Return focus to whatever had it before the palette opened.
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus?.();
  }, []);

  // Search the runtime as the owner types. Stale answers are dropped.
  React.useEffect(() => {
    if (pending || !client) return;
    if (!q) {
      setHits([]);
      setSearching(false);
      return;
    }
    let stale = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      client.search(q).then(
        (found) => {
          if (stale) return;
          setHits(found);
          setSearching(false);
        },
        () => {
          if (stale) return;
          setHits([]);
          setSearching(false);
        }
      );
    }, SEARCH_DELAY_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [client, q, pending]);

  const items = React.useMemo<Item[]>(() => {
    const go = (route: Route) => () => {
      window.location.hash = href(route);
      onClose();
    };

    const startWake = () => {
      setPending({ action: 'wake', agent: null });
      setQuery('');
      setIndex(0);
    };

    const startLeader = () => {
      setPending({ action: 'leader' });
      setQuery('');
      setIndex(0);
    };

    const startNewJob = () => {
      setPending({ action: 'new_job' });
      setQuery('');
      setIndex(0);
    };

    const startCouncil = () => {
      if (jobs.length === 1 && jobs[0]) {
        go({ name: 'council', jobId: jobs[0].id })();
      } else {
        setPending({ action: 'council' });
        setQuery('');
        setIndex(0);
      }
    };

    const toggleMode = () => {
      if (onModeChange && mode) {
        onModeChange(mode === 'work' ? 'dev' : 'work');
      }
      onClose();
    };

    if (pending?.action === 'wake' && !pending.agent) {
      return agents
        .filter((i) => [i.name, i.id, i.role ?? '', i.runtime ?? ''].join(' ').toLowerCase().includes(qLower))
        .map((i) => ({
          key: `agent-${i.id}`,
          group: 'Wake which coworker?',
          label: i.name,
          detail: i.role ?? i.runtime ?? null,
          icon: <Avatar who={i} size={20} />,
          run: () => {
            setPending({ action: 'wake', agent: i });
            setQuery('');
            setIndex(0);
          },
        }));
    }

    if (pending?.action === 'council') {
      return jobs
        .filter((j) => [j.title, j.stage, `#${j.number}`].join(' ').toLowerCase().includes(qLower))
        .map((j) => ({
          key: `council-job-${j.id}`,
          group: 'Run council on which job?',
          label: `#${j.number} ${j.title}`,
          detail: `Stage: ${j.stage}`,
          icon: <Scale />,
          run: go({ name: 'council', jobId: j.id }),
        }));
    }

    // Instruction steps: the input holds the prompt or brief, so there is no item list.
    if (pending) return [];

    const out: Item[] = [];
    const actions: Item[] = [
      {
        key: 'action-wake',
        group: 'Quick actions',
        label: 'Wake Agent…',
        detail: 'Give a coworker something to do now',
        icon: <Zap />,
        run: startWake,
      },
      {
        key: 'action-leader',
        group: 'Quick actions',
        label: 'Tell Team Leader…',
        detail: 'Hand the team leader a direction',
        icon: <Crown />,
        run: startLeader,
      },
      {
        key: 'action-new-job',
        group: 'Quick actions',
        label: 'New Job…',
        detail: 'Start a new job with a brief',
        icon: <PlusCircle />,
        run: startNewJob,
      },
      {
        key: 'action-council',
        group: 'Quick actions',
        label: 'Run Council…',
        detail: 'Convene the Roast Room council on a job',
        icon: <Scale />,
        run: startCouncil,
      },
      {
        key: 'jump-team-org',
        group: 'Navigation',
        label: 'Team & Org Chart',
        detail: 'Visual hierarchy, lane separation & governance',
        icon: <Workflow />,
        run: go({ name: 'team' }),
      },
      {
        key: 'action-toggle-mode',
        group: 'Quick actions',
        label: mode === 'work' ? 'Switch to Dev Mode' : 'Switch to Work Mode',
        detail: `Toggle mode (currently ${mode ?? 'work'})`,
        icon: <SlidersHorizontal />,
        run: toggleMode,
      },
    ];

    const keywords: Record<string, string> = {
      'action-wake': 'wake agent resume ping start coworker prompt',
      'action-leader': 'tell team leader dispatch direct command instructions',
      'action-new-job': 'new job create start task issue brief work',
      'action-council': 'run council roast room convene deliberate review evaluate',
      'jump-team-org': 'team org organization chart hierarchy governance lanes audit',
      'action-toggle-mode': 'toggle work dev mode developer switch view',
    };

    for (const a of actions) {
      if (!q || `${a.label} ${keywords[a.key]}`.toLowerCase().includes(qLower)) out.push(a);
    }

    if (!q) {
      for (const r of rooms.slice(0, JUMP_LIMIT)) {
        out.push({
          key: `room-${r.id}`,
          group: 'Jump to Room',
          label: r.name,
          detail: r.openJobCount ? `${r.openJobCount} open` : null,
          icon: <Hash />,
          run: go({ name: 'room', roomId: r.id }),
        });
      }
      for (const j of jobs.slice(0, JUMP_LIMIT)) {
        out.push({
          key: `job-${j.id}`,
          group: 'Jump to Job',
          label: j.title,
          detail: `#${j.number} · ${j.stage}`,
          icon: <Briefcase />,
          run: go({ name: 'job', jobId: j.id }),
        });
      }
      for (const a of agents.slice(0, JUMP_LIMIT)) {
        out.push({
          key: `coworker-${a.id}`,
          group: 'Jump to Coworker',
          label: a.name,
          detail: a.role ?? a.runtime ?? null,
          icon: <Avatar who={a} size={20} />,
          run: go({ name: 'coworkers' }),
        });
      }
      for (const s of sessions.slice(0, JUMP_LIMIT)) {
        out.push({
          key: `session-${s.id}`,
          group: 'Jump to Session',
          label: `${s.agentId} session`,
          detail: `${s.state} · ${s.runtimeCommand}`,
          icon: <Terminal />,
          run: go(s.jobId ? { name: 'dev', jobId: s.jobId } : { name: 'dev' }),
        });
      }
    }

    for (const hit of hits) {
      out.push({
        key: `${hit.kind}-${hit.id}`,
        group: KIND_GROUP[hit.kind]?.label ?? hit.kind,
        label: hit.title,
        detail: hit.detail,
        icon: KIND_GROUP[hit.kind]?.icon ?? <Search />,
        run: go(routeFor(hit)),
      });
    }

    return out;
  }, [pending, q, qLower, hits, rooms, jobs, agents, sessions, mode, onModeChange, onClose]);

  const active = items.length ? Math.min(index, items.length - 1) : 0;
  const instructing =
    pending !== null &&
    (pending.action === 'leader' || pending.action === 'new_job' || (pending.action === 'wake' && pending.agent !== null));

  // Keep the highlighted row in view when arrow keys move past the edge.
  React.useEffect(() => {
    document.getElementById(`cp-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const submit = async () => {
    const text = query.trim();
    if (!client || !pending || !text || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.action === 'leader') {
        await client.dispatchTeamLeader({ fromActorId: ownerId, directive: text });
        onClose();
      } else if (pending.action === 'wake' && pending.agent) {
        await client.wakeAgent(pending.agent.id, {
          targetAgentId: pending.agent.id,
          fromActorId: ownerId,
          fromActorKind: 'human',
          prompt: text,
          reason: 'Woken from the command palette',
        });
        onClose();
      } else if (pending.action === 'new_job') {
        const roomId = rooms[0]?.id ?? (await client.createRoom({ name: 'general' })).id;
        const first = text.split('\n')[0]!.split(/(?<=[.!?])\s/)[0]!.replace(/[.]$/, '');
        const title = first.length > 90 ? `${first.slice(0, 87)}…` : first;
        const job = await client.createJob({ roomId, title, brief: text, createdBy: ownerId });
        await client.postMessage(roomId, { authorId: ownerId, authorKind: 'human', body: text, jobId: job.id });
        window.location.hash = href({ name: 'job', jobId: job.id });
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const back = () => {
    if (pending?.action === 'wake' && pending.agent) {
      setPending({ action: 'wake', agent: null });
    } else {
      setPending(null);
    }
    setQuery('');
    setIndex(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex(items.length ? (active + 1) % items.length : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex(items.length ? (active - 1 + items.length) % items.length : 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (instructing) void submit();
      else items[active]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (pending) back();
      else onClose();
    }
  };

  const placeholder = !pending
    ? 'Search jobs, rooms, messages, coworkers, sessions, and evidence… (⌘K)'
    : pending.action === 'leader'
      ? 'Tell the team leader what to do next'
      : pending.action === 'new_job'
        ? 'What needs to be done? Enter a brief and press Enter'
        : pending.action === 'council'
          ? 'Which job? Type to filter'
          : pending.agent
            ? `Tell ${pending.agent.name} what to do`
            : 'Which coworker? Type to filter';

  const chip = pending
    ? pending.action === 'leader'
      ? 'Tell Team Leader'
      : pending.action === 'new_job'
        ? 'New Job'
        : pending.action === 'council'
          ? 'Run Council'
          : pending.agent
            ? `Wake ${pending.agent.name}`
            : 'Wake Agent'
    : null;

  const showEmpty = !pending && q !== '' && !searching && items.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/60 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="glass-panel flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          {chip && <span className="glass-chosen shrink-0 rounded-md px-2 py-0.5 text-xs font-medium">{chip}</span>}
          <input
            ref={inputRef}
            autoFocus
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={items.length && !instructing ? `cp-${active}` : undefined}
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            disabled={busy}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="shrink-0 font-mono text-xs text-muted-foreground">esc</span>
        </div>

        {error && (
          <p role="alert" className="border-b border-border px-3 py-2 text-xs text-risk">
            {error}
          </p>
        )}

        {instructing ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            {busy ? 'Sending…' : 'Press Enter to send. Esc goes back.'}
          </p>
        ) : (
          <ul id="command-palette-list" role="listbox" aria-label="Results" className="flex-1 overflow-y-auto p-1.5">
            {items.map((item, i) => (
              <React.Fragment key={item.key}>
                {item.group !== items[i - 1]?.group && (
                  <li role="presentation" className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                    {item.group}
                  </li>
                )}
                <li
                  id={`cp-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => item.run()}
                  className={cn(
                    'flex min-h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors',
                    i === active ? 'glass-chosen text-foreground font-medium' : 'text-foreground/80 hover:bg-foreground/[0.04]'
                  )}
                >
                  <span className="flex shrink-0 items-center text-muted-foreground [&_svg]:size-4">{item.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.detail && <span className="max-w-[40%] truncate text-xs text-muted-foreground">{item.detail}</span>}
                </li>
              </React.Fragment>
            ))}
            {showEmpty && <li className="px-2.5 py-3 text-sm text-muted-foreground">Nothing matches “{q}”.</li>}
            {!client && (
              <li className="px-2.5 py-3 text-sm text-muted-foreground">The runtime is not reachable, so search is unavailable.</li>
            )}
          </ul>
        )}
      </div>
    </div>,
    document.body
  );
}
