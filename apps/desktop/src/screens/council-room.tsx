import * as React from 'react';
import { ChevronLeft } from 'lucide-react';
import type {
  CouncilCrux,
  CouncilOption,
  CouncilStreamEvent,
  CreateTaskInput,
  Identity,
  JobDetail,
} from '@runtime/types';
import {
  CouncilStage,
  HowItWorksModal,
  PastSessionsModal,
  SeatCardModal,
  type FeedItemEntry,
  type RebuttalLink,
} from '@/components/council/council-stage';
import type { RosterSeatInfo } from '@/components/council/talking-bust';
import { spokenFor, useCouncilPlayer } from '@/components/council/use-council-player';
import { VerdictSheet } from '@/components/council/verdict-sheet';
import { href } from '@/lib/route';
import { useRuntime, useRuntimeData } from '@/lib/runtime-context';

const FALLBACK_SEATS: RosterSeatInfo[] = [
  {
    key: 'themis',
    name: 'Themis (Governance Lead)',
    short: 'Themis',
    initials: 'TH',
    slug: 'themis-governance',
    pillar: 'Outcome-led strategy & reversibility',
    question: 'Does this work backwards from the user outcome, and is it a one-way or two-way door?',
    dimension: 'Outcome alignment and reversibility',
    color: '#d9a441',
    boardGroup: 'myaos',
    portraitKey: 'bezos',
  },
  {
    key: 'daedalus',
    name: 'Daedalus (Runtime Architect)',
    short: 'Daedalus',
    initials: 'DA',
    slug: 'daedalus-architecture',
    pillar: 'First-principles systems & speed',
    question: 'What is the real substrate constraint, and what complexity can we delete right now?',
    dimension: 'Architectural simplicity and execution speed',
    color: '#e07a5f',
    boardGroup: 'myaos',
    portraitKey: 'musk',
  },
  {
    key: 'kael',
    name: 'Kael (Lead Verifier)',
    short: 'Kael',
    initials: 'KA',
    slug: 'kael-verifier',
    pillar: 'Independent verification & ruin risk',
    question: 'How do we prove this with un-mocked evidence, and what could cause silent ruin?',
    dimension: 'Epistemic integrity and downside protection',
    color: '#4a9eff',
    boardGroup: 'myaos',
    portraitKey: 'buffett',
  },
  {
    key: 'atlas',
    name: 'Atlas (Product & UX Lead)',
    short: 'Atlas',
    initials: 'AT',
    slug: 'atlas-product',
    pillar: 'User experience & real demand',
    question: 'Will the user feel an immediate difference in under 60 seconds?',
    dimension: 'User delight and tangible utility',
    color: '#3dd68c',
    boardGroup: 'myaos',
    portraitKey: 'graham',
  },
  {
    key: 'astra',
    name: 'Astra (Operations & Delivery)',
    short: 'Astra',
    initials: 'AS',
    slug: 'astra-operations',
    pillar: 'Operations, cadence & accountability',
    question: 'Who owns each checkable task, and can the loop finish without heroic intervention?',
    dimension: 'Operational readiness and clear ownership',
    color: '#1fa67a',
    boardGroup: 'myaos',
    portraitKey: 'wickman',
  },
  {
    key: 'vela',
    name: 'Vela (Growth & Economics)',
    short: 'Vela',
    initials: 'VE',
    slug: 'vela-economics',
    pillar: 'Value equation, ROI & token budget',
    question: 'Does the outcome justify the token burn, engineering hours, and opportunity cost?',
    dimension: 'Value equation and resource ROI',
    color: '#d94a6a',
    boardGroup: 'myaos',
    portraitKey: 'hormozi',
  },
  {
    key: 'muse',
    name: 'Muse (Brand & Craft)',
    short: 'Muse',
    initials: 'MU',
    slug: 'muse-brand',
    pillar: 'Visual craft, storytelling & attention',
    question: 'Does this look and feel unmistakable, or like another generic dashboard?',
    dimension: 'Visual craft and emotional resonance',
    color: '#9b5de5',
    boardGroup: 'myaos',
    portraitKey: 'garyvee',
  },
];

