import * as React from 'react';
import { LoadNote, Panel, ScreenHeader } from '@/components/app/metric';
import { EmptyState, SectionTitle, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { dateTime } from '@/lib/format';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';
import { cn } from '@/lib/utils';

// Skills & Knowledge (vision section 13, 14.2 item 10). What the runtime has actually loaded from the
// skills folder, with the content hash a task would be pinned to. Nothing here is a wish list.

export function SkillsScreen({ skillId }: { skillId?: string }) {
  const { client } = useRuntime();
  const [bump, setBump] = React.useState(0);
  const [query, setQuery] = React.useState('');
  const [note, setNote] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const list = useRuntimeData((c) => c.skills(), [bump]);
  const detail = useRuntimeData((c) => (skillId ? c.skill(skillId) : Promise.resolve(null)), [skillId, bump]);

  const skills = list.status === 'ready' ? list.data.skills : [];
  const q = query.trim().toLowerCase();
  const shown = skills.filter((s) => !q || `${s.id} ${s.name} ${s.description} ${s.triggers.join(' ')} ${s.roles.join(' ')}`.toLowerCase().includes(q));

  const reload = async () => {
    if (!client) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await client.reloadSkills();
      setNote(`Found ${r.found}: ${r.added} new or changed, ${r.unchanged} unchanged${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}.`);
      setBump((n) => n + 1);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 py-4">
      <ScreenHeader kicker="Read from the skills folder by the runtime; a task keeps the exact text it was given" title="Skills & Knowledge">
        <label htmlFor="skill-search" className="sr-only">
          Search skills
        </label>
        <input id="skill-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search skills, triggers, roles" className="glass-panel h-9 w-64 rounded-md px-2.5 text-sm outline-none" />
        <button type="button" className={buttonVariants({ variant: 'glass' })} onClick={reload} disabled={busy || !client}>
          {busy ? 'Reloading…' : 'Reload from disk'}
        </button>
      </ScreenHeader>

      {note && (
        <p role="status" className="text-xs text-muted-foreground">
          {note}
        </p>
      )}
      <LoadNote what="skills" state={list} />

      {list.status === 'ready' && (
        <p className="text-xs text-muted-foreground">
          Folder: <span className="font-mono break-all">{list.data.root ?? 'not configured'}</span> · {skills.length} loaded
        </p>
      )}

      {list.status === 'ready' && skills.length === 0 ? (
        <EmptyState title="No skills loaded">
          {list.data.root ? 'The skills folder has no valid skill documents yet. Reload after adding some.' : 'The runtime has no skills folder configured, so no skill is available to any task.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section aria-label="Skill catalog" className="bg-card flex max-h-[70vh] flex-col overflow-y-auto rounded-xl">
            {shown.length === 0 && skills.length > 0 && <p className="p-4 text-sm text-muted-foreground">No skill matches the search.</p>}
            {shown.map((s) => (
              <a
                key={s.id}
                href={href({ name: 'skills', skillId: s.id })}
                aria-current={skillId === s.id ? 'page' : undefined}
                className={cn('flex flex-col gap-1.5 border-b border-border/50 px-4 py-3 last:border-b-0 hover:bg-foreground/[0.03]', skillId === s.id && 'glass-chosen')}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  <Tag tone="quiet">v{s.version}</Tag>
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{s.description || 'No description'}</span>
                <span className="flex flex-wrap gap-1.5">
                  {s.workflows.map((w) => (
                    <Tag key={w} tone="observed">
                      {w}
                    </Tag>
                  ))}
                  {s.roles.map((r) => (
                    <Tag key={r}>{r}</Tag>
                  ))}
                </span>
              </a>
            ))}
          </section>

          <Panel label="Skill detail" className="min-w-0">
            {!skillId ? (
              <EmptyState title="Pick a skill">Its instructions, triggers and the hash a task is pinned to appear here.</EmptyState>
            ) : detail.status !== 'ready' || !detail.data ? (
              <LoadNote what="the skill" state={detail} />
            ) : (
              <>
                <SectionTitle aside={`loaded ${dateTime(detail.data.loadedAt)}`}>{detail.data.name}</SectionTitle>
                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <span className="text-muted-foreground">
                    Id <span className="font-mono text-foreground">{detail.data.id}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Content hash <span className="font-mono text-foreground">{detail.data.contentHash.slice(0, 12)}</span>
                  </span>
                  <span className="text-muted-foreground sm:col-span-2">
                    File <span className="font-mono break-all text-foreground">{detail.data.path}</span>
                  </span>
                  <span className="text-muted-foreground sm:col-span-2">
                    Triggers {detail.data.triggers.length ? detail.data.triggers.map((t) => <Tag key={t} className="mr-1">{t}</Tag>) : <span className="text-foreground">none declared</span>}
                  </span>
                </div>
                <pre className="glass-panel max-h-[50vh] overflow-auto rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">{detail.data.body}</pre>
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
