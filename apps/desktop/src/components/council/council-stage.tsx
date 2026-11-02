import * as React from 'react';
import type { CouncilCrux, CouncilOption, CouncilSessionSummary } from '@runtime/types';
import {
  portraitUrl,
  stanceClass,
  TalkingBust,
  type MouthShape,
  type RosterSeatInfo,
} from './talking-bust';
import type { CaptionState } from './use-council-player';

export const MAX_TABLE = 9;

export interface RebuttalLink {
  id: string;
  from: string;
  to: string;
  color: string;
}

export interface FeedItemEntry {
  id: string;
  type: 'sep' | 'card';
  round?: number;
  seatKey?: string;
  parsed?: any;
  text?: string;
  quotes?: { quote: string; source: string; verified: boolean }[];
}

export function badgeClass(label?: string): string {
  const l = (label || '').toUpperCase();
  if (l === 'GO') return 'badge-go';
  if (l === 'GO WITH CONDITIONS') return 'badge-cond';
  if (l === 'RESHAPE') return 'badge-reshape';
  if (l === 'WAIT') return 'badge-wait';
  return 'badge-no';
}

const SAMPLE_PROMPTS: Record<string, string> = {
  myaos:
    'Should we execute Option A (single runtime SQLite task store + one builder + independent verifier loop) right now, or Option B (smaller verification report wedge first)? Make sure every task has a runnable check command.',
  seed:
    "I'm a solo founder doing $18k MRR on a B2B SaaS tool for freight brokers (growing ~8% MoM, 3% monthly churn, $40k in the bank). An angel offered $500k on a $5M post-money SAFE, conditional on going full-time on enterprise sales and hiring two engineers in 60 days. Should I take the check, bootstrap, or raise a smaller $150k angels-only round?",
  price:
    'We run a cohort-based fitness coaching business doing $95k/mo at $1,200 per 12-week seat. Close rate on sales calls is 48% and coaches are at 90% capacity. Should we raise price to $2,400, keep $1,200 and hire 2 more coaches, or add a $4,500 VIP tier?',
};

