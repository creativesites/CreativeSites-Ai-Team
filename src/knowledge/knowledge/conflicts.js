'use strict';
/**
 * Conflict detection heuristics. These FLAG candidates for resolution; they never
 * decide truth. Signals: shared subject_key with different content (explicit), or
 * topical overlap plus a contradiction cue (negation flip, differing values,
 * replacement language, different choice of "use X").
 */
const { tokenize } = require('../retrieval/embeddings');

const NEG = /\b(must not|shall not|should not|do not|don't|never|no longer|cannot|can't|prohibited|forbidden|not allowed|disallow)/i;
const POS = /\b(must|shall|should|always|required|allowed|will)\b/i;
const REPLACE = /\b(instead of|rather than|replaces?|replaced by|no longer|deprecated|supersedes?|switch(?:ed)? to|migrate[sd]? to|changed to)\b/i;
const COMPARABLE = ['fact', 'decision', 'requirement', 'instruction', 'policy', 'preference'];

const nums = (s) => Array.from(new Set((s.match(/\b\d+(?:\.\d+)?\s?(?:%|ms|s|sec|seconds?|min|minutes?|h|hours?|d|days?|kb|mb|gb|x)?\b/gi) || []).map((x) => x.toLowerCase().replace(/\s+/g, ''))));
const useObjects = (s) => Array.from(new Set(Array.from(s.matchAll(/\b(?:use|using|adopt|choose|chose|select(?:ed)?|standardi[sz]e on)\s+(?:the\s+)?([A-Za-z][\w.+-]{2,})/gi)).map((m) => m[1].toLowerCase())));
const jaccard = (a, b) => { const A = new Set(a); const B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i || 1); };

function assess(a, b) {
  const ta = tokenize(a.title + ' ' + a.content); const tb = tokenize(b.title + ' ' + b.content);
  const overlap = jaccard(ta, tb);
  if (a.subject_key && a.subject_key === b.subject_key && a.content_hash !== b.content_hash) {
    return { kind: 'explicit', score: 1, reason: `Same subject "${a.subject_key}" with different content` };
  }
  if (overlap < 0.22) return null;
  const reasons = [];
  const na = NEG.test(a.content); const nb = NEG.test(b.content);
  if (na !== nb && (POS.test(a.content) || POS.test(b.content))) reasons.push('one statement prohibits what the other requires or permits');
  const A = nums(a.content); const B = nums(b.content);
  if (A.length && B.length && jaccard(A, B) < 1 && !A.some((x) => B.includes(x))) reasons.push(`different values (${A.slice(0, 3).join(', ')} vs ${B.slice(0, 3).join(', ')})`);
  const ua = useObjects(a.content); const ub = useObjects(b.content);
  if (ua.length && ub.length && !ua.some((x) => ub.includes(x))) reasons.push(`different choices (${ua[0]} vs ${ub[0]})`);
  if (REPLACE.test(a.content) || REPLACE.test(b.content)) reasons.push('replacement/deprecation language');
  if (!reasons.length) return null;
  return { kind: 'potential', score: +Math.min(1, overlap + 0.15 * reasons.length).toFixed(2), reason: reasons.join('; ') };
}

module.exports = { assess, COMPARABLE, jaccard };
