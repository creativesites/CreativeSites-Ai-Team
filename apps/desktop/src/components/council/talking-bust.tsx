import * as React from 'react';

export type MouthShape = 'base' | 'open' | 'mid' | 'blink';

export interface RosterSeatInfo {
  key: string;
  name: string;
  short: string;
  initials: string;
  slug: string;
  pillar: string;
  question: string;
  dimension: string;
  color: string;
  boardGroup?: 'myaos' | 'operators';
  identityId?: string;
  portraitKey?: string;
}

const KNOWN_WEBP_PORTRAITS = new Set([
  'bezos',
  'blakely',
  'buffett',
  'garyvee',
  'graham',
  'hormozi',
  'leila',
  'martell',
  'musk',
  'naval',
  'sanchez',
  'wickman',
]);

/**
 * Generates an animated 4-frame SVG bust in the seat's color with initials on the chest,
 * animated blinking eyes, and 3 mouth shapes (base, open, mid).
 */
export function drawnBust(seat: RosterSeatInfo, shape: MouthShape): string {
  const c = seat.color || '#888888';
  const init = (seat.initials || seat.short.slice(0, 2)).toUpperCase();
  const eyes =
    shape === 'blink'
      ? '<path d="M210 218 Q232 226 254 218 M306 218 Q328 226 350 218" stroke="#1b1410" stroke-width="6" stroke-linecap="round" fill="none"/>'
      : '<circle cx="232" cy="215" r="10" fill="#1b1410"/><circle cx="328" cy="215" r="10" fill="#1b1410"/><circle cx="235" cy="212" r="3" fill="#fff"/><circle cx="331" cy="212" r="3" fill="#fff"/>';
  const mouth =
    shape === 'open'
      ? '<ellipse cx="280" cy="288" rx="26" ry="18" fill="#3a1614"/><path d="M258 280 H302" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'
      : shape === 'mid'
        ? '<ellipse cx="280" cy="287" rx="15" ry="11" fill="#3a1614"/>'
        : '<path d="M254 282 Q280 298 306 282" stroke="#3a1610" stroke-width="6" stroke-linecap="round" fill="none"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 560">
    <path d="M110 560 C120 410 200 365 280 365 C360 365 440 410 450 560 Z" fill="${c}"/>
    <rect x="248" y="315" width="64" height="70" rx="28" fill="#d9a982"/>
    <ellipse cx="280" cy="225" rx="108" ry="122" fill="#eabba0"/>
    <path d="M172 205 C172 115 220 92 280 92 C340 92 388 115 388 205 C368 165 328 150 280 150 C232 150 192 165 172 205 Z" fill="#2a2320"/>
    ${eyes}${mouth}
    <text x="280" y="488" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="64" fill="rgba(0,0,0,.38)">${init}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Returns the portrait URL for a seat and mouth shape.
 * Uses the 3D cartoon .webp frame when available, falling back to drawnBust SVG.
 */
export function portraitUrl(seat: RosterSeatInfo, shape: MouthShape = 'base', useDrawnFallback = false): string {
  if (useDrawnFallback) return drawnBust(seat, shape);
  const pKey = seat.portraitKey || seat.key;
  if (KNOWN_WEBP_PORTRAITS.has(pKey)) {
    return `/portraits/${pKey}-${shape}.webp`;
  }
  return drawnBust(seat, shape);
}

/**
 * Maps a word to a sequence of mouth shapes based on vowel/consonant clusters.
 */
export function shapesFor(word: string): MouthShape[] {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return ['base'];
  const out: MouthShape[] = [];
  for (const g of clean.match(/[aeiouy]+|[^aeiouy]+/g) || [clean]) {
    if (/[aei]/.test(g)) out.push('open');
    else if (/[ouwy]/.test(g)) out.push('mid');
    else if (/[mbpf]/.test(g)) out.push('base');
  }
  out.push('base');
  return out.slice(0, 4);
}

export function stanceClass(stance?: string): 'yes' | 'cond' | 'no' | '' {
  if (!stance) return '';
  if (/strong no|\bno\b|dissent/i.test(stance)) return 'no';
  if (/conditional|amend/i.test(stance)) return 'cond';
  if (/yes|endorse/i.test(stance)) return 'yes';
  return '';
}

export function TalkingBust({
  seat,
  shape,
  leanTransform,
}: {
  seat: RosterSeatInfo;
  shape: MouthShape;
  leanTransform?: string;
}) {
  const [failedWebp, setFailedWebp] = React.useState(false);

  return (
    <div className="bust" data-shape={shape} style={{ transform: leanTransform || '' }}>
      {(['base', 'open', 'mid', 'blink'] as const).map((s) => (
        <img
          key={s}
          className={`frame f-${s}`}
          src={portraitUrl(seat, s, failedWebp)}
          alt={s === 'base' ? seat.name : ''}
          onError={() => {
            if (!failedWebp) setFailedWebp(true);
          }}
        />
      ))}
    </div>
  );
}
