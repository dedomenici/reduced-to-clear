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

const PHOTO_STORAGE = env.PHOTO_STORAGE === 'db' || env.PHOTO_STORAGE === 'disk' ? env.PHOTO_STORAGE : (tursoUrl ? 'db' : 'disk');
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
  // Photos: PHOTO_STORAGE 'db' (BLOBs in the database — default when Turso is configured) or 'disk' (UPLOADS_DIR).
  // DB storage needs no disk, so photos are ON by default with it (set PHOTOS_ENABLED=false to turn off).
  // Disk storage needs persistent storage, so it stays OFF unless PHOTOS_ENABLED=true.
  photoStorage: PHOTO_STORAGE,
  photosEnabled: PHOTO_STORAGE === 'db' ? env.PHOTOS_ENABLED !== 'false' : env.PHOTOS_ENABLED === 'true',
  photosEnabledFrom: env.PHOTOS_ENABLED !== undefined ? 'env' : 'default', // diagnostics: was PHOTOS_ENABLED set by the host?
  photoRetentionDays: Number(env.PHOTO_RETENTION_DAYS || 30),
  uploadsDir: path.resolve(ROOT, env.UPLOADS_DIR || (env.DATA_DIR ? path.join(DATA_DIR, 'uploads') : 'uploads')),
  seedStoresFile: path.join(ROOT, 'seeds', 'stores-london.json'),
  // Worldwide: country, time zone and currency come from coordinates (src/geo.js). These are just the chains offered
  // in the post form's supermarket list per country; any other store name can be typed in, and OSM stores are picked
  // from the "nearby store" list.
  chainsByCountry: {
    GB: ['Tesco', "Sainsbury's", 'Asda', 'Morrisons', 'Co-op', 'M&S', 'Waitrose', 'Lidl', 'Aldi', 'Iceland'],
    IE: ['Tesco', 'Dunnes Stores', 'SuperValu', 'Lidl', 'Aldi', 'M&S'],
    AU: ['Woolworths', 'Coles', 'Aldi'],
    JP: ['AEON', 'Ito-Yokado', 'Life', 'Seiyu', 'Maruetsu', 'OK Store', 'My Basket', 'Summit'],
    KR: ['E-mart', 'Lotte Mart', 'Lotte Super', 'Homeplus'],
    TW: ['PX Mart', 'Carrefour', 'RT-Mart', 'Simple Mart', "Mia C'bon", 'Costco', '7-Eleven', 'FamilyMart', 'Hi-Life', 'OK Mart'],
    HK: ['ParknShop', 'Wellcome', 'AEON', 'YATA', 'Market Place', 'Don Don Donki'],
    CN: ['Hema', 'Yonghui', 'RT-Mart', 'Walmart', 'Carrefour'],
    SG: ['FairPrice', 'Cold Storage', 'Sheng Siong', 'Don Don Donki', 'Giant'],
    TH: ['Tops', "Lotus's", 'Big C', 'MaxValu', '7-Eleven', 'Gourmet Market'],
    FR: ['Carrefour', 'Monoprix', 'Franprix', 'Auchan', 'Leclerc', 'Intermarché', 'Lidl', 'Aldi'],
    DE: ['Rewe', 'Edeka', 'Kaufland', 'Lidl', 'Aldi', 'Penny', 'Netto'],
    ES: ['Mercadona', 'Carrefour', 'Lidl', 'Dia', 'Aldi', 'Alcampo'],
    NL: ['Albert Heijn', 'Jumbo', 'Lidl', 'Aldi', 'Plus', 'Dirk'],
    RU: ['Pyaterochka', 'Perekrestok', 'Magnit', 'VkusVill'],
    US: ['Whole Foods', "Trader Joe's", 'Safeway', 'Kroger', 'Wegmans', 'Walmart', 'Target', 'Costco'],
  },
  // Photos are shrunk in the browser to fit maxPhotoBytes; the server enforces the cap (300KB keeps Turso storage small).
  limits: { postsPerHour: 10, goneMarksPerHour: 30, maxPhotoBytes: Number(env.MAX_PHOTO_KB || 300) * 1024 },
};
