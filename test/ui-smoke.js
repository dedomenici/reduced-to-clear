// Headless browser smoke test. Starts a temp server on a DB copy unless a baseUrl is given: node test/ui-smoke.js [baseUrl]
// Needs Chrome (CHROME_PATH, default /usr/bin/google-chrome) and SITE_PASSWORD from .env.
const puppeteer = require('puppeteer-core');
const config = require('../src/config');
const tempServer = require('./helpers/temp-server');
let BASE = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // Mock Overpass API (serves the Paris fixture) so on-demand store fetching is exercised end to end without the internet.
  const http = require('http'); const overpassHits = [];
  const fixture = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'overpass-paris.json'));
  const mock = http.createServer((rq, rs) => { let b = ''; rq.on('data', d => b += d); rq.on('end', () => {
    overpassHits.push({ ua: rq.headers['user-agent'], body: decodeURIComponent(b) });
    const paris = /\(48\.75,2\.25,49,2\.5\)/.test(decodeURIComponent(b));
    rs.setHeader('Content-Type', 'application/json'); rs.end(paris ? fixture : '{"elements":[]}'); }); });
  await new Promise(r => mock.listen(0, r));
  const srv = BASE ? null : await tempServer({ env: { PHOTOS_ENABLED: 'false', OVERPASS_URLS: `http://127.0.0.1:${mock.address().port}/api/interpreter`, OVERPASS_MIN_INTERVAL_MS: '0' } }); if (srv) BASE = srv.base;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errors = [];
  async function open(where = { latitude: 51.5246, longitude: -0.0876 }, opts = {}) { // default: the user is in London (Old Street)
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    if (opts.fakeNow) await page.evaluateOnNewDocument(target => { // shift the page clock (time of day) for prediction-alert tests
      const OFF = target - Date.now(), RealDate = Date;
      class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + OFF); } static now() { return RealDate.now() + OFF; } }
      window.Date = FakeDate;
    }, opts.fakeNow);
    if (opts.sound) await page.evaluateOnNewDocument(() => localStorage.setItem('rtc_sound', '1'));
    if (where) { await ctx.overridePermissions(new URL(BASE).origin, ['geolocation']); await page.setGeolocation(where); }
    await page.setViewport({ width: 1300, height: 850 });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    if (!page.url().endsWith('/gate')) throw new Error('expected gate, got ' + page.url());
    await page.type('input[name=password]', config.sitePassword);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type=submit]')]);
    await page.waitForSelector('#feed');
    return page;
  }
  const watcher = await open(); // guest browsing, waits for live posts
  const poster = await open();
  const email = `ui${Date.now()}@example.com`;
  await poster.click('#btn-new'); // guest -> login prompt
  await poster.waitForSelector('#dlg-auth[open]');
  await poster.click('#auth-toggle');
  await poster.type('input[name=displayName]', 'Richard');
  await poster.type('#auth-form input[name=email]', email);
  await poster.type('#auth-form input[name=password]', 'testpass123');
  await poster.click('#auth-submit');
  await poster.waitForFunction(() => document.querySelector('#who').textContent.includes('Richard'));
  await poster.click('#btn-new');
  await poster.waitForSelector('#dlg-post[open]');
  const photoUiHidden = await poster.$eval('#photo-fieldset', f => f.hidden && f.offsetParent === null);
  await poster.select('#chain-select', 'Co-op');
  await poster.type('input[name=store_name]', 'Co-op UI Test');
  await poster.type('textarea[name=items]', 'UI test: sandwiches 75% off');
  await poster.click('#post-form button[type=submit]');
  await poster.waitForFunction(() => document.querySelector('#feed').textContent.includes('UI test: sandwiches'));
  await watcher.waitForFunction(() => document.querySelector('#feed').textContent.includes('UI test: sandwiches'), { timeout: 8000 });
  const hasNew = await watcher.evaluate(() => !!document.querySelector('.new-badge'));
  const predPins = await watcher.evaluate(() => document.querySelectorAll('.pred-pin').length);
  await sleep(800);
  await watcher.screenshot({ path: 'test/screenshot-watcher.png' });
  await poster.screenshot({ path: 'test/screenshot-poster.png' });
  // mark all gone as poster
  poster.on('dialog', d => d.accept());
  await poster.evaluate(() => [...document.querySelectorAll('#feed button')].find(b => b.textContent.includes('All gone')).click());
  await watcher.waitForFunction(() => !document.querySelector('#feed').textContent.includes('UI test: sandwiches') || document.querySelector('.post.gone'), { timeout: 8000 });
  // ---- Worldwide: a user in Paris (no London default) ----
  const paris = await open({ latitude: 48.8566, longitude: 2.3522 });
  await paris.waitForFunction(() => document.querySelectorAll('.pred-pin.generic').length > 0, { timeout: 15000 });
  const world = {};
  world.mapCentredOnUser = await paris.evaluate(() => { const c = JSON.parse(localStorage.getItem('rtc_center')); return Math.abs(c.lat - 48.8566) < 0.01 && Math.abs(c.lng - 2.3522) < 0.01; });
  world.genericPredictionPins = await paris.evaluate(() => document.querySelectorAll('.pred-pin.generic').length);
  world.overpassUserAgent = overpassHits.length ? overpassHits[0].ua : null;
  world.attribution = await paris.$eval('#attribution', n => n.textContent);
  await paris.evaluate(() => document.querySelector('.leaflet-marker-icon .pred-pin.generic').parentElement.click());
  await paris.waitForSelector('.leaflet-popup-content');
  world.popup = await paris.$eval('.leaflet-popup-content', n => n.textContent);
  await paris.click('#btn-new'); await paris.waitForSelector('#dlg-auth[open]'); await paris.click('#auth-toggle');
  await paris.type('input[name=displayName]', 'Pierre'); await paris.type('#auth-form input[name=email]', `fr${Date.now()}@example.com`);
  await paris.type('#auth-form input[name=password]', 'testpass123'); await paris.click('#auth-submit');
  await paris.waitForFunction(() => !document.querySelector('#btn-logout').hidden);
  await paris.click('#btn-new'); await paris.waitForSelector('#dlg-post[open]');
  await paris.waitForFunction(() => document.querySelector('#loc-detected').textContent.includes('EUR'));
  world.detected = await paris.$eval('#loc-detected', n => n.textContent);
  world.pricePlaceholder = await paris.$eval('#price-note', n => n.placeholder);
  await paris.waitForFunction(() => document.querySelector('#store-select').options.length > 1);
  world.nearbyOsmStores = await paris.$$eval('#store-select option', o => o.map(x => x.textContent).filter(x => /Carrefour|Lidl|Franprix/.test(x)).length);
  await paris.select('#chain-select', 'Other'); await paris.type('input[name=chain_other]', 'Monoprix');
  await paris.type('textarea[name=items]', 'Paris test: croissants -50%'); await paris.type('#price-note', '0,60 €');
  await paris.click('#post-form button[type=submit]');
  await paris.waitForFunction(() => document.querySelector('#feed').textContent.includes('Paris test'));
  world.postShowsCurrency = await paris.$eval('#feed', n => n.textContent.includes('(EUR)'));
  await paris.screenshot({ path: 'test/screenshot-paris.png' });
  // ---- Local alerts: checkout beep + flashing pin (prediction starting now; new post in view; never at city zoom) ----
  const parisTodayAt = (h, m) => { // epoch ms for h:m today in Europe/Paris
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', timeZoneName: 'shortOffset' }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const off = (p.timeZoneName.match(/GMT([+-]\d+)?/)[1] || '0') * 60;
    return Date.UTC(+p.year, +p.month - 1, +p.day, h, m) - off * 60000;
  };
  const alerts = {};
  const beepsOf = pg => pg.evaluate(() => Number(document.body.dataset.beeps || 0));
  const lp = await open({ latitude: 48.8566, longitude: 2.3522 }, { fakeNow: parisTodayAt(14, 1), sound: true }); // Carrefour FR window 14:00
  await lp.waitForSelector('.pred-pin.alerted.alert-flash', { timeout: 15000 });
  alerts.predictionToast = await lp.$eval('#alert-toast', n => n.textContent);
  alerts.predictionPulse = await lp.$eval('.pred-pin.alerted', n => getComputedStyle(n).animationName);
  alerts.predictionBeeps = await beepsOf(lp);
  alerts.loadBeep = await lp.evaluate(() => document.body.dataset.loadBeep);
  if (alerts.loadBeep === 'waiting') { await lp.click('#feed'); alerts.loadBeepAfterTap = await lp.evaluate(() => document.body.dataset.loadBeep); }
  alerts.loadBeepSoundOff = await watcher.evaluate(() => document.body.dataset.loadBeep);
  await lp.screenshot({ path: 'test/screenshot-alert-prediction.png' });
  const neighbour = await require('./helpers/poster')(browser, BASE, config.sitePassword, 'Paris Neighbour');
  await sleep(11000); // let the merged load/prediction beep (10 s throttle) play out before measuring
  for (let i = 0; i < 6; i++) { await lp.click('.leaflet-control-zoom-out'); await sleep(400); } // zoom 9: regional level
  let b0 = await beepsOf(lp);
  await neighbour.post(48.8580, 2.3545, 'Alert Regional Zoom');
  await lp.waitForFunction(() => document.querySelector('#feed').textContent.includes('Alert Regional Zoom'), { timeout: 8000 });
  await sleep(11000); // longer than the beep throttle, so a (wrong) merged beep would have played by now
  alerts.regionalZoomBeeps = (await beepsOf(lp)) - b0;
  alerts.regionalZoomFlash = await lp.evaluate(() => document.querySelectorAll('.pin.alerted').length);
  for (let i = 0; i < 2; i++) { await lp.click('.leaflet-control-zoom-in'); await sleep(400); } // zoom 11: city level now alerts
  b0 = await beepsOf(lp);
  await neighbour.post(48.8570, 2.3528, 'Alert Local Bakery');
  await lp.waitForSelector('.pin.alerted.alert-flash', { timeout: 8000 });
  await lp.waitForFunction(b => Number(document.body.dataset.beeps || 0) > b, { timeout: 12000 }, b0);
  alerts.localPostToast = await lp.$eval('#alert-toast', n => n.textContent);
  alerts.localPostPulse = await lp.$eval('.pin.alerted', n => getComputedStyle(n).animationName);
  await lp.screenshot({ path: 'test/screenshot-alert-post.png' });
  await neighbour.close();
  const alertsOk = (alerts.loadBeep === 'played' || alerts.loadBeepAfterTap === 'played') && alerts.loadBeepSoundOff === 'off' && /PREDICTION/.test(alerts.predictionToast) && /Carrefour/.test(alerts.predictionToast) && alerts.predictionPulse === 'rtc-pulse' && alerts.predictionBeeps >= 1
    && alerts.regionalZoomBeeps === 0 && alerts.regionalZoomFlash === 0 && /Alert Local Bakery/.test(alerts.localPostToast) && alerts.localPostPulse === 'rtc-pulse';
  // No location permission: London fallback only; nothing worldwide or elsewhere until the user moves the map
  const nowhere = await open(null);
  await nowhere.waitForFunction(() => /London/.test(document.querySelector('#map-hint').textContent), { timeout: 15000 });
  await sleep(1000);
  world.noLocationHint = await nowhere.$eval('#map-hint', n => !n.hidden && n.textContent);
  world.firstLoadSummary = await nowhere.$eval('#sheet-summary', n => n.textContent);
  world.firstLoadShowsParis = await nowhere.$eval('#feed', n => n.textContent.includes('Paris test'));
  const apiCalls = () => nowhere.evaluate(() => performance.getEntriesByType('resource').map(e => e.name).filter(u => /\/api\/(posts|stores)\?/.test(u)).map(u => u.replace(location.origin, '')));
  world.firstLoadRequests = await apiCalls();
  world.firstLoadOnlyLondon = world.firstLoadRequests.length > 0 && world.firstLoadRequests.every(u => /lat=51\.50/.test(u));
  await nowhere.evaluate(() => window.rtcMap.setView([48.8566, 2.3522], 14)); // user pans to Paris
  await nowhere.waitForFunction(() => document.querySelector('#feed').textContent.includes('Paris test'), { timeout: 10000 });
  world.panLoadsParis = true;
  world.kiokoLabel = await nowhere.waitForFunction(() => [...document.querySelectorAll('.leaflet-tooltip-pane, .leaflet-marker-icon')].length > 0, { timeout: 10000 })
    .then(() => nowhere.evaluate(async () => { const r = await fetch('/api/stores?lat=48.8566&lng=2.3522&radius_km=2').then(r => r.json());
      const k = r.stores.find(s => s.name === '京子食品'); return k && window.RTC_NAMES.storeLabel(k.name, k.chain, k.name_en); }));
  await nowhere.screenshot({ path: 'test/screenshot-desktop.png' });
  const worldOk = world.mapCentredOnUser && world.genericPredictionPins > 0 && /^ReducedToClear\//.test(world.overpassUserAgent || '') && /OpenStreetMap/.test(world.attribution)
    && /Generic estimate/.test(world.popup) && /France · EUR · Europe\/Paris/.test(world.detected) && /€/.test(world.pricePlaceholder) && world.nearbyOsmStores >= 2
    && world.postShowsCurrency && /London/.test(world.noLocationHint) && /nearby/.test(world.firstLoadSummary) && !world.firstLoadShowsParis
    && world.firstLoadOnlyLondon && world.panLoadsParis && world.kiokoLabel === '京子食品 (Kioko)';
  console.log(JSON.stringify({ liveUpdateReceived: true, newBadgeShown: hasNew, photoUiHiddenWhenDisabled: photoUiHidden, predictionPins: predPins, world, alerts, pageErrors: errors }, null, 1));
  await browser.close(); if (srv) srv.stop(); mock.close();
  if (!hasNew || !photoUiHidden || !worldOk || !alertsOk || errors.length) process.exit(1);
})().catch(e => { console.error('UI smoke FAILED:', e.message); process.exit(1); }).finally(() => setTimeout(() => process.exit(), 500).unref());
