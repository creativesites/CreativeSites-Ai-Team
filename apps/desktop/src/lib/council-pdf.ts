import type { RosterSeatInfo } from '@/components/council/talking-bust';

declare global {
  interface Window {
    jspdf?: {
      jsPDF: new (opts: Record<string, unknown>) => any;
    };
  }
}

const C = {
  ink: [7, 18, 28] as const,
  soft: [55, 68, 82] as const,
  mute: [112, 124, 138] as const,
  rule: [226, 231, 237] as const,
  tint: [243, 246, 249] as const,
  track: [228, 233, 239] as const,
  accent: [55, 189, 248] as const,
  white: [255, 255, 255] as const,
};

const LABEL = {
  go: [63, 207, 142] as const,
  amber: [255, 144, 37] as const,
  red: [255, 90, 79] as const,
};

const labelColor = (l: string) =>
  /DON'T/i.test(l) ? LABEL.red : /RESHAPE|WAIT/i.test(l) ? LABEL.amber : LABEL.go;

let libReady: Promise<void> | null = null;
function loadLib(): Promise<void> {
  if (window.jspdf) return Promise.resolve();
  libReady ??= new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = '/vendor/jspdf.umd.min.js';
    s.onload = () => res();
    s.onerror = () => rej(new Error('Could not load the PDF library'));
    document.head.appendChild(s);
  });
  return libReady;
}

const fileCache: Record<string, string> = {};
async function fetchBase64(url: string): Promise<string> {
  if (fileCache[url]) return fileCache[url]!;
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return (fileCache[url] = btoa(bin));
}

async function addFonts(doc: any): Promise<void> {
  const fonts: [string, string][] = [
    ['Montserrat-Regular.ttf', 'normal'],
    ['Montserrat-SemiBold.ttf', 'semibold'],
    ['Montserrat-Bold.ttf', 'bold'],
  ];
  for (const [file, style] of fonts) {
    doc.addFileToVFS(file, await fetchBase64(`/brand/fonts/${file}`));
    doc.addFont(file, 'Montserrat', style);
  }
}

