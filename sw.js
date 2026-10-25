/* Tally service worker: keeps the app working offline.
   Only the app's own files are cached. Your records live in IndexedDB, never here. */
const VERSION = 'tally-1.0.6';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png',
  './icon-maskable-512.png', './stream-polyfill.js', './pdf.worker.shim.js', './pdf.min.js', './pdf.worker.min.js'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  // Exchange-rate requests and anything else off-site go straight to the network.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      throw err;
    }
  })());
});
