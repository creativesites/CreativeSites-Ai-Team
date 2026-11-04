'use strict';
/**
 * Knowledge candidate extraction from document chunks. Pluggable: any extractor
 * returning the same candidate shape (e.g. an LLM-backed one) can replace this.
 * Everything produced is a PROPOSAL carrying a precise source reference; imperative
 * text aimed at agents (prompt injection) is never converted into knowledge.
 */
const { scanInjection } = require('../core/security');
const { sha256 } = require('../core/util');

const RULES = [
  { type: 'decision', conf: 0.65, re: /\b(we (?:have )?(?:decided|agreed|chose|selected|resolved)|decision\s*:|it was decided|has been (?:approved|selected))\b/i },
  { type: 'lesson', conf: 0.6, re: /\b(lessons? learned|we learned|in hindsight|root cause was|retrospective)\b/i },
  { type: 'policy', conf: 0.65, re: /\b(policy|standard|convention|mandatory|compliance)\b.*\b(must|shall|required|always|never)\b|\b(always|never)\b.*\b(must|shall)\b/i },
  { type: 'preference', conf: 0.55, re: /\b(prefer(?:s|red)?|preference)\b/i },
  { type: 'assumption', conf: 0.5, re: /\b(assum(?:e|es|ed|ing|ption)s?)\b/i },
  { type: 'hypothesis', conf: 0.45, re: /\b(hypothes[ie]s|we believe that|we expect that|might be)\b/i },
  { type: 'requirement', conf: 0.7, re: /\b(must|shall|is required to|are required to|will support|needs? to be|has to)\b/i },
  { type: 'requirement', conf: 0.5, re: /\bshould\b/i },
  { type: 'instruction', conf: 0.55, re: /^(?:always|never|do not|don't|ensure|make sure|use|avoid|run|keep)\b/i },
];

function sentences(text) {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])|\n+(?=[-*•\d])/).map((s) => s.replace(/^[\s\-*•\d.)]+/, '').trim()).filter(Boolean);
}

class HeuristicKnowledgeExtractor {
  constructor({ maxPerDocument = 100 } = {}) { this.maxPerDocument = maxPerDocument; this.id = 'heuristic'; this.version = '1'; }

  async extract({ chunks, document, version }) {
    const out = []; const seen = new Set();
    for (const c of chunks) {
      if (c.injection_score >= 0.5) continue; // untrusted instruction-like content is not turned into knowledge
      let cursor = 0;
      for (const sent of sentences(c.text)) {
        const at = c.text.indexOf(sent, cursor); if (at >= 0) cursor = at + sent.length;
        if (sent.length < 20 || sent.length > 420 || /\?\s*$/.test(sent) || /^#/.test(sent)) continue;
        if (scanInjection(sent).suspicious) continue;
        const rule = RULES.find((r) => r.re.test(sent));
        if (!rule) continue;
        const norm = sent.toLowerCase().replace(/\W+/g, ' ').trim();
        const key = sha256(norm);
        if (seen.has(key)) continue; seen.add(key);
        out.push({
          type: rule.type, title: sent.length > 90 ? sent.slice(0, 87) + '…' : sent, content: sent, confidence: rule.conf,
          sourceRef: { documentId: document.id, documentName: document.display_name, versionId: version.id, versionNo: version.version_no, chunkId: c.id, sectionPath: c.section_path,
            charStart: c.char_start + Math.max(0, at), charEnd: c.char_start + Math.max(0, at) + sent.length, quote: sent },
        });
        if (out.length >= this.maxPerDocument) return out;
      }
    }
    return out;
  }
}
module.exports = { HeuristicKnowledgeExtractor };
