import * as React from 'react';
import type { JobStage, Room } from '@runtime/types';
import { EmptyState, jobLabel, StageBar, Tag } from '@/components/app/status';
import { href } from '@/lib/route';
import { useRuntimeData } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

const STAGES: (JobStage | '')[] = ['', 'brief', 'plan', 'build', 'verify', 'approve', 'done', 'cancelled'];

export function JobsScreen() {
  const jobs = useRuntimeData((c) => c.jobsFiltered({ limit: 500 }), []);
  const rooms = useRuntimeData((c) => c.rooms(), []);
  const [query, setQuery] = React.useState('');
  const [stage, setStage] = React.useState<JobStage | ''>('');
  const roomName = (roomId: string) => (rooms.status === 'ready' ? rooms.data.find((r: Room) => r.id === roomId)?.name : undefined) ?? 'unknown room';
  const all = jobs.status === 'ready' ? jobs.data : [];
  const filtered = all.filter((j) => {
    if (stage && j.stage !== stage) return false;
    if (!query.trim()) return true;
    return `${j.title} ${jobLabel(j.number)} ${roomName(j.roomId)}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-muted-foreground">One list of every job; the room is where the conversation lives</span>
          <h1 className="text-lg font-semibold">Jobs</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs, rooms, JOB-142"
            aria-label="Search jobs"
            className="glass-panel h-9 w-64 rounded-md px-2.5 text-sm outline-none"
          />
          <select value={stage} onChange={(e) => setStage(e.target.value as JobStage | '')} aria-label="Filter by stage" className="glass-panel h-9 rounded-md px-2 text-sm">
            {STAGES.map((s) => (
              <option key={s || 'all'} value={s}>{s ? s[0]!.toUpperCase() + s.slice(1) : 'All stages'}</option>
            ))}
          </select>
        </div>
      </header>

      {jobs.status !== 'ready' ? (
        <EmptyState title="Waiting for the runtime">Jobs load when the runtime is reachable.</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title={all.length ? 'No job matches' : 'No jobs yet'}>
          {all.length ? 'Change the search or stage filter.' : 'Start one from Home; it becomes the unit of work.'}
        </EmptyState>
      ) : (
        <section aria-label="All jobs" className="bg-card overflow-hidden rounded-xl">
          {filtered.map((j) => (
            <a
              key={j.id}
              href={href({ name: 'job', jobId: j.id })}
              className={cn(
                'flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0 hover:bg-foreground/[0.03]',
                j.pendingApprovals > 0 && 'border-l-2 border-l-needs-you/60'
              )}
            >
              <span className="w-16 font-mono text-xs text-muted-foreground">{jobLabel(j.number)}</span>
              <span className="min-w-0 flex-1 basis-56 truncate text-sm">{j.title}</span>
              <span className="w-32 truncate text-xs text-muted-foreground">#{roomName(j.roomId)}</span>
              <StageBar stage={j.stage} compact className="w-32" />
              {j.pendingApprovals > 0 ? <Tag tone="needs-you">Needs you</Tag> : <Tag tone="quiet">{j.costCents ?? 0}¢</Tag>}
              <span className="w-24 text-right text-[11px] text-muted-foreground">{new Date(j.updatedAt).toLocaleDateString()}</span>
            </a>
          ))}
        </section>
      )}
    </div>
  );
}
