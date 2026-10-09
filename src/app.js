const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { openDb } = require('./db');
const predict = require('./predict');
const photos = require('./photos');
const geo = require('./geo');
const { createOsm, ATTRIBUTION, ATTRIBUTION_URL } = require('./osm');
const seeds = require('../seeds/chain-predictions.json');

const nowIso = () => new Date().toISOString();
const { kmBetween, bbox, bboxWhere } = geo;
const clean = (s, max) => String(s ?? '').trim().slice(0, max);

async function seedPredictions(db) {
  const stmts = [['DELETE FROM chain_predictions', []]];
  for (const w of seeds.windows) {
    const s = seeds.sources[w.src] || {};
    stmts.push([`INSERT INTO chain_predictions (chain,country,days,start_hour,end_hour,label,confidence,source_title,source_url)
            VALUES (?,?,?,?,?,?,?,?,?)`, [w.chain, w.country, w.days, w.start, w.end, w.label, w.confidence, s.title || null, s.url || null]]);
  }
  await db.batch(stmts);
  return db.all('SELECT * FROM chain_predictions');
}

// First start (empty stores table): import the committed OSM store snapshot so the map isn't empty.
// Uses batched writes so it is fast against remote Turso too.
async function seedStores(db, file) {
  if (!file || !fs.existsSync(file)) return 0;
  if ((await db.get('SELECT COUNT(*) AS n FROM stores')).n > 0) return 0;
  const { stores } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const now = nowIso();
  await db.batch(stores.map(s => [`INSERT OR IGNORE INTO stores (chain,name,address,city,country,timezone,lat,lng,opening_hours,osm_id,cell,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [s.chain, s.name, s.address || null, s.city, s.country, s.timezone, s.lat, s.lng, s.opening_hours || null, s.osm_id || null, geo.cellOf(s.lat, s.lng), now]]));
  await db.flush();
  return stores.length;
}

async function createApp(opts = {}) {
  const photosEnabled = opts.photosEnabled !== undefined ? opts.photosEnabled : config.photosEnabled;
  const photoStorage = opts.photoStorage || config.photoStorage;
  const db = await openDb({
    file: opts.dbFile || config.dbFile,
    tursoUrl: opts.tursoUrl !== undefined ? opts.tursoUrl : config.tursoUrl,
    tursoToken: opts.tursoToken !== undefined ? opts.tursoToken : config.tursoToken,
  });
  const photoStore = photos.createPhotoStore({ db, mode: photoStorage, uploadsDir: config.uploadsDir });
  const chainRows = await seedPredictions(db); // cached: static between deploys
  const seeded = await seedStores(db, opts.seedStoresFile === undefined ? config.seedStoresFile : opts.seedStoresFile);
  // Stores anywhere in the world are fetched from OSM Overpass on demand and cached (tests pass opts.osm to stub/disable).
  const osm = createOsm({ db, log: opts.quiet ? () => {} : m => console.log(m), ...(opts.osm || {}) });
  if (!opts.quiet) {
    console.log(`DB: ${db.kind} (schema v${db.schemaVersion}) · photos ${photosEnabled ? 'enabled (' + photoStorage + ')' : 'disabled'} · ${config.hosted ? 'hosted' : 'local'} mode`);
    if (seeded) console.log(`Seeded ${seeded} stores from ${path.basename(config.seedStoresFile)} (© OpenStreetMap contributors, ODbL)`);
  }
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render/Railway's proxy: correct req.ip and req.secure
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false }));

  // ---------- Site-wide access gate ----------
  const gateToken = crypto.createHmac('sha256', config.siteSecret).update('gate:' + config.sitePassword).digest('hex');
  const gateFails = new Map();
  const gatePage = (err) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#1d1d1b"><link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/favicon-32.png"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<title>Reduced to Clear</title><link rel="stylesheet" href="/gate.css"></head><body class="gate">
<form method="post" action="/gate" class="gate-card"><div class="sticker big">REDUCED<br>TO CLEAR</div>
<p>This site is private for now. Enter the access password.</p>
${err ? '<p class="err">Wrong password, try again.</p>' : ''}
<input type="password" name="password" placeholder="Access password" autofocus required autocomplete="current-password">
<button type="submit">Enter</button></form></body></html>`;
  // Public (pre-gate) assets: gate styling + PWA manifest/icons/service worker so "Add to Home Screen" works.
  const pub = f => path.join(config.ROOT, 'public', f);
  app.get('/gate.css', (req, res) => res.sendFile(pub('gate.css')));
  app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').sendFile(pub('manifest.webmanifest')));
  app.get('/sw.js', (req, res) => res.set('Cache-Control', 'no-cache').type('application/javascript').sendFile(pub('sw.js')));
  app.use('/icons', express.static(pub('icons'), { maxAge: '7d' }));
  app.get('/gate', (req, res) => res.type('html').send(gatePage(false)));
  app.post('/gate', (req, res) => {
    const ip = req.ip; const f = gateFails.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - f.t > 15 * 60e3) { f.n = 0; f.t = Date.now(); }
    if (f.n >= 20) return res.status(429).type('html').send('Too many attempts. Try again later.');
    const given = Buffer.from(String(req.body.password || ''));
    const want = Buffer.from(config.sitePassword);
    if (given.length === want.length && crypto.timingSafeEqual(given, want)) {
      gateFails.delete(ip);
      res.cookie('rtc_gate', gateToken, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 90 * 864e5 });
      return res.redirect('/');
    }
    f.n++; gateFails.set(ip, f);
    res.status(401).type('html').send(gatePage(true));
  });
  app.use((req, res, next) => {
    if (req.cookies.rtc_gate === gateToken) return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/photos/')) return res.status(401).json({ error: 'site_locked' });
    return res.redirect('/gate');
  });

  // ---------- Static (behind gate) ----------
  app.use(express.static(path.join(config.ROOT, 'public')));

  // Photos (behind the gate). Keys are random and content never changes, so cache hard in the browser only.
  app.get('/photos/:key', async (req, res) => {
    const key = req.params.key;
    if (!photos.KEY_RE.test(key)) return res.status(404).end();
    const etag = `"${key}"`;
    res.set({ 'Cache-Control': 'private, max-age=31536000, immutable', ETag: etag });
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    const photo = await photoStore.get(key);
    if (!photo) { res.set('Cache-Control', 'no-store'); return res.status(404).end(); }
    res.type(photo.mime).set('Content-Length', String(photo.data.length)).send(photo.data);
  });

  // ---------- Accounts ----------
  async function currentUser(req) {
    const t = req.cookies.rtc_session; if (!t) return null;
    return (await db.get('SELECT u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', [t])) || null;
  }
  app.use(async (req, res, next) => { req.user = await currentUser(req); next(); });
  const requireUser = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'login_required' });
  async function startSession(res, userId, req) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.run('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)', [token, userId, nowIso()]);
    res.cookie('rtc_session', token, { httpOnly: true, sameSite: 'lax', secure: !!(req && req.secure), maxAge: 180 * 864e5 });
  }
  async function rateLimited(userId, kind, perHour) {
    const since = new Date(Date.now() - 3600e3).toISOString();
    const { n } = await db.get('SELECT COUNT(*) AS n FROM actions WHERE user_id = ? AND kind = ? AND at > ?', [userId, kind, since]);
    if (n >= perHour) return true;
    await db.run('INSERT INTO actions (user_id,kind,at) VALUES (?,?,?)', [userId, kind, nowIso()]);
    return false;
  }

  app.post('/api/register', async (req, res) => {
    if (req.body.website) return res.status(400).json({ error: 'bad_request' }); // honeypot
    const email = clean(req.body.email, 200).toLowerCase();
    const name = clean(req.body.displayName, 40);
    const pw = String(req.body.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (name.length < 2) return res.status(400).json({ error: 'Display name must be at least 2 characters' });
    if (pw.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (await db.get('SELECT id FROM users WHERE email = ?', [email])) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(pw, 10);
    const { id } = await db.run('INSERT INTO users (email,display_name,password_hash,created_at) VALUES (?,?,?,?)', [email, name, hash, nowIso()]);
    await startSession(res, id, req);
    res.json({ user: { id, email, display_name: name } });
  });
  app.post('/api/login', async (req, res) => {
    const u = await db.get('SELECT * FROM users WHERE email = ?', [clean(req.body.email, 200).toLowerCase()]);
    if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.password_hash))) return res.status(401).json({ error: 'Wrong email or password' });
    await startSession(res, u.id, req);
    res.json({ user: { id: u.id, email: u.email, display_name: u.display_name } });
  });
  app.post('/api/logout', async (req, res) => {
    if (req.cookies.rtc_session) await db.run('DELETE FROM sessions WHERE token = ?', [req.cookies.rtc_session]);
    res.clearCookie('rtc_session'); res.json({ ok: true });
  });
  app.get('/api/me', (req, res) => res.json({ user: req.user }));
  const chainsFor = cc => config.chainsByCountry[cc] || [];
  app.get('/api/config', (req, res) => res.json({ chainsByCountry: config.chainsByCountry, photosEnabled, maxPhotoBytes: config.limits.maxPhotoBytes,
    attribution: { text: ATTRIBUTION, url: ATTRIBUTION_URL },
    // non-secret diagnostics (behind the gate): lets the owner confirm what the host's env actually turned on
    server: { schema: db.schemaVersion, db: db.kind, photoStorage, photosEnabledFrom: opts.photosEnabled !== undefined ? 'option' : config.photosEnabledFrom, osmOnDemand: osm.options.enabled } }));
  // Offline lookup (no external calls): country, time zone and currency for a point, plus the chain list for that country.
  app.get('/api/geo', (req, res) => {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!geo.validLatLng(lat, lng)) return res.status(400).json({ error: 'lat,lng required' });
    const loc = geo.locate(lat, lng);
    res.json({ ...loc, chains: chainsFor(loc.country) });
  });

  // ---------- Live updates (SSE) ----------
  const clients = new Set();
  app.get('/api/stream', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders(); res.write('retry: 5000\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
  });
  function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(msg);
  }

  // ---------- Posts ----------
  const POST_SELECT = `SELECT p.*, s.chain, s.name AS store_name, s.address AS store_address, s.timezone,
      u.display_name AS author, g.display_name AS gone_by_name
    FROM posts p JOIN stores s ON s.id = p.store_id JOIN users u ON u.id = p.user_id LEFT JOIN users g ON g.id = p.all_gone_by`;
  function shapePost(p, req, lat, lng) {
    const out = { ...p, mine: !!(req.user && req.user.id === p.user_id), photo_url: photosEnabled ? photoStore.url(p.photo) : null };
    delete out.photo;
    if (lat != null) out.distance_km = Math.round(kmBetween(lat, lng, p.lat, p.lng) * 100) / 100;
    return out;
  }
  const getPost = async (id, req) => { const p = await db.get(POST_SELECT + ' WHERE p.id = ?', [id]); return p && shapePost(p, req); };

  app.get('/api/posts', async (req, res) => {
    const lat = req.query.lat != null ? Number(req.query.lat) : null, lng = req.query.lng != null ? Number(req.query.lng) : null;
    const radius = Math.min(Number(req.query.radius_km) || 3, 50);
    const where = [], params = [];
    if (lat != null && lng != null && geo.validLatLng(lat, lng)) {
      const w = bboxWhere(bbox(lat, lng, radius), 'p'); // cell index: reads only rows near the point
      where.push(w.sql); params.push(...w.params);
    }
    if (req.query.include_gone !== '1') where.push('p.all_gone_at IS NULL');
    const hours = Math.min(Number(req.query.hours) || 48, 24 * 30);
    where.push('p.created_at > ?'); params.push(new Date(Date.now() - hours * 3600e3).toISOString());
    let rows = (await db.all(POST_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY p.created_at DESC LIMIT 300', params))
      .map(p => shapePost(p, req, lat, lng));
    if (lat != null) rows = rows.filter(p => p.distance_km <= radius);
    res.json({ posts: rows });
  });

  // Photo uploads are held in memory, validated, metadata-stripped, then saved to the photo store (DB BLOB or disk).
  // When photos are disabled, multipart posts are still accepted and any file part is silently discarded.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.limits.maxPhotoBytes + 64 * 1024, files: 1 }, // small slack for metadata that gets stripped
    fileFilter: (req, file, cb) => cb(null, photosEnabled),
  });

  async function findOrCreateStore(body, userId) {
    if (body.store_id) {
      const s = await db.get('SELECT * FROM stores WHERE id = ?', [Number(body.store_id)]);
      if (s) return s;
    }
    const lat = Number(body.lat), lng = Number(body.lng);
    // Country, time zone and currency always come from the coordinates (offline), so posting works anywhere.
    const loc = geo.locate(lat, lng);
    const chain = clean(body.chain, 60);
    const chainName = !chain || chain === 'Other' ? clean(body.chain_other, 60) || 'Other' : chain;
    const w = bboxWhere(bbox(lat, lng, 0.15));
    const near = (await db.all(`SELECT * FROM stores WHERE chain = ? AND ${w.sql}`, [chainName, ...w.params]))
      .filter(s => kmBetween(lat, lng, s.lat, s.lng) <= 0.15);
    if (near.length) return near[0];
    const city = clean(body.city, 60) || null;
    const name = clean(body.store_name, 80) || `${chainName} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    const { id } = await db.run(`INSERT INTO stores (chain,name,address,city,country,timezone,lat,lng,cell,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [chainName, name, clean(body.address, 160) || null, city, loc.country, loc.timezone, lat, lng, geo.cellOf(lat, lng), userId, nowIso()]);
    return db.get('SELECT * FROM stores WHERE id = ?', [id]);
  }

  app.post('/api/posts', requireUser, upload.single('photo'), async (req, res) => {
    const b = req.body || {};
    const fail = (code, error) => res.status(code).json({ error });
    const items = clean(b.items, 1000);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!items) return fail(400, 'Say what items are reduced');
    if (!b.store_id && !(b.chain)) return fail(400, 'Choose the supermarket');
    if (!b.store_id && !geo.validLatLng(lat, lng)) return fail(400, 'Set the location');
    const seenAt = b.seen_at ? new Date(b.seen_at) : new Date();
    if (isNaN(seenAt)) return fail(400, 'Invalid time');
    if (seenAt > new Date(Date.now() + 5 * 60e3)) return fail(400, 'Time cannot be in the future');
    if (seenAt < new Date(Date.now() - 24 * 3600e3)) return fail(400, 'Only post reductions seen in the last 24 hours');
    let photo = null;
    if (photosEnabled && req.file) {
      try { photo = photos.prepare(req.file.buffer, config.limits.maxPhotoBytes); } catch (e) { return fail(e.status || 400, e.message); }
    }
    if (await rateLimited(req.user.id, 'post', config.limits.postsPerHour)) return fail(429, 'Posting limit reached, try again later');
    const photoKey = photo ? await photoStore.save(photo) : null;
    const store = await findOrCreateStore(b, req.user.id);
    const currency = geo.currencyFor(store.country);
    const { id } = await db.run(`INSERT INTO posts (user_id,store_id,items,price_note,photo,seen_at,created_at,lat,lng,cell,city,country,currency)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [req.user.id, store.id, items, clean(b.price_note, 200) || null, photoKey,
      seenAt.toISOString(), nowIso(), store.lat, store.lng, geo.cellOf(store.lat, store.lng), store.city, store.country, currency]);
    const post = await getPost(id, req);
    broadcast('post', { ...post, mine: false });
    res.status(201).json({ post });
  });

  const loadPost = id => db.get('SELECT * FROM posts WHERE id = ?', [Number(id)]);
  app.patch('/api/posts/:id', requireUser, async (req, res) => {
    const p = await loadPost(req.params.id);
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (p.user_id !== req.user.id) return res.status(403).json({ error: 'You can only edit your own posts' });
    const items = req.body.items != null ? clean(req.body.items, 1000) : p.items;
    if (!items) return res.status(400).json({ error: 'Items cannot be empty' });
    const priceNote = req.body.price_note != null ? (clean(req.body.price_note, 200) || null) : p.price_note;
    await db.run('UPDATE posts SET items = ?, price_note = ?, updated_at = ? WHERE id = ?', [items, priceNote, nowIso(), p.id]);
    const post = await getPost(p.id, req); broadcast('update', { ...post, mine: false }); res.json({ post });
  });
  app.delete('/api/posts/:id', requireUser, async (req, res) => {
    const p = await loadPost(req.params.id);
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (p.user_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own posts' });
    await db.run('DELETE FROM posts WHERE id = ?', [p.id]);
    if (p.photo) await photoStore.remove(p.photo);
    broadcast('delete', { id: p.id }); res.json({ ok: true });
  });
  app.post('/api/posts/:id/gone', requireUser, async (req, res) => {
    const p = await loadPost(req.params.id);
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (p.all_gone_at) return res.json({ post: await getPost(p.id, req) });
    if (await rateLimited(req.user.id, 'gone', config.limits.goneMarksPerHour)) return res.status(429).json({ error: 'Too many all-gone marks, try later' });
    await db.run('UPDATE posts SET all_gone_at = ?, all_gone_by = ? WHERE id = ?', [nowIso(), req.user.id, p.id]);
    const post = await getPost(p.id, req); broadcast('update', { ...post, mine: false }); res.json({ post });
  });
  app.delete('/api/posts/:id/gone', requireUser, async (req, res) => {
    const p = await loadPost(req.params.id);
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (p.user_id !== req.user.id && p.all_gone_by !== req.user.id) return res.status(403).json({ error: 'Only the poster or whoever marked it can undo' });
    await db.run('UPDATE posts SET all_gone_at = NULL, all_gone_by = NULL WHERE id = ?', [p.id]);
    const post = await getPost(p.id, req); broadcast('update', { ...post, mine: false }); res.json({ post });
  });

  // ---------- Stores & predictions ----------
  // Report times for many stores in ONE query (avoids N round trips to remote Turso).
  async function seenTimesFor(storeIds) {
    const map = new Map(storeIds.map(id => [id, []]));
    for (let i = 0; i < storeIds.length; i += 400) {
      const chunk = storeIds.slice(i, i + 400);
      if (!chunk.length) continue;
      const rows = await db.all(`SELECT store_id, seen_at FROM posts WHERE store_id IN (${chunk.map(() => '?').join(',')})`, chunk);
      for (const r of rows) map.get(r.store_id).push(r.seen_at);
    }
    return map;
  }
  app.get('/api/stores', async (req, res) => {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!geo.validLatLng(lat, lng)) return res.status(400).json({ error: 'lat,lng required' });
    const radius = Math.min(Number(req.query.radius_km) || 3, 20);
    const at = req.query.at || nowIso();
    // Fetch + cache OSM supermarkets for this area if we haven't yet (rate-limited; waits a few seconds at most).
    const area = await osm.ensure(lat, lng, radius, req.ip).catch(e => { console.error('osm', e.message); return { pending: false }; });
    const w = bboxWhere(bbox(lat, lng, radius));
    const stores = (await db.all(`SELECT * FROM stores WHERE ${w.sql}`, w.params))
      .map(s => ({ ...s, distance_km: Math.round(kmBetween(lat, lng, s.lat, s.lng) * 100) / 100 }))
      .filter(s => s.distance_km <= radius).sort((a, b) => a.distance_km - b.distance_km).slice(0, 400);
    const seen = await seenTimesFor(stores.map(s => s.id));
    res.json({ stores: stores.map(s => ({ ...s, prediction: predict.predictStore(s, predict.nowDow(s.timezone, at), seen.get(s.id), chainRows) })),
      pending: !!area.pending, limited: !!area.limited, attribution: ATTRIBUTION });
  });
  app.get('/api/stores/:id/predictions', async (req, res) => {
    const s = await db.get('SELECT * FROM stores WHERE id = ?', [Number(req.params.id)]);
    if (!s) return res.status(404).json({ error: 'not_found' });
    const seen = (await seenTimesFor([s.id])).get(s.id);
    const week = [1, 2, 3, 4, 5, 6, 0].map(d => predict.predictStore(s, d, seen, chainRows));
    res.json({ store: s, week, note: 'These are PREDICTIONS, not confirmed reductions.' });
  });

  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Photo too large (max ${Math.round(config.limits.maxPhotoBytes / 1024)}KB)` : err.message });
    console.error(err); res.status(500).json({ error: 'server_error' });
  });
  app.locals.db = db;
  app.locals.photosEnabled = photosEnabled;
  app.locals.photoStore = photoStore;
  app.locals.osm = osm;

  // Photo retention: drop photos of posts older than PHOTO_RETENTION_DAYS (keeps free DB storage small; posts stay).
  async function prunePhotos() {
    const cutoff = new Date(Date.now() - config.photoRetentionDays * 864e5).toISOString();
    const old = await db.all('SELECT id, photo FROM posts WHERE photo IS NOT NULL AND created_at < ?', [cutoff]);
    for (const p of old) { await photoStore.remove(p.photo); await db.run('UPDATE posts SET photo = NULL WHERE id = ?', [p.id]); }
    return old.length;
  }
  app.locals.prunePhotos = prunePhotos;
  if (!opts.quiet) {
    prunePhotos().catch(e => console.error('photo prune failed', e.message));
    setInterval(() => prunePhotos().catch(() => {}), 12 * 3600e3).unref();
  }
  return app;
}
module.exports = { createApp, kmBetween };
