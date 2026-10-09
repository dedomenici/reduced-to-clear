// Photo storage + metadata stripping (no native deps).
//  - 'db'   : photos stored as BLOBs in the database (works with Turso on free hosting; no disk needed)
//  - 'disk' : photos stored as files in UPLOADS_DIR (needs persistent storage)
// Photos are already resized/re-encoded in the browser; the server still enforces a size cap,
// checks the real file type from magic bytes and strips EXIF/XMP/IPTC/comments (incl. GPS).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function sniffType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('corrupt JPEG');
    while (buf[i + 1] === 0xff) i++; // fill bytes
    const marker = buf[i + 1];
    if (marker === 0xda || marker === 0xd9) { out.push(buf.subarray(i)); break; } // start of scan / EOI: copy rest
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { out.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    // drop APP1 (EXIF/XMP, incl. GPS), APP13 (IPTC/Photoshop), COM; keep APP0 JFIF, APP2 ICC, APP14 Adobe, tables, frames
    if (!(marker === 0xe1 || marker === 0xed || marker === 0xfe)) out.push(seg);
    i += 2 + len;
  }
  return Buffer.concat(out);
}

function stripPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const end = i + 12 + len;
    if (!['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'].includes(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

function stripWebp(buf) {
  const chunks = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const end = i + 8 + size + (size & 1);
    let chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
    if (fourcc === 'VP8X') chunk[8] &= ~(0x08 | 0x04); // clear EXIF + XMP flags
    if (fourcc !== 'EXIF' && fourcc !== 'XMP ') chunks.push(chunk);
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii'); header.writeUInt32LE(4 + body.length, 4); header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
}

function stripMetadata(buf, type) {
  if (type === 'image/jpeg') return stripJpeg(buf);
  if (type === 'image/png') return stripPng(buf);
  if (type === 'image/webp') return stripWebp(buf);
  throw new Error('unsupported type');
}

// Validate + clean an uploaded buffer. Returns { data, mime } or throws Error with a user-facing message.
function prepare(buf, maxBytes) {
  const mime = sniffType(buf);
  if (!mime) throw Object.assign(new Error('Photo must be a JPEG, PNG or WebP image'), { status: 400 });
  let data;
  try { data = stripMetadata(buf, mime); } catch { throw Object.assign(new Error('Could not read that image'), { status: 400 }); }
  if (data.length > maxBytes) throw Object.assign(new Error(`Photo too large (max ${Math.round(maxBytes / 1024)}KB)`), { status: 400 });
  return { data, mime };
}

const KEY_RE = /^[a-f0-9]{24}(\.(jpg|png|webp))?$/;

function createPhotoStore({ db, mode, uploadsDir }) {
  if (mode === 'disk') fs.mkdirSync(uploadsDir, { recursive: true });
  return {
    mode,
    async save({ data, mime }) {
      const id = crypto.randomBytes(12).toString('hex');
      if (mode === 'db') {
        await db.run('INSERT INTO photos (id, mime, bytes, data, created_at) VALUES (?,?,?,?,?)', [id, mime, data.length, data, new Date().toISOString()]);
        return id;
      }
      const key = id + EXT[mime];
      await fs.promises.writeFile(path.join(uploadsDir, key), data);
      return key;
    },
    async get(key) {
      if (!KEY_RE.test(key)) return null;
      if (mode === 'db' || !key.includes('.')) {
        const row = await db.get('SELECT mime, data FROM photos WHERE id = ?', [key]);
        return row ? { mime: row.mime, data: Buffer.from(row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : row.data) } : null;
      }
      const file = path.join(uploadsDir, key);
      try { return { mime: Object.keys(EXT).find(m => key.endsWith(EXT[m])), data: await fs.promises.readFile(file) }; } catch { return null; }
    },
    async remove(key) {
      if (!key || !KEY_RE.test(key)) return;
      if (!key.includes('.')) await db.run('DELETE FROM photos WHERE id = ?', [key]);
      else fs.promises.unlink(path.join(uploadsDir, key)).catch(() => {});
    },
    url: key => (key ? '/photos/' + key : null),
  };
}

module.exports = { sniffType, stripMetadata, prepare, createPhotoStore, KEY_RE };
