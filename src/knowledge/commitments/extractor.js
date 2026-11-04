'use strict';
/**
 * Commitment extraction (rule-based, pluggable). Turns a captured message/document
 * excerpt into CANDIDATE commitments with a confidence score. Candidates are never
 * assigned automatically: the register routes them to confirmation.
 */
const { parseDeadline } = require('./deadlines');
const { scanInjection } = require('../core/security');

const LEAD = [
  { kind: 'request', conf: 0.55, re: /^(?:hi|hey|hello)?[\s,!.]*(?:can|could|would|will) you (?:please |kindly )?(.+)$/i },
  { kind: 'request', conf: 0.6, re: /^(?:please|kindly) (.+)$/i },
  { kind: 'request', conf: 0.55, re: /\b(?:i|we) (?:need|require|want|would like|'d like|expect)(?: you| the team| someone)?(?: to)? (.+)$/i },
  { kind: 'request', conf: 0.55, re: /\bneed(?:s)? you to (.+)$/i },
  { kind: 'instruction', conf: 0.5, re: /^(?:make sure|ensure|remember to|don't forget to) (.+)$/i },
  { kind: 'promise', conf: 0.6, re: /\b(?:i|we)(?:'ll| will| promise to| am going to|'m going to) (.+)$/i, responsibleIsAuthor: true },
  { kind: 'agreement', conf: 0.55, re: /\b(?:agreed|we agree|it'?s agreed|deal)[:,]? (.+)$/i },
  { kind: 'action_item', conf: 0.7, re: /\b(?:action(?: item)?|todo|to-do|ai)[:\-]\s*(.+)$/i },
  { kind: 'follow_up', conf: 0.5, re: /\b(?:follow up|circle back|check back)(?: on| with| about)? (.+)$/i },
  { kind: 'blocker', conf: 0.55, re: /\b(?:blocked (?:by|on)|waiting (?:on|for)|can'?t proceed (?:until|without)) (.+)$/i },
  { kind: 'feedback', conf: 0.5, re: /\bfeedback[:\-]\s*(.+)$/i },
  { kind: 'question', conf: 0.45, re: /^(.+\?)$/ },
];
const HEDGE = /\b(maybe|perhaps|might|possibly|would be nice|nice to have|if possible|if we have time|at some point|someday|thinking about|not sure|probably)\b/i;
const HYPO = /^(?:if|when|unless|suppose|imagine)\b/i;
const NOUNS = /\b(review|estimate|report|plan|summary|proposal|spec|design|audit|migration|fix|deploy|release|update|document|test|analysis|quote|invoice|timeline|demo|prototype|checklist|rollout)\b/i;

function splitSentences(text) {
  return String(text).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}
const strip = (s) => s.replace(/\s+/g, ' ').replace(/[.!\s]+$/g, '').trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function splitOutcomes(clause) {
  const parts = clause.split(/\s*(?:,\s*(?:and\s+)?|;\s*|\s+and\s+|\s+plus\s+)(?=(?:a|an|the|your|our|my|some)\s|[a-z]+\s+(?:review|estimate|report|plan|summary|proposal|spec|audit|update|test))/i);
  const ok = parts.length > 1 && parts.every((p) => p.split(/\s+/).length >= 2 && p.length < 120 && !/\b(that|which|who|because|if|when|so)\b/i.test(p));
  return ok ? parts.map(strip).filter(Boolean) : [strip(clause)];
}

class RuleCommitmentExtractor {
  constructor({ tzOffsetMinutes = 0 } = {}) { this.id = 'rule-based'; this.version = '1'; this.tz = tzOffsetMinutes; }

  async extract({ text, author, ts, addressees = [] }) {
    const ref = ts ? new Date(ts) : new Date();
    const out = [];
    for (const raw of splitSentences(text)) {
      const sentence = raw.replace(/^(?:hi|hey|hello|dear|good (?:morning|afternoon|evening))\b[^,!.:]{0,30}[,!.:]\s*/i, '').trim();
      if (!sentence) continue;
      if (scanInjection(sentence).suspicious) continue; // untrusted directive-to-agent text is not a commitment
      if (HYPO.test(sentence)) continue;
      let hit = null;
      for (const l of LEAD) { const m = l.re.exec(sentence); if (m) { hit = { ...l, body: m[1] }; break; } }
      if (!hit) continue;
      const dl = parseDeadline(sentence, ref, { tzOffsetMinutes: this.tz });
      let body = hit.body;
      if (dl && dl.text) body = body.replace(new RegExp(`\\s*(?:\\b(?:by|before|until|on|due|for)\\b\\s*)?(?:${dl.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b.*$`, 'i'), '');
      body = body.replace(/\s+\b(?:by|before|until)\s*$/i, '');
      if (!strip(body) || strip(body).split(/\s+/).length < 2) continue;
      const priority = /\b(urgent|asap|critical|immediately|right away|blocker)\b/i.test(sentence) ? 'urgent' : /\b(important|high priority|top priority)\b/i.test(sentence) ? 'high' : 'medium';
      const outcomes = hit.kind === 'question' ? [strip(body)] : splitOutcomes(body);
      const lead = outcomes[0] && !/^(a|an|the|your|our|my|some)\b/i.test(outcomes[0]) ? outcomes[0].split(/\s+/)[0] : null;
      for (let oi = 0; oi < outcomes.length; oi++) {
        let o = outcomes[oi];
        if (oi > 0 && lead && /^(a|an|the|your|our|my|some)\b/i.test(o)) o = `${lead} ${o}`;
        let conf = hit.conf;
        if (dl && dl.iso) conf += 0.1; else if (dl && dl.needsClarification) conf -= 0.05;
        if (NOUNS.test(o)) conf += 0.1;
        if (HEDGE.test(sentence)) conf -= 0.25;
        if (/\?\s*$/.test(sentence) && hit.kind === 'request') conf += 0.0;
        const responsibleHint = hit.responsibleIsAuthor ? author : (addressees.length === 1 && ['request', 'instruction', 'action_item'].includes(hit.kind) ? addressees[0] : null);
        out.push({
          kind: dl && !dl.needsClarification && hit.kind === 'request' && /\b(deliver|ship|send|submit|complete)\b/i.test(o) ? 'deliverable' : hit.kind,
          description: cap(strip(o)), confidence: +Math.max(0.05, Math.min(0.95, conf)).toFixed(2), priority,
          deadline: dl ? { at: dl.iso, text: dl.text, confidence: dl.confidence, needsClarification: dl.needsClarification, reason: dl.reason } : null,
          responsibleHint, requester: hit.responsibleIsAuthor ? null : author, evidenceQuote: sentence,
        });
      }
    }
    return out;
  }
}
module.exports = { RuleCommitmentExtractor };
