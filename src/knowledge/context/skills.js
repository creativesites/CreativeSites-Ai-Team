'use strict';
/**
 * Minimal skill loader: reads community/skills/<id>/SKILL.md (front matter + body), hashes it,
 * and selects only the skills relevant to a task. Skills teach HOW to work; they are separate from
 * knowledge (WHAT the org knows). Selection is explicit and explained, never "load everything".
 */
const fs = require('fs');
const path = require('path');
const { sha256 } = require('../core/util');
const { tokenize } = require('../retrieval/embeddings');

function parseFrontMatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta = {}; let key = null;
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    const li = /^\s+-\s+(.*)$/.exec(line);
    if (kv) { key = kv[1]; meta[key] = kv[2] === '' ? [] : kv[2].replace(/^["']|["']$/g, ''); }
    else if (li && key && Array.isArray(meta[key])) meta[key].push(li[1].replace(/^["']|["']$/g, ''));
  }
  return { meta, body: m[2] };
}

class SkillLoader {
  constructor(dir) { this.dir = dir; }
  list() {
    if (!this.dir || !fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => {
      const f = path.join(this.dir, d.name, 'SKILL.md');
      if (!fs.existsSync(f)) return [];
      const src = fs.readFileSync(f, 'utf8');
      const { meta, body } = parseFrontMatter(src);
      return [{ id: meta.name || d.name, version: meta.version || null, owner: meta.owner || null, description: meta.description || '', triggers: Array.isArray(meta.triggers) ? meta.triggers : [],
        taskTypes: Array.isArray(meta.task_types) ? meta.task_types : [], hash: sha256(src), path: f, body }];
    });
  }
  get(id) { return this.list().find((s) => s.id === id) || null; }

  /** Select skills for a task. Explicit `triggers`/`task_types` front matter win; otherwise lexical overlap with name+description. */
  select({ text, taskType, max = 3, minOverlap = 0.12 }) {
    const q = new Set(tokenize(text || ''));
    const scored = this.list().map((s) => {
      const hay = tokenize(`${s.id.replace(/-/g, ' ')} ${s.description} ${s.triggers.join(' ')}`);
      const hit = hay.filter((t) => q.has(t));
      const overlap = hay.length ? new Set(hit).size / Math.sqrt(hay.length * Math.max(1, q.size)) : 0;
      const explicit = s.triggers.some((t) => (text || '').toLowerCase().includes(t.toLowerCase())) || (taskType && s.taskTypes.includes(taskType));
      return { skill: s, score: explicit ? 1 : overlap, reason: explicit ? 'matched declared trigger/task type' : `keyword overlap ${(overlap * 100).toFixed(0)}% (${Array.from(new Set(hit)).slice(0, 5).join(', ')})` };
    });
    return scored.filter((s) => s.score >= (s.score === 1 ? 0 : minOverlap) && s.score > 0).sort((a, b) => b.score - a.score).slice(0, max);
  }
}
module.exports = { SkillLoader, parseFrontMatter };
