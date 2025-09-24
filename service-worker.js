// MBPS REI PRO — Project-subpath PWA SW for GitHub Pages
// Place this at repo root with index.html, manifest.json, icon-192.png, icon-512.png

const VERSION = 'v4';
const CACHE_NAME = `mbps-rei-pro-${VERSION}`;
const BASE = '/mbs-rei-pro';

const ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/icon-192.png`,
  `${BASE}/icon-512.png`,
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => {}) // ignore CDN hiccups; we'll fetch later
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
      )
  );
  self.clients.claim();
});

// Strategy:
// - Try cache first; fall back to network.
// - For navigation (HTML) requests, return cached index.html when offline.
// - Only cache successful, same-origin responses (resp.type === 'basic').
self.addEventListener('fetch', (event) => {
  // Only GET & http(s)
  if (event.request.method !== 'GET') return;
  if (!/^https?:\/\//.test(event.request.url)) return;

  const isNavigate =
    event.request.mode === 'navigate' ||
    (event.request.destination === 'document');

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((resp) => {
          // For SPA navigations, opportunistically keep latest index.html
          if (isNavigate && resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(`${BASE}/index.html`, clone);
            });
            return resp;
          }

          // Cache static same-origin successes
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(async () => {
          // Offline fallback for navigations → cached app shell
          if (isNavigate) {
            const shell = await caches.match(`${BASE}/index.html`);
            if (shell) return shell;
          }
          // Otherwise, let it fail silently
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    })
  );
});

// Optional: support skipping waiting from the page
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
