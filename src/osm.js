// On-demand supermarket locations from OpenStreetMap via the Overpass API, cached in the database.
// Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
//
// Fair use (https://dev.overpass-api.de/overpass-doc/en/preface/commons.html, OSMF policies):
//  - the world is split into fixed 0.25° tiles; each tile is fetched once and cached (refreshed after OSM_CACHE_DAYS)
//  - one request at a time, a minimum gap between requests, a daily cap, per-IP caps on triggering new tiles
//  - back off after errors / 429s; identify the app with a User-Agent
const geo = require('./geo');

const TILE_DEG = 0.25;
const tileKey = (row, col) => `${row}:${col}`;
const tileOf = (lat, lng) => [Math.floor((lat + 90) / TILE_DEG), ((Math.floor((lng + 180) / TILE_DEG) % 1440) + 1440) % 1440];
function tileBox(key) {
  const [row, col] = key.split(':').map(Number);
  const s = row * TILE_DEG - 90, w = col * TILE_DEG - 180;
  return [s, w, s + TILE_DEG, w + TILE_DEG];
}

// Brand/name -> canonical chain name (matches seeds/chain-predictions.json). Unknown brands keep their OSM brand/name.
const BRANDS = [
  [/tesco/i, 'Tesco'], [/sainsbury/i, "Sainsbury's"], [/^asda/i, 'Asda'], [/morrisons/i, 'Morrisons'],
  [/^(the )?co-op\b|co-operative/i, 'Co-op'], [/^m&s|marks (and|&) spencer/i, 'M&S'], [/waitrose/i, 'Waitrose'],
  [/^lidl/i, 'Lidl'], [/^aldi/i, 'Aldi'], [/^iceland\b/i, 'Iceland'], [/^woolworths/i, 'Woolworths'], [/^coles\b/i, 'Coles'],
  [/^supervalu/i, 'SuperValu'], [/^dunnes/i, 'Dunnes Stores'],
];
function chainFor(tags) {
  const label = (tags.brand || tags.name || '').trim();
  const hit = BRANDS.find(([re]) => re.test(label));
  return hit ? hit[1] : (tags.brand || tags.name || 'Other').slice(0, 60);
}
function overpassQuery([s, w, n, e]) {
  const b = `${s},${w},${n},${e}`;
  // Small declared timeout/maxsize: Overpass admits small requests first when it is busy (it sheds load with 504s).
  return `[out:json][timeout:25][maxsize:67108864];(nwr["shop"="supermarket"](${b});nwr["shop"="convenience"]["brand"](${b}););out center tags;`;
}
function elementToStore(el, now) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null || !(t.name || t.brand)) return null;
  const loc = geo.locate(lat, lng);
  const address = [t['addr:housenumber'], t['addr:street'], t['addr:postcode']].filter(Boolean).join(' ') || null;
  return {
    chain: chainFor(t), name: (t.name || t.brand).slice(0, 80), address, city: t['addr:city'] || null,
    country: loc.country, timezone: loc.timezone, lat, lng, opening_hours: t.opening_hours || null,
    osm_id: `${el.type}/${el.id}`, cell: geo.cellOf(lat, lng), created_at: now,
  };
}
const UPSERT = `INSERT INTO stores (chain,name,address,city,country,timezone,lat,lng,opening_hours,osm_id,cell,created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(osm_id) DO UPDATE SET chain=excluded.chain, name=excluded.name, address=COALESCE(excluded.address, stores.address),
    city=COALESCE(excluded.city, stores.city), country=excluded.country, timezone=excluded.timezone,
    lat=excluded.lat, lng=excluded.lng, cell=excluded.cell, opening_hours=excluded.opening_hours`;

