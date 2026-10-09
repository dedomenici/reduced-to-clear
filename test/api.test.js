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

test.before(async () => {
  app = await createApp({ dbFile: ':memory:', tursoUrl: process.env.TEST_TURSO_URL || '', photosEnabled: true, quiet: true });
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

test('photos disabled: upload UI flag off, posts accepted, file parts ignored', async () => {
  const app2 = await createApp({ dbFile: ':memory:', tursoUrl: '', photosEnabled: false, quiet: true, seedStoresFile: null });
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
    const up = await fetch(b2 + '/uploads/anything.jpg', { headers: { Cookie: cookie } }); assert.strictEqual(up.status, 404);
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
