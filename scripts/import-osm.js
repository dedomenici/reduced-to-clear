// Imports supermarket locations for a city from OpenStreetMap (Overpass API) into the stores table.
// Data © OpenStreetMap contributors, ODbL. Run sparingly (Overpass fair-use policy); results are cached in the DB.
// Usage: node scripts/import-osm.js [--bbox south,west,north,east] [--city London] [--country GB]
const config = require('../src/config');
const { openDb } = require('../src/db');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const bboxStr = args.bbox || '51.28,-0.51,51.69,0.33'; // Greater London
const city = args.city || 'London', country = args.country || 'GB';
const BRANDS = [
  [/tesco/i, 'Tesco'], [/sainsbury/i, "Sainsbury's"], [/asda/i, 'Asda'], [/morrisons/i, 'Morrisons'],
  [/co-?op|co-operative/i, 'Co-op'], [/marks|m&s/i, 'M&S'], [/waitrose/i, 'Waitrose'], [/lidl/i, 'Lidl'], [/aldi/i, 'Aldi'], [/iceland/i, 'Iceland'],
];
(async () => {
  const q = `[out:json][timeout:120];(nwr["shop"="supermarket"](${bboxStr});nwr["shop"="convenience"]["brand"~"Tesco|Sainsbury|Co-op|Co-operative|M&S|Marks"](${bboxStr}););out center tags;`;
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let res;
  for (const url of endpoints) {
    res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ReducedToClear-prototype/0.1 (OSM import)' },
      body: 'data=' + encodeURIComponent(q),
    }).catch(e => ({ ok: false, status: e.message }));
    if (res.ok) break;
    console.warn(`Overpass ${url} failed: ${res.status}`);
  }
  if (!res.ok) throw new Error('All Overpass endpoints failed');
  const { elements } = await res.json();
  const db = await openDb({ file: config.dbFile, tursoUrl: config.tursoUrl, tursoToken: config.tursoToken });
  const tz = config.countries[country].cities[city]?.timezone || config.countries[country].timezone;
  let added = 0;
  for (const e of elements) {
    const t = e.tags || {}; const label = t.brand || t.name || '';
    const hit = BRANDS.find(([re]) => re.test(label)); if (!hit) continue;
    const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon; if (lat == null) continue;
    const osmId = `${e.type}/${e.id}`;
    if (await db.get('SELECT id FROM stores WHERE osm_id = ?', [osmId])) continue;
    const addr = [t['addr:housenumber'], t['addr:street'], t['addr:postcode']].filter(Boolean).join(' ') || null;
    await db.run(`INSERT INTO stores (chain,name,address,city,country,timezone,lat,lng,opening_hours,osm_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [hit[1], t.name || hit[1], addr, city, country, tz, lat, lng, t.opening_hours || null, osmId, new Date().toISOString()]);
    added++;
  }
  await db.flush();
  console.log(`Imported ${added} stores (of ${elements.length} OSM elements). Data © OpenStreetMap contributors (ODbL).`);
})().catch(e => { console.error(e.message); process.exit(1); });
