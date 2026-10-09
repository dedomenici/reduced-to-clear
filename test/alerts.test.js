// Unit tests for public/alerts.js (local "reductions starting" beep + flashing pin logic).
const test = require('node:test');
const assert = require('node:assert');
const A = require('../public/alerts');

const PARIS_VIEW = { zoom: 15, widthKm: 2.5, bounds: { s: 48.84, n: 48.87, w: 2.33, e: 2.37 } };
const at = iso => new Date(iso);

test('alert zoom: city level or closer (zoom >= 10 or under ~60 km across); never regional/national', () => {
  assert.ok(A.isLocalView(16, 1)); assert.ok(A.isLocalView(13, 30)); assert.ok(A.isLocalView(10, 80)); assert.ok(A.isLocalView(9, 50));
  assert.ok(!A.isLocalView(9, 120)); assert.ok(!A.isLocalView(7, 600)); assert.ok(!A.isLocalView(5, 2000));
  assert.ok(A.inBounds(PARIS_VIEW.bounds, 48.85, 2.35)); assert.ok(!A.inBounds(PARIS_VIEW.bounds, 48.85, 2.40));
  assert.ok(A.inBounds({ s: -20, n: -10, w: 175, e: -175 }, -15, 179), 'antimeridian'); assert.ok(A.inBounds({ s: -20, n: -10, w: 175, e: -175 }, -15, -178));
});

test('store-local clock and "window starting now" (within 10 min, prediction must be for today)', () => {
  const c = A.localClock('Asia/Taipei', at('2026-10-09T08:05:00Z')); // 16:05 Fri in Taipei
  assert.deepStrictEqual(c, { date: '2026-10-09', dow: 'Fri', hour: 16 + 5 / 60 });
  const pr = { day: 'Fri', learned: null, chain: [{ start: 8, end: 16, label: 'a' }, { start: 16, end: null, label: 'PX 40% off' }, { start: null, end: null, label: 'no time' }], generic: null };
  assert.strictEqual(A.windowStartingNow(pr, c).label, 'PX 40% off');
  assert.strictEqual(A.windowStartingNow(pr, { ...c, hour: 16.25 }), null, '15 min after start: not "starting now"');
  assert.strictEqual(A.windowStartingNow({ ...pr, day: 'Thu' }, c), null, 'stale prediction for another day');
  // generic estimate only used when no timed chain/learned windows exist
  const gen = { day: 'Fri', learned: null, chain: [], generic: { windows: [{ start: 19, end: 21 }] } };
  assert.strictEqual(A.windowStartingNow(gen, { ...c, hour: 19.05 }).basis, 'generic');
  const learned = { day: 'Fri', learned: { windows: [{ start: 18.5, end: 19.5 }] }, chain: [], generic: { windows: [{ start: 19, end: 21 }] } };
  assert.deepStrictEqual(A.timedWindows(learned).map(w => w.basis), ['learned']);
});

test('nudger: batches bursts into one map move, max one per 10 s, waits until the user has left the map alone for 10 s', () => {
  let clock = 0; const timers = []; const runs = [];
  const n = A.createNudger({ run: b => runs.push({ t: clock, ids: b.map(x => x.id) }), now: () => clock, setTimer: (fn, ms) => timers.push({ fn, due: clock + ms }) });
  const tick = () => { timers.sort((a, b) => a.due - b.due); const x = timers.shift(); clock = x.due; x.fn(); };
  assert.strictEqual(n.trigger({ id: 1 }), 'scheduled'); clock = 500; assert.strictEqual(n.trigger({ id: 2 }), 'merged');
  tick(); assert.deepStrictEqual(runs, [{ t: 1500, ids: [1, 2] }]);
  clock = 3000; n.trigger({ id: 3 }); tick(); assert.strictEqual(runs[1].t, 11500, 'gap: one move per 10 s');
  clock = 20000; n.userActed(); clock = 21000; n.trigger({ id: 4 });
  while (timers.length) tick();
  assert.deepStrictEqual(runs[2], { t: 30000, ids: [4] }, 'deferred until 10 s after the user last touched the map');
  clock = 45000; n.trigger({ id: 5 }); clock = 45800; n.userActed(); // user grabs the map while a nudge is queued
  while (timers.length) tick(); assert.strictEqual(runs[3].t, 55800);
});

