// Loads .env (simple KEY=VALUE parser) and exposes config. The site password lives ONLY here (server side).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
// DATA_DIR holds the SQLite DB, uploads and generated secret. On Render point it at the persistent disk (e.g. /var/data).
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
function secret() {
  if (process.env.SITE_SECRET) return process.env.SITE_SECRET;
  const f = path.join(DATA_DIR, 'secret');
  if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, crypto.randomBytes(32).toString('hex')); }
  return fs.readFileSync(f, 'utf8').trim();
}
if (!process.env.SITE_PASSWORD) {
  console.error('SITE_PASSWORD is not set (see .env.example). Refusing to start without a site gate password.');
  process.exit(1);
}
module.exports = {
  ROOT,
  port: Number(process.env.PORT || 3000),
  dataDir: DATA_DIR,
  dbFile: process.env.DB_FILE || path.join(DATA_DIR, 'rtc.sqlite'),
  sitePassword: process.env.SITE_PASSWORD,
  siteSecret: secret(),
  uploadsDir: path.resolve(ROOT, process.env.UPLOADS_DIR || (process.env.DATA_DIR ? path.join(DATA_DIR, 'uploads') : 'uploads')),
  seedStoresFile: path.join(ROOT, 'seeds', 'stores-london.json'),
  // International expansion: add countries/cities here.
  countries: {
    GB: { name: 'United Kingdom', currency: 'GBP', currencySymbol: '£', timezone: 'Europe/London',
          cities: { London: { lat: 51.5072, lng: -0.1276, timezone: 'Europe/London' } } },
  },
  limits: { postsPerHour: 10, goneMarksPerHour: 30, maxPhotoBytes: 5 * 1024 * 1024 },
};