function createOsm(opts = {}) {
  const env = process.env;
  const o = {
    enabled: opts.enabled ?? env.OSM_ON_DEMAND !== 'false',
    endpoints: opts.endpoints || (env.OVERPASS_URLS || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter').split(',').map(s => s.trim()).filter(Boolean),
    userAgent: opts.userAgent || `ReducedToClear/1.0 (+${env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || 'https://reduced-to-clear.onrender.com'})`,
    minIntervalMs: opts.minIntervalMs ?? Number(env.OVERPASS_MIN_INTERVAL_MS || 2000),
    dailyMax: opts.dailyMax ?? Number(env.OVERPASS_DAILY_MAX || 500),
    perIpPerHour: opts.perIpPerHour ?? Number(env.OSM_NEW_TILES_PER_IP_HOUR || 30),
    maxNewTilesPerRequest: opts.maxNewTilesPerRequest ?? 4,
    ttlDays: opts.ttlDays ?? Number(env.OSM_CACHE_DAYS || 30),
    waitMs: opts.waitMs ?? Number(env.OSM_WAIT_MS || 8000),
    fetch: opts.fetch || globalThis.fetch,
    db: opts.db, log: opts.log || (() => {}),
  };
  const state = new Map();     // tile -> { status: 'ok'|'error', fetchedAt, nextTry }  (mirrors osm_tiles; avoids DB reads)
  const inflight = new Map();  // tile -> Promise
  const ipHits = new Map();    // ip -> [timestamps]
  let queue = Promise.resolve(), lastRequestAt = 0;
  const cooldown = new Map(); // endpoint -> time before which we don't call it again (after 429/504)
  const BACKOFF_MIN = [1, 3, 10, 30, 60]; // minutes before retrying a failed tile (grows with repeated failures)
  const day = { key: '', n: 0 };
  const stats = { requests: 0, failures: 0, storesUpserted: 0, lastError: null, lastErrorAt: null };

  function fresh(st, now) {
    if (!st) return false;
    if (st.status === 'ok') return now - Date.parse(st.fetchedAt) < o.ttlDays * 864e5;
    return now < Date.parse(st.nextTry || 0); // recently failed: don't retry yet
  }
  async function loadStates(keys) {
    const missing = keys.filter(k => !state.has(k));
    if (!missing.length) return;
    const rows = await o.db.all(`SELECT tile, status, fetched_at, next_try_at FROM osm_tiles WHERE tile IN (${missing.map(() => '?').join(',')})`, missing);
    for (const r of rows) state.set(r.tile, { status: r.status, fetchedAt: r.fetched_at, nextTry: r.next_try_at });
  }
  function ipAllowed(ip) {
    const now = Date.now(), list = (ipHits.get(ip) || []).filter(t => now - t < 3600e3);
    ipHits.set(ip, list);
    if (list.length >= o.perIpPerHour) return false;
    list.push(now); return true;
  }
  function dailyAllowed() {
    const k = new Date().toISOString().slice(0, 10);
    if (day.key !== k) { day.key = k; day.n = 0; }
    return day.n < o.dailyMax;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function request(query) {
    let lastErr;
    for (const url of o.endpoints) {
      if ((cooldown.get(url) || 0) > Date.now()) { lastErr = new Error('Overpass busy (cooling down)'); continue; }
      const wait = lastRequestAt + o.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now(); day.n++; stats.requests++;
      try {
        const res = await o.fetch(url, {
          method: 'POST', body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(35000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': o.userAgent, Accept: 'application/json' },
        });
        if (res.status === 429 || res.status === 504) { cooldown.set(url, Date.now() + 60e3); throw new Error(`Overpass ${res.status}`); }
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        const j = await res.json();
        if (!Array.isArray(j.elements)) throw new Error('Overpass: bad response');
        return j.elements;
      } catch (e) { lastErr = e; stats.lastError = `${new URL(url).host}: ${e.message}`.slice(0, 200); stats.lastErrorAt = new Date().toISOString(); o.log(`Overpass ${url} failed: ${e.message}`); }
    }
    throw lastErr || new Error('no Overpass endpoints');
  }

  async function fetchTile(key) {
    const now = new Date().toISOString();
    try {
      const elements = await request(overpassQuery(tileBox(key)));
      const stores = elements.map(el => elementToStore(el, now)).filter(Boolean);
      const seen = new Set(); const unique = stores.filter(s => !seen.has(s.osm_id) && seen.add(s.osm_id));
      const stmts = unique.map(s => [UPSERT, [s.chain, s.name, s.address, s.city, s.country, s.timezone, s.lat, s.lng, s.opening_hours, s.osm_id, s.cell, s.created_at]]);
      stmts.push([`INSERT INTO osm_tiles (tile,status,fetched_at,next_try_at,stores) VALUES (?,?,?,NULL,?)
        ON CONFLICT(tile) DO UPDATE SET status='ok', fetched_at=excluded.fetched_at, next_try_at=NULL, stores=excluded.stores`, [key, 'ok', now, unique.length]]);
      await o.db.batch(stmts);
      state.set(key, { status: 'ok', fetchedAt: now });
      stats.storesUpserted += unique.length;
      o.log(`OSM tile ${key}: ${unique.length} stores`);
    } catch (e) {
      stats.failures++;
      if (!/Overpass|fetch|abort|timeout/i.test(e.message)) { stats.lastError = `store write: ${e.message}`.slice(0, 200); stats.lastErrorAt = new Date().toISOString(); }
      const fails = ((state.get(key) || {}).fails || 0) + 1;
      const nextTry = new Date(Date.now() + BACKOFF_MIN[Math.min(fails, BACKOFF_MIN.length) - 1] * 60e3).toISOString();
      state.set(key, { status: 'error', nextTry, fails });
      await o.db.run(`INSERT INTO osm_tiles (tile,status,next_try_at) VALUES (?,?,?)
        ON CONFLICT(tile) DO UPDATE SET status=CASE WHEN osm_tiles.fetched_at IS NULL THEN 'error' ELSE osm_tiles.status END, next_try_at=excluded.next_try_at`, [key, 'error', nextTry]).catch(() => {});
      if (state.get(key).status === 'error') o.log(`OSM tile ${key} failed: ${e.message}`);
    }
  }
  function schedule(key) {
    if (inflight.has(key)) return inflight.get(key);
    const p = (queue = queue.then(() => fetchTile(key))).finally(() => inflight.delete(key));
    inflight.set(key, p); return p;
  }

  // Make sure the tiles around (lat,lng) are cached. Waits up to waitMs; returns { pending } if fetches are still running.
  async function ensure(lat, lng, radiusKm, ip = '') {
    if (!o.enabled || !o.db) return { pending: false, enabled: false };
    const [s, n, w, e] = geo.bbox(lat, lng, Math.min(radiusKm, 10));
    const [r0, c0] = tileOf(s, w), [r1, c1] = tileOf(n, e);
    const keys = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; ; c = (c + 1) % 1440) { keys.push(tileKey(r, c)); if (c === c1 || keys.length > 64) break; }
    const centre = k => { const [ts, tw, tn, te] = tileBox(k); return geo.kmBetween(lat, lng, Math.min(Math.max(lat, ts), tn), Math.min(Math.max(lng, tw), te)); };
    keys.sort((a, b) => centre(a) - centre(b));
    await loadStates(keys);
    const now = Date.now();
    const waits = []; let limited = false, started = 0;
    for (const k of keys) {
      if (inflight.has(k)) { waits.push(inflight.get(k)); continue; }
      if (fresh(state.get(k), now)) continue;
      // a failed tile whose backoff has expired but that has old data: keep serving the old data, refresh it below
      if (started >= o.maxNewTilesPerRequest) { limited = true; continue; }
      if (!dailyAllowed() || !ipAllowed(ip)) { limited = true; break; }
      started++; waits.push(schedule(k));
    }
    const failing = () => keys.some(k => (state.get(k) || {}).status === 'error');
    if (!waits.length) return { pending: false, limited, unavailable: failing() };
    let timer;
    const done = await Promise.race([Promise.all(waits).then(() => true), new Promise(r => { timer = setTimeout(() => r(false), o.waitMs); })]);
    clearTimeout(timer);
    return { pending: !done || limited && started > 0, limited, unavailable: done && failing() };
  }
  return { ensure, stats, state, options: o };
}

module.exports = { createOsm, chainFor, elementToStore, UPSERT, tileOf, tileBox, overpassQuery, TILE_DEG,
  ATTRIBUTION: '© OpenStreetMap contributors, ODbL', ATTRIBUTION_URL: 'https://www.openstreetmap.org/copyright' };
