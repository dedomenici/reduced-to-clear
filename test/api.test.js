// End-to-end API tests: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { createApp } = require('../src/app');
const predict = require('../src/predict');

let server, base, app;
const jar = {}; // name -> cookie string
async function req(who, method, url, { json, form, redirect = 'manual' } = {}) {
  const headers = {};
  if (jar[who]) headers.Cookie = jar[who];
  let body;
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const r = await fetch(base + url, { method, headers, body, redirect });
  const set = r.headers.getSetCookie?.() || [];
  if (set.length) {
    const cur = Object.fromEntries((jar[who] || '').split('; ').filter(Boolean).map(c => c.split('=')));
    for (const c of set) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) cur[k] = v; else delete cur[k]; }
    jar[who] = Object.entries(cur).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
}
async function gate(who) { await req(who, 'POST', '/gate', { form: new URLSearchParams({ password: config.sitePassword }) }); }
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

// Stub Overpass: Paris tile returns the fixture, everywhere else returns no stores. Records every call.
const PARIS = { lat: 48.8566, lng: 2.3522 }, SYDNEY = { lat: -33.8688, lng: 151.2093 };
const overpassCalls = [];
const overpassFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'overpass-paris.json'), 'utf8'));
async function stubOverpass(url, init) {
  const query = decodeURIComponent(String(init.body).replace(/^data=/, ''));
  overpassCalls.push({ url, headers: init.headers, query });
  const [s, w, n, e] = query.match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/).slice(1).map(Number);
  const inBox = PARIS.lat >= s && PARIS.lat <= n && PARIS.lng >= w && PARIS.lng <= e;
  return new Response(JSON.stringify(inBox ? overpassFixture : { elements: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test.before(async () => {
  app = await createApp({ dbFile: ':memory:', tursoUrl: process.env.TEST_TURSO_URL || '', photosEnabled: true, photoStorage: 'db', quiet: true,
    osm: { fetch: stubOverpass, minIntervalMs: 0, endpoints: ['https://overpass.test/api/interpreter'] } });
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('healthz is public; stores seeded from committed JSON on first start', async () => {
  const r = await req('anon', 'GET', '/healthz'); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.ok, true);
  assert.ok((await app.locals.db.get('SELECT COUNT(*) AS n FROM stores')).n > 1000, 'stores seeded');
  assert.strictEqual(app.locals.db.kind, process.env.TEST_TURSO_URL ? 'libsql-file' : 'sqljs-memory');
  assert.strictEqual((await app.locals.db.get('SELECT MAX(version) AS v FROM schema_migrations')).v, require('../src/db').MIGRATIONS.length);
});

test('site gate blocks everything until password entered', async () => {
  let r = await req('anon', 'GET', '/');
  assert.strictEqual(r.status, 302); assert.strictEqual(r.headers.get('location'), '/gate');
  r = await req('anon', 'GET', '/api/posts'); assert.strictEqual(r.status, 401); assert.strictEqual(r.data.error, 'site_locked');
  r = await req('anon', 'GET', '/app.js'); assert.strictEqual(r.status, 302);
  r = await req('anon', 'POST', '/gate', { form: new URLSearchParams({ password: 'nope' }) }); assert.strictEqual(r.status, 401);
  r = await req('anon', 'GET', '/gate'); assert.ok(!r.data.includes(config.sitePassword), 'password must not appear in gate page');
  await gate('anon');
  r = await req('anon', 'GET', '/'); assert.strictEqual(r.status, 200);
  r = await req('anon', 'GET', '/app.js'); assert.ok(!r.data.includes(config.sitePassword), 'password must not be in client JS');
});

test('PWA manifest, icons and service worker are reachable before the gate (nothing else is)', async () => {
  let r = await req('pwa', 'GET', '/manifest.webmanifest'); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.display, 'standalone');
  assert.ok(r.data.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const i of r.data.icons) { const ir = await fetch(base + i.src); assert.strictEqual(ir.status, 200); assert.strictEqual(ir.headers.get('content-type'), 'image/png'); }
  r = await req('pwa', 'GET', '/sw.js'); assert.strictEqual(r.status, 200);
  r = await req('pwa', 'GET', '/index.html'); assert.strictEqual(r.status, 302);
  r = await req('pwa', 'GET', '/style.css'); assert.strictEqual(r.status, 302);
});

test('guests can browse but must register to post or mark gone', async () => {
  await gate('guest');
  let r = await req('guest', 'GET', '/api/posts?lat=51.5&lng=-0.1'); assert.strictEqual(r.status, 200);
  r = await req('guest', 'POST', '/api/posts', { json: { items: 'x' } }); assert.strictEqual(r.status, 401); assert.strictEqual(r.data.error, 'login_required');
  r = await req('guest', 'POST', '/api/posts/1/gone'); assert.strictEqual(r.status, 401);
});

let postId;
test('register, post with photo, live SSE event, sorted feed', async () => {
  await gate('alice'); await gate('bob');
  let r = await req('alice', 'POST', '/api/register', { json: { email: 'alice@example.com', password: 'password1', displayName: 'Alice' } });
  assert.strictEqual(r.status, 200);
  r = await req('bob', 'POST', '/api/register', { json: { email: 'bob@example.com', password: 'password2', displayName: 'Bob' } });
  assert.strictEqual(r.status, 200);

  // open SSE as bob
  const ctrl = new AbortController();
  const sse = await fetch(base + '/api/stream', { headers: { Cookie: jar.bob }, signal: ctrl.signal });
  const reader = sse.body.getReader(); let sseText = '';
  const gotEvent = (async () => { while (!sseText.includes('event: post')) { const { value, done } = await reader.read(); if (done) break; sseText += Buffer.from(value).toString(); } })();

  const mk = (items, chain, lat, lng, minsAgo) => {
    const fd = new FormData();
    fd.set('chain', chain); fd.set('store_name', chain + ' Test Branch'); fd.set('items', items);
    fd.set('lat', lat); fd.set('lng', lng); fd.set('country', 'GB'); fd.set('city', 'London');
    fd.set('seen_at', new Date(Date.now() - minsAgo * 60e3).toISOString());
    fd.set('photo', new Blob([PNG], { type: 'image/png' }), 'p.png');
    return req('alice', 'POST', '/api/posts', { form: fd });
  };
  r = await mk('Sushi 75% off', 'Tesco', 51.5246, -0.0876, 10); assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  postId = r.data.post.id; assert.ok(r.data.post.photo_url); assert.strictEqual(r.data.post.currency, 'GBP');
  await Promise.race([gotEvent, new Promise((_, j) => setTimeout(() => j(new Error('no SSE event')), 3000))]);
  assert.ok(sseText.includes('Sushi 75% off')); ctrl.abort();

  r = await mk('Bread 20p', "Sainsbury's", 51.5250, -0.0880, 5); assert.strictEqual(r.status, 201);
  // same chain within 150m reuses the store
  r = await mk('Salads', 'Tesco', 51.5247, -0.0877, 1); assert.strictEqual(r.status, 201);
  const photoGate = await req('anon2', 'GET', r.data.post.photo_url); assert.strictEqual(photoGate.status, 401, 'uploads are behind gate');

  r = await req('bob', 'GET', '/api/posts?lat=51.5246&lng=-0.0876&radius_km=1');
  assert.strictEqual(r.data.posts.length, 3);
  const times = r.data.posts.map(p => p.created_at); assert.deepStrictEqual(times, [...times].sort().reverse(), 'most recent first');
  const tescoStores = new Set(r.data.posts.filter(p => p.chain === 'Tesco').map(p => p.store_id)); assert.strictEqual(tescoStores.size, 1);
  r = await req('bob', 'GET', '/api/posts?lat=51.40&lng=-0.30&radius_km=1'); assert.strictEqual(r.data.posts.length, 0, 'far away not shown');
});

test('edit own posts only; anyone registered can mark all gone', async () => {
  let r = await req('bob', 'PATCH', `/api/posts/${postId}`, { json: { items: 'hacked' } }); assert.strictEqual(r.status, 403);
  r = await req('alice', 'PATCH', `/api/posts/${postId}`, { json: { items: 'Sushi 75% off (3 left)' } });
  assert.strictEqual(r.status, 200); assert.ok(r.data.post.updated_at);
  r = await req('bob', 'POST', `/api/posts/${postId}/gone`); assert.strictEqual(r.status, 200); assert.ok(r.data.post.all_gone_at);
  assert.strictEqual(r.data.post.gone_by_name, 'Bob');
  r = await req('bob', 'GET', '/api/posts?lat=51.5246&lng=-0.0876'); assert.ok(!r.data.posts.some(p => p.id === postId), 'gone hidden by default');
  r = await req('bob', 'GET', '/api/posts?lat=51.5246&lng=-0.0876&include_gone=1'); assert.ok(r.data.posts.some(p => p.id === postId));
  r = await req('bob', 'DELETE', `/api/posts/${postId}/gone`); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.post.all_gone_at, null);
});

test('validation and rate limiting', async () => {
  const fd = (mins) => { const f = new FormData(); f.set('chain', 'Lidl'); f.set('items', 'x'); f.set('lat', '51.5'); f.set('lng', '-0.1'); f.set('seen_at', new Date(Date.now() + mins * 60e3).toISOString()); return f; };
  let r = await req('bob', 'POST', '/api/posts', { form: fd(60) }); assert.strictEqual(r.status, 400);
  r = await req('bob', 'POST', '/api/posts', { form: fd(-60 * 30) }); assert.strictEqual(r.status, 400);
  let last;
  for (let i = 0; i < config.limits.postsPerHour + 1; i++) last = await req('bob', 'POST', '/api/posts', { form: fd(-1) });
  assert.strictEqual(last.status, 429);
});

test('predictions: chain seeds + learned per-store histogram', async () => {
  const db = app.locals.db;
  let r = await req('bob', 'GET', '/api/stores?lat=51.5246&lng=-0.0876&radius_km=1&at=2026-10-07T12:00:00Z'); // a Wednesday
  const tesco = r.data.stores.find(s => s.chain === 'Tesco');
  assert.ok(tesco.prediction.isPrediction);
  assert.ok(tesco.prediction.chain.some(w => w.start === 19 && w.source.url.includes('mirror.co.uk')), 'seeded Tesco 19:00 window with source');
  // Insert historical reports: Wednesdays ~19:30 London time (18:30Z in BST)
  for (const d of ['2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07']) {
    await db.run(`INSERT INTO posts (user_id,store_id,items,seen_at,created_at,lat,lng,country,currency) VALUES (1,?,?,?,?,?,?, 'GB','GBP')`,
      [tesco.id, 'hist', `${d}T18:30:00Z`, `${d}T18:31:00Z`, tesco.lat, tesco.lng]);
  }
  r = await req('bob', 'GET', `/api/stores/${tesco.id}/predictions`);
  const wed = r.data.week.find(d => d.day === 'Wed');
  assert.ok(wed.learned && wed.learned.reports >= 3);
  assert.ok(wed.learned.windows.some(w => w.start <= 19 && w.end >= 20), 'learned window covers 19:00–20:00 local: ' + JSON.stringify(wed.learned.windows));
  assert.match(r.data.note, /PREDICTIONS/);
});

const FIX = f => fs.readFileSync(path.join(__dirname, 'fixtures', f));
async function postPhoto(who, buf, type, name = 'p.jpg') {
  const fd = new FormData(); fd.set('chain', 'Waitrose'); fd.set('items', 'photo test ' + name); fd.set('lat', '51.53'); fd.set('lng', '-0.12');
  fd.set('photo', new Blob([buf], { type }), name);
  return req(who, 'POST', '/api/posts', { form: fd });
}

test('photos in the database: EXIF/GPS stripped, size cap, gated cached route, deleted with post', async () => {
  await gate('carol');
  await req('carol', 'POST', '/api/register', { json: { email: 'carol@example.com', password: 'password3', displayName: 'Carol' } });
  const cfg = (await req('carol', 'GET', '/api/config')).data;
  assert.strictEqual(cfg.photosEnabled, true); assert.strictEqual(cfg.maxPhotoBytes, 300 * 1024);

  const jpg = FIX('exif.jpg'); assert.ok(jpg.includes('Exif') && jpg.includes('secret'));
  let r = await postPhoto('carol', jpg, 'image/jpeg');
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  const url = r.data.post.photo_url; const pid = r.data.post.id;
  assert.match(url, /^\/photos\/[a-f0-9]{24}$/);
  const key = url.split('/').pop();
  const row = await app.locals.db.get('SELECT mime, bytes FROM photos WHERE id = ?', [key]);
  assert.strictEqual(row.mime, 'image/jpeg'); assert.ok(row.bytes < jpg.length);

  // gated
  assert.strictEqual((await fetch(base + url)).status, 401);
  const got = await fetch(base + url, { headers: { Cookie: jar.carol } });
  assert.strictEqual(got.status, 200); assert.strictEqual(got.headers.get('content-type'), 'image/jpeg');
  assert.match(got.headers.get('cache-control'), /private, max-age=31536000, immutable/);
  const body = Buffer.from(await got.arrayBuffer());
  assert.ok(body[0] === 0xff && body[1] === 0xd8 && body.at(-2) === 0xff && body.at(-1) === 0xd9, 'still a valid JPEG');
  for (const needle of ['Exif', 'secret', 'TestCam', 'hidden comment']) assert.ok(!body.includes(needle), needle + ' stripped');
  const etag = got.headers.get('etag');
  assert.strictEqual((await fetch(base + url, { headers: { Cookie: jar.carol, 'If-None-Match': etag } })).status, 304);

  // PNG text chunks stripped
  r = await postPhoto('carol', FIX('text.png'), 'image/png', 'p.png'); assert.strictEqual(r.status, 201);
  const png = Buffer.from(await (await fetch(base + r.data.post.photo_url, { headers: { Cookie: jar.carol } })).arrayBuffer());
  assert.ok(!png.includes('secret place')); assert.ok(png.includes('IEND'));

  // not an image (type sniffed from bytes, not the claimed mime)
  r = await postPhoto('carol', Buffer.from('<script>alert(1)</script>'), 'image/jpeg'); assert.strictEqual(r.status, 400);
  // over the 300KB cap (padding in kept APP2 segments)
  const pad = Buffer.alloc(60000 + 4); pad[0] = 0xff; pad[1] = 0xe2; pad.writeUInt16BE(60002, 2);
  const big = Buffer.concat([jpg.subarray(0, 2), ...Array(6).fill(pad), jpg.subarray(2)]);
  r = await postPhoto('carol', big, 'image/jpeg'); assert.strictEqual(r.status, 400); assert.match(r.data.error, /too large/);
  // ...but metadata that gets stripped doesn't count against the cap
  const exifPad = Buffer.alloc(40000 + 4); exifPad[0] = 0xff; exifPad[1] = 0xe1; exifPad.writeUInt16BE(40002, 2);
  r = await postPhoto('carol', Buffer.concat([jpg.subarray(0, 2), ...Array(8).fill(exifPad), jpg.subarray(2)]), 'image/jpeg');
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));

  // deleting the post deletes the photo
  r = await req('carol', 'DELETE', `/api/posts/${pid}`); assert.strictEqual(r.status, 200);
  assert.strictEqual(await app.locals.db.get('SELECT id FROM photos WHERE id = ?', [key]), undefined);
  assert.strictEqual((await fetch(base + url, { headers: { Cookie: jar.carol } })).status, 404);
});

