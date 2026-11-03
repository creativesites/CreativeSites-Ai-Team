import * as React from 'react';
import { Check, Download, Plus, Trash2 } from 'lucide-react';
import type { CouncilOption, CreateTaskInput, Identity } from '@runtime/types';
import { badgeClass } from './council-stage';
import { portraitUrl, type RosterSeatInfo } from './talking-bust';
import { downloadVerdictPdf } from '@/lib/council-pdf';

export function VerdictSheet({
  sessionId,
  councilId,
  jobId,
  setup,
  verdictEvent,
  byKey,
  identities,
  ownerId,
  onClose,
  onOpenSeatCard,
  onAcceptPlan,
  accepting,
  acceptedNotice,
}: {
  sessionId?: string | null;
  councilId?: string | null;
  jobId?: string | null;
  setup: {
    title?: string;
    decision?: string;
    mode?: string;
    options?: CouncilOption[];
    seats?: string[];
  };
  verdictEvent: {
    verdict: any;
    seats?: any[];
  };
  byKey: Record<string, RosterSeatInfo>;
  identities: Identity[];
  ownerId: string;
  onClose: () => void;
  onOpenSeatCard: (seatKey: string, round?: number) => void;
  onAcceptPlan?: (tasks: CreateTaskInput[]) => Promise<void>;
  accepting?: boolean;
  acceptedNotice?: string | null;
}) {
  const v = verdictEvent.verdict;
  const seats = verdictEvent.seats || [];
  const options: CouncilOption[] = setup.options || [];

  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);

  const initialTasks = React.useMemo<CreateTaskInput[]>(() => {
    if (Array.isArray(v.tasks) && v.tasks.length > 0) {
      return v.tasks;
    }
    const steps: { when?: string; action: string }[] = Array.isArray(v.next_steps) ? v.next_steps : [];
    if (steps.length > 0) {
      return steps.slice(0, 4).map((s, idx) => ({
        title: `${s.when ? `[${s.when}] ` : ''}${s.action}`,
        assigneeId: idx === 2 ? 'kael' : idx === 1 ? 'atlas' : 'daedalus',
        checkCommand: idx === 1 ? 'cd apps/desktop && npm run typecheck' : 'cd runtime && npm test && npx tsc --noEmit',
        gate: idx === 2 ? 'Independent verifier sign-off' : 'Automated check exits 0',
        mode: idx === 2 ? 'verify' : 'build',
      }));
    }
    return [
      {
        title: `Execute recommended Option ${v.recommended || v.topId || 'A'} (${setup.title || 'Council Plan'})`,
        assigneeId: 'daedalus',
        checkCommand: 'cd runtime && npm test && npx tsc --noEmit',
        gate: 'Tests and typecheck pass',
        mode: 'build',
      },
      {
        title: `Independent verification of ${setup.title || 'Council Plan'}`,
        assigneeId: 'kael',
        checkCommand: 'cd runtime && npm test',
        gate: 'Verified by non-author verifier',
        mode: 'verify',
      },
    ];
  }, [v, setup.title]);

  const [tasks, setTasks] = React.useState<CreateTaskInput[]>(initialTasks);

  React.useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const findSeat = (nameOrKey: unknown): RosterSeatInfo | undefined => {
    const t = String(nameOrKey || '').toLowerCase().trim();
    if (!t) return undefined;
    return Object.values(byKey).find(
      (s) =>
        s.key === t.replace(/\s+/g, '') ||
        s.short.toLowerCase() === t ||
        s.name.toLowerCase() === t ||
        t.includes((s.name.split(' ').pop() || '').toLowerCase())
    );
  };

  const optLabel = (id: string) => options.find((o) => o.id === id)?.label || id;

  const votesStr = v.votes
    ? ` · Votes: ${v.votes.endorse || 0} endorse, ${v.votes.amend || 0} amend, ${v.votes.dissent || 0} dissent`
    : '';

  const minoritySeat = findSeat(v.minority?.seat);

  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      await downloadVerdictPdf({
        setup,
        verdict: verdictEvent,
        byKey,
        id: sessionId || councilId,
      });
    } catch (e) {
      setPdfError((e as Error)?.message || 'Could not generate PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  const coworkers = identities.filter((i) => !i.isOwner && i.id !== ownerId);

  return (
    <section className="verdict-sheet" aria-label="Council verdict">
      <div className="verdict-inner">
        <div className="v-head">
          <div style={{ flex: 1, minWidth: 280 }}>
            <span className={`v-stamp ${badgeClass(v.label)}`}>{v.label}</span>
            <div className="v-call">{v.call}</div>
            <div className="v-meta">
              Recommended:{' '}
              <strong>
                Option {v.recommended || v.topId} ({optLabel(v.recommended || v.topId)})
              </strong>{' '}
              · Confidence {v.confidence ?? '—'}/10 · Spread {v.spread ?? 0}
              {v.support != null ? ` · Resolution support ${v.support}/10` : ''}
              {votesStr}
            </div>
            {v.override_note ? (
              <div style={{ marginTop: 6, color: 'var(--amber)', fontSize: 12.5 }}>
                Override: {v.override_note}
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="primary" onClick={handleDownloadPdf} disabled={pdfBusy}>
              <Download className="size-4" />
              {pdfBusy ? 'Building PDF…' : 'Download PDF'}
            </button>
            <button type="button" className="ghost" onClick={onClose}>
              Back to the table
            </button>
          </div>
        </div>

        {pdfError ? (
          <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 10 }}>{pdfError}</div>
        ) : null}

        {/* 2x2 Summary Grid */}
        <div className="v-grid">
          <div className="v-card">
            <h3>Scores</h3>
            {options.map((o) => {
              const sc = v.scores?.[o.id]?.score;
              const isRec = o.id === (v.recommended || v.topId);
              return (
                <div
                  key={o.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '5px 0',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <span>
                    <strong style={{ color: isRec ? 'var(--gold)' : 'var(--text)' }}>{o.id}.</strong> {o.label}
                  </span>
                  <strong style={{ color: 'var(--gold)', whiteSpace: 'nowrap' }}>{sc ?? '—'}/10</strong>
                </div>
              );
            })}
          </div>

          <div className="v-card">
            <h3>Why</h3>
            <ul className="why-list">
              {(v.why || []).slice(0, 4).map((w: any, idx: number) => {
                const s = findSeat(w.seat);
                return (
                  <li key={idx}>
                    {s ? <img className="v-face" src={portraitUrl(s, 'base')} alt={s.short} /> : null}
                    <div>
                      {w.point}{' '}
                      <span style={{ color: 'var(--muted)' }}>
                        ({w.seat}
                        {w.framework ? `, ${w.framework}` : ''})
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="v-card">
            <h3>Watch out (Minority Report)</h3>
            <div className="minority-row">
              {minoritySeat ? (
                <img className="v-face" src={portraitUrl(minoritySeat, 'base')} alt={minoritySeat.short} />
              ) : null}
              <div>
                <div>
                  <strong>{v.minority?.seat || 'Dissent'}:</strong> &ldquo;{v.minority?.quote || 'None recorded.'}&rdquo;
                </div>
                {v.minority?.would_have_to_be_true ? (
                  <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12.5 }}>
                    <strong>What would make them right:</strong> {v.minority.would_have_to_be_true}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="v-card">
            <h3>Next steps</h3>
            <ul>
              {(v.next_steps || []).slice(0, 4).map((n: any, idx: number) => (
                <li key={idx}>
                  <strong>{n.when}:</strong> {n.action}
                </li>
              ))}
            </ul>
            {v.kill_criteria ? (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '1px solid var(--line)',
                  fontSize: 12.5,
                  color: 'var(--muted)',
                }}
              >
                <strong style={{ color: 'var(--red)' }}>Kill it if:</strong> {v.kill_criteria}
              </div>
            ) : null}
          </div>
        </div>

        {/* MyaOS Job Plan Handoff Section */}
        {jobId && councilId && onAcceptPlan && (
          <div
            className="v-card full"
            style={{
              marginTop: 16,
              borderColor: 'rgba(240, 180, 76, 0.45)',
              background: 'rgba(19, 22, 30, 0.96)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ marginBottom: 2 }}>MyaOS Build Plan &amp; Task Handoff</h3>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  Accepting this verdict writes the chosen option to the Job plan, creates the checkable tasks below, and unlocks the Build stage.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    setTasks((prev) => [
                      ...prev,
                      {
                        title: 'New verification or build task',
                        assigneeId: coworkers[0]?.id ?? 'daedalus',
                        checkCommand: 'cd runtime && npm test',
                        gate: 'Check command exits 0',
                        mode: 'build',
                      },
                    ])
                  }
                >
                  <Plus className="size-3.5" /> Add task
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={accepting || tasks.length === 0}
                  onClick={() => void onAcceptPlan(tasks)}
                >
                  <Check className="size-4" />
                  {accepting ? 'Accepting Plan…' : 'Accept Plan & Start Build'}
                </button>
              </div>
            </div>

            {acceptedNotice ? (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(46, 204, 139, 0.15)',
                  border: '1px solid var(--green)',
                  color: 'var(--green)',
                  marginBottom: 10,
                  fontSize: 13,
                }}
              >
                {acceptedNotice}
              </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tasks.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 140px 220px auto',
                    gap: 8,
                    alignItems: 'center',
                    background: '#0d1017',
                    padding: 8,
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                  }}
                >
                  <input
                    value={t.title}
                    onChange={(e) =>
                      setTasks((prev) => prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item)))
                    }
                    placeholder="Task title"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--line)',
                      borderRadius: 6,
                      padding: '5px 8px',
                      color: 'var(--text)',
                      fontSize: 12.5,
                    }}
                  />
                  <select
                    value={t.assigneeId || ''}
                    onChange={(e) =>
                      setTasks((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, assigneeId: e.target.value || null } : item))
                      )
                    }
                    style={{
                      background: '#13161e',
                      border: '1px solid var(--line)',
                      borderRadius: 6,
                      padding: '5px 8px',
                      color: 'var(--text)',
                      fontSize: 12,
                    }}
                  >
                    <option value="">Unassigned</option>
                    {coworkers.map((cw) => (
                      <option key={cw.id} value={cw.id}>
                        {cw.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={t.checkCommand || ''}
                    onChange={(e) =>
                      setTasks((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, checkCommand: e.target.value || null } : item))
                      )
                    }
                    placeholder="Check command (e.g. npm test)"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--line)',
                      borderRadius: 6,
                      padding: '5px 8px',
                      color: 'var(--muted)',
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 11.5,
                    }}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setTasks((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Remove task"
                    style={{ padding: '5px 8px' }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expandable Full Details */}
        <details className="v-more">
          <summary>Full detail — where they fought, conditions, scorecard, and amendments</summary>
          <div className="v-grid">
            <div className="v-card">
              <h3>Where they fought</h3>
              <ul>
                {(v.fights || []).map((f: any, idx: number) => (
                  <li key={idx}>
                    <strong>{f.crux}</strong> — {f.story}
                  </li>
                ))}
              </ul>
            </div>

            <div className="v-card">
              <h3>Conditions</h3>
              <ol>
                {(v.conditions || []).map((c: string, idx: number) => (
                  <li key={idx}>{c}</li>
                ))}
              </ol>
            </div>

            <div className="v-card full">
              <h3>Scorecard</h3>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>
                {options.map((o) => `${o.id}: ${v.scores?.[o.id]?.math || ''} = ${v.scores?.[o.id]?.score ?? '—'}`).join(' · ')}
              </div>
              <table className="v-table">
                <thead>
                  <tr>
                    <th>Seat</th>
                    <th>Wt</th>
                    {options.map((o) => (
                      <th key={o.id}>{o.id}</th>
                    ))}
                    <th>Pillar</th>
                    <th>Vote / Stance</th>
                    <th>Moved</th>
                    <th>Remember</th>
                  </tr>
                </thead>
                <tbody>
                  {seats.map((s: any) => {
                    const seatInfo = byKey[s.key];
                    return (
                      <tr
                        key={s.key}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          onClose();
                          onOpenSeatCard(s.key);
                        }}
                      >
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {seatInfo ? (
                              <img
                                className="v-face"
                                style={{ width: 24, height: 24 }}
                                src={portraitUrl(seatInfo, 'base')}
                                alt={seatInfo.short}
                              />
                            ) : null}
                            <strong style={{ color: seatInfo?.color || 'var(--gold)' }}>
                              {seatInfo?.short || s.key}
                            </strong>
                          </span>
                        </td>
                        <td>{s.weight}x</td>
                        {options.map((o) => (
                          <td key={o.id}>{s.optionScores?.[o.id] ?? '—'}</td>
                        ))}
                        <td>{s.pillar ?? '—'}</td>
                        <td>{s.stance || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{s.moved || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{s.oneLine || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="v-card">
              <h3>Cheapest test &amp; Revisit</h3>
              <div>
                <strong>Cheapest test:</strong> {v.cheapest_test || '—'}
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Revisit:</strong> {v.revisit || '—'}
              </div>
            </div>

            {v.amendments?.length ? (
              <div className="v-card">
                <h3>Amendments</h3>
                <ul>
                  {v.amendments.map((a: any, idx: number) => (
                    <li key={idx}>
                      <strong>{a.seat}:</strong> {a.amendment}{' '}
                      <span style={{ color: a.adopted ? 'var(--green)' : 'var(--muted)' }}>
                        ({a.adopted ? 'Adopted' : 'Not adopted'}: {a.reason})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>

        <div className="v-disc">{v.disclaimer || ''}</div>
      </div>
    </section>
  );
}
