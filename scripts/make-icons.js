// Renders the PWA icons (yellow sticker + own trolley drawing + "REDUCED TO CLEAR" in the Doto dot-matrix font)
// with headless Chrome. node scripts/make-icons.js   (needs CHROME_PATH or /usr/bin/google-chrome)
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const pub = (...p) => path.join(__dirname, '..', 'public', ...p);
const trolley = fs.readFileSync(pub('icons', 'trolley.svg'), 'utf8');
const font = fs.readFileSync(pub('fonts', 'doto-v3-900-latin.woff2')).toString('base64');
const page = ({ size, safe, text }) => `<!doctype html><style>
@font-face{font-family:Doto;font-weight:900;src:url(data:font/woff2;base64,${font}) format('woff2')}
html,body{margin:0;width:${size}px;height:${size}px;background:#1d1d1b;display:grid;place-items:center;overflow:hidden}
.s{box-sizing:border-box;width:${Math.round(size * safe)}px;background:#ffd400;border:${Math.max(2, size / 48)}px solid #fff;outline:${Math.max(1, size / 96)}px solid #1d1d1b;
  border-radius:${size / 20}px;transform:rotate(-8deg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${size / 40}px;padding:${size / 22}px 0}
svg{width:${Math.round(size * safe * (text ? 0.42 : 0.72))}px;height:auto;color:#1d1d1b}
.t{font:900 ${Math.round(size * safe * 0.155)}px/1 Doto,monospace;color:#1d1d1b;text-align:center;letter-spacing:.02em}
</style><div class="s">${trolley}${text ? '<div class="t">REDUCED<br>TO CLEAR</div>' : ''}</div>`;
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await browser.newPage();
  const jobs = [['icon-512.png', 512, 0.8, true], ['icon-192.png', 192, 0.8, true], ['apple-touch-icon.png', 180, 0.8, true],
    ['maskable-512.png', 512, 0.62, true], ['favicon-32.png', 32, 0.95, false]]; // maskable: keep inside the 80% safe circle
  for (const [file, size, safe, text] of jobs) {
    await p.setViewport({ width: size, height: size });
    await p.setContent(page({ size, safe, text }), { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: pub('icons', file), omitBackground: false });
    console.log('wrote', file);
  }
  await browser.close();
})();