test('photo retention prunes old photos but keeps posts', async () => {
  const db = app.locals.db;
  const r = await postPhoto('carol', FIX('exif.jpg'), 'image/jpeg', 'old.jpg'); assert.strictEqual(r.status, 201);
  const key = r.data.post.photo_url.split('/').pop();
  await db.run('UPDATE posts SET created_at = ? WHERE id = ?', [new Date(Date.now() - 40 * 864e5).toISOString(), r.data.post.id]);
  assert.ok(await app.locals.prunePhotos() >= 1);
  assert.strictEqual(await db.get('SELECT id FROM photos WHERE id = ?', [key]), undefined);
  assert.strictEqual((await db.get('SELECT photo FROM posts WHERE id = ?', [r.data.post.id])).photo, null);
});

test('photo defaults: DB storage (Turso) => on by default; disk => off unless PHOTOS_ENABLED=true', () => {
  const { spawnSync } = require('child_process');
  const run = extra => JSON.parse(spawnSync(process.execPath, ['-e', "const c=require('./src/config');console.log(JSON.stringify([c.photoStorage,c.photosEnabled]))"],
    { cwd: config.ROOT, encoding: 'utf8', env: { ...process.env, SITE_PASSWORD: 'x', SITE_SECRET: 's', PHOTOS_ENABLED: '', PHOTO_STORAGE: '', TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '', ...extra } }).stdout);
  assert.deepStrictEqual(run({ TURSO_DATABASE_URL: 'libsql://x.turso.io', TURSO_AUTH_TOKEN: 't' }), ['db', true]);
  assert.deepStrictEqual(run({ TURSO_DATABASE_URL: 'libsql://x.turso.io', TURSO_AUTH_TOKEN: 't', PHOTOS_ENABLED: 'false' }), ['db', false]);
  assert.deepStrictEqual(run({}), ['disk', false]);
  assert.deepStrictEqual(run({ PHOTOS_ENABLED: 'true' }), ['disk', true]);
});

