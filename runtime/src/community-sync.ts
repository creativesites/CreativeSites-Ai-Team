import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Repo } from './store/repo.ts';
import { loadConfig } from './config.ts';

export interface CommunitySyncStats {
  threadsTotal: number;
  threadsUpdated: number;
  inboxMessagesTotal: number;
  inboxMessagesNew: number;
  announcementsTotal: number;
  standupsTotal: number;
  communityRoot: string;
  lastSyncAt: string;
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, p.slice(1));
  }
  return p;
}

export function resolveCommunityDir(explicitRoot?: string): string | null {
  const candidates: string[] = [];
  if (explicitRoot) candidates.push(path.resolve(expandHome(explicitRoot)));
  if (process.env.MYAOS_COMMUNITY_ROOT) candidates.push(path.resolve(expandHome(process.env.MYAOS_COMMUNITY_ROOT)));

  try {
    const cfg = loadConfig();
    if (cfg.teamRepo) {
      candidates.push(path.join(path.resolve(expandHome(cfg.teamRepo)), 'community'));
    }
  } catch {
    /* ignore */
  }

  // Relative paths from current working directories
  candidates.push(
    path.resolve('community'),
    path.resolve('../community'),
    path.resolve('../../community'),
    path.resolve('../../../community'),
    path.resolve('apps/desktop/community'),
    path.resolve('.claude/worktrees/desktop-app-ai-teams-2fa62f/community')
  );

  const home = process.env.HOME || '';
  if (home) {
    candidates.push(
      path.join(home, 'WebstormProjects/CreativeSites-Ai-Team/community'),
      path.join(home, 'WebstormProjects/CreativeSites-Ai-Team/.claude/worktrees/desktop-app-ai-teams-2fa62f/community')
    );
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
        const hasThreads = fs.existsSync(path.join(c, 'threads'));
        const hasInboxes = fs.existsSync(path.join(c, 'inboxes'));
        if (hasThreads || hasInboxes) {
          return c;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

function cleanIdentity(raw?: string | null): string {
  if (!raw) return 'team';
  return raw
    .replace(/^@/, '')
    .replace(/[`*]/g, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .trim()
    .toLowerCase();
}

function parseDateToIso(rawDate?: string | null, fallback?: Date): string {
  if (rawDate) {
    const cleaned = rawDate.trim().replace(/^['"]|['"]$/g, '');
    const parsed = new Date(cleaned);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    // Match YYYY-MM-DD
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleaned);
    if (ymd) {
      return new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))).toISOString();
    }
  }
  return (fallback || new Date()).toISOString();
}

function normalizeStatus(rawStatus?: string | null): 'open' | 'resolved' | 'archived' {
  if (!rawStatus) return 'open';
  const s = rawStatus.toLowerCase();
  if (s.includes('resolved') || s.includes('approved') || s.includes('shipped') || s.includes('completed') || s.includes('done')) {
    return 'resolved';
  }
  if (s.includes('archived') || s.includes('superseded') || s.includes('contradicted') || s.includes('closed')) {
    return 'archived';
  }
  return 'open';
}

function splitFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { meta: {}, body: text };
  }
  const end = text.indexOf('\n---\n', 4) !== -1 ? text.indexOf('\n---\n', 4) : text.indexOf('\r\n---\r\n', 4);
  if (end < 0) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  const metaContent = text.slice(4, end);
  for (const line of metaContent.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body: text.slice(end + (text.includes('\r\n---\r\n') ? 7 : 5)) };
}

export function syncCommunity(repo: Repo, explicitRoot?: string): CommunitySyncStats {
  const root = resolveCommunityDir(explicitRoot);
  const nowIso = new Date().toISOString();

  if (!root) {
    return {
      threadsTotal: 0,
      threadsUpdated: 0,
      inboxMessagesTotal: 0,
      inboxMessagesNew: 0,
      announcementsTotal: 0,
      standupsTotal: 0,
      communityRoot: 'not_found',
      lastSyncAt: nowIso,
    };
  }

  let threadsTotal = 0;
  let threadsUpdated = 0;
  let inboxMessagesTotal = 0;
  let inboxMessagesNew = 0;
  let announcementsTotal = 0;
  let standupsTotal = 0;

  // 1. SYNC THREADS
  const threadsDir = path.join(root, 'threads');
  if (fs.existsSync(threadsDir)) {
    try {
      const files = fs.readdirSync(threadsDir).filter((f) => f.endsWith('.md') && f !== 'TEMPLATE.md' && !f.startsWith('.'));
      for (const file of files) {
        threadsTotal++;
        const filePath = path.join(threadsDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const fileStat = fs.statSync(filePath);
          const slug = path.basename(file, '.md');
          const threadId = `th_${slug}`;

          const lines = content.split(/\r?\n/);
          let title = slug.replace(/^[0-9]+_/, '').replace(/_/g, ' ');
          let author = 'team';
          const targetIdentities: string[] = [];
          let rawStatus = 'open';
          let rawDate: string | null = null;

          // Parse header metadata
          for (let i = 0; i < Math.min(lines.length, 35); i++) {
            const line = lines[i]!;
            const titleMatch = /^#\s+(?:Thread(?:\s+\d+)?:?\s*)?(.*)$/i.exec(line);
            if (titleMatch && titleMatch[1]?.trim()) {
              title = titleMatch[1].trim();
            }

            const authorMatch = /\*\*(?:Author|Opened by|Identity|Participants)(?::\*\*|\*\*:)\s*([^\n\r]+)/i.exec(line);
            if (authorMatch && authorMatch[1]) {
              const firstAuthor = authorMatch[1].split(/[,;]/)[0]!;
              author = cleanIdentity(firstAuthor);
            }

            const statusMatch = /\*\*Status(?::\*\*|\*\*:)\s*([^\n\r]+)/i.exec(line);
            if (statusMatch && statusMatch[1]) {
              rawStatus = statusMatch[1].trim();
            }

            const dateMatch = /\*\*(?:Created Date|Date)(?::\*\*|\*\*:)\s*([^\n\r]+)/i.exec(line);
            if (dateMatch && dateMatch[1]) {
              rawDate = dateMatch[1].trim();
            }

            const targetMatch = /\*\*(?:Target Audience|Assignees|Contributors)(?::\*\*|\*\*:)\s*([^\n\r]+)/i.exec(line);
            if (targetMatch && targetMatch[1]) {
              const matchedTags = targetMatch[1].match(/@[a-zA-Z0-9_-]+/g);
              if (matchedTags) {
                for (const t of matchedTags) targetIdentities.push(cleanIdentity(t));
              }
            }
          }

          const status = normalizeStatus(rawStatus);
          const createdAt = parseDateToIso(rawDate, fileStat.birthtime);
          const updatedAt = fileStat.mtime ? fileStat.mtime.toISOString() : createdAt;

          // Check if thread exists
          const existingThread = (repo as any).one('SELECT id, updated_at FROM threads WHERE id = ?', threadId);

          if (!existingThread) {
            (repo as any).write(() => {
              (repo as any).db
                .prepare(
                  `INSERT INTO threads (id, title, author_identities, target_identities, status, created_at, updated_at, original_file_path)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .run(threadId, title, JSON.stringify([author]), JSON.stringify(targetIdentities), status, createdAt, updatedAt, filePath);
            });
            threadsUpdated++;
          } else {
            // Update thread metadata
            (repo as any).write(() => {
              (repo as any).db
                .prepare(
                  `UPDATE threads
                   SET title = ?, status = ?, updated_at = ?, author_identities = ?, target_identities = ?, original_file_path = ?
                   WHERE id = ?`
                )
                .run(title, status, updatedAt, JSON.stringify([author]), JSON.stringify(targetIdentities), filePath, threadId);
            });
          }

          // Ensure opening message exists
          const existingMsg = (repo as any).one('SELECT id FROM thread_messages WHERE thread_id = ? LIMIT 1', threadId);
          if (!existingMsg) {
            (repo as any).write(() => {
              (repo as any).db
                .prepare(
                  `INSERT INTO thread_messages (thread_id, from_identity, to_identity, msg_type, priority, subject, body, read, ts)
                   VALUES (?, ?, ?, 'COORDINATION', 'normal', ?, ?, 1, ?)`
                )
                .run(threadId, author, targetIdentities[0] ?? null, title, content, createdAt);
            });
          }
        } catch (err) {
          console.warn(`[community-sync] Failed to sync thread ${file}:`, (err as Error).message);
        }
      }
    } catch (e) {
      console.warn('[community-sync] Failed reading threads dir:', (e as Error).message);
    }
  }

  // 2. SYNC INBOXES
  const inboxesDir = path.join(root, 'inboxes');
  if (fs.existsSync(inboxesDir)) {
    try {
      const actorDirs = fs.readdirSync(inboxesDir).filter((d) => !d.startsWith('.'));
      for (const actor of actorDirs) {
        const actorPath = path.join(inboxesDir, actor);
        if (!fs.statSync(actorPath).isDirectory()) continue;

        const noteFiles = fs.readdirSync(actorPath).filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('.'));
        for (const file of noteFiles) {
          inboxMessagesTotal++;
          const notePath = path.join(actorPath, file);
          try {
            const text = fs.readFileSync(notePath, 'utf8');
            const fileStat = fs.statSync(notePath);
            const { meta, body } = splitFrontmatter(text);

            const from = cleanIdentity(meta.from ?? meta.author ?? (file.includes('_') ? file.split('_')[1] : 'Winston'));
            const to = cleanIdentity(meta.to ?? actor);
            const priority = meta.priority ?? 'normal';
            const subject = meta.subject ?? null;
            const content = body.trim() || text.trim();

            // Extract timestamp from filename pattern (e.g. 2026-11-02T23-09-23-848Z)
            let ts: string | null = null;
            const tsMatch = /(\d{4}-\d{2}-\d{2}T\d{2})[-_:](\d{2})[-_:](\d{2})[-_:]?(\d{1,3})?Z?/i.exec(file);
            if (tsMatch) {
              const ms = tsMatch[4] ? tsMatch[4].padEnd(3, '0') : '000';
              ts = `${tsMatch[1]}:${tsMatch[2]}:${tsMatch[3]}.${ms}Z`;
            } else if (meta.date) {
              ts = parseDateToIso(meta.date, fileStat.mtime);
            } else {
              ts = fileStat.mtime ? fileStat.mtime.toISOString() : nowIso;
            }

            // Check if already in inbox_messages
            const existing = (repo as any).one(
              `SELECT id FROM inbox_messages
               WHERE LOWER(from_identity) = LOWER(?) AND LOWER(to_identity) = LOWER(?) AND (ts = ? OR body = ?)
               LIMIT 1`,
              from,
              to,
              ts,
              content
            );

            if (!existing) {
              (repo as any).write(() => {
                (repo as any).db
                  .prepare(
                    `INSERT INTO inbox_messages (thread_id, from_identity, to_identity, msg_type, priority, subject, body, read, ts)
                     VALUES (NULL, ?, ?, 'COORDINATION', ?, ?, ?, 1, ?)`
                  )
                  .run(from, to, priority, subject, content, ts);
              });
              inboxMessagesNew++;
            }
          } catch (err) {
            console.warn(`[community-sync] Failed to sync inbox note ${notePath}:`, (err as Error).message);
          }
        }
      }
    } catch (e) {
      console.warn('[community-sync] Failed reading inboxes dir:', (e as Error).message);
    }
  }

  // 3. SYNC ANNOUNCEMENTS
  const announcementsDir = path.join(root, 'announcements');
  if (fs.existsSync(announcementsDir)) {
    try {
      const aFiles = fs.readdirSync(announcementsDir).filter((f) => f.endsWith('.md') && !f.startsWith('.'));
      for (const file of aFiles) {
        announcementsTotal++;
        const filePath = path.join(announcementsDir, file);
        try {
          const text = fs.readFileSync(filePath, 'utf8');
          const fileStat = fs.statSync(filePath);
          const lines = text.split(/\r?\n/);
          let title = path.basename(file, '.md').replace(/^[0-9]+_/, '').replace(/_/g, ' ');
          if (lines[0]?.startsWith('# ')) {
            title = lines[0].replace(/^#\s+/, '').trim();
          }

          const existing = (repo as any).one('SELECT id FROM announcements WHERE original_file_path = ? OR title = ? LIMIT 1', filePath, title);
          if (!existing) {
            (repo as any).write(() => {
              (repo as any).db
                .prepare(
                  `INSERT INTO announcements (title, author_identity, content, audience, ts, original_file_path)
                   VALUES (?, ?, ?, 'all', ?, ?)`
                )
                .run(title, 'orchestrator', text, fileStat.mtime.toISOString(), filePath);
            });
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 4. SYNC DAILY STANDUPS
  const standupsDir = path.join(root, 'daily_standups');
  if (fs.existsSync(standupsDir)) {
    try {
      const sFiles = fs.readdirSync(standupsDir).filter((f) => f.endsWith('.md') && !f.startsWith('.'));
      for (const file of sFiles) {
        standupsTotal++;
        const filePath = path.join(standupsDir, file);
        try {
          const text = fs.readFileSync(filePath, 'utf8');
          const fileStat = fs.statSync(filePath);
          const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(file);
          const standupDate = dateMatch ? dateMatch[1]! : fileStat.mtime.toISOString().slice(0, 10);

          const existing = (repo as any).one('SELECT id FROM standups WHERE standup_date = ? OR original_file_path = ? LIMIT 1', standupDate, filePath);
          if (!existing) {
            (repo as any).write(() => {
              (repo as any).db
                .prepare(
                  `INSERT INTO standups (standup_date, facilitator, present_identities, absent_identities, content, parsed_updates, ts, original_file_path, team_id)
                   VALUES (?, 'orchestrator', '[]', '[]', ?, '{}', ?, ?, ?)`
                )
                .run(standupDate, text, fileStat.mtime.toISOString(), filePath, `community-${standupDate}`);
            });
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  return {
    threadsTotal,
    threadsUpdated,
    inboxMessagesTotal,
    inboxMessagesNew,
    announcementsTotal,
    standupsTotal,
    communityRoot: root,
    lastSyncAt: nowIso,
  };
}
