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
    await page.evaluateOnNewDocument(() => { // count geolocation requests (the app should ask straight away on load)
      const g = navigator.geolocation; if (!g) return; const orig = g.getCurrentPosition.bind(g);
      g.getCurrentPosition = (...a) => { window.__geoCalls = (window.__geoCalls || 0) + 1; return orig(...a); };
    });
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
  // ---- Local alerts: no sound; gentle map nudge towards the store + pulsing pin (prediction starting now; new post in view; never at regional zoom) ----
  const parisTodayAt = (h, m) => { // epoch ms for h:m today in Europe/Paris
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', timeZoneName: 'shortOffset' }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const off = (p.timeZoneName.match(/GMT([+-]\d+)?/)[1] || '0') * 60;
    return Date.UTC(+p.year, +p.month - 1, +p.day, h, m) - off * 60000;
  };
  const alerts = {};
  const beepsOf = pg => pg.evaluate(() => Number(document.body.dataset.beeps || 0));
  const nudgesOf = pg => pg.evaluate(() => Number(document.body.dataset.nudges || 0));
  const lp = await open({ latitude: 48.8566, longitude: 2.3522 }, { fakeNow: parisTodayAt(14, 1) }); // Carrefour FR window 14:00
  alerts.geoAskedOnLoad = await lp.evaluate(() => window.__geoCalls >= 1 && document.querySelector('#locate-card').hidden);
  await lp.waitForSelector('.pred-pin.alerted.alert-flash', { timeout: 15000 });
  alerts.predictionToast = await lp.$eval('#alert-toast', n => n.textContent);
  alerts.predictionPulse = await lp.$eval('.pred-pin.alerted', n => getComputedStyle(n).animationName);
  const z0 = await lp.evaluate(() => window.rtcMap.getZoom());
  await lp.waitForFunction(() => Number(document.body.dataset.nudges || 0) >= 1, { timeout: 8000 });
  await sleep(2500);
  alerts.predictionNudge = await lp.evaluate(z0 => ({ nudges: Number(document.body.dataset.nudges), zoomChange: window.rtcMap.getZoom() - z0 }), z0);
  await lp.screenshot({ path: 'test/screenshot-alert-prediction.png' });
  const neighbour = await require('./helpers/poster')(browser, BASE, config.sitePassword, 'Paris Neighbour');
  while (await lp.evaluate(() => window.rtcMap.getZoom()) > 9) { await lp.click('.leaflet-control-zoom-out'); await sleep(400); } // zoom 9: regional level
  let n0 = await nudgesOf(lp);
  await neighbour.post(48.8580, 2.3545, 'Alert Regional Zoom');
  await lp.waitForFunction(() => document.querySelector('#feed').textContent.includes('Alert Regional Zoom'), { timeout: 8000 });
  await sleep(12000); // past the 10 s quiet period: a (wrong) nudge would have happened by now
  alerts.regionalZoomNudges = (await nudgesOf(lp)) - n0;
  alerts.regionalZoomFlash = await lp.evaluate(() => document.querySelectorAll('.pin.alerted').length);
  while (await lp.evaluate(() => window.rtcMap.getZoom()) < 11) { await lp.click('.leaflet-control-zoom-in'); await sleep(400); } // zoom 11: city level now alerts
  const lastTouch = Date.now(); n0 = await nudgesOf(lp);
  await neighbour.post(48.8570, 2.3528, 'Alert Local Bakery');
  await lp.waitForSelector('.pin.alerted.alert-flash', { timeout: 8000 });
  alerts.pulseBeforeNudge = (await nudgesOf(lp)) === n0; // the user just zoomed: pin pulses at once, the map waits
  await lp.waitForFunction(n => Number(document.body.dataset.nudges || 0) > n, { timeout: 15000 }, n0);
  alerts.nudgeWaitedForQuietMs = Date.now() - lastTouch;
  alerts.localPostToast = await lp.$eval('#alert-toast', n => n.textContent);
  alerts.localPostPulse = await lp.$eval('.pin.alerted', n => getComputedStyle(n).animationName);
  alerts.automaticBeeps = await beepsOf(lp);
  await sleep(2000);
  await lp.screenshot({ path: 'test/screenshot-alert-post.png' });
  // the 🔔 button is the only sound
  await lp.click('#btn-sound'); alerts.beepsAfterButton = await beepsOf(lp);
  alerts.watcherBeeps = await beepsOf(watcher);
  // radius change: fit the map to 10 km around the user, then pulse the stores with reductions in it
  await lp.evaluate(() => { delete document.body.dataset.highlighted; });
  await lp.select('#radius', '10');
  await lp.waitForFunction(() => document.body.dataset.highlighted, { timeout: 15000 });
  await sleep(2000);
  alerts.radius = await lp.evaluate(() => { const m = window.rtcMap, b = m.getBounds(), c = L.latLng(48.8566, 2.3522);
    return { highlighted: Number(document.body.dataset.highlighted), pulsing: document.querySelectorAll('.alerted').length,
      fits: b.contains(c.toBounds(20000)) && m.distance(b.getNorthWest(), b.getNorthEast()) < 60000 }; });
  await neighbour.close();
  const alertsOk = alerts.geoAskedOnLoad && /PREDICTION/.test(alerts.predictionToast) && /Carrefour/.test(alerts.predictionToast) && alerts.predictionPulse === 'rtc-pulse' && alerts.predictionNudge.nudges >= 1
    && alerts.regionalZoomNudges === 0 && alerts.regionalZoomFlash === 0 && alerts.pulseBeforeNudge && alerts.nudgeWaitedForQuietMs >= 9000
    && /Alert Local Bakery/.test(alerts.localPostToast) && alerts.localPostPulse === 'rtc-pulse' && alerts.automaticBeeps === 0 && alerts.watcherBeeps === 0 && alerts.beepsAfterButton === 1
    && alerts.radius.highlighted >= 1 && alerts.radius.pulsing >= 1 && alerts.radius.fits;
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
  // International is off by default: panning ~340 km to Paris does not fetch it, it shows a hint at the 'Go international' toggle
  world.intlButton = await nowhere.$eval('#btn-intl', b => { const r = b.getBoundingClientRect(); return { text: b.textContent, pressed: b.getAttribute('aria-pressed'), visible: r.width > 0 && r.bottom <= innerHeight && r.top > innerHeight / 2 }; });
  await nowhere.evaluate(() => window.rtcMap.setView([48.8566, 2.3522], 14)); // user pans to Paris
  await nowhere.waitForFunction(() => /outside your local area/.test(document.querySelector('#map-hint').textContent), { timeout: 10000 });
  await sleep(1500);
  world.intlOffBlocksParis = !(await nowhere.$eval('#feed', n => n.textContent.includes('Paris test'))) && (await apiCalls()).every(u => /lat=51\.50/.test(u));
  // Go international (reduced motion: instant jump) -> world view with megacity labels and the latest posts everywhere
  await nowhere.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await nowhere.click('#btn-intl'); await sleep(150);
  world.intlWorldZoomInstant = await nowhere.evaluate(() => window.rtcMap.getZoom());
  await nowhere.waitForFunction(() => document.querySelector('#feed').textContent.includes('Paris test'), { timeout: 10000 });
  world.cityLabels = await nowhere.$$eval('.city-label', n => n.map(x => x.textContent));
  await nowhere.screenshot({ path: 'test/screenshot-international.png' });
  await nowhere.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await nowhere.evaluate(() => [...document.querySelectorAll('.city-label')].find(x => x.textContent === 'Paris').click());
  await sleep(400); world.cityFlyAnimated = await nowhere.evaluate(() => window.rtcMap.getZoom() < 13);
  await nowhere.waitForFunction(() => window.rtcMap.getZoom() === 13 && document.querySelectorAll('.pred-pin').length > 0, { timeout: 20000 });
  world.cityLoadsStores = await nowhere.evaluate(() => document.body.dataset.city === 'Paris' && performance.getEntriesByType('resource').some(e => /\/api\/stores\?lat=48\.85/.test(e.name)));
  world.panLoadsParis = await nowhere.$eval('#feed', n => n.textContent.includes('Paris test'));
  world.intlPersisted = await nowhere.evaluate(() => localStorage.getItem('rtc_intl') === '1' && document.querySelector('#btn-intl').getAttribute('aria-pressed') === 'true');
  world.firstLoadNoMeConfig = await nowhere.evaluate(() => !performance.getEntriesByType('resource').some(e => /\/api\/(me|config)$/.test(e.name)));
  world.splashGone = await nowhere.evaluate(() => !document.getElementById('splash') && Number(document.body.dataset.readyMs) > 0);
  world.kiokoLabel = await nowhere.waitForFunction(() => [...document.querySelectorAll('.leaflet-tooltip-pane, .leaflet-marker-icon')].length > 0, { timeout: 10000 })
    .then(() => nowhere.evaluate(async () => { const r = await fetch('/api/stores?lat=48.8566&lng=2.3522&radius_km=2').then(r => r.json());
      const k = r.stores.find(s => s.name === '京子食品'); return k && window.RTC_NAMES.storeLabel(k.name, k.chain, k.name_en); }));
  await sleep(1500); await nowhere.screenshot({ path: 'test/screenshot-desktop.png' });
  // See all branches (from a Carrefour store popup): clustered, map fitted, honest "we know about" note
  await nowhere.evaluate(() => { const m = Object.values(window.rtcMap._layers).find(l => l.getPopup && l.getPopup() && l.getTooltip && l.getTooltip() && /Carrefour/.test(l.getTooltip().getContent())); m.openPopup(); });
  await nowhere.waitForSelector('.leaflet-popup-content .see-branches');
  await nowhere.click('.leaflet-popup-content .see-branches');
  await nowhere.waitForFunction(() => !document.querySelector('#branch-banner').hidden && document.querySelector('.branch-pin, .marker-cluster'), { timeout: 10000 });
  world.branches = await nowhere.evaluate(() => ({ n: Number(document.body.dataset.branches), text: document.querySelector('#branch-text').textContent, clusterLib: !!L.markerClusterGroup,
    markers: document.querySelectorAll('.branch-pin, .marker-cluster').length }));
  await sleep(1800); await nowhere.screenshot({ path: 'test/screenshot-branches.png' });
  await nowhere.click('#branch-close'); world.branchesClosed = await nowhere.evaluate(() => document.querySelector('#branch-banner').hidden && !document.querySelector('.branch-pin, .marker-cluster'));
  const soundPrefOk = true;
  const worldOk = world.mapCentredOnUser && world.genericPredictionPins > 0 && /^ReducedToClear\//.test(world.overpassUserAgent || '') && /OpenStreetMap/.test(world.attribution)
    && /Generic estimate/.test(world.popup) && /France · EUR · Europe\/Paris/.test(world.detected) && /€/.test(world.pricePlaceholder) && world.nearbyOsmStores >= 2
    && world.postShowsCurrency && /London/.test(world.noLocationHint) && /nearby/.test(world.firstLoadSummary) && !world.firstLoadShowsParis
    && world.firstLoadOnlyLondon && world.panLoadsParis && world.intlButton.visible && world.intlButton.pressed === 'false' && /Go international/.test(world.intlButton.text)
    && world.intlOffBlocksParis && world.intlWorldZoomInstant === 2 && world.cityLabels.length === 27 && world.cityLabels.includes('Kaohsiung') && world.cityFlyAnimated && world.cityLoadsStores
    && world.branches.n >= 1 && /Carrefour branch(es)? we know about/.test(world.branches.text) && /opened on the map/.test(world.branches.text) && world.branches.clusterLib && world.branches.markers >= 1 && world.branchesClosed
    && world.intlPersisted && world.firstLoadNoMeConfig && world.splashGone && world.kiokoLabel === '京子食品 (Kioko)';
  console.log(JSON.stringify({ liveUpdateReceived: true, newBadgeShown: hasNew, photoUiHiddenWhenDisabled: photoUiHidden, predictionPins: predPins, world, alerts, pageErrors: errors }, null, 1));
  await browser.close(); if (srv) srv.stop(); mock.close();
  if (!hasNew || !photoUiHidden || !worldOk || !alertsOk || !soundPrefOk || errors.length) process.exit(1);
})().catch(e => { console.error('UI smoke FAILED:', e.message); process.exit(1); }).finally(() => setTimeout(() => process.exit(), 500).unref());