test('nudgeTarget: a third of the way towards the stores; +1 zoom if they fit, same zoom, else one level out on them', () => {
  const center = { lat: 0, lng: 0 }, points = [{ lat: 0.3, lng: 0.3 }, { lat: 0.3, lng: 0.9 }];
  let t = A.nudgeTarget({ center, zoom: 13, points, fits: () => true });
  assert.strictEqual(t.zoom, 14); assert.ok(Math.abs(t.lat - 0.105) < 1e-9 && Math.abs(t.lng - 0.21) < 1e-9);
  t = A.nudgeTarget({ center, zoom: 13, points, fits: (c, z) => z <= 13 }); assert.strictEqual(t.zoom, 13);
  t = A.nudgeTarget({ center, zoom: 13, points, fits: () => false }); assert.deepStrictEqual(t, { lat: 0.3, lng: 0.6, zoom: 12 });
  assert.strictEqual(A.nudgeTarget({ center, zoom: 16, points, fits: () => true }).zoom, 16, 'never past street level');
  assert.strictEqual(A.nudgeTarget({ center, zoom: 13, points: [], fits: () => true }), null);
});

test('alerter: posts and predictions fire once per store per window, only in view at local zoom; flash 60 s then steady', () => {
  let clock = Date.parse('2026-10-09T12:01:00Z'); // 14:01 in Paris
  const al = A.createAlerter({ now: () => clock });
  const post = { id: 1, store_id: 7, store_name: 'Monoprix', lat: 48.855, lng: 2.35 };
  assert.strictEqual(al.post(post, { ...PARIS_VIEW, zoom: 8, widthKm: 250 }), null, 'regional zoom: no alert');
  assert.strictEqual(al.post({ ...post, lng: 2.45 }, PARIS_VIEW), null, 'off screen: no alert');
  assert.deepStrictEqual(al.post(post, PARIS_VIEW), { storeId: 7, kind: 'post', name: 'Monoprix' });
  assert.strictEqual(al.post({ ...post, id: 2 }, PARIS_VIEW), null, 'same store again within the window');
  assert.strictEqual(al.state(7).mode, 'flash');
  clock += 61000; assert.strictEqual(al.state(7).mode, 'steady');
  clock += 3600e3; assert.ok(al.post({ ...post, id: 3 }, PARIS_VIEW), 'fires again an hour later');

  clock = Date.parse('2026-10-09T12:02:00Z');
  const store = { id: 9, name: 'Carrefour City Rivoli', lat: 48.857, lng: 2.353, timezone: 'Europe/Paris',
    prediction: { day: 'Fri', learned: null, chain: [{ start: 14, end: 14.75, label: 'Afternoon relabelling round' }], generic: null } };
  const a = al.prediction(store, PARIS_VIEW);
  assert.strictEqual(a.kind, 'prediction'); assert.strictEqual(a.window.start, 14);
  assert.strictEqual(al.prediction(store, PARIS_VIEW), null, 'once per window');
  assert.strictEqual(al.state(9).mode, 'flash');
  clock = Date.parse('2026-10-09T12:30:00Z'); assert.strictEqual(al.state(9).mode, 'steady', 'steady highlight while the window lasts');
  clock = Date.parse('2026-10-09T12:50:00Z'); assert.strictEqual(al.state(9), null, 'cleared after the window ends');
  const other = { ...store, id: 10 };
  clock = Date.parse('2026-10-09T12:02:00Z');
  assert.strictEqual(al.prediction(other, { ...PARIS_VIEW, zoom: 6, widthKm: 900 }), null, 'national zoom');
});

test('city zoom with many stores: alerts fire, but at most 8 pins pulse at once (the rest just highlight)', () => {
  let clock = Date.parse('2026-10-09T12:01:00Z');
  const al = A.createAlerter({ now: () => clock });
  const city = { zoom: 11, widthKm: 45, bounds: { s: 48.7, n: 49.0, w: 2.1, e: 2.6 } };
  const fired = [];
  for (let i = 0; i < 12; i++) fired.push(al.post({ id: i, store_id: 100 + i, store_name: 'S' + i, lat: 48.8 + i * 0.01, lng: 2.3 }, city));
  assert.strictEqual(fired.filter(Boolean).length, 12, 'every store in view alerts (map nudges are batched separately)');
  const modes = fired.map(a => al.state(a.storeId).mode);
  assert.strictEqual(modes.filter(m => m === 'flash').length, A.MAX_PULSING);
  assert.deepStrictEqual(modes.slice(A.MAX_PULSING), Array(12 - A.MAX_PULSING).fill('steady'));
  clock += 61000; // first pulses have finished: a new alert may pulse again
  assert.strictEqual(al.post({ id: 99, store_id: 199, store_name: 'Late', lat: 48.85, lng: 2.35 }, city) && al.state(199).mode, 'flash');
  // and many triggers in one burst make a single map move
  const runs = []; const timers = [];
  const n = A.createNudger({ run: b => runs.push(b.length), now: () => 0, setTimer: fn => timers.push(fn) });
  for (let i = 0; i < 12; i++) n.trigger({ id: i });
  timers.shift()(); assert.deepStrictEqual(runs, [12]);
  // explicit highlight (radius change) pulses even a store that already alerted
  assert.strictEqual(al.highlight(100, 'post', 'S0').storeId, 100); assert.ok(al.state(100));
});
