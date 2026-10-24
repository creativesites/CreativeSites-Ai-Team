import { ChevronLeft } from 'lucide-react';
import type { Identity } from '@runtime/types';
import { Avatar } from '@/components/app/avatar';
import { EmptyState, jobLabel, SectionTitle, Tag } from '@/components/app/status';
import { buttonVariants } from '@/components/ui/button';
import { href } from '@/lib/route';
import { cn } from '@/lib/utils';

// The planning council, run like roast-room: a Chair, weighted seats, rounds,
// and a verdict whose every number is computed from the seats' cards.
// The runtime serves councils from Phase 3; until then these screens render
// only in the dev preview.

export type Ruin = 'none' | 'possible' | 'likely';

export interface SeatCard {
  seat: string;
  question: string;
  weight: number;
  identity: Identity;
  said: string;
  /** 0 to 10 for each option id. */
  scores: Record<string, number>;
  pillar: number;
  ruin: Record<string, Ruin>;
  state: 'speaking' | 'done' | 'waiting';
}

export interface Council {
  jobId: string;
  jobNumber: number;
  jobTitle: string;
  room: string;
  chair: Identity;
  chairNote: string;
  round: number;
  rounds: string[];
  options: { id: string; label: string }[];
  cards: SeatCard[];
  cruxes: { text: string; between: string }[];
  debate: { from: string; to: string; crux: string; text: string }[];
}

export interface PlanTask {
  id: string;
  title: string;
  owner: Identity | null;
  check: string;
  gate: string;
  needsYou: boolean;
}

export interface Verdict {
  council: Council;
  call: string;
  carried: { text: string; by: string }[];
  objection: { text: string; by: string };
  confidence: number;
  support: number;
  tasks: PlanTask[];
  doneMeans: string[];
}

/** score(option) = Σ weight × seat score / Σ weight, one decimal. */
export function optionScores(c: Council) {
  const total = c.cards.reduce((s, card) => s + card.weight, 0);
  return c.options
    .map((o) => {
      const sum = c.cards.reduce((s, card) => s + card.weight * (card.scores[o.id] ?? 0), 0);
      const formula = `(${c.cards.map((card) => `${card.weight}×${card.scores[o.id] ?? 0}`).join(' + ')}) / ${total}`;
      return { ...o, score: Math.round((sum / total) * 10) / 10, formula };
    })
    .sort((a, b) => b.score - a.score);
}

export function verdictBand(score: number) {
  if (score >= 7.5) return 'Go';
  if (score >= 6) return 'Go with conditions';
  if (score >= 4.5) return 'Reshape';
  return "Don't do it";
}

function Header({ c, label, back }: { c: Council; label: string; back: string }) {
  return (
    <header className="flex flex-wrap items-center gap-3.5">
      <a href={back} aria-label="Back" className={buttonVariants({ variant: 'glass', size: 'icon' })}>
        <ChevronLeft />
      </a>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-xs text-muted-foreground">
          {label} · {jobLabel(c.jobNumber)} · #{c.room}
        </span>
        <h1 className="truncate text-lg font-semibold">{c.jobTitle}</h1>
      </div>
    </header>
  );
}

