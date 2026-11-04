import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { resolveCommunityDir } from './community-sync.ts';
import { myaosHome } from './config.ts';

export interface KnowledgeDocument {
  id: string;
  filename: string;
  title: string;
  category: string;
  classification: string;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number;
  contentHash: string;
  authorId: string;
  projectId: string | null;
  summary: string | null;
  extractedText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadDocumentInput {
  filename: string;
  content: string | Buffer;
  title?: string;
  category?: string;
  classification?: string;
  projectId?: string | null;
  authorId?: string;
  isBase64?: boolean;
}

const toDoc = (r: Record<string, unknown>): KnowledgeDocument => ({
  id: String(r.id),
  filename: String(r.filename),
  title: String(r.title),
  category: String(r.category || 'general'),
  classification: String(r.classification || 'internal'),
  filePath: String(r.file_path),
  mimeType: r.mime_type ? String(r.mime_type) : null,
  sizeBytes: Number(r.size_bytes || 0),
  contentHash: String(r.content_hash),
  authorId: String(r.author_id || 'user'),
  projectId: r.project_id ? String(r.project_id) : null,
  summary: r.summary ? String(r.summary) : null,
  extractedText: r.extracted_text ? String(r.extracted_text) : null,
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

export class KnowledgeService {
  private readonly db: DatabaseSync;
  private readonly explicitDir: string | null;

  constructor(db: DatabaseSync, opts: { knowledgeDir?: string | null } = {}) {
    this.db = db;
    this.explicitDir = opts.knowledgeDir ?? null;
  }

  dir(): string {
    if (this.explicitDir) return path.resolve(this.explicitDir);
    const comm = resolveCommunityDir();
    const target = comm ? path.join(comm, 'knowledge') : path.join(myaosHome(), 'knowledge');
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }
    return target;
  }

  list(opts: { category?: string; projectId?: string; query?: string } = {}): KnowledgeDocument[] {
    let sql = 'SELECT * FROM knowledge_documents WHERE 1=1';
    const params: unknown[] = [];
    if (opts.category && opts.category !== 'all') {
      sql += ' AND category = ?';
      params.push(opts.category);
    }
    if (opts.projectId) {
      sql += ' AND project_id = ?';
      params.push(opts.projectId);
    }
    if (opts.query && opts.query.trim()) {
      const q = `%${opts.query.trim().toLowerCase()}%`;
      sql += ' AND (LOWER(title) LIKE ? OR LOWER(filename) LIKE ? OR LOWER(category) LIKE ? OR LOWER(extracted_text) LIKE ?)';
      params.push(q, q, q, q);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(...(params as any)) as Record<string, unknown>[];
    return rows.map(toDoc);
  }

  get(id: string): (KnowledgeDocument & { content?: string }) | null {
    const row = this.db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const doc = toDoc(row);
    let content = doc.extractedText ?? undefined;
    if (!content && fs.existsSync(doc.filePath)) {
      try {
        content = fs.readFileSync(doc.filePath, 'utf8');
      } catch {
        // binary file
      }
    }
    return { ...doc, content };
  }

  upload(input: UploadDocumentInput): KnowledgeDocument {
    const dir = this.dir();
    let buffer: Buffer;
    if (Buffer.isBuffer(input.content)) {
      buffer = input.content;
    } else if (
      input.isBase64 ||
      input.content.startsWith('data:') ||
      (/^[A-Za-z0-9+/=]+$/.test(input.content.slice(0, 100)) && input.content.length % 4 === 0 && !input.content.includes('\n'))
    ) {
      const clean = input.content.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(clean, 'base64');
    } else {
      buffer = Buffer.from(input.content, 'utf8');
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const safeName = path.basename(input.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetFile = path.join(dir, safeName);

    fs.writeFileSync(targetFile, buffer);

    const ext = path.extname(safeName).toLowerCase();
    let extractedText: string | null = null;
    let mimeType: string | null = null;

    if (['.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.tsv', '.js', '.ts', '.jsx', '.tsx', '.py', '.html', '.css', '.sh', '.xml'].includes(ext)) {
      try {
        extractedText = buffer.toString('utf8');
      } catch {
        extractedText = null;
      }
      if (ext === '.md') mimeType = 'text/markdown';
      else if (ext === '.json') mimeType = 'application/json';
      else if (ext === '.csv') mimeType = 'text/csv';
      else if (ext === '.txt') mimeType = 'text/plain';
      else mimeType = 'text/plain';
    } else if (ext === '.pdf') {
      mimeType = 'application/pdf';
    } else if (['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext)) {
      mimeType = `image/${ext.slice(1)}`;
    } else {
      mimeType = 'application/octet-stream';
    }

    const id = `doc_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();
    const title = input.title?.trim() || safeName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    const category = input.category || 'general';
    const classification = input.classification || 'internal';
    const projectId = input.projectId || null;
    const authorId = input.authorId || 'user';

    let summary: string | null = null;
    if (extractedText) {
      const firstLines = extractedText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .slice(0, 3)
        .join(' ');
      summary = firstLines.length > 200 ? `${firstLines.slice(0, 197)}…` : firstLines || null;
    }

    this.db.prepare(
      `INSERT INTO knowledge_documents
       (id, filename, title, category, classification, file_path, mime_type, size_bytes, content_hash, author_id, project_id, summary, extracted_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      safeName,
      title,
      category,
      classification,
      targetFile,
      mimeType,
      buffer.length,
      hash,
      authorId,
      projectId,
      summary,
      extractedText ? extractedText.slice(0, 200000) : null,
      now,
      now
    );

    return this.get(id)!;
  }

  delete(id: string): { success: boolean; id: string } {
    const row = this.db.prepare('SELECT file_path FROM knowledge_documents WHERE id = ?').get(id) as { file_path: string } | undefined;
    if (row && row.file_path && fs.existsSync(row.file_path)) {
      try {
        fs.rmSync(row.file_path, { force: true });
      } catch {
        // ignore
      }
    }
    this.db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(id);
    return { success: true, id };
  }
}
