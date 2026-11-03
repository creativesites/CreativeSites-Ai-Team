import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveCommunityDir } from '../community-sync.ts';

/**
 * Skill discovery and parsing (programme plan WP8; vision section 13).
 * Pure file handling: no database here. See service.ts for sync, selection and injection.
 */

export const WORKFLOWS = ['quick', 'feature', 'strategic', 'incident'] as const;
export type SkillWorkflow = (typeof WORKFLOWS)[number];

export interface LoadedSkill {
  id: string;
  name: string;
  version: string;
  contentHash: string;
  path: string;
  description: string;
  owner: string | null;
  triggers: string[];
  workflows: SkillWorkflow[];
  roles: string[];
  inputs: string[];
  outputs: string[];
  relatedSkills: string[];
  /** Instructions: the document without its frontmatter. */
  body: string;
}

type FmValue = string | string[];

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) return t.slice(1, -1);
  // Unquoted scalars may carry a trailing " # comment".
  return t.replace(/\s+#.*$/, '').trim();
}

/** Splits `---` frontmatter from the body. Returns null frontmatter when the document has none. */
export function splitFrontmatter(text: string): { front: string | null; body: string } {
  const src = text.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
  if (!m) return { front: null, body: src };
  return { front: m[1]!, body: src.slice(m[0].length).replace(/^\n+/, '') };
}

/**
 * Parses the YAML subset the catalog uses: scalars, `>`/`|` blocks, inline `[a, b]` lists, and
 * block lists of scalars (including `- key: type` entries, kept as the plain string).
 */
export function parseFrontmatter(front: string): Record<string, FmValue> {
  const out: Record<string, FmValue> = {};
  const lines = front.split('\n');
  const isIndented = (l: string | undefined) => l !== undefined && (/^\s+\S/.test(l) || l.trim() === '');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim() || line.trimStart().startsWith('#') || /^\s/.test(line)) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    const rest = m[2]!.trim();
    if (/^[>|][+-]?$/.test(rest)) {
      const folded = rest.startsWith('>');
      const parts: string[] = [];
      while (i + 1 < lines.length && isIndented(lines[i + 1])) parts.push(lines[++i]!.trim());
      out[key] = folded ? parts.join(' ').replace(/\s+/g, ' ').trim() : parts.join('\n').trim();
    } else if (rest === '' || rest.startsWith('#')) {
      const items: string[] = [];
      while (i + 1 < lines.length && isIndented(lines[i + 1])) {
        const li = /^\s*-\s*(.*)$/.exec(lines[++i]!);
        if (li) items.push(unquote(li[1]!));
      }
      out[key] = items;
    } else if (rest.startsWith('[') && rest.includes(']')) {
      out[key] = rest
        .slice(1, rest.lastIndexOf(']'))
        .split(',')
        .map(unquote)
        .filter(Boolean);
    } else {
      out[key] = unquote(rest);
    }
  }
  return out;
}

const asList = (v: FmValue | undefined): string[] => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []);
const asText = (v: FmValue | undefined): string => (Array.isArray(v) ? v.join(', ') : (v ?? ''));

/** First 12 hex characters of the SHA-256 of the whole file: any edit changes it. */
export function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/** Parses one SKILL.md. Returns null when it has no frontmatter or lacks a name/version. */
export function parseSkill(text: string, filePath: string, fallbackId?: string): LoadedSkill | null {
  const { front, body } = splitFrontmatter(text);
  if (front === null) return null;
  const fm = parseFrontmatter(front);
  const id = asText(fm.name).trim() || fallbackId || '';
  const version = asText(fm.version).trim();
  if (!id || !version) return null;
  return {
    id,
    name: id,
    version,
    contentHash: contentHash(text),
    path: filePath,
    description: asText(fm.description),
    owner: asText(fm.owner) || null,
    triggers: asList(fm.triggers).map((t) => t.toLowerCase()),
    workflows: asList(fm.workflows).filter((w): w is SkillWorkflow => (WORKFLOWS as readonly string[]).includes(w)),
    roles: asList(fm.roles),
    inputs: asList(fm.inputs),
    outputs: asList(fm.outputs),
    relatedSkills: asList(fm.related_skills),
    body,
  };
}

/** The skills root: explicit option, then setting `skillsRoot`, then env MYAOS_SKILLS_ROOT, then `<community>/skills`. */
export function resolveSkillsRoot(opts: { explicit?: string | null; setting?: unknown } = {}): string | null {
  const expand = (p: string) => (p === '~' || p.startsWith('~/') ? path.join(process.env.HOME || '', p.slice(1)) : p);
  const given = [opts.explicit, typeof opts.setting === 'string' ? opts.setting : null, process.env.MYAOS_SKILLS_ROOT];
  for (const g of given) {
    if (g && g.trim()) return path.resolve(expand(g.trim()));
  }
  const community = resolveCommunityDir();
  return community ? path.join(community, 'skills') : null;
}

export interface DiscoverResult {
  root: string | null;
  skills: LoadedSkill[];
  /** Files that could not be parsed (path and reason). */
  skipped: { path: string; reason: string }[];
}

/** Reads `<root>/<id>/SKILL.md` for every directory. Read-only. Sorted by id. */
export function discoverSkills(root: string | null): DiscoverResult {
  const result: DiscoverResult = { root, skills: [], skipped: [] };
  if (!root || !fs.existsSync(root)) return result;
  const seen = new Set<string>();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    try {
      const skill = parseSkill(fs.readFileSync(file, 'utf8'), file, entry.name);
      if (!skill) result.skipped.push({ path: file, reason: 'missing frontmatter name or version' });
      else if (seen.has(skill.id)) result.skipped.push({ path: file, reason: `duplicate skill id ${skill.id}` });
      else {
        seen.add(skill.id);
        result.skills.push(skill);
      }
    } catch (e) {
      result.skipped.push({ path: file, reason: (e as Error).message });
    }
  }
  result.skills.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return result;
}
