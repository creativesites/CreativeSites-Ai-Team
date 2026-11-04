'use strict';
/**
 * Section-aware chunker. Every chunk keeps its heading path and exact char
 * offsets into the extracted text, so a knowledge record or citation can point
 * at "section 3.2, chars 4410-4980" of a specific document version.
 */
const { sha256, estimateTokens } = require('../core/util');
const { scanInjection, scanSecrets, redactSecrets } = require('../core/security');

function chunkText(text, { target = 900, max = 1600, kind = 'prose', filename = '' } = {}) {
  const chunks = [];
  const lines = text.split('\n');
  const stack = []; // [{level, title}]
  let pos = 0; let buf = ''; let bufStart = 0; let bufPath = ''; let lineNo = 0; let bufLine = 1;
  const path = () => stack.map((s) => s.title).join(' > ');
  const flush = () => {
    const t = buf.replace(/\s+$/g, '');
    if (t.trim()) {
      const lead = buf.length - buf.replace(/^\s+/, '').length;
      const sp = kind === 'code' ? `${filename || 'file'}:L${bufLine}-L${Math.max(bufLine, lineNo)}` : bufPath || null;
      chunks.push({ text: t.trim(), char_start: bufStart + lead, char_end: bufStart + lead + t.trim().length, section_path: sp, heading: kind === 'code' ? null : (bufPath ? bufPath.split(' > ').pop() : null) });
    }
    buf = ''; bufStart = pos; bufPath = path(); bufLine = lineNo + 1;
  };
  const startNew = () => { if (!buf) { bufStart = pos; bufPath = path(); } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    lineNo = i + 1;
    const lineLen = line.length + 1;
    const h = kind === 'prose' ? /^(#{1,6})\s+(.*\S)\s*$/.exec(line) : null;
    if (h) {
      flush();
      while (stack.length && stack[stack.length - 1].level >= h[1].length) stack.pop();
      stack.push({ level: h[1].length, title: h[2] });
      bufStart = pos; bufPath = path();
      buf = line + '\n';
      pos += lineLen;
      continue;
    }
    startNew();
    const isBlank = line.trim() === '';
    if (kind === 'code') {
      if (buf.length + lineLen > target && buf.trim()) { lineNo = i; flush(); lineNo = i + 1; bufLine = lineNo; }
    } else if ((isBlank && buf.length >= target) || buf.length + lineLen > max) {
      flush();
    }
    buf += line + '\n';
    pos += lineLen;
  }
  flush();
  return chunks.map((c, i) => finalize(c, i));
}

function finalize(c, ordinal) {
  const inj = scanInjection(c.text);
  const secrets = scanSecrets(c.text);
  const indexedText = secrets.length ? redactSecrets(c.text) : c.text;
  return {
    ordinal, section_path: c.section_path, heading: c.heading, char_start: c.char_start, char_end: c.char_end,
    text: indexedText, text_hash: sha256(c.text), token_estimate: estimateTokens(indexedText),
    injection_score: inj.score, injection_flags: inj.flags.length ? JSON.stringify(inj.flags) : null, has_secret: secrets.length ? 1 : 0,
  };
}

module.exports = { chunkText };
