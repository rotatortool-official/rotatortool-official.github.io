/* ══════════════════════════════════════════════════════════════
   Rotator — Service Worker (minimal, enables PWA install prompt)
   ──────────────────────────────────────────────────────────────
   Chrome/Android requires a registered service worker before
   firing the beforeinstallprompt event. This SW caches the
   app shell for offline-capable, instant-load experience.
══════════════════════════════════════════════════════════════ */

var CACHE_NAME = 'rotator-v1';
var SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/js/ui.js',
  '/js/signals.js',
  '/js/data-loaders.js',
  '/js/ratio.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

/* Install — cache app shell */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

/* Activate — clean old caches */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

/* Fetch — network-first for API calls, cache-first for assets */
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  /* Always go to network for API calls and external resources */
  if (url.origin !== self.location.origin || e.request.method !== 'GET') {
    return;
  }

  e.respondWith(
    fetch(e.request).then(function(response) {
      /* Cache successful responses */
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
      }
      return response;
    }).catch(function() {
      /* Offline fallback — serve from cache */
      return caches.match(e.request);
    })
  );
});
