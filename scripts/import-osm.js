// Bulk-imports supermarkets for a bounding box from OpenStreetMap (Overpass API) into the stores table.
// Not needed in normal use: the app fetches and caches stores on demand for any area users look at.
// Data © OpenStreetMap contributors, ODbL. Run sparingly (Overpass fair-use policy).
// Usage: node scripts/import-osm.js [--bbox south,west,north,east]   (default: Greater London)
const config = require('../src/config');
const { openDb } = require('../src/db');
const { overpassQuery, elementToStore, UPSERT } = require('../src/osm');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const box = (args.bbox || '51.28,-0.51,51.69,0.33').split(',').map(Number);
(async () => {
  const endpoints = (process.env.OVERPASS_URLS || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter').split(',');
  let res;
  for (const url of endpoints) {
    res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ReducedToClear/1.0 (bulk OSM import script)' },
      body: 'data=' + encodeURIComponent(overpassQuery(box).replace('[timeout:60]', '[timeout:180]')),
    }).catch(e => ({ ok: false, status: e.message }));
    if (res.ok) break;
    console.warn(`Overpass ${url} failed: ${res.status}`);
  }
  if (!res.ok) throw new Error('All Overpass endpoints failed');
  const { elements } = await res.json();
  const db = await openDb({ file: config.dbFile, tursoUrl: config.tursoUrl, tursoToken: config.tursoToken });
  const now = new Date().toISOString();
  const stores = elements.map(e => elementToStore(e, now)).filter(Boolean);
  await db.batch(stores.map(s => [UPSERT, [s.chain, s.name, s.address, s.city, s.country, s.timezone, s.lat, s.lng, s.opening_hours, s.osm_id, s.cell, s.created_at]]));
  await db.flush();
  console.log(`Imported/updated ${stores.length} stores (of ${elements.length} OSM elements). Data © OpenStreetMap contributors (ODbL).`);
})().catch(e => { console.error(e.message); process.exit(1); });
