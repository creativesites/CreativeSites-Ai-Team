'use strict';
/**
 * Embedding provider interface. The domain never imports a vendor SDK:
 * remote/local-model providers implement { id, version, dim, embed(texts) }.
 *
 * The built-in provider is a deterministic local feature-hashing embedder
 * (word stems + bigrams + character n-grams). It is lexical-semantic, NOT a
 * neural model: it handles inflection and near-spelling but not true synonyms.
 * Swap providers and call `index.reindexEmbeddings()` to upgrade; vectors are
 * stored with model id + version so mixed indexes are detectable.
 */
const crypto = require('crypto');

const STOP = new Set('a an the and or of to in on for with at by from is are was were be been being it its this that these those as if then than so such do does did not no can could should would will shall may might must has have had we you they he she i our your their his her them us me my what which who whom whose when where why how'.split(' '));

function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ion')) return w.slice(0, -3);
  return w;
}
function tokenize(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t)).map(stem);
}
const hash32 = (s) => crypto.createHash('md5').update(s).digest().readUInt32LE(0);

class HashingEmbeddingProvider {
  constructor({ dim = 512 } = {}) { this.dim = dim; this.id = 'local-hashing'; this.version = '1'; }
  async embed(texts) { return texts.map((t) => this._one(t)); }
  _one(text) {
    const v = new Float32Array(this.dim);
    const toks = tokenize(text);
    const add = (feat, w) => { const h = hash32(feat); v[h % this.dim] += (h & 0x80000000 ? -1 : 1) * w; };
    const tf = new Map();
    toks.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    for (const [t, c] of tf) {
      add('w:' + t, 1 + Math.log(c));
      if (t.length >= 4) for (let i = 0; i <= t.length - 3; i++) add('c:' + t.slice(i, i + 3), 0.25);
    }
    for (let i = 0; i < toks.length - 1; i++) add('b:' + toks[i] + '_' + toks[i + 1], 0.6);
    let n = 0; for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    return v;
  }
}

const toBlob = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
const fromBlob = (b) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
function dot(a, b) { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; }

module.exports = { HashingEmbeddingProvider, tokenize, toBlob, fromBlob, dot, STOP };
