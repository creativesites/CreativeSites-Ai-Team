import { cn } from '@/lib/utils';

// Generic avatars: a mark and a colour the owner picks. Never a face.

export const AVATAR_MARKS: Record<string, { name: string; d: string }> = {
  diamond: { name: 'Diamond', d: 'M12 4 L20 12 L12 20 L4 12 Z' },
  hex: { name: 'Hexagon', d: 'M12 4 L19 8 V16 L12 20 L5 16 V8 Z' },
  shield: { name: 'Shield', d: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' },
  wave: { name: 'Wave', d: 'M4 14 C7 9 9 9 12 14 S17 19 20 12' },
  star: { name: 'Star', d: 'M12 4 V20 M4 12 H20 M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5' },
  arcs: { name: 'Arcs', d: 'M5 17 A8 8 0 0 1 19 17 M8 17 A4 4 0 0 1 16 17' },
  ring: { name: 'Ring', d: 'M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z' },
  bars: { name: 'Bars', d: 'M7 17V11M12 17V7M17 17V13' },
  triangle: { name: 'Triangle', d: 'M12 5 L19 18 H5 Z' },
  moon: { name: 'Moon', d: 'M15 5a7 7 0 1 0 4 12a6 6 0 0 1-4-12z' },
  square: { name: 'Square', d: 'M7 7h10v10H7z M10 10h4v4h-4z' },
  knot: { name: 'Knot', d: 'M8 8a4 4 0 1 1 8 8a4 4 0 1 1-8-8z M8 16a4 4 0 1 1 8-8' },
};

export const AVATAR_COLORS: Record<string, { name: string; bg: string; fg: string }> = {
  amber: { name: 'Amber', bg: '#3A2E1A', fg: '#F2B866' },
  blue: { name: 'Blue', bg: '#1F2B44', fg: '#8DB8FF' },
  green: { name: 'Green', bg: '#1E3A2C', fg: '#6FD39B' },
  violet: { name: 'Violet', bg: '#33213A', fg: '#D59CF0' },
  teal: { name: 'Teal', bg: '#1D3438', fg: '#7FD6E0' },
  rose: { name: 'Rose', bg: '#3A2224', fg: '#F09A9A' },
  indigo: { name: 'Indigo', bg: '#2A2A3E', fg: '#AFA8F5' },
  graphite: { name: 'Graphite', bg: '#2E2E2E', fg: '#D0D0D0' },
};

export interface AvatarLike {
  name: string;
  avatarMark?: string | null;
  avatarColor?: string | null;
}

/** The person using the app: a light disc with their initial. */
export function OwnerAvatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-foreground font-semibold text-background', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Avatar({
  who,
  size = 28,
  dot,
  className,
}: {
  who: AvatarLike;
  size?: number;
  /** A presence dot in the corner (a CSS colour), shown only when the runtime knows. */
  dot?: string;
  className?: string;
}) {
  const mark = who.avatarMark ? AVATAR_MARKS[who.avatarMark] : undefined;
  const color = AVATAR_COLORS[who.avatarColor ?? ''] ?? AVATAR_COLORS.graphite;
  const glyph = Math.round(size * 0.56);
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full', className)}
      style={{ width: size, height: size, background: color.bg, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' }}
    >
      {mark ? (
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke={color.fg} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d={mark.d} />
        </svg>
      ) : (
        <span style={{ color: color.fg, fontSize: Math.round(size * 0.42), fontWeight: 600 }}>{who.name.slice(0, 1).toUpperCase()}</span>
      )}
      {dot && (
        <span
          className="absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-background"
          style={{ width: Math.max(8, size * 0.32), height: Math.max(8, size * 0.32), background: dot }}
        />
      )}
    </span>
  );
}
