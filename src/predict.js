// Prediction model. Two kinds, both always labelled as PREDICTIONS in the UI:
//  1. "learned": per-store day-of-week x hour histogram built from community posts (seen_at, store local time)
//  2. "chain":   chain-typical windows seeded from research (seeds/chain-predictions.json)
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

// Pure function: prediction for a store on a given day (dow in store-local time) from its report times.
function predictStore(store, dow, seenTimes, chainRows) {
  const out = { isPrediction: true, day: DOW[dow], learned: null, chain: chainWindows(chainRows, store.chain, store.country, dow) };
  if (seenTimes.length >= MIN_REPORTS) {
    const hist = histogram(seenTimes, store.timezone);
    out.learned = {
      reports: seenTimes.length, confidence: confidenceFor(seenTimes.length),
      windows: learnedWindows(hist, dow).map(w => ({ start: w.start, end: w.end })),
      basis: `Learned from ${seenTimes.length} community reports at this store`,
    };
  }
  return out;
}

function nowDow(tz, at = new Date().toISOString()) { return localParts(at, tz).dow; }

module.exports = { localParts, histogram, learnedWindows, predictStore, nowDow, DOW, MIN_REPORTS };
