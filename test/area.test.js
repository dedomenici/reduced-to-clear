// International off by default: only the local area (<= ~50 km from the user's location / London) is fetched.
const test = require('node:test');
const assert = require('node:assert');
const { decide, areaForView, isLocal, kmBetween } = require('../public/area');
const LONDON = { lat: 51.5074, lng: -0.1278 }, PARIS = { lat: 48.8566, lng: 2.3522 }, CROYDON = { lat: 51.3762, lng: -0.0982 };

test('local area loads; beyond ~50 km or zoomed out is blocked until "Go international"', () => {
  const cur = { ...LONDON, radius: 3 };
  assert.strictEqual(decide({ home: LONDON, cur, next: { ...CROYDON, radius: 5 }, intl: false }), 'load', 'Croydon (~15 km) is local');
  assert.strictEqual(decide({ home: LONDON, cur, next: { ...PARIS, radius: 3 }, intl: false }), 'blocked');
  assert.strictEqual(decide({ home: LONDON, cur, next: { world: true }, intl: false }), 'blocked', 'zoomed out: no worldwide feed');
  assert.strictEqual(decide({ home: LONDON, cur, next: { ...PARIS, radius: 3 }, intl: true }), 'load');
  assert.strictEqual(decide({ home: LONDON, cur, next: { world: true }, intl: true }), 'load');
  assert.strictEqual(decide({ home: LONDON, cur: { world: true }, next: { world: true }, intl: true }), 'skip');
  assert.strictEqual(decide({ home: LONDON, cur: { ...LONDON, radius: 10 }, next: { lat: 51.51, lng: -0.12, radius: 3 }, intl: false }), 'skip', 'inside what is loaded');
  assert.ok(isLocal(LONDON, { lat: 51.9, lng: -0.1 })); assert.ok(!isLocal(LONDON, { lat: 52.2, lng: -0.1 }));
  assert.ok(Math.abs(kmBetween(LONDON, PARIS) - 344) < 5);
  assert.deepStrictEqual(areaForView(PARIS, 1.2, 3), { ...PARIS, radius: 3 });
  assert.deepStrictEqual(areaForView(PARIS, 12.34, 3), { ...PARIS, radius: 12.4 });
  assert.deepStrictEqual(areaForView(PARIS, 80, 3), { world: true });
});
