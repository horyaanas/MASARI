// ============================================================
// Service Worker — Masari (Learning Path) PWA
// Version: 4
// Strategy:
//   - Navigations (HTML pages)        -> network-first, fall back to cache
//   - Same-origin static GET requests -> stale-while-revalidate
//   - Cross-origin requests           -> passthrough (no caching)
// Messages handled:
//   - { type: 'SKIP_WAITING' }  : activate new SW immediately
//   - { type: 'CLEAR_CACHE' }   : wipe all caches (called from Settings)
//   - { type: 'FORCE_UPDATE' }  : clear caches + skipWaiting + reload clients
//
// IMPORTANT: This SW also aggressively cleans up ALL old caches
// (masari-v1, masari-v2, masari-v3, etc.) on activation so that
// users stuck on older SW versions get a clean slate as soon as
// this new SW takes control.
// ============================================================

const CACHE_NAME = 'masari-v4';
const APP_VERSION = '1.2.0';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/version.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  // Activate immediately so the new strategy takes effect without waiting
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete ALL caches that are not the current one (kills v1, v2, v3, etc.)
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      // Take control of all open tabs immediately
      await self.clients.claim();
      // Notify all clients that a new SW is active
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((c) => c.postMessage({ type: 'SW_ACTIVATED', version: APP_VERSION }));
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Don't intercept cross-origin requests (YouTube IFrame API, Google APIs, etc.)
  if (url.origin !== self.location.origin) return;

  // -------- Network-first for navigations (HTML pages) --------
  // Ensures users always get the latest HTML, never a stale cached shell.
  // The only exception is when we are completely offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(req);
          // Cache a fresh copy for offline use
          if (response && response.status === 200) {
            const clone = response.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, clone);
          }
          return response;
        } catch (err) {
          // Network failed — try cache, then fall back to root shell
          const cached = await caches.match(req);
          if (cached) return cached;
          const root = await caches.match('/');
          if (root) return root;
          throw err;
        }
      })()
    );
    return;
  }

  // -------- version.json: always network-first, never stale --------
  // This lets the app detect updates even if other assets are cached.
  if (url.pathname === '/version.json') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req).then((cached) => cached || new Response('{"version":"0"}', {
          headers: { 'Content-Type': 'application/json' }
        })))
    );
    return;
  }

  // -------- Stale-while-revalidate for other same-origin GETs --------
  // Static JS chunks are content-hashed by Next.js, so cached copies are safe.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
        // Rebuild the current cache
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(STATIC_ASSETS).catch(() => {});
        // Tell all open tabs that the cache was cleared
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((c) => c.postMessage({ type: 'CACHE_CLEARED' }));
      })()
    );
    return;
  }

  if (data.type === 'FORCE_UPDATE') {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
        await self.skipWaiting();
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((c) => c.postMessage({ type: 'FORCE_RELOAD' }));
      })()
    );
    return;
  }
});
