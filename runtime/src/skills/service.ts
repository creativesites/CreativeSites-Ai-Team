import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Repo } from '../store/repo.ts';
import { discoverSkills, resolveSkillsRoot, parseSkill, splitFrontmatter, parseFrontmatter, WORKFLOWS, type LoadedSkill, type SkillWorkflow } from './loader.ts';

/**
 * Skill registry, selection and injection (programme plan WP8).
 * The `skills` table keeps every (id, content hash) ever loaded, so a task keeps the exact text
 * it was given even after the file is edited. `task_skills` pins that choice per task.
 */

export const MAX_SKILLS_PER_TASK = 4;
const PER_SKILL_CHARS = 6000;
const PACKET_CHARS = 16000;

export interface SkillTaskInput {
  id: string;
  title: string;
  description?: string | null;
  requiredSkills?: string[] | null;
}

export interface SkillJobInput {
  workflow?: SkillWorkflow | string | null;
}

export interface SkillSummary {
  id: string;
  name: string;
  version: string;
  contentHash: string;
  path: string;
  description: string;
  triggers: string[];
  workflows: string[];
  roles: string[];
  loadedAt: string;
}

export interface SelectedSkill {
  taskId: string;
  skillId: string;
  version: string | null;
  contentHash: string;
  selectedAt: string;
  reason: string;
}

export interface SyncResult {
  root: string | null;
  found: number;
  added: number;
  unchanged: number;
  skipped: { path: string; reason: string }[];
}

export interface SaveSkillInput {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  owner?: string | null;
  triggers?: string[];
  workflows?: SkillWorkflow[];
  roles?: string[];
  inputs?: string[];
  outputs?: string[];
  relatedSkills?: string[];
  body?: string;
  rawContent?: string;
}

