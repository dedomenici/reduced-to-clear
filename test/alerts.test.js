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

test('beeper: max one beep per 10 s, bursts merge into a single later beep', () => {
  let clock = 0; const timers = []; const plays = [];
  const b = A.createBeeper({ play: n => plays.push({ t: clock, n }), now: () => clock, setTimer: (fn, ms) => timers.push({ fn, due: clock + ms }) });
  assert.strictEqual(b.trigger(), 'played');
  clock = 2000; assert.strictEqual(b.trigger(), 'scheduled');
  clock = 3000; assert.strictEqual(b.trigger(), 'merged'); assert.strictEqual(b.trigger(), 'merged');
  assert.strictEqual(plays.length, 1); assert.strictEqual(timers.length, 1); assert.strictEqual(timers[0].due, 10000);
  clock = 10000; timers.shift().fn();
  assert.deepStrictEqual(plays, [{ t: 0, n: 1 }, { t: 10000, n: 3 }]);
  clock = 15000; assert.strictEqual(b.trigger(), 'scheduled'); // still inside the gap after the merged beep
  clock = 30000; timers.shift().fn(); assert.strictEqual(plays.length, 3);
  clock = 45000; assert.strictEqual(b.trigger(), 'played');
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
  assert.strictEqual(fired.filter(Boolean).length, 12, 'every store in view alerts (beeps are throttled separately)');
  const modes = fired.map(a => al.state(a.storeId).mode);
  assert.strictEqual(modes.filter(m => m === 'flash').length, A.MAX_PULSING);
  assert.deepStrictEqual(modes.slice(A.MAX_PULSING), Array(12 - A.MAX_PULSING).fill('steady'));
  clock += 61000; // first pulses have finished: a new alert may pulse again
  assert.strictEqual(al.post({ id: 99, store_id: 199, store_name: 'Late', lat: 48.85, lng: 2.35 }, city) && al.state(199).mode, 'flash');
  // and many triggers in one burst still make a single beep (merged by the throttle)
  let t = 0; const plays = []; const timers = [];
  const b = A.createBeeper({ play: n => plays.push(n), now: () => t, setTimer: (fn, ms) => timers.push(fn) });
  for (let i = 0; i < 12; i++) b.trigger();
  assert.deepStrictEqual(plays, [1]); t = 10000; timers.shift()(); assert.deepStrictEqual(plays, [1, 11]);
});
