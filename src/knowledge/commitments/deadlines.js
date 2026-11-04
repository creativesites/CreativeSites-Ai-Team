'use strict';
/**
 * Deadline parsing relative to the message timestamp. Only returns a concrete
 * date when it is unambiguous; otherwise returns needsClarification so a human
 * confirms instead of the system guessing. Times default to end of day.
 * Timezone: UTC unless tzOffsetMinutes is supplied (document the org timezone in settings).
 */
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthIdx = (m) => MONTHS.findIndex((x) => x.startsWith(m.toLowerCase().slice(0, 3)));

function endOfDay(y, m, d, tz = 0, h = 23, min = 59) { return new Date(Date.UTC(y, m, d, h, min, 59) - tz * 60000); }
function ymd(date, tz = 0) { const d = new Date(date.getTime() + tz * 60000); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay() }; }

function parseTime(text) {
  const m = /\b(?:at|by|before|until)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (!m) return null;
  let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12;
  return { h, min: m[2] ? +m[2] : 0 };
}

/** @returns {{iso:string|null, text:string, confidence:number, needsClarification:boolean, reason?:string}|null} */
function parseDeadline(text, ref, { tzOffsetMinutes = 0 } = {}) {
  const t = String(text);
  const tz = tzOffsetMinutes;
  const now = ymd(ref, tz);
  const time = parseTime(t);
  const at = (y, m, d) => (time ? endOfDay(y, m, d, tz, time.h, time.min) : endOfDay(y, m, d, tz));
  const res = (date, matched, conf = 0.9, extra = {}) => ({ iso: date.toISOString(), text: matched, confidence: conf, needsClarification: false, ...extra });
  let m;

  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t))) return res(at(+m[1], +m[2] - 1, +m[3]), m[0], 0.98);
  if ((m = new RegExp(`\\b(?:on |by |before )?${MON_RE}\\.? (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b`, 'i').exec(t)) && monthIdx(m[1]) >= 0) {
    const mi = monthIdx(m[1]); let y = m[3] ? +m[3] : now.y;
    let cand = at(y, mi, +m[2]);
    if (!m[3] && cand < ref) cand = at(y + 1, mi, +m[2]);
    return res(cand, m[0].trim(), m[3] ? 0.95 : 0.85);
  }
  if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MON_RE}(?:,? (\\d{4}))?\\b`, 'i').exec(t)) && monthIdx(m[2]) >= 0) {
    const mi = monthIdx(m[2]); const y = m[3] ? +m[3] : now.y;
    let cand = at(y, mi, +m[1]); if (!m[3] && cand < ref) cand = at(y + 1, mi, +m[1]);
    return res(cand, m[0], m[3] ? 0.95 : 0.85);
  }
  if ((m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(t))) {
    const a = +m[1]; const b = +m[2];
    if (a > 12) return res(at(+m[3], b - 1, a), m[0], 0.9);
    if (b > 12) return res(at(+m[3], a - 1, b), m[0], 0.9);
    if (a === b) return res(at(+m[3], a - 1, b), m[0], 0.9);
    return { iso: null, text: m[0], confidence: 0.3, needsClarification: true, reason: 'ambiguous day/month order' };
  }
  if (/\b(eod|end of (?:the )?day|close of business|cob)\b/i.test(t)) return res(time ? at(now.y, now.m, now.d) : endOfDay(now.y, now.m, now.d, tz, 17, 0), 'end of day', 0.8);
  if (/\btonight\b/i.test(t)) return res(endOfDay(now.y, now.m, now.d, tz), 'tonight', 0.85);
  if (/\btoday\b/i.test(t)) return res(at(now.y, now.m, now.d), 'today', 0.9);
  if (/\btomorrow\b/i.test(t)) { const d = new Date(Date.UTC(now.y, now.m, now.d + 1)); return res(at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), 'tomorrow', 0.9); }
  if ((m = /\bin (\d+|a|an|one|two|three|four|five) (hour|day|week|business day)s?\b/i.exec(t))) {
    const n = ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 })[m[1].toLowerCase()] || +m[1];
    if (/hour/i.test(m[2])) return res(new Date(ref.getTime() + n * 3600000), m[0], 0.9);
    const days = /week/i.test(m[2]) ? n * 7 : n; const d = new Date(Date.UTC(now.y, now.m, now.d + days));
    return res(at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), m[0], 0.85);
  }
  if (/\b(?:end of (?:the )?week|eow)\b/i.test(t)) { const add = (5 - now.wd + 7) % 7; const d = new Date(Date.UTC(now.y, now.m, now.d + add)); return res(endOfDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), tz, 17, 0), 'end of week', 0.75); }
  if (/\bend of (?:the )?month\b/i.test(t)) { return res(endOfDay(now.y, now.m + 1, 0, tz), 'end of month', 0.8); }
  if ((m = new RegExp(`\\b(?:(next|this|coming) )?(${DAYS.join('|')})\\b`, 'i').exec(t)) && /\b(by|before|until|on|this|next|due|deadline|end of)\b/i.test(t)) {
    const wd = DAYS.indexOf(m[2].toLowerCase()); const mod = (m[1] || '').toLowerCase();
    let add = (wd - now.wd + 7) % 7;
    if (add === 0) {
      if (mod === 'next') add = 7;
      else return { iso: null, text: m[0], confidence: 0.35, needsClarification: true, reason: `"${m[2]}" is today's weekday; unclear whether today or a week from today` };
    } else if (mod === 'next') { add += 7; }
    const d = new Date(Date.UTC(now.y, now.m, now.d + add));
    return res(at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), m[0], mod === 'next' ? 0.7 : 0.9);
  }
  if (/\bnext week\b/i.test(t)) return { iso: null, text: 'next week', confidence: 0.4, needsClarification: true, reason: '"next week" has no specific day' };
  if (/\b(soon|asap|a\.s\.a\.p|as soon as possible|when you can|at some point)\b/i.test(t)) return { iso: null, text: 'asap', confidence: 0.3, needsClarification: true, reason: 'no concrete date' };
  return null;
}

module.exports = { parseDeadline };