type Row = Record<string, unknown>;
const parseArr = (v: unknown): string[] => {
  try {
    const x = JSON.parse(String(v ?? '[]'));
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
};

const toSummary = (r: Row): SkillSummary => ({
  id: String(r.id),
  name: String(r.name),
  version: String(r.version),
  contentHash: String(r.content_hash),
  path: String(r.path),
  description: String(r.description ?? ''),
  triggers: parseArr(r.triggers),
  workflows: parseArr(r.workflows),
  roles: parseArr(r.roles),
  loadedAt: String(r.loaded_at),
});

function mentions(text: string, trigger: string): boolean {
  const t = trigger.trim().toLowerCase();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
}

export class SkillService {
  private readonly db: DatabaseSync;
  private readonly getSetting: () => unknown;
  private readonly explicitRoot: string | null;
  private readonly now: () => Date;
  /** What the last sync found on disk: the skills a new selection may choose from. */
  private current = new Map<string, LoadedSkill>();
  private synced = false;

  constructor(db: DatabaseSync, opts: { skillsRoot?: string | null; getSetting?: () => unknown; now?: () => Date } = {}) {
    this.db = db;
    this.explicitRoot = opts.skillsRoot ?? null;
    this.getSetting = opts.getSetting ?? (() => undefined);
    this.now = opts.now ?? (() => new Date());
  }

  root(): string | null {
    return resolveSkillsRoot({ explicit: this.explicitRoot, setting: this.getSetting() });
  }

  /** Reads the skills root and records any file content not seen before. Unchanged files are no-ops. */
  sync(): SyncResult {
    const found = discoverSkills(this.root());
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO skills (id, name, version, content_hash, path, description, triggers, workflows, roles, body, loaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let added = 0;
    const at = this.now().toISOString();
    const next = new Map<string, LoadedSkill>();
    for (const s of found.skills) {
      next.set(s.id, s);
      const r = insert.run(s.id, s.name, s.version, s.contentHash, s.path, s.description, JSON.stringify(s.triggers), JSON.stringify(s.workflows), JSON.stringify(s.roles), s.body, at);
      if (Number(r.changes) > 0) added++;
    }
    this.current = next;
    this.synced = true;
    return { root: found.root, found: found.skills.length, added, unchanged: found.skills.length - added, skipped: found.skipped };
  }

  private ensureSynced() {
    if (!this.synced) this.sync();
  }

  /** The current version of every skill (as last read from disk). */
  list(): SkillSummary[] {
    this.ensureSynced();
    return [...this.current.values()].map((s) => {
      const row = this.db.prepare('SELECT * FROM skills WHERE id = ? AND content_hash = ?').get(s.id, s.contentHash) as Row | undefined;
      return row ? toSummary(row) : { id: s.id, name: s.name, version: s.version, contentHash: s.contentHash, path: s.path, description: s.description, triggers: s.triggers, workflows: s.workflows, roles: s.roles, loadedAt: '' };
    });
  }

  /** One skill with its instructions: the pinned hash when given, otherwise the current version. */
  get(id: string, contentHash?: string): (SkillSummary & { body: string }) | null {
    this.ensureSynced();
    const hash = contentHash ?? this.current.get(id)?.contentHash;
    const row = hash
      ? (this.db.prepare('SELECT * FROM skills WHERE id = ? AND content_hash = ?').get(id, hash) as Row | undefined)
      : (this.db.prepare('SELECT * FROM skills WHERE id = ? ORDER BY loaded_at DESC, rowid DESC LIMIT 1').get(id) as Row | undefined);
    return row ? { ...toSummary(row), body: String(row.body ?? '') } : null;
  }

  taskSkills(taskId: string): SelectedSkill[] {
    const rows = this.db.prepare('SELECT * FROM task_skills WHERE task_id = ? ORDER BY selected_at, rowid').all(taskId) as Row[];
    return rows.map((r) => {
      const v = this.db.prepare('SELECT version FROM skills WHERE id = ? AND content_hash = ?').get(String(r.skill_id), String(r.content_hash)) as { version: string } | undefined;
      return { taskId, skillId: String(r.skill_id), version: v?.version ?? null, contentHash: String(r.content_hash), selectedAt: String(r.selected_at), reason: String(r.reason) };
    });
  }

  /** Forgets a task's pinned skills so the next selection starts again (a task reset). */
  resetTask(taskId: string): void {
    this.db.prepare('DELETE FROM task_skills WHERE task_id = ?').run(taskId);
  }

  /** Saves or creates a skill on disk, syncs to DB, and returns the loaded skill. */
  saveSkill(input: SaveSkillInput): SkillSummary & { body: string } {
    const rawId = (input.id || input.name || '').trim().toLowerCase();
    const id = rawId.replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
    if (!id) throw new Error('Skill ID is required and must contain alphanumeric characters');

    const root = this.root();
    if (!root) throw new Error('Skills root directory is not configured or resolved');

    const skillDir = path.join(root, id);
    fs.mkdirSync(skillDir, { recursive: true });
    const targetFile = path.join(skillDir, 'SKILL.md');

    let fileContent = '';
    if (input.rawContent && input.rawContent.trim()) {
      const parsed = parseSkill(input.rawContent, targetFile, id);
      if (!parsed) {
        throw new Error('Raw markdown is missing valid YAML frontmatter (needs at least name and version)');
      }
      fileContent = input.rawContent.trim() + '\n';
    } else {
      const version = (input.version || '1.0.0').trim();
      const desc = (input.description || `${id} skill`).trim().replace(/\n/g, ' ');
      const owner = (input.owner || 'The Orchestrator').trim();
      const triggers = (input.triggers || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
      const workflows = (input.workflows || []).filter((w): w is SkillWorkflow => (WORKFLOWS as readonly string[]).includes(w));
      const roles = (input.roles || []).map((r) => r.trim()).filter(Boolean);
      const inputs = (input.inputs || []).map((i) => i.trim()).filter(Boolean);
      const outputs = (input.outputs || []).map((o) => o.trim()).filter(Boolean);
      const related = (input.relatedSkills || []).map((r) => r.trim()).filter(Boolean);
      const body = (input.body || `# ${input.name || id}\n\n## Purpose\nDescribe the purpose and steps here.\n`).trim();

      const lines = ['---', `name: ${id}`, `description: ${desc}`, `version: ${version}`];
      if (owner) lines.push(`owner: ${owner}`);
      lines.push(`triggers: [${triggers.join(', ')}]`);
      lines.push(`workflows: [${workflows.join(', ')}]`);
      lines.push(`roles: [${roles.join(', ')}]`);
      if (inputs.length) {
        lines.push('inputs:');
        for (const inp of inputs) lines.push(`  - ${inp}`);
      }
      if (outputs.length) {
        lines.push('outputs:');
        for (const out of outputs) lines.push(`  - ${out}`);
      }
      if (related.length) {
        lines.push(`related_skills: [${related.join(', ')}]`);
      }
      lines.push('---');
      lines.push('');
      lines.push(body);
      lines.push('');
      fileContent = lines.join('\n');
    }

    fs.writeFileSync(targetFile, fileContent, 'utf8');
    this.sync();

    const created = this.get(id);
    if (!created) {
      throw new Error(`Failed to load newly created skill ${id}`);
    }
    return created;
  }

  /** Deletes a skill folder from disk, forgets it from current map and DB. */
  deleteSkill(id: string): { success: boolean; deleted: boolean; id: string } {
    const root = this.root();
    if (!root) throw new Error('Skills root directory is not configured');

    const cleanId = id.trim().toLowerCase();
    const skillDir = path.join(root, cleanId);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
    this.current.delete(cleanId);
    this.db.prepare('DELETE FROM skills WHERE id = ?').run(cleanId);
    this.sync();
    return { success: true, deleted: true, id: cleanId };
  }

  /** Accepts an uploaded file (markdown/yaml/text), creates or updates the skill, and syncs. */
  uploadSkill(filename: string, content: string | Buffer): SkillSummary & { body: string } {
    const text = typeof content === 'string' ? content : content.toString('utf8');
    const fallbackId = path.basename(filename, path.extname(filename)).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const { front } = splitFrontmatter(text);
    let id = fallbackId;
    let version = '1.0.0';
    let rawContent = text;

    if (front !== null) {
      const fm = parseFrontmatter(front);
      const parsedId = typeof fm.name === 'string' ? fm.name.trim() : '';
      if (parsedId) id = parsedId.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const parsedVer = typeof fm.version === 'string' ? fm.version.trim() : '';
      if (parsedVer) version = parsedVer;
    } else {
      const lines = [
        '---',
        `name: ${id}`,
        `description: ${id} skill imported from ${filename}`,
        `version: ${version}`,
        'owner: user',
        'triggers: []',
        'workflows: []',
        'roles: []',
        '---',
        '',
        text,
      ];
      rawContent = lines.join('\n');
    }

    return this.saveSkill({
      id,
      version,
      rawContent,
    });
  }

  /**
   * Deterministic choice, at most four. Order: a required skill, then a trigger word in the task
   * text, then the job workflow; ties by skill id. Pinned: once a task has skills, selecting
   * again returns them unchanged, whatever has since been edited on disk.
   */
  selectSkills(task: SkillTaskInput, job: SkillJobInput | null = null): SelectedSkill[] {
    const existing = this.taskSkills(task.id);
    if (existing.length) return existing;
    this.sync();
    const required = new Set((task.requiredSkills ?? []).map((s) => s.trim().toLowerCase()));
    const text = [task.title, task.description ?? '', ...(task.requiredSkills ?? [])].join('\n').toLowerCase();
    const workflow = job?.workflow ?? null;

    const picks: { skill: LoadedSkill; rank: number; reason: string }[] = [];
    for (const skill of this.current.values()) {
      if (required.has(skill.id.toLowerCase())) {
        picks.push({ skill, rank: 0, reason: 'required skill' });
        continue;
      }
      const hit = skill.triggers.find((t) => mentions(text, t));
      if (hit) {
        picks.push({ skill, rank: 1, reason: `trigger "${hit}"` });
        continue;
      }
      if (workflow && (skill.workflows as string[]).includes(workflow)) picks.push({ skill, rank: 2, reason: `workflow ${workflow}` });
    }
    picks.sort((a, b) => a.rank - b.rank || (a.skill.id < b.skill.id ? -1 : 1));

    const at = this.now().toISOString();
    const ins = this.db.prepare('INSERT OR IGNORE INTO task_skills (task_id, skill_id, content_hash, selected_at, reason) VALUES (?, ?, ?, ?, ?)');
    for (const p of picks.slice(0, MAX_SKILLS_PER_TASK)) ins.run(task.id, p.skill.id, p.skill.contentHash, at, p.reason);
    return this.taskSkills(task.id);
  }

  /** The instructions of the task's pinned skills, each headed `id@version`, size-capped. Empty when none. */
  skillPacket(taskId: string): string {
    const parts: string[] = [];
    let total = 0;
    for (const sel of this.taskSkills(taskId)) {
      const skill = this.get(sel.skillId, sel.contentHash);
      if (!skill) continue;
      let body = skill.body.trim();
      if (body.length > PER_SKILL_CHARS) body = `${body.slice(0, PER_SKILL_CHARS)}\n[truncated: call skill_read {"id":"${skill.id}"} for the rest]`;
      const block = `### ${skill.id}@${skill.version} (${skill.contentHash})\n${body}`;
      if (total + block.length > PACKET_CHARS) {
        parts.push(`### ${skill.id}@${skill.version}\n[omitted for size: call skill_read {"id":"${skill.id}"}]`);
        continue;
      }
      total += block.length;
      parts.push(block);
    }
    return parts.join('\n\n');
  }
}

const registry = new WeakMap<Repo, SkillService>();

/** Creates the skill service for a repo (settings come from the repo) and registers it. */
export function attachSkillService(repo: Repo, db: DatabaseSync, opts: { skillsRoot?: string | null } = {}): SkillService {
  const svc = new SkillService(db, { skillsRoot: opts.skillsRoot, getSetting: () => repo.getSetting('skillsRoot') });
  registry.set(repo, svc);
  return svc;
}

export function skillServiceFor(repo: Repo): SkillService | null {
  return registry.get(repo) ?? null;
}