test('photos disabled: upload UI flag off, posts accepted, file parts ignored', async () => {
  const app2 = await createApp({ dbFile: ':memory:', tursoUrl: '', photosEnabled: false, quiet: true, seedStoresFile: null, osm: { enabled: false } });
  const srv2 = await new Promise(r => { const s = app2.listen(0, () => r(s)); });
  const b2 = `http://127.0.0.1:${srv2.address().port}`;
  try {
    const g = await fetch(b2 + '/gate', { method: 'POST', body: new URLSearchParams({ password: config.sitePassword }), redirect: 'manual' });
    let cookie = g.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const cfg = await (await fetch(b2 + '/api/config', { headers: { Cookie: cookie } })).json();
    assert.strictEqual(cfg.photosEnabled, false);
    const reg = await fetch(b2 + '/api/register', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'np@example.com', password: 'password9', displayName: 'NoPhoto' }) });
    cookie += '; ' + reg.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const before = fs.readdirSync(config.uploadsDir).length;
    const fd = new FormData(); fd.set('chain', 'Aldi'); fd.set('items', 'no photo mode'); fd.set('lat', '51.5'); fd.set('lng', '-0.1');
    fd.set('photo', new Blob([PNG], { type: 'image/png' }), 'p.png');
    const r = await fetch(b2 + '/api/posts', { method: 'POST', headers: { Cookie: cookie }, body: fd });
    const j = await r.json();
    assert.strictEqual(r.status, 201, JSON.stringify(j)); assert.strictEqual(j.post.photo_url, null);
    assert.strictEqual(fs.readdirSync(config.uploadsDir).length, before, 'no file written');
    const up = await fetch(b2 + '/photos/aaaaaaaaaaaaaaaaaaaaaaaa', { headers: { Cookie: cookie } }); assert.strictEqual(up.status, 404);
  } finally { srv2.close(); }
});