export function CouncilStage({
  seats,
  byKey,
  activeSeats,
  weights,
  stances,
  votes,
  thinkingSeats,
  speakingSeat,
  targetSeat,
  mouthShapes,
  links,
  centerMode,
  prompt,
  onPromptChange,
  mode,
  onModeChange,
  boardGroup,
  onBoardGroupChange,
  onStartCouncil,
  busy,
  caption,
  waitStep,
  waitSub,
  waitElapsedSec,
  cruxes,
  cruxNote,
  verdict,
  onOpenVerdict,
  onOpenSeatCard,
  speed,
  onCycleSpeed,
  onSkip,
  queueCount,
  options,
  optionScores,
  feedItems,
  onSelectSample,
}: {
  seats: RosterSeatInfo[];
  byKey: Record<string, RosterSeatInfo>;
  activeSeats: string[] | null;
  weights: Record<string, { weight: number; reason: string }>;
  stances: Record<string, string>;
  votes: Record<string, string>;
  thinkingSeats: Record<string, boolean>;
  speakingSeat: string | null;
  targetSeat: string | null;
  mouthShapes: Record<string, MouthShape>;
  links: RebuttalLink[];
  centerMode: 'ask' | 'wait' | 'caption' | 'cruxes' | 'plate';
  prompt: string;
  onPromptChange: (v: string) => void;
  mode: 'full' | 'quick';
  onModeChange: (m: 'full' | 'quick') => void;
  boardGroup: 'myaos' | 'operators';
  onBoardGroupChange: (g: 'myaos' | 'operators') => void;
  onStartCouncil: () => void;
  busy: boolean;
  caption: CaptionState | null;
  waitStep: string;
  waitSub: string;
  waitElapsedSec: number;
  cruxes: CouncilCrux[];
  cruxNote: string;
  verdict: any;
  onOpenVerdict: () => void;
  onOpenSeatCard: (seatKey: string, round?: number) => void;
  speed: number;
  onCycleSpeed: () => void;
  onSkip: () => void;
  queueCount: number;
  options: CouncilOption[];
  optionScores: Record<string, { score: number | null; math: string }>;
  feedItems: FeedItemEntry[];
  onSelectSample: (text: string) => void;
}) {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = React.useState<{ w: number; h: number }>({ w: 960, h: 620 });

  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width >= 60 && r.height >= 60) {
        setDims({ w: r.width, h: r.height });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tableSeats = React.useMemo(() => {
    const chosen = activeSeats
      ? seats.filter((s) => activeSeats.includes(s.key))
      : seats.filter((s) => s.boardGroup === boardGroup);
    return chosen.slice(0, MAX_TABLE);
  }, [seats, activeSeats, boardGroup]);

  const layout = React.useMemo(() => {
    const W = dims.w;
    const H = dims.h;
    const cx = W * 0.5;
    const cy = H * 0.9;
    const rx = W * 0.48;
    const ry = H * 0.42;

    const edge = (x: number) => {
      const u = Math.max(-0.97, Math.min(0.97, (x - cx) / rx));
      return cy - ry * Math.sqrt(1 - u * u);
    };

    const n = tableSeats.length;
    const span = n <= 5 ? 0.72 : n <= 7 ? 0.84 : 0.88;
    const xs = tableSeats.map((_, i) => cx + rx * (n === 1 ? 0 : -span + (2 * span * i) / (n - 1)));
    const crowd = n > 7 ? Math.max(0.76, 7 / n) : 1;
    const size = Math.max(0.56, Math.min(1.08, Math.min(W / 1180, H / 700) * crowd));

    const coords: Record<
      string,
      {
        x: number;
        y: number;
        plateY: number;
        bustScale: number;
        zIndex: number;
      }
    > = {};

    tableSeats.forEach((s, i) => {
      const x = xs[i]!;
      const ey = edge(x);
      const d = Math.pow((x - cx) / rx, 2);
      const scale = (0.86 + d * 0.14) * size;
      const y = ey + 26 * scale;
      coords[s.key] = {
        x,
        y,
        plateY: ey + H * 0.01,
        bustScale: scale,
        zIndex: Math.round(d * 10) + 1,
      };
    });

    const innerPlateY = n ? Math.min(...xs.map((x) => edge(x) + H * 0.01)) : cy - ry;
    const topY = innerPlateY + 26;
    const botY = H - 56;
    const centerTop = Math.round((topY + botY) / 2);
    const centerMaxH = Math.max(160, Math.round(botY - topY));

    return {
      W,
      H,
      cx,
      cy,
      rx,
      ry,
      coords,
      centerTop,
      centerMaxH,
    };
  }, [dims, tableSeats]);

  const spotInfo = React.useMemo(() => {
    if (!speakingSeat || !layout.coords[speakingSeat]) return null;
    const p = layout.coords[speakingSeat]!;
    return {
      x: p.x,
      y: p.y - 105 * p.bustScale,
    };
  }, [speakingSeat, layout]);

  const topOptionId = React.useMemo(() => {
    const entries = Object.entries(optionScores).filter(([, v]) => typeof v?.score === 'number');
    if (!entries.length) return null;
    return entries.sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0))[0]?.[0] ?? null;
  }, [optionScores]);

  return (
    <div className="room">
      <section className="stage" ref={stageRef} aria-label="Council table">
        <div className="wall" />
        <div
          className={`spot ${spotInfo ? 'on' : ''}`}
          style={
            spotInfo
              ? {
                  background: `radial-gradient(circle 260px at ${spotInfo.x}px ${spotInfo.y}px, rgba(240,180,76,.22), rgba(240,180,76,.05) 45%, transparent 72%)`,
                }
              : undefined
          }
        />

        {/* Animated SVG Rebuttal Arcs */}
        <svg className="links" viewBox={`0 0 ${layout.W} ${layout.H}`} preserveAspectRatio="none">
          <defs>
            <marker id="rr-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#f05a5a" />
            </marker>
          </defs>
          {links.map((lk) => {
            const a = layout.coords[lk.from];
            const b = layout.coords[lk.to];
            if (!a || !b) return null;
            const ay = a.y - 80 * a.bustScale;
            const by = b.y - 80 * b.bustScale;
            const mx = (a.x + b.x) / 2;
            const my = Math.min(ay, by) - 60;
            return (
              <path
                key={lk.id}
                d={`M ${a.x} ${ay} Q ${mx} ${my} ${b.x} ${by}`}
                stroke={lk.color || '#f05a5a'}
                markerEnd="url(#rr-arrow)"
              />
            );
          })}
        </svg>

        {/* Seats around the back arc */}
        <div className="seats">
          {tableSeats.map((s) => {
            const pos = layout.coords[s.key];
            if (!pos) return null;
            const isSpeaking = speakingSeat === s.key;
            const isTarget = targetSeat === s.key;
            const isDim = Boolean(speakingSeat && speakingSeat !== s.key && targetSeat !== s.key);
            const isThinking = Boolean(thinkingSeats[s.key]);
            const vote = votes[s.key] || '';
            const shape: MouthShape = mouthShapes[s.key] || 'base';

            let leanTransform = `scale(${pos.bustScale.toFixed(3)})`;
            if (isSpeaking && targetSeat && layout.coords[targetSeat]) {
              const dir = layout.coords[targetSeat]!.x > pos.x ? 1 : -1;
              leanTransform = `scale(${pos.bustScale.toFixed(3)}) translateX(${dir * 7}px) rotate(${dir * 2.5}deg)`;
            }

            return (
              <div
                key={s.key}
                className={[
                  'seat',
                  isSpeaking ? 'speaking' : '',
                  isTarget ? 'target' : '',
                  isDim ? 'dim' : '',
                  isThinking ? 'thinking' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  zIndex: isSpeaking ? 8 : pos.zIndex,
                }}
                onClick={() => onOpenSeatCard(s.key)}
              >
                <div className="think">
                  <i />
                  <i />
                  <i />
                </div>
                <div className={`vote ${vote}`} hidden={!vote}>
                  {vote}
                </div>
                <TalkingBust seat={s} shape={shape} leanTransform={leanTransform} />
              </div>
            );
          })}
        </div>

        {/* Elliptical Mahogany Table */}
        <div
          className="table"
          style={{
            left: `${layout.cx - layout.rx}px`,
            top: `${layout.cy - layout.ry}px`,
            width: `${layout.rx * 2}px`,
            height: `${layout.ry * 2}px`,
          }}
        >
          <div className="table-ring" />
          <img className="table-logo" src="/brand/ais-symbol-white.svg" alt="" />
        </div>

        {/* Nameplates straddling the table rim */}
        <div className="nameplates">
          {tableSeats.map((s) => {
            const pos = layout.coords[s.key];
            if (!pos) return null;
            const w = weights[s.key]?.weight;
            const st = stances[s.key] || '';
            const stCls = stanceClass(st);
            const isSpeaking = speakingSeat === s.key;
            return (
              <div
                key={s.key}
                className={`nameplate ${isSpeaking ? 'speaking' : ''}`}
                style={{ left: `${pos.x}px`, top: `${pos.plateY}px` }}
                onClick={() => onOpenSeatCard(s.key)}
              >
                <span className="dot" style={{ background: s.color }} />
                <span>{s.short}</span>
                {w ? (
                  <span className="w" title={weights[s.key]?.reason || ''}>
                    {w}x
                  </span>
                ) : null}
                {st ? <span className={`stance ${stCls}`}>{st}</span> : null}
              </div>
            );
          })}
        </div>

        {/* Table Center Overlay */}
        <div
          className="center"
          style={{
            left: `${layout.cx}px`,
            top: `${layout.centerTop}px`,
            maxHeight: `${layout.centerMaxH}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {centerMode === 'ask' && (
            <form
              className="ask"
              onSubmit={(e) => {
                e.preventDefault();
                onStartCouncil();
              }}
            >
              <div className="ask-label">
                <span>Put a decision on the table</span>
                <div className="mode" role="group" aria-label="Council roster">
                  <button
                    type="button"
                    className={boardGroup === 'myaos' ? 'on' : ''}
                    onClick={() => onBoardGroupChange('myaos')}
                  >
                    MyaOS Council (7)
                  </button>
                  <button
                    type="button"
                    className={boardGroup === 'operators' ? 'on' : ''}
                    onClick={() => onBoardGroupChange('operators')}
                  >
                    Roast Operators (7)
                  </button>
                </div>
              </div>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                placeholder="What are you deciding? Include your options, constraints, numbers, and what you're leaning toward."
              />
              <div className="ask-row">
                <div className="mode" role="group" aria-label="Council mode">
                  <button
                    type="button"
                    className={mode === 'full' ? 'on' : ''}
                    onClick={() => onModeChange('full')}
                  >
                    Full · 7 seats · 3 rounds
                  </button>
                  <button
                    type="button"
                    className={mode === 'quick' ? 'on' : ''}
                    onClick={() => onModeChange('quick')}
                  >
                    Quick · 4 seats · 2 rounds
                  </button>
                </div>
                <button type="submit" className="primary" disabled={busy || prompt.trim().length < 5}>
                  {busy ? 'Convening…' : 'Convene the Council'}
                </button>
              </div>
              <div className="samples">
                <span>Try:</span>
                <button type="button" onClick={() => onSelectSample(SAMPLE_PROMPTS.myaos)}>
                  MyaOS runtime store
                </button>
                <button type="button" onClick={() => onSelectSample(SAMPLE_PROMPTS.seed)}>
                  Take a $500k seed or bootstrap?
                </button>
                <button type="button" onClick={() => onSelectSample(SAMPLE_PROMPTS.price)}>
                  Double our coaching price?
                </button>
              </div>
            </form>
          )}

          {centerMode === 'wait' && (
            <div className="waitcard">
              <div className="wait-pulse" />
              <div>
                <div className="wait-step">{waitStep}</div>
                <div className="wait-sub">{waitSub}</div>
              </div>
              <div className="wait-time">
                {Math.floor(waitElapsedSec / 60)}:{String(waitElapsedSec % 60).padStart(2, '0')}
              </div>
            </div>
          )}

          {centerMode === 'caption' && caption && (
            <div className="caption">
              <div className="cap-head">
                <span className="cap-who" style={{ color: caption.color }}>
                  {caption.who}
                </span>
                <span className="cap-tag">{caption.tag}</span>
                {caption.stance ? <span className="cap-stance">{caption.stance}</span> : null}
              </div>
              <div className="cap-text">
                {caption.words.map((w, i) => (
                  <React.Fragment key={i}>
                    <span className={`w ${i === caption.activeWordIndex ? 'on' : ''}`}>{w}</span>{' '}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {centerMode === 'cruxes' && cruxes.length > 0 && (
            <div className="cruxes">
              <h4>Where the council splits</h4>
              {cruxNote ? (
                <div style={{ color: 'var(--muted)', marginBottom: 6 }}>{cruxNote}</div>
              ) : null}
              {cruxes.slice(0, 3).map((c, idx) => (
                <div key={idx} className="crux">
                  <div className="crux-q">{c.question}</div>
                  <div className="crux-sides">
                    {(c.sides || []).map((sd, sIdx) => (
                      <span key={sIdx} className="crux-side">
                        <span className="crux-faces">
                          {(sd.seats || []).map((k) => {
                            const seatObj = byKey[k];
                            if (!seatObj) return null;
                            return (
                              <img
                                key={k}
                                src={portraitUrl(seatObj, 'base')}
                                title={seatObj.short}
                                alt={seatObj.short}
                              />
                            );
                          })}
                        </span>
                        <span>{sd.position}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {centerMode === 'plate' && verdict && (
            <div className="plate">
              <div className={`plate-badge ${badgeClass(verdict.label)}`}>{verdict.label}</div>
              <div className="plate-call">{verdict.call}</div>
              <button type="button" className="primary" onClick={onOpenVerdict}>
                Read Full Verdict &amp; Plan
              </button>
            </div>
          )}
        </div>

        {/* Playback Controls */}
        {(speakingSeat || queueCount > 0 || centerMode === 'caption') && (
          <div className="playbar">
            <button type="button" className="ghost" onClick={onCycleSpeed}>
              {speed}x
            </button>
            <button type="button" className="ghost" onClick={onSkip}>
              Skip ahead
            </button>
            <span>{queueCount ? `${queueCount} up next` : ''}</span>
          </div>
        )}
      </section>

      {/* Right-hand Key Points Feed */}
      <aside className="feed" aria-label="Council feed">
        {options.length > 0 && (
          <div className="options-bar">
            {options.map((o) => {
              const sc = optionScores[o.id];
              const isTop = topOptionId === o.id;
              return (
                <div key={o.id} className={`opt ${isTop ? 'top' : ''}`}>
                  <span className="opt-id">{o.id}</span>
                  <span className="opt-label" title={o.label}>
                    {o.label}
                  </span>
                  <span className="opt-score" title={sc?.math ? `Weighted: ${sc.math}` : ''}>
                    {sc?.score != null ? `${sc.score}/10` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="feed-head">
          <span>Key points</span>
          <span className="feed-hint">click a card or seat for full text</span>
        </div>

        <div className="feed-list">
          {feedItems.map((entry) => {
            if (entry.type === 'sep') {
              const titles: Record<number, string> = {
                1: 'Round 1 · Opening',
                2: 'Round 2 · Debate',
                3: 'Round 3 · Vote',
              };
              return (
                <div key={entry.id} className="round-sep">
                  {titles[entry.round || 1] || `Round ${entry.round}`}
                </div>
              );
            }
            const s = entry.seatKey ? byKey[entry.seatKey] : undefined;
            if (!s) return null;
            const p = entry.parsed || {};
            const r = entry.round || 1;
            const headline =
              r === 1
                ? p.call || p.stance
                : r === 2
                  ? p.disagreeLine || p.stance
                  : `${(p.vote || '').toUpperCase()}${p.oneLine ? ' — ' + p.oneLine : ''}`;
            const sub =
              r === 1 && p.risk
                ? `Risk: ${p.risk}`
                : r === 2 && p.moved && !/^no\b/i.test(p.moved)
                  ? `Moved: ${p.moved}`
                  : r === 3 && p.amendment
                    ? `Amendment: ${p.amendment}`
                    : '';
            const sc = Object.entries(p.optionScores || {})
              .map(([k, v]) => `${k}:${v}`)
              .join(' ');
            const isSpeaking = speakingSeat === s.key;
            return (
              <div
                key={entry.id}
                className={`item ${isSpeaking ? 'active' : ''}`}
                style={{ '--c': s.color } as React.CSSProperties}
                onClick={() => onOpenSeatCard(s.key, r)}
              >
                <div className="item-top">
                  <img className="item-face" src={portraitUrl(s, 'base')} alt={s.short} />
                  <span className="item-who" style={{ color: s.color }}>
                    {s.short}
                  </span>
                  <span className="item-round">R{r}</span>
                  <span className="item-scores">{sc}</span>
                </div>
                <div className="item-body">{headline}</div>
                {sub ? <div className="item-sub">{sub}</div> : null}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

export function SeatCardModal({
  seat,
  weight,
  cardsByRound,
  initialRound,
  onClose,
}: {
  seat: RosterSeatInfo;
  weight?: { weight: number; reason: string };
  cardsByRound: Record<number, { text: string; parsed: any; quotes: { quote: string; source: string; verified: boolean }[] } | undefined>;
  initialRound?: number;
  onClose: () => void;
}) {
  const availableRounds = [3, 2, 1].filter((r) => Boolean(cardsByRound[r]));
  const [round, setRound] = React.useState<number>(initialRound || availableRounds[0] || 1);
  const card = cardsByRound[round];

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src={portraitUrl(seat, 'base')}
              alt={seat.name}
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                objectFit: 'cover',
                background: '#0d1017',
                border: `2px solid ${seat.color}`,
              }}
            />
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: seat.color }}>{seat.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {seat.pillar} · &ldquo;{seat.question}&rdquo;
                {weight ? ` · weight ${weight.weight}/3 (${weight.reason})` : ''}
              </div>
            </div>
          </div>

          <div className="tabs">
            {[1, 2, 3].map((r) =>
              cardsByRound[r] ? (
                <button
                  key={r}
                  type="button"
                  className={r === round ? 'on' : ''}
                  onClick={() => setRound(r)}
                >
                  Round {r}
                </button>
              ) : null
            )}
          </div>

          {card ? (
            <>
              <div className="card-text">{card.text}</div>
              {card.quotes?.length ? (
                <div className="quotes">
                  {card.quotes.map((q, i) => (
                    <div key={i} className={q.verified ? 'q-ok' : 'q-un'}>
                      {q.verified ? '✓ verified in framework corpus' : '? unverified quote'} ({q.source}): &ldquo;
                      {q.quote}&rdquo;
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ color: 'var(--muted)', padding: '12px 0' }}>
              No card for this seat yet. Click a seat during or after a round to read every word it wrote.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PastSessionsModal({
  sessions,
  onSelect,
  onClose,
}: {
  sessions: CouncilSessionSummary[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <h3 style={{ marginTop: 0 }}>Past councils &amp; example sessions</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessions.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>No saved councils yet.</div>
          ) : (
            sessions.map((x) => {
              const live = x.status === 'running';
              return (
                <div
                  key={x.id}
                  className="item"
                  style={live ? ({ '--c': 'var(--gold)' } as React.CSSProperties) : undefined}
                  onClick={() => onSelect(x.id)}
                >
                  <div className="item-top">
                    <span className="item-who">
                      {live ? '● LIVE · ' : ''}
                      {x.title || x.id}
                    </span>
                    <span className="item-round">
                      {x.mode}
                      {x.source === 'example' ? ' · Example' : x.jobId ? ' · Job' : ''}
                    </span>
                    <span className="item-scores">{x.id.slice(0, 14)}</span>
                  </div>
                  <div className="item-body">{(x.prompt || '').slice(0, 160)}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function HowItWorksModal({
  seats,
  onClose,
}: {
  seats: RosterSeatInfo[];
  onClose: () => void;
}) {
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <h3 style={{ marginTop: 0 }}>How the Council Room works</h3>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Each seat is an advisor grounded in a specific decision pillar. The Chair never takes a side: it sets up
          options, assigns weights (1x–3x), surfaces the fault lines, and computes the final score from the seats&apos;
          cards.
        </p>
        <div className="v-card" style={{ marginBottom: 10 }}>
          <h3>1. Setup &amp; weights</h3>
          <div>
            The Chair turns your question or Job brief into 2–4 concrete options (always including a smaller spike or
            &ldquo;don&apos;t do it&rdquo;) and weights each seat from <strong>1x to 3x</strong> by how central its
            pillar is.
          </div>
        </div>
        <div className="v-card" style={{ marginBottom: 10 }}>
          <h3>2. Round 1 — Independent opening positions</h3>
          <div>
            All seats write in parallel without seeing each other, so there is no anchoring. Each scores every option
            0–10, flags <strong>one-way vs. two-way doors</strong> and <strong>ruin risk</strong>, and names what would
            change its mind.
          </div>
        </div>
        <div className="v-card" style={{ marginBottom: 10 }}>
          <h3>3. Fault lines &amp; Round 2 — Rebuttals</h3>
          <div>
            The Chair names 1–3 <strong>cruxes</strong> (where the seats split). In Round 2 every seat reads the others,
            names who it disagrees with most (drawn as a red rebuttal arc across the table), concedes the strongest point
            against it, and states concrete conditions for yes.
          </div>
        </div>
        <div className="v-card" style={{ marginBottom: 10 }}>
          <h3>4. Draft resolution &amp; Round 3 — Vote</h3>
          <div>
            The Chair drafts a resolution from the weighted scores (7.5+ GO, 6.0–7.4 GO WITH CONDITIONS, 4.5–5.9
            RESHAPE, &lt;4.5 DON&apos;T DO IT; any unmitigated ruin risk caps at RESHAPE). Each seat stamps{' '}
            <strong>ENDORSE</strong>, <strong>AMEND</strong>, or <strong>DISSENT</strong> on its chest.
          </div>
        </div>
        <div className="v-card">
          <h3>The Roster ({seats.length} advisors across 2 boards)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', fontSize: 12.5 }}>
            {seats.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img
                  src={portraitUrl(s, 'base')}
                  alt={s.short}
                  style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', background: '#0d1017' }}
                />
                <div>
                  <strong style={{ color: s.color }}>{s.short}</strong> · {s.pillar}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
