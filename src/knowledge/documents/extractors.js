'use strict';
/**
 * Text extraction. Each extractor returns {text, quality, extractor, version, warnings}
 * or throws ExtractionError {code, retryable}. Unavailable host tools (OCR, pdftotext)
 * make the document land in a visible, retryable `failed` state; they never corrupt data.
 */
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');
const { readZip } = require('./zip');

class ExtractionError extends Error {
  constructor(code, message, retryable = false) { super(message); this.name = 'ExtractionError'; this.code = code; this.retryable = retryable; }
}

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.rst', '.log', '.text']);
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rs', '.go', '.java', '.rb', '.php', '.sh', '.sql', '.css', '.scss',
  '.c', '.h', '.cpp', '.cs', '.swift', '.kt', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env.example', '.xml', '.tf', '.gradle']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tif', '.tiff', '.webp']);
const MIME_BY_EXT = {
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv', '.md': 'text/markdown', '.txt': 'text/plain', '.html': 'text/html', '.htm': 'text/html',
  '.json': 'application/json', '.vtt': 'text/vtt', '.srt': 'application/x-subrip',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
};

/** Sniff the real type from magic bytes. We never trust the claimed extension for binary formats. */
function sniff(buf) {
  const h = buf.slice(0, 8);
  if (h.slice(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (h[0] === 0x50 && h[1] === 0x4b) return 'zip';
  if (h[0] === 0x89 && h.slice(1, 4).toString() === 'PNG') return 'png';
  if (h[0] === 0xff && h[1] === 0xd8) return 'jpeg';
  if (h.slice(0, 3).toString() === 'GIF') return 'gif';
  if (h.slice(0, 4).toString() === 'RIFF') return 'riff';
  if (h[0] === 0x4d && h[1] === 0x5a) return 'executable';
  if (h.slice(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return 'executable';
  if (h.readUInt32BE(0) === 0xcafebabe || h.readUInt32LE(0) === 0xfeedface || h.readUInt32LE(0) === 0xfeedfacf) return 'executable';
  if (h.slice(0, 2).toString() === '#!') return 'text';
  const sample = buf.slice(0, 4096);
  let bad = 0;
  for (const b of sample) if (b === 0 || (b < 9) || (b > 13 && b < 32 && b !== 27)) bad++;
  return sample.length && bad / sample.length > 0.02 ? 'binary' : 'text';
}

function classify(filename, claimedMime, buf) {
  const ext = path.extname(filename || '').toLowerCase();
  const real = sniff(buf);
  if (real === 'executable') throw new ExtractionError('blocked_executable', 'Executable files are not accepted', false);
  let kind;
  if (ext === '.pdf') kind = 'pdf';
  else if (['.docx', '.xlsx', '.pptx'].includes(ext)) kind = ext.slice(1);
  else if (IMAGE_EXT.has(ext)) kind = 'image';
  else if (ext === '.csv' || ext === '.tsv') kind = 'csv';
  else if (ext === '.html' || ext === '.htm') kind = 'html';
  else if (ext === '.vtt' || ext === '.srt') kind = 'transcript';
  else if (CODE_EXT.has(ext)) kind = 'code';
  else if (TEXT_EXT.has(ext) || ext === '' || (claimedMime || '').startsWith('text/')) kind = 'text';
  else kind = real === 'text' ? 'text' : 'unsupported';
  // Claimed type must agree with content for container/binary formats.
  const binaryKinds = { pdf: ['pdf'], docx: ['zip'], xlsx: ['zip'], pptx: ['zip'], image: ['png', 'jpeg', 'gif', 'riff', 'binary'] };
  if (binaryKinds[kind] && !binaryKinds[kind].includes(real)) {
    throw new ExtractionError('type_mismatch', `File claims ${kind} but content looks like ${real}`, false);
  }
  if (!binaryKinds[kind] && real !== 'text' && kind !== 'unsupported') {
    throw new ExtractionError('type_mismatch', `File claims ${kind} but content is binary`, false);
  }
  return { kind, ext, mime: claimedMime || MIME_BY_EXT[ext] || (real === 'text' ? 'text/plain' : 'application/octet-stream') };
}

const decodeText = (buf) => {
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n?/g, '\n');
};
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

function csvRows(text, delim) {
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const EXTRACTORS = {
  async text(buf) { return { text: decodeText(buf), quality: 'exact', extractor: 'plain-text', version: '1' }; },
  async code(buf, ctx) { return { text: decodeText(buf), quality: 'exact', extractor: 'source-code', version: '1', warnings: [`language:${ctx.ext.slice(1) || 'unknown'}`] }; },
  async csv(buf, ctx) {
    const rows = csvRows(decodeText(buf), ctx.ext === '.tsv' ? '\t' : ',');
    if (!rows.length) return { text: '', quality: 'exact', extractor: 'csv', version: '1' };
    const head = rows[0];
    const lines = [`Columns: ${head.join(' | ')}`];
    rows.slice(1).forEach((r, i) => lines.push(`Row ${i + 1}: ` + head.map((h, k) => `${h}=${(r[k] ?? '').trim()}`).join('; ')));
    return { text: lines.join('\n'), quality: 'exact', extractor: 'csv', version: '1' };
  },
  async html(buf) {
    const s = decodeText(buf).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => `\n${'#'.repeat(+l)} ${t}\n`)
      .replace(/<\/(p|div|li|tr|br)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
    return { text: unxml(s).replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim(), quality: 'exact', extractor: 'html', version: '1' };
  },
  async transcript(buf) {
    const text = decodeText(buf).split('\n').filter((l) => !/^(WEBVTT|NOTE|\d+\s*$)/.test(l.trim()) && !/-->/.test(l)).join('\n').replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n').trim();
    return { text, quality: 'exact', extractor: 'transcript', version: '1' };
  },
  async docx(buf) {
    const zip = readZip(buf);
    const xml = zip.read('word/document.xml');
    if (!xml) throw new ExtractionError('corrupt_docx', 'word/document.xml missing');
    const out = [];
    for (const p of xml.toString('utf8').split(/<\/w:p>/)) {
      const style = /<w:pStyle w:val="([^"]+)"/.exec(p);
      const text = unxml(Array.from(p.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)).map((m) => (m[1] === undefined ? '\t' : m[1])).join(''));
      if (!text.trim()) continue;
      const h = style && /^Heading(\d)$/i.exec(style[1]) || (style && /^Title$/i.test(style[1]) ? [null, '1'] : null);
      out.push(h ? `${'#'.repeat(+h[1])} ${text.trim()}` : text);
    }
    return { text: out.join('\n\n'), quality: 'exact', extractor: 'docx-ooxml', version: '1' };
  },
  async xlsx(buf) {
    const zip = readZip(buf);
    const shared = zip.has('xl/sharedStrings.xml')
      ? Array.from(zip.read('xl/sharedStrings.xml').toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g))
        .map((m) => unxml(Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((x) => x[1]).join(''))) : [];
    const wb = zip.has('xl/workbook.xml') ? zip.read('xl/workbook.xml').toString('utf8') : '';
    const names = Array.from(wb.matchAll(/<sheet [^>]*name="([^"]+)"/g)).map((m) => unxml(m[1]));
    const sheets = zip.names().filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
    const out = [];
    sheets.forEach((sn, i) => {
      out.push(`## Sheet: ${names[i] || `Sheet${i + 1}`}`);
      for (const row of zip.read(sn).toString('utf8').matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells = Array.from(row[2].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)).map((c) => {
          const attrs = c[1]; const body = c[2] || '';
          const ref = (/r="([A-Z]+\d+)"/.exec(attrs) || [])[1] || '';
          const t = (/t="([^"]+)"/.exec(attrs) || [])[1];
          const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
          const inl = (/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body) || [])[1];
          const val = t === 's' ? shared[+v] : inl !== undefined ? unxml(inl) : v !== undefined ? unxml(v) : '';
          return val === '' || val === undefined ? null : `${ref}=${val}`;
        }).filter(Boolean);
        if (cells.length) out.push(`Row ${row[1]}: ${cells.join('; ')}`);
      }
    });
    return { text: out.join('\n'), quality: 'exact', extractor: 'xlsx-ooxml', version: '1' };
  },
  async pptx(buf) {
    const zip = readZip(buf);
    const slides = zip.names().filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
    const out = slides.map((n, i) => `## Slide ${i + 1}\n` + Array.from(zip.read(n).toString('utf8').matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)).map((m) => unxml(m[1])).join('\n'));
    const notes = zip.names().filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
    notes.forEach((n, i) => out.push(`## Notes ${i + 1}\n` + Array.from(zip.read(n).toString('utf8').matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)).map((m) => unxml(m[1])).join('\n')));
    return { text: out.join('\n\n'), quality: 'exact', extractor: 'pptx-ooxml', version: '1' };
  },
  async pdf(buf, ctx) {
    const viaTool = await runTool('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], buf, ctx.toolTimeoutMs);
    if (viaTool.ok && viaTool.out.trim()) return { text: viaTool.out.replace(/\f/g, '\n\n'), quality: 'exact', extractor: 'pdftotext', version: '1' };
    const text = nativePdfText(buf);
    if (!text.trim()) {
      throw new ExtractionError('pdf_no_text_layer', 'PDF has no extractable text layer (scanned?). Install OCR (tesseract) or provide a text version, then retry.', true);
    }
    return { text, quality: 'best_effort', extractor: 'pdf-native', version: '1', warnings: ['best_effort_pdf_text'] };
  },
  async image(buf, ctx) {
    const r = await runTool('tesseract', ['stdin', 'stdout', '--psm', '3'], buf, ctx.toolTimeoutMs);
    if (!r.ok) throw new ExtractionError('ocr_unavailable', `OCR unavailable (${r.reason}). Install tesseract and retry extraction.`, true);
    if (!r.out.trim()) throw new ExtractionError('ocr_empty', 'OCR produced no text', false);
    return { text: r.out.trim(), quality: 'best_effort', extractor: 'tesseract', version: '1', warnings: ['ocr_text'] };
  },
};