export function CouncilScreen({ council: c }: { council: Council }) {
  const board = optionScores(c);
  const max = 10;
  return (
    <div className="flex flex-col gap-4 py-2">
      <Header c={c} label="Planning council" back={href({ name: 'job', jobId: c.jobId })} />
      <ol aria-label="Council rounds" className="grid grid-cols-7 gap-1.5">
        {c.rounds.map((r, i) => (
          <li key={r} className="flex flex-col gap-1.5">
            <span className={cn('h-1 rounded-full', i < c.round ? 'bg-verified' : i === c.round ? 'bg-observed' : 'bg-foreground/12')} />
            <span className={cn('text-xs', i === c.round ? 'text-foreground' : 'text-muted-foreground')}>{r}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="bg-card flex items-center gap-3.5 rounded-xl px-4.5 py-3.5">
            <Avatar who={c.chair} size={40} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">
                <strong className="font-semibold">{c.chair.name}</strong> <span className="text-xs text-muted-foreground">· Chair · runs the rounds, keeps score, never votes</span>
              </span>
              <span className="text-[14px] text-foreground/90">{c.chairNote}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {c.options.map((o) => (
              <div key={o.id} className="glass-panel flex flex-col rounded-lg px-3 py-2.5">
                <span className="font-mono text-xs text-muted-foreground">Option {o.id}</span>
                <span className="text-[13px]">{o.label}</span>
              </div>
            ))}
          </div>

          <section aria-label="Seats at the table" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {c.cards.map((card) => {
              const flags = Object.entries(card.ruin).filter(([, r]) => r !== 'none');
              return (
                <article key={card.seat} className={cn('bg-card flex flex-col gap-2.5 rounded-xl p-3.5', card.state === 'speaking' && 'ring-1 ring-observed/50')}>
                  <div className="flex items-center gap-2.5">
                    <Avatar who={card.identity} size={40} />
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="font-semibold">{card.seat}</span>
                      <span className="text-xs text-muted-foreground">
                        {card.identity.name} · weight ×{card.weight}
                      </span>
                    </div>
                    <Tag tone={card.state === 'speaking' ? 'observed' : card.state === 'waiting' ? 'needs-you' : 'quiet'} className="capitalize">
                      {card.state}
                    </Tag>
                  </div>
                  <span className="text-[13px] text-muted-foreground">{card.question}</span>
                  <p className="min-h-14 text-[13px] text-foreground/90">{card.said}</p>
                  <div className="grid grid-cols-4 gap-1.5" aria-label="Scores per option">
                    {c.options.map((o) => (
                      <span key={o.id} className="glass-panel flex justify-between rounded-md px-2 py-0.5 font-mono text-xs">
                        <span className="text-muted-foreground">{o.id}</span>
                        {card.scores[o.id]}
                      </span>
                    ))}
                  </div>
                  {flags.map(([opt, r]) => (
                    <Tag key={opt} tone="risk" className="self-start">
                      {r === 'likely' ? 'Likely' : 'Possible'} disaster on {opt}
                    </Tag>
                  ))}
                </article>
              );
            })}
          </section>

          <section aria-label="Debate" className="bg-card flex flex-col gap-3.5 rounded-xl px-4.5 py-4">
            <SectionTitle aside={`round ${c.round}`}>Debate</SectionTitle>
            {c.debate.map((d, i) => (
              <div key={i} className="flex flex-col gap-1 border-l-2 border-foreground/10 pl-3">
                <span className="text-[13px]">
                  <strong className="font-semibold">{d.from}</strong> <span className="text-xs text-muted-foreground">→ {d.to} · {d.crux}</span>
                </span>
                <span className="text-sm text-foreground/90">{d.text}</span>
              </div>
            ))}
          </section>
        </main>

        <aside className="flex w-full flex-col gap-4 lg:w-90">
          <section aria-label="Scoreboard" className="bg-card flex flex-col gap-3 rounded-xl p-4.5">
            <SectionTitle aside="weighted, from the cards">Scoreboard</SectionTitle>
            {board.map((b, i) => (
              <div key={b.id} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <span>
                    <span className="font-mono text-muted-foreground">{b.id}</span> {b.label}
                  </span>
                  <span className="font-mono">{b.score.toFixed(1)}</span>
                </div>
                <span className="block h-1.5 rounded-full bg-foreground/[0.06]">
                  <span className={cn('block h-1.5 rounded-full', i === 0 ? 'bg-foreground' : 'bg-foreground/45')} style={{ width: `${(b.score / max) * 100}%` }} />
                </span>
              </div>
            ))}
          </section>
          <section aria-label="Cruxes" className="bg-card flex flex-col gap-3 rounded-xl p-4.5">
            <SectionTitle>Cruxes the Chair named</SectionTitle>
            {c.cruxes.map((x, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <span className="font-mono text-xs text-muted-foreground">Crux {i + 1}</span>
                <span className="text-[13px]">{x.text}</span>
                <span className="text-xs text-muted-foreground">{x.between}</span>
              </div>
            ))}
          </section>
          <section aria-label="Rules" className="bg-card flex flex-col gap-2.5 rounded-xl p-4.5 text-[13px]">
            <SectionTitle>Rules watching this council</SectionTitle>
            <RuleRows c={c} />
          </section>
        </aside>
      </div>
    </div>
  );
}

function RuleRows({ c }: { c: Council }) {
  const board = optionScores(c);
  const top = board[0];
  const likelyOnTop = c.cards.some((card) => card.ruin[top.id] === 'likely');
  const anyFlag = c.cards.flatMap((card) => Object.entries(card.ruin).filter(([, r]) => r !== 'none').map(([o]) => o));
  const topScores = c.cards.map((card) => card.scores[top.id] ?? 0);
  const spread = Math.max(...topScores) - Math.min(...topScores);
  const allSameTop = c.cards.every((card) => Object.entries(card.scores).sort((a, b) => b[1] - a[1])[0][0] === top.id);
  return (
    <>
      <div className="flex justify-between gap-2">
        <span>Disaster cap</span>
        {likelyOnTop ? <Tag tone="risk">Applied to {top.id}</Tag> : anyFlag.length ? <Tag tone="risk">Watching {[...new Set(anyFlag)].join(', ')}</Tag> : <Tag>Not triggered</Tag>}
      </div>
      <div className="flex justify-between gap-2">
        <span>Too-fast agreement</span>
        {allSameTop && spread <= 1 ? <Tag tone="needs-you">Triggered</Tag> : <Tag>Not triggered, spread {spread}</Tag>}
      </div>
      <p className="text-xs text-muted-foreground">
        A seat calling the top option a likely disaster caps the verdict. If every seat agrees within a point, someone must argue the strongest alternative.
      </p>
    </>
  );
}

export function VerdictScreen({ verdict: v }: { verdict: Verdict }) {
  const c = v.council;
  const board = optionScores(c);
  const top = board[0];
  const topScores = c.cards.map((card) => card.scores[top.id] ?? 0);
  const spread = Math.max(...topScores) - Math.min(...topScores);
  return (
    <div className="flex flex-col gap-4 py-2">
      <Header c={c} label={`Council verdict · ${c.cards.length} seats`} back={href({ name: 'council', jobId: c.jobId })} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <section aria-label="Verdict" className="bg-card flex flex-col gap-4 rounded-xl border-needs-you/30 px-6 py-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Verdict</span>
                <span className="text-3xl font-semibold tracking-tight text-needs-you">{verdictBand(top.score)}</span>
              </div>
              <dl className="grid grid-cols-4 gap-5">
                {[
                  [top.score.toFixed(1), `score for ${top.id}`],
                  [String(spread), 'spread'],
                  [`${v.confidence}/10`, 'confidence'],
                  [v.support.toFixed(1), 'plan support'],
                ].map(([value, label]) => (
                  <div key={label} className="flex flex-col">
                    <dd className="font-mono text-xl">{value}</dd>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                  </div>
                ))}
              </dl>
            </div>
            <p className="max-w-3xl text-base text-foreground/95">{v.call}</p>
          </section>

          <section aria-label="Option scores" className="bg-card flex flex-col gap-2 rounded-xl p-4.5">
            <SectionTitle aside={`weights ${c.cards.map((k) => `${k.seat} ${k.weight}`).join(', ')}`}>How the score was computed</SectionTitle>
            {board.map((b, i) => (
              <div key={b.id} className={cn('flex flex-wrap items-center gap-3 rounded-lg px-2.5 py-2', i === 0 && 'glass-chosen')}>
                <span className="w-4 font-mono text-muted-foreground">{b.id}</span>
                <span className="min-w-0 flex-1 basis-56">{b.label}</span>
                <span className="font-mono text-xs break-all text-muted-foreground">{b.formula}</span>
                <span className="w-8 text-right font-mono font-medium">{b.score.toFixed(1)}</span>
              </div>
            ))}
          </section>

          <div className="flex flex-col gap-4 md:flex-row">
            <section className="bg-card flex flex-1 flex-col gap-3 rounded-xl p-4.5">
              <SectionTitle>What carried the room</SectionTitle>
              {v.carried.map((x) => (
                <div key={x.text} className="flex flex-col">
                  <span className="text-[13px]">{x.text}</span>
                  <span className="text-xs text-muted-foreground">{x.by}</span>
                </div>
              ))}
              <div className="flex flex-col border-t border-border/60 pt-3">
                <span className="text-xs text-muted-foreground">Strongest objection</span>
                <span className="text-[13px]">{v.objection.text}</span>
                <span className="text-xs text-muted-foreground">{v.objection.by}</span>
              </div>
            </section>
            <section className="bg-card flex flex-1 flex-col gap-2.5 rounded-xl p-4.5">
              <SectionTitle>Each seat on {top.id}, own area only</SectionTitle>
              {c.cards.map((k) => (
                <div key={k.seat} className="flex items-center gap-2.5 text-[13px]">
                  <Avatar who={k.identity} size={22} />
                  <span className="w-36 truncate">{k.seat}</span>
                  <span className="block h-1.5 flex-1 rounded-full bg-foreground/[0.06]">
                    <span className="block h-1.5 rounded-full bg-foreground" style={{ width: `${k.pillar * 10}%` }} />
                  </span>
                  <span className="w-5 text-right font-mono">{k.pillar}</span>
                </div>
              ))}
            </section>
          </div>
        </main>

        <aside aria-label="The plan this produces" className="bg-card flex w-full flex-col gap-4 rounded-xl p-4.5 lg:w-100">
          <div>
            <h2 className="text-base font-semibold">The plan this produces</h2>
            <p className="text-xs text-muted-foreground">Each task names who does it and how it is checked.</p>
          </div>
          {v.tasks.map((t) => (
            <div key={t.id} className="glass-panel flex flex-col gap-2 rounded-lg p-3">
              <div className="flex items-center gap-2.5">
                {t.owner ? <Avatar who={t.owner} size={26} /> : null}
                <span className="flex-1 text-sm">{t.title}</span>
                <span className="font-mono text-xs text-muted-foreground">{t.id}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Checked by</span>
                <span className="font-mono text-xs break-words text-foreground/80">{t.check}</span>
              </div>
              <Tag tone={t.needsYou ? 'needs-you' : 'quiet'} className="self-start">
                {t.gate}
              </Tag>
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Done means</span>
            <span className="text-[13px]">{v.doneMeans.join(' · ')}</span>
          </div>
          <div className="mt-auto flex flex-col gap-2">
            <button type="button" disabled title="Accepting plans arrives in Phase 3" className={buttonVariants({ variant: 'default' })}>
              Accept plan and start
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** What the live app shows on these routes until the council engine exists. */
export function PlanningNotYet({ jobId }: { jobId: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 py-10">
      <EmptyState title="No planning council has run for this job">
        Planning councils arrive in Phase 3 of the build plan. When one runs, its rounds, scores and verdict show here, each number traceable to the seats' cards.
      </EmptyState>
      <a href={href({ name: 'job', jobId })} className={cn(buttonVariants({ variant: 'glass' }), 'self-start')}>
        Back to the job
      </a>
    </div>
  );
}
