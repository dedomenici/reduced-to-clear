// Versioned (content-hashed) static asset URLs: /a/<hash>/<file>. Served with a 1-year immutable cache;
// a new deploy changes the hash, so browsers and the service worker never see stale code.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LEAFLET = 'leaflet-' + require('leaflet/package.json').version; // /vendor/leaflet-1.9.4/… (self-hosted, immutable)
const CLUSTER = 'markercluster-' + require('leaflet.markercluster/package.json').version; // lazy-loaded for 'See all branches'
const FONT = '/fonts/doto-v3-900-latin.woff2';

function createAssets(publicDir, files = ['app.js', 'i18n.js', 'names.js', 'alerts.js', 'area.js', 'cities.js', 'style.css', 'gate.css']) {
  const hash = {};
  for (const f of files) hash[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(publicDir, f))).digest('hex').slice(0, 10);
  const url = f => (hash[f] ? `/a/${hash[f]}/${f}` : '/' + f);
  const version = crypto.createHash('sha256').update(JSON.stringify(hash) + LEAFLET + CLUSTER).digest('hex').slice(0, 10);
  const leaflet = { css: `/vendor/${LEAFLET}/leaflet.css`, js: `/vendor/${LEAFLET}/leaflet.js`, dir: `/vendor/${LEAFLET}` };
  const cluster = { css: `/vendor/${CLUSTER}/MarkerCluster.css`, css2: `/vendor/${CLUSTER}/MarkerCluster.Default.css`, js: `/vendor/${CLUSTER}/leaflet.markercluster.js`, dir: `/vendor/${CLUSTER}` };
  // App shell for the service worker: code, styles, Leaflet, font, icons. Never pages or API data.
  const shell = [...files.map(url), leaflet.css, leaflet.js, FONT];
  const fileFor = (h, f) => (hash[f] === h ? path.join(publicDir, f) : null);
  return { hash, url, version, leaflet, cluster, shell, font: FONT, fileFor };
}

module.exports = { createAssets, LEAFLET, CLUSTER };
