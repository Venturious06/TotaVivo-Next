// TotaVivo service worker — caches everything for offline use after first load.
const CACHE = 'totavivo-v8.3.0';
const ASSETS = [
  './',
  './life-companion.html',
  './TotaVivo%20V7.html',
  './assets/life-companion.css',
  './assets/life-companion.js',
  './assets/core/storage.js',
  './assets/core/state.js',
  './assets/modules/medications.js',
  './assets/modules/safety.js',
  './assets/modules/integrations.js',
  './assets/modules/accident-assistant.js',
  './manifest.json',
  './logo.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './favicon-32.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // Add what we can; ignore individual failures so install never fails wholesale
      Promise.all(ASSETS.map(a => c.add(a).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Pages (HTML) are network-first so updates appear immediately; other same-origin
// assets stay cache-first for offline speed.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      // Cache successful responses for next time
      if (resp && resp.status === 200) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return resp;
    }).catch(() => caches.match('./TotaVivo%20V7.html')))
  );
});
