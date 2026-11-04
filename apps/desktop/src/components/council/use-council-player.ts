import * as React from 'react';
import { shapesFor, type MouthShape, type RosterSeatInfo } from './talking-bust';

export interface CaptionState {
  seatKey: string;
  who: string;
  color: string;
  tag: string;
  stance: string;
  words: string[];
  activeWordIndex: number;
  targetKey?: string | null;
}

export interface WaitCardState {
  visible: boolean;
  step: string;
  sub: string;
  elapsedSec: number;
}

const WAIT_MUSINGS = [
  'Weighing the options against each pillar…',
  'Looking for the one number the whole bet rests on…',
  'Checking who is over-optimistic and who is hedging…',
  'Comparing the downside if this goes wrong…',
  'Asking whether there is a cheaper way to find out…',
  'Checking whether this is a one-way or two-way door…',
];

export function spokenFor(round: number, p: any, byKey: Record<string, RosterSeatInfo>): { tag: string; line: string; stance: string } {
  if (!p) return { tag: `Round ${round}`, line: '', stance: '' };
  if (round === 1) {
    const line = [p.call, p.risk && `The risk is ${p.risk.replace(/^[Tt]he\s+/, '')}`, p.question && `My question: ${p.question}`]
      .filter(Boolean)
      .join(' ');
    return { tag: 'Round 1 · Opening position', line: line || p.stance || '', stance: p.stance || '' };
  }
  if (round === 2) {
    const tgt = p.disagreeWith && byKey[p.disagreeWith] ? byKey[p.disagreeWith].short : '';
    const lead = p.disagreeLine || (tgt ? `Pushing back on ${tgt}.` : '');
    const move = p.moved && !/^no\b/i.test(p.moved) ? ` Moved: ${p.moved}` : '';
    return {
      tag: tgt ? `Round 2 · Rebutting ${tgt}` : 'Round 2 · Debate',
      line: `${lead}${move}`.trim() || p.stance || '',
      stance: p.stance || '',
    };
  }
  const v = p.vote === 'endorse' ? 'I endorse the resolution.' : p.vote === 'amend' ? 'I endorse with an amendment.' : 'I dissent.';
  return {
    tag: 'Round 3 · Final vote',
    line: [v, p.amendment, p.oneLine].filter(Boolean).join(' '),
    stance: (p.vote || '').toUpperCase(),
  };
}

export function useCouncilPlayer({
  seats,
  byKey,
}: {
  seats: RosterSeatInfo[];
  byKey: Record<string, RosterSeatInfo>;
}) {
  const [speed, setSpeed] = React.useState<number>(1);
  const speedRef = React.useRef<number>(1);
  const [queueCount, setQueueCount] = React.useState<number>(0);
  const [speakingSeat, setSpeakingSeat] = React.useState<string | null>(null);
  const speakingSeatRef = React.useRef<string | null>(null);
  const [targetSeat, setTargetSeat] = React.useState<string | null>(null);
  const [mouthShapes, setMouthShapes] = React.useState<Record<string, MouthShape>>({});
  const [caption, setCaption] = React.useState<CaptionState | null>(null);

  const queueRef = React.useRef<Array<() => Promise<void>>>([]);
  const busyRef = React.useRef<boolean>(false);
  const wakeRef = React.useRef<(() => void) | null>(null);
  const skipNowRef = React.useRef<boolean>(false);

  const setPlayerSpeed = React.useCallback((next: number) => {
    speedRef.current = next;
    setSpeed(next);
  }, []);

  const setSeatMouth = React.useCallback((seatKey: string, shape: MouthShape) => {
    setMouthShapes((prev) => (prev[seatKey] === shape ? prev : { ...prev, [seatKey]: shape }));
  }, []);

  // Random blinking loop for idle seats
  React.useEffect(() => {
    if (!seats.length) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let cancelled = false;

    for (const s of seats) {
      const loop = () => {
        const t = setTimeout(() => {
          if (cancelled) return;
          if (speakingSeatRef.current !== s.key) {
            setSeatMouth(s.key, 'blink');
            const t2 = setTimeout(() => {
              if (!cancelled && speakingSeatRef.current !== s.key) {
                setSeatMouth(s.key, 'base');
              }
            }, 130);
            timers.add(t2);
          }
          loop();
        }, 2400 + Math.random() * 4200);
        timers.add(t);
      };
      loop();
    }

    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
  }, [seats, setSeatMouth]);

  const sleep = React.useCallback((ms: number) => {
    if (skipNowRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wakeRef.current = null;
        resolve();
      }, ms / speedRef.current);
      wakeRef.current = () => {
        clearTimeout(timer);
        wakeRef.current = null;
        resolve();
      };
    });
  }, []);

  const pump = React.useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    while (queueRef.current.length) {
      const fn = queueRef.current.shift()!;
      setQueueCount(queueRef.current.length);
      skipNowRef.current = false;
      try {
        await fn();
      } catch (e) {
        console.error('[council-player] step error:', e);
      }
    }
    busyRef.current = false;
    setQueueCount(0);
  }, []);

  const push = React.useCallback(
    (fn: () => Promise<void>) => {
      queueRef.current.push(fn);
      setQueueCount(queueRef.current.length);
      void pump();
    },
    [pump]
  );

  const skip = React.useCallback(() => {
    skipNowRef.current = true;
    if (wakeRef.current) wakeRef.current();
  }, []);

  const resetPlayer = React.useCallback(() => {
    queueRef.current.length = 0;
    setQueueCount(0);
    skip();
    speakingSeatRef.current = null;
    setSpeakingSeat(null);
    setTargetSeat(null);
    setCaption(null);
    setMouthShapes({});
  }, [skip]);

  const speak = React.useCallback(
    async ({
      seatKey,
      tag,
      text,
      stance,
      target,
    }: {
      seatKey: string;
      tag: string;
      text: string;
      stance: string;
      target?: string | null;
    }) => {
      const seat = byKey[seatKey];
      if (!seat) return;
      const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 55);
      if (!words.length) return;

      speakingSeatRef.current = seatKey;
      setSpeakingSeat(seatKey);
      setTargetSeat(target && byKey[target] && target !== seatKey ? target : null);
      setCaption({
        seatKey,
        who: seat.name,
        color: seat.color,
        tag,
        stance,
        words,
        activeWordIndex: 0,
        targetKey: target ?? null,
      });

      for (let i = 0; i < words.length; i++) {
        if (skipNowRef.current) break;
        setCaption((prev) => (prev ? { ...prev, activeWordIndex: i } : prev));
        const w = words[i]!;
        const dur = Math.max(170, w.length * 52);
        const shapes = shapesFor(w);
        const slice = dur / shapes.length;
        for (const sh of shapes) {
          if (skipNowRef.current) break;
          setSeatMouth(seatKey, sh);
          await sleep(slice);
        }
        if (/[.!?]$/.test(w)) {
          setSeatMouth(seatKey, 'base');
          await sleep(240);
        } else if (/[,;:]$/.test(w)) {
          setSeatMouth(seatKey, 'base');
          await sleep(110);
        }
      }

      setSeatMouth(seatKey, 'base');
      await sleep(520);
      speakingSeatRef.current = null;
      setSpeakingSeat(null);
      setTargetSeat(null);
    },
    [byKey, setSeatMouth, sleep]
  );

  return {
    speed,
    setPlayerSpeed,
    queueCount,
    speakingSeat,
    targetSeat,
    mouthShapes,
    caption,
    setCaption,
    push,
    sleep,
    skip,
    resetPlayer,
    speak,
    waitMusings: WAIT_MUSINGS,
  };
}