const clean = (t: unknown): string =>
  String(t ?? '')
    .replace(/\s*\((?:S\d+|source[^)]*)[^)]*\)/gi, '')
    .replace(/\*\*/g, '')
    .replace(/[—–]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

const dateLine = (id?: string | null): string => {
  const m = String(id || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

export async function downloadVerdictPdf({
  setup,
  verdict: ev,
  byKey,
  id,
}: {
  setup: {
    title?: string;
    decision?: string;
    mode?: string;
    options?: { id: string; label: string }[];
    seats?: string[];
  };
  verdict: {
    verdict: any;
    seats?: any[];
  };
  byKey: Record<string, RosterSeatInfo>;
  id?: string | null;
}): Promise<string> {
  await loadLib();
  const { jsPDF } = window.jspdf!;
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  await addFonts(doc);
  const logo = 'data:image/png;base64,' + (await fetchBase64('/brand/ais-horizontal-on-light.png'));

  const v = ev.verdict;
  const seats = ev.seats || [];
  const options = setup.options || [];
  const seatKey = (x: unknown): string | undefined => {
    const t = String(x || '').toLowerCase().trim();
    return Object.values(byKey).find(
      (s) =>
        s.key === t.replace(/\s+/g, '') ||
        s.short.toLowerCase() === t ||
        s.name.toLowerCase() === t ||
        t.includes((s.name.split(' ').pop() || '').toLowerCase())
    )?.key;
  };
  const who = (x: unknown): string => {
    const k = seatKey(x);
    return (k && byKey[k]?.name) || String(x || '');
  };

  const W = 612;
  const H = 792;
  const M = 54;
  const CW = W - M * 2;
  let y = M;

  const font = (size: number, style = 'normal', color: readonly [number, number, number] = C.ink) => {
    doc.setFont('Montserrat', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lines = (text: unknown, width: number, size: number, style = 'normal'): string[] => {
    font(size, style);
    return doc.splitTextToSize(clean(text), width);
  };
  const lh = (size: number) => size * 1.42;
  const ensure = (h: number) => {
    if (y + h > H - 64) {
      doc.addPage();
      y = M;
    }
  };
  const para = (
    text: unknown,
    {
      size = 10.5,
      style = 'normal',
      color = C.soft,
      x = M,
      width = CW,
      gap = 6,
    }: {
      size?: number;
      style?: string;
      color?: readonly [number, number, number];
      x?: number;
      width?: number;
      gap?: number;
    } = {}
  ) => {
    const ls = lines(text, width, size, style);
    ensure(ls.length * lh(size));
    font(size, style, color);
    doc.text(ls, x, y + size, { lineHeightFactor: 1.42 });
    y += ls.length * lh(size) + gap;
  };
  const kicker = (text: string) => {
    font(8, 'semibold', C.mute);
    doc.setCharSpace(1.2);
    doc.text(text.toUpperCase(), M, y + 8);
    doc.setCharSpace(0);
    y += 16;
  };
  const section = (title: string, keep = 70) => {
    ensure(48 + keep);
    y += 10;
    doc.setDrawColor(...C.rule);
    doc.setLineWidth(0.75);
    doc.line(M, y, W - M, y);
    y += 16;
    font(12.5, 'bold', C.ink);
    doc.text(title, M, y + 10);
    y += 22;
  };
  const bullet = (label: string, text: string) => {
    const pre = label ? (/[?!.:]$/.test(label.trim()) ? `${label.trim()} ` : `${label}: `) : '';
    font(10.5, 'semibold');
    if (pre && doc.getTextWidth(pre) > CW * 0.4) {
      const head = lines(label, CW - 14, 10.5, 'semibold');
      const body = lines(text, CW - 14, 10.5);
      ensure((head.length + body.length) * lh(10.5) + 4);
      doc.setFillColor(...C.accent);
      doc.circle(M + 3, y + 6.6, 2.2, 'F');
      font(10.5, 'semibold', C.ink);
      doc.text(head, M + 14, y + 10.5, { lineHeightFactor: 1.42 });
      y += head.length * lh(10.5);
      font(10.5, 'normal', C.soft);
      doc.text(body, M + 14, y + 10.5, { lineHeightFactor: 1.42 });
      y += body.length * lh(10.5) + 5;
      return;
    }
    const preW = pre ? doc.getTextWidth(pre) : 0;
    const body = lines(text, CW - 14 - preW, 10.5);
    const rest = body.length > 1 ? lines(body.slice(1).join(' '), CW - 14, 10.5) : [];
    ensure((1 + rest.length) * lh(10.5) + 4);
    doc.setFillColor(...C.accent);
    doc.circle(M + 3, y + 6.6, 2.2, 'F');
    if (pre) {
      font(10.5, 'semibold', C.ink);
      doc.text(pre, M + 14, y + 10.5);
    }
    font(10.5, 'normal', C.soft);
    doc.text(body[0] || '', M + 14 + preW, y + 10.5);
    if (rest.length) doc.text(rest, M + 14, y + 10.5 + lh(10.5), { lineHeightFactor: 1.42 });
    y += (1 + rest.length) * lh(10.5) + 5;
  };

  // Header
  doc.addImage(logo, 'PNG', M, y, 62, (62 * 374) / 900, 'ais-logo', 'SLOW');
  font(15, 'bold', C.ink);
  doc.text('MyaOS · Planning Council', W - M, y + 12, { align: 'right' });
  font(8.5, 'normal', C.mute);
  doc.text(`Verdict report · ${dateLine(id)}`, W - M, y + 25, { align: 'right' });
  y += 40;
  doc.setDrawColor(...C.ink);
  doc.setLineWidth(1.2);
  doc.line(M, y, W - M, y);
  y += 26;

  // Decision
  kicker('The decision');
  const title = lines(setup.title || 'Untitled decision', CW, 22, 'bold');
  font(22, 'bold', C.ink);
  doc.text(title, M, y + 20, { lineHeightFactor: 1.18 });
  y += title.length * 22 * 1.18 + 8;
  const n = seats.length || (setup.seats || []).length;
  const rounds = v.votes ? 3 : 2;
  para(`${setup.mode === 'quick' ? 'Quick council' : 'Full council'} · ${n} advisors · ${rounds} rounds`, {
    size: 9.5,
    color: C.mute,
    gap: 4,
  });
  if (setup.decision) para(setup.decision, { size: 10.5, color: C.soft, gap: 8 });

  // Verdict Box
  const label = String(v.label || '').toUpperCase();
  font(13, 'bold');
  const badgeW = doc.getTextWidth(label) + 24;
  const callLines = lines(v.call, CW - 32, 12.5, 'semibold');
  const meta = [
    `Confidence ${v.confidence ?? '-'}/10`,
    v.votes ? `${v.votes.endorse || 0} endorse, ${v.votes.amend || 0} amend, ${v.votes.dissent || 0} dissent` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const boxH = 16 + 28 + 12 + callLines.length * lh(12.5) + 8 + 14 + 14;
  ensure(boxH + 10);
  y += 6;
  doc.setFillColor(...C.tint);
  doc.roundedRect(M, y, CW, boxH, 10, 10, 'F');
  doc.setFillColor(...labelColor(label));
  doc.roundedRect(M + 16, y + 16, badgeW, 28, 7, 7, 'F');
  font(13, 'bold', C.ink);
  doc.text(label, M + 16 + 12, y + 16 + 19);
  font(8, 'semibold', C.mute);
  doc.setCharSpace(1.2);
  doc.text("THE COUNCIL'S CALL", M + 16 + badgeW + 12, y + 16 + 17.5);
  doc.setCharSpace(0);
  let by = y + 16 + 28 + 12;
  font(12.5, 'semibold', C.ink);
  doc.text(callLines, M + 16, by + 12.5, { lineHeightFactor: 1.42 });
  by += callLines.length * lh(12.5) + 8;
  font(9.5, 'normal', C.mute);
  doc.text(meta, M + 16, by + 9.5);
  y += boxH + 8;

  // Scores
  section('Scores');
  const best = v.recommended || v.topId;
  for (const o of options) {
    const sc = v.scores?.[o.id]?.score;
    const isBest = o.id === best;
    const lab = lines(o.label, CW - 200, 10.5, isBest ? 'semibold' : 'normal');
    const rowH = Math.max(24, lab.length * lh(10.5) + 6);
    ensure(rowH + 6);
    doc.setFillColor(...(isBest ? C.ink : C.track));
    doc.roundedRect(M, y, 20, 20, 5, 5, 'F');
    font(10, 'bold', isBest ? C.white : C.soft);
    doc.text(o.id, M + 10, y + 13.8, { align: 'center' });
    font(10.5, isBest ? 'semibold' : 'normal', C.ink);
    doc.text(lab, M + 30, y + 13.5, { lineHeightFactor: 1.42 });
    const bx = W - M - 170;
    const bw = 120;
    doc.setFillColor(...C.track);
    doc.roundedRect(bx, y + 8, bw, 5, 2.5, 2.5, 'F');
    if (typeof sc === 'number') {
      doc.setFillColor(...(isBest ? C.accent : ([150, 205, 235] as const)));
      doc.roundedRect(bx, y + 8, Math.max(5, (bw * sc) / 10), 5, 2.5, 2.5, 'F');
    }
    font(14, 'bold', C.ink);
    doc.text(typeof sc === 'number' ? String(sc) : '-', W - M, y + 15, { align: 'right' });
    if (isBest) {
      font(7.5, 'semibold', C.accent);
      doc.text('RECOMMENDED', bx, y + 24);
    }
    y += rowH + 6;
  }
  para('Each advisor scores every option from 1 to 10, weighted by how much their area matters to this decision.', {
    size: 8.5,
    color: C.mute,
    gap: 0,
  });

  if (v.why?.length) {
    section('Why the council landed here');
    for (const w of v.why.slice(0, 4)) bullet(who(w.seat), w.point);
  }

  // How each advisor scored it
  if (seats.length) {
    section('How each advisor scored it', 18 + seats.length * 22);
    const showVote = Boolean(v.votes);
    const cols: { t: string; w: number; c?: boolean }[] = [
      { t: 'Advisor', w: 150 },
      { t: 'Weight', w: 52, c: true },
      ...options.map((o) => ({ t: o.id, w: 40, c: true })),
      ...(showVote ? [{ t: 'Vote', w: 70 }] : []),
    ];
    const head = () => {
      let x = M;
      font(8, 'semibold', C.mute);
      for (const c of cols) {
        doc.text(c.t.toUpperCase(), c.c ? x + c.w / 2 : x, y + 8, c.c ? { align: 'center' } : undefined);
        x += c.w;
      }
      y += 14;
      doc.setDrawColor(...C.rule);
      doc.setLineWidth(0.75);
      doc.line(M, y, W - M, y);
      y += 4;
    };
    ensure(40);
    head();
    for (const s of seats) {
      if (y + 22 > H - 64) {
        doc.addPage();
        y = M;
        head();
      }
      const info = byKey[s.key];
      let x = M;
      font(10, 'semibold', C.ink);
      doc.text(info?.name || s.key, x, y + 13);
      x += cols[0]!.w;
      font(10, 'normal', C.soft);
      doc.text(String(s.weight ?? '-'), x + cols[1]!.w / 2, y + 13, { align: 'center' });
      x += cols[1]!.w;
      for (const o of options) {
        font(10, 'semibold', C.ink);
        doc.text(String(s.optionScores?.[o.id] ?? '-'), x + 20, y + 13, { align: 'center' });
        x += 40;
      }
      if (showVote) {
        font(9.5, 'normal', C.soft);
        doc.text(String(s.stance || 'endorse').replace(/^./, (c) => c.toUpperCase()), x, y + 13);
      }
      y += 20;
      doc.setDrawColor(...C.rule);
      doc.line(M, y, W - M, y);
      y += 2;
    }
  }

  if (v.minority?.quote) {
    section('Watch out');
    para(`${who(v.minority.seat)}: "${clean(v.minority.quote)}"`, {
      size: 10.5,
      style: 'semibold',
      color: C.ink,
      gap: 4,
    });
    if (v.minority.would_have_to_be_true) {
      para(`For this to be right: ${v.minority.would_have_to_be_true}`, { size: 9.5, color: C.mute });
    }
  }
  if (v.next_steps?.length || v.cheapest_test || v.kill_criteria) {
    section('What to do next');
    for (const s of (v.next_steps || []).slice(0, 4)) bullet(s.when, s.action);
    if (v.cheapest_test) bullet('Cheapest test', v.cheapest_test);
    if (v.kill_criteria) bullet('Kill it if', v.kill_criteria);
  }
  if (v.fights?.length) {
    section('Where they fought');
    for (const f of v.fights.slice(0, 3)) bullet(f.crux, f.story);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...C.rule);
    doc.setLineWidth(0.75);
    doc.line(M, H - 46, W - M, H - 46);
    font(7.5, 'semibold', C.mute);
    const tag = `MyaOS Planning Council · ${p} of ${pages}`;
    const tagW = doc.getTextWidth(tag);
    doc.text(tag, W - M, H - 34, { align: 'right' });
    font(7.5, 'normal', C.mute);
    doc.text(
      doc.splitTextToSize(
        v.disclaimer || 'Simulated advisors built to stress-test decisions before build begins.',
        CW - tagW - 24
      ),
      M,
      H - 34,
      { lineHeightFactor: 1.35 }
    );
  }

  const name = `MyaOS Council - ${String(setup.title || id || 'verdict')
    .replace(/[\\/:*?"<>|]+/g, '')
    .slice(0, 80)}.pdf`;
  doc.save(name);
  return name;
}