test('hosted mode requires SITE_SECRET from env and never writes it to disk', () => {
  const { spawnSync } = require('child_process');
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtc-hosted-'));
  const base = { ...process.env, SITE_PASSWORD: 'x', DATA_DIR: dir, RENDER: 'true' };
  delete base.SITE_SECRET;
  let r = spawnSync(process.execPath, ['-e', "require('./src/config')"], { cwd: config.ROOT, env: base, encoding: 'utf8' });
  assert.strictEqual(r.status, 1); assert.match(r.stderr, /SITE_SECRET/);
  r = spawnSync(process.execPath, ['-e', "const c=require('./src/config');console.log(c.hosted, c.siteSecret)"], { cwd: config.ROOT, env: { ...base, SITE_SECRET: 'from-env' }, encoding: 'utf8' });
  assert.strictEqual(r.status, 0); assert.strictEqual(r.stdout.trim(), 'true from-env');
  assert.ok(!fs.existsSync(path.join(dir, 'secret')), 'secret not written to disk');
  r = spawnSync(process.execPath, ['-e', "require('./src/config')"], { cwd: config.ROOT, env: { ...base, RENDER: '', SITE_SECRET: 's', TURSO_DATABASE_URL: 'libsql://x.turso.io' }, encoding: 'utf8' });
  assert.strictEqual(r.status, 1); assert.match(r.stderr, /TURSO_AUTH_TOKEN/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('localParts handles timezone/DST', () => {
  assert.deepStrictEqual(predict.localParts('2026-07-01T18:30:00Z', 'Europe/London'), { dow: 3, hour: 19.5 });
  assert.deepStrictEqual(predict.localParts('2026-12-02T18:30:00Z', 'Europe/London'), { dow: 3, hour: 18.5 });
});

test.after(() => { // clean test uploads
  for (const f of fs.readdirSync(config.uploadsDir)) if (f !== '.gitkeep' && Date.now() - fs.statSync(path.join(config.uploadsDir, f)).mtimeMs < 600e3) fs.unlinkSync(path.join(config.uploadsDir, f));
});

// ---------------- Worldwide ----------------
const geo = require('../src/geo');
const { createOsm } = require('../src/osm');

test('offline geo: country, time zone and currency from coordinates; /api/geo', async () => {
  const cases = [
    [51.5072, -0.1276, 'GB', 'Europe/London', 'GBP'], [PARIS.lat, PARIS.lng, 'FR', 'Europe/Paris', 'EUR'],
    [SYDNEY.lat, SYDNEY.lng, 'AU', 'Australia/Sydney', 'AUD'], [35.6762, 139.6503, 'JP', 'Asia/Tokyo', 'JPY'],
    [40.7128, -74.006, 'US', 'America/New_York', 'USD'], [-23.5505, -46.6333, 'BR', 'America/Sao_Paulo', 'BRL'],
    [53.3498, -6.2603, 'IE', 'Europe/Dublin', 'EUR'], [54.5973, -5.9301, 'GB', 'Europe/London', 'GBP'], // Belfast
  ];
  for (const [lat, lng, cc, tz, cur] of cases) assert.deepStrictEqual(geo.locate(lat, lng), { country: cc, timezone: tz, currency: cur }, `${lat},${lng}`);
  const ocean = geo.locate(-40, -130); // South Pacific
  assert.strictEqual(ocean.country, 'ZZ'); assert.strictEqual(ocean.currency, 'XXX'); assert.match(ocean.timezone, /^Etc\//);
  await gate('geo');
  let r = await req('geo', 'GET', `/api/geo?lat=${SYDNEY.lat}&lng=${SYDNEY.lng}`);
  assert.strictEqual(r.data.country, 'AU'); assert.strictEqual(r.data.currency, 'AUD'); assert.ok(r.data.chains.includes('Woolworths'));
  r = await req('geo', 'GET', '/api/geo?lat=999&lng=0'); assert.strictEqual(r.status, 400);
  const cfg = (await req('geo', 'GET', '/api/config')).data;
  assert.ok(!('countries' in cfg), 'no hard-coded country/city list'); assert.strictEqual(cfg.server.schema, 4); assert.strictEqual(cfg.server.photoStorage, 'db'); assert.match(cfg.attribution.text, /OpenStreetMap/);
});

test('grid cells: JS and SQL agree; antimeridian bbox splits; queries use the cell index', async () => {
  const db = app.locals.db;
  for (const [lat, lng] of [[51.5, -0.12], [0, 0], [-33.8688, 151.2093], [89.99, 179.99], [-90, -180], [12.3456789, -98.7654321]]) {
    const row = await db.get(`SELECT ${geo.CELL_SQL} AS c FROM (SELECT ? AS lat, ? AS lng)`, [lat, lng]);
    assert.strictEqual(row.c, geo.cellOf(lat, lng), `${lat},${lng}`);
  }
  const ranges = geo.cellRanges(geo.bbox(0, 179.99, 5));
  assert.ok(ranges.some(([lo]) => lo % 3600 === 0) && ranges.some(([, hi]) => hi % 3600 === 3599), 'wraps across ±180°');
  // every seeded store has a cell, and the stores/posts bbox queries are planned on the cell indexes
  assert.strictEqual((await db.get('SELECT COUNT(*) AS n FROM stores WHERE cell IS NULL')).n, 0);
  const w = geo.bboxWhere(geo.bbox(51.5, -0.12, 3));
  const plan = (await db.all(`EXPLAIN QUERY PLAN SELECT * FROM stores WHERE ${w.sql}`, w.params)).map(r => r.detail).join(' | ');
  assert.match(plan, /stores_cell/, plan);
  const wp = geo.bboxWhere(geo.bbox(51.5, -0.12, 3), 'p');
  const plan2 = (await db.all(`EXPLAIN QUERY PLAN SELECT * FROM posts p WHERE ${wp.sql} AND p.created_at > ?`, [...wp.params, '2026-01-01'])).map(r => r.detail).join(' | ');
  assert.match(plan2, /posts_cell/, plan2);
  // rows touched: a bbox in Germany on London's latitude reads 0 rows through the cells, whereas a lat-only index
  // would scan the whole 51.5°N band (every London store)
  const de = geo.bboxWhere(geo.bbox(51.5, 10.0, 3));
  const cellOnly = de.sql.split(') AND ')[0] + ')';
  assert.strictEqual((await db.get(`SELECT COUNT(*) AS n FROM stores WHERE ${cellOnly}`, de.params.slice(0, -4))).n, 0);
  const band = (await db.get('SELECT COUNT(*) AS n FROM stores WHERE lat BETWEEN ? AND ?', de.params.slice(-4, -2))).n;
  assert.ok(band > 100, `lat band alone would read ${band} rows`);
});

test('stores anywhere: fetched on demand from OSM Overpass, cached, attributed, with user-agent', async () => {
  await gate('paris');
  const before = overpassCalls.length;
  let r = await req('paris', 'GET', `/api/stores?lat=${PARIS.lat}&lng=${PARIS.lng}&radius_km=2&at=2026-10-07T12:00:00Z`); // Wednesday
  assert.strictEqual(r.status, 200);
  assert.ok(overpassCalls.length > before, 'Overpass called for a new area');
  const call = overpassCalls[overpassCalls.length - 1];
  assert.match(call.headers['User-Agent'], /^ReducedToClear\/1\.0 \(\+https?:\/\//);
  assert.match(call.query, /\["shop"="supermarket"\]/); assert.match(call.query, /out center tags/);
  assert.match(r.data.attribution, /OpenStreetMap/);
  const carrefour = r.data.stores.find(s => s.osm_id === 'node/9000000001');
  assert.ok(carrefour, 'fixture store returned');
  assert.strictEqual(carrefour.country, 'FR'); assert.strictEqual(carrefour.timezone, 'Europe/Paris'); assert.strictEqual(carrefour.city, 'Paris');
  assert.strictEqual(carrefour.chain, 'Carrefour City');
  assert.ok(r.data.stores.find(s => s.osm_id === 'way/9000000002'), 'way centre used');
  assert.ok(!r.data.stores.find(s => s.osm_id === 'node/9000000004'), 'unnamed element skipped');
  // generic, low-confidence prediction from OSM opening_hours (no chain data for France)
  assert.deepStrictEqual(carrefour.prediction.chain, []);
  assert.deepStrictEqual(carrefour.prediction.generic.windows, [{ start: 19, end: 21 }]);
  assert.strictEqual(carrefour.prediction.generic.confidence, 'low');
  assert.match(carrefour.prediction.generic.basis, /Generic estimate/);
  const franprix = r.data.stores.find(s => s.osm_id === 'node/9000000003');
  assert.strictEqual(franprix.prediction.generic, null, '24/7 store: no "before closing" estimate');
  // cached: same area again → no new Overpass call, even after the in-memory cache is dropped (reads osm_tiles)
  const n = overpassCalls.length;
  await req('paris', 'GET', `/api/stores?lat=${PARIS.lat}&lng=${PARIS.lng}&radius_km=2`);
  app.locals.osm.state.clear();
  await req('paris', 'GET', `/api/stores?lat=${PARIS.lat + 0.001}&lng=${PARIS.lng}&radius_km=1`);
  assert.strictEqual(overpassCalls.length, n, 'served from cache');
  const tile = await app.locals.db.get("SELECT * FROM osm_tiles WHERE status = 'ok' AND stores > 0");
  assert.ok(tile && tile.stores === 3);
  // GB chain stores keep their sourced chain windows and get no generic fallback
  r = await req('paris', 'GET', '/api/stores?lat=51.5246&lng=-0.0876&radius_km=1');
  const tesco = r.data.stores.find(s => s.chain === 'Tesco');
  assert.ok(tesco.prediction.chain.length && tesco.prediction.generic === null);
});

test('Overpass client: per-IP and daily caps, request spacing, error backoff', async () => {
  const db = app.locals.db; const calls = [];
  const ok = async (url, init) => { calls.push(Date.now()); return new Response('{"elements":[]}', { status: 200 }); };
  const osm = createOsm({ db, fetch: ok, endpoints: ['x'], minIntervalMs: 50, perIpPerHour: 2, dailyMax: 100, waitMs: 2000 });
  const places = [[10.1, 10.1], [11.1, 11.1], [12.1, 12.1], [13.1, 13.1]]; // tile centres-ish (not on 0.25° boundaries)
  const results = [];
  for (const [lat, lng] of places) results.push(await osm.ensure(lat, lng, 0.5, '1.2.3.4'));
  assert.strictEqual(calls.length, 2, 'per-IP cap of new tiles');
  assert.ok(results[2].limited && results[3].limited);
  assert.ok(calls[1] - calls[0] >= 45, 'requests are spaced out');
  await osm.ensure(14.1, 14.1, 0.5, '5.6.7.8'); assert.strictEqual(calls.length, 3, 'other IPs unaffected');
  const daily = createOsm({ db, fetch: ok, endpoints: ['x'], minIntervalMs: 0, perIpPerHour: 99, dailyMax: 1 });
  await daily.ensure(20.1, 20.1, 0.5, 'a'); const r2 = await daily.ensure(21.1, 21.1, 0.5, 'a');
  assert.ok(r2.limited, 'daily cap');
  let fails = 0;
  const bad = createOsm({ db, fetch: async () => { fails++; return new Response('busy', { status: 500 }); }, endpoints: ['x'], minIntervalMs: 0 });
  await bad.ensure(30.1, 30.1, 0.5, 'b'); await bad.ensure(30.1, 30.1, 0.5, 'b');
  assert.strictEqual(fails, 1, 'failed tile is not retried immediately');
  assert.strictEqual((await bad.ensure(30.1, 30.1, 0.5, 'b')).unavailable, true, 'client is told OSM is unavailable');
  const st1 = bad.state.get(require('../src/osm').tileOf(30.1, 30.1).join(':'));
  assert.ok(Date.parse(st1.nextTry) - Date.now() <= 60e3 + 1000, 'first backoff is short (1 min)');
  st1.nextTry = new Date(0).toISOString(); await bad.ensure(30.1, 30.1, 0.5, 'b');
  assert.strictEqual(fails, 2); assert.ok(Date.parse(bad.state.get(require('../src/osm').tileOf(30.1, 30.1).join(':')).nextTry) - Date.now() > 2 * 60e3, 'backoff grows');
  // a 504 on one endpoint cools that endpoint down but the next endpoint is tried straight away
  const hits = [];
  const busy = createOsm({ db, endpoints: ['https://a.test/i', 'https://b.test/i'], minIntervalMs: 0,
    fetch: async (url) => { hits.push(url); return url.includes('a.test') ? new Response('busy', { status: 504 }) : new Response('{"elements":[]}', { status: 200 }); } });
  const t0 = Date.now(); await busy.ensure(40.1, 40.1, 0.5, 'c');
  assert.ok(Date.now() - t0 < 3000, 'no long wait after a 504'); assert.deepStrictEqual(hits, ['https://a.test/i', 'https://b.test/i']);
  await busy.ensure(41.1, 41.1, 0.5, 'c'); assert.strictEqual(hits.filter(h => h.includes('a.test')).length, 1, 'busy endpoint skipped while cooling down');
  assert.strictEqual((await db.get("SELECT status FROM osm_tiles WHERE tile = ?", [require('../src/osm').tileOf(30.1, 30.1).join(':')])).status, 'error');
  const off = createOsm({ db, fetch: ok, enabled: false }); assert.deepStrictEqual(await off.ensure(1, 1, 1), { pending: false, enabled: false });
});

test('posting works anywhere: country, time zone and currency from the coordinates', async () => {
  await gate('dave');
  await req('dave', 'POST', '/api/register', { json: { email: 'dave@example.com', password: 'password4', displayName: 'Dave' } });
  const post = async (fields) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, v); return req('dave', 'POST', '/api/posts', { form: fd }); };
  let r = await post({ chain: 'Other', chain_other: 'Monoprix', store_name: 'Monoprix Bastille', items: 'Pain au chocolat -50%', lat: 48.853, lng: 2.369 });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  assert.strictEqual(r.data.post.currency, 'EUR'); assert.strictEqual(r.data.post.country, 'FR'); assert.strictEqual(r.data.post.timezone, 'Europe/Paris');
  r = await post({ chain: 'Woolworths', store_name: 'Woolworths Town Hall', items: 'Roast chicken $5', lat: SYDNEY.lat, lng: SYDNEY.lng, city: 'Sydney' });
  assert.strictEqual(r.status, 201); assert.strictEqual(r.data.post.currency, 'AUD'); assert.strictEqual(r.data.post.city, 'Sydney');
  const woolies = r.data.post.store_id;
  r = await post({ chain: 'Other', chain_other: 'Kiosk', items: 'Mid-ocean test', lat: -40, lng: -130 });
  assert.strictEqual(r.status, 201); assert.strictEqual(r.data.post.currency, 'XXX'); assert.strictEqual(r.data.post.country, 'ZZ');
  // existing OSM store chosen by id keeps its own country
  const carrefour = await app.locals.db.get("SELECT id FROM stores WHERE osm_id = 'node/9000000001'");
  r = await post({ store_id: carrefour.id, items: 'Salades' });
  assert.strictEqual(r.data.post.currency, 'EUR'); assert.strictEqual(r.data.post.store_name, 'Carrefour City Rivoli');
  // feeds: nearby (cell index) and worldwide (no location) newest first
  r = await req('dave', 'GET', `/api/posts?lat=${SYDNEY.lat}&lng=${SYDNEY.lng}&radius_km=2`);
  assert.deepStrictEqual(r.data.posts.map(p => p.items), ['Roast chicken $5']);
  r = await req('dave', 'GET', '/api/posts');
  const items = r.data.posts.map(p => p.items);
  assert.ok(items.indexOf('Salades') < items.indexOf('Pain au chocolat -50%'), 'newest first worldwide');
  // AU sourced chain windows apply to Woolworths in Australia only
  r = await req('dave', 'GET', `/api/stores/${woolies}/predictions`);
  const wed = r.data.week.find(d => d.day === 'Wed');
  assert.ok(wed.chain.some(c => c.start === 14 && c.source.url.includes('7news.com.au')));
  assert.ok(wed.chain.some(c => c.start === 18 && c.end === null), '"from 6pm" open-ended window');
});

test('opening_hours parser and generic window', () => {
  const p = predict.parseOpeningHours;
  assert.deepStrictEqual(p('Mo-Sa 07:00-22:00; Su 10:00-16:00')[0], [[10, 16]]);
  assert.deepStrictEqual(p('Mo-Fr 08:00-20:00, Sa 09:00-18:00')[6], [[9, 18]]);
  assert.deepStrictEqual(p('Mo,We 08:00-12:00,13:00-18:00; Su off')[3], [[8, 12], [13, 18]]);
  assert.deepStrictEqual(p('Mo,We 08:00-12:00,13:00-18:00; Su off')[0], []);
  assert.strictEqual(p('sunrise-sunset'), null); assert.strictEqual(p('Dec 25 off'), null); assert.strictEqual(p(''), null);
  assert.deepStrictEqual(predict.genericWindows('Mo-Su 06:00-24:00', 2), [{ start: 22, end: 24 }]);
  assert.strictEqual(predict.genericWindows('Mo-Fr 08:00-02:00', 2), null, 'past midnight skipped');
  assert.strictEqual(predict.genericWindows('Mo-Sa 08:00-20:00', 0), null, 'closed / unknown that day');
  assert.deepStrictEqual(predict.genericWindows('Mo-Sa 08:00-09:00', 1), [{ start: 8, end: 9 }], 'short day clamps to opening');
});
