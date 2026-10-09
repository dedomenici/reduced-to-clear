/* Reduced to Clear – local "reductions starting" alerts: a gentle map nudge towards the store + pulsing pin (no sound).
   Pure logic (no DOM/Leaflet) so it is unit-tested in Node; the browser glue lives in app.js.
   Triggers: a new community post at a store, or a store's predicted window starting now (labelled as a prediction).
   Only for stores inside the visible map bounds at city zoom or closer. At most one map nudge per 10 s, never while the user is moving the map (bursts are batched);
   each store fires at most once per window. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RTC_ALERTS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LOCAL_ZOOM = 10, LOCAL_MAX_KM = 60;       // street to city level; never regional/national zoom
  const MAX_PULSING = 8;                          // cities have many stores: at most 8 pins pulse at once, the rest just highlight
  const NUDGE_GAP_MS = 10000, NUDGE_QUIET_MS = 10000, NUDGE_BATCH_MS = 1500; // map nudges: max one per 10 s, not within 10 s of the user moving the map, bursts batched
  const FLASH_MS = 60000;                         // pulse ~60 s, then a steady highlight
  const START_GRACE_H = 10 / 60;                  // "starting now" = within 10 min of the window's start
  const POST_WINDOW_MS = 60 * 60000;              // a store re-alerts for posts at most once an hour
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // City level or closer: zoom >= 10, or the visible area is under ~60 km across (whichever is true).
  function isLocalView(zoom, widthKm) { return zoom >= LOCAL_ZOOM || (Number.isFinite(widthKm) && widthKm < LOCAL_MAX_KM); }
  function inBounds(b, lat, lng) { // b = { s, w, n, e }; handles the antimeridian (w > e)
    if (!(lat >= b.s && lat <= b.n)) return false;
    return b.w <= b.e ? lng >= b.w && lng <= b.e : lng >= b.w || lng <= b.e;
  }

  // Store-local clock for a time zone: { date: 'YYYY-MM-DD', dow: 'Fri', hour: 14.5 }.
  function localClock(tz, now = new Date()) {
    let parts;
    try { parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now); }
    catch { parts = new Intl.DateTimeFormat('en-GB', { hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now); }
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, dow: p.weekday, hour: (Number(p.hour) % 24) + Number(p.minute) / 60 };
  }

  // Timed windows of a prediction, most specific first (learned per-store, then chain, then the generic estimate).
  function timedWindows(pr) {
    if (!pr) return [];
    const out = [];
    if (pr.learned && pr.learned.windows) for (const w of pr.learned.windows) out.push({ ...w, basis: 'learned' });
    for (const c of pr.chain || []) if (c.start != null) out.push({ start: c.start, end: c.end, label: c.label, basis: 'chain' });
    if (!out.length && pr.generic) for (const w of pr.generic.windows) out.push({ ...w, basis: 'generic' });
    return out;
  }
  // The window that started within the last 10 minutes (store-local), if any; the prediction must be for today.
  function windowStartingNow(pr, clock) {
    if (!pr || (pr.day && pr.day !== clock.dow)) return null;
    return timedWindows(pr).find(w => clock.hour >= w.start && clock.hour < w.start + START_GRACE_H && (w.end == null || clock.hour < w.end)) || null;
  }

  // Gentle "look over here" map nudges instead of sounds. Alerts arriving close together are batched into one move;
  // at most one move per gap; never while the user is interacting (waits until they've left the map alone for quietMs).
  function createNudger({ run, batchMs = NUDGE_BATCH_MS, gapMs = NUDGE_GAP_MS, quietMs = NUDGE_QUIET_MS, now = () => Date.now(), setTimer = setTimeout } = {}) {
    let last = -Infinity, lastUser = -Infinity, pending = [], timer = null;
    const dueAt = () => Math.max(now() + batchMs, last + gapMs, lastUser + quietMs);
    function fire() {
      timer = null;
      const wait = Math.max(last + gapMs, lastUser + quietMs) - now();
      if (wait > 0) { timer = setTimer(fire, wait); return; } // the user touched the map meanwhile: wait for quiet
      last = now(); const batch = pending; pending = []; run(batch);
    }
    return {
      trigger(point) { pending.push(point); if (timer) return 'merged'; timer = setTimer(fire, dueAt() - now()); return 'scheduled'; },
      userActed() { lastUser = now(); },
      get pending() { return pending.length; },
    };
  }
  // Where a nudge goes: a third of the way from the current centre towards the alerted stores, one zoom level in if
  // they still all fit, else the same zoom, else (only if needed) one level out centred on them. Never a big jump.
  // fits(center, zoom) -> whether every point is visible with that view (supplied by the map).
  function nudgeTarget({ center, zoom, points, fits, shift = 0.35, maxZoom = 16 }) {
    if (!points || !points.length) return null;
    const c = { lat: points.reduce((a, p) => a + p.lat, 0) / points.length, lng: points.reduce((a, p) => a + p.lng, 0) / points.length };
    const toward = { lat: center.lat + (c.lat - center.lat) * shift, lng: center.lng + (c.lng - center.lng) * shift };
    if (zoom < maxZoom && fits(toward, zoom + 1)) return { ...toward, zoom: zoom + 1 };
    if (fits(toward, zoom)) return { ...toward, zoom };
    return { ...c, zoom: Math.max(zoom - 1, LOCAL_ZOOM) };
  }

  // Decides which stores alert. `fired` remembers store+window keys so each store fires once per window.
  function createAlerter({ now = () => Date.now() } = {}) {
    const fired = new Map();   // key -> expiry ms
    const flashing = new Map(); // storeId -> { since, until, kind, label }
    const gc = t => { for (const [k, exp] of fired) if (exp < t) fired.delete(k); };
    function once(key, ttlMs) { const t = now(); gc(t); if (fired.has(key)) return false; fired.set(key, t + ttlMs); return true; }
    function mark(storeId, kind, label, holdMs) {
      const t = now();
      let pulsing = 0; for (const [id, f] of flashing) if (id !== storeId && f.pulse && t - f.since < FLASH_MS && t <= f.until) pulsing++;
      flashing.set(storeId, { since: t, until: t + Math.max(holdMs, FLASH_MS), kind, label, pulse: pulsing < MAX_PULSING });
    }
    return {
      // view = { zoom, widthKm, bounds }; returns an alert object or null
      post(p, view) {
        if (!view || !isLocalView(view.zoom, view.widthKm) || !inBounds(view.bounds, p.lat, p.lng)) return null;
        const store = p.store_id != null ? p.store_id : `${p.lat},${p.lng}`;
        if (!once(`post:${store}`, POST_WINDOW_MS)) return null;
        mark(store, 'post', p.store_name, 2 * POST_WINDOW_MS);
        return { storeId: store, kind: 'post', name: p.store_name };
      },
      prediction(s, view, at = new Date(now())) {
        if (!view || !isLocalView(view.zoom, view.widthKm) || !inBounds(view.bounds, s.lat, s.lng)) return null;
        const clock = localClock(s.timezone, at), w = windowStartingNow(s.prediction, clock);
        if (!w) return null;
        if (!once(`pred:${s.id}:${clock.date}:${w.start}`, 24 * 3600e3)) return null;
        const holdMs = ((w.end != null ? w.end : w.start + 1) - clock.hour) * 3600e3; // steady highlight until the window ends
        mark(s.id, 'prediction', s.name, holdMs);
        return { storeId: s.id, kind: 'prediction', name: s.name, window: w };
      },
      // Explicit highlight (e.g. after changing the radius): pulse regardless of the once-per-window rule.
      highlight(storeId, kind, label, holdMs = FLASH_MS) { mark(storeId, kind, label, holdMs); return { storeId, kind, name: label }; },
      // 'flash' (pulsing, with seconds elapsed for CSS animation-delay), 'steady', or null
      state(storeId) {
        const f = flashing.get(storeId); if (!f) return null;
        const t = now(); if (t > f.until) { flashing.delete(storeId); return null; }
        const elapsed = t - f.since;
        return elapsed < FLASH_MS && f.pulse ? { mode: 'flash', elapsedS: elapsed / 1000, kind: f.kind } : { mode: 'steady', kind: f.kind };
      },
    };
  }

  return { isLocalView, inBounds, localClock, timedWindows, windowStartingNow, createNudger, nudgeTarget, createAlerter, DOW,
    LOCAL_ZOOM, LOCAL_MAX_KM, MAX_PULSING, NUDGE_GAP_MS, NUDGE_QUIET_MS, FLASH_MS };
});
