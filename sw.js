const CACHE = 'maryse-club-v52';
const STATIC = [
  '/',
  '/index.html',
  '/recette.html',
  '/creer.html',
  '/profil.html',
  '/courses.html',
  '/execution.html',
  '/importer.html',
  '/relecture.html',
  '/connexion.html',
  '/admin.html',
  '/admin-listes.html',
  '/admin-recettes.html',
  '/admin-membres.html',
  '/admin-photos.html',
  '/image-slot.js',
  '/manifest.json',
];

// db.js est volontairement exclu du précache — network-first systématique
// pour garantir que les nouvelles fonctions sont toujours disponibles.

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Les fonctions serverless ne passent jamais par le cache
  if (url.pathname.startsWith('/api/')) return;

  // Network-first : HTML + db.js (change souvent)
  const isNetworkFirst = url.pathname.endsWith('.html')
    || url.pathname === '/'
    || url.pathname === '/db.js';

  if (isNetworkFirst) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first pour les autres assets (images, fonts, etc.)
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200 && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
  }
});
