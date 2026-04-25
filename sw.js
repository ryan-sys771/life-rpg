// Life RPG service worker
// Strategy:
//   - HTML/navigation requests: network-first (so app updates reach users immediately)
//   - All other GETs: cache-first (fast loads, works offline)
//   - Caches: own assets + Google Fonts + Leaflet CDN + OpenStreetMap tiles
const CACHE = 'life-rpg-v7';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  // New SW takes over immediately instead of waiting for tabs to close
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      // Wipe old caches
      caches.keys().then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )),
      // Take control of any existing clients without forcing a refresh
      self.clients.claim()
    ])
  );
});

function isHtml(req){
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/html')) return true;
  const url = new URL(req.url);
  if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) return true;
  return false;
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === location.origin;
  const cacheableExternal = url.hostname.endsWith('.googleapis.com')
    || url.hostname.endsWith('.gstatic.com')
    || url.hostname === 'unpkg.com'
    || url.hostname.endsWith('.tile.openstreetmap.org')
    || url.hostname.endsWith('.openstreetmap.org');
  const cacheable = sameOrigin || cacheableExternal;

  // Network-first for HTML so app updates reach users immediately
  if (sameOrigin && isHtml(e.request)){
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200){
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for everything else
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (cacheable && res && res.status === 200){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});

// Listen for "skipWaiting" message from the page if we want to push updates faster
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
