import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ConflictError, type Repo } from './store/repo.ts';

// Legacy agents still write markdown: replies below a job thread's marker, and
// inbox notes. The runtime imports them as Claimed messages/evidence, with an
// idempotency ledger so a re-scan never duplicates a row.

export interface IngestResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface Meta {
  [key: string]: string;
}

const REPLY_START = /^#{2,3}\s+Reply\b(.*)$/i;
const HEADING = /^#{1,3}\s+/;
const REPLIES_MARKER = '<!-- replies -->';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function splitFrontmatter(text: string): { meta: Meta; body: string } {
  if (!text.startsWith('---\n')) return { meta: {}, body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return { meta: {}, body: text };
  const meta: Meta = {};
  for (const line of text.slice(4, end).split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body: text.slice(end + 5) };
}

function listMarkdown(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.md') && !name.startsWith('.'))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function jobIdFrom(meta: Meta, body: string, repo: Repo): string | null {
  if (meta.job_id) return meta.job_id;
  const related = meta.related_job ?? meta.job ?? '';
  const match = /JOB[-_ ]?(\d+)/i.exec(related) ?? /JOB[-_ ]?(\d+)/i.exec(body.slice(0, 2000));
  if (!match) return null;
  const job = repo.findJobByNumber(Number(match[1]));
  return job?.id ?? null;
}

export class BridgeIngest {
  private readonly repo: Repo;
  private readonly communityRoot: string;

  constructor(opts: { repo: Repo; communityRoot: string }) {
    this.repo = opts.repo;
    this.communityRoot = opts.communityRoot;
  }

  scan(): IngestResult {
    const result: IngestResult = { imported: 0, skipped: 0, errors: [] };
    const inboxRoot = path.join(this.communityRoot, 'inboxes');
    let agents: string[] = [];
    try {
      agents = fs.readdirSync(inboxRoot).filter((name) => !name.startsWith('.'));
    } catch {
      agents = [];
    }
    for (const agentDir of agents) {
      for (const file of listMarkdown(path.join(inboxRoot, agentDir))) {
        try {
          this.importInbox(file, agentDir, result);
        } catch (e) {
          result.errors.push(`${file}: ${(e as Error).message}`);
        }
      }
    }
    for (const file of listMarkdown(path.join(this.communityRoot, 'threads', 'desktop'))) {
      try {
        this.importThreadReplies(file, result);
      } catch (e) {
        result.errors.push(`${file}: ${(e as Error).message}`);
      }
    }
    return result;
  }

  private importInbox(file: string, agentDir: string, result: IngestResult): void {
    const text = fs.readFileSync(file, 'utf8');
    const { meta, body } = splitFrontmatter(text);
    const from = (meta.from ?? meta.author ?? agentDir).replace(/^@/, '').toLowerCase();
    if (from === 'myaos-runtime' || from === 'runtime') {
      result.skipped += 1;
      return;
    }
    const jobId = jobIdFrom(meta, body, this.repo);
    if (!jobId) {
      result.skipped += 1;
      return;
    }
    const content = body.trim();
    if (!content) {
      result.skipped += 1;
      return;
    }
    this.importOne(file, sha256(content), jobId, from, content, result, 'inbox');
  }

  private importThreadReplies(file: string, result: IngestResult): void {
    const text = fs.readFileSync(file, 'utf8');
    const { meta } = splitFrontmatter(text);
    const jobId = jobIdFrom(meta, '', this.repo);
    if (!jobId) {
      result.skipped += 1;
      return;
    }
    const marker = text.indexOf(REPLIES_MARKER);
    if (marker < 0) {
      result.skipped += 1;
      return;
    }
    const replies = text.slice(marker + REPLIES_MARKER.length);
    const lines = replies.split('\n');
    let current: { author: string; body: string[]; index: number } | null = null;
    let index = 0;
    const flush = () => {
      if (!current) return;
      const body = current.body.join('\n').trim();
      if (!body) return;
      const author = current.author;
      const sourcePath = `${file}#reply-${index++}`;
      this.importOne(sourcePath, sha256(`${author}\n${body}`), jobId, author, body, result, 'thread');
    };
    for (const line of lines) {
      const start = REPLY_START.exec(line.trim());
      if (start) {
        flush();
        const heading = start[1] ?? '';
        const authorMatch = /(?:from\s+@?|—\s*@?|:\s*@?)([a-z][a-z0-9_-]{1,30})/i.exec(heading);
        current = { author: (authorMatch?.[1] ?? 'unknown-agent').toLowerCase(), body: [], index };
        continue;
      }
      if (current && HEADING.test(line)) {
        flush();
        current = null;
        continue;
      }
      if (current) current.body.push(line);
    }
    flush();
  }

  private importOne(
    sourcePath: string,
    contentHash: string,
    jobId: string,
    author: string,
    body: string,
    result: IngestResult,
    source: 'inbox' | 'thread'
  ): void {
    if (this.repo.bridgeIngested(sourcePath, contentHash)) {
      result.skipped += 1;
      return;
    }
    const job = this.repo.getJob(jobId);
    const message = this.repo.postMessage(job.roomId, {
      authorId: author,
      authorKind: 'agent',
      body,
      jobId: job.id,
    });
    const summary = body.split('\n')[0]!.slice(0, 160);
    const evidence = this.repo.appendEvidence({
      jobId: job.id,
      kind: 'message',
      class: 'DECLARED',
      summary: `[${source}] ${summary}`,
      payload: { sourcePath, source, author, body },
      recordedBy: author,
      recordedByKind: 'agent',
    });
    this.repo.recordBridgeIngest({
      sourcePath,
      contentHash,
      jobId: job.id,
      messageId: message.id,
      evidenceId: evidence.id,
    });
    result.imported += 1;
  }
}

export { REPLIES_MARKER };
