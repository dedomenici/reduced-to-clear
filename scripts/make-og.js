// Renders the 1200x630 social share image (public/og-image.png). node scripts/make-og.js
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const pub = (...p) => path.join(__dirname, '..', 'public', ...p);
const trolley = fs.readFileSync(pub('icons', 'trolley.svg'), 'utf8');
const font = fs.readFileSync(pub('fonts', 'doto-v3-900-latin.woff2')).toString('base64');
const html = `<!doctype html><style>
@font-face{font-family:Doto;font-weight:900;src:url(data:font/woff2;base64,${font}) format('woff2')}
html,body{margin:0;width:1200px;height:630px;background:#1d1d1b;display:grid;place-items:center;overflow:hidden;font-family:system-ui,sans-serif}
.s{display:flex;align-items:center;gap:44px;background:#ffd400;border:10px solid #fff;outline:5px solid #1d1d1b;border-radius:36px;padding:48px 64px;transform:rotate(-4deg);box-shadow:0 18px 40px rgba(0,0,0,.5)}
svg{width:230px;height:auto;color:#1d1d1b}
.t{font:900 118px/0.95 Doto,monospace;color:#1d1d1b;letter-spacing:.02em}
.sub{position:absolute;bottom:42px;width:100%;text-align:center;color:#fff;font-size:34px;font-weight:600}
</style><div class="s">${trolley}<div class="t">REDUCED<br>TO CLEAR</div></div><div class="sub">Crowdsourced yellow-sticker reductions near you</div>`;
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await browser.newPage(); await p.setViewport({ width: 1200, height: 630 });
  await p.setContent(html, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: pub('og-image.png') }); await browser.close(); console.log('wrote public/og-image.png');
})();
