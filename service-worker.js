/* Focus Intervention — Service Worker
 * Caching strategy:
 * - HTML navigations: network-first (fallback to cache)
 * - Static assets: stale-while-revalidate
 * - Handles SKIP_WAITING message and simple background sync echo
 */

const CACHE_VERSION = 'fi-v3-2025-09-28';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Utility: respond with cached, then update cache in background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((networkResp) => {
    if (networkResp && networkResp.ok) {
      cache.put(request, networkResp.clone());
    }
    return networkResp;
  }).catch(() => cached);
  return cached || fetchPromise;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Message channel (index.html sends SKIP_WAITING)
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Navigation requests: network-first
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GETs
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // HTML navigations
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, net.clone());
        return net;
      } catch (err) {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match(req)) || (await cache.match('./index.html'));
      }
    })());
    return;
  }

  // Static assets: stale-while-revalidate
  if (/\.(?:js|css|png|jpg|jpeg|svg|webp|json|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

// Optional: Background Sync echo so the page can display "SYNC_SUCCESS"
self.addEventListener('sync', (event) => {
  if (event.tag === 'focus-data-sync') {
    event.waitUntil((async () => {
      const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      // Here you’d push real sync metrics; we just echo a demo payload count.
      for (const client of clientsList) {
        client.postMessage({ type: 'SYNC_SUCCESS', data: 0 });
      }
    })());
  }
});