export function CouncilRoomScreen({
  jobId,
  initialOpenVerdict = false,
  identities,
  ownerId,
}: {
  jobId: string;
  initialOpenVerdict?: boolean;
  identities: Identity[];
  ownerId: string;
}) {
  const { client } = useRuntime();
  const rosterLoadable = useRuntimeData((c) => c.councilRoster());
  const sessionsLoadable = useRuntimeData((c) => c.councilSessions());
  const jobLoadable = useRuntimeData((c) => (jobId ? c.job(jobId) : Promise.resolve(null)), [jobId]);
  const jobCouncilsLoadable = useRuntimeData((c) => (jobId ? c.councils(jobId) : Promise.resolve([])), [jobId]);

  const seats: RosterSeatInfo[] =
    rosterLoadable.status === 'ready' && rosterLoadable.data.seats.length
      ? rosterLoadable.data.seats
      : FALLBACK_SEATS;

  const byKey = React.useMemo<Record<string, RosterSeatInfo>>(
    () => Object.fromEntries(seats.map((s) => [s.key, s])),
    [seats]
  );

  const player = useCouncilPlayer({ seats, byKey });

  const job: JobDetail | null = jobLoadable.status === 'ready' ? jobLoadable.data : null;

  const [prompt, setPrompt] = React.useState<string>('');
  const [mode, setMode] = React.useState<'full' | 'quick'>('full');
  const [boardGroup, setBoardGroup] = React.useState<'myaos' | 'operators'>('myaos');
  const [phaseLabel, setPhaseLabel] = React.useState<string>('Choose a question to begin');
  const [busy, setBusy] = React.useState<boolean>(false);
  // 'simulation' = the scripted runner (template cards, no agent woken); never presented as deliberation.
  const [_runMode, setRunMode] = React.useState<string | null>(null);

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [councilId, setCouncilId] = React.useState<string | null>(null);
  const [activeSeats, setActiveSeats] = React.useState<string[] | null>(null);
  const [setupState, setSetupState] = React.useState<{
    title?: string;
    decision?: string;
    mode?: string;
    options?: CouncilOption[];
    seats?: string[];
  }>({});
  const [weights, setWeights] = React.useState<Record<string, { weight: number; reason: string }>>({});
  const [stances, setStances] = React.useState<Record<string, string>>({});
  const [votes, setVotes] = React.useState<Record<string, string>>({});
  const [thinkingSeats, setThinkingSeats] = React.useState<Record<string, boolean>>({});
  const [links, setLinks] = React.useState<RebuttalLink[]>([]);
  const [options, setOptions] = React.useState<CouncilOption[]>([]);
  const [optionScores, setOptionScores] = React.useState<Record<string, { score: number | null; math: string }>>({});
  const [feedItems, setFeedItems] = React.useState<FeedItemEntry[]>([]);
  const [cardsBySeatRound, setCardsBySeatRound] = React.useState<
    Record<string, Record<number, { text: string; parsed: any; quotes: any[] }>>
  >({});
  const [cruxes, setCruxes] = React.useState<CouncilCrux[]>([]);
  const [cruxNote, setCruxNote] = React.useState<string>('');
  const [verdictEvent, setVerdictEvent] = React.useState<{ verdict: any; seats?: any[] } | null>(null);

  const [centerView, setCenterView] = React.useState<'ask' | 'wait' | 'cruxes' | 'plate'>('ask');
  const [waitStep, setWaitStep] = React.useState<string>('The Chair is reading your question…');
  const [waitSub, setWaitSub] = React.useState<string>('Each advisor argues from their own pillar.');
  const [waitStartedAt, setWaitStartedAt] = React.useState<number>(Date.now());
  const [waitElapsedSec, setWaitElapsedSec] = React.useState<number>(0);

  const [verdictOpen, setVerdictOpen] = React.useState<boolean>(initialOpenVerdict);
  const [seatModal, setSeatModal] = React.useState<{ seatKey: string; round?: number } | null>(null);
  const [pastOpen, setPastOpen] = React.useState<boolean>(false);
  const [howOpen, setHowOpen] = React.useState<boolean>(false);

  const [accepting, setAccepting] = React.useState<boolean>(false);
  const [acceptedNotice, setAcceptedNotice] = React.useState<string | null>(null);

  const streamAbortRef = React.useRef<AbortController | null>(null);
  const autoLoadedJobRef = React.useRef<string | null>(null);

  // Pre-fill prompt from the Job brief when loaded
  React.useEffect(() => {
    if (job && !prompt) {
      setPrompt(`${job.title}${job.brief && job.brief !== job.title ? `\n\n${job.brief}` : ''}`);
    }
  }, [job, prompt]);

  // Wait timer ticker
  React.useEffect(() => {
    if (centerView !== 'wait' || player.speakingSeat) return;
    const t = setInterval(() => {
      const sec = Math.max(0, Math.floor((Date.now() - waitStartedAt) / 1000));
      setWaitElapsedSec(sec);
      const musing = player.waitMusings[Math.floor(sec / 6) % player.waitMusings.length]!;
      setWaitSub(musing);
    }, 1000);
    return () => clearInterval(t);
  }, [centerView, player.speakingSeat, waitStartedAt, player.waitMusings]);

  const resetRoom = React.useCallback(() => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    player.resetPlayer();
    setBusy(false);
    setRunMode(null);
    setSessionId(null);
    setCouncilId(null);
    setActiveSeats(null);
    setSetupState({});
    setWeights({});
    setStances({});
    setVotes({});
    setThinkingSeats({});
    setLinks([]);
    setOptions([]);
    setOptionScores({});
    setFeedItems([]);
    setCardsBySeatRound({});
    setCruxes([]);
    setCruxNote('');
    setVerdictEvent(null);
    setVerdictOpen(false);
    setAcceptedNotice(null);
    setCenterView('ask');
    setPhaseLabel('Choose a question to begin');
  }, [player]);

  const handleEvent = React.useCallback(
    (ev: CouncilStreamEvent) => {
      switch (ev.type) {
        case 'phase': {
          const label = String(ev.label || '');
          setPhaseLabel(label);
          setWaitStep(label);
          setWaitStartedAt(typeof ev.at === 'number' ? ev.at : Date.now());
          setCenterView((prev) => (prev === 'plate' ? prev : 'wait'));
          break;
        }
        case 'setup': {
          const sOpts = (ev.options as CouncilOption[]) || [];
          const sSeats = (ev.seats as string[]) || [];
          const sWeights = (ev.weights as Record<string, { weight: number; reason: string }>) || {};
          setSetupState({
            title: String(ev.title || ''),
            decision: String(ev.decision || ''),
            mode: String(ev.mode || 'full'),
            options: sOpts,
            seats: sSeats,
          });
          setRunMode(typeof ev.runMode === 'string' ? ev.runMode : null);
          setActiveSeats(sSeats);
          setOptions(sOpts);
          setWeights(sWeights);
          if (sSeats.some((k) => byKey[k]?.boardGroup === 'operators')) {
            setBoardGroup('operators');
          } else if (sSeats.some((k) => byKey[k]?.boardGroup === 'myaos')) {
            setBoardGroup('myaos');
          }
          break;
        }
        case 'round_start': {
          const r = Number(ev.round || 1);
          setLinks([]);
          setFeedItems((prev) => [...prev, { id: `sep-r${r}-${Date.now()}`, type: 'sep', round: r }]);
          break;
        }
        case 'seat_start': {
          const seat = String(ev.seat || '');
          setThinkingSeats((prev) => ({ ...prev, [seat]: true }));
          break;
        }
        case 'seat_done': {
          const r = Number(ev.round || 1);
          const seat = String(ev.seat || '');
          const text = String(ev.text || '');
          const parsed = (ev.parsed as any) || {};
          const quotes = (ev.quotes as any[]) || [];

          setThinkingSeats((prev) => ({ ...prev, [seat]: false }));
          setCardsBySeatRound((prev) => ({
            ...prev,
            [seat]: {
              ...(prev[seat] || {}),
              [r]: { text, parsed, quotes },
            },
          }));
          setFeedItems((prev) => [
            ...prev,
            {
              id: `card-r${r}-${seat}`,
              type: 'card',
              round: r,
              seatKey: seat,
              parsed,
              text,
              quotes,
            },
          ]);

          const speech = spokenFor(r, parsed, byKey);
          player.push(async () => {
            if (r === 3 && parsed.vote) {
              setVotes((prev) => ({ ...prev, [seat]: parsed.vote }));
            } else if (parsed.stance) {
              setStances((prev) => ({ ...prev, [seat]: parsed.stance }));
            }
            if (r === 2 && parsed.disagreeWith && byKey[parsed.disagreeWith] && parsed.disagreeWith !== seat) {
              setLinks((prev) => [
                ...prev,
                {
                  id: `link-${seat}-${parsed.disagreeWith}`,
                  from: seat,
                  to: parsed.disagreeWith,
                  color: byKey[seat]?.color || '#f05a5a',
                },
              ]);
            }
            await player.speak({
              seatKey: seat,
              tag: speech.tag,
              text: speech.line,
              stance: speech.stance,
              target: r === 2 ? parsed.disagreeWith : null,
            });
          });
          break;
        }
        case 'round_done': {
          const scores = (ev.scores as Record<string, { score: number | null; math: string }>) || {};
          setOptionScores(scores);
          break;
        }
        case 'cruxes': {
          const cx = (ev.cruxes as CouncilCrux[]) || [];
          const note = String(ev.note || '');
          player.push(async () => {
            setCruxes(cx);
            setCruxNote(note);
            setCenterView('cruxes');
            await player.sleep(2400);
          });
          break;
        }
        case 'draft': {
          const d = (ev.draft as any) || {};
          player.push(async () => {
            setPhaseLabel(`Draft resolution: ${d.label || ''} on Option ${d.option || ''}`);
            await player.sleep(1000);
          });
          break;
        }
        case 'verdict': {
          const vPayload = {
            verdict: ev.verdict,
            seats: (ev.seats as any[]) || [],
          };
          player.push(async () => {
            if (ev.verdict && (ev.verdict as any).scores) {
              setOptionScores((ev.verdict as any).scores);
            }
            setVerdictEvent(vPayload);
            setPhaseLabel(`Verdict: ${(ev.verdict as any)?.label || 'Done'}`);
            setCenterView('plate');
            setVerdictOpen(true);
            setBusy(false);
          });
          break;
        }
        case 'error': {
          setPhaseLabel(`Error: ${String(ev.error || 'Unknown error')}`);
          setBusy(false);
          break;
        }
      }
    },
    [byKey, player]
  );

  const replaySession = React.useCallback(
    async (id: string, isCouncilId = false) => {
      if (!client) return;
      resetRoom();
      setSessionId(id);
      if (isCouncilId || id.startsWith('council')) {
        setCouncilId(id);
      }
      setCenterView('wait');
      setWaitStep('Loading council session…');
      try {
        const data = await client.councilSession(id);
        if (data.jobId && id.startsWith('council')) {
          setCouncilId(id);
        }
        player.setPlayerSpeed(1.6);
        for (const ev of data.events) {
          handleEvent(ev);
        }
      } catch (e) {
        setPhaseLabel(`Could not load session: ${(e as Error).message}`);
      }
    },
    [client, resetRoom, player, handleEvent]
  );

  // Automatically load the latest council for this job if one already exists
  React.useEffect(() => {
    if (!jobId || jobCouncilsLoadable.status !== 'ready') return;
    if (autoLoadedJobRef.current === jobId) return;
    const existing = jobCouncilsLoadable.data;
    if (existing.length > 0) {
      autoLoadedJobRef.current = jobId;
      const latest = existing[0]!;
      void replaySession(latest.id, true);
    }
  }, [jobId, jobCouncilsLoadable, replaySession]);

  const handleStartCouncil = async () => {
    if (!client || !prompt.trim()) return;
    const text = prompt.trim();
    resetRoom();
    setPrompt(text);
    setBusy(true);
    setCenterView('wait');
    setPhaseLabel('Convening the council…');
    setWaitStep('The Chair is reading your question…');

    try {
      const targetJobId = jobId;
      const res = await client.runCouncil(targetJobId, {
        prompt: text,
        mode,
        boardGroup,
      });
      setSessionId(res.sessionId);
      setCouncilId(res.council.id);
      const ctrl = new AbortController();
      streamAbortRef.current = ctrl;
      await client.streamCouncil(res.council.id, handleEvent, ctrl.signal);
    } catch (e) {
      setPhaseLabel(`Error: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  const handleCycleSpeed = () => {
    const next = player.speed === 1 ? 1.6 : player.speed === 1.6 ? 2.5 : 1;
    player.setPlayerSpeed(next);
  };

  const handleAcceptPlan = async (tasks: CreateTaskInput[]) => {
    if (!client || !councilId) return;
    setAccepting(true);
    setAcceptedNotice(null);
    try {
      await client.acceptCouncilVerdict(councilId, {
        actorId: ownerId || 'winston',
        tasks,
      });
      if (jobId) {
        try {
          await client.transitionJob(jobId, { to: 'plan', actorId: ownerId || 'winston' });
        } catch {
          // May already be in plan or build stage
        }
      }
      setAcceptedNotice(`Plan accepted and ${tasks.length} checkable tasks created on the Job. Redirecting to Job…`);
      setTimeout(() => {
        if (jobId) {
          window.location.hash = href({ name: 'job', jobId });
        }
      }, 900);
    } catch (e) {
      setAcceptedNotice(`Error: ${(e as Error).message}`);
    } finally {
      setAccepting(false);
    }
  };

  const effectiveCenterMode: 'ask' | 'wait' | 'caption' | 'cruxes' | 'plate' = player.speakingSeat
    ? 'caption'
    : centerView;

  const modalSeat = seatModal ? byKey[seatModal.seatKey] : null;

  return (
    <div className="roast-room-root">
      <header className="topbar">
        <div className="brand">
          {jobId ? (
            <a href={href({ name: 'job', jobId })} className="ghost" aria-label="Back to Job">
              <ChevronLeft className="size-4" /> Job
            </a>
          ) : null}
          <img className="brand-logo" src="/brand/ais-symbol-white.svg" alt="MyaOS" />
          <span className="brand-sep" />
          <span className="title">COUNCIL ROOM</span>
          <span className="sub">
            {job ? `${job.title.slice(0, 44)}` : 'Weighted multi-round advisory council'}
          </span>
        </div>

        <div className="phase">
          {phaseLabel}
        </div>

        <div className="top-actions">
          <button type="button" className="ghost" onClick={() => setHowOpen(true)}>
            How it works
          </button>
          <button type="button" className="ghost" onClick={() => setPastOpen(true)}>
            Past sessions
          </button>
          {(sessionId || verdictEvent || centerView !== 'ask') && (
            <button type="button" className="ghost" onClick={resetRoom}>
              New council
            </button>
          )}
        </div>
      </header>

      <CouncilStage
        seats={seats}
        byKey={byKey}
        activeSeats={activeSeats}
        weights={weights}
        stances={stances}
        votes={votes}
        thinkingSeats={thinkingSeats}
        speakingSeat={player.speakingSeat}
        targetSeat={player.targetSeat}
        mouthShapes={player.mouthShapes}
        links={links}
        centerMode={effectiveCenterMode}
        prompt={prompt}
        onPromptChange={setPrompt}
        mode={mode}
        onModeChange={setMode}
        boardGroup={boardGroup}
        onBoardGroupChange={setBoardGroup}
        onStartCouncil={() => void handleStartCouncil()}
        busy={busy}
        caption={player.caption}
        waitStep={waitStep}
        waitSub={waitSub}
        waitElapsedSec={waitElapsedSec}
        cruxes={cruxes}
        cruxNote={cruxNote}
        verdict={verdictEvent?.verdict}
        onOpenVerdict={() => setVerdictOpen(true)}
        onOpenSeatCard={(seatKey, round) => setSeatModal({ seatKey, round })}
        speed={player.speed}
        onCycleSpeed={handleCycleSpeed}
        onSkip={player.skip}
        queueCount={player.queueCount}
        options={options}
        optionScores={optionScores}
        feedItems={feedItems}
        onSelectSample={(sampleText) => {
          setPrompt(sampleText);
        }}
      />

      {verdictOpen && verdictEvent && (
        <VerdictSheet
          sessionId={sessionId}
          councilId={councilId}
          jobId={jobId}
          setup={setupState}
          verdictEvent={verdictEvent}
          byKey={byKey}
          identities={identities}
          ownerId={ownerId}
          onClose={() => setVerdictOpen(false)}
          onOpenSeatCard={(seatKey, round) => setSeatModal({ seatKey, round })}
          onAcceptPlan={councilId && jobId ? handleAcceptPlan : undefined}
          accepting={accepting}
          acceptedNotice={acceptedNotice}
        />
      )}

      {modalSeat && (
        <SeatCardModal
          seat={modalSeat}
          weight={weights[modalSeat.key]}
          cardsByRound={cardsBySeatRound[modalSeat.key] || {}}
          initialRound={seatModal?.round}
          onClose={() => setSeatModal(null)}
        />
      )}

      {pastOpen && (
        <PastSessionsModal
          sessions={sessionsLoadable.status === 'ready' ? sessionsLoadable.data.sessions : []}
          onSelect={(id) => {
            setPastOpen(false);
            void replaySession(id, id.startsWith('council'));
          }}
          onClose={() => setPastOpen(false)}
        />
      )}

      {howOpen && <HowItWorksModal seats={seats} onClose={() => setHowOpen(false)} />}
    </div>
  );
}
