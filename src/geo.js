// Offline geography helpers: country, time zone and currency from coordinates (no network calls),
// plus a fixed lat/lng grid ("cells") so bounding-box queries hit an index instead of scanning a
// whole latitude band of the world (keeps Turso row reads low).
const tzLookup = require('@photostructure/tz-lookup');
const countryCoder = require('@rapideditor/country-coder');
const { currencies } = require('../seeds/country-currency.json');

const UNKNOWN_COUNTRY = 'ZZ';   // ISO 3166 user-assigned code for "unknown"
const UNKNOWN_CURRENCY = 'XXX'; // ISO 4217 "no currency"

const validLatLng = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function countryAt(lat, lng) {
  try { return countryCoder.iso1A2Code([lng, lat]) || UNKNOWN_COUNTRY; } catch { return UNKNOWN_COUNTRY; }
}
function timezoneAt(lat, lng) {
  try { return tzLookup(lat, lng); } catch { return 'UTC'; }
}
const currencyFor = cc => currencies[cc] || UNKNOWN_CURRENCY;
function locate(lat, lng) {
  const country = countryAt(lat, lng);
  return { country, timezone: timezoneAt(lat, lng), currency: currencyFor(country) };
}

// ---- grid cells: 0.1° x 0.1° (~11 km N-S). cell = row * COLS + col. Uses *10 (not /0.1) to match CELL_SQL exactly. ----
const COLS = 3600, ROWS = 1800;
const rowOf = lat => Math.min(ROWS - 1, Math.max(0, Math.floor((lat + 90) * 10)));
const colOf = lng => ((Math.floor((lng + 180) * 10) % COLS) + COLS) % COLS;
const cellOf = (lat, lng) => rowOf(lat) * COLS + colOf(lng);
// SQL expression to backfill cells (CAST truncates; lat+90 and lng+180 are >= 0 so this equals floor).
const CELL_SQL = 'MIN(CAST((lat + 90) * 10 AS INTEGER), 1799) * 3600 + (CAST((lng + 180) * 10 AS INTEGER) % 3600)';

function bbox(lat, lng, km) {
  const dLat = km / 111, dLng = km / (111 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
  return [Math.max(-90, lat - dLat), Math.min(90, lat + dLat), lng - dLng, lng + dLng]; // lng may exceed ±180 (wrap handled below)
}
// Contiguous [lo, hi] cell ranges covering a bbox: one per grid row (two if it crosses the antimeridian).
function cellRanges([s, n, w, e]) {
  const out = [];
  const r0 = rowOf(s), r1 = rowOf(n);
  let spans;
  if (e - w >= 360) spans = [[0, COLS - 1]];
  else {
    const c0 = colOf(w), c1 = colOf(e);
    spans = c0 <= c1 ? [[c0, c1]] : [[c0, COLS - 1], [0, c1]];
  }
  for (let r = r0; r <= r1; r++) for (const [a, b] of spans) out.push([r * COLS + a, r * COLS + b]);
  return out;
}
// WHERE fragment using the cell index, plus exact lat/lng filter (with antimeridian wrap).
function bboxWhere(box, alias = '') {
  const p = alias ? alias + '.' : '';
  const ranges = cellRanges(box);
  const params = [];
  const cellSql = ranges.map(([lo, hi]) => { params.push(lo, hi); return `${p}cell BETWEEN ? AND ?`; }).join(' OR ');
  const [s, n, w, e] = box;
  let lngSql;
  if (w < -180) { lngSql = `(${p}lng >= ? OR ${p}lng <= ?)`; params.push(s, n, w + 360, e); }
  else if (e > 180) { lngSql = `(${p}lng >= ? OR ${p}lng <= ?)`; params.push(s, n, w, e - 360); }
  else { lngSql = `${p}lng BETWEEN ? AND ?`; params.push(s, n, w, e); }
  return { sql: `(${cellSql}) AND ${p}lat BETWEEN ? AND ? AND ${lngSql}`, params };
}
function kmBetween(a, b, c, d) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(c - a), dLng = toR(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

module.exports = { validLatLng, countryAt, timezoneAt, currencyFor, locate, cellOf, CELL_SQL, cellRanges, bbox, bboxWhere, kmBetween, UNKNOWN_COUNTRY, UNKNOWN_CURRENCY };
