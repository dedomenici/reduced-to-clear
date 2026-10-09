// A second, independent user (own browser context + session) that posts via the API, for live-alert smoke tests.
module.exports = async function makePoster(browser, base, sitePassword, name = 'Alert Poster') {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'networkidle2' });
  await page.type('input[name=password]', sitePassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type=submit]')]);
  const reg = await page.evaluate(async n => (await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: n, email: `alert${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`, password: 'alertpass123' }) })).status, name);
  if (reg !== 200 && reg !== 201) throw new Error('poster register failed: ' + reg);
  return {
    page,
    post: (lat, lng, storeName) => page.evaluate(async (lat, lng, storeName) => {
      const fd = new FormData();
      Object.entries({ lat, lng, chain: 'Other', chain_other: 'Indie', store_name: storeName, items: 'alert test: bread 20p', seen_at: new Date().toISOString() }).forEach(([k, v]) => fd.set(k, v));
      const r = await fetch('/api/posts', { method: 'POST', body: fd }); return r.status;
    }, lat, lng, storeName),
    close: () => ctx.close(),
  };
};
