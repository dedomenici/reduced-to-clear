// Minimal service worker: enables "Add to Home Screen" and shows an offline notice.
// Caches only the APP SHELL (content-hashed JS/CSS, self-hosted Leaflet, font, icons), cache-first.
// Never pages or API/photo/stream requests: posts must be live, and navigations always hit the network so the
// password gate stays in force (an expired gate cookie still redirects to /gate).
const OFFLINE = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:system-ui;background:#1d1d1b;color:#fff;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><div style="background:#ffd400;color:#1d1d1b;font-weight:900;padding:.6rem 1rem;border-radius:6px;transform:rotate(-4deg);display:inline-block">REDUCED TO CLEAR</div><p>You are offline. Reconnect to see live reductions.</p></div>';
const VERSION = '__VERSION__';           // injected by the server: changes on every deploy that changes an asset
const SHELL = [/*__SHELL__*/];           // injected: versioned asset URLs
const CACHE = 'rtc-shell-' + VERSION;
const isShell = url => url.origin === self.location.origin && /^\/(a|vendor|fonts)\//.test(url.pathname);
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => fetch(u, { credentials: 'same-origin' })
    .then(r => { if (r.ok && !r.redirected) return c.put(u, r); }).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('rtc-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html' } })));
    return;
  }
  const url = new URL(req.url);
  if (req.method !== 'GET' || !isShell(url)) return; // API, photos, SSE, map tiles: straight to the network
  e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && !r.redirected) c.put(req, r.clone());
    return r;
  }))));
});
