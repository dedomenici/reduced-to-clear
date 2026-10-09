// Prediction model. Two kinds, both always labelled as PREDICTIONS in the UI:
//  1. "learned": per-store day-of-week x hour histogram built from community posts (seen_at, store local time)
//  2. "chain":   chain-typical windows seeded from research (seeds/chain-predictions.json), per country
//  3. "generic": LOW-confidence fallback for any store worldwide, from its OSM opening_hours: the last 2 hours
//                before closing. Only used when there is no learned window and no timed chain window.
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MIN_REPORTS = 3;

function localParts(iso, tz) {
  const d = new Date(iso);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(p => [p.type, p.value]));
  return { dow: DOW.indexOf(parts.weekday), hour: Number(parts.hour) + Number(parts.minute) / 60 };
}

function histogram(seenTimes, tz) {
  const h = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const t of seenTimes) { const p = localParts(t, tz); h[p.dow][Math.floor(p.hour)]++; }
  return h;
}

const isWeekend = d => d === 0 || d === 6;

function learnedWindows(hist, dow) {
  // Score = same-day count + 0.25 x counts on other days of the same type (weekday/weekend).
  const score = new Array(24).fill(0);
  for (let d = 0; d < 7; d++) {
    const w = d === dow ? 1 : (isWeekend(d) === isWeekend(dow) ? 0.25 : 0.05);
    for (let h = 0; h < 24; h++) score[h] += w * hist[d][h];
  }
  const max = Math.max(...score);
  if (max <= 0) return [];
  const windows = []; let cur = null;
  for (let h = 0; h < 24; h++) {
    if (score[h] >= 0.5 * max) { if (cur) cur.end = h + 1; else cur = { start: h, end: h + 1, score: 0 }; cur.score += score[h]; }
    else if (cur) { windows.push(cur); cur = null; }
  }
  if (cur) windows.push(cur);
  return windows.sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.start - b.start);
}

function confidenceFor(n) { return n >= 15 ? 'high' : n >= 6 ? 'medium' : 'low'; }

// chainRows: rows from chain_predictions (cached in memory by the app; they only change when seeds change).
function chainWindows(chainRows, chain, country, dow) {
  const dayType = dow === 0 ? 'sun' : 'mon-sat';
  return chainRows.filter(r => r.chain === chain && r.country === country && (r.days === dayType || r.days === 'all'))
    .sort((a, b) => (a.start_hour ?? -1) - (b.start_hour ?? -1))
    .map(r => ({ start: r.start_hour, end: r.end_hour, label: r.label, confidence: r.confidence, source: { title: r.source_title, url: r.source_url } }));
}

// ---- OSM opening_hours (common subset) ----
// Supports e.g. "Mo-Sa 07:00-22:00; Su 10:00-16:00", "Mo-Fr 08:00-20:00, Sa 09:00-18:00", "Mo,We 08:00-12:00,13:00-18:00",
// "24/7", "Su off". Rules with months, weeks, dates, PH/SH-only, sunrise/sunset or comments are ignored;
// returns null if nothing usable is left. Result: array indexed by dow (0=Sun) of [[open, close], ...] in local hours.
const OH_DAYS = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
function parseOpeningHours(str) {
  if (!str || typeof str !== 'string') return null;
  const src = str.trim();
  if (/^24\/7$/.test(src)) return Array.from({ length: 7 }, () => [[0, 24]]);
  const week = Array.from({ length: 7 }, () => null);
  let used = false;
  // split rules on ';' and on ', ' when followed by a weekday (additional rule)
  const rules = src.split(/\s*;\s*|,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/).filter(Boolean);
  for (const rule of rules) {
    if (/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|week|sunrise|sunset|dawn|dusk|"|\[|easter/i.test(rule)) continue;
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)*)\s*(.*)$/);
    if (!m) continue;
    const daySpec = m[1].trim(), timeSpec = m[2].trim();
    let days = [];
    if (!daySpec) days = [0, 1, 2, 3, 4, 5, 6];
    else for (const part of daySpec.split(/\s*,\s*/).filter(Boolean)) {
      if (part === 'PH' || part === 'SH') continue;
      const [a, b] = part.split(/\s*-\s*/);
      if (!(a in OH_DAYS)) continue;
      if (b === undefined) { days.push(OH_DAYS[a]); continue; }
      if (!(b in OH_DAYS)) continue;
      for (let d = OH_DAYS[a]; ; d = (d + 1) % 7) { days.push(d); if (d === OH_DAYS[b]) break; }
    }
    if (!days.length) continue;
    let ranges;
    if (/^(off|closed)$/i.test(timeSpec)) ranges = [];
    else if (/^24\/7$/.test(timeSpec)) ranges = [[0, 24]];
    else {
      const times = [...timeSpec.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})(\+)?/g)];
      if (!times.length || timeSpec.replace(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})(\+)?|[\s,]/g, '') !== '') continue;
      ranges = times.map(t => { const o = +t[1] + t[2] / 60; let c = +t[3] + t[4] / 60; if (c <= o) c += 24; return [o, c]; });
    }
    for (const d of days) week[d] = ranges; // later rules override earlier ones for the same day (OSM semantics)
    used = true;
  }
  return used ? week : null;
}

const GENERIC_SOURCE = { title: 'Which? – Aldi/M&S: reductions likely near closing time; Lidl: a few hours before closing', url: 'https://www.which.co.uk/news/article/best-times-of-day-to-get-yellow-sticker-supermarket-bargains-revealed-aRzv22f0s7Lt' };
// Generic estimate: last 2 hours before the store's final closing time that day. Skips 24h stores and unknown hours.
function genericWindows(openingHours, dow) {
  const week = parseOpeningHours(openingHours);
  if (!week || !week[dow] || !week[dow].length) return null;
  const last = week[dow].reduce((a, b) => (b[1] > a[1] ? b : a));
  const [open, close] = last;
  if (close - open >= 24 || close > 24) return null; // open all day / past midnight: no meaningful "before close"
  return [{ start: Math.max(open, close - 2), end: close }];
}

// Pure function: prediction for a store on a given day (dow in store-local time) from its report times.
function predictStore(store, dow, seenTimes, chainRows) {
  const out = { isPrediction: true, day: DOW[dow], learned: null, chain: chainWindows(chainRows, store.chain, store.country, dow), generic: null };
  if (seenTimes.length >= MIN_REPORTS) {
    const hist = histogram(seenTimes, store.timezone);
    out.learned = {
      reports: seenTimes.length, confidence: confidenceFor(seenTimes.length),
      windows: learnedWindows(hist, dow).map(w => ({ start: w.start, end: w.end })),
      basis: `Learned from ${seenTimes.length} community reports at this store`,
    };
  }
  const hasLearned = out.learned && out.learned.windows.length, hasTimedChain = out.chain.some(c => c.start != null);
  if (!hasLearned && !hasTimedChain) {
    const w = genericWindows(store.opening_hours, dow);
    if (w) out.generic = { windows: w, confidence: 'low', basis: 'Generic estimate: the last 2 hours before this store\'s closing time (OpenStreetMap opening hours). Not specific to this chain or store.', source: GENERIC_SOURCE };
  }
  return out;
}

function nowDow(tz, at = new Date().toISOString()) { return localParts(at, tz).dow; }

module.exports = { localParts, histogram, learnedWindows, predictStore, parseOpeningHours, genericWindows, nowDow, DOW, MIN_REPORTS };
