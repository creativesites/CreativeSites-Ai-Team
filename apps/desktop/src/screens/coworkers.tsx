import * as React from 'react';
import type { CreateIdentityInput, Identity, Session, UpdateIdentityInput } from '@runtime/types';
import { Avatar, AVATAR_COLORS, AVATAR_MARKS } from '@/components/app/avatar';
import { isLive } from '@/components/app/shell';
import { EmptyState, SectionTitle, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Agent runtimes the runtime will drive over ACP. Whether each is installed is
// checked in Phase 0.6, so until then this list says "Not checked".
const RUNTIMES = [
  { name: 'Claude Code', command: 'claude-agent-acp' },
  { name: 'Codex', command: 'codex-acp' },
  { name: 'Gemini CLI', command: 'gemini --experimental-acp' },
  { name: 'Custom agent', command: 'any command that speaks ACP over stdio' },
];

export function CoworkersScreen({
  identities,
  sessions,
  onCreate,
  onUpdate,
}: {
  identities: Identity[];
  sessions: Session[];
  onCreate?: (input: CreateIdentityInput) => Promise<void>;
  onUpdate?: (id: string, input: UpdateIdentityInput) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState<string | null>(identities[0]?.id ?? null);
  const [adding, setAdding] = React.useState(false);
  const current = identities.find((i) => i.id === editing) ?? null;
  const live = new Set(sessions.filter(isLive).map((s) => s.agentId));

  return (
    <div className="flex flex-col gap-4 py-2">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-muted-foreground">Same records in Work and Dev mode</span>
          <h1 className="text-lg font-semibold">Coworkers</h1>
        </div>
        <button type="button" disabled={!onCreate} onClick={() => setAdding(true)} className={buttonVariants({ variant: 'default' })}>
          Add coworker
        </button>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {adding && onCreate && <AddForm onCreate={async (i) => { await onCreate(i); setAdding(false); setEditing(i.id.toLowerCase()); }} onCancel={() => setAdding(false)} />}

          {identities.length === 0 && !adding ? (
            <EmptyState title="No coworkers yet">
              Add the agents you work with. Importing the existing team from community/agents.json arrives in Phase 2.
            </EmptyState>
          ) : (
            <section aria-label="Coworkers" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {identities.map((i) => (
                <button
                  type="button"
                  key={i.id}
                  onClick={() => setEditing(i.id)}
                  className={cn('bg-card flex flex-col gap-2.5 rounded-xl p-3.5 text-left', editing === i.id && 'ring-1 ring-foreground/30')}
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar who={i} size={44} />
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="font-semibold">{i.name}</span>
                      <span className="text-xs text-muted-foreground">{i.role ?? 'No role set'}</span>
                    </div>
                    <Tag tone={live.has(i.id) ? 'observed' : 'quiet'}>{live.has(i.id) ? 'Live' : 'Offline'}</Tag>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Runs on</span>
                    <span className="font-mono text-xs">{i.runtime ?? 'Not configured'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {i.seats.length === 0 ? <span className="text-xs text-muted-foreground">No council seats</span> : i.seats.map((s) => <Tag key={s}>{s}</Tag>)}
                  </div>
                </button>
              ))}
            </section>
          )}

          <section aria-label="Agent runtimes" className="bg-card flex flex-col gap-1 rounded-xl p-4.5">
            <SectionTitle aside="driven through the Agent Client Protocol">Agent runtimes on this Mac</SectionTitle>
            {RUNTIMES.map((r) => (
              <div key={r.name} className="flex flex-wrap items-center gap-3 border-t border-border/50 py-2.5 first:border-t-0">
                <span className="flex-1 basis-40 font-medium">{r.name}</span>
                <span className="flex-1 basis-52 font-mono text-xs text-muted-foreground">{r.command}</span>
                <Tag>Not checked</Tag>
              </div>
            ))}
          </section>
        </main>

        {current && <AvatarPicker key={current.id} identity={current} onSave={onUpdate ? (input) => onUpdate(current.id, input) : undefined} />}
      </div>
    </div>
  );
}

function AddForm({ onCreate, onCancel }: { onCreate: (i: CreateIdentityInput) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState('');
  const [runtime, setRuntime] = React.useState(RUNTIMES[0].name);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await onCreate({ id: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: name.trim(), role: role.trim() || undefined, runtime, avatarMark: 'diamond', avatarColor: 'graphite' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const field = 'glass-panel h-9 rounded-md px-2.5 text-sm outline-none placeholder:text-muted-foreground';
  return (
    <form onSubmit={submit} className="bg-card flex flex-wrap items-end gap-3 rounded-xl p-4">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Atlas" required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Role
        <input value={role} onChange={(e) => setRole(e.target.value)} className={field} placeholder="Platform and backend" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Runs on
        <select value={runtime} onChange={(e) => setRuntime(e.target.value)} className={field}>
          {RUNTIMES.slice(0, 3).map((r) => (
            <option key={r.name}>{r.name}</option>
          ))}
        </select>
      </label>
      <button type="submit" className={buttonVariants({ variant: 'default' })}>
        Add
      </button>
      <button type="button" onClick={onCancel} className={buttonVariants({ variant: 'glass' })}>
        Cancel
      </button>
      {error && <p className="w-full text-xs text-risk">{error}</p>}
    </form>
  );
}

export function AvatarPicker({ identity, onSave }: { identity: Identity; onSave?: (input: UpdateIdentityInput) => Promise<void> }) {
  const [mark, setMark] = React.useState(identity.avatarMark ?? 'diamond');
  const [color, setColor] = React.useState(identity.avatarColor ?? 'graphite');
  const [name, setName] = React.useState(identity.name);
  const [state, setState] = React.useState<'idle' | 'saving' | 'saved' | string>('idle');
  const preview = { name, avatarMark: mark, avatarColor: color };
  const dirty = mark !== identity.avatarMark || color !== identity.avatarColor || name !== identity.name;

  const save = async () => {
    if (!onSave) return;
    setState('saving');
    try {
      await onSave({ avatarMark: mark, avatarColor: color, name });
      setState('saved');
    } catch (e) {
      setState(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <aside aria-label="Avatar picker" className="bg-card flex w-full flex-col gap-4.5 rounded-xl p-5 lg:w-100">
      <div>
        <h2 className="text-base font-semibold">{identity.name}’s avatar</h2>
        <p className="text-xs text-muted-foreground">Pick a mark and a colour. Avatars are yours to choose; nothing is a real face.</p>
      </div>
      <div className="flex items-center gap-4">
        <Avatar who={preview} size={88} />
        <div className="flex flex-col gap-2 text-[13px]">
          <span className="flex items-center gap-2"><Avatar who={preview} size={28} /> {name} <span className="text-xs text-muted-foreground">in a thread</span></span>
          <span className="flex items-center gap-2"><Avatar who={preview} size={18} /> <span className="text-xs text-muted-foreground">in lists</span></span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Mark</span>
        <div className="grid grid-cols-6 gap-2">
          {Object.entries(AVATAR_MARKS).map(([id, m]) => (
            <button
              key={id}
              type="button"
              aria-label={m.name}
              aria-pressed={mark === id}
              onClick={() => setMark(id)}
              className={cn('glass-panel inline-flex aspect-square items-center justify-center rounded-xl', mark === id && 'ring-1 ring-foreground')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={m.d} />
              </svg>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Colour</span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(AVATAR_COLORS).map(([id, c]) => (
            <button
              key={id}
              type="button"
              aria-label={c.name}
              aria-pressed={color === id}
              onClick={() => setColor(id)}
              className={cn('inline-flex size-11 items-center justify-center rounded-full border-2', color === id ? 'border-foreground' : 'border-transparent')}
              style={{ background: c.bg }}
            >
              <span className="size-3 rounded-full" style={{ background: c.fg }} />
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        Display name
        <input value={name} onChange={(e) => setName(e.target.value)} className="glass-panel h-10 rounded-md px-3 text-sm text-foreground outline-none" />
      </label>
      <div className="mt-auto flex items-center gap-3">
        <button type="button" disabled={!onSave || !dirty || state === 'saving'} onClick={save} className={cn(buttonVariants({ variant: 'default' }), 'flex-1')}>
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {state === 'saved' && !dirty && <span className="text-xs text-verified">Saved</span>}
        {!['idle', 'saving', 'saved'].includes(state) && <span className="text-xs text-risk">Not saved: {state}</span>}
      </div>
    </aside>
  );
}
