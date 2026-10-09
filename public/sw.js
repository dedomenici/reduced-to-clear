// Minimal service worker: enables "Add to Home Screen" and shows an offline notice.
// Deliberately does NOT cache app pages or API data (posts must be live, and the site is behind an access gate).
const OFFLINE = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:system-ui;background:#1d1d1b;color:#fff;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><div style="background:#ffd400;color:#1d1d1b;font-weight:900;padding:.6rem 1rem;border-radius:6px;transform:rotate(-4deg);display:inline-block">REDUCED TO CLEAR</div><p>You are offline. Reconnect to see live reductions.</p></div>';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html' } })));
  }
});
