// Loads .env (simple KEY=VALUE parser) and exposes config. Secrets live ONLY here (server side).
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
const env = process.env;
const fail = msg => { console.error('Config error: ' + msg); process.exit(1); };

// Database: Turso/libSQL when TURSO_DATABASE_URL is set, else a local SQLite file.
const tursoUrl = env.TURSO_DATABASE_URL || '';
const tursoToken = env.TURSO_AUTH_TOKEN || '';
if (tursoUrl && !tursoUrl.startsWith('file:') && !tursoToken) fail('TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing.');
// Hosted mode = remote DB or running on a hosting platform. In hosted mode nothing secret is written to disk.
const hosted = (!!tursoUrl && !tursoUrl.startsWith('file:')) || !!env.RENDER || !!env.RAILWAY_ENVIRONMENT || env.HOSTED === 'true';

const DATA_DIR = path.resolve(ROOT, env.DATA_DIR || 'data');
function secret() {
  if (env.SITE_SECRET) return env.SITE_SECRET;
  if (hosted) fail('SITE_SECRET env var is required in hosted mode (it is never written to disk there).');
  const f = path.join(DATA_DIR, 'secret'); // local dev convenience only
  if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, crypto.randomBytes(32).toString('hex')); }
  return fs.readFileSync(f, 'utf8').trim();
}
if (!env.SITE_PASSWORD) fail('SITE_PASSWORD is not set (see .env.example). Refusing to start without a site gate password.');

module.exports = {
  ROOT,
  hosted,
  port: Number(env.PORT || 3000),
  dataDir: DATA_DIR,
  dbFile: env.DB_FILE || path.join(DATA_DIR, 'rtc.sqlite'),
  tursoUrl, tursoToken,
  sitePassword: env.SITE_PASSWORD,
  siteSecret: secret(),
  // Photo uploads need persistent file storage. Off unless PHOTOS_ENABLED=true (free hosting has no persistent disk).
  photosEnabled: env.PHOTOS_ENABLED === 'true',
  uploadsDir: path.resolve(ROOT, env.UPLOADS_DIR || (env.DATA_DIR ? path.join(DATA_DIR, 'uploads') : 'uploads')),
  seedStoresFile: path.join(ROOT, 'seeds', 'stores-london.json'),
  // International expansion: add countries/cities here.
  countries: {
    GB: { name: 'United Kingdom', currency: 'GBP', currencySymbol: '£', timezone: 'Europe/London',
          cities: { London: { lat: 51.5072, lng: -0.1276, timezone: 'Europe/London' } } },
  },
  limits: { postsPerHour: 10, goneMarksPerHour: 30, maxPhotoBytes: 5 * 1024 * 1024 },
};