function runTool(cmd, args, input, timeout = 30000) {
  return new Promise((resolve) => {
    try {
      const child = execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
        if (err) return resolve({ ok: false, reason: err.code === 'ENOENT' ? 'not_installed' : String(err.message).slice(0, 120) });
        resolve({ ok: true, out: stdout });
      });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    } catch (e) { resolve({ ok: false, reason: e.message }); }
  });
}

/** Best-effort text from PDF content streams (no CID fonts / no layout). Honestly flagged `best_effort`. */
function nativePdfText(buf) {
  const src = buf.toString('latin1');
  const out = [];
  const unescape = (s) => s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[e] || (/^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8)) : e)));
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(src))) {
    let data = Buffer.from(m[1], 'latin1');
    const head = src.slice(Math.max(0, m.index - 300), m.index);
    if (/FlateDecode/.test(head)) { try { data = zlib.inflateSync(data, { maxOutputLength: 20 * 1024 * 1024 }); } catch (_) { continue; } }
    const content = data.toString('latin1');
    if (!/\bBT\b/.test(content)) continue;
    for (const bt of content.matchAll(/BT([\s\S]*?)ET/g)) {
      let line = '';
      for (const op of bt[1].matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|(T\*|\bTd\b|\bTD\b)/g)) {
        if (op[1] !== undefined) line += Array.from(op[1].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)).map((x) => unescape(x[1])).join('');
        else if (op[2] !== undefined) line += unescape(op[2]);
        else if (line) { out.push(line); line = ''; }
      }
      if (line) out.push(line);
    }
  }
  return out.join('\n');
}

async function extract(filename, mime, buf, opts = {}) {
  const ctx = classify(filename, mime, buf);
  if (ctx.kind === 'unsupported') throw new ExtractionError('unsupported_type', `No extractor for ${ctx.ext || 'this file'} (${ctx.mime})`, false);
  const fn = EXTRACTORS[ctx.kind];
  ctx.toolTimeoutMs = opts.toolTimeoutMs || 30000;
  let r;
  try { r = await fn(buf, ctx); } catch (e) {
    if (e instanceof ExtractionError) throw e;
    throw new ExtractionError('extract_failed', `${ctx.kind} extraction failed: ${e.message}`, false);
  }
  r.text = String(r.text || '').replace(/\u0000/g, '');
  r.warnings = r.warnings || [];
  r.kind = ctx.kind; r.mime = ctx.mime;
  return r;
}

module.exports = { extract, classify, sniff, ExtractionError, MIME_BY_EXT, nativePdfText };
