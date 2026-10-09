// Mobile (390x844, touch) browser test + screenshots. Runs against a temp server with a DB copy.
// node test/mobile-smoke.js   -> writes test/screenshot-mobile.png (+ -sheet, -form)
const puppeteer = require('puppeteer-core');
const config = require('../src/config');
const tempServer = require('./helpers/temp-server');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

(async () => {
  const srv = await tempServer();
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const results = {}; const errors = [];
  try {
    const page = await browser.newPage();
    await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(srv.base, { waitUntil: 'networkidle2' });
    results.gateShown = page.url().endsWith('/gate');
    results.manifestOnGate = await page.evaluate(() => !!document.querySelector('link[rel=manifest]'));
    await page.type('input[name=password]', config.sitePassword);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.tap('button[type=submit]')]);
    await page.waitForSelector('#feed'); await sleep(1500);

    results.viewportMeta = await page.$eval('meta[name=viewport]', m => m.content);
    results.manifest = await page.evaluate(async () => { const r = await fetch('/manifest.webmanifest'); const j = await r.json(); return { ok: r.ok, name: j.name, display: j.display, icons: j.icons.length }; });
    results.iconsOk = await page.evaluate(async () => (await Promise.all(['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png'].map(u => fetch(u)))).every(r => r.ok && r.headers.get('content-type') === 'image/png'));
    results.serviceWorker = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
    results.noHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    results.mapFullWidth = await page.$eval('#map', m => Math.round(m.getBoundingClientRect().width) === window.innerWidth);
    results.sheetCollapsed = await page.$eval('#sheet', s => !s.classList.contains('open') && s.getBoundingClientRect().top > window.innerHeight - 120);
    results.fabVisible = await page.$eval('#fab-post', b => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.bottom <= window.innerHeight; });
    // touch targets: all visible buttons/selects/inputs in header + sheet handle + fab >= 44px tall
    results.smallTouchTargets = await page.evaluate(() => [...document.querySelectorAll('header button, header select, header input, #sheet-handle, #fab-post, .leaflet-control-zoom a')]
      .filter(e => e.offsetParent !== null).filter(e => { const r = e.getBoundingClientRect(); return r.height < 40 || r.width < 40; }).map(e => e.id || e.textContent.trim().slice(0, 20)));
    await page.screenshot({ path: 'test/screenshot-mobile.png' });

    // Guest taps FAB -> login sheet; register
    await page.tap('#fab-post'); await page.waitForSelector('#dlg-auth[open]');
    await page.tap('#auth-toggle');
    await page.type('input[name=displayName]', 'Mobile Tester');
    await page.type('#auth-form input[name=email]', `m${Date.now()}@example.com`);
    await page.type('#auth-form input[name=password]', 'mobilepass1');
    await page.tap('#auth-submit');
    await page.waitForFunction(() => !document.querySelector('#btn-logout').hidden);

    // Post form is full-screen with camera capture input
    await page.tap('#fab-post'); await page.waitForSelector('#dlg-post[open]');
    results.formFullScreen = await page.$eval('#dlg-post', d => { const r = d.getBoundingClientRect(); return Math.round(r.width) === window.innerWidth && Math.round(r.height) >= window.innerHeight - 2; });
    results.cameraInput = await page.$eval('#photo-camera', i => ({ accept: i.accept, capture: i.getAttribute('capture') }));
    results.formInputsNoZoom = await page.evaluate(() => [...document.querySelectorAll('#post-form input:not([type=hidden]):not([type=file]), #post-form select, #post-form textarea')].filter(e => e.offsetParent).every(e => parseFloat(getComputedStyle(e).fontSize) >= 16));
    await page.select('#store-select', ''); // ensure new store
    await page.evaluate(() => { const s = document.querySelector('#store-select'); if (s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event('change')); } });
    await page.type('textarea[name=items]', 'Mobile test: meal deals 50p');
    const fileInput = await page.$('#photo-gallery');
    require('fs').writeFileSync('/tmp/rtc-test.png', PNG); await fileInput.uploadFile('/tmp/rtc-test.png');
    await page.waitForSelector('#photo-preview img');
    await page.screenshot({ path: 'test/screenshot-mobile-form.png' });
    await page.tap('#post-form button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#feed').textContent.includes('Mobile test: meal deals'), { timeout: 8000 });
    await sleep(500);
    results.sheetOpensAfterPost = await page.$eval('#sheet', s => s.classList.contains('open'));
    results.postHasPhoto = await page.evaluate(() => !!document.querySelector('#feed .post img'));
    await page.screenshot({ path: 'test/screenshot-mobile-sheet.png' });
    // tap handle collapses sheet
    await page.tap('#sheet-handle'); await sleep(400);
    results.sheetToggles = await page.$eval('#sheet', s => !s.classList.contains('open'));
    results.summary = await page.$eval('#sheet-summary', s => s.textContent);
    await page.screenshot({ path: 'test/screenshot-mobile.png' }); // final: map with the new pin + peeking sheet
  } finally {
    await browser.close(); srv.stop();
  }
  results.pageErrors = errors;
  console.log(JSON.stringify(results, null, 1));
  const bad = !results.gateShown || !results.manifest.ok || !results.iconsOk || !results.noHorizontalScroll || !results.mapFullWidth || !results.sheetCollapsed
    || !results.fabVisible || results.smallTouchTargets.length || !results.formFullScreen || results.cameraInput.capture !== 'environment'
    || !results.formInputsNoZoom || !results.sheetOpensAfterPost || !results.sheetToggles || !results.postHasPhoto || errors.length;
  if (bad) { console.error('MOBILE SMOKE FAILED'); process.exit(1); }
  console.log('MOBILE SMOKE PASSED');
})().catch(e => { console.error('MOBILE SMOKE FAILED:', e.message); process.exit(1); });
