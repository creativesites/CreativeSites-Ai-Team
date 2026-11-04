'use strict';
const crypto = require('crypto');

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

/** Sortable, collision-resistant ids: <prefix>_<time base36><random>. */
function newId(prefix) {
  const t = Date.now().toString(36).padStart(9, '0');
  return `${prefix}_${t}${crypto.randomBytes(5).toString('hex')}`;
}

/** Injectable clock so deadlines, staleness and weekly windows are testable. */
class Clock {
  constructor(fn) { this._fn = fn || (() => new Date()); }
  now() { return new Date(this._fn()); }
  iso() { return this.now().toISOString(); }
}

/** Deterministic JSON (sorted keys) for hashing. */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).sort().filter((k) => value[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

const parseJson = (s, fallback) => {
  if (s === null || s === undefined || s === '') return fallback;
  try { return JSON.parse(s); } catch (_) { return fallback; }
};
const toJson = (v) => (v === undefined || v === null ? null : JSON.stringify(v));

/** Rough, provider-neutral token estimate (≈4 chars/token). */
const estimateTokens = (text) => Math.ceil(String(text || '').length / 4);

/** ISO-week key like 2026-W45 (UTC, Monday start). */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

module.exports = { sha256, newId, Clock, canonicalJson, parseJson, toJson, estimateTokens, isoWeek };
