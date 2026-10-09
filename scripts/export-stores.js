// Exports the stores table (OSM-sourced rows only) to seeds/stores-london.json, which is imported on first start.
// Usage: node scripts/export-stores.js
const fs = require('fs');
const config = require('../src/config');
const { openDb } = require('../src/db');
(async () => {
  const db = await openDb({ file: config.dbFile, tursoUrl: config.tursoUrl, tursoToken: config.tursoToken });
  const stores = (await db.all('SELECT chain,name,address,city,country,timezone,lat,lng,opening_hours,osm_id FROM stores WHERE osm_id IS NOT NULL ORDER BY osm_id'))
    .map(s => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null)));
  const out = { attribution: '© OpenStreetMap contributors, available under the Open Database License (ODbL) https://www.openstreetmap.org/copyright',
    generated: new Date().toISOString(), source: 'Overpass API, shop=supermarket (+ branded convenience) in Greater London', stores };
  fs.writeFileSync(config.seedStoresFile, JSON.stringify(out));
  console.log(`Wrote ${stores.length} stores to ${config.seedStoresFile}`);
})();
