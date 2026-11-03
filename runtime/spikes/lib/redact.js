// Log sanitisation for the ACP spike harness.
//
// Rule: the JSONL transcript keeps method names, param *shapes*, hashes and short
// previews — never raw file contents or anything that looks like a credential.
// Contents we read/write are represented by sha256 + byte count + a short preview.

import { createHash } from 'node:crypto';

const SECRET_KEY =
  /token|secret|password|passwd|api[_-]?key|authorization|credential|oauth|cookie|private[_-]?key|access[_-]?key|refresh[_-]?token/i;

const TOKEN_PATTERNS = [
  /sk-[A-Za-z0-9_-]{10,}/g,
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /ghp_[A-Za-z0-9]{10,}/g,
  /github_pat_[A-Za-z0-9_]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /x-api-key["':\s]+[A-Za-z0-9._-]{8,}/gi,
];

export function sha256(value) {
  const input = Buffer.isBuffer(value)
    ? value
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);
  return createHash('sha256').update(input).digest('hex');
}

export function redactString(input, maxLen = 1500) {
  let s = String(input);
  for (const re of TOKEN_PATTERNS) s = s.replace(re, '[REDACTED]');
  if (s.length > maxLen) {
    return { __truncated: true, chars: s.length, sha256: sha256(s), preview: s.slice(0, 200) };
  }
  return s;
}

export function redact(value, opts = {}) {
  const { maxLen = 1500, maxItems = 60, maxDepth = 8 } = opts;
  return walk(value, 0, maxLen, maxItems, maxDepth);
}

function walk(value, depth, maxLen, maxItems, maxDepth) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactString(value, maxLen);
  if (typeof value === 'bigint') return String(value);
  if (depth >= maxDepth) return '[max-depth]';
  if (Array.isArray(value)) {
    const out = value.slice(0, maxItems).map((v) => walk(v, depth + 1, maxLen, maxItems, maxDepth));
    if (value.length > maxItems) out.push(`[+${value.length - maxItems} more]`);
    return out;
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k)) {
        out[k] = '[REDACTED]';
        continue;
      }
      out[k] = walk(v, depth + 1, maxLen, maxItems, maxDepth);
    }
    return out;
  }
  return String(value);
}

/**
 * Represent file/command-output content without storing it.
 * Used for fs/read_text_file results and fs/write_text_file params.
 */
export function summarizeContent(content, { previewChars = 160 } = {}) {
  const s = String(content ?? '');
  return {
    bytes: Buffer.byteLength(s),
    chars: s.length,
    lines: s === '' ? 0 : s.split('\n').length,
    sha256: sha256(s),
    preview: redactString(s.slice(0, previewChars), previewChars * 4),
  };
}
