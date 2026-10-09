// Headless browser smoke test. Starts a temp server on a DB copy unless a baseUrl is given: node test/ui-smoke.js [baseUrl]
// Needs Chrome (CHROME_PATH, default /usr/bin/google-chrome) and SITE_PASSWORD from .env.
const puppeteer = require('puppeteer-core');
const config = require('../src/config');
const tempServer = require('./helpers/temp-server');
let BASE = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = BASE ? null : await tempServer({ env: { PHOTOS_ENABLED: 'false' } }); if (srv) BASE = srv.base;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errors = [];
  async function open() {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
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
  console.log(JSON.stringify({ liveUpdateReceived: true, newBadgeShown: hasNew, photoUiHiddenWhenDisabled: photoUiHidden, predictionPins: predPins, pageErrors: errors }, null, 1));
  await browser.close(); if (srv) srv.stop();
  if (!hasNew || !photoUiHidden || errors.length) process.exit(1);
})().catch(e => { console.error('UI smoke FAILED:', e.message); process.exit(1); }).finally(() => setTimeout(() => process.exit(), 500).unref());
