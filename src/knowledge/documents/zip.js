'use strict';
/** Minimal, bounded ZIP reader (central directory) for OOXML. Guards against zip bombs. */
const zlib = require('zlib');

const LIMITS = { maxEntries: 5000, maxTotalBytes: 100 * 1024 * 1024, maxEntryBytes: 40 * 1024 * 1024 };

function readZip(buf, limits = LIMITS) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP container');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (count > limits.maxEntries) throw new Error('ZIP has too many entries');
  const entries = new Map();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('Corrupt ZIP central directory');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nlen).toString('utf8');
    off += 46 + nlen + elen + clen;
    if (name.includes('..') || name.startsWith('/')) continue; // path traversal names are ignored
    total += usize;
    if (usize > limits.maxEntryBytes || total > limits.maxTotalBytes) throw new Error('ZIP exceeds size limits (possible bomb)');
    entries.set(name, { method, csize, usize, lho });
  }
  const read = (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const lnlen = buf.readUInt16LE(e.lho + 26);
    const lelen = buf.readUInt16LE(e.lho + 28);
    const start = e.lho + 30 + lnlen + lelen;
    const data = buf.slice(start, start + e.csize);
    if (e.method === 0) return data;
    if (e.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: limits.maxEntryBytes });
    throw new Error(`Unsupported ZIP method ${e.method}`);
  };
  return { names: () => Array.from(entries.keys()), has: (n) => entries.has(n), read };
}

/** Test/helper writer: STORED or DEFLATE entries. */
function writeZip(files, { compress = true } = {}) {
  const parts = []; const central = []; let offset = 0;
  const crc32 = (b) => {
    let c; let crc = 0xffffffff;
    for (let i = 0; i < b.length; i++) { c = (crc ^ b[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
    return (crc ^ 0xffffffff) >>> 0;
  };
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const data = compress ? zlib.deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(compress ? 8 : 0, 8);
    h.writeUInt32LE(crc32(raw), 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nameBuf.length, 26);
    parts.push(h, nameBuf, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(compress ? 8 : 0, 10);
    c.writeUInt32LE(crc32(raw), 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += h.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

module.exports = { readZip, writeZip };
